/* eslint-disable @typescript-eslint/require-await -- test dispatch stubs return Promise<void> per interface contract */
import { describe, test, expect } from "bun:test";
import { createEventBus, type SystemEvent } from "@/daemon/lib/event-bus";
import { collectingLog, nullLog } from "@/daemon/lib/log";
import { createEventRouter, camelToScreamingSnake } from "@/daemon/services/event-router";
import type { ChannelConfig, NotificationRule } from "@/lib/types";

function makeRouter(opts: {
  channels: Record<string, ChannelConfig>;
  notifications: NotificationRule[];
  dispatchShell?: (command: string, env: Record<string, string>) => Promise<void>;
  dispatchWebhook?: (url: string, body: unknown) => Promise<void>;
  log?: ReturnType<typeof collectingLog>;
}) {
  const eventBus = createEventBus(nullLog("test-bus"));
  const logCtx = opts.log ?? collectingLog("event-router");
  const cleanup = createEventRouter({
    eventBus,
    channels: opts.channels,
    notifications: opts.notifications,
    log: logCtx.log,
    dispatchShell: opts.dispatchShell,
    dispatchWebhook: opts.dispatchWebhook,
  });
  return { eventBus, cleanup, logCtx };
}

// Helper to wait for async fire-and-forget dispatches to complete
function tick() {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

describe("EventRouter matching logic", () => {
  test("rule matches event with same type", async () => {
    const calls: unknown[] = [];
    const { eventBus, cleanup } = makeRouter({
      channels: { desktop: { type: "shell", command: "echo hi" } },
      notifications: [{ match: { type: "commission_result" }, channel: "desktop" }],
      dispatchShell: async (_cmd, env) => { calls.push(env); },
    });

    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "done" });
    await tick();
    expect(calls).toHaveLength(1);
    cleanup();
  });

  test("rule does not match event with different type", async () => {
    const calls: unknown[] = [];
    const { eventBus, cleanup } = makeRouter({
      channels: { desktop: { type: "shell", command: "echo hi" } },
      notifications: [{ match: { type: "commission_result" }, channel: "desktop" }],
      dispatchShell: async () => { calls.push(1); },
    });

    eventBus.emit({ type: "meeting_ended", meetingId: "m1" });
    await tick();
    expect(calls).toHaveLength(0);
    cleanup();
  });

  test("rule with projectName matches when event carries matching projectName", async () => {
    const calls: unknown[] = [];
    const { eventBus, cleanup } = makeRouter({
      channels: { hook: { type: "webhook", url: "https://example.com" } },
      notifications: [{ match: { type: "schedule_spawned", projectName: "guild-hall" }, channel: "hook" }],
      dispatchWebhook: async (_url, body) => { calls.push(body); },
    });

    eventBus.emit({ type: "schedule_spawned", scheduleId: "s1", spawnedId: "c1", projectName: "guild-hall", runNumber: 1 });
    await tick();
    expect(calls).toHaveLength(1);
    cleanup();
  });

  test("rule with projectName skips event that does not carry projectName", async () => {
    const calls: unknown[] = [];
    const { eventBus, cleanup } = makeRouter({
      channels: { desktop: { type: "shell", command: "echo hi" } },
      notifications: [{ match: { type: "commission_result", projectName: "guild-hall" }, channel: "desktop" }],
      dispatchShell: async () => { calls.push(1); },
    });

    // commission_result has no projectName field
    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "done" });
    await tick();
    expect(calls).toHaveLength(0);
    cleanup();
  });

  test("rule with projectName skips event with non-matching projectName", async () => {
    const calls: unknown[] = [];
    const { eventBus, cleanup } = makeRouter({
      channels: { hook: { type: "webhook", url: "https://example.com" } },
      notifications: [{ match: { type: "commission_status", projectName: "guild-hall" }, channel: "hook" }],
      dispatchWebhook: async () => { calls.push(1); },
    });

    eventBus.emit({ type: "commission_status", commissionId: "c1", status: "active", projectName: "other-project" });
    await tick();
    expect(calls).toHaveLength(0);
    cleanup();
  });

  test("rule without projectName matches regardless of event projectName", async () => {
    const calls: unknown[] = [];
    const { eventBus, cleanup } = makeRouter({
      channels: { hook: { type: "webhook", url: "https://example.com" } },
      notifications: [{ match: { type: "schedule_spawned" }, channel: "hook" }],
      dispatchWebhook: async () => { calls.push(1); },
    });

    eventBus.emit({ type: "schedule_spawned", scheduleId: "s1", spawnedId: "c1", projectName: "guild-hall", runNumber: 1 });
    await tick();
    expect(calls).toHaveLength(1);
    cleanup();
  });

  test("multiple rules matching same event dispatch independently", async () => {
    const shellCalls: unknown[] = [];
    const webhookCalls: unknown[] = [];
    const { eventBus, cleanup } = makeRouter({
      channels: {
        desktop: { type: "shell", command: "echo hi" },
        hook: { type: "webhook", url: "https://example.com" },
      },
      notifications: [
        { match: { type: "commission_result" }, channel: "desktop" },
        { match: { type: "commission_result" }, channel: "hook" },
      ],
      dispatchShell: async () => { shellCalls.push(1); },
      dispatchWebhook: async () => { webhookCalls.push(1); },
    });

    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "done" });
    await tick();
    expect(shellCalls).toHaveLength(1);
    expect(webhookCalls).toHaveLength(1);
    cleanup();
  });

  test("two rules routing to same channel fire the channel twice (no dedup)", async () => {
    const calls: unknown[] = [];
    const { eventBus, cleanup } = makeRouter({
      channels: { desktop: { type: "shell", command: "echo hi" } },
      notifications: [
        { match: { type: "commission_result" }, channel: "desktop" },
        { match: { type: "commission_result" }, channel: "desktop" },
      ],
      dispatchShell: async () => { calls.push(1); },
    });

    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "done" });
    await tick();
    expect(calls).toHaveLength(2);
    cleanup();
  });
});

