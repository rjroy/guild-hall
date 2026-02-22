/**
 * Commission session lifecycle management.
 *
 * Part 1 (validateTransition, transitionCommission): Status machine with the
 * full transition graph. See the graph below.
 *
 * Part 2 (createCommissionSession factory): Manages the full lifecycle of
 * commissions: creation, dispatch, worker process spawning, exit handling,
 * heartbeat monitoring, cancellation, and re-dispatch. Integrates with the
 * event bus for cross-system notifications.
 *
 * The full transition graph:
 *   pending -> dispatched, blocked, cancelled
 *   blocked -> pending, cancelled
 *   dispatched -> in_progress, failed
 *   in_progress -> completed, failed, cancelled
 *   completed, failed, cancelled -> (terminal, no outgoing edges)
 *
 * Note: blocked <-> pending transitions are defined for completeness but not
 * exercised until Phase 7 (dependency auto-transitions).
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { CommissionId, CommissionStatus } from "@/daemon/types";
import { asCommissionId } from "@/daemon/types";
import type { AppConfig, DiscoveredPackage, WorkerMetadata } from "@/lib/types";
import { getGuildHallHome } from "@/lib/paths";
import { getWorkerByName } from "@/lib/packages";
import { getSocketPath } from "@/daemon/lib/socket";
import type { EventBus } from "./event-bus";
import type { CommissionWorkerConfig } from "./commission-worker-config";
import {
  updateCommissionStatus,
  appendTimelineEntry,
  commissionArtifactPath,
  readCommissionStatus,
  updateCurrentProgress,
  updateResultSummary,
} from "./commission-artifact-helpers";

// -- Status machine constants --

const VALID_TRANSITIONS: Record<CommissionStatus, CommissionStatus[]> = {
  pending: ["dispatched", "blocked", "cancelled"],
  blocked: ["pending", "cancelled"],
  dispatched: ["in_progress", "failed"],
  in_progress: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

/**
 * Validates that a status transition is allowed by the state machine.
 * Throws an error with a descriptive message if the transition is invalid.
 */
export function validateTransition(
  from: CommissionStatus,
  to: CommissionStatus,
): void {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new Error(
      `Invalid commission transition: "${from}" -> "${to}". ` +
        `Valid transitions from "${from}": ${allowed.length > 0 ? allowed.join(", ") : "(none, terminal state)"}`,
    );
  }
}

/**
 * Executes a commission status transition: validates the transition, updates
 * the artifact's status field, and appends a timeline entry with the reason.
 */
export async function transitionCommission(
  projectPath: string,
  commissionId: CommissionId,
  from: CommissionStatus,
  to: CommissionStatus,
  reason: string,
): Promise<void> {
  validateTransition(from, to);
  await updateCommissionStatus(projectPath, commissionId, to);
  await appendTimelineEntry(projectPath, commissionId, `status_${to}`, reason, {
    from,
    to,
  });
}

// -- Session management types --

/** Heartbeat monitoring constants */
const HEARTBEAT_INTERVAL_MS = 30_000;
const STALENESS_THRESHOLD_MS = 180_000;
/** Grace period before SIGKILL on cancellation */
const CANCEL_GRACE_MS = 30_000;

export interface SpawnedCommission {
  pid: number;
  exitPromise: Promise<{ exitCode: number; signal?: string }>;
  kill(signal?: string): void;
}

export interface CommissionSessionDeps {
  packages: DiscoveredPackage[];
  config: AppConfig;
  guildHallHome?: string;
  eventBus: EventBus;
  packagesDir: string;
  spawnFn?: (configPath: string) => SpawnedCommission;
}

type ActiveCommission = {
  commissionId: CommissionId;
  projectName: string;
  workerName: string;
  pid: number;
  startTime: Date;
  lastHeartbeat: Date;
  status: CommissionStatus;
  resultSubmitted: boolean;
  resultSummary?: string;
  resultArtifacts?: string[];
  tempDir: string;
  configPath: string;
  graceTimerId?: ReturnType<typeof setTimeout>;
};

