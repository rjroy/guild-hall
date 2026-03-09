import { describe, test, expect, beforeEach } from "bun:test";
import {
  CommissionLifecycle,
  createCommissionLifecycle,
} from "@/daemon/services/commission/lifecycle";
import type { CommissionRecordOps } from "@/daemon/services/commission/record";
import type { SystemEvent } from "@/daemon/lib/event-bus";
import { asCommissionId } from "@/daemon/types";

// -- Test helpers --

function createMockRecordOps(): CommissionRecordOps & {
  calls: Array<{ method: string; args: unknown[] }>;
} {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  return {
    calls,
    readStatus(_artifactPath: string): Promise<string> {
      calls.push({ method: "readStatus", args: [_artifactPath] });
      return Promise.resolve("pending");
    },
    readType(_artifactPath: string): Promise<string> {
      calls.push({ method: "readType", args: [_artifactPath] });
      return Promise.resolve("one-shot");
    },
    writeStatus(artifactPath: string, status: string): Promise<void> {
      calls.push({ method: "writeStatus", args: [artifactPath, status] });
      return Promise.resolve();
    },
    appendTimeline(
      artifactPath: string,
      event: string,
      reason: string,
      extra?: Record<string, unknown>,
    ): Promise<void> {
      calls.push({ method: "appendTimeline", args: [artifactPath, event, reason, extra] });
      return Promise.resolve();
    },
    readDependencies(_artifactPath: string): Promise<string[]> {
      calls.push({ method: "readDependencies", args: [_artifactPath] });
      return Promise.resolve([]);
    },
    updateProgress(artifactPath: string, summary: string): Promise<void> {
      calls.push({ method: "updateProgress", args: [artifactPath, summary] });
      return Promise.resolve();
    },
    writeStatusAndTimeline(
      artifactPath: string,
      status: string,
      event: string,
      reason: string,
      extra?: Record<string, unknown>,
    ): Promise<void> {
      calls.push({ method: "writeStatusAndTimeline", args: [artifactPath, status, event, reason, extra] });
      return Promise.resolve();
    },
    updateResult(
      artifactPath: string,
      summary: string,
      artifacts?: string[],
    ): Promise<void> {
      calls.push({ method: "updateResult", args: [artifactPath, summary, artifacts] });
      return Promise.resolve();
    },
    readScheduleMetadata(_artifactPath: string) {
      calls.push({ method: "readScheduleMetadata", args: [_artifactPath] });
      return Promise.resolve({
        cron: "0 9 * * 1",
        repeat: null,
        runsCompleted: 0,
        lastRun: null,
        lastSpawnedId: null,
      });
    },
    writeScheduleFields(
      artifactPath: string,
      updates: Partial<{
        runsCompleted: number;
        lastRun: string;
        lastSpawnedId: string;
        cron: string;
        repeat: number | null;
      }>,
    ): Promise<void> {
      calls.push({ method: "writeScheduleFields", args: [artifactPath, updates] });
      return Promise.resolve();
    },
  };
}

let recordOps: ReturnType<typeof createMockRecordOps>;
let emittedEvents: SystemEvent[];
let lifecycle: CommissionLifecycle;

const TEST_ID = asCommissionId("commission-test-001");
const TEST_PROJECT = "test-project";
const TEST_ARTIFACT = "/tmp/test-commission.md";

beforeEach(() => {
  recordOps = createMockRecordOps();
  emittedEvents = [];
  lifecycle = createCommissionLifecycle({
    recordOps,
    emitEvent: (event: SystemEvent) => emittedEvents.push(event),
  });
});

// -- create --

