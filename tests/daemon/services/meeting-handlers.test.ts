/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/unbound-method */

/**
 * Tests for meeting handlers and graph configuration.
 *
 * Covers:
 * - Transition graph: every valid edge exists, invalid edges are absent
 * - Configuration constants: activeStates and cleanupStates correctness
 * - Factory function: returns all required components with correct types
 * - Declined handler (fully implemented): emits event, no git operations
 * - Handler signatures: all handlers match expected types and states
 * - ArtifactOps: resolveBasePath and writeStatusAndTimeline
 * - Exit-open handler: calls abort on the AbortController
 */

import { describe, test, expect, mock } from "bun:test";
import type { MeetingId, MeetingStatus } from "@/daemon/types";
import { asMeetingId } from "@/daemon/types";
import type { EnterHandler, ExitHandler } from "@/daemon/lib/activity-state-machine";
import type { SystemEvent } from "@/daemon/services/event-bus";
import {
  MEETING_TRANSITIONS,
  MEETING_ACTIVE_STATES,
  MEETING_CLEANUP_STATES,
  createMeetingHandlers,
  createEnterOpen,
  createEnterClosed,
  createEnterDeclined,
  createExitOpen,
  createMeetingArtifactOps,
  type MeetingHandlerDeps,
  type ActiveMeetingEntry,
  type MeetingTransitionContext,
} from "@/daemon/services/meeting-handlers";

// -- Test helpers --

function makeEntry(overrides?: Partial<ActiveMeetingEntry>): ActiveMeetingEntry {
  return {
    meetingId: asMeetingId("audience-scribe-20260301-100000"),
    projectName: "test-project",
    workerName: "Scribe",
    packageName: "guild-hall-scribe",
    sdkSessionId: null,
    worktreeDir: "/fake/worktrees/test-project/audience-scribe-20260301-100000",
    branchName: "claude/meeting/audience-scribe-20260301-100000",
    abortController: new AbortController(),
    status: "open",
    ...overrides,
  };
}

function makeContext(overrides?: Partial<MeetingTransitionContext>): MeetingTransitionContext {
  const id = asMeetingId("audience-scribe-20260301-100000");
  return {
    id,
    entry: makeEntry(),
    sourceState: "requested",
    targetState: "open",
    reason: "Test transition",
    ...overrides,
  };
}

function createMockDeps(): MeetingHandlerDeps & {
  emittedEvents: SystemEvent[];
  writtenStateFiles: Array<{ id: string; data: Record<string, unknown> }>;
  deletedStateFiles: string[];
} {
  const emittedEvents: SystemEvent[] = [];
  const writtenStateFiles: Array<{ id: string; data: Record<string, unknown> }> = [];
  const deletedStateFiles: string[] = [];

  return {
    emittedEvents,
    writtenStateFiles,
    deletedStateFiles,
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
    writeStateFile: async (id: MeetingId, data: Record<string, unknown>) => {
      writtenStateFiles.push({ id: id as string, data });
    },
    deleteStateFile: async (id: MeetingId) => {
      deletedStateFiles.push(id as string);
    },
    finalizeActivity: mock(async () => ({ merged: true, preserved: false })),
    createMeetingRequest: mock(async () => {}),
    managerPackageName: "guild-master",
    findProjectPath: (_name: string) => "/fake/project/path",
    fileExists: mock(async () => true),
    integrationWorktreePath: (name: string) => `/fake/guild-hall/projects/${name}`,
    meetingWorktreePath: (name: string, id: string) => `/fake/guild-hall/worktrees/${name}/${id}`,
    meetingBranchName: (id: string) => `claude/meeting/${id}`,
    ensureDir: mock(async () => {}),
    updateArtifactStatus: mock(async () => {}),
    appendMeetingLog: mock(async () => {}),
    claudeBranch: "claude/main",
    createTranscript: mock(async () => {}),
    appendUserTurn: mock(async () => {}),
    readTranscript: mock(async () => "Transcript content"),
    removeTranscript: mock(async () => {}),
    generateMeetingNotes: mock(async () => ({ success: true as const, notes: "Meeting notes summary" })),
    writeNotesToArtifact: mock(async () => {}),
    startSdkSession: mock(async () => {}),
    writeMeetingArtifact: mock(async () => {}),
    checkDependencyTransitions: mock(async () => {}),
  };
}

