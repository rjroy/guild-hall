/**
 * Commission state machine handlers and transition graph configuration.
 *
 * Defines the commission-specific graph, active/cleanup state sets, and
 * handler implementations for each enter/exit state. Handlers close over
 * deps from the factory, matching the pattern used by the ActivityMachine.
 *
 * Transition graph:
 *   pending     -> dispatched, blocked, cancelled, abandoned
 *   blocked     -> pending, cancelled, abandoned
 *   dispatched  -> in_progress, failed, cancelled
 *   in_progress -> completed, failed, cancelled
 *   completed   -> failed
 *   failed      -> pending, abandoned
 *   cancelled   -> pending, abandoned
 *   abandoned   -> (terminal, no outgoing edges)
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CommissionId, CommissionStatus } from "@/daemon/types";
import type {
  TransitionContext,
  EnterHandler,
  ExitHandler,
  ArtifactOps,
} from "@/daemon/lib/activity-state-machine";
import type { EventBus } from "./event-bus";
import type { GitOps } from "@/daemon/lib/git";
import {
  updateCommissionStatus,
  appendTimelineEntry,
  updateResultSummary,
} from "./commission-artifact-helpers";
import { errorMessage } from "@/daemon/lib/toolbox-utils";

// -- Type alias --

export type CommissionTransitionContext = TransitionContext<
  CommissionId,
  CommissionStatus,
  ActiveCommissionEntry
>;

/**
 * The entry type stored in the ActivityMachine's active Map and state tracker.
 * Fields that are populated by handlers during dispatch/in_progress are optional
 * (they start undefined and are set by the dispatched enter handler).
 */
export type ActiveCommissionEntry = {
  commissionId: CommissionId;
  projectName: string;
  workerName: string;
  startTime: Date;
  lastActivity: Date;
  status: CommissionStatus;
  resultSubmitted: boolean;
  resultSummary?: string;
  resultArtifacts?: string[];
  worktreeDir?: string;
  branchName?: string;
  abortController?: AbortController;
  /** Branch name attempt suffix for redispatch (e.g., 2 -> "commission-xxx-2"). */
  attempt?: number;
  /** Worker checkout scope. When "sparse", enter-dispatched configures sparse checkout. */
  checkoutScope?: string;
};

// -- Transition graph --

export const COMMISSION_TRANSITIONS: Record<CommissionStatus, CommissionStatus[]> = {
  pending: ["dispatched", "blocked", "cancelled", "abandoned"],
  blocked: ["pending", "cancelled", "abandoned"],
  dispatched: ["in_progress", "failed", "cancelled"],
  in_progress: ["completed", "failed", "cancelled"],
  completed: ["failed"],
  failed: ["pending", "abandoned"],
  cancelled: ["pending", "abandoned"],
  abandoned: [],
};

// -- Configuration constants --

export const COMMISSION_ACTIVE_STATES: CommissionStatus[] = ["dispatched", "in_progress"];
export const COMMISSION_CLEANUP_STATES: CommissionStatus[] = ["completed", "failed", "cancelled", "abandoned"];

// -- Handler dependency types --

export interface CommissionHandlerDeps {
  eventBus: Pick<EventBus, "emit">;
  git: GitOps;
  /** Writes a machine-local state file for crash recovery. */
  writeStateFile: (id: CommissionId, data: Record<string, unknown>) => Promise<void>;
  /** Deletes the machine-local state file. */
  deleteStateFile: (id: CommissionId) => Promise<void>;
  /** Syncs a terminal status back to the integration worktree artifact. */
  syncStatusToIntegration: (
    entry: ActiveCommissionEntry,
    status: CommissionStatus,
    reason: string,
  ) => Promise<void>;
  /** Squash-merges the activity branch into claude/main under a project lock. */
  finalizeActivity: (opts: {
    activityId: string;
    worktreeDir: string;
    branchName: string;
    projectName: string;
  }) => Promise<{ merged: boolean; preserved: boolean }>;
  /** Creates a Guild Master meeting request for merge conflict escalation. */
  createMeetingRequest?: (params: {
    projectName: string;
    workerName: string;
    reason: string;
  }) => Promise<void>;
  /** The manager worker package name for escalation. */
  managerPackageName: string;
  /** Resolves the project's real path from config. Returns undefined if not found. */
  findProjectPath: (projectName: string) => string | undefined;
  /** Checks whether a file exists on disk. */
  fileExists: (filePath: string) => Promise<boolean>;
  /** Resolves the integration worktree path for a project. */
  integrationWorktreePath: (projectName: string) => string;
  /** Resolves the commission worktree path for an activity. */
  commissionWorktreePath: (projectName: string, commissionId: string) => string;
  /** Resolves the commission branch name, optionally with an attempt suffix. */
  commissionBranchName: (commissionId: string, attempt?: number) => string;
  /** The claude/main branch name constant. */
  claudeBranch: string;
  /** Preserves uncommitted work and removes the worktree (branch kept). */
  preserveAndCleanupWorktree: (
    id: string,
    worktreeDir: string,
    branchName: string,
    commitMessage: string,
    projectPath?: string,
  ) => Promise<void>;
  /** Checks dependency satisfaction and triggers auto-dispatch. */
  checkDependencyTransitions: (projectName: string) => Promise<void>;
  /** Enqueues an auto-dispatch attempt for the FIFO queue. */
  enqueueAutoDispatch: () => void;
  /**
   * Re-entrant transition function. Used by enter-completed to trigger
   * completed -> failed when a squash-merge fails. The machine releases
   * the lock before running enter handlers, making this safe.
   */
  transitionFn?: (
    id: CommissionId,
    from: CommissionStatus,
    to: CommissionStatus,
    reason: string,
  ) => Promise<void>;
}