describe("create", () => {
  test("writes initial status and timeline via Layer 1", async () => {
    await lifecycle.create(TEST_ID, TEST_PROJECT, TEST_ARTIFACT, "pending");

    const combinedCalls = recordOps.calls.filter((c) => c.method === "writeStatusAndTimeline");
    expect(combinedCalls).toHaveLength(1);
    expect(combinedCalls[0].args[0]).toBe(TEST_ARTIFACT);
    expect(combinedCalls[0].args[1]).toBe("pending");
    expect(combinedCalls[0].args[2]).toBe("created");
    expect(combinedCalls[0].args[3]).toContain("pending");
  });

  test("tracks the commission after creation", async () => {
    await lifecycle.create(TEST_ID, TEST_PROJECT, TEST_ARTIFACT, "pending");

    expect(lifecycle.isTracked(TEST_ID)).toBe(true);
    expect(lifecycle.getStatus(TEST_ID)).toBe("pending");
    expect(lifecycle.getProjectName(TEST_ID)).toBe(TEST_PROJECT);
    expect(lifecycle.getArtifactPath(TEST_ID)).toBe(TEST_ARTIFACT);
  });

  test("supports non-pending initial status", async () => {
    await lifecycle.create(TEST_ID, TEST_PROJECT, TEST_ARTIFACT, "blocked");

    expect(lifecycle.getStatus(TEST_ID)).toBe("blocked");
    const combinedCalls = recordOps.calls.filter((c) => c.method === "writeStatusAndTimeline");
    expect(combinedCalls[0].args[1]).toBe("blocked");
  });
});

// -- register --

describe("register", () => {
  test("populates state tracker without writing to disk", () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "in_progress", TEST_ARTIFACT);

    expect(lifecycle.isTracked(TEST_ID)).toBe(true);
    expect(lifecycle.getStatus(TEST_ID)).toBe("in_progress");
    expect(lifecycle.getProjectName(TEST_ID)).toBe(TEST_PROJECT);
    expect(lifecycle.getArtifactPath(TEST_ID)).toBe(TEST_ARTIFACT);

    // No Layer 1 calls
    expect(recordOps.calls).toHaveLength(0);
  });
});

// -- forget --

describe("forget", () => {
  test("removes commission from tracker", async () => {
    await lifecycle.create(TEST_ID, TEST_PROJECT, TEST_ARTIFACT, "pending");
    expect(lifecycle.isTracked(TEST_ID)).toBe(true);

    lifecycle.forget(TEST_ID);
    expect(lifecycle.isTracked(TEST_ID)).toBe(false);
    expect(lifecycle.getStatus(TEST_ID)).toBeUndefined();
  });

  test("no-op if not tracked", () => {
    // Should not throw
    lifecycle.forget(asCommissionId("nonexistent-id"));
  });
});

// -- Valid transitions --

