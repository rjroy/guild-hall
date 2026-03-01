/**
 * Commission session lifecycle management.
 *
 * Orchestration core: CRUD operations, SDK session runner, queue/auto-dispatch,
 * and dependency transitions. State management is delegated to the
 * ActivityMachine via commission-handlers.ts.
 *
 * Stateless helpers live in sibling modules:
 * - commission-handlers.ts: state machine graph, enter/exit handlers
 * - commission-sdk-logging.ts: SDK message formatting
 * - commission-capacity.ts: concurrent limit checks
 * - commission-recovery.ts: crash recovery on daemon startup
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
import {
  getGuildHallHome,
  integrationWorktreePath as integrationWorktreePathFn,
  commissionWorktreePath as commissionWorktreePathFn,
  commissionBranchName as commissionBranchNameFn,
} from "@/lib/paths";
import { getWorkerByName } from "@/lib/packages";
import { createGitOps, CLAUDE_BRANCH, finalizeActivity, type GitOps } from "@/daemon/lib/git";
import { errorMessage, sanitizeForGitRef, formatTimestamp, escapeYamlValue } from "@/daemon/lib/toolbox-utils";
import { withProjectLock } from "@/daemon/lib/project-lock";
import type { EventBus } from "./event-bus";
import {
  updateCommissionStatus,
  appendTimelineEntry,
  commissionArtifactPath,
  readCommissionStatus,
  readCommissionDependencies,
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
import { isAtCapacity } from "./commission-capacity";
import { recoverCommissions as recoverCommissionsImpl } from "./commission-recovery";
import { ActivityMachine } from "@/daemon/lib/activity-state-machine";
import {
  createCommissionHandlers,
  type ActiveCommissionEntry,
  type CommissionHandlerDeps,
} from "./commission-handlers";

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

  /**
   * Serialization lock for auto-dispatch. When two commissions complete
   * simultaneously, both call tryAutoDispatch. Without serialization,
   * both could scan the same pending commission and attempt to dispatch
   * it. The promise chain ensures only one auto-dispatch runs at a time.
   */
  let autoDispatchChain: Promise<void> = Promise.resolve();

  // -- Helpers (needed before machine construction) --

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

  async function deleteStateFile(
    commissionId: CommissionId,
  ): Promise<void> {
    await fs.unlink(commissionStatePath(commissionId)).catch(() => {});
  }

  /**
   * Syncs a terminal status back to the integration worktree so that the
   * artifact is findable (and has the correct status) after the activity
   * worktree is cleaned up.
   */
  async function syncStatusToIntegration(
    entry: ActiveCommissionEntry,
    status: CommissionStatus,
    reason: string,
  ): Promise<void> {
    const iPath = integrationWorktreePathFn(ghHome, entry.projectName);
    try {
      await updateCommissionStatus(iPath, entry.commissionId, status);
      await appendTimelineEntry(
        iPath,
        entry.commissionId,
        `status_${status}`,
        reason,
      );
    } catch (err: unknown) {
      console.warn(
        `[commission-session] Failed to sync status "${status}" to integration worktree for ${entry.commissionId as string}:`,
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

  // -- Build the ActivityMachine --

  // Late-bound reference for transitionFn (machine created below). Must be
  // `let` because the value is assigned after the machine is created, but the
  // closure in handlerDeps captures the variable at declaration time.
  // eslint-disable-next-line prefer-const
  let machineTransitionFn: CommissionHandlerDeps["transitionFn"];

  const handlerDeps: CommissionHandlerDeps = {
    eventBus: deps.eventBus,
    git,
    writeStateFile,
    deleteStateFile,
    syncStatusToIntegration,
    transitionFn: async (id, from, to, reason) => {
      if (machineTransitionFn) {
        await machineTransitionFn(id, from, to, reason);
      }
    },
    finalizeActivity: async (opts) => {
      const iPath = integrationWorktreePathFn(ghHome, opts.projectName);
      const project = findProject(opts.projectName);
      if (!project) {
        console.warn(`[commission] finalizeActivity: project "${opts.projectName}" not found`);
        return { merged: false, preserved: false };
      }
      return finalizeActivity(git, {
        activityId: opts.activityId,
        worktreeDir: opts.worktreeDir,
        branchName: opts.branchName,
        projectPath: project.path,
        integrationPath: iPath,
        commitMessage: `Commission completed: ${opts.activityId}`,
        logPrefix: "commission",
        commitLabel: "Commission",
        lockFn: (fn) => withProjectLock(opts.projectName, fn),
      });
    },
    createMeetingRequest: deps.createMeetingRequestFn,
    managerPackageName: MANAGER_PACKAGE_NAME,
    findProjectPath: (name) => findProject(name)?.path,
    fileExists,
    integrationWorktreePath: (name) => integrationWorktreePathFn(ghHome, name),
    commissionWorktreePath: (name, id) => commissionWorktreePathFn(ghHome, name, id),
    commissionBranchName: (id, attempt) => commissionBranchNameFn(id, attempt),
    claudeBranch: CLAUDE_BRANCH,
    preserveAndCleanupWorktree,
    checkDependencyTransitions,
    enqueueAutoDispatch,
  };

  const handlersConfig = createCommissionHandlers(handlerDeps);

  // Create the artifact ops with a lookup that reads from the machine's state tracker.
  // The machine is created below; we use a lazy reference to avoid circular init.
  let machineRef: ActivityMachine<CommissionStatus, CommissionId, ActiveCommissionEntry> | null = null;

  const artifactOps = handlersConfig.createArtifactOps((id) => {
    if (!machineRef) return undefined;
    // Check active map first, then fall back to state tracker entry
    const active = machineRef.get(id);
    if (active) return active;
    // For non-active entries, we need the entry from the tracker.
    // The machine exposes getState but not getEntry directly.
    // We'll store a parallel lookup for tracked entries.
    return trackedEntries.get(id);
  });

  // Parallel lookup for all tracked entries (active and inactive).
  // Populated when entries are injected/registered into the machine.
  const trackedEntries = new Map<CommissionId, ActiveCommissionEntry>();

  const machine = new ActivityMachine<CommissionStatus, CommissionId, ActiveCommissionEntry>({
    activityType: "commission",
    transitions: handlersConfig.transitions,
    cleanupStates: handlersConfig.cleanupStates,
    activeStates: handlersConfig.activeStates,
    handlers: handlersConfig.handlers,
    artifactOps,
    extractProjectName: (entry) => entry.projectName,
  });
  machineRef = machine;

  // Wire the late-bound transition function for re-entrant transitions
  machineTransitionFn = async (id, from, to, reason) => {
    await machine.transition(id, from, to, reason);
  };

  // Register cleanup hooks
  machine.onCleanup(async (event) => {
    // Clean up tracking state for terminal commissions to prevent
    // unbounded growth of trackedEntries and machine's stateTracker.
    const cId = asCommissionId(event.activityId);
    trackedEntries.delete(cId);
    machine.forget(cId);

    enqueueAutoDispatch();
    if (event.mergeSucceeded) {
      await checkDependencyTransitions(event.projectName);
    }
  });

  // -- Queue and auto-dispatch --

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
      const iPath = integrationWorktreePathFn(ghHome, project.name);
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
        if (machine.has(cId)) continue;

        try {
          const artifactPath = commissionArtifactPath(iPath, cId);
          const raw = await fs.readFile(artifactPath, "utf-8");
          const statusMatch = raw.match(/^status: (\S+)$/m);
          if (!statusMatch || statusMatch[1] !== "pending") continue;

          const { data } = matter(raw);
          const firstEntry = (data.activity_timeline as Array<{ timestamp: unknown }> | undefined)?.[0];
          const rawTs = firstEntry?.timestamp;
          const createdAt =
            rawTs instanceof Date
              ? rawTs.toISOString()
              : typeof rawTs === "string"
                ? rawTs
                : "9999-12-31T23:59:59.999Z";

          pending.push({ commissionId: cId, projectName: project.name, createdAt });
        } catch {
          continue;
        }
      }
    }

    pending.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return pending;
  }

  /**
   * Attempts to auto-dispatch pending commissions when capacity opens up.
   */
  async function tryAutoDispatch(): Promise<void> {
    const pending = await scanPendingCommissions();
    if (pending.length === 0) return;

    // Build a ReadonlyMap view for isAtCapacity (it expects Map<string, { projectName }>).
    // isAtCapacity iterates all map values to count per-project active commissions.
    const activeMap = new Map<string, { projectName: string }>();
    for (const [id, entry] of trackedEntries) {
      if (machine.has(id)) {
        activeMap.set(id as string, { projectName: entry.projectName });
      }
    }

    for (const candidate of pending) {
      const { atLimit } = isAtCapacity(candidate.projectName, activeMap, deps.config);
      if (atLimit) continue;

      try {
        console.log(
          `[commission] auto-dispatching "${candidate.commissionId as string}" from queue (FIFO)`,
        );
        deps.eventBus.emit({
          type: "commission_dequeued",
          commissionId: candidate.commissionId as string,
          reason: "Capacity available, dispatching from queue",
        });
        await dispatchCommission(candidate.commissionId);
        // Re-build activeMap after successful dispatch
        for (const [id, entry] of trackedEntries) {
          if (machine.has(id)) {
            activeMap.set(id as string, { projectName: entry.projectName });
          }
        }
      } catch (err: unknown) {
        console.warn(
          `[commission] auto-dispatch failed for "${candidate.commissionId as string}":`,
          errorMessage(err),
        );
      }
    }
  }

  // -- Dependency auto-transitions --

  /**
   * Checks dependency satisfaction for blocked and pending commissions in a
   * project and transitions them accordingly:
   *   - blocked -> pending: all dependency artifact paths exist
   *   - pending -> blocked: at least one dependency artifact path is missing
   *
   * These commissions are not in the machine's active Map (they're pending
   * or blocked), so we use the integration worktree for artifact reads.
   * The transition is done via the legacy helpers (updateCommissionStatus +
   * appendTimelineEntry) because these commissions are not tracked by the
   * machine (they haven't been dispatched yet).
   */
  async function checkDependencyTransitions(projectName: string): Promise<void> {
    const iPath = integrationWorktreePathFn(ghHome, projectName);
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
      if (machine.has(cId)) continue;

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

      if (dependencies.length === 0) continue;

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
        try {
          await updateCommissionStatus(iPath, cId, "pending");
          await appendTimelineEntry(
            iPath,
            cId,
            "status_pending",
            "All dependency artifacts now exist",
            { from: "blocked", to: "pending" },
          );
          deps.eventBus.emit({
            type: "commission_status",
            commissionId: cId as string,
            status: "pending",
            reason: "All dependency artifacts now exist",
          });
          anyUnblocked = true;
          console.log(
            `[commission] dependency auto-transition: "${cId as string}" blocked -> pending (all deps satisfied)`,
          );
        } catch (err: unknown) {
          console.warn(
            `[commission] Failed to auto-transition "${cId as string}" blocked -> pending:`,
            errorMessage(err),
          );
        }
      } else if (status === "pending" && !allSatisfied) {
        try {
          await updateCommissionStatus(iPath, cId, "blocked");
          await appendTimelineEntry(
            iPath,
            cId,
            "status_blocked",
            "Dependency artifact missing",
            { from: "pending", to: "blocked" },
          );
          deps.eventBus.emit({
            type: "commission_status",
            commissionId: cId as string,
            status: "blocked",
            reason: "Dependency artifact missing",
          });
          console.log(
            `[commission] dependency auto-transition: "${cId as string}" pending -> blocked (missing dep)`,
          );
        } catch (err: unknown) {
          console.warn(
            `[commission] Failed to auto-transition "${cId as string}" pending -> blocked:`,
            errorMessage(err),
          );
        }
      }
    }

    if (anyUnblocked) {
      enqueueAutoDispatch();
    }
  }

  // -- More helpers --

  /**
   * Counts the number of previous dispatch attempts by scanning the
   * integration worktree's timeline for terminal status entries.
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
   * Finds the project for a commission by searching integration worktrees.
   */
  async function findProjectPathForCommission(
    commissionId: CommissionId,
  ): Promise<{ projectPath: string; projectName: string; integrationPath: string } | null> {
    for (const project of deps.config.projects) {
      const iPath = integrationWorktreePathFn(ghHome, project.name);
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
   */
  function resolveArtifactBasePath(commissionId: CommissionId, projectName: string): string {
    if (machine.has(commissionId)) {
      const entry = machine.get(commissionId);
      if (entry?.worktreeDir) {
        return entry.worktreeDir;
      }
    }
    return integrationWorktreePathFn(ghHome, projectName);
  }

  // -- In-process SDK session runner --

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
    entry: ActiveCommissionEntry,
    abortController: AbortController,
    projectPath: string,
    prompt: string,
    commissionDeps: string[],
    resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number },
  ): Promise<boolean> {
    const log = (msg: string) =>
      console.log(`[commission-session] [${commissionId as string}] ${msg}`);
    const logErr = (msg: string) =>
      console.error(`[commission-session] [${commissionId as string}] ${msg}`);

    if (!deps.queryFn) {
      logErr("no queryFn provided, cannot run in-process session");
      return false;
    }

    // 1. Find the worker package
    const workerPkg = deps.packages.find((p) => {
      if (!("identity" in p.metadata)) return false;
      return p.metadata.identity.name === entry.workerName;
    });
    if (!workerPkg) {
      logErr(`worker package for "${entry.workerName}" not found`);
      return false;
    }
    const workerMeta = workerPkg.metadata as WorkerMetadata;
    const isManager = workerPkg.name === MANAGER_PACKAGE_NAME;

    // 2. Subscribe to EventBus for this commission's tool events
    log("resolving tools...");

    const unsubscribe = deps.eventBus.subscribe((event) => {
      if (!("commissionId" in event) || event.commissionId !== (commissionId as string)) return;

      if (event.type === "commission_result") {
        entry.lastActivity = new Date();
        entry.resultSubmitted = true;
        entry.resultSummary = event.summary;
        entry.resultArtifacts = event.artifacts;
        log(`result submitted: ${event.summary.slice(0, 120)}${event.artifacts?.length ? ` (${event.artifacts.length} artifacts)` : ""}`);
      } else if (event.type === "commission_progress") {
        entry.lastActivity = new Date();
        log(`progress: ${event.summary.slice(0, 120)}`);
      } else if (event.type === "commission_question") {
        entry.lastActivity = new Date();
        log(`question: ${event.question.slice(0, 120)}`);
      }
    });

    const resolve = deps.resolveToolSetFn ?? resolveToolSet;
    const resolvedTools = await resolve(workerMeta, deps.packages, {
      projectName: entry.projectName,
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
    const project = findProject(entry.projectName);
    let injectedMemory = "";
    let needsCompaction = false;
    try {
      const memoryResult = await loadMemories(
        workerMeta.identity.name,
        entry.projectName,
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
    const activationContext: ActivationContext = {
      posture: workerMeta.posture,
      injectedMemory,
      resolvedTools,
      resourceDefaults: {
        maxTurns: workerMeta.resourceDefaults?.maxTurns,
        maxBudgetUsd: workerMeta.resourceDefaults?.maxBudgetUsd,
      },
      commissionContext: {
        commissionId: commissionId as string,
        prompt,
        dependencies: commissionDeps,
      },
      projectPath,
      workingDirectory: entry.worktreeDir!,
    };

    // Inject manager context if this is the Guild Master
    if (isManager) {
      try {
        activationContext.managerContext = await buildManagerContext({
          packages: deps.packages,
          projectName: entry.projectName,
          integrationPath: integrationWorktreePathFn(ghHome, entry.projectName),
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
      activation = await activateWorkerShared(workerPkg, activationContext, deps.activateFn);
    } catch (err: unknown) {
      logErr(`worker activation failed: ${errorMessage(err)}`);
      return false;
    }
    log(`worker activated. systemPrompt length=${activation.systemPrompt.length}`);

    // 6. Build SDK query options
    const maxTurns =
      resourceOverrides?.maxTurns ??
      activation.resourceBounds.maxTurns;
    const maxBudgetUsd =
      resourceOverrides?.maxBudgetUsd ??
      activation.resourceBounds.maxBudgetUsd;

    const mcpServers: Record<string, unknown> = {};
    for (const server of activation.tools.mcpServers) {
      mcpServers[server.name] = server;
    }

    const options: Record<string, unknown> = {
      systemPrompt: { type: "preset", preset: "claude_code", append: activation.systemPrompt },
      cwd: entry.worktreeDir,
      mcpServers,
      allowedTools: activation.tools.allowedTools,
      ...(activation.model ? { model: activation.model } : {}),
      ...(maxTurns ? { maxTurns } : {}),
      ...(maxBudgetUsd ? { maxBudgetUsd } : {}),
      permissionMode: "dontAsk",
      settingSources: ["local", "project", "user"] as string[],
      includePartialMessages: false,
      ...(abortController ? { abortController } : {}),
    };
    const maxTurnsLog = typeof options.maxTurns === "number" ? options.maxTurns : "unset";
    log(`SDK options: maxTurns=${maxTurnsLog}, cwd="${String(options.cwd)}"`);

    // 7. Fire-and-forget memory compaction
    if (needsCompaction) {
      log(`triggering memory compaction for "${workerMeta.identity.name}"`);
      void triggerCompaction(
        workerMeta.identity.name,
        entry.projectName,
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
          entry.lastActivity = new Date();
          logSdkMessage(log, messageCount, msg);

          const m = msg as Record<string, unknown>;
          if (m.type === "system" && m.subtype === "init" && typeof m.session_id === "string") {
            sessionId = m.session_id;
            log(`captured session_id: ${sessionId}`);
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          log(`SDK session aborted after ${messageCount} message(s)`);
          return entry.resultSubmitted;
        }
        logErr(`SDK session error after ${messageCount} message(s): ${errorMessage(err)}`);
        return entry.resultSubmitted;
      }
      log(`SDK session complete. ${messageCount} message(s) consumed.`);

      // 9. Check if result was submitted
      if (entry.resultSubmitted) {
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
          entry.lastActivity = new Date();
          logSdkMessage(log, followUpCount, msg);
        }
      } catch (err: unknown) {
        logErr(`follow-up session error: ${errorMessage(err)}`);
      }
      log(`follow-up session complete. ${followUpCount} message(s) consumed.`);

      if (!entry.resultSubmitted) {
        logErr("follow-up session also failed to call submit_result");
      }
      return entry.resultSubmitted;
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
    const iPath = integrationWorktreePathFn(ghHome, projectName);
    const commissionsDir = path.join(iPath, ".lore", "commissions");
    await fs.mkdir(commissionsDir, { recursive: true });

    // 5. Write the commission artifact
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const isoStr = now.toISOString();

    const escapedTitle = escapeYamlValue(title);
    const escapedPrompt = escapeYamlValue(prompt);
    const escapedDisplayTitle = escapeYamlValue(workerMeta.identity.displayTitle);

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
      `[commission] created "${commissionId as string}" for project "${projectName}" (worker: ${workerName})`,
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
    const found = await findProjectPathForCommission(commissionId);
    if (!found) {
      throw new Error(
        `Commission "${commissionId as string}" not found in any project`,
      );
    }

    const basePath = resolveArtifactBasePath(commissionId, found.projectName);
    const status = await readCommissionStatus(basePath, commissionId);
    if (status === null) {
      throw new Error(
        `Cannot read status from commission "${commissionId as string}" artifact. The file may be corrupted.`,
      );
    }
    if (status !== "pending") {
      throw new Error(
        `Cannot update commission "${commissionId as string}": status is "${status}", must be "pending"`,
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
        `Commission "${commissionId as string}" not found in any project`,
      );
    }

    // 2. Verify status is pending (artifact is in integration worktree)
    const currentStatus = await readCommissionStatus(
      found.integrationPath,
      commissionId,
    );
    if (currentStatus === null) {
      throw new Error(
        `Cannot read status from commission "${commissionId as string}" artifact. The file may be corrupted.`,
      );
    }
    if (currentStatus !== "pending") {
      throw new Error(
        `Cannot dispatch commission "${commissionId as string}": status is "${currentStatus}", must be "pending"`,
      );
    }

    // 3. Check capacity limits before starting session
    // Build activeMap for capacity check
    const activeMap = new Map<string, { projectName: string }>();
    for (const [id, entry] of trackedEntries) {
      if (machine.has(id)) {
        activeMap.set(id as string, { projectName: entry.projectName });
      }
    }
    const capacityCheck = isAtCapacity(found.projectName, activeMap, deps.config);
    if (capacityCheck.atLimit) {
      console.log(
        `[commission] queuing "${commissionId as string}": ${capacityCheck.reason}`,
      );
      deps.eventBus.emit({
        type: "commission_queued",
        commissionId: commissionId as string,
        reason: capacityCheck.reason,
      });
      return { status: "queued" };
    }

    // 4. Read the artifact to get prompt, worker, dependencies, resource overrides
    //    (before dispatching, so we have the data for the entry)
    const artifactPath = commissionArtifactPath(
      found.integrationPath,
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

    // Determine if worker uses sparse checkout
    const workerPkg = deps.packages.find((p) => {
      if (!("identity" in p.metadata)) return false;
      return p.metadata.identity.name === workerName;
    });
    const checkoutScope = workerPkg && "checkoutScope" in workerPkg.metadata
      ? (workerPkg.metadata as { checkoutScope: string }).checkoutScope
      : undefined;

    // 5. Create the entry and inject into the machine at "pending"
    const now = new Date();
    const entry: ActiveCommissionEntry = {
      commissionId,
      projectName: found.projectName,
      workerName,
      startTime: now,
      lastActivity: now,
      status: "pending",
      resultSubmitted: false,
      attempt,
      checkoutScope,
    };
    trackedEntries.set(commissionId, entry);

    // Register at pending (no handler execution, just tracking)
    machine.register(commissionId, entry, "pending");

    // 6. Transition pending -> dispatched (enter handler does git setup)
    const dispatchResult = await machine.transition(
      commissionId,
      "pending",
      "dispatched",
      "Commission dispatched to worker",
    );

    if (dispatchResult.outcome === "skipped") {
      trackedEntries.delete(commissionId);
      machine.forget(commissionId);
      throw new Error(
        `Failed to dispatch "${commissionId as string}": ${dispatchResult.reason}`,
      );
    }

    // 7. Transition dispatched -> in_progress (enter handler emits event)
    const progressResult = await machine.transition(
      commissionId,
      "dispatched",
      "in_progress",
      "Commission session started",
    );

    if (progressResult.outcome === "skipped") {
      console.error(
        `[commission] dispatched -> in_progress skipped for "${commissionId as string}": ${progressResult.reason}`,
      );
      await machine.transition(commissionId, "dispatched", "failed", `Failed to enter in_progress: ${progressResult.reason}`);
      return { status: "accepted" };
    }

    // 8. Create AbortController and set on entry
    const abortController = new AbortController();
    entry.abortController = abortController;

    console.log(
      `[commission] dispatching "${commissionId as string}" -> worker="${workerName}" (in-process)`,
    );

    // 9. Fire-and-forget: run the SDK session in-process
    void runCommissionSession(
      commissionId,
      entry,
      abortController,
      found.projectPath,
      prompt,
      commissionDeps,
      Object.keys(resourceOverrides).length > 0 ? resourceOverrides : undefined,
    ).then(async (resultSubmitted) => {
      await handleCompletion(commissionId, entry, resultSubmitted);
    }).catch(async (err: unknown) => {
      try {
        await handleError(commissionId, entry, err);
      } catch (innerErr: unknown) {
        console.error(
          `[commission-session] handleError itself failed for ${commissionId as string}:`,
          errorMessage(innerErr),
        );
      }
    });

    return { status: "accepted" };
  }

  /**
   * Handles a commission session that returned normally. If resultSubmitted
   * is true, transitions to completed with squash-merge. If false,
   * transitions to failed.
   */
  async function handleCompletion(
    commissionId: CommissionId,
    entry: ActiveCommissionEntry,
    resultSubmitted: boolean,
  ): Promise<void> {
    // If no longer tracked or already in a non-active state, skip
    const currentState = machine.getState(commissionId);
    if (!currentState || !machine.has(commissionId)) {
      return;
    }

    // No result submitted: transition to failed
    if (!resultSubmitted) {
      console.log(`[commission] "${commissionId as string}" failed (session completed without submitting result)`);
      await machine.transition(
        commissionId,
        "in_progress",
        "failed",
        "Session completed without submitting result",
      );
      return;
    }

    // Result submitted: transition to completed. The enter-completed handler
    // performs the squash-merge. If the merge fails, it calls transitionFn to
    // do a re-entrant completed -> failed transition internally.
    console.log(`[commission] "${commissionId as string}" completed (result submitted)`);
    await machine.transition(
      commissionId,
      "in_progress",
      "completed",
      "Worker completed successfully",
    );
  }

  /**
   * Handles a commission session that threw an error.
   */
  async function handleError(
    commissionId: CommissionId,
    entry: ActiveCommissionEntry,
    error: unknown,
  ): Promise<void> {
    const currentState = machine.getState(commissionId);
    if (!currentState || !machine.has(commissionId)) {
      return;
    }

    const isAbort = error instanceof Error && error.name === "AbortError";

    if (isAbort) {
      console.log(`[commission] "${commissionId as string}" session aborted`);
      return;
    }

    // Non-abort error. Check if a result was submitted before the error.
    if (entry.resultSubmitted) {
      console.warn(
        `[commission] "${commissionId as string}" session errored but result was submitted, treating as completed`,
      );
      await handleCompletion(commissionId, entry, true);
      return;
    }

    const reason = error instanceof Error
      ? `Session error: ${error.message}`
      : `Session error: ${String(error)}`;

    console.error(`[commission] "${commissionId as string}" ${reason}`);
    await machine.transition(
      commissionId,
      "in_progress",
      "failed",
      reason,
    );
  }

  async function cancelCommission(
    commissionId: CommissionId,
    reason = "Commission cancelled by user",
  ): Promise<void> {
    if (!machine.has(commissionId)) {
      throw new Error(
        `Commission "${commissionId as string}" not found in active commissions`,
      );
    }

    console.log(`[commission] cancelling "${commissionId as string}" via abort`);

    // Transition in_progress -> cancelled. The exit-in_progress handler
    // aborts the SDK session, and enter-cancelled preserves work.
    const currentState = machine.getState(commissionId);
    if (currentState !== "in_progress" && currentState !== "dispatched") {
      throw new Error(
        `Cannot cancel commission "${commissionId as string}": current state is "${currentState}"`,
      );
    }

    await machine.transition(
      commissionId,
      currentState,
      "cancelled",
      reason,
    );
  }

  async function redispatchCommission(
    commissionId: CommissionId,
  ): Promise<{ status: "accepted" | "queued" }> {
    // 1. Find the project
    const found = await findProjectPathForCommission(commissionId);
    if (!found) {
      throw new Error(
        `Commission "${commissionId as string}" not found in any project`,
      );
    }

    // 2. Verify status is failed or cancelled (artifact is in integration worktree)
    const currentStatus = await readCommissionStatus(
      found.integrationPath,
      commissionId,
    );
    if (currentStatus === null) {
      throw new Error(
        `Cannot read status from commission "${commissionId as string}" artifact. The file may be corrupted.`,
      );
    }
    if (currentStatus !== "failed" && currentStatus !== "cancelled") {
      throw new Error(
        `Cannot redispatch commission "${commissionId as string}": status is "${currentStatus}", must be "failed" or "cancelled"`,
      );
    }

    // 3. Count previous dispatch attempts
    const previousDispatches = await getDispatchAttempt(
      found.integrationPath,
      commissionId,
    );
    const attempt = previousDispatches + 1;

    console.log(
      `[commission] redispatching "${commissionId as string}" (was ${currentStatus}, attempt ${attempt})`,
    );

    // 4. If the commission is tracked by the machine (from a previous dispatch),
    //    transition it back to pending. Otherwise do a direct status update.
    if (machine.isTracked(commissionId)) {
      // Use machine transition: failed/cancelled -> pending
      await machine.transition(
        commissionId,
        currentStatus,
        "pending",
        "Commission reset for redispatch",
      );
      machine.forget(commissionId);
      trackedEntries.delete(commissionId);
    } else {
      // Direct status update for commissions not tracked by the machine
      await updateCommissionStatus(found.integrationPath, commissionId, "pending");
      await appendTimelineEntry(
        found.integrationPath,
        commissionId,
        "status_pending",
        "Commission reset for redispatch",
        { from: currentStatus, to: "pending" },
      );
    }

    // 5. Dispatch with the attempt number
    return dispatchCommission(commissionId, attempt);
  }

  async function addUserNote(
    commissionId: CommissionId,
    content: string,
  ): Promise<void> {
    const found = await findProjectPathForCommission(commissionId);
    if (!found) {
      throw new Error(
        `Commission "${commissionId as string}" not found in any project`,
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

  async function recoverCommissions(): Promise<number> {
    return recoverCommissionsImpl({
      ghHome,
      config: deps.config,
      machine,
      trackedEntries,
    });
  }

  function getActiveCommissions(): number {
    return machine.activeCount;
  }

  function shutdown(): void {
    // Abort all active commission sessions
    for (const [id] of trackedEntries) {
      if (machine.has(id)) {
        const entry = machine.get(id);
        if (entry?.abortController) {
          entry.abortController.abort();
        }
      }
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
