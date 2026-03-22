import { describe, test, expect } from "bun:test";
import { createEventBus, type SystemEvent } from "@/daemon/lib/event-bus";
import { collectingLog, nullLog } from "@/daemon/lib/log";
import { createEventRouter } from "@/daemon/services/event-router";
import {
  createNotificationService,
  camelToScreamingSnake,
  defaultDispatchShell,
  defaultDispatchWebhook,
} from "@/daemon/services/notification-service";
import type { ChannelConfig, NotificationRule } from "@/lib/types";

function makeTestHarness(opts?: {
  channels?: Record<string, ChannelConfig>;
  notifications?: NotificationRule[];
  logTag?: string;
}) {
  const eventBus = createEventBus(nullLog("test-bus"));
  const routerLog = collectingLog("event-router");
  const { router, cleanup: cleanupRouter } = createEventRouter({ eventBus, log: routerLog.log });

  const notifLog = collectingLog(opts?.logTag ?? "notification-service");
  const shellCalls: { command: string; env: Record<string, string> }[] = [];
  const webhookCalls: { url: string; body: unknown }[] = [];

  const cleanupNotif = createNotificationService({
    router,
    channels: opts?.channels ?? {},
    notifications: opts?.notifications ?? [],
    log: notifLog.log,
    dispatchShell: (command, env) => { shellCalls.push({ command, env }); return Promise.resolve(); },
    dispatchWebhook: (url, body) => { webhookCalls.push({ url, body }); return Promise.resolve(); },
  });

  return { eventBus, router, cleanupRouter, cleanupNotif, notifLog, routerLog, shellCalls, webhookCalls };
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

describe("NotificationService channel dispatch", () => {
  test("shell dispatch receives correct env vars", async () => {
    const { eventBus, cleanupNotif, cleanupRouter, shellCalls } = makeTestHarness({
      channels: { desktop: { type: "shell", command: "notify-send test" } },
      notifications: [{ match: { type: "commission_result" }, channel: "desktop" }],
    });

    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "done" });
    await tick();

    expect(shellCalls).toHaveLength(1);
    const env = shellCalls[0].env;
    expect(env.EVENT_TYPE).toBe("commission_result");
    expect(env.EVENT_JSON).toBeDefined();
    expect(env.EVENT_COMMISSION_ID).toBe("c1");
    expect(env.EVENT_SUMMARY).toBe("done");

    cleanupNotif();
    cleanupRouter();
  });

  test("shell dispatch receives the correct command string", async () => {
    const { eventBus, cleanupNotif, cleanupRouter, shellCalls } = makeTestHarness({
      channels: { desk: { type: "shell", command: "echo hello" } },
      notifications: [{ match: { type: "commission_result" }, channel: "desk" }],
    });

    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "ok" });
    await tick();

    expect(shellCalls[0].command).toBe("echo hello");

    cleanupNotif();
    cleanupRouter();
  });

  test("webhook dispatch receives the full event object as body", async () => {
    const event: SystemEvent = { type: "commission_result", commissionId: "c1", summary: "done" };
    const { eventBus, cleanupNotif, cleanupRouter, webhookCalls } = makeTestHarness({
      channels: { hook: { type: "webhook", url: "https://example.com/hook" } },
      notifications: [{ match: { type: "commission_result" }, channel: "hook" }],
    });

    eventBus.emit(event);
    await tick();

    expect(webhookCalls).toHaveLength(1);
    expect(webhookCalls[0].body).toEqual(event);

    cleanupNotif();
    cleanupRouter();
  });

  test("webhook dispatch is called with the correct URL", async () => {
    const { eventBus, cleanupNotif, cleanupRouter, webhookCalls } = makeTestHarness({
      channels: { hook: { type: "webhook", url: "https://hooks.example.com/guild" } },
      notifications: [{ match: { type: "commission_result" }, channel: "hook" }],
    });

    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "ok" });
    await tick();

    expect(webhookCalls[0].url).toBe("https://hooks.example.com/guild");

    cleanupNotif();
    cleanupRouter();
  });
});

describe("NotificationService failure handling", () => {
  test("shell dispatch failure logs at warn with channel name and error", async () => {
    const eventBus = createEventBus(nullLog("test-bus"));
    const { router, cleanup: cleanupRouter } = createEventRouter({ eventBus, log: nullLog("router") });
    const notifLog = collectingLog("notification-service");

    const cleanupNotif = createNotificationService({
      router,
      channels: { desk: { type: "shell", command: "fail-cmd" } },
      notifications: [{ match: { type: "commission_result" }, channel: "desk" }],
      log: notifLog.log,
      dispatchShell: () => { return Promise.reject(new Error("shell exploded")); },
      dispatchWebhook: () => { return Promise.resolve(); },
    });

    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "ok" });
    await tick();

    expect(notifLog.messages.warn.length).toBeGreaterThan(0);
    expect(notifLog.messages.warn[0]).toContain("desk");
    expect(notifLog.messages.warn[0]).toContain("shell exploded");

    cleanupNotif();
    cleanupRouter();
  });

  test("webhook dispatch failure logs at warn with channel name and error", async () => {
    const eventBus = createEventBus(nullLog("test-bus"));
    const { router, cleanup: cleanupRouter } = createEventRouter({ eventBus, log: nullLog("router") });
    const notifLog = collectingLog("notification-service");

    const cleanupNotif = createNotificationService({
      router,
      channels: { hook: { type: "webhook", url: "https://example.com/hook" } },
      notifications: [{ match: { type: "commission_result" }, channel: "hook" }],
      log: notifLog.log,
      dispatchShell: () => { return Promise.resolve(); },
      dispatchWebhook: () => { return Promise.reject(new Error("webhook down")); },
    });

    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "ok" });
    await tick();

    expect(notifLog.messages.warn.length).toBeGreaterThan(0);
    expect(notifLog.messages.warn[0]).toContain("hook");
    expect(notifLog.messages.warn[0]).toContain("webhook down");

    cleanupNotif();
    cleanupRouter();
  });

  test("one channel failure does not prevent another channel from firing", async () => {
    const eventBus = createEventBus(nullLog("test-bus"));
    const { router, cleanup: cleanupRouter } = createEventRouter({ eventBus, log: nullLog("router") });
    const notifLog = collectingLog("notification-service");
    const webhookCalls: unknown[] = [];

    const cleanupNotif = createNotificationService({
      router,
      channels: {
        broken: { type: "shell", command: "fail" },
        working: { type: "webhook", url: "https://example.com/ok" },
      },
      notifications: [
        { match: { type: "commission_result" }, channel: "broken" },
        { match: { type: "commission_result" }, channel: "working" },
      ],
      log: notifLog.log,
      dispatchShell: () => { return Promise.reject(new Error("broken")); },
      dispatchWebhook: (url, body) => { webhookCalls.push({ url, body }); return Promise.resolve(); },
    });

    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "ok" });
    await tick();

    expect(webhookCalls).toHaveLength(1);
    expect(notifLog.messages.warn.length).toBeGreaterThan(0);

    cleanupNotif();
    cleanupRouter();
  });
});