// -- Transition graph tests --

describe("MEETING_TRANSITIONS", () => {
  test("defines all four statuses", () => {
    const allStatuses: MeetingStatus[] = ["requested", "open", "closed", "declined"];
    for (const s of allStatuses) {
      expect(MEETING_TRANSITIONS[s]).toBeDefined();
    }
  });

  test("requested can transition to open and declined", () => {
    const targets = MEETING_TRANSITIONS.requested;
    expect(targets).toContain("open");
    expect(targets).toContain("declined");
    expect(targets).toHaveLength(2);
  });

  test("open can transition to closed", () => {
    const targets = MEETING_TRANSITIONS.open;
    expect(targets).toContain("closed");
    expect(targets).toHaveLength(1);
  });

  test("closed is terminal (no outgoing edges)", () => {
    expect(MEETING_TRANSITIONS.closed).toHaveLength(0);
  });

  test("declined is terminal (no outgoing edges)", () => {
    expect(MEETING_TRANSITIONS.declined).toHaveLength(0);
  });

  describe("invalid edges are absent", () => {
    const invalidEdges: [MeetingStatus, MeetingStatus][] = [
      // requested cannot go to closed directly
      ["requested", "closed"],
      // open cannot go back to requested
      ["open", "requested"],
      ["open", "declined"],
      // closed cannot go anywhere
      ["closed", "requested"],
      ["closed", "open"],
      ["closed", "declined"],
      // declined cannot go anywhere
      ["declined", "requested"],
      ["declined", "open"],
      ["declined", "closed"],
    ];

    for (const [from, to] of invalidEdges) {
      test(`${from} -> ${to} is not allowed`, () => {
        expect(MEETING_TRANSITIONS[from]).not.toContain(to);
      });
    }
  });
});

// -- Configuration constants tests --

describe("Configuration constants", () => {
  test("activeStates contains only open", () => {
    expect(MEETING_ACTIVE_STATES).toContain("open");
    expect(MEETING_ACTIVE_STATES).toHaveLength(1);
  });

  test("cleanupStates contains closed and declined", () => {
    expect(MEETING_CLEANUP_STATES).toContain("closed");
    expect(MEETING_CLEANUP_STATES).toContain("declined");
    expect(MEETING_CLEANUP_STATES).toHaveLength(2);
  });

  test("activeStates and cleanupStates are disjoint", () => {
    for (const active of MEETING_ACTIVE_STATES) {
      expect(MEETING_CLEANUP_STATES).not.toContain(active);
    }
  });

  test("requested is neither active nor cleanup", () => {
    expect(MEETING_ACTIVE_STATES).not.toContain("requested");
    expect(MEETING_CLEANUP_STATES).not.toContain("requested");
  });
});

// -- Factory function tests --