// -- Handler implementations --

/**
 * Exit handler for the "in_progress" state.
 *
 * Signals the running SDK session to stop via the AbortController. This
 * ensures the agent process terminates before the enter handler for the
 * target state runs cleanup (worktree removal, branch preservation, etc.).
 */
export function createExitInProgress(
  _deps: CommissionHandlerDeps,
): ExitHandler<CommissionId, CommissionStatus, ActiveCommissionEntry> {
  // ExitHandler contract requires Promise<void>; abort() is synchronous.
  // eslint-disable-next-line @typescript-eslint/require-await
  return async (ctx: CommissionTransitionContext): Promise<void> => {
    if (ctx.entry.abortController) {
      ctx.entry.abortController.abort();
    }
  };
}

/**
 * Enter handler for the "dispatched" state.
 *
 * Sets up the commission's git infrastructure:
 * 1. Commits the pending artifact to the integration worktree so the
 *    activity branch (forked from claude/main) includes it.
 * 2. Creates the activity branch from claude/main.
 * 3. Creates the activity worktree.
 * 4. Configures sparse checkout if the worker uses it.
 * 5. Writes the machine-local state file.
 * 6. Populates the entry's worktreeDir and branchName fields.
 *
 * Note: git ops use cleanGitEnv() internally (Phase 5 retro lesson).
 */
export function createEnterDispatched(
  deps: CommissionHandlerDeps,
): EnterHandler<CommissionId, CommissionStatus, ActiveCommissionEntry> {
  return async (ctx: CommissionTransitionContext) => {
    const { entry, id } = ctx;
    const integrationPath = deps.integrationWorktreePath(entry.projectName);
    const projectPath = deps.findProjectPath(entry.projectName);
    if (!projectPath) {
      throw new Error(`Project "${entry.projectName}" not found in config`);
    }

    // 1. Commit pending artifact to integration worktree
    await deps.git.commitAll(integrationPath, `Add commission: ${id as string}`);

    // 2. Resolve branch name (supports attempt suffixes for redispatch)
    const branchName = deps.commissionBranchName(id as string, entry.attempt);
    const worktreeDir = deps.commissionWorktreePath(entry.projectName, id as string);

    // 3. Create activity branch from claude/main
    await deps.git.createBranch(projectPath, branchName, deps.claudeBranch);
    // Ensure parent directory exists (git createWorktree needs the target to NOT exist)
    await fs.mkdir(path.dirname(worktreeDir), { recursive: true });
    await deps.git.createWorktree(projectPath, worktreeDir, branchName);

    // 4. Configure sparse checkout if the worker uses it
    if (entry.checkoutScope === "sparse") {
      await deps.git.configureSparseCheckout(worktreeDir, [".lore/"]);
    }

    // 5. Write state file
    await deps.writeStateFile(id, {
      commissionId: id as string,
      projectName: entry.projectName,
      workerName: entry.workerName,
      status: "dispatched",
      worktreeDir,
      branchName,
    });

    // 6. Populate entry fields
    entry.worktreeDir = worktreeDir;
    entry.branchName = branchName;

    console.log(
      `[commission] dispatched "${id as string}": branch="${branchName}", worktree="${worktreeDir}"`,
    );

    return undefined;
  };
}