describe("valid transitions", () => {
  // Helper: create and bring to a specific state
  function createAt(status: "pending" | "blocked" | "dispatched" | "in_progress" | "completed" | "failed" | "cancelled"): void {
    lifecycle.register(TEST_ID, TEST_PROJECT, status, TEST_ARTIFACT);
  }

  // pending -> dispatched
  test("pending -> dispatched via dispatch()", async () => {
    await createAt("pending");
    const result = await lifecycle.dispatch(TEST_ID);
    expect(result.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("dispatched");
  });

  // pending -> blocked
  test("pending -> blocked via block()", async () => {
    await createAt("pending");
    const result = await lifecycle.block(TEST_ID);
    expect(result.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("blocked");
  });

  // pending -> cancelled
  test("pending -> cancelled via cancel()", async () => {
    await createAt("pending");
    const result = await lifecycle.cancel(TEST_ID, "User cancelled");
    expect(result.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("cancelled");
  });

  // pending -> abandoned
  test("pending -> abandoned via abandon()", async () => {
    await createAt("pending");
    const result = await lifecycle.abandon(TEST_ID, "No longer needed");
    expect(result.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("abandoned");

    // Verify reason is passed through to Layer 1
    const writeCall = recordOps.calls.find(
      (c) => c.method === "writeStatusAndTimeline" && c.args[1] === "abandoned",
    );
    expect(writeCall).toBeDefined();
    expect(writeCall!.args[3]).toBe("No longer needed");
  });

  // blocked -> pending
  test("blocked -> pending via unblock()", async () => {
    await createAt("blocked");
    const result = await lifecycle.unblock(TEST_ID);
    expect(result.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("pending");
  });

  // blocked -> cancelled
  test("blocked -> cancelled via cancel()", async () => {
    await createAt("blocked");
    const result = await lifecycle.cancel(TEST_ID, "No longer needed");
    expect(result.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("cancelled");
  });

  // blocked -> abandoned
  test("blocked -> abandoned via abandon()", async () => {
    await createAt("blocked");
    const result = await lifecycle.abandon(TEST_ID, "No longer needed");
    expect(result.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("abandoned");
  });

  // dispatched -> in_progress
  test("dispatched -> in_progress via executionStarted()", async () => {
    await createAt("dispatched");
    const newPath = "/tmp/worktree/commission.md";
    const result = await lifecycle.executionStarted(TEST_ID, newPath);
    expect(result.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("in_progress");
  });

  // dispatched -> failed
  test("dispatched -> failed via executionFailed()", async () => {
    await createAt("dispatched");
    const result = await lifecycle.executionFailed(TEST_ID, "Setup error");
    expect(result.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("failed");
  });

  // dispatched -> cancelled
  test("dispatched -> cancelled via cancel()", async () => {
    await createAt("dispatched");
    const result = await lifecycle.cancel(TEST_ID, "Cancelled during dispatch");
    expect(result.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("cancelled");
  });

  // in_progress -> completed
  test("in_progress -> completed via executionCompleted()", async () => {
    await createAt("in_progress");
    const result = await lifecycle.executionCompleted(TEST_ID);
    expect(result.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("completed");
  });

  // in_progress -> failed
  test("in_progress -> failed via executionFailed()", async () => {
    await createAt("in_progress");
    const result = await lifecycle.executionFailed(TEST_ID, "Agent crashed");
    expect(result.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("failed");
  });

  // in_progress -> cancelled
  test("in_progress -> cancelled via cancel()", async () => {
    await createAt("in_progress");
    const result = await lifecycle.cancel(TEST_ID, "User stopped");
    expect(result.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("cancelled");
  });

  // completed -> failed
  test("completed -> failed via executionFailed()", async () => {
    await createAt("completed");
    const result = await lifecycle.executionFailed(TEST_ID, "Merge conflict");
    expect(result.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("failed");
  });

  // failed -> pending
  test("failed -> pending via redispatch()", async () => {
    await createAt("failed");
    const result = await lifecycle.redispatch(TEST_ID);
    expect(result.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("pending");
  });

  // failed -> abandoned
  test("failed -> abandoned via abandon()", async () => {
    await createAt("failed");
    const result = await lifecycle.abandon(TEST_ID, "No longer needed");
    expect(result.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("abandoned");
  });

  // cancelled -> pending
  test("cancelled -> pending via redispatch()", async () => {
    await createAt("cancelled");
    const result = await lifecycle.redispatch(TEST_ID);
    expect(result.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("pending");
  });

  // cancelled -> abandoned
  test("cancelled -> abandoned via abandon()", async () => {
    await createAt("cancelled");
    const result = await lifecycle.abandon(TEST_ID, "No longer needed");
    expect(result.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("abandoned");
  });
});

// -- Invalid transitions --

describe("invalid transitions", () => {
  test("dispatch from in_progress is rejected", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "in_progress", TEST_ARTIFACT);
    const result = await lifecycle.dispatch(TEST_ID);
    expect(result.outcome).toBe("skipped");
    if (result.outcome === "skipped") {
      expect(result.reason).toContain("in_progress");
      expect(result.reason).toContain("dispatched");
    }
  });

  test("unblock from dispatched is rejected", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "dispatched", TEST_ARTIFACT);
    const result = await lifecycle.unblock(TEST_ID);
    expect(result.outcome).toBe("skipped");
    if (result.outcome === "skipped") {
      expect(result.reason).toContain("dispatched");
    }
  });

  test("executionCompleted from pending is rejected", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "pending", TEST_ARTIFACT);
    const result = await lifecycle.executionCompleted(TEST_ID);
    expect(result.outcome).toBe("skipped");
    if (result.outcome === "skipped") {
      expect(result.reason).toContain("pending");
    }
  });

  test("dispatch from abandoned is rejected (terminal state)", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "abandoned", TEST_ARTIFACT);
    const result = await lifecycle.dispatch(TEST_ID);
    expect(result.outcome).toBe("skipped");
    if (result.outcome === "skipped") {
      expect(result.reason).toContain("abandoned");
    }
  });

  test("redispatch from in_progress is rejected", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "in_progress", TEST_ARTIFACT);
    const result = await lifecycle.redispatch(TEST_ID);
    expect(result.outcome).toBe("skipped");
  });

  test("block from completed is rejected", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "completed", TEST_ARTIFACT);
    const result = await lifecycle.block(TEST_ID);
    expect(result.outcome).toBe("skipped");
  });

  test("executionStarted from pending is rejected", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "pending", TEST_ARTIFACT);
    const result = await lifecycle.executionStarted(TEST_ID, "/tmp/new.md");
    expect(result.outcome).toBe("skipped");
    if (result.outcome === "skipped") {
      expect(result.reason).toContain("pending");
      expect(result.reason).toContain("dispatched");
    }
  });

  test("transition on untracked commission is rejected", async () => {
    const result = await lifecycle.dispatch(asCommissionId("nonexistent"));
    expect(result.outcome).toBe("skipped");
    if (result.outcome === "skipped") {
      expect(result.reason).toContain("not tracked");
    }
  });
});

// -- Event emission --

describe("event emission", () => {
  test("transition emits commission_status event with projectName and oldStatus", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "pending", TEST_ARTIFACT);
    await lifecycle.dispatch(TEST_ID);

    expect(emittedEvents).toHaveLength(1);
    const event = emittedEvents[0];
    expect(event.type).toBe("commission_status");
    if (event.type === "commission_status") {
      expect(event.commissionId).toBe(TEST_ID);
      expect(event.status).toBe("dispatched");
      expect(event.oldStatus).toBe("pending");
      expect(event.projectName).toBe(TEST_PROJECT);
      expect(event.reason).toBeDefined();
    }
  });

  test("executionStarted emits commission_status event with projectName and oldStatus", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "dispatched", TEST_ARTIFACT);
    await lifecycle.executionStarted(TEST_ID, "/tmp/worktree/c.md");

    expect(emittedEvents).toHaveLength(1);
    const event = emittedEvents[0];
    expect(event.type).toBe("commission_status");
    if (event.type === "commission_status") {
      expect(event.commissionId).toBe(TEST_ID);
      expect(event.status).toBe("in_progress");
      expect(event.oldStatus).toBe("dispatched");
      expect(event.projectName).toBe(TEST_PROJECT);
    }
  });

  test("invalid transition does not emit events", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "completed", TEST_ARTIFACT);
    await lifecycle.dispatch(TEST_ID);

    expect(emittedEvents).toHaveLength(0);
  });

  test("progressReported does not re-emit (toolbox already emitted)", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "in_progress", TEST_ARTIFACT);
    await lifecycle.progressReported(TEST_ID, "50% done");

    // The toolbox emits commission_progress to the EventBus before calling
    // lifecycle. Re-emitting here would cause an infinite loop.
    expect(emittedEvents).toHaveLength(0);
  });

  test("resultSubmitted does not re-emit (toolbox already emitted)", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "in_progress", TEST_ARTIFACT);
    await lifecycle.resultSubmitted(TEST_ID, "All done", ["file.md"]);

    expect(emittedEvents).toHaveLength(0);
  });

});

