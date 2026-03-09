import { describe, test, expect, beforeEach } from "bun:test";
import {
  ScheduleLifecycle,
  createScheduleLifecycle,
} from "@/daemon/services/scheduler/schedule-lifecycle";
import type { CommissionRecordOps, ScheduleMetadata } from "@/daemon/services/commission/record";
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
      return Promise.resolve("active");
    },
    readType(_artifactPath: string): Promise<string> {
      calls.push({ method: "readType", args: [_artifactPath] });
      return Promise.resolve("scheduled");
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
    readScheduleMetadata(_artifactPath: string): Promise<ScheduleMetadata> {
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
      updates: Partial<{ runsCompleted: number; lastRun: string; lastSpawnedId: string; cron: string; repeat: number | null }>,
    ): Promise<void> {
      calls.push({ method: "writeScheduleFields", args: [artifactPath, updates] });
      return Promise.resolve();
    },
  };
}

let recordOps: ReturnType<typeof createMockRecordOps>;
let emittedEvents: SystemEvent[];
let lifecycle: ScheduleLifecycle;

const TEST_ID = asCommissionId("schedule-test-001");
const TEST_PROJECT = "test-project";
const TEST_ARTIFACT = "/tmp/test-schedule.md";

beforeEach(() => {
  recordOps = createMockRecordOps();
  emittedEvents = [];
  lifecycle = createScheduleLifecycle({
    recordOps,
    emitEvent: (event: SystemEvent) => emittedEvents.push(event),
  });
});

// -- register --

describe("register", () => {
  test("populates state tracker without writing to disk", () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "active", TEST_ARTIFACT);

    expect(lifecycle.isTracked(TEST_ID)).toBe(true);
    expect(lifecycle.getStatus(TEST_ID)).toBe("active");
    expect(lifecycle.getProjectName(TEST_ID)).toBe(TEST_PROJECT);
    expect(lifecycle.getArtifactPath(TEST_ID)).toBe(TEST_ARTIFACT);

    // No Layer 1 calls
    expect(recordOps.calls).toHaveLength(0);
  });

  test("throws when ID is already tracked", () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "active", TEST_ARTIFACT);

    expect(() =>
      lifecycle.register(TEST_ID, TEST_PROJECT, "paused", "/other.md"),
    ).toThrow(/already tracked/);
  });

  test("accepts all valid schedule statuses", () => {
    const statuses = ["active", "paused", "completed", "failed"] as const;
    for (const status of statuses) {
      const id = asCommissionId(`schedule-${status}`);
      lifecycle.register(id, TEST_PROJECT, status, `/tmp/${status}.md`);
      expect(lifecycle.getStatus(id)).toBe(status);
    }
  });
});

// -- Valid transitions --

describe("valid transitions", () => {
  // active -> paused
  test("active -> paused via pause()", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "active", TEST_ARTIFACT);
    const result = await lifecycle.pause(TEST_ID);
    expect(result.outcome).toBe("executed");
    if (result.outcome === "executed") {
      expect(result.status).toBe("paused");
    }
    expect(lifecycle.getStatus(TEST_ID)).toBe("paused");
  });

  // active -> completed
  test("active -> completed via complete()", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "active", TEST_ARTIFACT);
    const result = await lifecycle.complete(TEST_ID, "All runs finished");
    expect(result.outcome).toBe("executed");
    if (result.outcome === "executed") {
      expect(result.status).toBe("completed");
    }
    expect(lifecycle.getStatus(TEST_ID)).toBe("completed");
  });

  // active -> failed
  test("active -> failed via fail()", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "active", TEST_ARTIFACT);
    const result = await lifecycle.fail(TEST_ID, "Too many consecutive failures");
    expect(result.outcome).toBe("executed");
    if (result.outcome === "executed") {
      expect(result.status).toBe("failed");
    }
    expect(lifecycle.getStatus(TEST_ID)).toBe("failed");
  });

  // paused -> active
  test("paused -> active via resume()", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "paused", TEST_ARTIFACT);
    const result = await lifecycle.resume(TEST_ID);
    expect(result.outcome).toBe("executed");
    if (result.outcome === "executed") {
      expect(result.status).toBe("active");
    }
    expect(lifecycle.getStatus(TEST_ID)).toBe("active");
  });

  // paused -> completed
  test("paused -> completed via complete()", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "paused", TEST_ARTIFACT);
    const result = await lifecycle.complete(TEST_ID, "Retired while paused");
    expect(result.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("completed");
  });

  // paused -> failed
  test("paused -> failed via fail()", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "paused", TEST_ARTIFACT);
    const result = await lifecycle.fail(TEST_ID, "Critical error discovered");
    expect(result.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("failed");
  });

  // failed -> active
  test("failed -> active via reactivate()", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "failed", TEST_ARTIFACT);
    const result = await lifecycle.reactivate(TEST_ID);
    expect(result.outcome).toBe("executed");
    if (result.outcome === "executed") {
      expect(result.status).toBe("active");
    }
    expect(lifecycle.getStatus(TEST_ID)).toBe("active");
  });
});