describe("EventRouter channel dispatch", () => {
  test("shell dispatch receives correct env vars", async () => {
    let capturedEnv: Record<string, string> = {};
    const { eventBus, cleanup } = makeRouter({
      channels: { desktop: { type: "shell", command: "echo hi" } },
      notifications: [{ match: { type: "commission_result" }, channel: "desktop" }],
      dispatchShell: async (_cmd, env) => { capturedEnv = env; },
    });

    const event: SystemEvent = { type: "commission_result", commissionId: "c-123", summary: "Build complete" };
    eventBus.emit(event);
    await tick();

    expect(capturedEnv.EVENT_TYPE).toBe("commission_result");
    expect(capturedEnv.EVENT_JSON).toBe(JSON.stringify(event));
    expect(capturedEnv.EVENT_COMMISSION_ID).toBe("c-123");
    expect(capturedEnv.EVENT_SUMMARY).toBe("Build complete");
    cleanup();
  });

  test("webhook dispatch receives the full event object", async () => {
    let capturedBody: unknown;
    const { eventBus, cleanup } = makeRouter({
      channels: { hook: { type: "webhook", url: "https://example.com/hook" } },
      notifications: [{ match: { type: "meeting_ended" }, channel: "hook" }],
      dispatchWebhook: async (_url, body) => { capturedBody = body; },
    });

    const event: SystemEvent = { type: "meeting_ended", meetingId: "m-42" };
    eventBus.emit(event);
    await tick();

    expect(capturedBody).toEqual(event);
    cleanup();
  });

  test("webhook dispatch is called with the correct URL", async () => {
    let capturedUrl = "";
    const { eventBus, cleanup } = makeRouter({
      channels: { hook: { type: "webhook", url: "https://hooks.example.com/guild" } },
      notifications: [{ match: { type: "meeting_ended" }, channel: "hook" }],
      dispatchWebhook: async (url) => { capturedUrl = url; },
    });

    eventBus.emit({ type: "meeting_ended", meetingId: "m-1" });
    await tick();

    expect(capturedUrl).toBe("https://hooks.example.com/guild");
    cleanup();
  });
});

describe("EventRouter failure handling", () => {
  test("shell dispatch failure logs at warn level", async () => {
    const logCtx = collectingLog("event-router");
    const { eventBus, cleanup } = makeRouter({
      channels: { desktop: { type: "shell", command: "echo hi" } },
      notifications: [{ match: { type: "commission_result" }, channel: "desktop" }],
      dispatchShell: async () => { throw new Error("spawn failed"); },
      log: logCtx,
    });

    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "done" });
    await tick();

    expect(logCtx.messages.warn.length).toBeGreaterThan(0);
    expect(logCtx.messages.warn[0]).toContain("spawn failed");
    expect(logCtx.messages.warn[0]).toContain("desktop");
    cleanup();
  });

  test("webhook dispatch failure logs at warn level", async () => {
    const logCtx = collectingLog("event-router");
    const { eventBus, cleanup } = makeRouter({
      channels: { hook: { type: "webhook", url: "https://example.com" } },
      notifications: [{ match: { type: "meeting_ended" }, channel: "hook" }],
      dispatchWebhook: async () => { throw new Error("network error"); },
      log: logCtx,
    });

    eventBus.emit({ type: "meeting_ended", meetingId: "m1" });
    await tick();

    expect(logCtx.messages.warn.length).toBeGreaterThan(0);
    expect(logCtx.messages.warn[0]).toContain("network error");
    cleanup();
  });

  test("one channel failure does not prevent another channel from firing", async () => {
    const webhookCalls: unknown[] = [];
    const logCtx = collectingLog("event-router");
    const { eventBus, cleanup } = makeRouter({
      channels: {
        failing: { type: "shell", command: "fail" },
        working: { type: "webhook", url: "https://example.com" },
      },
      notifications: [
        { match: { type: "commission_result" }, channel: "failing" },
        { match: { type: "commission_result" }, channel: "working" },
      ],
      dispatchShell: async () => { throw new Error("shell broke"); },
      dispatchWebhook: async () => { webhookCalls.push(1); },
      log: logCtx,
    });

    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "done" });
    await tick();

    expect(webhookCalls).toHaveLength(1);
    expect(logCtx.messages.warn.length).toBeGreaterThan(0);
    cleanup();
  });
});

