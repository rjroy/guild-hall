/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/unbound-method */

/**
 * Tests for commission handlers and graph configuration.
 *
 * Covers:
 * - Transition graph: every valid edge exists, invalid edges are absent
 * - Configuration constants: activeStates and cleanupStates correctness
 * - Factory function: returns all required components with correct types
 * - Abandoned handler (fully implemented): emits event, syncs status,
 *   writes state file, does no git operations
 * - Handler signatures: all handlers match expected types and states
 */

import { describe, test, expect, mock } from "bun:test";
import type { CommissionId, CommissionStatus } from "@/daemon/types";
import { asCommissionId } from "@/daemon/types";
import type { EnterHandler, ExitHandler } from "@/daemon/lib/activity-state-machine";
import type { SystemEvent } from "@/daemon/services/event-bus";
import {
  COMMISSION_TRANSITIONS,
  COMMISSION_ACTIVE_STATES,
  COMMISSION_CLEANUP_STATES,
  createCommissionHandlers,
  createEnterAbandoned,
  createEnterDispatched,
  createEnterInProgress,
  createEnterCompleted,
  createEnterFailed,
  createEnterCancelled,
  createExitInProgress,
  createCommissionArtifactOps,
  type CommissionHandlerDeps,
  type ActiveCommissionEntry,
  type CommissionTransitionContext,
} from "@/daemon/services/commission-handlers";

// -- Test helpers --

function makeEntry(overrides?: Partial<ActiveCommissionEntry>): ActiveCommissionEntry {
  return {
    commissionId: asCommissionId("commission-researcher-20260301-100000"),
    projectName: "test-project",
    workerName: "researcher",
    startTime: new Date("2026-03-01T10:00:00Z"),
    lastActivity: new Date("2026-03-01T10:00:00Z"),
    status: "pending",
    resultSubmitted: false,
    ...overrides,
  };
}

function makeContext(overrides?: Partial<CommissionTransitionContext>): CommissionTransitionContext {
  const id = asCommissionId("commission-researcher-20260301-100000");
  return {
    id,
    entry: makeEntry(),
    sourceState: "pending",
    targetState: "abandoned",
    reason: "Test transition",
    ...overrides,
  };
}

function createMockDeps(): CommissionHandlerDeps & {
  emittedEvents: SystemEvent[];
  writtenStateFiles: Array<{ id: string; data: Record<string, unknown> }>;
  syncedStatuses: Array<{ status: CommissionStatus; reason: string }>;
} {
  const emittedEvents: SystemEvent[] = [];
  const writtenStateFiles: Array<{ id: string; data: Record<string, unknown> }> = [];
  const syncedStatuses: Array<{ status: CommissionStatus; reason: string }> = [];

  return {
    emittedEvents,
    writtenStateFiles,
    syncedStatuses,
    eventBus: {
      emit: (event: SystemEvent) => {
        emittedEvents.push(event);
      },
    },
    git: {
      createBranch: mock(async () => {}),
      branchExists: mock(async () => false),
      deleteBranch: mock(async () => {}),
      createWorktree: mock(async () => {}),
      removeWorktree: mock(async () => {}),
      configureSparseCheckout: mock(async () => {}),
      commitAll: mock(async () => false),
      squashMerge: mock(async () => {}),
      hasUncommittedChanges: mock(async () => false),
      rebase: mock(async () => {}),
      currentBranch: mock(async () => "test-branch"),
      listWorktrees: mock(async () => []),
      initClaudeBranch: mock(async () => {}),
      detectDefaultBranch: mock(async () => "main"),
      fetch: mock(async () => {}),
      push: mock(async () => {}),
      resetHard: mock(async () => {}),
      resetSoft: mock(async () => {}),
      createPullRequest: mock(async () => ({ url: "https://example.com/pr/1" })),
      isAncestor: mock(async () => false),
      treesEqual: mock(async () => false),
      revParse: mock(async () => "abc123"),
      rebaseOnto: mock(async () => {}),
      merge: mock(async () => {}),
      squashMergeNoCommit: mock(async () => true),
      listConflictedFiles: mock(async () => []),
      resolveConflictsTheirs: mock(async () => {}),
      mergeAbort: mock(async () => {}),
    },
    writeStateFile: async (id: CommissionId, data: Record<string, unknown>) => {
      writtenStateFiles.push({ id: id as string, data });
    },
    syncStatusToIntegration: async (
      _entry: ActiveCommissionEntry,
      status: CommissionStatus,
      reason: string,
    ) => {
      syncedStatuses.push({ status, reason });
    },
    finalizeActivity: mock(async () => ({ merged: true, preserved: false })),
    createMeetingRequest: mock(async () => {}),
    deleteStateFile: mock(async () => {}),
    managerPackageName: "guild-master",
    findProjectPath: (_name: string) => "/fake/project/path",
    fileExists: mock(async () => true),
    integrationWorktreePath: (name: string) => `/fake/guild-hall/projects/${name}`,
    commissionWorktreePath: (name: string, id: string) => `/fake/guild-hall/worktrees/${name}/${id}`,
    commissionBranchName: (id: string, attempt?: number) =>
      attempt ? `claude/commission/${id}-${attempt}` : `claude/commission/${id}`,
    claudeBranch: "claude/main",
    preserveAndCleanupWorktree: mock(async () => {}),
    checkDependencyTransitions: mock(async () => {}),
    enqueueAutoDispatch: mock(() => {}),
  };
}