describe("createMeetingHandlers", () => {
  test("returns transitions matching MEETING_TRANSITIONS", () => {
    const deps = createMockDeps();
    const result = createMeetingHandlers(deps);
    expect(result.transitions).toBe(MEETING_TRANSITIONS);
  });

  test("returns activeStates matching MEETING_ACTIVE_STATES", () => {
    const deps = createMockDeps();
    const result = createMeetingHandlers(deps);
    expect(result.activeStates).toBe(MEETING_ACTIVE_STATES);
  });

  test("returns cleanupStates matching MEETING_CLEANUP_STATES", () => {
    const deps = createMockDeps();
    const result = createMeetingHandlers(deps);
    expect(result.cleanupStates).toBe(MEETING_CLEANUP_STATES);
  });

  test("returns enter handlers for open, closed, and declined", () => {
    const deps = createMockDeps();
    const result = createMeetingHandlers(deps);
    const enter = result.handlers.enter;

    expect(enter.open).toBeFunction();
    expect(enter.closed).toBeFunction();
    expect(enter.declined).toBeFunction();
  });

  test("returns exit handler for open", () => {
    const deps = createMockDeps();
    const result = createMeetingHandlers(deps);
    const exit = result.handlers.exit;

    expect(exit.open).toBeFunction();
  });

  test("does not return enter handler for requested", () => {
    const deps = createMockDeps();
    const result = createMeetingHandlers(deps);
    expect(result.handlers.enter.requested).toBeUndefined();
  });

  test("does not return exit handlers for closed or declined", () => {
    const deps = createMockDeps();
    const result = createMeetingHandlers(deps);
    const exit = result.handlers.exit;

    expect(exit.closed).toBeUndefined();
    expect(exit.declined).toBeUndefined();
  });

  test("returns createArtifactOps factory that produces ops with required methods", () => {
    const deps = createMockDeps();
    const result = createMeetingHandlers(deps);

    expect(result.createArtifactOps).toBeFunction();
    const ops = result.createArtifactOps(() => undefined);
    expect(ops.writeStatusAndTimeline).toBeFunction();
    expect(ops.resolveBasePath).toBeFunction();
  });
});

// -- Handler signature tests --

describe("Handler signatures", () => {
  test("all enter handler factories return functions matching EnterHandler type", () => {
    const deps = createMockDeps();
    const enterFactories = [
      createEnterOpen,
      createEnterClosed,
      createEnterDeclined,
    ];

    for (const factory of enterFactories) {
      const handler: EnterHandler<MeetingId, MeetingStatus, ActiveMeetingEntry> = factory(deps);
      expect(handler).toBeFunction();
    }
  });

  test("exit handler factory returns a function matching ExitHandler type", () => {
    const deps = createMockDeps();
    const handler: ExitHandler<MeetingId, MeetingStatus, ActiveMeetingEntry> = createExitOpen(deps);
    expect(handler).toBeFunction();
  });
});

// -- Exit-open handler tests --

describe("exit-open handler", () => {
  test("calls abort() on the entry's AbortController", async () => {
    const deps = createMockDeps();
    const handler = createExitOpen(deps);
    const abortController = new AbortController();
    const entry = makeEntry({ abortController });
    const ctx = makeContext({
      entry,
      sourceState: "open",
      targetState: "closed",
    });

    expect(abortController.signal.aborted).toBe(false);
    await handler(ctx);
    expect(abortController.signal.aborted).toBe(true);
  });

  test("does not throw when abortController is not set", async () => {
    const deps = createMockDeps();
    const handler = createExitOpen(deps);
    // Create entry without abortController by casting
    const entry = makeEntry();
    // Simulate missing controller (shouldn't happen in practice but defensively guard)
    (entry as Record<string, unknown>).abortController = undefined;
    const ctx = makeContext({
      entry,
      sourceState: "open",
      targetState: "closed",
    });

    await expect(handler(ctx)).resolves.toBeUndefined();
  });
});

// -- Enter-declined handler tests (fully implemented) --