/**
 * Enter handler for the "in_progress" state.
 *
 * Emits the commission_status event. The SDK session launch is handled
 * externally by commission-session.ts (it needs the full session deps
 * that handlers don't have access to). The session code fires the SDK
 * session after this handler returns.
 */
export function createEnterInProgress(
  deps: CommissionHandlerDeps,
): EnterHandler<CommissionId, CommissionStatus, ActiveCommissionEntry> {
  // EnterHandler contract requires Promise; all operations here are synchronous.
  // eslint-disable-next-line @typescript-eslint/require-await
  return async (ctx: CommissionTransitionContext) => {
    ctx.entry.status = "in_progress";

    deps.eventBus.emit({
      type: "commission_status",
      commissionId: ctx.id as string,
      status: "in_progress",
      reason: ctx.reason,
    });

    console.log(
      `[commission] "${ctx.id as string}" in_progress: session starting`,
    );

    return undefined;
  };
}

/**
 * Enter handler for the "completed" state.
 *
 * Handles the squash-merge of the activity branch into claude/main:
 * 1. Updates result summary in the artifact.
 * 2. Calls finalizeActivity to squash-merge under the project lock.
 * 3. On success: emits event, syncs status, cleans up state file,
 *    returns { mergeSucceeded: true }.
 * 4. On merge conflict (non-.lore/ files): escalates via meeting request,
 *    returns { mergeSucceeded: false }. The cleanup hook and
 *    commission-session.ts handle the transition to failed.
 */
export function createEnterCompleted(
  deps: CommissionHandlerDeps,
): EnterHandler<CommissionId, CommissionStatus, ActiveCommissionEntry> {
  return async (ctx: CommissionTransitionContext) => {
    const { entry, id, reason } = ctx;
    entry.status = "completed";

    // 1. Update result summary in artifact
    if (entry.resultSummary && entry.worktreeDir) {
      try {
        await updateResultSummary(
          entry.worktreeDir,
          id,
          entry.resultSummary,
          entry.resultArtifacts,
        );
      } catch (err: unknown) {
        console.warn(
          `[commission] Failed to update result summary for "${id as string}":`,
          errorMessage(err),
        );
      }
    }

    // 2. Squash-merge activity branch into claude/main
    if (!entry.worktreeDir || !entry.branchName) {
      console.warn(
        `[commission] "${id as string}" completed but missing worktree/branch info, skipping merge`,
      );
      deps.eventBus.emit({
        type: "commission_status",
        commissionId: id as string,
        status: "completed",
        reason,
      });
      await deps.syncStatusToIntegration(entry, "completed", reason);
      return { mergeSucceeded: false };
    }

    let result: { merged: boolean; preserved: boolean };
    try {
      result = await deps.finalizeActivity({
        activityId: id as string,
        worktreeDir: entry.worktreeDir,
        branchName: entry.branchName,
        projectName: entry.projectName,
      });
    } catch (err: unknown) {
      // Infrastructure failure (not a merge conflict). Transition to failed
      // with the real error, no Guild Master escalation needed.
      const errMsg = errorMessage(err);
      console.error(
        `[commission] finalizeActivity threw for "${id as string}":`,
        errMsg,
      );
      if (deps.transitionFn) {
        await deps.transitionFn(id, "completed", "failed", `finalizeActivity error: ${errMsg}`);
      }
      return { mergeSucceeded: false };
    }

    if (result.merged) {
      deps.eventBus.emit({
        type: "commission_status",
        commissionId: id as string,
        status: "completed",
        reason,
      });

      await deps.syncStatusToIntegration(entry, "completed", reason);
      await deps.deleteStateFile(id);

      console.log(
        `[commission] "${id as string}" squash-merged to claude and cleaned up`,
      );

      return { mergeSucceeded: true };
    }

    // Merge failed due to non-.lore/ conflicts. Escalate to Guild Master.
    const conflictReason = "Squash-merge conflict on non-.lore/ files";

    if (deps.createMeetingRequest) {
      const escalationReason =
        `Commission ${id as string} failed to merge: non-.lore/ conflicts detected. ` +
        `Branch ${entry.branchName} preserved. ` +
        `Please resolve conflicts manually, then re-dispatch or clean up the branch.`;
      try {
        await deps.createMeetingRequest({
          projectName: entry.projectName,
          workerName: deps.managerPackageName,
          reason: escalationReason,
        });
      } catch (err: unknown) {
        console.error(
          `[commission] Failed to escalate merge conflict for "${id as string}":`,
          errorMessage(err),
        );
      }
    }

    console.log(
      `[commission] "${id as string}" merge failed: ${conflictReason}`,
    );

    // Re-entrant transition: completed -> failed. Safe because the machine
    // releases the lock before running enter handlers.
    if (deps.transitionFn) {
      await deps.transitionFn(id, "completed", "failed", conflictReason);
    }

    return { mergeSucceeded: false };
  };
}

