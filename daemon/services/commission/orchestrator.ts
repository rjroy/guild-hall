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
import type { CommissionId, CommissionStatus } from "@/daemon/types";
import { asCommissionId } from "@/daemon/types";
import type {
  AppConfig,
  DiscoveredPackage,
  WorkerMetadata,
} from "@/lib/types";
import { isNodeError } from "@/lib/types";
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
  type SessionPrepSpec,
  type SessionPrepDeps,
  type SdkRunnerOutcome,
  type SdkQueryOptions,
} from "@/daemon/lib/agent-sdk/sdk-runner";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { isAtCapacity } from "@/daemon/services/commission/capacity";
import { escalateMergeConflict } from "@/daemon/lib/escalation";

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
      console.warn(`[orchestrator] Failed to delete state file for "${commissionId as string}":`, errorMessage(err));
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
      console.warn(
        `[orchestrator] Failed to sync status "${status}" to integration worktree for ${commissionId as string}:`,
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
      console.error(
        "[orchestrator] auto-dispatch chain error:",
        errorMessage(err),
      );
    });
  }

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
          console.warn(`[orchestrator] scanPendingCommissions: failed to read "${cId as string}":`, errorMessage(err));
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
        console.log(
          `[orchestrator] auto-dispatching "${candidate.commissionId as string}" from queue (FIFO)`,
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
        console.warn(
          `[orchestrator] auto-dispatch failed for "${candidate.commissionId as string}":`,
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

    try {
      if (resultSubmitted) {
        // Result was submitted: attempt finalize (squash-merge)
        await handleSuccessfulCompletion(ctx);
      } else {
        // No result submitted: fail
        const reason = outcome.error
          ? `Session error: ${outcome.error}`
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

  async function handleSuccessfulCompletion(ctx: ExecutionContext): Promise<void> {
    // Transition to completed
    const completeResult = await lifecycle.executionCompleted(ctx.commissionId);
    if (completeResult.outcome === "skipped") {
      console.warn(
        `[orchestrator] executionCompleted skipped for "${ctx.commissionId as string}": ${completeResult.reason}`,
      );
      await preserveAndCleanup(ctx, "executionCompleted skipped: " + completeResult.reason);
      return;
    }

    // Squash-merge via workspace.finalize
    const project = findProject(ctx.projectName);
    if (!project) {
      console.error(
        `[orchestrator] project "${ctx.projectName}" not found during finalize`,
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
      console.error(
        `[orchestrator] finalize threw for "${ctx.commissionId as string}":`,
        errMsg,
      );
      await failAndCleanup(ctx, `Finalize error: ${errMsg}`);
      return;
    }

    if (finalizeResult.merged) {
      // Clean merge
      eventBus.emit({
        type: "commission_status",
        commissionId: ctx.commissionId as string,
        status: "completed",
        reason: "Execution completed",
      });
      await syncStatusToIntegration(ctx.commissionId, ctx.projectName, "completed", "Execution completed");
      await deleteStateFile(ctx.commissionId);
      console.log(
        `[orchestrator] "${ctx.commissionId as string}" squash-merged to claude and cleaned up`,
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

      console.log(
        `[orchestrator] "${ctx.commissionId as string}" merge failed: ${conflictReason}`,
      );
    }
  }

  async function handleSessionError(ctx: ExecutionContext, error: unknown): Promise<void> {
    const currentStatus = lifecycle.getStatus(ctx.commissionId);
    if (!currentStatus || currentStatus === "cancelled" || currentStatus === "failed") {
      executions.delete(ctx.commissionId);
      lifecycle.forget(ctx.commissionId);
      return;
    }

    const reason = error instanceof Error
      ? `Session error: ${error.message}`
      : `Session error: ${String(error)}`;

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
      console.error(`[orchestrator] executionFailed threw for "${ctx.commissionId as string}":`, errorMessage(err));
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
      console.warn(
        `[orchestrator] preserveAndCleanup failed for "${ctx.commissionId as string}":`,
        errorMessage(err),
      );
    }
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
          console.warn(`[orchestrator] checkDependencyTransitions: failed to read status for "${cId as string}":`, errorMessage(err));
          return null;
        }

        if (status !== "blocked" && status !== "pending") return null;

        let dependencies: string[];
        try {
          dependencies = await recordOps.readDependencies(cArtifactPath);
        } catch (err: unknown) {
          console.warn(`[orchestrator] checkDependencyTransitions: failed to read dependencies for "${cId as string}":`, errorMessage(err));
          return null;
        }

        if (dependencies.length === 0) return null;

        const depChecks = await Promise.all(
          dependencies.map((dep) => fileExists(path.join(iPath, dep))),
        );
        const allSatisfied = depChecks.every(Boolean);

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
          console.log(
            `[orchestrator] dependency auto-transition: "${cId as string}" blocked -> pending (all deps satisfied)`,
          );
        } catch (err: unknown) {
          lifecycle.forget(cId);
          console.warn(
            `[orchestrator] Failed to auto-transition "${cId as string}" blocked -> pending:`,
            errorMessage(err),
          );
        }
      } else if (status === "pending" && !allSatisfied) {
        try {
          lifecycle.register(cId, projectName, "pending", cArtifactPath);
          await lifecycle.block(cId);
          lifecycle.forget(cId);
          console.log(
            `[orchestrator] dependency auto-transition: "${cId as string}" pending -> blocked (missing dep)`,
          );
        } catch (err: unknown) {
          lifecycle.forget(cId);
          console.warn(
            `[orchestrator] Failed to auto-transition "${cId as string}" pending -> blocked:`,
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
        console.log("[orchestrator-recovery] No commissions state directory found, scanning for orphaned worktrees.");
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
        console.warn(
          `[orchestrator-recovery] Corrupt state file "${file}", skipping:`,
          errorMessage(err),
        );
        continue;
      }

      stateFileCommissionIds.add(state.commissionId);

      // Only recover active commissions (dispatched or in_progress)
      if (state.status !== "dispatched" && state.status !== "in_progress") {
        continue;
      }

      const project = config.projects.find((p) => p.name === state.projectName);
      if (!project) {
        console.warn(
          `[orchestrator-recovery] Commission "${state.commissionId}" references unknown project "${state.projectName}", skipping.`,
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

      console.log(
        `[orchestrator-recovery] Commission "${state.commissionId}" was ${state.status} when daemon stopped, transitioning to failed.`,
      );

      try {
        await lifecycle.executionFailed(cId, "Recovery: process lost on restart");
      } catch (err: unknown) {
        console.error(
          `[orchestrator-recovery] Failed to transition "${state.commissionId}" to failed:`,
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
            console.warn(
              `[orchestrator-recovery] preserveAndCleanup failed for "${state.commissionId}":`,
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
        console.warn(
          `[orchestrator-recovery] Failed to scan worktree root for "${project.name}":`,
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

        console.log(
          `[orchestrator-recovery] Found orphaned worktree "${commissionId}" for project "${project.name}" (no state file), transitioning to failed.`,
        );

        const branchName = commissionBranchNameFn(commissionId);
        const iPath = integrationWorktreePathFn(guildHallHome, project.name);
        const artifactPath = commissionArtifactPath(iPath, cId);

        lifecycle.register(cId, project.name, "in_progress", artifactPath);

        try {
          await lifecycle.executionFailed(cId, "Recovery: state lost");
        } catch (err: unknown) {
          console.error(
            `[orchestrator-recovery] Failed to transition orphan "${commissionId}" to failed:`,
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
          console.warn(
            `[orchestrator-recovery] preserveAndCleanup failed for orphan "${commissionId}":`,
            errorMessage(err),
          );
        }

        await syncStatusToIntegration(cId, project.name, "failed", "Recovery: state lost");

        recovered++;
      }
    }

    if (recovered === 0) {
      console.log("[orchestrator-recovery] No commissions to recover.");
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
    resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number },
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
projectName: ${projectName}
---
`;

    const artifactPath = commissionArtifactPath(iPath, commissionId);
    await fs.writeFile(artifactPath, content, "utf-8");

    console.log(
      `[orchestrator] created "${commissionId as string}" for project "${projectName}" (worker: ${workerName})`,
    );

    return { commissionId: commissionId as string };
  }

  async function updateCommission(
    commissionId: CommissionId,
    updates: {
      prompt?: string;
      dependencies?: string[];
      resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number };
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

      const maxTurns = updates.resourceOverrides.maxTurns
        ?? (existingMaxTurnsMatch ? Number(existingMaxTurnsMatch[1]) : undefined);
      const maxBudgetUsd = updates.resourceOverrides.maxBudgetUsd
        ?? (existingMaxBudgetMatch ? Number(existingMaxBudgetMatch[1]) : undefined);

      if (maxTurns !== undefined || maxBudgetUsd !== undefined) {
        let overrideBlock = "";
        if (maxTurns !== undefined) {
          overrideBlock += `\n  maxTurns: ${maxTurns}`;
        }
        if (maxBudgetUsd !== undefined) {
          overrideBlock += `\n  maxBudgetUsd: ${maxBudgetUsd}`;
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
      console.log(
        `[orchestrator] queuing "${commissionId as string}": ${capacityCheck.reason}`,
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
    const overrides = data.resource_overrides as { maxTurns?: number; maxBudgetUsd?: number } | undefined;
    const resourceOverrides: { maxTurns?: number; maxBudgetUsd?: number } = {};
    if (overrides?.maxTurns !== undefined) {
      resourceOverrides.maxTurns = Number(overrides.maxTurns);
    }
    if (overrides?.maxBudgetUsd !== undefined) {
      resourceOverrides.maxBudgetUsd = Number(overrides.maxBudgetUsd);
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
      console.warn(
        `[orchestrator] pre-dispatch commit failed for "${commissionId as string}":`,
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
      console.error(
        `[orchestrator] workspace.prepare failed for "${commissionId as string}":`,
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
      console.error(
        `[orchestrator] executionStarted skipped for "${commissionId as string}": ${reason}`,
      );
      await lifecycle.executionFailed(commissionId, `Failed to enter in_progress: ${reason}`);
      try {
        await workspace.removeWorktree(worktreeDir, found.projectPath);
      } catch (cleanupErr: unknown) {
        console.warn(`[orchestrator] Failed to clean up worktree after executionStarted skip:`, errorMessage(cleanupErr));
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
    console.log(
      `[orchestrator] dispatching "${commissionId as string}" -> worker="${workerName}" (in-process)`,
    );

    // The services bag is passed to the toolbox resolver so the manager
    // toolbox can access the commission session and git ops. Only populated
    // when the worker is the manager (identified by managerPackageName).
    const isManager = workerPkg?.name === managerPackageName;
    const services = isManager && selfRef.current
      ? { commissionSession: selfRef.current, gitOps: gitOps }
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
   */
  async function runCommissionSession(
    ctx: ExecutionContext,
    prepSpec: SessionPrepSpec,
    prompt: string,
  ): Promise<void> {
    let resultSubmitted = false;

    // Subscribe to EventBus for tool events matching this commission
    const unsubscribe = eventBus.subscribe((event) => {
      if (!("commissionId" in event) || event.commissionId !== (ctx.commissionId as string)) return;

      if (event.type === "commission_result") {
        resultSubmitted = true;
        const e = event as typeof event & { summary: string; artifacts?: string[] };
        lifecycle.resultSubmitted(ctx.commissionId, e.summary, e.artifacts).catch((err: unknown) => {
          console.warn(`[orchestrator] resultSubmitted failed for "${ctx.commissionId as string}":`, errorMessage(err));
        });
      } else if (event.type === "commission_progress") {
        const e = event as typeof event & { summary: string };
        lifecycle.progressReported(ctx.commissionId, e.summary).catch((err: unknown) => {
          console.warn(`[orchestrator] progressReported failed for "${ctx.commissionId as string}":`, errorMessage(err));
        });
      } else if (event.type === "commission_question") {
        const e = event as typeof event & { question: string };
        lifecycle.questionLogged(ctx.commissionId, e.question).catch((err: unknown) => {
          console.warn(`[orchestrator] questionLogged failed for "${ctx.commissionId as string}":`, errorMessage(err));
        });
      }
    });

    try {
      // 1. Prepare the SDK session (resolve tools, load memory, activate worker)
      const prepResult = await prepareSdkSession(prepSpec, prepDeps);
      if (!prepResult.ok) {
        await handleSessionError(ctx, new Error(prepResult.error));
        return;
      }

      // 2. Run and drain the SDK session
      const { options } = prepResult.result;
      const outcome = await drainSdkSession(runSdkSession(queryFn, prompt, options));

      // 3. Handle completion
      await handleSessionCompletion(ctx, outcome, resultSubmitted);
    } catch (err: unknown) {
      try {
        await handleSessionError(ctx, err);
      } catch (innerErr: unknown) {
        console.error(
          `[orchestrator] handleSessionError failed for ${ctx.commissionId as string}:`,
          errorMessage(innerErr),
        );
      }
    } finally {
      unsubscribe();
    }
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
        console.warn(`[orchestrator] lifecycle.cancel failed for "${commissionId as string}" (continuing cleanup):`, errorMessage(err));
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

    // Pending/blocked commission: cancel via lifecycle, then forget
    const status = lifecycle.getStatus(commissionId);
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

    console.log(
      `[orchestrator] redispatching "${commissionId as string}" (was ${redispatchStatus}, attempt ${attempt})`,
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
        console.warn(
          `[orchestrator] addUserNote: activity worktree missing for "${commissionId as string}", falling back to integration worktree`,
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
  }

  // Self-reference for passing as services to the toolbox resolver.
  // The manager toolbox needs commissionSession + gitOps; since the
  // orchestrator IS the commission session, it passes itself. The ref
  // is populated immediately after construction in the return statement.
  const selfRef: { current: CommissionSessionForRoutes | null } = { current: null };

  const result: CommissionSessionForRoutes = {
    createCommission,
    updateCommission,
    dispatchCommission,
    cancelCommission,
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