export interface CommissionSessionForRoutes {
  createCommission(
    projectName: string,
    title: string,
    workerName: string,
    prompt: string,
    dependencies?: string[],
    resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number },
  ): Promise<{ commissionId: string }>;
  updateCommission(
    commissionId: CommissionId,
    updates: {
      prompt?: string;
      dependencies?: string[];
      resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number };
    },
  ): Promise<void>;
  dispatchCommission(
    commissionId: CommissionId,
  ): Promise<{ status: "accepted" }>;
  cancelCommission(commissionId: CommissionId): Promise<void>;
  redispatchCommission(
    commissionId: CommissionId,
  ): Promise<{ status: "accepted" }>;
  reportProgress(commissionId: CommissionId, summary: string): void;
  reportResult(
    commissionId: CommissionId,
    summary: string,
    artifacts?: string[],
  ): void;
  reportQuestion(commissionId: CommissionId, question: string): void;
  addUserNote(commissionId: CommissionId, content: string): Promise<void>;
  getActiveCommissions(): number;
  shutdown(): void;
}

// -- Default spawn function --

function defaultSpawnFn(configPath: string): SpawnedCommission {
  const workerScript = path.join(import.meta.dir, "..", "commission-worker.ts");
  const proc = Bun.spawn(["bun", "run", workerScript, "--config", configPath], {
    stdout: "pipe",
    stderr: "pipe",
  });

  // Read stdout/stderr in the background so we can log on exit.
  const stderrReader = new Response(proc.stderr).text().catch(() => "");
  const stdoutReader = new Response(proc.stdout).text().catch(() => "");

  return {
    pid: proc.pid,
    exitPromise: proc.exited.then(async (exitCode) => {
      const [stderr, stdout] = await Promise.all([stderrReader, stdoutReader]);
      const code = exitCode ?? 1;
      if (stderr.trim()) {
        console.error(`[commission-worker] pid=${proc.pid} exit=${code} stderr:\n${stderr.trim()}`);
      }
      if (stdout.trim()) {
        console.log(`[commission-worker] pid=${proc.pid} exit=${code} stdout:\n${stdout.trim()}`);
      }
      if (!stderr.trim() && !stdout.trim()) {
        console.log(`[commission-worker] pid=${proc.pid} exit=${code} (no output)`);
      }
      return { exitCode: code };
    }),
    kill: (signal) => proc.kill(signal === "SIGKILL" ? 9 : 15),
  };
}

// -- Factory --