describe("enter-declined handler", () => {
  test("emits meeting_ended event with meeting ID", async () => {
    const deps = createMockDeps();
    const handler = createEnterDeclined(deps);
    const id = asMeetingId("audience-scribe-20260301-100000");
    const ctx = makeContext({
      id,
      sourceState: "requested",
      targetState: "declined",
      reason: "User declined the meeting request",
    });

    await handler(ctx);

    expect(deps.emittedEvents).toHaveLength(1);
    expect(deps.emittedEvents[0]).toEqual({
      type: "meeting_ended",
      meetingId: "audience-scribe-20260301-100000",
    });
  });

  test("returns undefined (no merge to report)", async () => {
    const deps = createMockDeps();
    const handler = createEnterDeclined(deps);
    const ctx = makeContext({
      sourceState: "requested",
      targetState: "declined",
      reason: "Declined",
    });

    const result = await handler(ctx);
    expect(result).toBeUndefined();
  });

  test("does not call any git operations", async () => {
    const deps = createMockDeps();
    const handler = createEnterDeclined(deps);
    const ctx = makeContext({
      sourceState: "requested",
      targetState: "declined",
      reason: "User declined",
    });

    await handler(ctx);

    // Verify no git methods were called
    expect(deps.git.createBranch).not.toHaveBeenCalled();
    expect(deps.git.createWorktree).not.toHaveBeenCalled();
    expect(deps.git.removeWorktree).not.toHaveBeenCalled();
    expect(deps.git.commitAll).not.toHaveBeenCalled();
    expect(deps.git.deleteBranch).not.toHaveBeenCalled();
    expect(deps.git.configureSparseCheckout).not.toHaveBeenCalled();
  });

  test("does not write state file", async () => {
    const deps = createMockDeps();
    const handler = createEnterDeclined(deps);
    const ctx = makeContext({
      sourceState: "requested",
      targetState: "declined",
      reason: "Declined by user",
    });

    await handler(ctx);

    expect(deps.writtenStateFiles).toHaveLength(0);
  });

  test("does not call finalizeActivity", async () => {
    const deps = createMockDeps();
    const handler = createEnterDeclined(deps);
    const ctx = makeContext({
      sourceState: "requested",
      targetState: "declined",
      reason: "Not needed",
    });

    await handler(ctx);

    expect(deps.finalizeActivity).not.toHaveBeenCalled();
  });
});

// -- Enter-open handler tests (stub behavior) --