/**
 * Enter handler for the "failed" state.
 *
 * Two paths depending on sourceState:
 * - From "completed" (ctx.sourceState === "completed"): merge-conflict
 *   path. The activity worktree was already cleaned up by finalizeActivity
 *   in the completed handler. Emits event, syncs status, writes state file.
 * - From any other state: normal failure. Preserves partial work via
 *   commitAll, removes worktree, emits event, writes state file.
 *
 * Worktree-missing guard: for recovery (Phase 6) and race conditions,
 * checks whether the worktree still exists before attempting operations.
 */
export function createEnterFailed(
  deps: CommissionHandlerDeps,
): EnterHandler<CommissionId, CommissionStatus, ActiveCommissionEntry> {
  return async (ctx: CommissionTransitionContext) => {
    const { entry, id, reason } = ctx;
    const isMergeConflict = ctx.sourceState === "completed";
    entry.status = "failed";

    deps.eventBus.emit({
      type: "commission_status",
      commissionId: id as string,
      status: "failed",
      reason,
    });

    await deps.syncStatusToIntegration(entry, "failed", reason);

    if (!isMergeConflict && entry.worktreeDir && entry.branchName) {
      // Normal failure path: preserve partial work and clean up worktree.
      // Guard against missing worktree (recovery, race conditions).
      const worktreeExists = await deps.fileExists(entry.worktreeDir);
      if (worktreeExists) {
        try {
          await deps.preserveAndCleanupWorktree(
            id as string,
            entry.worktreeDir,
            entry.branchName,
            `Partial work preserved (failed): ${id as string}`,
            deps.findProjectPath(entry.projectName),
          );
        } catch (err: unknown) {
          console.warn(
            `[commission] preserveAndCleanupWorktree failed for "${id as string}" (failed):`,
            errorMessage(err),
          );
        }
      }
    }
    // Merge-conflict path: worktree was already cleaned up by finalizeActivity.
    // No worktree operations needed.

    await deps.writeStateFile(id, {
      commissionId: id as string,
      projectName: entry.projectName,
      workerName: entry.workerName,
      status: "failed",
    });

    console.log(
      `[commission] "${id as string}" failed${isMergeConflict ? " (merge conflict)" : ""}: ${reason}`,
    );

    return undefined;
  };
}

/**
 * Enter handler for the "cancelled" state.
 *
 * The abort signal was already sent in exit-in_progress. This handler
 * preserves partial work, removes the worktree, emits event, writes
 * state file.
 */
export function createEnterCancelled(
  deps: CommissionHandlerDeps,
): EnterHandler<CommissionId, CommissionStatus, ActiveCommissionEntry> {
  return async (ctx: CommissionTransitionContext) => {
    const { entry, id, reason } = ctx;
    entry.status = "cancelled";

    deps.eventBus.emit({
      type: "commission_status",
      commissionId: id as string,
      status: "cancelled",
      reason,
    });

    await deps.syncStatusToIntegration(entry, "cancelled", reason);

    if (entry.worktreeDir && entry.branchName) {
      const worktreeExists = await deps.fileExists(entry.worktreeDir);
      if (worktreeExists) {
        try {
          await deps.preserveAndCleanupWorktree(
            id as string,
            entry.worktreeDir,
            entry.branchName,
            `Partial work preserved (cancelled): ${id as string}`,
            deps.findProjectPath(entry.projectName),
          );
        } catch (err: unknown) {
          console.warn(
            `[commission] preserveAndCleanupWorktree failed for "${id as string}" (cancelled):`,
            errorMessage(err),
          );
        }
      }
    }

    await deps.writeStateFile(id, {
      commissionId: id as string,
      projectName: entry.projectName,
      workerName: entry.workerName,
      status: "cancelled",
    });

    console.log(
      `[commission] "${id as string}" cancelled: ${reason}`,
    );

    return undefined;
  };
}

