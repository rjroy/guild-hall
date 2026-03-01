/**
 * Commission session lifecycle management.
 *
 * createCommissionSession factory: Manages the full lifecycle of
 * commissions: creation, dispatch, in-process SDK session management,
 * completion/error handling, cancellation, and re-dispatch. Integrates with
 * the event bus for cross-system notifications.
 *
 * Stateless helpers extracted to sibling modules:
 * - commission-state-machine.ts: status transitions and validation
 * - commission-sdk-logging.ts: SDK message formatting
 * - commission-context-builders.ts: activation context and query options
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import matter from "gray-matter";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { CommissionId, CommissionStatus } from "@/daemon/types";
import { asCommissionId } from "@/daemon/types";
import type {
  ActivationContext,
  ActivationResult,
  AppConfig,
  DiscoveredPackage,
  WorkerMetadata,
} from "@/lib/types";
import { isNodeError } from "@/lib/types";
import {
  getGuildHallHome,
  integrationWorktreePath,
  activityWorktreeRoot,
  commissionWorktreePath,
  commissionBranchName,
} from "@/lib/paths";
import { getWorkerByName } from "@/lib/packages";
import { createGitOps, CLAUDE_BRANCH, resolveSquashMerge, type GitOps } from "@/daemon/lib/git";
import { errorMessage, sanitizeForGitRef, formatTimestamp, escapeYamlValue } from "@/daemon/lib/toolbox-utils";
import { withProjectLock } from "@/daemon/lib/project-lock";
import type { EventBus } from "./event-bus";
import {
  updateCommissionStatus,
  appendTimelineEntry,
  commissionArtifactPath,
  readCommissionStatus,
  readCommissionDependencies,
  updateResultSummary,
} from "./commission-artifact-helpers";
import { resolveToolSet } from "./toolbox-resolver";
import { loadMemories } from "./memory-injector";
import { triggerCompaction } from "./memory-compaction";
import {
  MANAGER_PACKAGE_NAME,
  activateWorker as activateWorkerShared,
} from "./manager-worker";
import { buildManagerContext } from "./manager-context";
import { logSdkMessage } from "./commission-sdk-logging";
import {
  buildCommissionActivationContext,
  buildCommissionQueryOptions,
} from "./commission-context-builders";
import {
  isTerminalStatus,
  transitionCommission,
} from "./commission-state-machine";
export { validateTransition, transitionCommission } from "./commission-state-machine";

// -- Capacity limit defaults --

const DEFAULT_COMMISSION_CAP = 3;
const DEFAULT_MAX_CONCURRENT = 10;

// -- Session management types --

export interface CommissionSessionDeps {
  packages: DiscoveredPackage[];
  config: AppConfig;
  guildHallHome?: string;
  eventBus: EventBus;
  packagesDir: string;
  gitOps?: GitOps;
  /**
   * DI seam for file existence checks. Tests pass a mock to control which
   * paths appear to exist. Defaults to fs.access (synchronous-style check
   * wrapped in a try/catch).
   */
  fileExists?: (filePath: string) => Promise<boolean>;
  /**
   * Optional callback invoked when a squash-merge fails due to non-.lore/
   * conflicts. Creates a Guild Master meeting request to surface the conflict
   * to the user. If absent, conflict handling still transitions the commission
   * to "failed" but does not escalate to the Guild Master.
   */
  createMeetingRequestFn?: (params: {
    projectName: string;
    workerName: string;
    reason: string;
  }) => Promise<void>;
  /**
   * DI seam for the SDK query function. Tests pass a mock async generator;
   * production lazily imports the SDK and calls query(). Used by
   * runCommissionSession() for in-process SDK sessions.
   */
  queryFn?: (params: {
    prompt: string;
    options: Record<string, unknown>;
  }) => AsyncGenerator<SDKMessage>;
  /**
   * DI seam for worker activation. Tests provide a mock that returns a
   * canned ActivationResult without touching the filesystem.
   * If omitted, built-in workers use activateManager() and regular workers
   * use dynamic import of the worker's index.ts.
   */
  activateFn?: (
    workerPkg: DiscoveredPackage,
    context: ActivationContext,
  ) => Promise<ActivationResult>;
  /**
   * Commission session reference. Required for the manager worker's toolbox,
   * which needs to create and dispatch commissions. Passed as a late-bound
   * reference since the commission session creates this interface.
   */
  commissionSessionRef?: { current: CommissionSessionForRoutes | null };
  /**
   * DI seam for tool resolution. Tests provide a mock that returns controlled
   * tools. Production uses the real resolveToolSet from toolbox-resolver.ts.
   */
  resolveToolSetFn?: typeof resolveToolSet;
}

type ActiveCommission = {
  commissionId: CommissionId;
  projectName: string;
  workerName: string;
  startTime: Date;
  lastActivity: Date;
  status: CommissionStatus;
  resultSubmitted: boolean;
  resultSummary?: string;
  resultArtifacts?: string[];
  worktreeDir: string;
  branchName: string;
  abortController: AbortController;
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
  ): Promise<{ status: "accepted" | "queued" }>;
  cancelCommission(commissionId: CommissionId, reason?: string): Promise<void>;
  redispatchCommission(
    commissionId: CommissionId,
  ): Promise<{ status: "accepted" | "queued" }>;
  addUserNote(commissionId: CommissionId, content: string): Promise<void>;
  checkDependencyTransitions(projectName: string): Promise<void>;
  recoverCommissions(): Promise<number>;
  getActiveCommissions(): number;
  shutdown(): void;
}

// -- Factory --

