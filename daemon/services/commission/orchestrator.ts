/**
 * Commission orchestrator (Layer 5).
 *
 * The only module that imports from all four commission layers (REQ-CLS-26):
 *   Layer 1: CommissionRecordOps (addUserNote writes)
 *   Layer 2: CommissionLifecycle (state transitions, signals)
 *   Layer 3: WorkspaceOps (git branch/worktree/merge)
 *   Layer 4: sdk-runner (prepareSdkSession + runSdkSession + drainSdkSession)
 *
 * Implements CommissionSessionForRoutes so routes and manager toolbox
 * continue to work unchanged. Manages ExecutionContext per running
 * commission, auto-dispatch queue, and dependency auto-transitions.
 *
 * Six flows:
 *   1. Dispatch: validate -> capacity -> lifecycle.dispatch -> workspace.prepare
 *      -> lifecycle.executionStarted -> fire-and-forget session
 *   2. Session completion: lifecycle signals -> workspace
 *      finalize/preserve -> cleanup -> auto-dispatch + dependency check
 *   3. Cancel: lifecycle.cancel -> abort + workspace.preserve -> cleanup
 *   4. Recovery: scan state files + orphaned worktrees -> lifecycle.register
 *      -> lifecycle.executionFailed -> cleanup
 *   5. Dependency: scan integration worktree -> lifecycle.unblock for satisfied
 *   6. Update: validate pending status -> modify frontmatter fields
 *
 * This file exceeds 800 lines because the orchestrator is the only module
 * that imports all layers. Its size reflects the coordination logic across
 * six flows. Splitting further would push wiring complexity into a new layer
 * with no domain benefit.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import matter from "gray-matter";
import type { Log } from "@/daemon/lib/log";
import { nullLog } from "@/daemon/lib/log";
import type { CommissionId, CommissionStatus, CommissionType } from "@/daemon/types";
import { asCommissionId } from "@/daemon/types";
import type {
  AppConfig,
  DiscoveredPackage,
  WorkerMetadata,
} from "@/lib/types";
import { isNodeError, isValidModel } from "@/lib/types";
import {
  integrationWorktreePath as integrationWorktreePathFn,
  commissionWorktreePath as commissionWorktreePathFn,
  commissionBranchName as commissionBranchNameFn,
  commissionArtifactPath,
  activityWorktreeRoot,
} from "@/lib/paths";
import { getWorkerByName } from "@/lib/packages";
import { CLAUDE_BRANCH } from "@/daemon/lib/git";
import type { GitOps } from "@/daemon/lib/git";
import {
  errorMessage,
  sanitizeForGitRef,
  formatTimestamp,
  escapeYamlValue,
} from "@/daemon/lib/toolbox-utils";
import { withProjectLock } from "@/daemon/lib/project-lock";
import { isValidCron } from "@/daemon/services/scheduler/cron";
import type { EventBus } from "@/daemon/lib/event-bus";
import type { CommissionLifecycle } from "@/daemon/services/commission/lifecycle";
import { replaceYamlField } from "@/daemon/lib/record-utils";
import type { CommissionRecordOps } from "@/daemon/services/commission/record";
import type {
  WorkspaceOps,
  FinalizeResult,
} from "@/daemon/services/workspace";
import {
  prepareSdkSession,
  drainSdkSession,
  runSdkSession,
  prefixLocalModelError,
  type SessionPrepSpec,
  type SessionPrepDeps,
  type SdkRunnerOutcome,
  type SdkQueryOptions,
} from "@/daemon/lib/agent-sdk/sdk-runner";
import type { ResolvedModel } from "@/lib/types";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { isAtCapacity } from "@/daemon/services/commission/capacity";
import { escalateMergeConflict } from "@/daemon/lib/escalation";
import { createMailOrchestrator, type MailOrchestrator } from "@/daemon/services/mail/orchestrator";
import type { SleepingCommissionState } from "@/daemon/services/mail/types";
import type { HaltedCommissionState } from "@/daemon/services/commission/halted-types";

// -- CommissionSessionForRoutes interface --

/**
 * Public API surface used by routes, manager toolbox, and meeting session.
 * The orchestrator implements this interface; consumers depend on the
 * interface rather than the concrete implementation.
 */
export interface CommissionSessionForRoutes {
  createCommission(
    projectName: string,
    title: string,
    workerName: string,
    prompt: string,
    dependencies?: string[],
    resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number; model?: string },
    options?: { type?: CommissionType; sourceSchedule?: string },
  ): Promise<{ commissionId: string }>;
  updateCommission(
    commissionId: CommissionId,
    updates: {
      prompt?: string;
      dependencies?: string[];
      resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number; model?: string };
    },
  ): Promise<void>;
  dispatchCommission(
    commissionId: CommissionId,
  ): Promise<{ status: "accepted" | "queued" }>;
  cancelCommission(commissionId: CommissionId, reason?: string): Promise<void>;
  abandonCommission(commissionId: CommissionId, reason: string): Promise<void>;
  redispatchCommission(
    commissionId: CommissionId,
  ): Promise<{ status: "accepted" | "queued" }>;
  addUserNote(commissionId: CommissionId, content: string): Promise<void>;
  createScheduledCommission(params: {
    projectName: string;
    title: string;
    workerName: string;
    prompt: string;
    cron: string;
    repeat?: number | null;
    dependencies?: string[];
    resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number; model?: string };
  }): Promise<{ commissionId: string }>;
  updateScheduleStatus(
    commissionId: CommissionId,
    targetStatus: string,
  ): Promise<{ outcome: string; status?: string; reason?: string }>;
  continueCommission(commissionId: CommissionId): Promise<{ status: "accepted" | "capacity_error" }>;
  checkDependencyTransitions(projectName: string): Promise<void>;
  recoverCommissions(): Promise<number>;
  getActiveCommissions(): number;
  shutdown(): void;
}

// -- Constants --

// -- ExecutionContext --

export type ExecutionContext = {
  commissionId: CommissionId;
  projectName: string;
  workerName: string;
  worktreeDir: string;
  branchName: string;
  abortController: AbortController;
  attempt: number;
  checkoutScope: "full" | "sparse";
};

// -- Dependency types --

export interface CommissionOrchestratorDeps {
  lifecycle: CommissionLifecycle;
  workspace: WorkspaceOps;
  prepDeps: SessionPrepDeps;
  queryFn: (params: { prompt: string; options: SdkQueryOptions }) => AsyncGenerator<SDKMessage>;
  recordOps: CommissionRecordOps;
  eventBus: EventBus;
  config: AppConfig;
  packages: DiscoveredPackage[];
  guildHallHome: string;
  gitOps: GitOps;
  /**
   * DI seam for file existence checks. Tests pass a mock to control which
   * paths appear to exist. Defaults to fs.access check.
   */
  fileExists?: (filePath: string) => Promise<boolean>;
  /**
   * Optional callback invoked when a squash-merge fails due to non-.lore/
   * conflicts. Creates a Guild Master meeting request to surface the conflict
   * to the user.
   */
  createMeetingRequestFn?: (params: {
    projectName: string;
    workerName: string;
    reason: string;
  }) => Promise<void>;
  /** Manager worker package name for escalation references. */
  managerPackageName?: string;
  /** Optional pre-built mail orchestrator (DI seam for testing). */
  mailOrchestrator?: MailOrchestrator;
  /** Injectable logger. Defaults to nullLog("commission"). */
  log?: Log;
  /**
   * Lazy ref for the schedule lifecycle, set after the scheduler is
   * constructed. The services bag captures this ref at dispatch time,
   * breaking the circular ordering between orchestrator and scheduler.
   */
  scheduleLifecycleRef?: { current: import("@/daemon/services/scheduler/schedule-lifecycle").ScheduleLifecycle | undefined };
}

// -- Factory --