// -- Transition graph tests --

describe("COMMISSION_TRANSITIONS", () => {
  test("defines all eight statuses", () => {
    const allStatuses: CommissionStatus[] = [
      "pending", "blocked", "dispatched", "in_progress",
      "completed", "failed", "cancelled", "abandoned",
    ];
    for (const s of allStatuses) {
      expect(COMMISSION_TRANSITIONS[s]).toBeDefined();
    }
  });

  test("pending can transition to dispatched, blocked, cancelled, abandoned", () => {
    const targets = COMMISSION_TRANSITIONS.pending;
    expect(targets).toContain("dispatched");
    expect(targets).toContain("blocked");
    expect(targets).toContain("cancelled");
    expect(targets).toContain("abandoned");
    expect(targets).toHaveLength(4);
  });

  test("blocked can transition to pending, cancelled, abandoned", () => {
    const targets = COMMISSION_TRANSITIONS.blocked;
    expect(targets).toContain("pending");
    expect(targets).toContain("cancelled");
    expect(targets).toContain("abandoned");
    expect(targets).toHaveLength(3);
  });

  test("dispatched can transition to in_progress, failed, cancelled", () => {
    const targets = COMMISSION_TRANSITIONS.dispatched;
    expect(targets).toContain("in_progress");
    expect(targets).toContain("failed");
    expect(targets).toContain("cancelled");
    expect(targets).toHaveLength(3);
  });

  test("in_progress can transition to completed, failed, cancelled", () => {
    const targets = COMMISSION_TRANSITIONS.in_progress;
    expect(targets).toContain("completed");
    expect(targets).toContain("failed");
    expect(targets).toContain("cancelled");
    expect(targets).toHaveLength(3);
  });

  test("completed can transition to failed (merge conflict)", () => {
    const targets = COMMISSION_TRANSITIONS.completed;
    expect(targets).toContain("failed");
    expect(targets).toHaveLength(1);
  });

  test("failed can transition to pending (redispatch), abandoned", () => {
    const targets = COMMISSION_TRANSITIONS.failed;
    expect(targets).toContain("pending");
    expect(targets).toContain("abandoned");
    expect(targets).toHaveLength(2);
  });

  test("cancelled can transition to pending (redispatch), abandoned", () => {
    const targets = COMMISSION_TRANSITIONS.cancelled;
    expect(targets).toContain("pending");
    expect(targets).toContain("abandoned");
    expect(targets).toHaveLength(2);
  });

  test("abandoned is terminal (no outgoing edges)", () => {
    expect(COMMISSION_TRANSITIONS.abandoned).toHaveLength(0);
  });

  describe("invalid edges are absent", () => {
    const invalidEdges: [CommissionStatus, CommissionStatus][] = [
      ["pending", "in_progress"],
      ["pending", "completed"],
      ["pending", "failed"],
      ["blocked", "dispatched"],
      ["blocked", "in_progress"],
      ["blocked", "completed"],
      ["blocked", "failed"],
      ["dispatched", "pending"],
      ["dispatched", "completed"],
      ["dispatched", "blocked"],
      ["dispatched", "abandoned"],
      ["in_progress", "pending"],
      ["in_progress", "dispatched"],
      ["in_progress", "blocked"],
      ["in_progress", "abandoned"],
      ["completed", "pending"],
      ["completed", "dispatched"],
      ["completed", "in_progress"],
      ["completed", "cancelled"],
      ["completed", "blocked"],
      ["completed", "abandoned"],
      ["abandoned", "pending"],
      ["abandoned", "dispatched"],
      ["abandoned", "failed"],
      ["abandoned", "completed"],
      ["abandoned", "cancelled"],
      ["abandoned", "blocked"],
      ["abandoned", "in_progress"],
    ];

    for (const [from, to] of invalidEdges) {
      test(`${from} -> ${to} is not allowed`, () => {
        expect(COMMISSION_TRANSITIONS[from]).not.toContain(to);
      });
    }
  });
});