/**
 * Enter handler for the "abandoned" state.
 *
 * Fully implemented. Abandoned commissions have no activity worktree
 * (they were pending, blocked, failed, or cancelled). The handler:
 * 1. Emits a commission_status event.
 * 2. Syncs the status to the integration worktree.
 * 3. Writes the state file.
 * No git operations are needed.
 */
export function createEnterAbandoned(
  deps: CommissionHandlerDeps,
): EnterHandler<CommissionId, CommissionStatus, ActiveCommissionEntry> {
  return async (ctx: CommissionTransitionContext) => {
    deps.eventBus.emit({
      type: "commission_status",
      commissionId: ctx.id as string,
      status: "abandoned",
      reason: ctx.reason,
    });

    await deps.syncStatusToIntegration(ctx.entry, "abandoned", ctx.reason);

    await deps.writeStateFile(ctx.id, {
      commissionId: ctx.id as string,
      projectName: ctx.entry.projectName,
      workerName: ctx.entry.workerName,
      status: "abandoned",
    });

    return undefined;
  };
}

// -- ArtifactOps configuration --

/**
 * Creates the commission-specific ArtifactOps for the ActivityMachine.
 *
 * resolveBasePath: uses a lookup function to get the entry from the
 * machine's state tracker, reading worktreeDir for active entries
 * and falling back to the integration worktree for inactive ones.
 *
 * writeStatusAndTimeline: delegates to updateCommissionStatus +
 * appendTimelineEntry from commission-artifact-helpers.
 */
export function createCommissionArtifactOps(
  deps: Pick<CommissionHandlerDeps, "integrationWorktreePath">,
  entryLookup?: (id: CommissionId) => ActiveCommissionEntry | undefined,
): ArtifactOps<CommissionId, CommissionStatus> {
  return {
    writeStatusAndTimeline: async (
      id: CommissionId,
      basePath: string,
      toStatus: CommissionStatus,
      reason: string,
      metadata?: { from?: CommissionStatus },
    ): Promise<void> => {
      await updateCommissionStatus(basePath, id, toStatus);
      await appendTimelineEntry(basePath, id, `status_${toStatus}`, reason, metadata?.from ? {
        from: metadata.from,
        to: toStatus,
      } : undefined);
    },
    resolveBasePath: (id: CommissionId, isActive: boolean): string => {
      const entry = entryLookup?.(id);
      if (!entry) {
        // The machine always has the entry tracked, so reaching this
        // point indicates a wiring bug.
        throw new Error(
          `Cannot resolve artifact base path for commission ${id as string}: entry not found in lookup.`,
        );
      }
      if (isActive && entry.worktreeDir) {
        return entry.worktreeDir;
      }
      return deps.integrationWorktreePath(entry.projectName);
    },
  };
}

// -- Factory function --

export interface CommissionHandlersResult {
  handlers: {
    enter: Partial<Record<CommissionStatus, EnterHandler<CommissionId, CommissionStatus, ActiveCommissionEntry>>>;
    exit: Partial<Record<CommissionStatus, ExitHandler<CommissionId, CommissionStatus, ActiveCommissionEntry>>>;
  };
  transitions: Record<CommissionStatus, CommissionStatus[]>;
  activeStates: CommissionStatus[];
  cleanupStates: CommissionStatus[];
  createArtifactOps: (
    entryLookup: (id: CommissionId) => ActiveCommissionEntry | undefined,
  ) => ArtifactOps<CommissionId, CommissionStatus>;
}

/**
 * Factory function that creates all commission handlers, the transition
 * graph, and configuration constants for the ActivityMachine.
 *
 * The returned object provides createArtifactOps (a factory that accepts
 * an entry lookup function) instead of a static artifactOps. This allows
 * the ArtifactOps to resolve paths through the machine's state tracker.
 */
export function createCommissionHandlers(
  deps: CommissionHandlerDeps,
): CommissionHandlersResult {
  return {
    handlers: {
      enter: {
        dispatched: createEnterDispatched(deps),
        in_progress: createEnterInProgress(deps),
        completed: createEnterCompleted(deps),
        failed: createEnterFailed(deps),
        cancelled: createEnterCancelled(deps),
        abandoned: createEnterAbandoned(deps),
      },
      exit: {
        in_progress: createExitInProgress(deps),
      },
    },
    transitions: COMMISSION_TRANSITIONS,
    activeStates: COMMISSION_ACTIVE_STATES,
    cleanupStates: COMMISSION_CLEANUP_STATES,
    createArtifactOps: (entryLookup) => createCommissionArtifactOps(deps, entryLookup),
  };
}