// -- Invalid transitions --

describe("invalid transitions", () => {
  test("completed -> active is rejected (terminal state)", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "completed", TEST_ARTIFACT);
    const result = await lifecycle.resume(TEST_ID);
    expect(result.outcome).toBe("skipped");
    if (result.outcome === "skipped") {
      expect(result.reason).toContain("completed");
      expect(result.reason).toContain("active");
    }
  });

  test("completed -> paused is rejected (terminal state)", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "completed", TEST_ARTIFACT);
    const result = await lifecycle.pause(TEST_ID);
    expect(result.outcome).toBe("skipped");
    if (result.outcome === "skipped") {
      expect(result.reason).toContain("completed");
    }
  });

  test("completed -> failed is rejected (terminal state)", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "completed", TEST_ARTIFACT);
    const result = await lifecycle.fail(TEST_ID, "nope");
    expect(result.outcome).toBe("skipped");
  });

  test("failed -> paused is rejected", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "failed", TEST_ARTIFACT);
    const result = await lifecycle.pause(TEST_ID);
    expect(result.outcome).toBe("skipped");
    if (result.outcome === "skipped") {
      expect(result.reason).toContain("failed");
      expect(result.reason).toContain("paused");
    }
  });

  test("failed -> completed is rejected", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "failed", TEST_ARTIFACT);
    const result = await lifecycle.complete(TEST_ID, "nope");
    expect(result.outcome).toBe("skipped");
    if (result.outcome === "skipped") {
      expect(result.reason).toContain("failed");
      expect(result.reason).toContain("completed");
    }
  });

  test("active -> active via resume is rejected (self-transition)", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "active", TEST_ARTIFACT);
    const result = await lifecycle.resume(TEST_ID);
    expect(result.outcome).toBe("skipped");
    if (result.outcome === "skipped") {
      expect(result.reason).toContain("active");
    }
  });

  test("paused -> paused via pause is rejected (self-transition)", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "paused", TEST_ARTIFACT);
    const result = await lifecycle.pause(TEST_ID);
    expect(result.outcome).toBe("skipped");
    if (result.outcome === "skipped") {
      expect(result.reason).toContain("paused");
    }
  });

  test("transition on untracked schedule is rejected", async () => {
    const result = await lifecycle.pause(asCommissionId("nonexistent"));
    expect(result.outcome).toBe("skipped");
    if (result.outcome === "skipped") {
      expect(result.reason).toContain("not tracked");
    }
  });
});

// -- Layer 1 calls --

describe("record operations", () => {
  test("transition writes status and timeline in a single call", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "active", TEST_ARTIFACT);
    await lifecycle.pause(TEST_ID);

    const combinedCalls = recordOps.calls.filter((c) => c.method === "writeStatusAndTimeline");
    expect(combinedCalls).toHaveLength(1);
    expect(combinedCalls[0].args[0]).toBe(TEST_ARTIFACT);
    expect(combinedCalls[0].args[1]).toBe("paused");
    expect(combinedCalls[0].args[2]).toBe("schedule_paused");
    expect(combinedCalls[0].args[4]).toEqual({ from: "active", to: "paused" });
  });

  test("complete() passes reason through to record ops", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "active", TEST_ARTIFACT);
    await lifecycle.complete(TEST_ID, "Max runs reached");

    const combinedCalls = recordOps.calls.filter((c) => c.method === "writeStatusAndTimeline");
    expect(combinedCalls[0].args[3]).toBe("Max runs reached");
  });

  test("fail() passes reason through to record ops", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "active", TEST_ARTIFACT);
    await lifecycle.fail(TEST_ID, "Too many consecutive failures");

    const combinedCalls = recordOps.calls.filter((c) => c.method === "writeStatusAndTimeline");
    expect(combinedCalls[0].args[3]).toBe("Too many consecutive failures");
  });

  test("invalid transition does not write to disk", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "completed", TEST_ARTIFACT);
    await lifecycle.resume(TEST_ID);

    expect(recordOps.calls).toHaveLength(0);
  });
});

// -- Event emission --

describe("event emission", () => {
  test("transition emits commission_status event with projectName and oldStatus", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "active", TEST_ARTIFACT);
    await lifecycle.pause(TEST_ID);

    expect(emittedEvents).toHaveLength(1);
    const event = emittedEvents[0];
    expect(event.type).toBe("commission_status");
    if (event.type === "commission_status") {
      expect(event.commissionId).toBe(TEST_ID);
      expect(event.status).toBe("paused");
      expect(event.oldStatus).toBe("active");
      expect(event.projectName).toBe(TEST_PROJECT);
      expect(event.reason).toBe("Schedule paused");
    }
  });

  test("reactivate emits event with correct reason", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "failed", TEST_ARTIFACT);
    await lifecycle.reactivate(TEST_ID);

    expect(emittedEvents).toHaveLength(1);
    const event = emittedEvents[0];
    if (event.type === "commission_status") {
      expect(event.status).toBe("active");
      expect(event.oldStatus).toBe("failed");
      expect(event.reason).toBe("Schedule reactivated");
    }
  });

  test("invalid transition does not emit events", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "completed", TEST_ARTIFACT);
    await lifecycle.resume(TEST_ID);

    expect(emittedEvents).toHaveLength(0);
  });
});