// -- Configuration constants tests --

describe("Configuration constants", () => {
  test("activeStates contains dispatched and in_progress", () => {
    expect(COMMISSION_ACTIVE_STATES).toContain("dispatched");
    expect(COMMISSION_ACTIVE_STATES).toContain("in_progress");
    expect(COMMISSION_ACTIVE_STATES).toHaveLength(2);
  });

  test("cleanupStates contains completed, failed, cancelled, abandoned", () => {
    expect(COMMISSION_CLEANUP_STATES).toContain("completed");
    expect(COMMISSION_CLEANUP_STATES).toContain("failed");
    expect(COMMISSION_CLEANUP_STATES).toContain("cancelled");
    expect(COMMISSION_CLEANUP_STATES).toContain("abandoned");
    expect(COMMISSION_CLEANUP_STATES).toHaveLength(4);
  });

  test("activeStates and cleanupStates are disjoint", () => {
    for (const active of COMMISSION_ACTIVE_STATES) {
      expect(COMMISSION_CLEANUP_STATES).not.toContain(active);
    }
  });

  test("pending and blocked are neither active nor cleanup", () => {
    const neither: CommissionStatus[] = ["pending", "blocked"];
    for (const s of neither) {
      expect(COMMISSION_ACTIVE_STATES).not.toContain(s);
      expect(COMMISSION_CLEANUP_STATES).not.toContain(s);
    }
  });
});

// -- Factory function tests --