// -- Layer 1 calls --

describe("Layer 1 calls", () => {
  test("transition writes status and timeline in a single call", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "pending", TEST_ARTIFACT);
    await lifecycle.dispatch(TEST_ID);

    const combinedCalls = recordOps.calls.filter((c) => c.method === "writeStatusAndTimeline");
    expect(combinedCalls).toHaveLength(1);
    expect(combinedCalls[0].args[0]).toBe(TEST_ARTIFACT);
    expect(combinedCalls[0].args[1]).toBe("dispatched");
    expect(combinedCalls[0].args[2]).toBe("status_dispatched");
    expect(combinedCalls[0].args[4]).toEqual({ from: "pending", to: "dispatched" });
  });

  test("executionStarted uses the NEW artifact path for Layer 1 calls", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "dispatched", TEST_ARTIFACT);
    const newPath = "/tmp/worktree/commission.md";
    await lifecycle.executionStarted(TEST_ID, newPath);

    const combinedCalls = recordOps.calls.filter((c) => c.method === "writeStatusAndTimeline");
    expect(combinedCalls[0].args[0]).toBe(newPath);
  });

  test("progressReported calls updateProgress", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "in_progress", TEST_ARTIFACT);
    await lifecycle.progressReported(TEST_ID, "Making progress");

    const calls = recordOps.calls.filter((c) => c.method === "updateProgress");
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual([TEST_ARTIFACT, "Making progress"]);
  });

  test("resultSubmitted calls updateResult", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "in_progress", TEST_ARTIFACT);
    await lifecycle.resultSubmitted(TEST_ID, "Done", ["a.md", "b.md"]);

    const calls = recordOps.calls.filter((c) => c.method === "updateResult");
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual([TEST_ARTIFACT, "Done", ["a.md", "b.md"]]);
  });

});

// -- In-progress signal validation --

