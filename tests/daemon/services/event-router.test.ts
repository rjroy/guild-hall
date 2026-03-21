import { describe, test, expect } from "bun:test";
import { createEventBus, type SystemEvent } from "@/daemon/lib/event-bus";
import { collectingLog, nullLog } from "@/daemon/lib/log";
import { createEventRouter } from "@/daemon/services/event-router";

function makeRouter(logCtx?: ReturnType<typeof collectingLog>) {
  const eventBus = createEventBus(nullLog("test-bus"));
  const ctx = logCtx ?? collectingLog("event-router");
  const { router, cleanup } = createEventRouter({ eventBus, log: ctx.log });
  return { eventBus, router, cleanup, logCtx: ctx };
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

describe("EventRouter subscription and matching", () => {
  test("handler fires when event type matches the rule", async () => {
    const { eventBus, router, cleanup } = makeRouter();
    const calls: SystemEvent[] = [];
    router.subscribe({ type: "commission_result" }, (e) => { calls.push(e); });

    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "done" });
    await tick();
    expect(calls).toHaveLength(1);
    expect(calls[0].type).toBe("commission_result");
    cleanup();
  });

  test("handler does not fire for a non-matching event type", async () => {
    const { eventBus, router, cleanup } = makeRouter();
    const calls: unknown[] = [];
    router.subscribe({ type: "commission_result" }, () => { calls.push(1); });

    eventBus.emit({ type: "meeting_ended", meetingId: "m1" });
    await tick();
    expect(calls).toHaveLength(0);
    cleanup();
  });

  test("rule with projectName matches when event carries the same projectName", async () => {
    const { eventBus, router, cleanup } = makeRouter();
    const calls: unknown[] = [];
    router.subscribe({ type: "schedule_spawned", projectName: "guild-hall" }, () => { calls.push(1); });

    eventBus.emit({ type: "schedule_spawned", scheduleId: "s1", spawnedId: "c1", projectName: "guild-hall", runNumber: 1 });
    await tick();
    expect(calls).toHaveLength(1);
    cleanup();
  });

  test("rule with projectName skips when event does not carry projectName", async () => {
    const { eventBus, router, cleanup } = makeRouter();
    const calls: unknown[] = [];
    router.subscribe({ type: "commission_result", projectName: "guild-hall" }, () => { calls.push(1); });

    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "done" });
    await tick();
    expect(calls).toHaveLength(0);
    cleanup();
  });

  test("rule with projectName skips when event carries a different projectName", async () => {
    const { eventBus, router, cleanup } = makeRouter();
    const calls: unknown[] = [];
    router.subscribe({ type: "commission_status", projectName: "guild-hall" }, () => { calls.push(1); });

    eventBus.emit({ type: "commission_status", commissionId: "c1", status: "active", projectName: "other-project" });
    await tick();
    expect(calls).toHaveLength(0);
    cleanup();
  });

  test("rule without projectName matches regardless of event projectName", async () => {
    const { eventBus, router, cleanup } = makeRouter();
    const calls: unknown[] = [];
    router.subscribe({ type: "schedule_spawned" }, () => { calls.push(1); });

    eventBus.emit({ type: "schedule_spawned", scheduleId: "s1", spawnedId: "c1", projectName: "guild-hall", runNumber: 1 });
    await tick();
    expect(calls).toHaveLength(1);
    cleanup();
  });
});

describe("EventRouter multiple subscriptions", () => {
  test("multiple subscriptions matching the same event fire independently", async () => {
    const { eventBus, router, cleanup } = makeRouter();
    const callsA: unknown[] = [];
    const callsB: unknown[] = [];
    router.subscribe({ type: "commission_result" }, () => { callsA.push(1); });
    router.subscribe({ type: "commission_result" }, () => { callsB.push(1); });

    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "done" });
    await tick();
    expect(callsA).toHaveLength(1);
    expect(callsB).toHaveLength(1);
    cleanup();
  });

  test("same handler registered twice fires twice (no dedup)", async () => {
    const { eventBus, router, cleanup } = makeRouter();
    const calls: unknown[] = [];
    const handler = () => { calls.push(1); };
    router.subscribe({ type: "commission_result" }, handler);
    router.subscribe({ type: "commission_result" }, handler);

    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "done" });
    await tick();
    expect(calls).toHaveLength(2);
    cleanup();
  });
});

describe("EventRouter handler failure isolation", () => {
  test("a handler that throws does not prevent other handlers from firing", async () => {
    const { eventBus, router, cleanup } = makeRouter();
    const calls: unknown[] = [];
    router.subscribe({ type: "commission_result" }, () => { throw new Error("boom"); });
    router.subscribe({ type: "commission_result" }, () => { calls.push(1); });

    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "done" });
    await tick();
    expect(calls).toHaveLength(1);
    cleanup();
  });

  test("a handler that throws is logged at warn level", async () => {
    const logCtx = collectingLog("event-router");
    const { eventBus, router, cleanup } = makeRouter(logCtx);
    router.subscribe({ type: "commission_result" }, () => { throw new Error("handler broke"); });

    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "done" });
    await tick();
    expect(logCtx.messages.warn.length).toBeGreaterThan(0);
    expect(logCtx.messages.warn[0]).toContain("handler broke");
    cleanup();
  });
});

describe("EventRouter unsubscribe", () => {
  test("unsubscribe callback removes that subscription", async () => {
    const { eventBus, router, cleanup } = makeRouter();
    const calls: unknown[] = [];
    const unsub = router.subscribe({ type: "commission_result" }, () => { calls.push(1); });

    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "done" });
    await tick();
    expect(calls).toHaveLength(1);

    unsub();

    eventBus.emit({ type: "commission_result", commissionId: "c2", summary: "done again" });
    await tick();
    expect(calls).toHaveLength(1);
    cleanup();
  });

  test("unsubscribing one subscription does not affect others", async () => {
    const { eventBus, router, cleanup } = makeRouter();
    const callsA: unknown[] = [];
    const callsB: unknown[] = [];
    const unsubA = router.subscribe({ type: "commission_result" }, () => { callsA.push(1); });
    router.subscribe({ type: "commission_result" }, () => { callsB.push(1); });

    unsubA();

    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "done" });
    await tick();
    expect(callsA).toHaveLength(0);
    expect(callsB).toHaveLength(1);
    cleanup();
  });
});

describe("EventRouter cleanup", () => {
  test("cleanup unsubscribes from EventBus, no handlers fire after", async () => {
    const { eventBus, router, cleanup } = makeRouter();
    const calls: unknown[] = [];
    router.subscribe({ type: "commission_result" }, () => { calls.push(1); });

    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "done" });
    await tick();
    expect(calls).toHaveLength(1);

    cleanup();

    eventBus.emit({ type: "commission_result", commissionId: "c2", summary: "done again" });
    await tick();
    expect(calls).toHaveLength(1);
  });
});

describe("EventRouter logging", () => {
  test("info log emitted when a subscription matches", async () => {
    const logCtx = collectingLog("event-router");
    const { eventBus, router, cleanup } = makeRouter(logCtx);
    router.subscribe({ type: "commission_result" }, () => {});

    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "done" });
    await tick();

    expect(logCtx.messages.info.length).toBeGreaterThan(0);
    expect(logCtx.messages.info[0]).toContain("commission_result");
    cleanup();
  });
});