describe("createCommissionHandlers", () => {
  test("returns transitions matching COMMISSION_TRANSITIONS", () => {
    const deps = createMockDeps();
    const result = createCommissionHandlers(deps);
    expect(result.transitions).toBe(COMMISSION_TRANSITIONS);
  });

  test("returns activeStates matching COMMISSION_ACTIVE_STATES", () => {
    const deps = createMockDeps();
    const result = createCommissionHandlers(deps);
    expect(result.activeStates).toBe(COMMISSION_ACTIVE_STATES);
  });

  test("returns cleanupStates matching COMMISSION_CLEANUP_STATES", () => {
    const deps = createMockDeps();
    const result = createCommissionHandlers(deps);
    expect(result.cleanupStates).toBe(COMMISSION_CLEANUP_STATES);
  });

  test("returns enter handlers for all cleanup and active states", () => {
    const deps = createMockDeps();
    const result = createCommissionHandlers(deps);
    const enter = result.handlers.enter;

    expect(enter.dispatched).toBeFunction();
    expect(enter.in_progress).toBeFunction();
    expect(enter.completed).toBeFunction();
    expect(enter.failed).toBeFunction();
    expect(enter.cancelled).toBeFunction();
    expect(enter.abandoned).toBeFunction();
  });

  test("returns exit handler for in_progress (no no-op dispatched exit)", () => {
    const deps = createMockDeps();
    const result = createCommissionHandlers(deps);
    const exit = result.handlers.exit;

    expect(exit.dispatched).toBeUndefined();
    expect(exit.in_progress).toBeFunction();
  });

  test("returns createArtifactOps factory that produces ops with required methods", () => {
    const deps = createMockDeps();
    const result = createCommissionHandlers(deps);

    expect(result.createArtifactOps).toBeFunction();
    const ops = result.createArtifactOps(() => undefined);
    expect(ops.writeStatusAndTimeline).toBeFunction();
    expect(ops.resolveBasePath).toBeFunction();
  });

  test("does not return enter handlers for pending or blocked", () => {
    const deps = createMockDeps();
    const result = createCommissionHandlers(deps);
    const enter = result.handlers.enter;

    expect(enter.pending).toBeUndefined();
    expect(enter.blocked).toBeUndefined();
  });
});

// -- Handler signature tests --

describe("Handler signatures", () => {
  test("all enter handler factories return functions matching EnterHandler type", () => {
    const deps = createMockDeps();
    const enterFactories = [
      createEnterDispatched,
      createEnterInProgress,
      createEnterCompleted,
      createEnterFailed,
      createEnterCancelled,
      createEnterAbandoned,
    ];

    for (const factory of enterFactories) {
      const handler: EnterHandler<CommissionId, CommissionStatus, ActiveCommissionEntry> = factory(deps);
      expect(handler).toBeFunction();
    }
  });

  test("all exit handler factories return functions matching ExitHandler type", () => {
    const deps = createMockDeps();
    const exitFactories = [
      createExitInProgress,
    ];

    for (const factory of exitFactories) {
      const handler: ExitHandler<CommissionId, CommissionStatus, ActiveCommissionEntry> = factory(deps);
      expect(handler).toBeFunction();
    }
  });

  test("exit-in_progress returns without throwing", async () => {
    const deps = createMockDeps();
    const ctx = makeContext({ targetState: "in_progress", sourceState: "dispatched" });

    // exit-in_progress calls abort if abortController is present
    await expect(createExitInProgress(deps)(ctx)).resolves.toBeUndefined();
  });
});

// -- Abandoned handler tests (fully implemented) --