export function createCommissionSession(
  deps: CommissionSessionDeps,
): CommissionSessionForRoutes {
  const activeCommissions = new Map<string, ActiveCommission>();
  const ghHome = deps.guildHallHome ?? getGuildHallHome();
  const spawnFn = deps.spawnFn ?? defaultSpawnFn;

  // Store active kill timers so they can be cleared on shutdown
  const killTimers = new Set<ReturnType<typeof setTimeout>>();

  // -- Heartbeat monitoring --
  const heartbeatInterval = setInterval(() => {
    void checkHeartbeats();
  }, HEARTBEAT_INTERVAL_MS);

  async function checkHeartbeats(): Promise<void> {
    const now = Date.now();
    for (const [id, commission] of activeCommissions) {
      if (
        commission.status !== "in_progress" &&
        commission.status !== "dispatched"
      ) {
        continue;
      }
      const elapsed = now - commission.lastHeartbeat.getTime();
      if (elapsed <= STALENESS_THRESHOLD_MS) continue;

      // Check if process is still alive
      let alive = false;
      try {
        process.kill(commission.pid, 0);
        alive = true;
      } catch {
        alive = false;
      }

      const reason = alive
        ? "Worker process unresponsive (heartbeat stale)"
        : "Worker process lost (no longer running)";

      await handleFailure(id, commission, reason);
    }
  }

  // -- Helpers --

  function findProject(projectName: string) {
    return deps.config.projects.find((p) => p.name === projectName);
  }

  function formatCommissionId(workerName: string, now: Date): CommissionId {
    const pad = (n: number, len = 2) => String(n).padStart(len, "0");
    const ts = [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate()),
      "-",
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds()),
    ].join("");
    return asCommissionId(`commission-${workerName}-${ts}`);
  }

  function commissionStatePath(commissionId: CommissionId): string {
    return path.join(ghHome, "state", "commissions", `${commissionId}.json`);
  }

  async function writeStateFile(
    commissionId: CommissionId,
    data: Record<string, unknown>,
  ): Promise<void> {
    const filePath = commissionStatePath(commissionId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  /**
   * Finds the project path for a commission by searching all registered
   * projects for the artifact file.
   */
  async function findProjectPathForCommission(
    commissionId: CommissionId,
  ): Promise<{ projectPath: string; projectName: string } | null> {
    for (const project of deps.config.projects) {
      const artifactPath = commissionArtifactPath(project.path, commissionId);
      try {
        await fs.access(artifactPath);
        return { projectPath: project.path, projectName: project.name };
      } catch {
        continue;
      }
    }
    return null;
  }

  /**
   * Handles a commission failure (crash, heartbeat timeout, etc.).
   * Transitions to failed, emits event, and cleans up.
   */
  async function handleFailure(
    id: string,
    commission: ActiveCommission,
    reason: string,
  ): Promise<void> {
    const project = findProject(commission.projectName);
    if (!project) {
      console.error(
        `[commission-session] Cannot find project "${commission.projectName}" for commission "${id}". Artifact status will not be updated.`,
      );
    }

    if (project) {
      try {
        await transitionCommission(
          project.path,
          commission.commissionId,
          commission.status,
          "failed",
          reason,
        );
      } catch (err: unknown) {
        console.error(
          `[commission-session] Failed to transition ${id} to failed:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    deps.eventBus.emit({
      type: "commission_status",
      commissionId: id,
      status: "failed",
      reason,
    });

    commission.status = "failed";

    // Clean up temp directory
    fs.rm(commission.tempDir, { recursive: true, force: true }).catch(
      (err: unknown) => {
        console.warn(
          `[commission-session] Failed to clean up temp directory ${commission.tempDir}:`,
          err instanceof Error ? err.message : String(err),
        );
      },
    );

    activeCommissions.delete(id);

    // Update state file
    writeStateFile(commission.commissionId, {
      commissionId: id,
      projectName: commission.projectName,
      workerName: commission.workerName,
      status: "failed",
      reason,
    }).catch((err: unknown) => {
      console.error(
        `[commission-session] Failed to write state file for ${commission.commissionId}:`,
        err instanceof Error ? err.message : String(err),
      );
    });
  }

  // -- Public API --

  async function createCommission(
    projectName: string,
    title: string,
    workerName: string,
    prompt: string,
    dependencies: string[] = [],
    resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number },
  ): Promise<{ commissionId: string }> {
    // 1. Find the project
    const project = findProject(projectName);
    if (!project) {
      throw new Error(`Project "${projectName}" not found`);
    }

    // 2. Validate worker exists
    const workerPkg = getWorkerByName(deps.packages, workerName);
    if (!workerPkg) {
      throw new Error(
        `Worker "${workerName}" not found in discovered packages`,
      );
    }
    const workerMeta = workerPkg.metadata as WorkerMetadata;

    // 3. Generate commission ID
    const commissionId = formatCommissionId(
      workerMeta.identity.name,
      new Date(),
    );

    // 4. Ensure commissions directory exists
    const commissionsDir = path.join(project.path, ".lore", "commissions");
    await fs.mkdir(commissionsDir, { recursive: true });

    // 5. Write the commission artifact
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const isoStr = now.toISOString();

    const escapedTitle = title.replace(/"/g, '\\"');
    const escapedPrompt = prompt.replace(/"/g, '\\"');
    const escapedDisplayTitle = workerMeta.identity.displayTitle.replace(
      /"/g,
      '\\"',
    );

    // Format dependencies as YAML array
    const depsYaml =
      dependencies.length > 0
        ? "\n" + dependencies.map((d) => `  - ${d}`).join("\n")
        : " []";

    // Format resource overrides
    const maxTurnsLine =
      resourceOverrides?.maxTurns !== undefined
        ? `  maxTurns: ${resourceOverrides.maxTurns}`
        : "  maxTurns: 150";
    const maxBudgetLine =
      resourceOverrides?.maxBudgetUsd !== undefined
        ? `  maxBudgetUsd: ${resourceOverrides.maxBudgetUsd}`
        : "  maxBudgetUsd: 1.00";

    const content = `---
title: "Commission: ${escapedTitle}"
date: ${dateStr}
status: pending
tags: [commission]
worker: ${workerMeta.identity.name}
workerDisplayTitle: "${escapedDisplayTitle}"
prompt: "${escapedPrompt}"
dependencies:${depsYaml}
linked_artifacts: []
resource_overrides:
${maxTurnsLine}
${maxBudgetLine}
activity_timeline:
  - timestamp: ${isoStr}
    event: created
    reason: "Commission created"
current_progress: ""
result_summary: ""
projectName: ${projectName}
---
`;

    const artifactPath = commissionArtifactPath(project.path, commissionId);
    await fs.writeFile(artifactPath, content, "utf-8");

    console.log(
      `[commission] created "${commissionId}" for project "${projectName}" (worker: ${workerName})`,
    );

    return { commissionId: commissionId as string };
  }

  async function updateCommissionFn(
    commissionId: CommissionId,
    updates: {
      prompt?: string;
      dependencies?: string[];
      resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number };
    },
  ): Promise<void> {
    // Find the project containing this commission
    const found = await findProjectPathForCommission(commissionId);
    if (!found) {
      throw new Error(
        `Commission "${commissionId}" not found in any project`,
      );
    }

    // Verify status is pending
    const status = await readCommissionStatus(found.projectPath, commissionId);
    if (status === null) {
      throw new Error(
        `Cannot read status from commission "${commissionId}" artifact. The file may be corrupted.`,
      );
    }
    if (status !== "pending") {
      throw new Error(
        `Cannot update commission "${commissionId}": status is "${status}", must be "pending"`,
      );
    }

    const artifactPath = commissionArtifactPath(
      found.projectPath,
      commissionId,
    );
    let raw = await fs.readFile(artifactPath, "utf-8");

    if (updates.prompt !== undefined) {
      const escaped = updates.prompt.replace(/"/g, '\\"');
      raw = raw.replace(/^prompt: ".*"$/m, `prompt: "${escaped}"`);
    }

    if (updates.dependencies !== undefined) {
      const depsYaml =
        updates.dependencies.length > 0
          ? "\n" + updates.dependencies.map((d) => `  - ${d}`).join("\n")
          : " []";
      // Replace the dependencies section. Handle both empty array and list forms.
      if (/^dependencies: \[\]$/m.test(raw)) {
        raw = raw.replace(/^dependencies: \[\]$/m, `dependencies:${depsYaml}`);
      } else {
        // Replace the dependencies: line and all following "  - " lines
        raw = raw.replace(
          /^dependencies:\n(?:  - .+\n)*/m,
          `dependencies:${depsYaml}\n`,
        );
      }
    }

    if (updates.resourceOverrides !== undefined) {
      if (updates.resourceOverrides.maxTurns !== undefined) {
        raw = raw.replace(
          /^  maxTurns: .+$/m,
          `  maxTurns: ${updates.resourceOverrides.maxTurns}`,
        );
      }
      if (updates.resourceOverrides.maxBudgetUsd !== undefined) {
        raw = raw.replace(
          /^  maxBudgetUsd: .+$/m,
          `  maxBudgetUsd: ${updates.resourceOverrides.maxBudgetUsd}`,
        );
      }
    }

    await fs.writeFile(artifactPath, raw, "utf-8");
  }

  async function dispatchCommission(
    commissionId: CommissionId,
  ): Promise<{ status: "accepted" }> {
    // 1. Find the project
    const found = await findProjectPathForCommission(commissionId);
    if (!found) {
      throw new Error(
        `Commission "${commissionId}" not found in any project`,
      );
    }

    // 2. Verify status is pending
    const currentStatus = await readCommissionStatus(
      found.projectPath,
      commissionId,
    );
    if (currentStatus === null) {
      throw new Error(
        `Cannot read status from commission "${commissionId}" artifact. The file may be corrupted.`,
      );
    }
    if (currentStatus !== "pending") {
      throw new Error(
        `Cannot dispatch commission "${commissionId}": status is "${currentStatus}", must be "pending"`,
      );
    }

    // 3. Transition to dispatched
    await transitionCommission(
      found.projectPath,
      commissionId,
      "pending",
      "dispatched",
      "Commission dispatched to worker",
    );

    // 4. Create temp directory
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "gh-commission-"),
    );

    // 5. Read the artifact to get prompt, worker, dependencies, resource overrides
    const artifactPath = commissionArtifactPath(
      found.projectPath,
      commissionId,
    );
    const raw = await fs.readFile(artifactPath, "utf-8");

    const promptMatch = raw.match(/^prompt: "(.+)"$/m);
    const prompt = promptMatch ? promptMatch[1].replace(/\\"/g, '"') : "";

    const workerMatch = raw.match(/^worker: (.+)$/m);
    const workerName = workerMatch ? workerMatch[1].trim() : "";

    // Parse dependencies
    const depsMatch = raw.match(/^dependencies: \[\]$/m);
    let commissionDeps: string[] = [];
    if (!depsMatch) {
      const depsBlockMatch = raw.match(
        /^dependencies:\n((?:  - .+\n)*)/m,
      );
      if (depsBlockMatch) {
        commissionDeps = depsBlockMatch[1]
          .split("\n")
          .filter((line) => line.startsWith("  - "))
          .map((line) => line.replace(/^  - /, "").trim());
      }
    }

    // Parse resource overrides
    const maxTurnsMatch = raw.match(/^  maxTurns: (.+)$/m);
    const maxBudgetMatch = raw.match(/^  maxBudgetUsd: (.+)$/m);
    const resourceOverrides: { maxTurns?: number; maxBudgetUsd?: number } = {};
    if (maxTurnsMatch) {
      resourceOverrides.maxTurns = Number(maxTurnsMatch[1]);
    }
    if (maxBudgetMatch) {
      resourceOverrides.maxBudgetUsd = Number(maxBudgetMatch[1]);
    }

    // Find the worker package to get the package name
    const workerPkg = deps.packages.find((p) => {
      if (!("identity" in p.metadata)) return false;
      return p.metadata.identity.name === workerName;
    });
    const workerPackageName = workerPkg?.name ?? workerName;

    // 6. Write worker config JSON
    const socketPath = getSocketPath(ghHome);
    const workerConfig: CommissionWorkerConfig = {
      commissionId: commissionId as string,
      projectName: found.projectName,
      projectPath: found.projectPath,
      workerPackageName,
      prompt,
      dependencies: commissionDeps,
      workingDirectory: tempDir,
      daemonSocketPath: socketPath,
      packagesDir: deps.packagesDir,
      guildHallHome: ghHome,
      resourceOverrides:
        Object.keys(resourceOverrides).length > 0
          ? resourceOverrides
          : undefined,
    };

    const configPath = path.join(tempDir, "commission-config.json");
    await fs.writeFile(
      configPath,
      JSON.stringify(workerConfig, null, 2),
      "utf-8",
    );

    // 7. Write machine-local state file
    await writeStateFile(commissionId, {
      commissionId: commissionId as string,
      projectName: found.projectName,
      workerName,
      status: "dispatched",
      tempDir,
      configPath,
    });

    // 8. Spawn the worker process
    console.log(
      `[commission] dispatching "${commissionId}" -> worker="${workerName}", config="${configPath}"`,
    );
    const spawned = spawnFn(configPath);

    // 9. Record in active Map
    const now = new Date();
    const active: ActiveCommission = {
      commissionId,
      projectName: found.projectName,
      workerName,
      pid: spawned.pid,
      startTime: now,
      lastHeartbeat: now,
      status: "dispatched",
      resultSubmitted: false,
      tempDir,
      configPath,
    };

    activeCommissions.set(commissionId as string, active);

    console.log(
      `[commission] spawned "${commissionId}" pid=${spawned.pid}`,
    );

    // 10. Update PID in state file
    await writeStateFile(commissionId, {
      commissionId: commissionId as string,
      projectName: found.projectName,
      workerName,
      pid: spawned.pid,
      status: "dispatched",
      tempDir,
      configPath,
    });

    // 11. Transition to in_progress
    await transitionCommission(
      found.projectPath,
      commissionId,
      "dispatched",
      "in_progress",
      "Worker process started",
    );
    active.status = "in_progress";

    // 12. Emit event
    deps.eventBus.emit({
      type: "commission_status",
      commissionId: commissionId as string,
      status: "in_progress",
      reason: "Worker process started",
    });

    // 13. Attach exit handler
    void spawned.exitPromise.then(async (result) => {
      await handleExit(commissionId, result.exitCode);
    }).catch(async (err: unknown) => {
      const reason = err instanceof Error ? err.message : String(err);
      const commission = activeCommissions.get(commissionId as string);
      if (commission) {
        await handleFailure(commissionId as string, commission, `Exit promise rejected: ${reason}`);
      }
    });

    return { status: "accepted" };
  }

  async function handleExit(commissionId: CommissionId, exitCode: number): Promise<void> {
    const commission = activeCommissions.get(commissionId as string);
    if (!commission) {
      console.warn(
        `[commission-session] handleExit called for unknown commission "${commissionId}" (exit code: ${exitCode}). May indicate race with cancellation.`,
      );
      return;
    }

    // Clear any pending grace timer for this commission
    if (commission.graceTimerId) {
      clearTimeout(commission.graceTimerId);
      killTimers.delete(commission.graceTimerId);
      commission.graceTimerId = undefined;
    }

    // If already in a terminal state (e.g., cancelled), skip
    if (
      commission.status === "completed" ||
      commission.status === "failed" ||
      commission.status === "cancelled"
    ) {
      activeCommissions.delete(commissionId as string);
      return;
    }

    const project = findProject(commission.projectName);
    if (!project) {
      console.error(
        `[commission-session] Cannot find project "${commission.projectName}" for commission "${commissionId}". Artifact status will not be updated.`,
      );
    }

    // Determine final status and reason from the exit code / result matrix.
    // Result submitted -> completed (even if process crashed).
    // No result -> failed (even if process exited cleanly).
    let finalStatus: CommissionStatus;
    let reason: string;

    if (commission.resultSubmitted) {
      finalStatus = "completed";
      if (exitCode === 0) {
        console.log(`[commission] "${commissionId}" completed (clean exit, result submitted)`);
        reason = "Worker completed successfully";
      } else {
        console.warn(`[commission] "${commissionId}" completed with anomaly (exit code ${exitCode}, but result was submitted)`);
        reason = `Worker crashed (exit code ${exitCode}) but result was submitted`;
      }
    } else {
      finalStatus = "failed";
      if (exitCode === 0) {
        console.log(`[commission] "${commissionId}" failed (clean exit, no result submitted)`);
        reason = "Worker completed without submitting result";
      } else {
        console.error(`[commission] "${commissionId}" failed (exit code ${exitCode}, no result submitted)`);
        reason = `Worker crashed with exit code ${exitCode}`;
      }
    }

    commission.status = finalStatus;

    if (project) {
      try {
        await transitionCommission(
          project.path,
          commissionId,
          "in_progress",
          finalStatus,
          reason,
        );
      } catch (err: unknown) {
        console.error(
          `[commission-session] Failed to transition ${commissionId} to ${finalStatus}:`,
          err instanceof Error ? err.message : String(err),
        );
      }

      if (finalStatus === "completed" && commission.resultSummary) {
        try {
          await updateResultSummary(
            project.path,
            commissionId,
            commission.resultSummary,
            commission.resultArtifacts,
          );
        } catch (err: unknown) {
          console.error(
            `[commission-session] Failed to update result summary:`,
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    }

    deps.eventBus.emit({
      type: "commission_status",
      commissionId: commissionId as string,
      status: finalStatus,
      reason,
    });

    // Clean up temp directory
    fs.rm(commission.tempDir, { recursive: true, force: true }).catch(
      (err: unknown) => {
        console.warn(
          `[commission-session] Failed to clean up temp directory ${commission.tempDir}:`,
          err instanceof Error ? err.message : String(err),
        );
      },
    );

    // Remove from active Map
    activeCommissions.delete(commissionId as string);

    // Update state file with final status
    writeStateFile(commissionId, {
      commissionId: commissionId as string,
      projectName: commission.projectName,
      workerName: commission.workerName,
      status: commission.status,
      exitCode,
      resultSubmitted: commission.resultSubmitted,
    }).catch((err: unknown) => {
      console.error(
        `[commission-session] Failed to write state file for ${commissionId}:`,
        err instanceof Error ? err.message : String(err),
      );
    });
  }

  async function cancelCommission(
    commissionId: CommissionId,
  ): Promise<void> {
    const commission = activeCommissions.get(commissionId as string);
    if (!commission) {
      throw new Error(
        `Commission "${commissionId}" not found in active commissions`,
      );
    }

    console.log(`[commission] cancelling "${commissionId}" pid=${commission.pid} (SIGTERM, ${CANCEL_GRACE_MS / 1000}s grace)`);

    // Send SIGTERM
    try {
      process.kill(commission.pid, 15);
    } catch {
      // Process may already be dead, that's fine
    }

    // Start grace timer for SIGKILL
    const graceTimer = setTimeout(() => {
      try {
        process.kill(commission.pid, 9);
      } catch {
        // Process already dead
      }
      killTimers.delete(graceTimer);
      commission.graceTimerId = undefined;
    }, CANCEL_GRACE_MS);
    killTimers.add(graceTimer);
    commission.graceTimerId = graceTimer;

    // Transition to cancelled
    const project = findProject(commission.projectName);
    if (project) {
      await transitionCommission(
        project.path,
        commissionId,
        commission.status,
        "cancelled",
        "Commission cancelled by user",
      );
    }

    commission.status = "cancelled";

    deps.eventBus.emit({
      type: "commission_status",
      commissionId: commissionId as string,
      status: "cancelled",
      reason: "Commission cancelled by user",
    });

    // Clean up temp directory
    await fs.rm(commission.tempDir, { recursive: true, force: true }).catch(
      (err: unknown) => {
        console.warn(
          `[commission-session] Failed to clean up temp directory ${commission.tempDir}:`,
          err instanceof Error ? err.message : String(err),
        );
      },
    );

    // Remove from active Map
    activeCommissions.delete(commissionId as string);

    // Update state file
    await writeStateFile(commissionId, {
      commissionId: commissionId as string,
      projectName: commission.projectName,
      workerName: commission.workerName,
      status: "cancelled",
    }).catch((err: unknown) => {
      console.error(
        `[commission-session] Failed to write state file for ${commissionId}:`,
        err instanceof Error ? err.message : String(err),
      );
    });
  }

  async function redispatchCommission(
    commissionId: CommissionId,
  ): Promise<{ status: "accepted" }> {
    // 1. Find the project
    const found = await findProjectPathForCommission(commissionId);
    if (!found) {
      throw new Error(
        `Commission "${commissionId}" not found in any project`,
      );
    }

    // 2. Verify status is failed or cancelled
    const currentStatus = await readCommissionStatus(
      found.projectPath,
      commissionId,
    );
    if (currentStatus === null) {
      throw new Error(
        `Cannot read status from commission "${commissionId}" artifact. The file may be corrupted.`,
      );
    }
    if (currentStatus !== "failed" && currentStatus !== "cancelled") {
      throw new Error(
        `Cannot redispatch commission "${commissionId}": status is "${currentStatus}", must be "failed" or "cancelled"`,
      );
    }

    console.log(`[commission] redispatching "${commissionId}" (was ${currentStatus})`);

    // 3. Transition back to pending
    // The state machine allows failed -> (nothing) and cancelled -> (nothing)
    // as terminal states. For redispatch, we do a direct status update
    // bypassing the normal transition graph since this is a reset operation.
    await updateCommissionStatus(found.projectPath, commissionId, "pending");
    await appendTimelineEntry(
      found.projectPath,
      commissionId,
      "status_pending",
      "Commission reset for redispatch",
      { from: currentStatus, to: "pending" },
    );

    // 4. Dispatch
    return dispatchCommission(commissionId);
  }

  function reportProgress(
    commissionId: CommissionId,
    summary: string,
  ): void {
    const commission = activeCommissions.get(commissionId as string);
    if (!commission) {
      console.warn(
        `[commission-session] reportProgress called for unknown commission "${commissionId}". Summary: ${summary}`,
      );
      return;
    }

    commission.lastHeartbeat = new Date();
    console.log(`[commission] "${commissionId}" progress: ${summary.slice(0, 120)}`);

    // Update progress in artifact (fire-and-forget)
    const project = findProject(commission.projectName);
    if (project) {
      updateCurrentProgress(project.path, commissionId, summary).catch(
        (err: unknown) => {
          console.error(
            `[commission-session] Failed to update progress:`,
            err instanceof Error ? err.message : String(err),
          );
        },
      );
    }

    deps.eventBus.emit({
      type: "commission_progress",
      commissionId: commissionId as string,
      summary,
    });
  }

  function reportResult(
    commissionId: CommissionId,
    summary: string,
    artifacts?: string[],
  ): void {
    const commission = activeCommissions.get(commissionId as string);
    if (!commission) {
      console.error(
        `[commission-session] reportResult called for unknown commission "${commissionId}". Result lost: ${summary}`,
      );
      return;
    }

    commission.resultSubmitted = true;
    commission.resultSummary = summary;
    commission.resultArtifacts = artifacts;
    commission.lastHeartbeat = new Date();
    console.log(
      `[commission] "${commissionId}" result submitted: ${summary.slice(0, 120)}${artifacts?.length ? ` (${artifacts.length} artifacts)` : ""}`,
    );

    deps.eventBus.emit({
      type: "commission_result",
      commissionId: commissionId as string,
      summary,
      artifacts,
    });
  }

  function reportQuestion(
    commissionId: CommissionId,
    question: string,
  ): void {
    const commission = activeCommissions.get(commissionId as string);
    if (!commission) {
      console.warn(
        `[commission-session] reportQuestion called for unknown commission "${commissionId}". Question: ${question}`,
      );
      return;
    }

    commission.lastHeartbeat = new Date();
    console.log(`[commission] "${commissionId}" question: ${question.slice(0, 120)}`);

    deps.eventBus.emit({
      type: "commission_question",
      commissionId: commissionId as string,
      question,
    });
  }

  async function addUserNote(
    commissionId: CommissionId,
    content: string,
  ): Promise<void> {
    const found = await findProjectPathForCommission(commissionId);
    if (!found) {
      throw new Error(
        `Commission "${commissionId}" not found in any project`,
      );
    }

    await appendTimelineEntry(
      found.projectPath,
      commissionId,
      "user_note",
      content,
    );
  }

  function getActiveCommissions(): number {
    return activeCommissions.size;
  }

  function shutdown(): void {
    clearInterval(heartbeatInterval);
    for (const timer of killTimers) {
      clearTimeout(timer);
    }
    killTimers.clear();
  }

  return {
    createCommission,
    updateCommission: updateCommissionFn,
    dispatchCommission,
    cancelCommission,
    redispatchCommission,
    reportProgress,
    reportResult,
    reportQuestion,
    addUserNote,
    getActiveCommissions,
    shutdown,
  };
}