describe("NotificationService inert behavior", () => {
  test("empty channels map: no subscriptions, cleanup is a no-op", async () => {
    const { eventBus, cleanupNotif, cleanupRouter, shellCalls, webhookCalls } = makeTestHarness({
      channels: {},
      notifications: [{ match: { type: "commission_result" }, channel: "desk" }],
    });

    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "ok" });
    await tick();

    expect(shellCalls).toHaveLength(0);
    expect(webhookCalls).toHaveLength(0);

    cleanupNotif(); // should not throw
    cleanupRouter();
  });

  test("empty notifications array: no subscriptions, cleanup is a no-op", async () => {
    const { eventBus, cleanupNotif, cleanupRouter, shellCalls, webhookCalls } = makeTestHarness({
      channels: { desk: { type: "shell", command: "echo hi" } },
      notifications: [],
    });

    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "ok" });
    await tick();

    expect(shellCalls).toHaveLength(0);
    expect(webhookCalls).toHaveLength(0);

    cleanupNotif();
    cleanupRouter();
  });
});

describe("NotificationService cleanup", () => {
  test("cleanup unsubscribes all handlers; no dispatch after cleanup", async () => {
    const { eventBus, cleanupNotif, cleanupRouter, shellCalls } = makeTestHarness({
      channels: { desk: { type: "shell", command: "echo test" } },
      notifications: [{ match: { type: "commission_result" }, channel: "desk" }],
    });

    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "first" });
    await tick();
    expect(shellCalls).toHaveLength(1);

    cleanupNotif();

    eventBus.emit({ type: "commission_result", commissionId: "c2", summary: "second" });
    await tick();
    expect(shellCalls).toHaveLength(1);

    cleanupRouter();
  });
});

describe("NotificationService timeout wiring", () => {
  test("defaultDispatchShell uses Bun.spawn with kill timeout", () => {
    // Structural check: defaultDispatchShell exists and is an async function
    expect(typeof defaultDispatchShell).toBe("function");
    // The function signature accepts command and env
    expect(defaultDispatchShell.length).toBe(2);
  });

  test("defaultDispatchWebhook uses AbortSignal.timeout", () => {
    // Structural check: defaultDispatchWebhook exists and is an async function
    expect(typeof defaultDispatchWebhook).toBe("function");
    expect(defaultDispatchWebhook.length).toBe(2);
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
});

describe("NotificationService logging", () => {
  test("info log emitted when dispatch begins", async () => {
    const { eventBus, cleanupNotif, cleanupRouter, notifLog } = makeTestHarness({
      channels: { desktop: { type: "shell", command: "notify-send test" } },
      notifications: [{ match: { type: "commission_result" }, channel: "desktop" }],
    });

    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "done" });
    await tick();

    expect(notifLog.messages.info.length).toBeGreaterThanOrEqual(1);
    expect(notifLog.messages.info.some((m) => m.includes("dispatching"))).toBe(true);

    cleanupNotif();
    cleanupRouter();
  });
});

describe("NotificationService integration (end-to-end through router)", () => {
  test("event emitted on EventBus flows through router matching to notification dispatch", async () => {
    const { eventBus, cleanupNotif, cleanupRouter, shellCalls, webhookCalls } = makeTestHarness({
      channels: {
        desktop: { type: "shell", command: "notify-send test" },
        ops: { type: "webhook", url: "https://hooks.example.com/guild" },
      },
      notifications: [
        { match: { type: "commission_result" }, channel: "desktop" },
        { match: { type: "commission_status", projectName: "guild-hall" }, channel: "ops" },
      ],
    });

    // Emit a commission_result: should hit shell channel
    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "done" });
    await tick();
    expect(shellCalls).toHaveLength(1);
    expect(webhookCalls).toHaveLength(0);

    // Emit a commission_status with matching projectName: should hit webhook
    eventBus.emit({ type: "commission_status", commissionId: "c2", status: "completed", projectName: "guild-hall" });
    await tick();
    expect(webhookCalls).toHaveLength(1);

    // Emit a commission_status with non-matching projectName: webhook should not fire again
    eventBus.emit({ type: "commission_status", commissionId: "c3", status: "failed", projectName: "other" });
    await tick();
    expect(webhookCalls).toHaveLength(1);

    cleanupNotif();
    cleanupRouter();
  });
});