describe("enter-abandoned handler", () => {
  test("emits commission_status event with abandoned status and reason", async () => {
    const deps = createMockDeps();
    const handler = createEnterAbandoned(deps);
    const id = asCommissionId("commission-researcher-20260301-100000");
    const ctx = makeContext({
      id,
      sourceState: "failed",
      targetState: "abandoned",
      reason: "User abandoned the commission",
    });

    await handler(ctx);

    expect(deps.emittedEvents).toHaveLength(1);
    expect(deps.emittedEvents[0]).toEqual({
      type: "commission_status",
      commissionId: "commission-researcher-20260301-100000",
      status: "abandoned",
      reason: "User abandoned the commission",
    });
  });

  test("syncs status to integration worktree", async () => {
    const deps = createMockDeps();
    const handler = createEnterAbandoned(deps);
    const ctx = makeContext({
      sourceState: "cancelled",
      targetState: "abandoned",
      reason: "No longer needed",
    });

    await handler(ctx);

    expect(deps.syncedStatuses).toHaveLength(1);
    expect(deps.syncedStatuses[0]).toEqual({
      status: "abandoned",
      reason: "No longer needed",
    });
  });

  test("writes state file with correct data", async () => {
    const deps = createMockDeps();
    const handler = createEnterAbandoned(deps);
    const id = asCommissionId("commission-scribe-20260301-120000");
    const entry = makeEntry({
      commissionId: id,
      projectName: "my-project",
      workerName: "scribe",
    });
    const ctx = makeContext({
      id,
      entry,
      sourceState: "pending",
      targetState: "abandoned",
      reason: "Abandoned by user",
    });

    await handler(ctx);

    expect(deps.writtenStateFiles).toHaveLength(1);
    expect(deps.writtenStateFiles[0].id).toBe("commission-scribe-20260301-120000");
    expect(deps.writtenStateFiles[0].data).toEqual({
      commissionId: "commission-scribe-20260301-120000",
      projectName: "my-project",
      workerName: "scribe",
      status: "abandoned",
    });
  });

  test("does not call any git operations", async () => {
    const deps = createMockDeps();
    const handler = createEnterAbandoned(deps);
    const ctx = makeContext({
      sourceState: "blocked",
      targetState: "abandoned",
      reason: "Abandoned",
    });

    await handler(ctx);

    // Verify no git methods were called
    expect(deps.git.createBranch).not.toHaveBeenCalled();
    expect(deps.git.createWorktree).not.toHaveBeenCalled();
    expect(deps.git.removeWorktree).not.toHaveBeenCalled();
    expect(deps.git.commitAll).not.toHaveBeenCalled();
    expect(deps.git.deleteBranch).not.toHaveBeenCalled();
    expect(deps.git.squashMerge).not.toHaveBeenCalled();
    expect(deps.git.configureSparseCheckout).not.toHaveBeenCalled();
    expect(deps.git.squashMergeNoCommit).not.toHaveBeenCalled();
    expect(deps.git.mergeAbort).not.toHaveBeenCalled();
  });

  test("returns undefined (no merge to report)", async () => {
    const deps = createMockDeps();
    const handler = createEnterAbandoned(deps);
    const ctx = makeContext();

    const result = await handler(ctx);
    expect(result).toBeUndefined();
  });

  test("works from all valid source states", async () => {
    const sourceStates: CommissionStatus[] = ["pending", "blocked", "failed", "cancelled"];

    for (const sourceState of sourceStates) {
      const deps = createMockDeps();
      const handler = createEnterAbandoned(deps);
      const ctx = makeContext({
        sourceState,
        targetState: "abandoned",
        reason: `Abandoned from ${sourceState}`,
      });

      await handler(ctx);

      expect(deps.emittedEvents).toHaveLength(1);
      const event = deps.emittedEvents[0];
      expect(event.type).toBe("commission_status");
      if (event.type === "commission_status") {
        expect(event.status).toBe("abandoned");
      }
      expect(deps.syncedStatuses).toHaveLength(1);
      expect(deps.writtenStateFiles).toHaveLength(1);
    }
  });
});

// -- Enter-failed handler tests --