export function createCommissionOrchestrator(
  deps: CommissionOrchestratorDeps,
): CommissionSessionForRoutes {
  const {
    lifecycle,
    workspace,
    prepDeps,
    queryFn,
    recordOps,
    eventBus,
    config,
    packages,
    guildHallHome,
    gitOps,
  } = deps;

  const log = deps.log ?? nullLog("commission");

  const managerPackageName = deps.managerPackageName ?? "guild-hall-manager";
  const fileExists = deps.fileExists ?? (async (filePath: string): Promise<boolean> => {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  });

  // -- Internal state --

  /** Active execution contexts, keyed by commission ID. */
  const executions = new Map<CommissionId, ExecutionContext>();

  /** Serialization lock for auto-dispatch. */
  let autoDispatchChain: Promise<void> = Promise.resolve();

  // Mail orchestrator is instantiated after helper functions are defined.
  // Declared here (assigned below) so runCommissionSession can reference it.
  let mailOrchestrator: MailOrchestrator;

  // -- Helpers --

  function findProject(projectName: string) {
    return config.projects.find((p) => p.name === projectName);
  }

  function formatCommissionId(workerName: string, now: Date): CommissionId {
    const safeName = sanitizeForGitRef(workerName);
    const ts = formatTimestamp(now);
    return asCommissionId(`commission-${safeName}-${ts}`);
  }

  function commissionStatePath(commissionId: CommissionId): string {
    return path.join(guildHallHome, "state", "commissions", `${commissionId}.json`);
  }

  async function writeStateFile(
    commissionId: CommissionId,
    data: Record<string, unknown>,
  ): Promise<void> {
    const filePath = commissionStatePath(commissionId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  async function deleteStateFile(commissionId: CommissionId): Promise<void> {
    try {
      await fs.unlink(commissionStatePath(commissionId));
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === "ENOENT") return;
      log.warn(`Failed to delete state file for "${commissionId as string}":`, errorMessage(err));
    }
  }

  /**
   * Syncs a terminal status back to the integration worktree so the
   * artifact is findable (and has the correct status) after the activity
   * worktree is cleaned up.
   */
  async function syncStatusToIntegration(
    commissionId: CommissionId,
    projectName: string,
    status: CommissionStatus,
    reason: string,
  ): Promise<void> {
    const iPath = integrationWorktreePathFn(guildHallHome, projectName);
    const artifactPath = commissionArtifactPath(iPath, commissionId);
    try {
      await recordOps.writeStatus(artifactPath, status);
      await recordOps.appendTimeline(
        artifactPath,
        `status_${status}`,
        reason,
      );
    } catch (err: unknown) {
      log.warn(
        `Failed to sync status "${status}" to integration worktree for ${commissionId as string}:`,
        errorMessage(err),
      );
    }
  }

  /**
   * Finds the project for a commission by searching integration worktrees.
   */
  async function findProjectForCommission(
    commissionId: CommissionId,
  ): Promise<{ projectPath: string; projectName: string; integrationPath: string } | null> {
    for (const project of config.projects) {
      const iPath = integrationWorktreePathFn(guildHallHome, project.name);
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
   * Resolves the base path for artifact reads/writes. When a commission has
   * an active execution context, artifacts live in the activity worktree.
   * Otherwise they live in the integration worktree.
   */
  function resolveArtifactBasePath(commissionId: CommissionId, projectName: string): string {
    const ctx = executions.get(commissionId);
    if (ctx) {
      return ctx.worktreeDir;
    }
    return integrationWorktreePathFn(guildHallHome, projectName);
  }

  /**
   * Counts previous dispatch attempts by scanning timeline for terminal entries.
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

  // -- Auto-dispatch --

  function enqueueAutoDispatch(): void {
    autoDispatchChain = autoDispatchChain.then(() => tryAutoDispatch()).catch((err: unknown) => {
      log.error(
        "auto-dispatch chain error:",
        errorMessage(err),
      );
    });
  }

  // -- Mail orchestrator initialization --

  // eslint-disable-next-line prefer-const -- forward-declared at line 207 for function ordering
  mailOrchestrator = deps.mailOrchestrator ?? createMailOrchestrator(
    {
      lifecycle,
      recordOps,
      prepDeps,
      queryFn,
      eventBus,
      config,
      packages,
      guildHallHome,
      gitOps,
      log,
    },
    {
      writeStateFile,
      commissionStatePath,
      enqueueAutoDispatch,
      async onResumeCompleted(commissionId, projectName, workerName, worktreeDir, branchName, outcome, resultSubmitted) {
        // Reconstruct a temporary ExecutionContext for the finalize flow
        const ctx: ExecutionContext = {
          commissionId,
          projectName,
          workerName,
          worktreeDir,
          branchName,
          abortController: new AbortController(),
          attempt: 0,
          checkoutScope: "full",
        };
        executions.set(commissionId, ctx);
        await handleSessionCompletion(ctx, outcome, resultSubmitted);
      },
      registerExecution(commissionId, projectName, workerName, worktreeDir, branchName, abortController) {
        const ctx: ExecutionContext = {
          commissionId,
          projectName,
          workerName,
          worktreeDir,
          branchName,
          abortController,
          attempt: 0,
          checkoutScope: "full",
        };
        executions.set(commissionId, ctx);
      },
      unregisterExecution(commissionId) {
        executions.delete(commissionId);
      },
    },
  );

  /**
   * Scans pending commissions across all projects and returns them sorted
   * by creation date (oldest first, FIFO).
   */
  async function scanPendingCommissions(): Promise<
    Array<{ commissionId: CommissionId; projectName: string; createdAt: string }>
  > {
    const pending: Array<{
      commissionId: CommissionId;
      projectName: string;
      createdAt: string;
    }> = [];

    for (const project of config.projects) {
      const iPath = integrationWorktreePathFn(guildHallHome, project.name);
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

        // Skip commissions that are already active
        if (executions.has(cId) || lifecycle.isTracked(cId)) continue;

        try {
          const artifactPath = commissionArtifactPath(iPath, cId);
          const raw = await fs.readFile(artifactPath, "utf-8");
          const statusMatch = raw.match(/^status: (\S+)$/m);
          if (!statusMatch || statusMatch[1] !== "pending") continue;

          // Extract the first timestamp from activity_timeline using regex
          // instead of parsing the entire file with gray-matter.
          const tsMatch = raw.match(/^activity_timeline:\n\s+- timestamp: (.+)$/m);
          const createdAt = tsMatch?.[1] ?? "9999-12-31T23:59:59.999Z";

          pending.push({ commissionId: cId, projectName: project.name, createdAt });
        } catch (err: unknown) {
          log.warn(`scanPendingCommissions: failed to read "${cId as string}":`, errorMessage(err));
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

    // Build a ReadonlyMap view for capacity check
    const activeMap = new Map<string, { projectName: string }>();
    for (const [id, ctx] of executions) {
      activeMap.set(id as string, { projectName: ctx.projectName });
    }

    for (const candidate of pending) {
      const { atLimit } = isAtCapacity(candidate.projectName, activeMap, config);
      if (atLimit) continue;

      try {
        log.info(
          `auto-dispatching "${candidate.commissionId as string}" from queue (FIFO)`,
        );
        eventBus.emit({
          type: "commission_dequeued",
          commissionId: candidate.commissionId as string,
          reason: "Capacity available, dispatching from queue",
        });
        await dispatchCommission(candidate.commissionId);
        // Re-build activeMap after successful dispatch
        for (const [id, ctx] of executions) {
          activeMap.set(id as string, { projectName: ctx.projectName });
        }
      } catch (err: unknown) {
        log.warn(
          `auto-dispatch failed for "${candidate.commissionId as string}":`,
          errorMessage(err),
        );
      }
    }
  }

  // -- Session completion handling --

  async function handleSessionCompletion(
    ctx: ExecutionContext,
    outcome: SdkRunnerOutcome,
    resultSubmitted: boolean,
    resolvedModel?: ResolvedModel,
  ): Promise<void> {
    // If the commission was already cancelled/aborted, the cancel flow
    // handles cleanup. Just exit.
    const currentStatus = lifecycle.getStatus(ctx.commissionId);
    if (!currentStatus || currentStatus === "cancelled" || currentStatus === "failed") {
      executions.delete(ctx.commissionId);
      lifecycle.forget(ctx.commissionId);
      return;
    }

    if (outcome.aborted) {
      // Aborted by cancel flow. Context cleanup already happened there.
      executions.delete(ctx.commissionId);
      lifecycle.forget(ctx.commissionId);
      return;
    }

    // maxTurns without result: halt instead of fail (REQ-COM-36)
    if (!resultSubmitted && outcome.reason === "maxTurns") {
      const halted = await handleHalt(ctx, outcome);
      if (halted) {
        // Halted commissions leave lifecycle tracked but exit executions.
        // Don't call lifecycle.forget (commission stays as "halted").
        executions.delete(ctx.commissionId);
        enqueueAutoDispatch();
        return;
      }
      // Fall through to normal fail path if halt failed (e.g. no sessionId)
    }

    try {
      if (resultSubmitted) {
        // Result was submitted: attempt finalize (squash-merge)
        await handleSuccessfulCompletion(ctx);
      } else {
        // No result submitted: fail
        const reason = outcome.error
          ? `Session error: ${prefixLocalModelError(outcome.error, resolvedModel)}`
          : "Session completed without submitting result";

        await failAndCleanup(ctx, reason);
      }
    } finally {
      executions.delete(ctx.commissionId);
      lifecycle.forget(ctx.commissionId);
    }

    enqueueAutoDispatch();
    await checkDependencyTransitions(ctx.projectName);
  }

  /**
   * Halt entry path: commission hit maxTurns without submitting a result.
   * Preserves the worktree, writes halted state file, increments halt_count,
   * and records a timeline event (REQ-COM-36, REQ-COM-37, REQ-COM-38,
   * REQ-COM-45, REQ-COM-45a).
   *
   * Returns true if halt succeeded, false if it failed (caller should
   * fall through to the normal fail path).
   */
  async function handleHalt(
    ctx: ExecutionContext,
    outcome: SdkRunnerOutcome,
  ): Promise<boolean> {
    // 1. Commit pending changes (like sleep entry)
    try {
      await gitOps.commitAll(ctx.worktreeDir, `Halted (maxTurns): ${ctx.commissionId as string}`);
    } catch (err: unknown) {
      log.warn(`pre-halt commit failed for "${ctx.commissionId as string}":`, errorMessage(err));
    }

    // 2. Must have a sessionId for resume
    if (!outcome.sessionId) {
      log.error(`halt failed for "${ctx.commissionId as string}": no session ID available`);
      return false;
    }

    // 3. Transition in_progress -> halted
    const haltResult = await lifecycle.halt(
      ctx.commissionId,
      `Turn limit reached (${outcome.turnsUsed} turns used)`,
    );
    if (haltResult.outcome === "skipped") {
      log.error(`halt transition skipped for "${ctx.commissionId as string}": ${haltResult.reason}`);
      return false;
    }

    // 4. Read current progress and increment halt_count
    const artifactPath = commissionArtifactPath(ctx.worktreeDir, ctx.commissionId);
    let lastProgress = "";
    let haltCount = 1;
    try {
      lastProgress = await recordOps.readProgress(artifactPath);
    } catch (err: unknown) {
      log.warn(`readProgress failed for "${ctx.commissionId as string}":`, errorMessage(err));
    }
    try {
      haltCount = await recordOps.incrementHaltCount(artifactPath);
    } catch (err: unknown) {
      log.error(`incrementHaltCount failed for "${ctx.commissionId as string}":`, errorMessage(err));
    }

    // 5. Write halted state file (REQ-COM-37)
    const turnsUsed = outcome.turnsUsed;
    const stateData: HaltedCommissionState = {
      commissionId: ctx.commissionId as string,
      projectName: ctx.projectName,
      workerName: ctx.workerName,
      status: "halted",
      worktreeDir: ctx.worktreeDir,
      branchName: ctx.branchName,
      sessionId: outcome.sessionId,
      haltedAt: new Date().toISOString(),
      turnsUsed,
      lastProgress,
    };
    try {
      await writeStateFile(
        ctx.commissionId,
        stateData as Record<string, unknown>,
      );
    } catch (err: unknown) {
      log.error(
        `writeStateFile failed for "${ctx.commissionId as string}", rolling back to failed:`,
        errorMessage(err),
      );
      await lifecycle.executionFailed(
        ctx.commissionId,
        `Halt state file write failed: ${errorMessage(err)}`,
      );
      return false;
    }

    // 6. Append timeline event (REQ-COM-45a)
    try {
      await recordOps.appendTimeline(
        artifactPath,
        "status_halted",
        `Turn limit reached (${turnsUsed} turns used)`,
        {
          turnsUsed: String(turnsUsed),
          lastProgress,
          haltCount: String(haltCount),
        },
      );
    } catch (err: unknown) {
      log.warn(`failed to append status_halted timeline:`, errorMessage(err));
    }

    // 7. Sync halted status to integration worktree
    await syncStatusToIntegration(
      ctx.commissionId,
      ctx.projectName,
      "halted",
      `Turn limit reached (${turnsUsed} turns used)`,
    );

    log.info(
      `"${ctx.commissionId as string}" halted after ${turnsUsed} turns (halt #${haltCount})`,
    );

    return true;
  }

  async function handleSuccessfulCompletion(ctx: ExecutionContext): Promise<void> {
    // Transition to completed
    const completeResult = await lifecycle.executionCompleted(ctx.commissionId);
    if (completeResult.outcome === "skipped") {
      log.warn(
        `executionCompleted skipped for "${ctx.commissionId as string}": ${completeResult.reason}`,
      );
      await preserveAndCleanup(ctx, "executionCompleted skipped: " + completeResult.reason);
      return;
    }

    // Squash-merge via workspace.finalize
    const project = findProject(ctx.projectName);
    if (!project) {
      log.error(
        `project "${ctx.projectName}" not found during finalize`,
      );
      await failAndCleanup(ctx, "Project not found during finalize");
      return;
    }

    const iPath = integrationWorktreePathFn(guildHallHome, ctx.projectName);

    // workspace.finalize() commits the activity worktree as its first step,
    // so no separate pre-merge commitAll is needed here.
    let finalizeResult: FinalizeResult;
    try {
      finalizeResult = await workspace.finalize({
        activityBranch: ctx.branchName,
        worktreeDir: ctx.worktreeDir,
        projectPath: project.path,
        integrationPath: iPath,
        activityId: ctx.commissionId as string,
        commitMessage: `Commission completed: ${ctx.commissionId as string}`,
        commitLabel: "Commission",
        lockFn: (fn) => withProjectLock(ctx.projectName, fn),
      });
    } catch (err: unknown) {
      const errMsg = errorMessage(err);
      log.error(
        `finalize threw for "${ctx.commissionId as string}":`,
        errMsg,
      );
      await failAndCleanup(ctx, `Finalize error: ${errMsg}`);
      return;
    }

    if (finalizeResult.merged) {
      // Clean merge — status already in integration via squash-merge
      eventBus.emit({
        type: "commission_status",
        commissionId: ctx.commissionId as string,
        status: "completed",
        reason: "Execution completed",
      });
      await deleteStateFile(ctx.commissionId);
      log.info(
        `"${ctx.commissionId as string}" squash-merged to claude and cleaned up`,
      );
    } else {
      // Merge conflict: escalate to Guild Master
      const conflictReason = finalizeResult.merged === false && "reason" in finalizeResult
        ? finalizeResult.reason
        : "Squash-merge conflict on non-.lore/ files";

      if (deps.createMeetingRequestFn) {
        await escalateMergeConflict({
          activityType: "commission",
          activityId: ctx.commissionId as string,
          branchName: ctx.branchName,
          projectName: ctx.projectName,
          createMeetingRequest: deps.createMeetingRequestFn,
          managerPackageName,
        });
      }

      await failAndCleanup(ctx, conflictReason, { preserveWorktree: false });

      log.info(
        `"${ctx.commissionId as string}" merge failed: ${conflictReason}`,
      );
    }
  }

  async function handleSessionError(ctx: ExecutionContext, error: unknown, resolvedModel?: ResolvedModel): Promise<void> {
    const currentStatus = lifecycle.getStatus(ctx.commissionId);
    if (!currentStatus || currentStatus === "cancelled" || currentStatus === "failed") {
      executions.delete(ctx.commissionId);
      lifecycle.forget(ctx.commissionId);
      return;
    }

    const rawMsg = error instanceof Error ? error.message : String(error);
    const reason = `Session error: ${prefixLocalModelError(rawMsg, resolvedModel)}`;

    try {
      await failAndCleanup(ctx, reason);
    } finally {
      executions.delete(ctx.commissionId);
      lifecycle.forget(ctx.commissionId);
    }

    enqueueAutoDispatch();
  }

  /**
   * Encapsulates the recurring failure cleanup sequence:
   * 1. lifecycle.executionFailed (with catch + log)
   * 2. preserveAndCleanup (optional, when preserveWorktree is true)
   * 3. syncStatusToIntegration
   * 4. writeStateFile with "failed"
   *
   * Some call sites (merge conflict) don't need preserveAndCleanup because
   * the worktree was already removed by workspace.finalize. Pass
   * preserveWorktree: false for those cases.
   */
  async function failAndCleanup(
    ctx: ExecutionContext,
    reason: string,
    options: { preserveWorktree?: boolean } = {},
  ): Promise<void> {
    const { preserveWorktree = true } = options;
    try {
      await lifecycle.executionFailed(ctx.commissionId, reason);
    } catch (err: unknown) {
      log.error(`executionFailed threw for "${ctx.commissionId as string}":`, errorMessage(err));
    }
    if (preserveWorktree) {
      await preserveAndCleanup(ctx, reason);
    }
    await syncStatusToIntegration(ctx.commissionId, ctx.projectName, "failed", reason);
    await writeStateFile(ctx.commissionId, {
      commissionId: ctx.commissionId as string,
      projectName: ctx.projectName,
      workerName: ctx.workerName,
      status: "failed",
    });
  }

  /**
   * Commits partial work and removes the worktree, preserving the branch.
   */
  async function preserveAndCleanup(ctx: ExecutionContext, reason: string): Promise<void> {
    const project = findProject(ctx.projectName);
    try {
      await workspace.preserveAndCleanup({
        worktreeDir: ctx.worktreeDir,
        branchName: ctx.branchName,
        commitMessage: `Partial work preserved (${reason}): ${ctx.commissionId as string}`,
        projectPath: project?.path,
      });
    } catch (err: unknown) {
      log.warn(
        `preserveAndCleanup failed for "${ctx.commissionId as string}":`,
        errorMessage(err),
      );
    }
  }

  // -- Sleeping commission cancel/abandon --

  /**
   * Cancel or abandon a sleeping commission with mail-aware cleanup.
   * Reads the state file to find the worktree and mail info, cancels/dequeues
   * the mail reader if needed, then transitions and cleans up.
   */
  async function cancelSleepingCommission(
    commissionId: CommissionId,
    reason: string,
    targetState: "cancelled" | "abandoned",
  ): Promise<void> {
    const projectName = lifecycle.getProjectName(commissionId);

    // 1. Transition the lifecycle first so wake attempts are rejected
    if (targetState === "cancelled") {
      try {
        await lifecycle.cancel(commissionId, reason);
      } catch (err: unknown) {
        log.warn(`lifecycle.cancel failed for sleeping "${commissionId as string}":`, errorMessage(err));
      }
    } else {
      try {
        await lifecycle.abandon(commissionId, reason);
      } catch (err: unknown) {
        log.warn(`lifecycle.abandon failed for sleeping "${commissionId as string}":`, errorMessage(err));
      }
    }

    // 2. Cancel/abort the mail reader if queued or active
    await mailOrchestrator.cancelReaderForCommission(commissionId);

    // 3. Read state file for worktree info
    const statePath = commissionStatePath(commissionId);
    let stateData: { worktreeDir?: string; branchName?: string; workerName?: string; projectName?: string } = {};
    try {
      const raw = await fs.readFile(statePath, "utf-8");
      stateData = JSON.parse(raw) as typeof stateData;
    } catch {
      // State file missing or corrupt; best-effort cleanup
    }

    const workerName = stateData.workerName ?? "";
    const worktreeDir = stateData.worktreeDir;
    const branchName = stateData.branchName ?? "";
    const resolvedProjectName = projectName ?? stateData.projectName ?? "";

    // 4. Preserve branch and clean up worktree
    if (worktreeDir) {
      const exists = await fileExists(worktreeDir);
      if (exists) {
        const project = findProject(resolvedProjectName);
        try {
          await workspace.preserveAndCleanup({
            worktreeDir,
            branchName,
            commitMessage: `Partial work preserved (${targetState}): ${commissionId as string}`,
            projectPath: project?.path,
          });
        } catch (err: unknown) {
          log.warn(`preserveAndCleanup failed for sleeping "${commissionId as string}":`, errorMessage(err));
        }
      }
    }

    // 5. Sync status to integration and write state file
    if (resolvedProjectName) {
      await syncStatusToIntegration(commissionId, resolvedProjectName, targetState, reason);
    }
    await writeStateFile(commissionId, {
      commissionId: commissionId as string,
      projectName: resolvedProjectName,
      workerName,
      status: targetState,
    });

    lifecycle.forget(commissionId);

    // Unblock dependents when abandoning a sleeping commission
    if (targetState === "abandoned" && resolvedProjectName) {
      await checkDependencyTransitions(resolvedProjectName);
    }

    enqueueAutoDispatch();
  }

  // -- Dependency auto-transitions --

  async function checkDependencyTransitions(projectName: string): Promise<void> {
    const iPath = integrationWorktreePathFn(guildHallHome, projectName);
    const commissionsDir = path.join(iPath, ".lore", "commissions");

    let entries: string[];
    try {
      entries = await fs.readdir(commissionsDir);
    } catch {
      return;
    }

    // Filter to candidate commission IDs (not active, .md files)
    const candidates = entries
      .filter((f) => f.endsWith(".md"))
      .map((f) => asCommissionId(f.replace(/\.md$/, "")))
      .filter((cId) => !executions.has(cId));

    if (candidates.length === 0) return;

    // Read status and dependencies for all candidates in parallel
    type CandidateData = {
      cId: CommissionId;
      artifactPath: string;
      status: string;
      dependencies: string[];
      allSatisfied: boolean;
    };

    const readResults = await Promise.allSettled(
      candidates.map(async (cId): Promise<CandidateData | null> => {
        const cArtifactPath = commissionArtifactPath(iPath, cId);
        let status: string;
        try {
          status = await recordOps.readStatus(cArtifactPath);
        } catch (err: unknown) {
          log.warn(`checkDependencyTransitions: failed to read status for "${cId as string}":`, errorMessage(err));
          return null;
        }

        if (status !== "blocked" && status !== "pending") return null;

        let dependencies: string[];
        try {
          dependencies = await recordOps.readDependencies(cArtifactPath);
        } catch (err: unknown) {
          log.warn(`checkDependencyTransitions: failed to read dependencies for "${cId as string}":`, errorMessage(err));
          return null;
        }

        if (dependencies.length === 0) return null;

        const depStatuses = await Promise.all(
          dependencies.map(async (dep) => {
            const depPath = commissionArtifactPath(iPath, dep);
            try {
              return await recordOps.readStatus(depPath);
            } catch {
              return "missing";
            }
          }),
        );
        const allSatisfied = depStatuses.every(
          (s) => s === "completed" || s === "abandoned",
        );

        return { cId, artifactPath: cArtifactPath, status, dependencies, allSatisfied };
      }),
    );

    // Process transitions sequentially (lifecycle operations need serialization)
    let anyUnblocked = false;

    for (const result of readResults) {
      if (result.status !== "fulfilled" || !result.value) continue;
      const { cId, artifactPath: cArtifactPath, status, allSatisfied } = result.value;

      if (status === "blocked" && allSatisfied) {
        try {
          lifecycle.register(cId, projectName, "blocked", cArtifactPath);
          await lifecycle.unblock(cId);
          lifecycle.forget(cId);
          anyUnblocked = true;
          log.info(
            `dependency auto-transition: "${cId as string}" blocked -> pending (all deps satisfied)`,
          );
        } catch (err: unknown) {
          lifecycle.forget(cId);
          log.warn(
            `Failed to auto-transition "${cId as string}" blocked -> pending:`,
            errorMessage(err),
          );
        }
      } else if (status === "pending" && !allSatisfied) {
        try {
          lifecycle.register(cId, projectName, "pending", cArtifactPath);
          await lifecycle.block(cId);
          lifecycle.forget(cId);
          log.info(
            `dependency auto-transition: "${cId as string}" pending -> blocked (missing dep)`,
          );
        } catch (err: unknown) {
          lifecycle.forget(cId);
          log.warn(
            `Failed to auto-transition "${cId as string}" pending -> blocked:`,
            errorMessage(err),
          );
        }
      }
    }

    if (anyUnblocked) {
      enqueueAutoDispatch();
    }
  }

  // -- Recovery --

  async function recoverCommissions(): Promise<number> {
    const stateDir = path.join(guildHallHome, "state", "commissions");
    const stateFileCommissionIds = new Set<string>();

    // -- Scan state files --
    let stateFiles: string[] = [];
    try {
      stateFiles = await fs.readdir(stateDir);
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === "ENOENT") {
        log.info("No commissions state directory found, scanning for orphaned worktrees.");
      } else {
        throw err;
      }
    }

    const stateJsonFiles = stateFiles.filter((f) => f.endsWith(".json"));
    let recovered = 0;

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
        log.warn(
          `Corrupt state file "${file}", skipping:`,
          errorMessage(err),
        );
        continue;
      }

      stateFileCommissionIds.add(state.commissionId);

      // Recover sleeping commissions via mail orchestrator
      if (state.status === "sleeping") {
        const sleepingState = state as unknown as SleepingCommissionState;
        const cId = asCommissionId(state.commissionId);

        if (lifecycle.isTracked(cId)) continue;

        const project = config.projects.find((p) => p.name === state.projectName);
        if (!project) {
          log.warn(
            `Sleeping commission "${state.commissionId}" references unknown project "${state.projectName}", skipping.`,
          );
          continue;
        }

        // Check if worktree still exists
        const worktreeDir = sleepingState.worktreeDir;
        const worktreeExists = worktreeDir ? await fileExists(worktreeDir) : false;

        if (!worktreeExists) {
          // Worktree lost: transition to failed, preserve branch
          log.info(
            `Sleeping commission "${state.commissionId}" has no worktree, transitioning to failed.`,
          );
          const iPath = integrationWorktreePathFn(guildHallHome, state.projectName);
          const artifactPath = commissionArtifactPath(iPath, cId);
          lifecycle.register(cId, state.projectName, "sleeping", artifactPath);
          try {
            await lifecycle.executionFailed(cId, "Worktree lost during sleep.");
          } catch (err: unknown) {
            log.error(
              `Failed to transition sleeping "${state.commissionId}" to failed:`,
              errorMessage(err),
            );
          }
          await syncStatusToIntegration(cId, state.projectName, "failed", "Worktree lost during sleep.");
          await writeStateFile(cId, {
            commissionId: state.commissionId,
            projectName: state.projectName,
            workerName: state.workerName,
            status: "failed",
          });
          lifecycle.forget(cId);
          recovered++;
          continue;
        }

        // Worktree exists: register lifecycle and delegate to mail orchestrator
        const iPath = integrationWorktreePathFn(guildHallHome, state.projectName);
        const artifactPath = commissionArtifactPath(iPath, cId);
        lifecycle.register(cId, state.projectName, "sleeping", artifactPath);

        log.info(
          `Recovering sleeping commission "${state.commissionId}".`,
        );

        try {
          await mailOrchestrator.recoverSleepingCommission(sleepingState);
        } catch (err: unknown) {
          log.error(
            `Failed to recover sleeping "${state.commissionId}":`,
            errorMessage(err),
          );
          try {
            await lifecycle.executionFailed(cId, `Recovery failed: ${errorMessage(err)}`);
          } catch {
            // Already logged
          }
          await syncStatusToIntegration(cId, state.projectName, "failed", `Recovery failed: ${errorMessage(err)}`);
          await writeStateFile(cId, {
            commissionId: state.commissionId,
            projectName: state.projectName,
            workerName: state.workerName,
            status: "failed",
          });
          lifecycle.forget(cId);
        }

        recovered++;
        continue;
      }

      // Only recover active commissions (dispatched or in_progress)
      if (state.status !== "dispatched" && state.status !== "in_progress") {
        continue;
      }

      const project = config.projects.find((p) => p.name === state.projectName);
      if (!project) {
        log.warn(
          `Commission "${state.commissionId}" references unknown project "${state.projectName}", skipping.`,
        );
        continue;
      }

      const cId = asCommissionId(state.commissionId);

      if (lifecycle.isTracked(cId)) {
        continue;
      }

      // Find the artifact path
      const iPath = integrationWorktreePathFn(guildHallHome, state.projectName);
      const artifactPath = commissionArtifactPath(iPath, cId);

      // Register at the stored status, then transition to failed
      lifecycle.register(cId, state.projectName, state.status as CommissionStatus, artifactPath);

      log.info(
        `Commission "${state.commissionId}" was ${state.status} when daemon stopped, transitioning to failed.`,
      );

      try {
        await lifecycle.executionFailed(cId, "Recovery: process lost on restart");
      } catch (err: unknown) {
        log.error(
          `Failed to transition "${state.commissionId}" to failed:`,
          errorMessage(err),
        );
        lifecycle.forget(cId);
        recovered++;
        continue;
      }

      // Cleanup worktree if it exists
      if (state.worktreeDir) {
        const worktreeExists = await fileExists(state.worktreeDir);
        if (worktreeExists) {
          try {
            await workspace.preserveAndCleanup({
              worktreeDir: state.worktreeDir,
              branchName: state.branchName ?? "",
              commitMessage: `Partial work preserved (recovery): ${state.commissionId}`,
              projectPath: project.path,
            });
          } catch (err: unknown) {
            log.warn(
              `preserveAndCleanup failed for "${state.commissionId}":`,
              errorMessage(err),
            );
          }
        }
      }

      await syncStatusToIntegration(cId, state.projectName, "failed", "Recovery: process lost on restart");
      await writeStateFile(cId, {
        commissionId: state.commissionId,
        projectName: state.projectName,
        workerName: state.workerName,
        status: "failed",
      });

      recovered++;
    }

    // -- Scan for orphaned worktrees --
    for (const project of config.projects) {
      const worktreeRoot = activityWorktreeRoot(guildHallHome, project.name);
      let dirEntries: string[];
      try {
        dirEntries = await fs.readdir(worktreeRoot);
      } catch (err: unknown) {
        if (isNodeError(err) && err.code === "ENOENT") continue;
        log.warn(
          `Failed to scan worktree root for "${project.name}":`,
          errorMessage(err),
        );
        continue;
      }

      for (const dirEntry of dirEntries) {
        if (!dirEntry.startsWith("commission-")) continue;

        const commissionId = dirEntry;
        if (stateFileCommissionIds.has(commissionId)) continue;

        const cId = asCommissionId(commissionId);
        if (lifecycle.isTracked(cId)) continue;

        const orphanWorktreeDir = path.join(worktreeRoot, dirEntry);

        try {
          const stat = await fs.stat(orphanWorktreeDir);
          if (!stat.isDirectory()) continue;
        } catch {
          continue;
        }

        log.info(
          `Found orphaned worktree "${commissionId}" for project "${project.name}" (no state file), transitioning to failed.`,
        );

        const branchName = commissionBranchNameFn(commissionId);
        const iPath = integrationWorktreePathFn(guildHallHome, project.name);
        const artifactPath = commissionArtifactPath(iPath, cId);

        lifecycle.register(cId, project.name, "in_progress", artifactPath);

        try {
          await lifecycle.executionFailed(cId, "Recovery: state lost");
        } catch (err: unknown) {
          log.error(
            `Failed to transition orphan "${commissionId}" to failed:`,
            errorMessage(err),
          );
          lifecycle.forget(cId);
          recovered++;
          continue;
        }

        try {
          await workspace.preserveAndCleanup({
            worktreeDir: orphanWorktreeDir,
            branchName,
            commitMessage: `Partial work preserved (recovery): ${commissionId}`,
            projectPath: project.path,
          });
        } catch (err: unknown) {
          log.warn(
            `preserveAndCleanup failed for orphan "${commissionId}":`,
            errorMessage(err),
          );
        }

        await syncStatusToIntegration(cId, project.name, "failed", "Recovery: state lost");

        recovered++;
      }
    }

    if (recovered === 0) {
      log.info("No commissions to recover.");
    }

    enqueueAutoDispatch();

    return recovered;
  }

  // -- Public API --

  async function createCommission(
    projectName: string,
    title: string,
    workerName: string,
    prompt: string,
    dependencies: string[] = [],
    resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number; model?: string },
    options?: { type?: CommissionType; sourceSchedule?: string },
  ): Promise<{ commissionId: string }> {
    const project = findProject(projectName);
    if (!project) {
      throw new Error(`Project "${projectName}" not found`);
    }

    const workerPkg = getWorkerByName(packages, workerName);
    if (!workerPkg) {
      throw new Error(
        `Worker "${workerName}" not found in discovered packages`,
      );
    }
    const workerMeta = workerPkg.metadata as WorkerMetadata;

    const commissionId = formatCommissionId(
      workerMeta.identity.name,
      new Date(),
    );

    // Write the artifact to the integration worktree
    const iPath = integrationWorktreePathFn(guildHallHome, projectName);
    const commissionsDir = path.join(iPath, ".lore", "commissions");
    await fs.mkdir(commissionsDir, { recursive: true });

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
      resourceOverrides && (resourceOverrides.maxTurns !== undefined || resourceOverrides.maxBudgetUsd !== undefined || resourceOverrides.model !== undefined)
        ? `\nresource_overrides:\n${
            resourceOverrides.maxTurns !== undefined
              ? `  maxTurns: ${resourceOverrides.maxTurns}\n`
              : ""
          }${
            resourceOverrides.maxBudgetUsd !== undefined
              ? `  maxBudgetUsd: ${resourceOverrides.maxBudgetUsd}\n`
              : ""
          }${
            resourceOverrides.model !== undefined
              ? `  model: ${resourceOverrides.model}\n`
              : ""
          }`
        : "";

    const commissionType: CommissionType = options?.type ?? "one-shot";
    const sourceScheduleLine = options?.sourceSchedule
      ? `\nsource_schedule: ${options.sourceSchedule}`
      : "";

    const content = `---
title: "Commission: ${escapedTitle}"
date: ${dateStr}
status: pending
type: ${commissionType}${sourceScheduleLine}
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
projectName: ${projectName}
---
`;

    const artifactPath = commissionArtifactPath(iPath, commissionId);
    await fs.writeFile(artifactPath, content, "utf-8");

    log.info(
      `created "${commissionId as string}" for project "${projectName}" (worker: ${workerName})`,
    );

    return { commissionId: commissionId as string };
  }

  async function createScheduledCommission(params: {
    projectName: string;
    title: string;
    workerName: string;
    prompt: string;
    cron: string;
    repeat?: number | null;
    dependencies?: string[];
    resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number; model?: string };
  }): Promise<{ commissionId: string }> {
    const { projectName, title, workerName, prompt, cron, dependencies = [] } = params;
    const repeat = params.repeat ?? null;

    const project = findProject(projectName);
    if (!project) {
      throw new Error(`Project "${projectName}" not found`);
    }

    if (!isValidCron(cron)) {
      throw new Error(`Invalid cron expression: "${cron}"`);
    }

    const workerPkg = getWorkerByName(packages, workerName);
    if (!workerPkg) {
      throw new Error(`Worker "${workerName}" not found in discovered packages`);
    }
    const workerMeta = workerPkg.metadata as WorkerMetadata;

    const commissionId = formatCommissionId(workerMeta.identity.name, new Date());
    const iPath = integrationWorktreePathFn(guildHallHome, projectName);
    const commissionsDir = path.join(iPath, ".lore", "commissions");
    await fs.mkdir(commissionsDir, { recursive: true });

    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const isoStr = now.toISOString();

    const escapedTitle = escapeYamlValue(title);
    const escapedPrompt = escapeYamlValue(prompt);
    const escapedDisplayTitle = escapeYamlValue(workerMeta.identity.displayTitle);

    const depsYaml = dependencies.length > 0
      ? "\n" + dependencies.map((d) => `  - ${d}`).join("\n")
      : " []";

    const ro = params.resourceOverrides;
    const resourceLines = ro && (ro.maxTurns !== undefined || ro.maxBudgetUsd !== undefined || ro.model !== undefined)
      ? `resource_overrides:\n${ro.maxTurns !== undefined ? `  maxTurns: ${ro.maxTurns}\n` : ""}${ro.maxBudgetUsd !== undefined ? `  maxBudgetUsd: ${ro.maxBudgetUsd}\n` : ""}${ro.model !== undefined ? `  model: ${ro.model}\n` : ""}`
      : "";

    const content = `---
title: "Commission: ${escapedTitle}"
date: ${dateStr}
status: active
type: scheduled
tags: [commission, scheduled]
worker: ${workerMeta.identity.name}
workerDisplayTitle: "${escapedDisplayTitle}"
prompt: "${escapedPrompt}"
dependencies:${depsYaml}
linked_artifacts: []
schedule:
  cron: "${cron}"
  repeat: ${repeat}
  runs_completed: 0
  last_run: null
  last_spawned_id: null
${resourceLines}activity_timeline:
  - timestamp: ${isoStr}
    event: created
    reason: "Scheduled commission created"
current_progress: ""
projectName: ${projectName}
---
`;

    const artifactPath = commissionArtifactPath(iPath, commissionId);
    await fs.writeFile(artifactPath, content, "utf-8");

    // Commit to claude branch under project lock
    await withProjectLock(projectName, async () => {
      await gitOps.commitAll(iPath, `Add commission: ${commissionId as string}`);
    });

    // Register with schedule lifecycle if available
    if (deps.scheduleLifecycleRef?.current) {
      deps.scheduleLifecycleRef.current.register(
        commissionId,
        projectName,
        "active",
        artifactPath,
      );
    }

    log.info(
      `created scheduled commission "${commissionId as string}" for project "${projectName}" (worker: ${workerName})`,
    );

    return { commissionId: commissionId as string };
  }

  /**
   * Transition a scheduled commission's status (pause, resume, complete).
   * Finds the schedule artifact, validates the transition, delegates
   * to the schedule lifecycle.
   */
  async function updateScheduleStatus(
    commissionId: CommissionId,
    targetStatus: string,
  ): Promise<{ outcome: string; status?: string; reason?: string }> {
    const scheduleLifecycle = deps.scheduleLifecycleRef?.current;
    if (!scheduleLifecycle) {
      throw new Error("Schedule lifecycle not available");
    }

    const found = await findProjectForCommission(commissionId);
    if (!found) {
      throw new Error(`Commission "${commissionId as string}" not found in any project`);
    }

    const iPath = integrationWorktreePathFn(guildHallHome, found.projectName);
    const artifactPath = commissionArtifactPath(iPath, commissionId);
    const currentStatus = await recordOps.readStatus(artifactPath);
    const commissionType = await recordOps.readType(artifactPath);

    if (commissionType !== "scheduled") {
      throw new Error(`Commission "${commissionId as string}" is not a scheduled commission`);
    }

    // Map (currentStatus, targetStatus) to lifecycle action
    const transitionMap: Record<string, Record<string, "pause" | "complete" | "resume" | "reactivate">> = {
      active: { paused: "pause", completed: "complete" },
      paused: { active: "resume", completed: "complete" },
      failed: { active: "reactivate" },
    };

    const action = transitionMap[currentStatus]?.[targetStatus];
    if (!action) {
      throw new Error(`Cannot transition from "${currentStatus}" to "${targetStatus}"`);
    }

    // Ensure tracked before transitioning
    if (!scheduleLifecycle.isTracked(commissionId)) {
      scheduleLifecycle.register(
        commissionId,
        found.projectName,
        currentStatus as import("@/daemon/types").ScheduledCommissionStatus,
        artifactPath,
      );
    }

    const reason = "Schedule updated via API";
    let result;
    switch (action) {
      case "pause":
        result = await scheduleLifecycle.pause(commissionId);
        break;
      case "complete":
        result = await scheduleLifecycle.complete(commissionId, reason);
        break;
      case "resume":
        result = await scheduleLifecycle.resume(commissionId);
        break;
      case "reactivate":
        result = await scheduleLifecycle.reactivate(commissionId);
        break;
    }

    if (result.outcome === "executed") {
      return { outcome: "executed", status: result.status };
    }
    return { outcome: "skipped", reason: result.reason };
  }

  async function updateCommission(
    commissionId: CommissionId,
    updates: {
      prompt?: string;
      dependencies?: string[];
      resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number; model?: string };
    },
  ): Promise<void> {
    const found = await findProjectForCommission(commissionId);
    if (!found) {
      throw new Error(
        `Commission "${commissionId as string}" not found in any project`,
      );
    }

    // Check status via lifecycle first, fall back to artifact
    let status: string | undefined = lifecycle.getStatus(commissionId);
    if (status === undefined) {
      const basePath = resolveArtifactBasePath(commissionId, found.projectName);
      try {
        status = await recordOps.readStatus(commissionArtifactPath(basePath, commissionId));
      } catch {
        // readStatus throws on missing file or field
      }
    }
    if (status === undefined) {
      throw new Error(
        `Cannot read status from commission "${commissionId as string}" artifact. The file may be corrupted.`,
      );
    }
    if (status !== "pending") {
      throw new Error(
        `Cannot update commission "${commissionId as string}": status is "${status}", must be "pending"`,
      );
    }

    const basePath = resolveArtifactBasePath(commissionId, found.projectName);
    const artifactPath = commissionArtifactPath(basePath, commissionId);
    let raw = await fs.readFile(artifactPath, "utf-8");

    if (updates.prompt !== undefined) {
      raw = replaceYamlField(raw, "prompt", `"${escapeYamlValue(updates.prompt)}"`);
    }

    if (updates.dependencies !== undefined) {
      const depsYaml = updates.dependencies.length > 0
        ? "\n" + updates.dependencies.map((d) => `  - ${d}`).join("\n")
        : "[]";
      raw = replaceYamlField(raw, "dependencies", depsYaml);
    }

    if (updates.resourceOverrides !== undefined) {
      // Read existing overrides from raw content
      const existingMaxTurnsMatch = raw.match(/^ {2}maxTurns: (\d+)$/m);
      const existingMaxBudgetMatch = raw.match(/^ {2}maxBudgetUsd: ([\d.]+)$/m);
      const existingModelMatch = raw.match(/^ {2}model: ([^\s]+)$/m);

      const maxTurns = updates.resourceOverrides.maxTurns
        ?? (existingMaxTurnsMatch ? Number(existingMaxTurnsMatch[1]) : undefined);
      const maxBudgetUsd = updates.resourceOverrides.maxBudgetUsd
        ?? (existingMaxBudgetMatch ? Number(existingMaxBudgetMatch[1]) : undefined);
      const model = updates.resourceOverrides.model
        ?? (existingModelMatch ? existingModelMatch[1] : undefined);

      if (maxTurns !== undefined || maxBudgetUsd !== undefined || model !== undefined) {
        let overrideBlock = "";
        if (maxTurns !== undefined) {
          overrideBlock += `\n  maxTurns: ${maxTurns}`;
        }
        if (maxBudgetUsd !== undefined) {
          overrideBlock += `\n  maxBudgetUsd: ${maxBudgetUsd}`;
        }
        if (model !== undefined) {
          overrideBlock += `\n  model: ${model}`;
        }

        // Check if resource_overrides field already exists
        if (/^resource_overrides:/m.test(raw)) {
          raw = replaceYamlField(raw, "resource_overrides", overrideBlock);
        } else {
          // Insert before activity_timeline
          const timelineIndex = raw.indexOf("activity_timeline:");
          if (timelineIndex !== -1) {
            raw = raw.slice(0, timelineIndex) +
              `resource_overrides:${overrideBlock}\n` +
              raw.slice(timelineIndex);
          }
        }
      }
    }

    await fs.writeFile(artifactPath, raw, "utf-8");
  }

  async function dispatchCommission(
    commissionId: CommissionId,
    attempt?: number,
  ): Promise<{ status: "accepted" | "queued" }> {
    // 1. Find the project
    const found = await findProjectForCommission(commissionId);
    if (!found) {
      throw new Error(
        `Commission "${commissionId as string}" not found in any project`,
      );
    }

    // 2. Read the artifact once for status verification and dispatch data
    const artifactPath = commissionArtifactPath(found.integrationPath, commissionId);
    let raw: string;
    try {
      raw = await fs.readFile(artifactPath, "utf-8");
    } catch {
      throw new Error(
        `Cannot read status from commission "${commissionId as string}" artifact. The file may be corrupted.`,
      );
    }
    const { data } = matter(raw);
    const currentStatus = (data.status as string | undefined) ?? "";
    if (currentStatus !== "pending") {
      throw new Error(
        `Cannot dispatch commission "${commissionId as string}": status is "${currentStatus}", must be "pending"`,
      );
    }

    // 3. Check capacity limits
    const activeMap = new Map<string, { projectName: string }>();
    for (const [id, ctx] of executions) {
      activeMap.set(id as string, { projectName: ctx.projectName });
    }
    const capacityCheck = isAtCapacity(found.projectName, activeMap, config);
    if (capacityCheck.atLimit) {
      log.info(
        `queuing "${commissionId as string}": ${capacityCheck.reason}`,
      );
      eventBus.emit({
        type: "commission_queued",
        commissionId: commissionId as string,
        reason: capacityCheck.reason,
      });
      return { status: "queued" };
    }

    const prompt = (data.prompt as string | undefined) ?? "";
    const workerName = (data.worker as string | undefined) ?? "";
    const commissionDeps = (data.dependencies as string[] | undefined) ?? [];
    const overrides = data.resource_overrides as { maxTurns?: number; maxBudgetUsd?: number; model?: string } | undefined;
    const resourceOverrides: { maxTurns?: number; maxBudgetUsd?: number; model?: string } = {};
    if (overrides?.maxTurns !== undefined) {
      resourceOverrides.maxTurns = Number(overrides.maxTurns);
    }
    if (overrides?.maxBudgetUsd !== undefined) {
      resourceOverrides.maxBudgetUsd = Number(overrides.maxBudgetUsd);
    }
    if (overrides?.model !== undefined) {
      resourceOverrides.model = String(overrides.model);
    }
    if (resourceOverrides.model !== undefined && !isValidModel(resourceOverrides.model, config)) {
      throw new Error(`Invalid model "${resourceOverrides.model}" in resource_overrides for commission "${commissionId as string}"`);
    }

    // 4. Check dependencies: block if any are not in a terminal-success state
    if (commissionDeps.length > 0) {
      const depStatuses = await Promise.all(
        commissionDeps.map(async (dep) => {
          const depPath = commissionArtifactPath(found.integrationPath, dep);
          try {
            return await recordOps.readStatus(depPath);
          } catch {
            return "missing";
          }
        }),
      );
      const allSatisfied = depStatuses.every(
        (s) => s === "completed" || s === "abandoned",
      );

      if (!allSatisfied) {
        if (!lifecycle.isTracked(commissionId)) {
          lifecycle.register(commissionId, found.projectName, "pending", artifactPath);
        }
        await lifecycle.block(commissionId);
        lifecycle.forget(commissionId);
        log.info(
          `blocking "${commissionId as string}": dependencies not yet satisfied`,
        );
        eventBus.emit({
          type: "commission_queued",
          commissionId: commissionId as string,
          reason: "Dependencies not yet satisfied",
        });
        return { status: "queued" };
      }
    }

    // Determine checkout scope
    const workerPkg = packages.find((p) => {
      if (!("identity" in p.metadata)) return false;
      return p.metadata.identity.name === workerName;
    });
    const checkoutScope: "full" | "sparse" = workerPkg && "checkoutScope" in workerPkg.metadata
      ? ((workerPkg.metadata as { checkoutScope: string }).checkoutScope as "full" | "sparse")
      : "full";

    // 5. lifecycle.dispatch (pending -> dispatched)
    const dispatchAttempt = attempt ?? 1;
    const branchName = commissionBranchNameFn(commissionId as string, dispatchAttempt > 1 ? dispatchAttempt : undefined);
    const worktreeDir = commissionWorktreePathFn(guildHallHome, found.projectName, commissionId as string);

    // Track in lifecycle
    if (!lifecycle.isTracked(commissionId)) {
      lifecycle.register(commissionId, found.projectName, "pending", artifactPath);
    }

    const dispatchResult = await lifecycle.dispatch(commissionId);
    if (dispatchResult.outcome === "skipped") {
      lifecycle.forget(commissionId);
      throw new Error(
        `Failed to dispatch "${commissionId as string}": ${dispatchResult.reason}`,
      );
    }

    // 6. workspace.prepare
    // Commit pending artifact to integration worktree first
    const iPath = integrationWorktreePathFn(guildHallHome, found.projectName);
    try {
      await gitOps.commitAll(iPath, `Add commission: ${commissionId as string}`);
    } catch (err: unknown) {
      log.warn(
        `pre-dispatch commit failed for "${commissionId as string}":`,
        errorMessage(err),
      );
    }

    try {
      await workspace.prepare({
        projectPath: found.projectPath,
        baseBranch: CLAUDE_BRANCH,
        activityBranch: branchName,
        worktreeDir,
        checkoutScope,
        sparsePatterns: checkoutScope === "sparse" ? [".lore/"] : undefined,
      });
    } catch (err: unknown) {
      const errMsg = errorMessage(err);
      log.error(
        `workspace.prepare failed for "${commissionId as string}":`,
        errMsg,
      );
      await lifecycle.executionFailed(commissionId, `Workspace preparation failed: ${errMsg}`);
      await syncStatusToIntegration(commissionId, found.projectName, "failed", `Workspace preparation failed: ${errMsg}`);
      lifecycle.forget(commissionId);
      throw new Error(`Workspace preparation failed: ${errMsg}`);
    }

    // 7. Write state file
    await writeStateFile(commissionId, {
      commissionId: commissionId as string,
      projectName: found.projectName,
      workerName,
      status: "dispatched",
      worktreeDir,
      branchName,
    });

    // 8. lifecycle.executionStarted (dispatched -> in_progress)
    const worktreeArtifactPath = commissionArtifactPath(worktreeDir, commissionId);
    const startResult = await lifecycle.executionStarted(commissionId, worktreeArtifactPath);
    if (startResult.outcome === "skipped") {
      const reason = startResult.reason;
      log.error(
        `executionStarted skipped for "${commissionId as string}": ${reason}`,
      );
      await lifecycle.executionFailed(commissionId, `Failed to enter in_progress: ${reason}`);
      try {
        await workspace.removeWorktree(worktreeDir, found.projectPath);
      } catch (cleanupErr: unknown) {
        log.warn(`Failed to clean up worktree after executionStarted skip:`, errorMessage(cleanupErr));
      }
      lifecycle.forget(commissionId);
      return { status: "accepted" };
    }

    // 9. Create execution context
    const abortController = new AbortController();
    const execCtx: ExecutionContext = {
      commissionId,
      projectName: found.projectName,
      workerName,
      worktreeDir,
      branchName,
      abortController,
      attempt: dispatchAttempt,
      checkoutScope,
    };
    executions.set(commissionId, execCtx);

    // 10. Fire-and-forget: run the session via sdk-runner
    log.info(
      `dispatching "${commissionId as string}" -> worker="${workerName}" (in-process)`,
    );

    // The services bag is passed to the toolbox resolver so the manager
    // toolbox can access the commission session, git ops, and schedule deps.
    // Only populated when the worker is the manager (identified by
    // managerPackageName). The scheduleLifecycleRef is set late by the caller
    // (createProductionApp) after the scheduler is constructed.
    const isManager = workerPkg?.name === managerPackageName;
    const services = isManager && selfRef.current
      ? {
          commissionSession: selfRef.current,
          gitOps: gitOps,
          config,
          scheduleLifecycle: deps.scheduleLifecycleRef?.current,
          recordOps,
          packages,
        }
      : undefined;

    const prepSpec: SessionPrepSpec = {
      workerName,
      packages,
      config,
      guildHallHome,
      projectName: found.projectName,
      projectPath: found.projectPath,
      workspaceDir: worktreeDir,
      contextId: commissionId as string,
      contextType: "commission",
      eventBus,
      services,
      activationExtras: {
        commissionContext: {
          commissionId: commissionId as string,
          prompt,
          dependencies: commissionDeps,
        },
      },
      abortController,
      resourceOverrides: Object.keys(resourceOverrides).length > 0 ? resourceOverrides : undefined,
    };

    void runCommissionSession(execCtx, prepSpec, prompt);

    return { status: "accepted" };
  }

  /**
   * Runs a commission session: prepare, subscribe to EventBus, drain the
   * SDK generator, unsubscribe, and handle completion. Fire-and-forget
   * from the dispatch flow.
   *
   * When send_mail is detected via commission_mail_sent, the session is
   * aborted and routed to the mail orchestrator's sleep path instead of
   * handleSessionCompletion. Sleeping commissions are removed from
   * executions so they don't count against the commission cap.
   */
  async function runCommissionSession(
    ctx: ExecutionContext,
    prepSpec: SessionPrepSpec,
    prompt: string,
  ): Promise<void> {
    let resultSubmitted = false;
    let mailSent = false;
    let mailSentData: { targetWorker: string; mailSequence: number; mailPath: string } | null = null;

    // Subscribe to EventBus for tool events matching this commission
    const unsubscribe = eventBus.subscribe((event) => {
      if (!("commissionId" in event) || event.commissionId !== (ctx.commissionId as string)) return;

      if (event.type === "commission_result") {
        resultSubmitted = true;
        const e = event as typeof event & { summary: string; artifacts?: string[] };
        lifecycle.resultSubmitted(ctx.commissionId, e.summary, e.artifacts).catch((err: unknown) => {
          log.warn(`resultSubmitted failed for "${ctx.commissionId as string}":`, errorMessage(err));
        });
      } else if (event.type === "commission_progress") {
        const e = event as typeof event & { summary: string };
        lifecycle.progressReported(ctx.commissionId, e.summary).catch((err: unknown) => {
          log.warn(`progressReported failed for "${ctx.commissionId as string}":`, errorMessage(err));
        });
      } else if (event.type === "commission_mail_sent") {
        mailSent = true;
        const e = event as typeof event & { targetWorker: string; mailSequence: number; mailPath: string };
        mailSentData = { targetWorker: e.targetWorker, mailSequence: e.mailSequence, mailPath: e.mailPath };
        // Abort the session so it drains and we can enter the sleep path
        ctx.abortController.abort();
      }
    });

    let resolvedModel: ResolvedModel | undefined;

    try {
      // 1. Prepare the SDK session (resolve tools, load memory, activate worker)
      const prepResult = await prepareSdkSession(prepSpec, prepDeps, log);
      if (!prepResult.ok) {
        await handleSessionError(ctx, new Error(prepResult.error));
        return;
      }

      resolvedModel = prepResult.result.resolvedModel;

      // 2. Run and drain the SDK session
      const { options } = prepResult.result;
      const outcome = await drainSdkSession(
        runSdkSession(queryFn, prompt, options, log),
        { maxTurns: options.maxTurns },
      );

      // 3. Check mailSent BEFORE handleSessionCompletion.
      // If mail was sent, route to the sleep path. The abort guard in
      // handleSessionCompletion would silently discard the commission.
      if (mailSent && mailSentData) {
        const { targetWorker, mailSequence, mailPath } = mailSentData;
        const sleepSuccess = await mailOrchestrator.handleSleep({
          commissionId: ctx.commissionId,
          projectName: ctx.projectName,
          workerName: ctx.workerName,
          worktreeDir: ctx.worktreeDir,
          branchName: ctx.branchName,
          targetWorker,
          mailSequence,
          mailPath,
          outcome,
        });

        // Remove from executions: sleeping commissions don't count
        // against the commission cap (REQ-MAIL-20).
        executions.delete(ctx.commissionId);

        if (!sleepSuccess) {
          lifecycle.forget(ctx.commissionId);
        }

        enqueueAutoDispatch();
        return;
      }

      // 4. Normal completion path
      await handleSessionCompletion(ctx, outcome, resultSubmitted, resolvedModel);
    } catch (err: unknown) {
      try {
        await handleSessionError(ctx, err, resolvedModel);
      } catch (innerErr: unknown) {
        log.error(
          `handleSessionError failed for ${ctx.commissionId as string}:`,
          errorMessage(innerErr),
        );
      }
    } finally {
      unsubscribe();
    }
  }

  /**
   * Continue a halted commission. Reads the halted state file, verifies the
   * worktree, checks capacity, transitions halted -> in_progress, and
   * launches a resumed SDK session with a continuation prompt
   * (REQ-COM-39, REQ-COM-40, REQ-COM-40a, REQ-COM-41).
   */
  async function continueCommission(
    commissionId: CommissionId,
  ): Promise<{ status: "accepted" | "capacity_error" }> {
    // 1. Read halted state file
    const statePath = commissionStatePath(commissionId);
    let state: HaltedCommissionState;
    try {
      const raw = await fs.readFile(statePath, "utf-8");
      state = JSON.parse(raw) as HaltedCommissionState;
    } catch {
      throw new Error(
        `Cannot continue commission "${commissionId as string}": state file not found or corrupt`,
      );
    }

    if (state.status !== "halted") {
      throw new Error(
        `Cannot continue commission "${commissionId as string}": state is "${state.status}", expected "halted"`,
      );
    }

    // 2. Verify worktree exists
    const worktreeExists = await fileExists(state.worktreeDir);
    if (!worktreeExists) {
      // Worktree is gone: transition to failed
      const iPath = integrationWorktreePathFn(guildHallHome, state.projectName);
      const artifactPath = commissionArtifactPath(iPath, commissionId);
      if (!lifecycle.isTracked(commissionId)) {
        lifecycle.register(commissionId, state.projectName, "halted", artifactPath);
      }
      await lifecycle.executionFailed(commissionId, "Worktree not found for halted commission.");
      await syncStatusToIntegration(commissionId, state.projectName, "failed", "Worktree not found for halted commission.");
      await writeStateFile(commissionId, {
        commissionId: commissionId as string,
        projectName: state.projectName,
        workerName: state.workerName,
        status: "failed",
      });
      lifecycle.forget(commissionId);
      throw new Error(
        `Cannot continue commission "${commissionId as string}": worktree not found`,
      );
    }

    // 3. Check capacity (REQ-COM-47)
    const activeMap = new Map<string, { projectName: string }>();
    for (const [id, ctx] of executions) {
      activeMap.set(id as string, { projectName: ctx.projectName });
    }
    const capacityCheck = isAtCapacity(state.projectName, activeMap, config);
    if (capacityCheck.atLimit) {
      log.info(
        `cannot continue "${commissionId as string}": ${capacityCheck.reason}`,
      );
      return { status: "capacity_error" };
    }

    // 4. Transition halted -> in_progress
    const iPath = integrationWorktreePathFn(guildHallHome, state.projectName);
    const artifactPath = commissionArtifactPath(iPath, commissionId);
    if (!lifecycle.isTracked(commissionId)) {
      lifecycle.register(commissionId, state.projectName, "halted", artifactPath);
    }
    const continueResult = await lifecycle.continueHalted(
      commissionId,
      "Continued from halted state",
    );
    if (continueResult.outcome === "skipped") {
      throw new Error(
        `Cannot continue commission "${commissionId as string}": ${continueResult.reason}`,
      );
    }

    // 5. Update state file to in_progress
    await writeStateFile(commissionId, {
      commissionId: commissionId as string,
      projectName: state.projectName,
      workerName: state.workerName,
      status: "in_progress",
      worktreeDir: state.worktreeDir,
      branchName: state.branchName,
    });

    // 6. Append timeline event (REQ-COM-45a)
    const worktreeArtifactPath = commissionArtifactPath(state.worktreeDir, commissionId);
    try {
      await recordOps.appendTimeline(
        worktreeArtifactPath,
        "status_in_progress",
        "Continued from halted state",
      );
    } catch (err: unknown) {
      log.warn(`failed to append continuation timeline:`, errorMessage(err));
    }

    // 7. Build continuation prompt (REQ-COM-41)
    const lastProgress = state.lastProgress || "(no progress recorded)";
    const continuationPrompt = [
      `This commission was halted because it reached the turn limit (${state.turnsUsed} turns used).`,
      "",
      `Your last progress update was: ${lastProgress}`,
      "",
      "Continue working on the commission from where you left off. Your worktree contains all the work you've done so far. Review what remains and complete the task. When finished, call submit_result with your summary.",
    ].join("\n");

    // 8. Read resource_overrides from integration artifact for fresh turn budget (REQ-COM-40a)
    let resourceOverrides: { maxTurns?: number; maxBudgetUsd?: number; model?: string } | undefined;
    try {
      const iArtifactPath = commissionArtifactPath(iPath, commissionId);
      const artRaw = await fs.readFile(iArtifactPath, "utf-8");
      const { data } = matter(artRaw);
      const overrides = data.resource_overrides as { maxTurns?: number; maxBudgetUsd?: number; model?: string } | undefined;
      if (overrides && Object.keys(overrides).length > 0) {
        resourceOverrides = {};
        if (overrides.maxTurns !== undefined) resourceOverrides.maxTurns = Number(overrides.maxTurns);
        if (overrides.maxBudgetUsd !== undefined) resourceOverrides.maxBudgetUsd = Number(overrides.maxBudgetUsd);
        if (overrides.model !== undefined) resourceOverrides.model = String(overrides.model);
      }
    } catch (err: unknown) {
      log.warn(`failed to read resource_overrides for "${commissionId as string}":`, errorMessage(err));
    }

    // 9. Create ExecutionContext and add to executions map
    const abortController = new AbortController();
    const execCtx: ExecutionContext = {
      commissionId,
      projectName: state.projectName,
      workerName: state.workerName,
      worktreeDir: state.worktreeDir,
      branchName: state.branchName,
      abortController,
      attempt: 0,
      checkoutScope: "full",
    };
    executions.set(commissionId, execCtx);

    // 10. Find project for the session
    const project = findProject(state.projectName);
    if (!project) {
      executions.delete(commissionId);
      throw new Error(
        `Project "${state.projectName}" not found during continue`,
      );
    }

    // 11. Build SessionPrepSpec with resume (REQ-COM-40)
    const workerPkg = packages.find((p) => {
      if (!("identity" in p.metadata)) return false;
      return p.metadata.identity.name === state.workerName;
    });
    const isManager = workerPkg?.name === (deps.managerPackageName ?? "guild-hall-manager");
    const services = isManager && selfRef.current
      ? {
          commissionSession: selfRef.current,
          gitOps: gitOps,
          config,
          scheduleLifecycle: deps.scheduleLifecycleRef?.current,
          recordOps,
          packages,
        }
      : undefined;

    const prepSpec: SessionPrepSpec = {
      workerName: state.workerName,
      packages,
      config,
      guildHallHome,
      projectName: state.projectName,
      projectPath: project.path,
      workspaceDir: state.worktreeDir,
      contextId: commissionId as string,
      contextType: "commission",
      eventBus,
      services,
      activationExtras: {
        commissionContext: {
          commissionId: commissionId as string,
          prompt: continuationPrompt,
          dependencies: [],
        },
      },
      abortController,
      resume: state.sessionId,
      resourceOverrides,
    };

    log.info(
      `continuing "${commissionId as string}" -> worker="${state.workerName}" (resume session ${state.sessionId})`,
    );

    // 12. Fire-and-forget: run the resumed session
    void runCommissionSession(execCtx, prepSpec, continuationPrompt);

    return { status: "accepted" };
  }

  async function cancelCommission(
    commissionId: CommissionId,
    reason = "Commission cancelled by user",
  ): Promise<void> {
    const ctx = executions.get(commissionId);

    if (ctx) {
      // Active commission: abort + preserve + cleanup
      ctx.abortController.abort();

      try {
        await lifecycle.cancel(commissionId, reason);
      } catch (err: unknown) {
        log.warn(`lifecycle.cancel failed for "${commissionId as string}" (continuing cleanup):`, errorMessage(err));
      }

      await preserveAndCleanup(ctx, reason);
      await syncStatusToIntegration(commissionId, ctx.projectName, "cancelled", reason);
      await writeStateFile(commissionId, {
        commissionId: commissionId as string,
        projectName: ctx.projectName,
        workerName: ctx.workerName,
        status: "cancelled",
      });

      executions.delete(commissionId);
      lifecycle.forget(commissionId);
      enqueueAutoDispatch();
      return;
    }

    // Sleeping commission: cancel with mail-aware cleanup
    const status = lifecycle.getStatus(commissionId);
    if (status === "sleeping") {
      await cancelSleepingCommission(commissionId, reason, "cancelled");
      return;
    }

    // Pending/blocked commission: cancel via lifecycle, then forget
    if (status !== undefined) {
      await lifecycle.cancel(commissionId, reason);

      // Sync status to integration
      const projectName = lifecycle.getProjectName(commissionId);
      if (projectName) {
        await syncStatusToIntegration(commissionId, projectName, "cancelled", reason);
      }

      lifecycle.forget(commissionId);
      enqueueAutoDispatch();
      return;
    }

    // Not tracked at all: try to find in integration worktree and cancel via lifecycle
    const found = await findProjectForCommission(commissionId);
    if (!found) {
      throw new Error(
        `Commission "${commissionId as string}" not found in active commissions`,
      );
    }

    // Read status from artifact
    let cancelStatus: string;
    try {
      cancelStatus = await recordOps.readStatus(
        commissionArtifactPath(found.integrationPath, commissionId),
      );
    } catch {
      throw new Error(
        `Cannot cancel commission "${commissionId as string}": unable to read status`,
      );
    }
    if (cancelStatus !== "pending" && cancelStatus !== "blocked") {
      throw new Error(
        `Cannot cancel commission "${commissionId as string}": current state is "${cancelStatus}"`,
      );
    }

    const cancelArtifactPath = commissionArtifactPath(found.integrationPath, commissionId);
    lifecycle.register(commissionId, found.projectName, cancelStatus as CommissionStatus, cancelArtifactPath);
    await lifecycle.cancel(commissionId, reason);
    lifecycle.forget(commissionId);
  }

  async function abandonCommission(
    commissionId: CommissionId,
    reason: string,
  ): Promise<void> {
    // Reject if commission has an active execution context
    if (executions.has(commissionId)) {
      throw new Error(
        `Cannot abandon commission "${commissionId as string}": it has an active session. Cancel it first.`,
      );
    }

    // Sleeping commission: abandon with mail-aware cleanup
    const status = lifecycle.getStatus(commissionId);
    if (status === "sleeping") {
      await cancelSleepingCommission(commissionId, reason, "abandoned");
      return;
    }

    // Check if tracked in lifecycle
    if (status !== undefined) {
      await lifecycle.abandon(commissionId, reason);
      lifecycle.forget(commissionId);

      const projectName = lifecycle.getProjectName(commissionId);
      if (projectName) {
        await checkDependencyTransitions(projectName);
      }
      return;
    }

    // Not tracked: find in integration worktree
    const found = await findProjectForCommission(commissionId);
    if (!found) {
      throw new Error(
        `Commission "${commissionId as string}" not found in any project`,
      );
    }

    let abandonStatus: string;
    try {
      abandonStatus = await recordOps.readStatus(
        commissionArtifactPath(found.integrationPath, commissionId),
      );
    } catch {
      throw new Error(
        `Cannot abandon commission "${commissionId as string}": unable to read status`,
      );
    }

    const abandonArtifactPath = commissionArtifactPath(found.integrationPath, commissionId);
    lifecycle.register(commissionId, found.projectName, abandonStatus as CommissionStatus, abandonArtifactPath);
    await lifecycle.abandon(commissionId, reason);
    lifecycle.forget(commissionId);

    await checkDependencyTransitions(found.projectName);
  }

  async function redispatchCommission(
    commissionId: CommissionId,
  ): Promise<{ status: "accepted" | "queued" }> {
    const found = await findProjectForCommission(commissionId);
    if (!found) {
      throw new Error(
        `Commission "${commissionId as string}" not found in any project`,
      );
    }

    let redispatchStatus: string;
    try {
      redispatchStatus = await recordOps.readStatus(
        commissionArtifactPath(found.integrationPath, commissionId),
      );
    } catch {
      throw new Error(
        `Cannot read status from commission "${commissionId as string}" artifact. The file may be corrupted.`,
      );
    }
    if (redispatchStatus !== "failed" && redispatchStatus !== "cancelled") {
      throw new Error(
        `Cannot redispatch commission "${commissionId as string}": status is "${redispatchStatus}", must be "failed" or "cancelled"`,
      );
    }

    const previousDispatches = await getDispatchAttempt(
      found.integrationPath,
      commissionId,
    );
    const attempt = previousDispatches + 1;

    log.info(
      `redispatching "${commissionId as string}" (was ${redispatchStatus}, attempt ${attempt})`,
    );

    // Reset status to pending via lifecycle
    if (!lifecycle.isTracked(commissionId)) {
      const redispatchArtifactPath = commissionArtifactPath(found.integrationPath, commissionId);
      lifecycle.register(commissionId, found.projectName, redispatchStatus as CommissionStatus, redispatchArtifactPath);
    }
    await lifecycle.redispatch(commissionId);
    lifecycle.forget(commissionId);

    return dispatchCommission(commissionId, attempt);
  }

  async function addUserNote(
    commissionId: CommissionId,
    content: string,
  ): Promise<void> {
    const found = await findProjectForCommission(commissionId);
    if (!found) {
      throw new Error(
        `Commission "${commissionId as string}" not found in any project`,
      );
    }

    const basePath = resolveArtifactBasePath(commissionId, found.projectName);
    const noteArtifactPath = commissionArtifactPath(basePath, commissionId);
    try {
      await recordOps.appendTimeline(
        noteArtifactPath,
        "user_note",
        content,
      );
    } catch (err: unknown) {
      // Activity worktree may have been cleaned up already; fall back to
      // integration worktree so the note is not lost.
      // recordOps.appendTimeline wraps ENOENT in a descriptive Error with
      // "artifact not found" in the message, so we check for that pattern
      // in addition to raw ENOENT from direct fs calls.
      const isNotFound =
        (isNodeError(err) && err.code === "ENOENT") ||
        (err instanceof Error && err.message.includes("artifact not found"));
      if (isNotFound && basePath !== found.integrationPath) {
        log.warn(
          `addUserNote: activity worktree missing for "${commissionId as string}", falling back to integration worktree`,
        );
        await recordOps.appendTimeline(
          commissionArtifactPath(found.integrationPath, commissionId),
          "user_note",
          content,
        );
      } else {
        throw err;
      }
    }

    eventBus.emit({
      type: "commission_manager_note",
      commissionId: commissionId as string,
      content,
    });
  }

  function getActiveCommissions(): number {
    return executions.size;
  }

  function shutdown(): void {
    for (const [, ctx] of executions) {
      ctx.abortController.abort();
    }
    mailOrchestrator.shutdownReaders();
  }

  // Self-reference for passing as services to the toolbox resolver.
  // The manager toolbox needs commissionSession + gitOps; since the
  // orchestrator IS the commission session, it passes itself. The ref
  // is populated immediately after construction in the return statement.
  const selfRef: { current: CommissionSessionForRoutes | null } = { current: null };

  const result: CommissionSessionForRoutes = {
    createCommission,
    createScheduledCommission,
    updateScheduleStatus,
    updateCommission,
    dispatchCommission,
    continueCommission,
    cancelCommission,
    abandonCommission,
    redispatchCommission,
    addUserNote,
    checkDependencyTransitions,
    recoverCommissions,
    getActiveCommissions,
    shutdown,
  };

  selfRef.current = result;

  return result;
}