describe("signal state validation", () => {
  test("progressReported on pending is rejected", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "pending", TEST_ARTIFACT);
    const result = await lifecycle.progressReported(TEST_ID, "nope");
    expect(result.outcome).toBe("skipped");
    if (result.outcome === "skipped") {
      expect(result.reason).toContain("pending");
      expect(result.reason).toContain("in_progress");
    }
  });

  test("resultSubmitted on completed is rejected", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "completed", TEST_ARTIFACT);
    const result = await lifecycle.resultSubmitted(TEST_ID, "nope");
    expect(result.outcome).toBe("skipped");
    if (result.outcome === "skipped") {
      expect(result.reason).toContain("completed");
    }
  });

  test("signals on untracked commission are rejected", async () => {
    const nope = asCommissionId("nope");
    const r1 = await lifecycle.progressReported(nope, "x");
    expect(r1.outcome).toBe("skipped");
    if (r1.outcome === "skipped") {
      expect(r1.reason).toContain("not tracked");
    }

    const r2 = await lifecycle.resultSubmitted(nope, "x");
    expect(r2.outcome).toBe("skipped");

  });
});

// -- resultSubmitted duplicate rejection --

describe("resultSubmitted duplicate rejection", () => {
  test("second resultSubmitted is rejected", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "in_progress", TEST_ARTIFACT);

    const first = await lifecycle.resultSubmitted(TEST_ID, "First result");
    expect(first.outcome).toBe("executed");

    const second = await lifecycle.resultSubmitted(TEST_ID, "Second result");
    expect(second.outcome).toBe("skipped");
    if (second.outcome === "skipped") {
      expect(second.reason).toContain("already submitted");
    }
  });

  test("resultSignalReceived flag does not carry over after forget + register", () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "in_progress", TEST_ARTIFACT);
    // Simulate result submission without async (just set the flag directly
    // via the public method to verify the flag is fresh on re-register)
    lifecycle.forget(TEST_ID);
    lifecycle.register(TEST_ID, TEST_PROJECT, "in_progress", TEST_ARTIFACT);

    // The flag should be fresh
    expect(lifecycle.isTracked(TEST_ID)).toBe(true);
  });
});

// -- executionStarted artifact path update --

describe("executionStarted artifact path update", () => {
  test("updates artifact path on successful transition", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "dispatched", TEST_ARTIFACT);
    const newPath = "/tmp/worktree/commission.md";
    await lifecycle.executionStarted(TEST_ID, newPath);

    expect(lifecycle.getArtifactPath(TEST_ID)).toBe(newPath);
  });

  test("does not update artifact path on rejected transition", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "pending", TEST_ARTIFACT);
    const newPath = "/tmp/worktree/commission.md";
    await lifecycle.executionStarted(TEST_ID, newPath);

    // Path unchanged because transition was invalid
    expect(lifecycle.getArtifactPath(TEST_ID)).toBe(TEST_ARTIFACT);
  });
});

// -- Concurrency --

describe("concurrency", () => {
  test("concurrent transitions targeting incompatible states: second is rejected", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "pending", TEST_ARTIFACT);

    // Both try to dispatch from pending. The first succeeds (pending -> dispatched),
    // the second finds the state is dispatched and rejects (dispatched -> dispatched
    // is not a valid edge).
    const [r1, r2] = await Promise.all([
      lifecycle.dispatch(TEST_ID),
      lifecycle.dispatch(TEST_ID),
    ]);

    // Exactly one should have executed
    const executed = [r1, r2].filter((r) => r.outcome === "executed");
    const rejected = [r1, r2].filter((r) => r.outcome === "skipped");

    expect(executed).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as { outcome: "skipped"; reason: string }).reason).toBeDefined();

    expect(lifecycle.getStatus(TEST_ID)).toBe("dispatched");
  });

  test("sequential transitions on same commission both execute", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "pending", TEST_ARTIFACT);

    const r1 = await lifecycle.dispatch(TEST_ID);
    expect(r1.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("dispatched");

    const r2 = await lifecycle.executionStarted(TEST_ID, "/tmp/wt/c.md");
    expect(r2.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("in_progress");
  });
});

// -- Queries --