describe("enter-failed handler", () => {
  test("merge-conflict path emits event, syncs status, writes state, skips worktree cleanup", async () => {
    const deps = createMockDeps();
    const handler = createEnterFailed(deps);
    const entry = makeEntry({
      status: "completed",
      worktreeDir: "/fake/worktree",
      branchName: "claude/commission/test",
    });
    const ctx = makeContext({
      entry,
      sourceState: "completed",
      targetState: "failed",
      reason: "Merge conflict on non-.lore/ files",
    });

    const result = await handler(ctx);
    expect(result).toBeUndefined();

    // Emits commission_status event
    expect(deps.emittedEvents).toHaveLength(1);
    expect(deps.emittedEvents[0].type).toBe("commission_status");

    // Syncs status to integration
    expect(deps.syncedStatuses).toHaveLength(1);
    expect(deps.syncedStatuses[0].status).toBe("failed");

    // Writes state file
    expect(deps.writtenStateFiles).toHaveLength(1);
    expect(deps.writtenStateFiles[0].data.status).toBe("failed");

    // Does NOT call preserveAndCleanupWorktree (merge-conflict path)
    expect(deps.preserveAndCleanupWorktree).not.toHaveBeenCalled();
  });

  test("normal failure path preserves worktree work, emits event, syncs status, writes state", async () => {
    const deps = createMockDeps();
    const handler = createEnterFailed(deps);
    const entry = makeEntry({
      status: "in_progress",
      worktreeDir: "/fake/worktree",
      branchName: "claude/commission/test",
    });
    const ctx = makeContext({
      entry,
      sourceState: "in_progress",
      targetState: "failed",
      reason: "Session error",
    });

    const result = await handler(ctx);
    expect(result).toBeUndefined();

    // Emits event
    expect(deps.emittedEvents).toHaveLength(1);

    // Syncs status
    expect(deps.syncedStatuses).toHaveLength(1);

    // Preserves worktree (fileExists returns true by default)
    expect(deps.preserveAndCleanupWorktree).toHaveBeenCalledTimes(1);

    // Writes state file
    expect(deps.writtenStateFiles).toHaveLength(1);
  });

  test("normal failure path skips worktree cleanup when worktree is missing", async () => {
    const deps = createMockDeps();
    (deps.fileExists as ReturnType<typeof mock>).mockImplementation(async () => false);
    const handler = createEnterFailed(deps);
    const entry = makeEntry({
      status: "in_progress",
      worktreeDir: "/fake/worktree",
      branchName: "claude/commission/test",
    });
    const ctx = makeContext({
      entry,
      sourceState: "in_progress",
      targetState: "failed",
      reason: "Session error",
    });

    await handler(ctx);

    // fileExists returned false, so no worktree cleanup
    expect(deps.preserveAndCleanupWorktree).not.toHaveBeenCalled();
  });
});

// -- ArtifactOps tests --

describe("createCommissionArtifactOps", () => {
  test("writeStatusAndTimeline is a function", () => {
    const ops = createCommissionArtifactOps({
      integrationWorktreePath: (name: string) => `/fake/${name}`,
    });
    expect(ops.writeStatusAndTimeline).toBeFunction();
  });

  test("resolveBasePath is a function", () => {
    const ops = createCommissionArtifactOps({
      integrationWorktreePath: (name: string) => `/fake/${name}`,
    });
    expect(ops.resolveBasePath).toBeFunction();
  });

  test("resolveBasePath returns worktreeDir when isActive is true and entry has worktreeDir", () => {
    const id = asCommissionId("commission-test-001");
    const lookup = (_lookupId: CommissionId) =>
      makeEntry({ commissionId: id, worktreeDir: "/active/worktree/commission-test-001" });
    const ops = createCommissionArtifactOps(
      { integrationWorktreePath: (name: string) => `/fake/${name}` },
      lookup,
    );
    const result = ops.resolveBasePath(id, true);
    expect(result).toBe("/active/worktree/commission-test-001");
  });

  test("resolveBasePath returns integration path when isActive is false", () => {
    const id = asCommissionId("commission-test-001");
    const lookup = (_lookupId: CommissionId) =>
      makeEntry({ commissionId: id, projectName: "my-project" });
    const ops = createCommissionArtifactOps(
      { integrationWorktreePath: (name: string) => `/fake/${name}` },
      lookup,
    );
    const result = ops.resolveBasePath(id, false);
    expect(result).toBe("/fake/my-project");
  });

  test("resolveBasePath throws when no entry lookup provided", () => {
    const ops = createCommissionArtifactOps({
      integrationWorktreePath: (name: string) => `/fake/${name}`,
    });
    const id = asCommissionId("commission-test-001");
    expect(() => ops.resolveBasePath(id, false)).toThrow(
      "Cannot resolve artifact base path for commission commission-test-001: entry not found in lookup.",
    );
  });
});