export function createCommissionSession(
  deps: CommissionSessionDeps,
): CommissionSessionForRoutes {
  const activeCommissions = new Map<string, ActiveCommission>();
  const ghHome = deps.guildHallHome ?? getGuildHallHome();
  const git = deps.gitOps ?? createGitOps();
  const fileExists = deps.fileExists ?? (async (filePath: string): Promise<boolean> => {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  });

  // -- Capacity limits --

  /**
   * Serialization lock for auto-dispatch. When two commissions complete
   * simultaneously, both call tryAutoDispatch. Without serialization,
   * both could scan the same pending commission and attempt to dispatch
   * it. The promise chain ensures only one auto-dispatch runs at a time.
   */
  let autoDispatchChain: Promise<void> = Promise.resolve();

  function getGlobalLimit(): number {
    return deps.config.maxConcurrentCommissions ?? DEFAULT_MAX_CONCURRENT;
  }

  function getProjectLimit(projectName: string): number {
    const project = findProject(projectName);
    return project?.commissionCap ?? DEFAULT_COMMISSION_CAP;
  }

  function countActiveForProject(projectName: string): number {
    let count = 0;
    for (const commission of activeCommissions.values()) {
      if (commission.projectName === projectName) count++;
    }
    return count;
  }

  function isAtCapacity(projectName: string): { atLimit: boolean; reason: string } {
    const globalCount = activeCommissions.size;
    const globalLimit = getGlobalLimit();
    if (globalCount >= globalLimit) {
      return {
        atLimit: true,
        reason: `Global concurrent limit reached (${globalCount}/${globalLimit})`,
      };
    }

    const projectCount = countActiveForProject(projectName);
    const projectLimit = getProjectLimit(projectName);
    if (projectCount >= projectLimit) {
      return {
        atLimit: true,
        reason: `Project "${projectName}" concurrent limit reached (${projectCount}/${projectLimit})`,
      };
    }

    return { atLimit: false, reason: "" };
  }

  /**
   * Scans pending commissions across all projects and returns them sorted
   * by creation date (oldest first). The "queue" is not a data structure;
   * it's readdir + sort by creation date, as specified in process-architecture.md.
   */
  async function scanPendingCommissions(): Promise<
    Array<{ commissionId: CommissionId; projectName: string; createdAt: string }>
  > {
    const pending: Array<{
      commissionId: CommissionId;
      projectName: string;
      createdAt: string;
    }> = [];

    for (const project of deps.config.projects) {
      const iPath = integrationWorktreePath(ghHome, project.name);
      const commissionsDir = path.join(iPath, ".lore", "commissions");

      let entries: string[];
      try {
        entries = await fs.readdir(commissionsDir);
      } catch {
        continue;
      }

      for (const filename of entries) {
        if (!filename.endsWith(".md")) continue;
        const cId = asCommissionId(filename.replace(/\.md$/, ""));

        // Skip commissions that are already active (dispatched/in_progress)
        if (activeCommissions.has(cId as string)) continue;

        try {
          // Single read: extract status and creation timestamp from the same file content.
          const artifactPath = commissionArtifactPath(iPath, cId);
          const raw = await fs.readFile(artifactPath, "utf-8");
          const statusMatch = raw.match(/^status: (\S+)$/m);
          if (!statusMatch || statusMatch[1] !== "pending") continue;

          // Extract creation timestamp from the artifact for FIFO ordering.
          // The first timeline entry is the "created" event with a timestamp.
          const { data } = matter(raw);
          const firstEntry = (data.activity_timeline as Array<{ timestamp: unknown }> | undefined)?.[0];
          const rawTs = firstEntry?.timestamp;
          // js-yaml parses ISO timestamps as Date objects; convert to ISO string for comparison.
          const createdAt =
            rawTs instanceof Date
              ? rawTs.toISOString()
              : typeof rawTs === "string"
                ? rawTs
                : "9999-12-31T23:59:59.999Z";

          pending.push({ commissionId: cId, projectName: project.name, createdAt });
        } catch {
          // Skip unreadable artifacts
          continue;
        }
      }
    }

    // Sort oldest first (FIFO)
    pending.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return pending;
  }

  /**
   * Attempts to auto-dispatch pending commissions when capacity opens up.
   * Called after a commission reaches a terminal state (completed/failed/cancelled).
   * Dispatches as many pending commissions as capacity allows, respecting both
   * global and per-project limits. FIFO: oldest creation date first.
   */
  async function tryAutoDispatch(): Promise<void> {
    const pending = await scanPendingCommissions();
    if (pending.length === 0) return;

    for (const candidate of pending) {
      // Re-check capacity for each candidate (previous dispatch may have filled a slot)
      const { atLimit } = isAtCapacity(candidate.projectName);
      if (atLimit) continue;

      try {
        console.log(
          `[commission] auto-dispatching "${candidate.commissionId}" from queue (FIFO)`,
        );
        deps.eventBus.emit({
          type: "commission_dequeued",
          commissionId: candidate.commissionId as string,
          reason: "Capacity available, dispatching from queue",
        });
        await dispatchCommission(candidate.commissionId);
      } catch (err: unknown) {
        console.warn(
          `[commission] auto-dispatch failed for "${candidate.commissionId}":`,
          errorMessage(err),
        );
      }
    }
  }

  /**
   * Enqueues an auto-dispatch attempt on the serialization chain.
   * Ensures only one auto-dispatch scan runs at a time.
   */
  function enqueueAutoDispatch(): void {
    autoDispatchChain = autoDispatchChain.then(() => tryAutoDispatch()).catch((err: unknown) => {
      console.error(
        "[commission] auto-dispatch chain error:",
        errorMessage(err),
      );
    });
  }

  // -- Dependency auto-transitions --

  /**
   * Checks dependency satisfaction for blocked and pending commissions in a
   * project and transitions them accordingly:
   *   - blocked -> pending: all dependency artifact paths exist in integration worktree
   *   - pending -> blocked: at least one dependency artifact path is missing
   *
   * Commissions with no dependencies are never transitioned to blocked.
   * After any blocked -> pending transition, triggers the FIFO auto-dispatch
   * check so newly-pending commissions can be dispatched if capacity allows.
   *
   * Uses the integration worktree for dependency path resolution, not
   * activity worktrees (dependencies are checked against the shared branch).
   */
  async function checkDependencyTransitions(projectName: string): Promise<void> {
    const iPath = integrationWorktreePath(ghHome, projectName);
    const commissionsDir = path.join(iPath, ".lore", "commissions");

    let entries: string[];
    try {
      entries = await fs.readdir(commissionsDir);
    } catch {
      return;
    }

    let anyUnblocked = false;

    for (const filename of entries) {
      if (!filename.endsWith(".md")) continue;
      const cId = asCommissionId(filename.replace(/\.md$/, ""));

      // Skip commissions that are currently active (dispatched/in_progress)
      if (activeCommissions.has(cId as string)) continue;

      let status: CommissionStatus | null;
      try {
        status = await readCommissionStatus(iPath, cId);
      } catch {
        continue;
      }

      if (status !== "blocked" && status !== "pending") continue;

      let dependencies: string[];
      try {
        dependencies = await readCommissionDependencies(iPath, cId);
      } catch {
        continue;
      }

      // No dependencies: never transition to blocked, skip
      if (dependencies.length === 0) continue;

      // Check if all dependency paths exist in the integration worktree
      let allSatisfied = true;
      for (const dep of dependencies) {
        const depPath = path.join(iPath, dep);
        const exists = await fileExists(depPath);
        if (!exists) {
          allSatisfied = false;
          break;
        }
      }

      if (status === "blocked" && allSatisfied) {
        // All dependencies satisfied: transition blocked -> pending
        try {
          await transitionCommission(
            iPath,
            cId,
            "blocked",
            "pending",
            "All dependency artifacts now exist",
          );
          deps.eventBus.emit({
            type: "commission_status",
            commissionId: cId as string,
            status: "pending",
            reason: "All dependency artifacts now exist",
          });
          anyUnblocked = true;
          console.log(
            `[commission] dependency auto-transition: "${cId}" blocked -> pending (all deps satisfied)`,
          );
        } catch (err: unknown) {
          console.warn(
            `[commission] Failed to auto-transition "${cId}" blocked -> pending:`,
            errorMessage(err),
          );
        }
      } else if (status === "pending" && !allSatisfied) {
        // A dependency is missing: transition pending -> blocked
        try {
          await transitionCommission(
            iPath,
            cId,
            "pending",
            "blocked",
            "Dependency artifact missing",
          );
          deps.eventBus.emit({
            type: "commission_status",
            commissionId: cId as string,
            status: "blocked",
            reason: "Dependency artifact missing",
          });
          console.log(
            `[commission] dependency auto-transition: "${cId}" pending -> blocked (missing dep)`,
          );
        } catch (err: unknown) {
          console.warn(
            `[commission] Failed to auto-transition "${cId}" pending -> blocked:`,
            errorMessage(err),
          );
        }
      }
    }

    // If any commission was unblocked, trigger FIFO auto-dispatch
    if (anyUnblocked) {
      enqueueAutoDispatch();
    }
  }

  // -- Helpers --

  function findProject(projectName: string) {
    return deps.config.projects.find((p) => p.name === projectName);
  }

  function formatCommissionId(workerName: string, now: Date): CommissionId {
    const safeName = sanitizeForGitRef(workerName);
    const ts = formatTimestamp(now);
    return asCommissionId(`commission-${safeName}-${ts}`);
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
   * Counts the number of previous dispatch attempts by scanning the
   * integration worktree's timeline for terminal status entries
   * (status_failed, status_cancelled). Each previous attempt that ended
   * in failure or cancellation syncs a terminal entry to the integration
   * worktree via syncStatusToIntegration. The count of these entries
   * gives the number of completed attempts, so the next attempt is
   * count + 1 (attempt 2 produces branch suffix "-2", etc.).
   *
   * Note: status_dispatched entries are written to the activity worktree
   * (not the integration worktree), so we count terminal entries instead.
   */
  async function getDispatchAttempt(
    basePath: string,
    id: CommissionId,
  ): Promise<number> {
    const artifactPath = commissionArtifactPath(basePath, id);
    const raw = await fs.readFile(artifactPath, "utf-8");
    const { data } = matter(raw);
    const timeline = (data.activity_timeline as Array<{ event: string }> | undefined) ?? [];
    return timeline.filter((e) => e.event === "status_failed" || e.event === "status_cancelled").length;
  }

  /**
   * Finds the project for a commission by searching integration worktrees
   * for the artifact file. Returns the project's real path (for config
   * lookups), the project name, and the integration worktree path (for
   * artifact operations).
   */
  async function findProjectPathForCommission(
    commissionId: CommissionId,
  ): Promise<{ projectPath: string; projectName: string; integrationPath: string } | null> {
    for (const project of deps.config.projects) {
      const iPath = integrationWorktreePath(ghHome, project.name);
      const artifactPath = commissionArtifactPath(iPath, commissionId);
      try {
        await fs.access(artifactPath);
        return { projectPath: project.path, projectName: project.name, integrationPath: iPath };
      } catch {
        continue;
      }
    }
    return null;
  }

  /**
   * Resolves the base path for artifact reads/writes. When a commission is
   * active (dispatched/in_progress), artifacts live in the activity worktree.
   * Otherwise they live in the integration worktree.
   *
   * Routing logic:
   * - dispatched/in_progress: returns active.worktreeDir (activity worktree on
   *   the commission's branch). Writes here keep worker changes isolated until
   *   squash-merge on completion.
   * - all other states (pending, completed, failed, cancelled, blocked): returns
   *   the integration worktree on the claude branch. The activity worktree has
   *   already been cleaned up or was never created.
   *
   * The activeCommissions map is the source of truth for "is this commission
   * currently running" — it is populated on dispatch and cleared on exit.
   */
  function resolveArtifactBasePath(commissionId: CommissionId, projectName: string): string {
    const active = activeCommissions.get(commissionId as string);
    if (active) {
      return active.worktreeDir;
    }
    return integrationWorktreePath(ghHome, projectName);
  }

  /**
   * Syncs a terminal status back to the integration worktree so that the
   * artifact is findable (and has the correct status) after the activity
   * worktree is cleaned up. Without this, redispatch and status reads
   * would see stale "pending" status in the integration copy.
   */
  async function syncStatusToIntegration(
    commission: ActiveCommission,
    status: CommissionStatus,
    reason: string,
  ): Promise<void> {
    const iPath = integrationWorktreePath(ghHome, commission.projectName);
    try {
      await updateCommissionStatus(iPath, commission.commissionId, status);
      await appendTimelineEntry(
        iPath,
        commission.commissionId,
        `status_${status}`,
        reason,
      );
    } catch (err: unknown) {
      console.warn(
        `[commission-session] Failed to sync status "${status}" to integration worktree for ${commission.commissionId}:`,
        errorMessage(err),
      );
    }
  }

  /**
   * Commits any uncommitted changes to preserve partial results, then
   * removes the activity worktree. Branch is always preserved for inspection.
   */
  async function preserveAndCleanupWorktree(
    id: string,
    worktreeDir: string,
    branchName: string,
    commitMessage: string,
    projectPath?: string,
  ): Promise<void> {
    try {
      const hadChanges = await git.commitAll(worktreeDir, commitMessage);
      if (hadChanges) {
        console.log(
          `[commission] "${id}" partial results committed to ${branchName}`,
        );
      }
    } catch (err: unknown) {
      console.warn(
        `[commission] Failed to commit partial results for "${id}":`,
        errorMessage(err),
      );
    }

    if (projectPath) {
      try {
        await git.removeWorktree(projectPath, worktreeDir);
      } catch (err: unknown) {
        console.warn(
          `[commission] Failed to remove worktree for "${id}":`,
          errorMessage(err),
        );
      }
    }
  }

  /**
   * Handles a commission failure. Transitions to failed, emits event,
   * and cleans up. Preserves the branch for inspection.
   */
  async function handleFailure(
    id: string,
    commission: ActiveCommission,
    reason: string,
  ): Promise<void> {
    // Terminal state guard: another path (e.g., cancelCommission) may have
    // already resolved this commission.
    if (isTerminalStatus(commission.status)) {
      activeCommissions.delete(id);
      return;
    }

    // Commission is always active when handleFailure is called, so the
    // artifact lives in the activity worktree.
    try {
      await transitionCommission(
        commission.worktreeDir,
        commission.commissionId,
        commission.status,
        "failed",
        reason,
      );
    } catch (err: unknown) {
      console.error(
        `[commission-session] Failed to transition ${id} to failed:`,
        errorMessage(err),
      );
    }

    deps.eventBus.emit({
      type: "commission_status",
      commissionId: id,
      status: "failed",
      reason,
    });

    commission.status = "failed";

    // Sync terminal status to integration worktree before cleanup
    await syncStatusToIntegration(commission, "failed", reason);

    await preserveAndCleanupWorktree(
      id,
      commission.worktreeDir,
      commission.branchName,
      `Partial work preserved: ${id}`,
      findProject(commission.projectName)?.path,
    );

    activeCommissions.delete(id);

    // Update state file
    writeStateFile(commission.commissionId, {
      commissionId: id,
      projectName: commission.projectName,
      workerName: commission.workerName,
      status: "failed",
    }).catch((err: unknown) => {
      console.error(
        `[commission-session] Failed to write state file for ${commission.commissionId}:`,
        errorMessage(err),
      );
    });

    // Failure may have changed which artifacts exist on the integration worktree.
    await checkDependencyTransitions(commission.projectName);

    // Capacity freed: check if pending commissions can now dispatch
    enqueueAutoDispatch();
  }

  // -- In-process SDK session runner --
  //
  // Runs an SDK session for a commission directly in the daemon process,
  // replacing the subprocess model. Called as fire-and-forget from
  // dispatchCommission().

  async function activateWorker(
    workerPkg: DiscoveredPackage,
    context: ActivationContext,
  ): Promise<ActivationResult> {
    return activateWorkerShared(workerPkg, context, deps.activateFn);
  }

  /**
   * Runs an SDK session in-process for a commission. Handles the full
   * lifecycle: tool resolution, memory injection, worker activation,
   * SDK session consumption, and follow-up session for missing submit_result.
   *
   * Returns true if the worker called submit_result (commission should be
   * marked completed), false otherwise (commission should be marked failed).
   */
  async function runCommissionSession(
    commissionId: CommissionId,
    commission: ActiveCommission,
    abortController: AbortController,
    projectPath: string,
    prompt: string,
    commissionDeps: string[],
    resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number },
  ): Promise<boolean> {
    const log = (msg: string) =>
      console.log(`[commission-session] [${commissionId}] ${msg}`);
    const logErr = (msg: string) =>
      console.error(`[commission-session] [${commissionId}] ${msg}`);

    if (!deps.queryFn) {
      logErr("no queryFn provided, cannot run in-process session");
      return false;
    }

    // 1. Find the worker package
    const workerPkg = deps.packages.find((p) => {
      if (!("identity" in p.metadata)) return false;
      return p.metadata.identity.name === commission.workerName;
    });
    if (!workerPkg) {
      logErr(`worker package for "${commission.workerName}" not found`);
      return false;
    }
    const workerMeta = workerPkg.metadata as WorkerMetadata;
    const isManager = workerPkg.name === MANAGER_PACKAGE_NAME;

    // 2. Subscribe to EventBus for this commission's tool events
    log("resolving tools...");

    const unsubscribe = deps.eventBus.subscribe((event) => {
      if (!("commissionId" in event) || event.commissionId !== (commissionId as string)) return;

      if (event.type === "commission_result") {
        commission.lastActivity = new Date();
        commission.resultSubmitted = true;
        commission.resultSummary = event.summary;
        commission.resultArtifacts = event.artifacts;
        log(`result submitted: ${event.summary.slice(0, 120)}${event.artifacts?.length ? ` (${event.artifacts.length} artifacts)` : ""}`);
      } else if (event.type === "commission_progress") {
        commission.lastActivity = new Date();
        log(`progress: ${event.summary.slice(0, 120)}`);
      } else if (event.type === "commission_question") {
        commission.lastActivity = new Date();
        log(`question: ${event.question.slice(0, 120)}`);
      }
    });

    const resolve = deps.resolveToolSetFn ?? resolveToolSet;
    const resolvedTools = await resolve(workerMeta, deps.packages, {
      projectName: commission.projectName,
      contextId: commissionId as string,
      contextType: "commission",
      workerName: workerMeta.identity.name,
      guildHallHome: ghHome,
      eventBus: deps.eventBus,
      config: deps.config,
      services: isManager && deps.commissionSessionRef?.current
        ? { commissionSession: deps.commissionSessionRef.current, gitOps: git }
        : undefined,
    });
    log(`tools resolved: ${resolvedTools.mcpServers.length} MCP server(s), ${resolvedTools.allowedTools?.length ?? 0} allowed tool(s)`);

    // 3. Load memory files
    const project = findProject(commission.projectName);
    let injectedMemory = "";
    let needsCompaction = false;
    try {
      const memoryResult = await loadMemories(
        workerMeta.identity.name,
        commission.projectName,
        {
          guildHallHome: ghHome,
          memoryLimit: project?.memoryLimit,
        },
      );
      injectedMemory = memoryResult.memoryBlock;
      needsCompaction = memoryResult.needsCompaction;
      if (needsCompaction) {
        log(`memory exceeds limit, will trigger compaction`);
      }
    } catch (err: unknown) {
      log(`failed to load memories (non-fatal): ${errorMessage(err)}`);
    }

    // 4. Build activation context
    const activationContext = buildCommissionActivationContext(
      commissionId as string,
      prompt,
      commissionDeps,
      workerMeta,
      resolvedTools,
      projectPath,
      commission.worktreeDir,
      injectedMemory,
    );

    // Inject manager context if this is the Guild Master
    if (isManager) {
      try {
        activationContext.managerContext = await buildManagerContext({
          packages: deps.packages,
          projectName: commission.projectName,
          integrationPath: integrationWorktreePath(ghHome, commission.projectName),
          guildHallHome: ghHome,
          memoryLimit: project?.memoryLimit,
        });
      } catch (err: unknown) {
        log(`failed to build manager context (non-fatal): ${errorMessage(err)}`);
      }
    }

    // 5. Activate the worker
    log(`activating worker "${workerMeta.identity.name}"...`);
    let activation: ActivationResult;
    try {
      activation = await activateWorker(workerPkg, activationContext);
    } catch (err: unknown) {
      logErr(`worker activation failed: ${errorMessage(err)}`);
      return false;
    }
    log(`worker activated. systemPrompt length=${activation.systemPrompt.length}`);

    // 6. Build SDK query options
    const options = buildCommissionQueryOptions(
      activation,
      commission.worktreeDir,
      resourceOverrides,
      abortController,
    );
    const maxTurnsLog = typeof options.maxTurns === "number" ? options.maxTurns : "unset";
    log(`SDK options: maxTurns=${maxTurnsLog}, cwd="${String(options.cwd)}"`);

    // 7. Fire-and-forget memory compaction
    if (needsCompaction) {
      log(`triggering memory compaction for "${workerMeta.identity.name}"`);
      void triggerCompaction(
        workerMeta.identity.name,
        commission.projectName,
        {
          guildHallHome: ghHome,
          compactFn: deps.queryFn as Parameters<typeof triggerCompaction>[2]["compactFn"],
        },
      );
    }

    // 8. Run the SDK session (wrapped in try/finally to ensure unsubscribe)
    log("starting SDK session...");
    const session = deps.queryFn({ prompt, options });

    try {
      let messageCount = 0;
      let sessionId: string | undefined;
      try {
        for await (const msg of session) {
          messageCount++;
          commission.lastActivity = new Date();
          logSdkMessage(log, messageCount, msg);

          // Capture session_id from the init system message for resume support
          const m = msg as Record<string, unknown>;
          if (m.type === "system" && m.subtype === "init" && typeof m.session_id === "string") {
            sessionId = m.session_id;
            log(`captured session_id: ${sessionId}`);
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          log(`SDK session aborted after ${messageCount} message(s)`);
          return commission.resultSubmitted;
        }
        logErr(`SDK session error after ${messageCount} message(s): ${errorMessage(err)}`);
        return commission.resultSubmitted;
      }
      log(`SDK session complete. ${messageCount} message(s) consumed.`);

      // 9. Check if result was submitted
      if (commission.resultSubmitted) {
        return true;
      }

      // 10. No result submitted: run follow-up session to force submit_result
      if (!sessionId) {
        logErr("no result submitted and no session_id captured; cannot resume");
        return false;
      }

      log(`no result submitted, resuming session ${sessionId} to force submit_result...`);
      const followUpOptions = {
        ...options,
        resume: sessionId,
        maxTurns: 3,
      };
      const followUp = deps.queryFn({
        prompt: [
          "Your previous session completed without calling submit_result.",
          "The commission WILL BE MARKED AS FAILED unless you call submit_result now.",
          "Summarize what you accomplished (or attempted) and call submit_result immediately.",
          "Do NOT do any other work. Just call submit_result with a summary.",
        ].join(" "),
        options: followUpOptions,
      });

      let followUpCount = 0;
      try {
        for await (const msg of followUp) {
          followUpCount++;
          commission.lastActivity = new Date();
          logSdkMessage(log, followUpCount, msg);
        }
      } catch (err: unknown) {
        logErr(`follow-up session error: ${errorMessage(err)}`);
      }
      log(`follow-up session complete. ${followUpCount} message(s) consumed.`);

      if (!commission.resultSubmitted) {
        logErr("follow-up session also failed to call submit_result");
      }
      return commission.resultSubmitted;
    } finally {
      unsubscribe();
    }
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

    // 4. Ensure commissions directory exists in the integration worktree
    const iPath = integrationWorktreePath(ghHome, projectName);
    const commissionsDir = path.join(iPath, ".lore", "commissions");
    await fs.mkdir(commissionsDir, { recursive: true });

    // 5. Write the commission artifact
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const isoStr = now.toISOString();

    const escapedTitle = escapeYamlValue(title);
    const escapedPrompt = escapeYamlValue(prompt);
    const escapedDisplayTitle = escapeYamlValue(workerMeta.identity.displayTitle);

    // Format dependencies as YAML array
    const depsYaml =
      dependencies.length > 0
        ? "\n" + dependencies.map((d) => `  - ${d}`).join("\n")
        : " []";

    const resourceLines =
      resourceOverrides && (resourceOverrides.maxTurns !== undefined || resourceOverrides.maxBudgetUsd !== undefined)
        ? `\nresource_overrides:\n${
            resourceOverrides.maxTurns !== undefined
              ? `  maxTurns: ${resourceOverrides.maxTurns}\n`
              : ""
          }${
            resourceOverrides.maxBudgetUsd !== undefined
              ? `  maxBudgetUsd: ${resourceOverrides.maxBudgetUsd}\n`
              : ""
          }`
        : "";
    
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
${resourceLines}
activity_timeline:
  - timestamp: ${isoStr}
    event: created
    reason: "Commission created"
current_progress: ""
result_summary: ""
projectName: ${projectName}
---
`;

    const artifactPath = commissionArtifactPath(iPath, commissionId);
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

    // Verify status is pending (artifact is in integration worktree for pending commissions)
    const basePath = resolveArtifactBasePath(commissionId, found.projectName);
    const status = await readCommissionStatus(basePath, commissionId);
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
      basePath,
      commissionId,
    );
    const raw = await fs.readFile(artifactPath, "utf-8");
    const parsed = matter(raw);
    const frontmatter = parsed.data as Record<string, unknown>;

    if (updates.prompt !== undefined) {
      frontmatter.prompt = updates.prompt;
    }

    if (updates.dependencies !== undefined) {
      frontmatter.dependencies = updates.dependencies;
    }

    if (updates.resourceOverrides !== undefined) {
      const currentOverridesValue = frontmatter.resource_overrides;
      const existingOverrides =
        typeof currentOverridesValue === "object" &&
        currentOverridesValue !== null
          ? { ...(currentOverridesValue as Record<string, unknown>) }
          : {};

      if (updates.resourceOverrides.maxTurns !== undefined) {
        existingOverrides.maxTurns = updates.resourceOverrides.maxTurns;
      }

      if (updates.resourceOverrides.maxBudgetUsd !== undefined) {
        existingOverrides.maxBudgetUsd = updates.resourceOverrides.maxBudgetUsd;
      }

      if (Object.keys(existingOverrides).length > 0) {
        frontmatter.resource_overrides = existingOverrides;
      }
    }

    const updated = matter.stringify(parsed.content, frontmatter);
    await fs.writeFile(artifactPath, updated, "utf-8");
  }

  async function dispatchCommission(
    commissionId: CommissionId,
    attempt?: number,
  ): Promise<{ status: "accepted" | "queued" }> {
    // 1. Find the project
    const found = await findProjectPathForCommission(commissionId);
    if (!found) {
      throw new Error(
        `Commission "${commissionId}" not found in any project`,
      );
    }

    // 2. Verify status is pending (artifact is in integration worktree)
    const currentStatus = await readCommissionStatus(
      found.integrationPath,
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

    // 3. Check capacity limits before starting session
    const capacityCheck = isAtCapacity(found.projectName);
    if (capacityCheck.atLimit) {
      console.log(
        `[commission] queuing "${commissionId}": ${capacityCheck.reason}`,
      );
      deps.eventBus.emit({
        type: "commission_queued",
        commissionId: commissionId as string,
        reason: capacityCheck.reason,
      });
      return { status: "queued" };
    }

    // 4. Commit the pending artifact to the integration worktree so
    //    the activity branch (forked from claude/main) includes it.
    await git.commitAll(found.integrationPath, `Add commission: ${commissionId}`);

    // 5. Create activity branch and worktree from the claude branch.
    //    The worktree gets the committed state of the claude branch (pending).
    //    All subsequent artifact mutations happen in the activity worktree.
    //    On re-dispatch, the attempt number produces a suffixed branch name
    //    (e.g., claude/commission/<id>-2) while preserving the old branch.
    const branchName = commissionBranchName(commissionId as string, attempt);
    const worktreeDir = commissionWorktreePath(ghHome, found.projectName, commissionId as string);

    await git.createBranch(found.projectPath, branchName, CLAUDE_BRANCH);
    await fs.mkdir(path.dirname(worktreeDir), { recursive: true });
    await git.createWorktree(found.projectPath, worktreeDir, branchName);

    // 6. Transition to dispatched (in activity worktree)
    await transitionCommission(
      worktreeDir,
      commissionId,
      "pending",
      "dispatched",
      "Commission dispatched to worker",
    );

    // 7. Read the artifact to get prompt, worker, dependencies, resource overrides
    const artifactPath = commissionArtifactPath(
      worktreeDir,
      commissionId,
    );
    const raw = await fs.readFile(artifactPath, "utf-8");
    const { data } = matter(raw);

    const prompt = (data.prompt as string | undefined) ?? "";
    const workerName = (data.worker as string | undefined) ?? "";
    const commissionDeps = (data.dependencies as string[] | undefined) ?? [];
    const overrides = data.resource_overrides as { maxTurns?: number; maxBudgetUsd?: number } | undefined;
    const resourceOverrides: { maxTurns?: number; maxBudgetUsd?: number } = {};
    if (overrides?.maxTurns !== undefined) {
      resourceOverrides.maxTurns = Number(overrides.maxTurns);
    }
    if (overrides?.maxBudgetUsd !== undefined) {
      resourceOverrides.maxBudgetUsd = Number(overrides.maxBudgetUsd);
    }

    // Configure sparse checkout if the worker's checkoutScope is "sparse"
    const workerPkg = deps.packages.find((p) => {
      if (!("identity" in p.metadata)) return false;
      return p.metadata.identity.name === workerName;
    });
    if (workerPkg && "checkoutScope" in workerPkg.metadata) {
      const scope = (workerPkg.metadata as { checkoutScope: string }).checkoutScope;
      if (scope === "sparse") {
        await git.configureSparseCheckout(worktreeDir, [".lore/"]);
      }
    }

    // 8. Write machine-local state file
    await writeStateFile(commissionId, {
      commissionId: commissionId as string,
      projectName: found.projectName,
      workerName,
      status: "dispatched",
      worktreeDir,
      branchName,
    });

    // 9. Create AbortController and register in active Map
    const abortController = new AbortController();
    const now = new Date();
    const active: ActiveCommission = {
      commissionId,
      projectName: found.projectName,
      workerName,
      startTime: now,
      lastActivity: now,
      status: "dispatched",
      resultSubmitted: false,
      worktreeDir,
      branchName,
      abortController,
    };

    activeCommissions.set(commissionId as string, active);

    // 10. Transition to in_progress (in the activity worktree)
    await transitionCommission(
      worktreeDir,
      commissionId,
      "dispatched",
      "in_progress",
      "Commission session started",
    );
    active.status = "in_progress";

    // 11. Emit event
    deps.eventBus.emit({
      type: "commission_status",
      commissionId: commissionId as string,
      status: "in_progress",
      reason: "Commission session started",
    });

    console.log(
      `[commission] dispatching "${commissionId}" -> worker="${workerName}" (in-process)`,
    );

    // 12. Fire-and-forget: run the SDK session in-process
    void runCommissionSession(
      commissionId,
      active,
      abortController,
      found.projectPath,
      prompt,
      commissionDeps,
      Object.keys(resourceOverrides).length > 0 ? resourceOverrides : undefined,
    ).then(async (resultSubmitted) => {
      await handleCompletion(commissionId, active, resultSubmitted);
    }).catch(async (err: unknown) => {
      try {
        await handleError(commissionId, active, err);
      } catch (innerErr: unknown) {
        console.error(
          `[commission-session] handleError itself failed for ${commissionId}:`,
          errorMessage(innerErr),
        );
      }
    });

    return { status: "accepted" };
  }

  /**
   * Handles a commission session that returned normally. If resultSubmitted
   * is true, transitions to completed with squash-merge. If false,
   * transitions to failed ("session completed without submitting result").
   */
  async function handleCompletion(
    commissionId: CommissionId,
    commission: ActiveCommission,
    resultSubmitted: boolean,
  ): Promise<void> {
    // If already in a terminal state (e.g., cancelled during session), skip
    if (isTerminalStatus(commission.status)) {
      activeCommissions.delete(commissionId as string);
      return;
    }

    let finalStatus: CommissionStatus;
    let reason: string;

    if (resultSubmitted) {
      finalStatus = "completed";
      console.log(`[commission] "${commissionId}" completed (result submitted)`);
      reason = "Worker completed successfully";
    } else {
      finalStatus = "failed";
      console.log(`[commission] "${commissionId}" failed (session completed without submitting result)`);
      reason = "Session completed without submitting result";
    }

    commission.status = finalStatus;

    // Artifact lives in the activity worktree (commission is active)
    try {
      await transitionCommission(
        commission.worktreeDir,
        commissionId,
        "in_progress",
        finalStatus,
        reason,
      );
    } catch (err: unknown) {
      console.error(
        `[commission-session] Failed to transition ${commissionId} to ${finalStatus}:`,
        errorMessage(err),
      );
    }

    if (finalStatus === "completed" && commission.resultSummary) {
      try {
        await updateResultSummary(
          commission.worktreeDir,
          commissionId,
          commission.resultSummary,
          commission.resultArtifacts,
        );
      } catch (err: unknown) {
        console.error(
          `[commission-session] Failed to update result summary:`,
          errorMessage(err),
        );
      }
    }

    deps.eventBus.emit({
      type: "commission_status",
      commissionId: commissionId as string,
      status: finalStatus,
      reason,
    });

    // Git cleanup: behavior depends on final status
    const project = findProject(commission.projectName);
    let cleanMergeCompleted = false;
    if (finalStatus === "completed" && project) {
      // Squash-merge activity branch into claude, then clean up both.
      // The merge brings the activity branch's artifact (status=completed
      // with full timeline). We sync status to the integration worktree
      // after the merge as a safety net: the merge should have brought it,
      // but an explicit sync ensures auto-dispatch scanning sees the
      // correct status even if the merge was a no-op.
      const iPath = integrationWorktreePath(ghHome, commission.projectName);
      let mergeSucceeded = false;
      try {
        await git.commitAll(commission.worktreeDir, `Commission completed: ${commissionId}`);
        mergeSucceeded = await withProjectLock(commission.projectName, async () => {
          await git.commitAll(iPath, `Pre-merge sync: ${commissionId}`);
          return await resolveSquashMerge(git, iPath, commission.branchName, {
            logPrefix: "commission",
            commitLabel: "Commission",
            activityId: commissionId,
          });
        });
      } catch (err: unknown) {
        console.warn(
          `[commission] Git cleanup failed for completed "${commissionId}":`,
          errorMessage(err),
        );
      }

      if (mergeSucceeded) {
        await syncStatusToIntegration(commission, finalStatus, reason);
        try {
          await git.removeWorktree(project.path, commission.worktreeDir);
          await git.deleteBranch(project.path, commission.branchName);
        } catch (err: unknown) {
          console.warn(
            `[commission] Worktree/branch cleanup failed for "${commissionId}":`,
            errorMessage(err),
          );
        }
        // Remove the state file: the artifact on the integration worktree is now
        // the source of truth. recoverCommissions() handles missing files gracefully.
        await fs.unlink(commissionStatePath(commissionId)).catch(() => {});
        cleanMergeCompleted = true;
        console.log(`[commission] "${commissionId}" squash-merged to claude and cleaned up`);
      } else {
        // Merge failed due to non-.lore/ conflicts. Transition to failed,
        // preserve branch for manual resolution.
        const conflictReason = "Squash-merge conflict on non-.lore/ files";
        commission.status = "failed";
        finalStatus = "failed";
        reason = conflictReason;

        // completed -> failed is not in the state machine because completed
        // is terminal. Squash-merge failure after completion is a special case
        // handled directly.
        try {
          await updateCommissionStatus(commission.worktreeDir, commissionId, "failed");
          await appendTimelineEntry(
            commission.worktreeDir,
            commissionId,
            "status_failed",
            conflictReason,
          );
        } catch (updateErr: unknown) {
          console.error(
            `[commission] Failed to update status after merge conflict for "${commissionId}":`,
            errorMessage(updateErr),
          );
        }

        deps.eventBus.emit({
          type: "commission_status",
          commissionId: commissionId as string,
          status: "failed",
          reason: conflictReason,
        });

        await syncStatusToIntegration(commission, "failed", conflictReason);

        await preserveAndCleanupWorktree(
          commissionId as string,
          commission.worktreeDir,
          commission.branchName,
          `Partial work preserved (merge conflict): ${commissionId}`,
          project?.path,
        );

        // Escalate conflict to Guild Master as a meeting request so the user
        // sees an actionable notification instead of a silent failure.
        if (deps.createMeetingRequestFn) {
          const escalationReason =
            `Commission ${commissionId} failed to merge: non-.lore/ conflicts detected. ` +
            `Branch ${commission.branchName} preserved. ` +
            `Please resolve conflicts manually, then re-dispatch or clean up the branch.`;
          deps.createMeetingRequestFn({
            projectName: commission.projectName,
            workerName: MANAGER_PACKAGE_NAME,
            reason: escalationReason,
          }).catch((err: unknown) => {
            console.warn(
              `[commission] Failed to create Guild Master meeting request for "${commissionId}":`,
              errorMessage(err),
            );
          });
        }
      }
    } else {
      // Sync terminal status to integration worktree. For failed,
      // there's no squash-merge, so the integration copy needs a direct update.
      await syncStatusToIntegration(commission, finalStatus, reason);

      await preserveAndCleanupWorktree(
        commissionId as string,
        commission.worktreeDir,
        commission.branchName,
        `Partial work preserved: ${commissionId}`,
        project?.path,
      );
    }

    // Remove from active Map
    activeCommissions.delete(commissionId as string);

    // Update state file with final status. Skip when cleanMergeCompleted:
    // the state file was already deleted above (artifact on the integration
    // worktree is the source of truth for completed commissions).
    if (!cleanMergeCompleted) {
      writeStateFile(commissionId, {
        commissionId: commissionId as string,
        projectName: commission.projectName,
        workerName: commission.workerName,
        status: commission.status,
      }).catch((err: unknown) => {
        console.error(
          `[commission-session] Failed to write state file for ${commissionId}:`,
          errorMessage(err),
        );
      });
    }

    // Artifacts may have changed on the integration worktree (squash-merge
    // brought new files, or failure removed expected outputs). Check if any
    // blocked commissions can now proceed, or pending ones lost a dependency.
    await checkDependencyTransitions(commission.projectName);

    // Capacity freed: check if pending commissions can now dispatch
    enqueueAutoDispatch();
  }

  /**
   * Handles a commission session that threw an error. If the error is an
   * AbortError, transitions to cancelled (preserving branch for inspection).
   * Otherwise transitions to failed. Checks commission.resultSubmitted
   * before classifying as failed (dispatch-hardening retro lesson: preserve
   * results even on abnormal termination).
   */
  async function handleError(
    commissionId: CommissionId,
    commission: ActiveCommission,
    error: unknown,
  ): Promise<void> {
    // If already in a terminal state, skip
    if (isTerminalStatus(commission.status)) {
      activeCommissions.delete(commissionId as string);
      return;
    }

    const isAbort = error instanceof Error && error.name === "AbortError";

    if (isAbort) {
      // AbortError means the session was intentionally stopped, either by
      // cancelCommission() or shutdown(). cancelCommission does its own
      // transition + cleanup; shutdown relies on recovery on next start.
      // In both cases, this handler should not race with the initiator.
      console.log(`[commission] "${commissionId}" session aborted`);
      return;
    }

    // Non-abort error. Check if a result was submitted before the error
    // (dispatch-hardening lesson: preserve results even on abnormal exit).
    if (commission.resultSubmitted) {
      console.warn(
        `[commission] "${commissionId}" session errored but result was submitted, treating as completed`,
      );
      await handleCompletion(commissionId, commission, true);
      return;
    }

    const reason = error instanceof Error
      ? `Session error: ${error.message}`
      : `Session error: ${String(error)}`;

    console.error(`[commission] "${commissionId}" ${reason}`);
    await handleFailure(commissionId as string, commission, reason);
  }

  async function cancelCommission(
    commissionId: CommissionId,
    reason = "Commission cancelled by user",
  ): Promise<void> {
    const commission = activeCommissions.get(commissionId as string);
    if (!commission) {
      throw new Error(
        `Commission "${commissionId}" not found in active commissions`,
      );
    }

    console.log(`[commission] cancelling "${commissionId}" via abort`);

    // Set status before any awaits so handleCompletion's terminal state
    // guard fires if it races with us after the abort signal propagates.
    const previousStatus = commission.status;
    commission.status = "cancelled";

    // Signal the in-process SDK session to stop
    commission.abortController.abort();

    // Transition to cancelled (artifact is in activity worktree).
    // Wrap in try/catch: handleCompletion may race and transition first.
    try {
      await transitionCommission(
        commission.worktreeDir,
        commissionId,
        previousStatus,
        "cancelled",
        reason,
      );
    } catch (err: unknown) {
      console.warn(
        `[commission] transition to cancelled raced with completion handler for "${commissionId}": ${errorMessage(err)}`,
      );
    }

    deps.eventBus.emit({
      type: "commission_status",
      commissionId: commissionId as string,
      status: "cancelled",
      reason,
    });

    // Sync terminal status to integration worktree before cleanup
    await syncStatusToIntegration(commission, "cancelled", reason);

    await preserveAndCleanupWorktree(
      commissionId as string,
      commission.worktreeDir,
      commission.branchName,
      `Partial work preserved on cancellation: ${commissionId}`,
      findProject(commission.projectName)?.path,
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
        errorMessage(err),
      );
    });

    // Cancellation may have removed artifacts that other commissions depend on.
    await checkDependencyTransitions(commission.projectName);

    // Capacity freed: check if pending commissions can now dispatch
    enqueueAutoDispatch();
  }

  async function redispatchCommission(
    commissionId: CommissionId,
  ): Promise<{ status: "accepted" | "queued" }> {
    // 1. Find the project
    const found = await findProjectPathForCommission(commissionId);
    if (!found) {
      throw new Error(
        `Commission "${commissionId}" not found in any project`,
      );
    }

    // 2. Verify status is failed or cancelled (artifact is in integration worktree)
    const currentStatus = await readCommissionStatus(
      found.integrationPath,
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

    // 3. Count previous dispatch attempts to determine the branch suffix.
    //    Each dispatch appends a status_dispatched timeline entry, so the count
    //    gives us the previous attempts. The new attempt is count + 1.
    const previousDispatches = await getDispatchAttempt(
      found.integrationPath,
      commissionId,
    );
    const attempt = previousDispatches + 1;

    console.log(
      `[commission] redispatching "${commissionId}" (was ${currentStatus}, attempt ${attempt})`,
    );

    // 4. Transition back to pending
    // The state machine allows failed -> (nothing) and cancelled -> (nothing)
    // as terminal states. For redispatch, we do a direct status update
    // bypassing the normal transition graph since this is a reset operation.
    await updateCommissionStatus(found.integrationPath, commissionId, "pending");
    await appendTimelineEntry(
      found.integrationPath,
      commissionId,
      "status_pending",
      "Commission reset for redispatch",
      { from: currentStatus, to: "pending" },
    );

    // 5. Dispatch with the attempt number so the new branch gets the suffix
    return dispatchCommission(commissionId, attempt);
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

    const basePath = resolveArtifactBasePath(commissionId, found.projectName);
    await appendTimelineEntry(
      basePath,
      commissionId,
      "user_note",
      content,
    );
  }

  /**
   * Recovers commissions from persisted state files on daemon startup.
   *
   * Scans ~/.guild-hall/state/commissions/ for .json state files and handles
   * two cases:
   *   1. State file exists, commission was active (dispatched/in_progress):
   *      transition to failed, commit partial work, clean up worktree,
   *      preserve branch.
   *   2. Orphaned worktree (worktree exists with commission naming pattern
   *      but no corresponding state file): commit partial work, transition
   *      to failed via integration worktree, preserve branch.
   *
   * In-process sessions don't survive daemon restarts, so all active
   * commissions are treated as dead on recovery.
   */
  async function recoverCommissions(): Promise<number> {
    const stateDir = path.join(ghHome, "state", "commissions");

    // Track commission IDs with state files for orphan worktree detection
    const stateFileCommissionIds = new Set<string>();

    // -- Scan state files --
    let stateFiles: string[] = [];
    try {
      stateFiles = await fs.readdir(stateDir);
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === "ENOENT") {
        console.log("[commission-recovery] No commissions state directory found, scanning for orphaned worktrees.");
      } else {
        throw err;
      }
    }

    const stateJsonFiles = stateFiles.filter((f) => f.endsWith(".json"));

    for (const file of stateJsonFiles) {
      let state: {
        commissionId: string;
        projectName: string;
        workerName: string;
        status: string;
        worktreeDir?: string;
        branchName?: string;
      };

      try {
        const raw = await fs.readFile(path.join(stateDir, file), "utf-8");
        state = JSON.parse(raw) as typeof state;
      } catch (err: unknown) {
        console.warn(
          `[commission-recovery] Corrupt state file "${file}", skipping:`,
          errorMessage(err),
        );
        continue;
      }

      stateFileCommissionIds.add(state.commissionId);

      // Only recover active commissions (dispatched or in_progress)
      if (state.status !== "dispatched" && state.status !== "in_progress") {
        continue;
      }

      // Verify the project still exists in config
      const project = findProject(state.projectName);
      if (!project) {
        console.warn(
          `[commission-recovery] Commission "${state.commissionId}" references unknown project "${state.projectName}", skipping.`,
        );
        continue;
      }

      // Skip commissions already in the active Map (defensive guard)
      if (activeCommissions.has(state.commissionId)) {
        continue;
      }

      const cId = asCommissionId(state.commissionId);
      const worktreeDir = state.worktreeDir ?? "";
      const branchName = state.branchName ?? "";

      // In-process sessions don't survive daemon restarts. Any commission
      // that was dispatched or in_progress when the daemon stopped is dead.
      console.log(
        `[commission-recovery] Commission "${state.commissionId}" was ${state.status} when daemon stopped, transitioning to failed.`,
      );
      await recoverDeadCommission(cId, state.projectName, worktreeDir, branchName, project.path);
    }

    // -- Scan for orphaned worktrees --
    // An orphaned worktree has a commission naming pattern but no state file.
    for (const project of deps.config.projects) {
      const worktreeRoot = activityWorktreeRoot(ghHome, project.name);
      let entries: string[];
      try {
        entries = await fs.readdir(worktreeRoot);
      } catch (err: unknown) {
        if (isNodeError(err) && err.code === "ENOENT") continue;
        console.warn(
          `[commission-recovery] Failed to scan worktree root for "${project.name}":`,
          errorMessage(err),
        );
        continue;
      }

      for (const entry of entries) {
        // Commission worktrees start with "commission-"
        if (!entry.startsWith("commission-")) continue;

        // The entry name IS the commission ID (commissionWorktreePath uses
        // the raw commissionId which already has the "commission-" prefix).
        const commissionId = entry;

        // Skip if there's a state file (already handled above)
        if (stateFileCommissionIds.has(commissionId)) continue;

        // Skip if already in active Map
        if (activeCommissions.has(commissionId)) continue;

        const orphanWorktreeDir = path.join(worktreeRoot, entry);

        // Verify it's a directory
        try {
          const stat = await fs.stat(orphanWorktreeDir);
          if (!stat.isDirectory()) continue;
        } catch {
          continue;
        }

        console.log(
          `[commission-recovery] Found orphaned worktree "${commissionId}" for project "${project.name}" (no state file), transitioning to failed.`,
        );

        const cId = asCommissionId(commissionId);
        const branchName = commissionBranchName(commissionId);

        await recoverDeadCommission(cId, project.name, orphanWorktreeDir, branchName, project.path, "state lost");
      }
    }

    if (stateJsonFiles.length === 0) {
      console.log("[commission-recovery] No commissions to recover.");
    }

    return 0;
  }

  /**
   * Recovery helper for dead commissions (lost on restart or orphaned worktree).
   * Commits any uncommitted changes in the worktree, transitions the
   * commission to failed in the integration worktree, cleans up the
   * worktree, and preserves the branch.
   */
  async function recoverDeadCommission(
    commissionId: CommissionId,
    projectName: string,
    worktreeDir: string,
    branchName: string,
    projectPath: string,
    reason = "process lost on restart",
  ): Promise<void> {
    const iPath = integrationWorktreePath(ghHome, projectName);

    // Commit any uncommitted changes to preserve partial results
    if (worktreeDir) {
      try {
        const worktreeExists = await fs.access(worktreeDir).then(() => true, () => false);
        if (worktreeExists) {
          const hadChanges = await git.commitAll(
            worktreeDir,
            `Partial work preserved on recovery: ${commissionId}`,
          );
          if (hadChanges) {
            console.log(
              `[commission-recovery] Committed partial results for "${commissionId}" to branch "${branchName}".`,
            );
          } else {
            console.log(
              `[commission-recovery] No uncommitted changes for "${commissionId}".`,
            );
          }
        }
      } catch (err: unknown) {
        console.warn(
          `[commission-recovery] Failed to commit partial results for "${commissionId}":`,
          errorMessage(err),
        );
      }
    }

    // Transition to failed in the integration worktree
    try {
      await updateCommissionStatus(iPath, commissionId, "failed");
      await appendTimelineEntry(
        iPath,
        commissionId,
        "status_failed",
        `Recovery: ${reason}`,
      );
      console.log(
        `[commission-recovery] Transitioned "${commissionId}" to failed in integration worktree.`,
      );
    } catch (err: unknown) {
      console.warn(
        `[commission-recovery] Failed to update integration worktree for "${commissionId}":`,
        errorMessage(err),
      );
    }

    // Remove the activity worktree (branch is preserved)
    if (worktreeDir) {
      try {
        const worktreeExists = await fs.access(worktreeDir).then(() => true, () => false);
        if (worktreeExists) {
          await git.removeWorktree(projectPath, worktreeDir);
          console.log(
            `[commission-recovery] Removed worktree for "${commissionId}".`,
          );
        }
      } catch (err: unknown) {
        console.warn(
          `[commission-recovery] Failed to remove worktree for "${commissionId}":`,
          errorMessage(err),
        );
      }
    }

    // Update state file to reflect the failed status
    try {
      await writeStateFile(commissionId, {
        commissionId: commissionId as string,
        projectName,
        status: "failed",
      });
    } catch (err: unknown) {
      console.warn(
        `[commission-recovery] Failed to update state file for "${commissionId}":`,
        errorMessage(err),
      );
    }

    deps.eventBus.emit({
      type: "commission_status",
      commissionId: commissionId as string,
      status: "failed",
      reason: `Recovery: ${reason}`,
    });
  }

  function getActiveCommissions(): number {
    return activeCommissions.size;
  }

  function shutdown(): void {
    // Abort all active commission sessions
    for (const commission of activeCommissions.values()) {
      commission.abortController.abort();
    }
  }

  return {
    createCommission,
    updateCommission: updateCommissionFn,
    dispatchCommission,
    cancelCommission,
    redispatchCommission,
    addUserNote,
    checkDependencyTransitions,
    recoverCommissions,
    getActiveCommissions,
    shutdown,
  };
}