describe("EventRouter inert behavior", () => {
  test("empty channels map: no subscription, returns cleanup function", () => {
    const eventBus = createEventBus(nullLog("test-bus"));
    const logCtx = collectingLog("event-router");
    const cleanup = createEventRouter({
      eventBus,
      channels: {},
      notifications: [{ match: { type: "commission_result" }, channel: "desktop" }],
      log: logCtx.log,
    });
    expect(typeof cleanup).toBe("function");
    // Emit and verify nothing happens (no subscription, no crash)
    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "done" });
    expect(logCtx.messages.info).toHaveLength(0);
    cleanup();
  });

  test("empty notifications array: no subscription, returns cleanup function", () => {
    const eventBus = createEventBus(nullLog("test-bus"));
    const logCtx = collectingLog("event-router");
    const cleanup = createEventRouter({
      eventBus,
      channels: { desktop: { type: "shell", command: "echo hi" } },
      notifications: [],
      log: logCtx.log,
    });
    expect(typeof cleanup).toBe("function");
    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "done" });
    expect(logCtx.messages.info).toHaveLength(0);
    cleanup();
  });
});

describe("EventRouter cleanup", () => {
  test("returned cleanup function unsubscribes from EventBus", async () => {
    const calls: unknown[] = [];
    const { eventBus, cleanup } = makeRouter({
      channels: { desktop: { type: "shell", command: "echo hi" } },
      notifications: [{ match: { type: "commission_result" }, channel: "desktop" }],
      dispatchShell: async () => { calls.push(1); },
    });

    // First emit should dispatch
    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "done" });
    await tick();
    expect(calls).toHaveLength(1);

    // Unsubscribe
    cleanup();

    // Second emit should not dispatch
    eventBus.emit({ type: "commission_result", commissionId: "c2", summary: "done again" });
    await tick();
    expect(calls).toHaveLength(1);
  });
});

describe("camelToScreamingSnake", () => {
  test("commissionId -> COMMISSION_ID", () => {
    expect(camelToScreamingSnake("commissionId")).toBe("COMMISSION_ID");
  });

  test("projectName -> PROJECT_NAME", () => {
    expect(camelToScreamingSnake("projectName")).toBe("PROJECT_NAME");
  });

  test("type -> TYPE", () => {
    expect(camelToScreamingSnake("type")).toBe("TYPE");
  });

  test("summary -> SUMMARY", () => {
    expect(camelToScreamingSnake("summary")).toBe("SUMMARY");
  });

  test("targetWorker -> TARGET_WORKER", () => {
    expect(camelToScreamingSnake("targetWorker")).toBe("TARGET_WORKER");
  });
});

describe("EventRouter info logging", () => {
  test("logs at info level when dispatching", async () => {
    const logCtx = collectingLog("event-router");
    const { eventBus, cleanup } = makeRouter({
      channels: { desktop: { type: "shell", command: "echo hi" } },
      notifications: [{ match: { type: "commission_result" }, channel: "desktop" }],
      dispatchShell: async () => {},
      log: logCtx,
    });

    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "done" });
    await tick();

    expect(logCtx.messages.info.length).toBeGreaterThan(0);
    expect(logCtx.messages.info[0]).toContain("commission_result");
    expect(logCtx.messages.info[0]).toContain("desktop");
    cleanup();
  });
});

describe("EventRouter integration", () => {
  test("end-to-end: emit -> match -> dispatch with real EventBus", async () => {
    const dispatched: Array<{ channel: string; event: SystemEvent }> = [];
    const eventBus = createEventBus(nullLog("test-bus"));
    const logCtx = collectingLog("event-router");

    const cleanup = createEventRouter({
      eventBus,
      channels: {
        desktop: { type: "shell", command: "notify-send test" },
        ops: { type: "webhook", url: "https://hooks.example.com/guild" },
      },
      notifications: [
        { match: { type: "commission_result" }, channel: "desktop" },
        { match: { type: "schedule_spawned", projectName: "guild-hall" }, channel: "ops" },
      ],
      log: logCtx.log,
      dispatchShell: async (_cmd, env) => {
        dispatched.push({ channel: "desktop", event: JSON.parse(env.EVENT_JSON) });
      },
      dispatchWebhook: async (_url, body) => {
        dispatched.push({ channel: "ops", event: body as SystemEvent });
      },
    });

    // Should match desktop rule
    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "done" });
    // Should match ops rule
    eventBus.emit({ type: "schedule_spawned", scheduleId: "s1", spawnedId: "c2", projectName: "guild-hall", runNumber: 1 });
    // Should not match anything (wrong project)
    eventBus.emit({ type: "schedule_spawned", scheduleId: "s2", spawnedId: "c3", projectName: "other", runNumber: 2 });

    await tick();

    expect(dispatched).toHaveLength(2);
    expect(dispatched[0].channel).toBe("desktop");
    expect(dispatched[0].event.type).toBe("commission_result");
    expect(dispatched[1].channel).toBe("ops");
    expect(dispatched[1].event.type).toBe("schedule_spawned");

    cleanup();
  });
});