describe("enter-open handler", () => {
  test("creates branch, worktree, and configures sparse checkout", async () => {
    const deps = createMockDeps();
    const handler = createEnterOpen(deps);
    const id = asMeetingId("audience-scribe-20260301-100000");
    const entry = makeEntry({ meetingId: id, worktreeDir: "", branchName: "" });
    const ctx = makeContext({
      id,
      entry,
      sourceState: "requested",
      targetState: "open",
      reason: "Discuss architecture",
    });

    await handler(ctx);

    expect(deps.git.createBranch).toHaveBeenCalledTimes(1);
    expect(deps.git.createWorktree).toHaveBeenCalledTimes(1);
    expect(deps.git.configureSparseCheckout).toHaveBeenCalledTimes(1);
  });

  test("populates entry worktreeDir and branchName", async () => {
    const deps = createMockDeps();
    const handler = createEnterOpen(deps);
    const id = asMeetingId("audience-scribe-20260301-100000");
    const entry = makeEntry({ meetingId: id, worktreeDir: "", branchName: "" });
    const ctx = makeContext({
      id,
      entry,
      sourceState: "requested",
      targetState: "open",
      reason: "Review progress",
    });

    await handler(ctx);

    expect(entry.worktreeDir).toBe(
      "/fake/guild-hall/worktrees/test-project/audience-scribe-20260301-100000",
    );
    expect(entry.branchName).toBe(
      "claude/meeting/audience-scribe-20260301-100000",
    );
    expect(entry.status).toBe("open");
  });

  test("writes state file with meeting data", async () => {
    const deps = createMockDeps();
    const handler = createEnterOpen(deps);
    const id = asMeetingId("audience-scribe-20260301-100000");
    const entry = makeEntry({ meetingId: id, worktreeDir: "", branchName: "" });
    const ctx = makeContext({
      id,
      entry,
      sourceState: "requested",
      targetState: "open",
      reason: "Discuss design",
    });

    await handler(ctx);

    expect(deps.writtenStateFiles).toHaveLength(1);
    expect(deps.writtenStateFiles[0].id).toBe("audience-scribe-20260301-100000");
    expect(deps.writtenStateFiles[0].data.status).toBe("open");
    expect(deps.writtenStateFiles[0].data.projectName).toBe("test-project");
    expect(deps.writtenStateFiles[0].data.workerName).toBe("Scribe");
  });

  test("creates transcript and records initial user turn", async () => {
    const deps = createMockDeps();
    const handler = createEnterOpen(deps);
    const id = asMeetingId("audience-scribe-20260301-100000");
    const entry = makeEntry({ meetingId: id, worktreeDir: "", branchName: "" });
    const ctx = makeContext({
      id,
      entry,
      sourceState: "requested",
      targetState: "open",
      reason: "Let's talk",
    });

    await handler(ctx);

    expect(deps.createTranscript).toHaveBeenCalledTimes(1);
    expect(deps.appendUserTurn).toHaveBeenCalledTimes(1);
  });

  test("emits meeting_started event", async () => {
    const deps = createMockDeps();
    const handler = createEnterOpen(deps);
    const id = asMeetingId("audience-scribe-20260301-100000");
    const entry = makeEntry({ meetingId: id, worktreeDir: "", branchName: "" });
    const ctx = makeContext({
      id,
      entry,
      sourceState: "requested",
      targetState: "open",
      reason: "Go",
    });

    await handler(ctx);

    expect(deps.emittedEvents).toHaveLength(1);
    expect(deps.emittedEvents[0]).toEqual({
      type: "meeting_started",
      meetingId: "audience-scribe-20260301-100000",
      worker: "Scribe",
    });
  });

  test("calls startSdkSession when provided", async () => {
    const deps = createMockDeps();
    const handler = createEnterOpen(deps);
    const id = asMeetingId("audience-scribe-20260301-100000");
    const entry = makeEntry({ meetingId: id, worktreeDir: "", branchName: "" });
    const ctx = makeContext({
      id,
      entry,
      sourceState: "requested",
      targetState: "open",
      reason: "Start session",
    });

    await handler(ctx);

    expect(deps.startSdkSession).toHaveBeenCalledTimes(1);
  });

  test("throws when project is not found", async () => {
    const deps = createMockDeps();
    deps.findProjectPath = () => undefined;
    const handler = createEnterOpen(deps);
    const ctx = makeContext({
      sourceState: "requested",
      targetState: "open",
    });

    await expect(handler(ctx)).rejects.toThrow("not found in config");
  });

  test("inject path (sourceState null) calls writeMeetingArtifact", async () => {
    const deps = createMockDeps();
    const handler = createEnterOpen(deps);
    const id = asMeetingId("audience-scribe-20260301-100000");
    const entry = makeEntry({ meetingId: id, worktreeDir: "", branchName: "" });
    const ctx = makeContext({
      id,
      entry,
      sourceState: null,
      targetState: "open",
      reason: "Direct meeting creation",
    });

    await handler(ctx);

    expect(deps.writeMeetingArtifact).toHaveBeenCalledTimes(1);
  });

  test("accept path (sourceState requested) does not call writeMeetingArtifact", async () => {
    const deps = createMockDeps();
    const handler = createEnterOpen(deps);
    const id = asMeetingId("audience-scribe-20260301-100000");
    const entry = makeEntry({ meetingId: id, worktreeDir: "", branchName: "" });
    const ctx = makeContext({
      id,
      entry,
      sourceState: "requested",
      targetState: "open",
      reason: "Accept meeting",
    });

    await handler(ctx);

    expect(deps.writeMeetingArtifact).not.toHaveBeenCalled();
  });

  test("transcript failure does not throw", async () => {
    const deps = createMockDeps();
    (deps.createTranscript as ReturnType<typeof mock>).mockImplementation(
      async () => { throw new Error("Transcript disk full"); },
    );
    const handler = createEnterOpen(deps);
    const id = asMeetingId("audience-scribe-20260301-100000");
    const entry = makeEntry({ meetingId: id, worktreeDir: "", branchName: "" });
    const ctx = makeContext({
      id,
      entry,
      sourceState: "requested",
      targetState: "open",
      reason: "Go",
    });

    // Should not throw despite transcript failure
    await expect(handler(ctx)).resolves.toBeUndefined();
  });
});