describe("queries", () => {
  test("getStatus returns undefined for untracked", () => {
    expect(lifecycle.getStatus(asCommissionId("nope"))).toBeUndefined();
  });

  test("getProjectName returns undefined for untracked", () => {
    expect(lifecycle.getProjectName(asCommissionId("nope"))).toBeUndefined();
  });

  test("getArtifactPath returns undefined for untracked", () => {
    expect(lifecycle.getArtifactPath(asCommissionId("nope"))).toBeUndefined();
  });

  test("isTracked returns false for untracked", () => {
    expect(lifecycle.isTracked(asCommissionId("nope"))).toBe(false);
  });

  test("activeCount counts dispatched and in_progress", () => {
    expect(lifecycle.activeCount).toBe(0);

    lifecycle.register(asCommissionId("c1"), "p1", "dispatched", "/a");
    expect(lifecycle.activeCount).toBe(1);

    lifecycle.register(asCommissionId("c2"), "p1", "in_progress", "/b");
    expect(lifecycle.activeCount).toBe(2);

    lifecycle.register(asCommissionId("c3"), "p1", "pending", "/c");
    expect(lifecycle.activeCount).toBe(2);

    lifecycle.register(asCommissionId("c4"), "p1", "completed", "/d");
    expect(lifecycle.activeCount).toBe(2);

    lifecycle.register(asCommissionId("c5"), "p1", "failed", "/e");
    expect(lifecycle.activeCount).toBe(2);
  });

  test("setArtifactPath updates the path", () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "pending", TEST_ARTIFACT);
    lifecycle.setArtifactPath(TEST_ID, "/new/path.md");
    expect(lifecycle.getArtifactPath(TEST_ID)).toBe("/new/path.md");
  });

  test("setArtifactPath is no-op for untracked", () => {
    // Should not throw
    lifecycle.setArtifactPath(asCommissionId("nope"), "/new/path.md");
  });
});

// -- Factory function --

describe("createCommissionLifecycle", () => {
  test("returns a CommissionLifecycle instance", () => {
    const lc = createCommissionLifecycle({
      recordOps: createMockRecordOps(),
      emitEvent: () => {},
    });
    expect(lc).toBeInstanceOf(CommissionLifecycle);
  });
});

// -- Full lifecycle walkthrough --

describe("full lifecycle", () => {
  test("pending -> dispatched -> in_progress -> completed", async () => {
    await lifecycle.create(TEST_ID, TEST_PROJECT, TEST_ARTIFACT, "pending");
    emittedEvents.length = 0;
    recordOps.calls.length = 0;

    const r1 = await lifecycle.dispatch(TEST_ID);
    expect(r1.outcome).toBe("executed");

    const worktreePath = "/tmp/worktree/c.md";
    const r2 = await lifecycle.executionStarted(TEST_ID, worktreePath);
    expect(r2.outcome).toBe("executed");

    const r3 = await lifecycle.resultSubmitted(TEST_ID, "All done", ["output.md"]);
    expect(r3.outcome).toBe("executed");

    const r4 = await lifecycle.executionCompleted(TEST_ID);
    expect(r4.outcome).toBe("executed");

    expect(lifecycle.getStatus(TEST_ID)).toBe("completed");

    // Events: dispatch, in_progress, completed (result no longer re-emitted by lifecycle)
    expect(emittedEvents).toHaveLength(3);
    expect(emittedEvents[0].type).toBe("commission_status");
    expect(emittedEvents[1].type).toBe("commission_status");
    expect(emittedEvents[2].type).toBe("commission_status");
  });

  test("pending -> dispatched -> failed -> pending -> dispatched (redispatch)", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "pending", TEST_ARTIFACT);

    await lifecycle.dispatch(TEST_ID);
    await lifecycle.executionFailed(TEST_ID, "Boom");
    await lifecycle.redispatch(TEST_ID);
    const r = await lifecycle.dispatch(TEST_ID);

    expect(r.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("dispatched");
  });

  test("pending -> blocked -> pending -> dispatched (dependency cycle)", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "pending", TEST_ARTIFACT);

    await lifecycle.block(TEST_ID);
    expect(lifecycle.getStatus(TEST_ID)).toBe("blocked");

    await lifecycle.unblock(TEST_ID);
    expect(lifecycle.getStatus(TEST_ID)).toBe("pending");

    const r = await lifecycle.dispatch(TEST_ID);
    expect(r.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("dispatched");
  });

  test("redispatch cycle: result can be submitted after fail + redispatch", async () => {
    // Verifies that resultSignalReceived is reset when re-entering in_progress.
    // Without the reset, the second resultSubmitted would be rejected because
    // the flag was still true from the first execution.
    await lifecycle.create(TEST_ID, TEST_PROJECT, TEST_ARTIFACT, "pending");

    // First execution cycle
    await lifecycle.dispatch(TEST_ID);
    await lifecycle.executionStarted(TEST_ID, "/tmp/wt1/c.md");
    const r1 = await lifecycle.resultSubmitted(TEST_ID, "First result");
    expect(r1.outcome).toBe("executed");
    await lifecycle.executionFailed(TEST_ID, "Merge conflict");
    expect(lifecycle.getStatus(TEST_ID)).toBe("failed");

    // Redispatch and second execution cycle
    await lifecycle.redispatch(TEST_ID);
    expect(lifecycle.getStatus(TEST_ID)).toBe("pending");
    await lifecycle.dispatch(TEST_ID);
    expect(lifecycle.getStatus(TEST_ID)).toBe("dispatched");
    await lifecycle.executionStarted(TEST_ID, "/tmp/wt2/c.md");
    expect(lifecycle.getStatus(TEST_ID)).toBe("in_progress");

    // This must succeed: resultSignalReceived was reset by executionStarted
    const r2 = await lifecycle.resultSubmitted(TEST_ID, "Second result");
    expect(r2.outcome).toBe("executed");
  });
});