// -- Concurrency --

describe("concurrency", () => {
  test("concurrent transitions on same schedule are serialized: second sees updated state", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "active", TEST_ARTIFACT);

    // Both try to pause from active. First succeeds (active -> paused),
    // second finds state is paused and rejects (paused -> paused is not valid).
    const [r1, r2] = await Promise.all([
      lifecycle.pause(TEST_ID),
      lifecycle.pause(TEST_ID),
    ]);

    const executed = [r1, r2].filter((r) => r.outcome === "executed");
    const rejected = [r1, r2].filter((r) => r.outcome === "skipped");

    expect(executed).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as { outcome: "skipped"; reason: string }).reason).toBeDefined();
    expect(lifecycle.getStatus(TEST_ID)).toBe("paused");
  });

  test("concurrent pause + complete both succeed (paused -> completed is valid)", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "active", TEST_ARTIFACT);

    const [r1, r2] = await Promise.all([
      lifecycle.pause(TEST_ID),
      lifecycle.complete(TEST_ID, "Done"),
    ]);

    // pause goes first: active -> paused (valid)
    // complete goes second: paused -> completed (valid)
    expect(r1.outcome).toBe("executed");
    expect(r2.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("completed");
  });

  test("sequential transitions both execute", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "active", TEST_ARTIFACT);

    const r1 = await lifecycle.pause(TEST_ID);
    expect(r1.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("paused");

    const r2 = await lifecycle.resume(TEST_ID);
    expect(r2.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("active");
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
});

// -- Factory function --

describe("createScheduleLifecycle", () => {
  test("returns a ScheduleLifecycle instance", () => {
    const lc = createScheduleLifecycle({
      recordOps: createMockRecordOps(),
      emitEvent: () => {},
    });
    expect(lc).toBeInstanceOf(ScheduleLifecycle);
  });
});

// -- Full lifecycle walkthroughs --

describe("full lifecycle", () => {
  test("active -> paused -> active -> completed", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "active", TEST_ARTIFACT);

    const r1 = await lifecycle.pause(TEST_ID);
    expect(r1.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("paused");

    const r2 = await lifecycle.resume(TEST_ID);
    expect(r2.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("active");

    const r3 = await lifecycle.complete(TEST_ID, "All runs finished");
    expect(r3.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("completed");

    // 3 transitions, 3 events
    expect(emittedEvents).toHaveLength(3);
    expect(emittedEvents.every((e) => e.type === "commission_status")).toBe(true);
  });

  test("active -> failed -> active -> completed (recovery cycle)", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "active", TEST_ARTIFACT);

    await lifecycle.fail(TEST_ID, "Cron error");
    expect(lifecycle.getStatus(TEST_ID)).toBe("failed");

    await lifecycle.reactivate(TEST_ID);
    expect(lifecycle.getStatus(TEST_ID)).toBe("active");

    const r = await lifecycle.complete(TEST_ID, "Finished after recovery");
    expect(r.outcome).toBe("executed");
    expect(lifecycle.getStatus(TEST_ID)).toBe("completed");
  });

  test("active -> paused -> failed -> active (pause then fail then recover)", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "active", TEST_ARTIFACT);

    await lifecycle.pause(TEST_ID);
    expect(lifecycle.getStatus(TEST_ID)).toBe("paused");

    await lifecycle.fail(TEST_ID, "External dependency broke");
    expect(lifecycle.getStatus(TEST_ID)).toBe("failed");

    await lifecycle.reactivate(TEST_ID);
    expect(lifecycle.getStatus(TEST_ID)).toBe("active");
  });

  test("completed is terminal: no further transitions succeed", async () => {
    lifecycle.register(TEST_ID, TEST_PROJECT, "active", TEST_ARTIFACT);

    await lifecycle.complete(TEST_ID, "Done");
    expect(lifecycle.getStatus(TEST_ID)).toBe("completed");

    const r1 = await lifecycle.resume(TEST_ID);
    expect(r1.outcome).toBe("skipped");

    const r2 = await lifecycle.pause(TEST_ID);
    expect(r2.outcome).toBe("skipped");

    const r3 = await lifecycle.fail(TEST_ID, "nope");
    expect(r3.outcome).toBe("skipped");

    const r4 = await lifecycle.reactivate(TEST_ID);
    expect(r4.outcome).toBe("skipped");

    // Status unchanged
    expect(lifecycle.getStatus(TEST_ID)).toBe("completed");
  });
});