// -- Enter-closed handler tests --

describe("enter-closed handler", () => {
  test("successful merge path: generates notes, writes them, merges, deletes state file", async () => {
    const deps = createMockDeps();
    const handler = createEnterClosed(deps);
    const id = asMeetingId("audience-scribe-20260301-100000");
    const entry = makeEntry({ meetingId: id });
    const ctx = makeContext({
      id,
      entry,
      sourceState: "open",
      targetState: "closed",
      reason: "User closed meeting",
    });

    const result = await handler(ctx);

    expect(result).toEqual({ mergeSucceeded: true });
    expect(deps.generateMeetingNotes).toHaveBeenCalledTimes(1);
    expect(deps.writeNotesToArtifact).toHaveBeenCalledTimes(1);
    expect(deps.finalizeActivity).toHaveBeenCalledTimes(1);
    expect(deps.deletedStateFiles).toContain("audience-scribe-20260301-100000");
    expect(deps.emittedEvents).toHaveLength(1);
    expect(deps.emittedEvents[0]).toEqual({
      type: "meeting_ended",
      meetingId: "audience-scribe-20260301-100000",
    });
  });

  test("successful merge removes transcript", async () => {
    const deps = createMockDeps();
    const handler = createEnterClosed(deps);
    const ctx = makeContext({
      sourceState: "open",
      targetState: "closed",
      reason: "Done",
    });

    await handler(ctx);

    expect(deps.removeTranscript).toHaveBeenCalledTimes(1);
  });

  test("failed notes generation preserves transcript", async () => {
    const deps = createMockDeps();
    (deps.generateMeetingNotes as ReturnType<typeof mock>).mockImplementation(
      async () => ({ success: false as const, reason: "No queryFn" }),
    );
    const handler = createEnterClosed(deps);
    const ctx = makeContext({
      sourceState: "open",
      targetState: "closed",
      reason: "Done",
    });

    await handler(ctx);

    // Transcript should NOT be removed when notes generation fails
    expect(deps.removeTranscript).not.toHaveBeenCalled();
  });

  test("merge failure escalates to Guild Master meeting request", async () => {
    const deps = createMockDeps();
    (deps.finalizeActivity as ReturnType<typeof mock>).mockImplementation(
      async () => ({ merged: false, preserved: true }),
    );
    const handler = createEnterClosed(deps);
    const ctx = makeContext({
      sourceState: "open",
      targetState: "closed",
      reason: "Close meeting",
    });

    const result = await handler(ctx);

    expect(result).toEqual({ mergeSucceeded: false });
    expect(deps.createMeetingRequest).toHaveBeenCalledTimes(1);
    expect(deps.emittedEvents).toHaveLength(1);
    expect(deps.emittedEvents[0].type).toBe("meeting_ended");
  });

  test("finalizeActivity infrastructure failure returns mergeSucceeded false", async () => {
    const deps = createMockDeps();
    (deps.finalizeActivity as ReturnType<typeof mock>).mockImplementation(
      async () => { throw new Error("Git daemon crashed"); },
    );
    const handler = createEnterClosed(deps);
    const ctx = makeContext({
      sourceState: "open",
      targetState: "closed",
      reason: "Close",
    });

    const result = await handler(ctx);

    expect(result).toEqual({ mergeSucceeded: false });
    // Should still emit meeting_ended
    expect(deps.emittedEvents).toHaveLength(1);
    expect(deps.emittedEvents[0].type).toBe("meeting_ended");
    // Should NOT escalate (infra failure, not merge conflict)
    expect(deps.createMeetingRequest).not.toHaveBeenCalled();
  });

  test("missing worktree/branch info skips merge", async () => {
    const deps = createMockDeps();
    const handler = createEnterClosed(deps);
    const entry = makeEntry({ worktreeDir: "", branchName: "" });
    const ctx = makeContext({
      entry,
      sourceState: "open",
      targetState: "closed",
      reason: "Close",
    });

    const result = await handler(ctx);

    expect(result).toEqual({ mergeSucceeded: false });
    expect(deps.finalizeActivity).not.toHaveBeenCalled();
    expect(deps.emittedEvents).toHaveLength(1);
  });

  test("checkDependencyTransitions called after successful merge", async () => {
    const deps = createMockDeps();
    const handler = createEnterClosed(deps);
    const ctx = makeContext({
      sourceState: "open",
      targetState: "closed",
      reason: "Done",
    });

    await handler(ctx);

    expect(deps.checkDependencyTransitions).toHaveBeenCalledTimes(1);
  });

  test("checkDependencyTransitions NOT called when merge fails", async () => {
    const deps = createMockDeps();
    (deps.finalizeActivity as ReturnType<typeof mock>).mockImplementation(
      async () => ({ merged: false, preserved: true }),
    );
    const handler = createEnterClosed(deps);
    const ctx = makeContext({
      sourceState: "open",
      targetState: "closed",
      reason: "Done",
    });

    await handler(ctx);

    expect(deps.checkDependencyTransitions).not.toHaveBeenCalled();
  });

  test("sets entry status to closed", async () => {
    const deps = createMockDeps();
    const handler = createEnterClosed(deps);
    const entry = makeEntry();
    const ctx = makeContext({
      entry,
      sourceState: "open",
      targetState: "closed",
      reason: "Done",
    });

    await handler(ctx);

    expect(entry.status).toBe("closed");
  });
});