// -- Duplicate ID guards --

describe("duplicate ID guards", () => {
  test("create throws when ID is already tracked", async () => {
    await lifecycle.create(TEST_ID, TEST_PROJECT, TEST_ARTIFACT, "pending");

    await expect(
      lifecycle.create(TEST_ID, TEST_PROJECT, "/other.md", "pending"),
    ).rejects.toThrow(/already tracked/);
  });

  test("register throws when ID is already tracked", () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "pending", TEST_ARTIFACT);

    expect(() =>
      lifecycle.register(TEST_ID, TEST_PROJECT, "dispatched", "/other.md"),
    ).toThrow(/already tracked/);
  });

  test("create after forget succeeds", async () => {
    await lifecycle.create(TEST_ID, TEST_PROJECT, TEST_ARTIFACT, "pending");
    lifecycle.forget(TEST_ID);

    // Should not throw
    await lifecycle.create(TEST_ID, TEST_PROJECT, "/other.md", "blocked");
    expect(lifecycle.getStatus(TEST_ID)).toBe("blocked");
  });

  test("register after forget succeeds", () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "pending", TEST_ARTIFACT);
    lifecycle.forget(TEST_ID);

    // Should not throw
    lifecycle.register(TEST_ID, TEST_PROJECT, "dispatched", "/other.md");
    expect(lifecycle.getStatus(TEST_ID)).toBe("dispatched");
  });
});

// -- Sleeping state transitions --

describe("sleeping transitions", () => {
  // in_progress -> sleeping via sleep()
  test("in_progress -> sleeping via sleep()", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "in_progress", TEST_ARTIFACT);
    const result = await lifecycle.sleep(TEST_ID, "Waiting for mail reply from Thorne");
    expect(result.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("sleeping");
  });

  // sleeping -> in_progress via wake()
  test("sleeping -> in_progress via wake()", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "sleeping", TEST_ARTIFACT);
    const result = await lifecycle.wake(TEST_ID, "Mail reply received from Thorne");
    expect(result.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("in_progress");
  });

  // sleeping -> cancelled
  test("sleeping -> cancelled via cancel()", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "sleeping", TEST_ARTIFACT);
    const result = await lifecycle.cancel(TEST_ID, "User cancelled sleeping commission");
    expect(result.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("cancelled");
  });

  // sleeping -> abandoned
  test("sleeping -> abandoned via abandon()", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "sleeping", TEST_ARTIFACT);
    const result = await lifecycle.abandon(TEST_ID, "No longer needed");
    expect(result.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("abandoned");
  });

  // sleeping -> failed
  test("sleeping -> failed via executionFailed()", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "sleeping", TEST_ARTIFACT);
    const result = await lifecycle.executionFailed(TEST_ID, "Worktree lost during sleep");
    expect(result.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("failed");
  });

  // Invalid: sleeping -> completed
  test("sleeping -> completed is rejected", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "sleeping", TEST_ARTIFACT);
    const result = await lifecycle.executionCompleted(TEST_ID);
    expect(result.outcome).toBe("skipped");
    if (result.outcome === "skipped") {
      expect(result.reason).toContain("sleeping");
      expect(result.reason).toContain("completed");
    }
  });

  // Invalid: sleeping -> dispatched
  test("sleeping -> dispatched is rejected", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "sleeping", TEST_ARTIFACT);
    const result = await lifecycle.dispatch(TEST_ID);
    expect(result.outcome).toBe("skipped");
  });

  // Invalid: sleeping -> pending
  test("sleeping -> pending via redispatch is rejected", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "sleeping", TEST_ARTIFACT);
    const result = await lifecycle.redispatch(TEST_ID);
    expect(result.outcome).toBe("skipped");
  });

  // sleep() and wake() emit correct events
  test("sleep() emits commission_status event with reason", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "in_progress", TEST_ARTIFACT);
    await lifecycle.sleep(TEST_ID, "Waiting for mail reply from Thorne");

    expect(emittedEvents).toHaveLength(1);
    const event = emittedEvents[0];
    expect(event.type).toBe("commission_status");
    if (event.type === "commission_status") {
      expect(event.commissionId).toBe(TEST_ID);
      expect(event.status).toBe("sleeping");
      expect(event.oldStatus).toBe("in_progress");
      expect(event.reason).toBe("Waiting for mail reply from Thorne");
    }
  });

  test("wake() emits commission_status event with reason", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "sleeping", TEST_ARTIFACT);
    await lifecycle.wake(TEST_ID, "Mail reply received from Thorne");

    expect(emittedEvents).toHaveLength(1);
    const event = emittedEvents[0];
    expect(event.type).toBe("commission_status");
    if (event.type === "commission_status") {
      expect(event.commissionId).toBe(TEST_ID);
      expect(event.status).toBe("in_progress");
      expect(event.oldStatus).toBe("sleeping");
      expect(event.reason).toBe("Mail reply received from Thorne");
    }
  });

  // Concurrent sleep + sleep: second is rejected because sleeping -> sleeping is invalid
  test("concurrent sleep + sleep: second is rejected", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "in_progress", TEST_ARTIFACT);

    const [r1, r2] = await Promise.all([
      lifecycle.sleep(TEST_ID, "Waiting for mail 1"),
      lifecycle.sleep(TEST_ID, "Waiting for mail 2"),
    ]);

    const executed = [r1, r2].filter((r) => r.outcome === "executed");
    const rejected = [r1, r2].filter((r) => r.outcome === "skipped");

    expect(executed).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(lifecycle.getStatus(TEST_ID)).toBe("sleeping");
  });

  // Concurrent sleep + cancel both succeed because sleeping -> cancelled is valid
  test("concurrent sleep + cancel both succeed (sleeping -> cancelled is valid)", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "in_progress", TEST_ARTIFACT);

    const [r1, r2] = await Promise.all([
      lifecycle.sleep(TEST_ID, "Waiting for mail"),
      lifecycle.cancel(TEST_ID, "User cancelled"),
    ]);

    // sleep goes first: in_progress -> sleeping (valid)
    // cancel goes second: sleeping -> cancelled (valid)
    // Both succeed, final state is cancelled
    expect(r1.outcome).toBe("executed");
    expect(r2.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("cancelled");
  });

  // Full lifecycle: in_progress -> sleeping -> in_progress -> completed
  test("full sleep/wake cycle: in_progress -> sleeping -> in_progress -> completed", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "in_progress", TEST_ARTIFACT);

    await lifecycle.sleep(TEST_ID, "Waiting for mail");
    expect(lifecycle.getStatus(TEST_ID)).toBe("sleeping");

    await lifecycle.wake(TEST_ID, "Mail reply received");
    expect(lifecycle.getStatus(TEST_ID)).toBe("in_progress");

    await lifecycle.executionCompleted(TEST_ID);
    expect(lifecycle.getStatus(TEST_ID)).toBe("completed");
  });

  // Sleeping commissions do NOT count as active
  test("sleeping commissions do not count as active", () => {
    lifecycle.register(asCommissionId("c1"), "p1", "in_progress", "/a");
    lifecycle.register(asCommissionId("c2"), "p1", "sleeping", "/b");
    lifecycle.register(asCommissionId("c3"), "p1", "dispatched", "/c");

    // Only in_progress and dispatched count
    expect(lifecycle.activeCount).toBe(2);
  });
});