// -- ArtifactOps tests --

describe("createMeetingArtifactOps", () => {
  test("writeStatusAndTimeline is a function", () => {
    const ops = createMeetingArtifactOps({
      integrationWorktreePath: (name: string) => `/fake/${name}`,
    });
    expect(ops.writeStatusAndTimeline).toBeFunction();
  });

  test("resolveBasePath is a function", () => {
    const ops = createMeetingArtifactOps({
      integrationWorktreePath: (name: string) => `/fake/${name}`,
    });
    expect(ops.resolveBasePath).toBeFunction();
  });

  test("resolveBasePath returns worktreeDir when isActive is true and entry has worktreeDir", () => {
    const id = asMeetingId("audience-scribe-001");
    const lookup = (_lookupId: MeetingId) =>
      makeEntry({
        meetingId: id,
        worktreeDir: "/active/worktree/audience-scribe-001",
      });
    const ops = createMeetingArtifactOps(
      { integrationWorktreePath: (name: string) => `/fake/${name}` },
      lookup,
    );
    const result = ops.resolveBasePath(id, true);
    expect(result).toBe("/active/worktree/audience-scribe-001");
  });

  test("resolveBasePath returns integration path when isActive is false", () => {
    const id = asMeetingId("audience-scribe-001");
    const lookup = (_lookupId: MeetingId) =>
      makeEntry({ meetingId: id, projectName: "my-project" });
    const ops = createMeetingArtifactOps(
      { integrationWorktreePath: (name: string) => `/fake/${name}` },
      lookup,
    );
    const result = ops.resolveBasePath(id, false);
    expect(result).toBe("/fake/my-project");
  });

  test("resolveBasePath throws when no entry lookup provided", () => {
    const ops = createMeetingArtifactOps({
      integrationWorktreePath: (name: string) => `/fake/${name}`,
    });
    const id = asMeetingId("audience-scribe-001");
    expect(() => ops.resolveBasePath(id, false)).toThrow(
      "Cannot resolve artifact base path for meeting audience-scribe-001: entry not found in lookup.",
    );
  });
});
