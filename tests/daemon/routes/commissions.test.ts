import { describe, test, expect } from "bun:test";
import { createApp } from "@/daemon/app";
import type { CommissionSessionForRoutes } from "@/daemon/services/commission/orchestrator";
import type { CommissionId } from "@/daemon/types";

// -- Mock commission session --

type CallRecord = {
  method: string;
  args: unknown[];
};

function makeMockCommissionSession(
  overrides: Partial<CommissionSessionForRoutes> = {},
): { session: CommissionSessionForRoutes; calls: CallRecord[] } {
  const calls: CallRecord[] = [];

  const session: CommissionSessionForRoutes = {
    createCommission(
      projectName: string,
      title: string,
      workerName: string,
      prompt: string,
      dependencies?: string[],
      resourceOverrides?: { model?: string },
      options?: { type?: "one-shot" | "scheduled"; sourceSchedule?: string },
    ) {
      calls.push({
        method: "createCommission",
        args: [
          projectName,
          title,
          workerName,
          prompt,
          dependencies,
          resourceOverrides,
          options,
        ],
      });
      return Promise.resolve({
        commissionId: "commission-test-worker-20260221-120000",
      });
    },
    updateCommission(
      commissionId: CommissionId,
      updates: {
        prompt?: string;
        dependencies?: string[];
        resourceOverrides?: { model?: string };
      },
    ) {
      calls.push({
        method: "updateCommission",
        args: [commissionId, updates],
      });
      return Promise.resolve();
    },
    dispatchCommission(commissionId: CommissionId) {
      calls.push({ method: "dispatchCommission", args: [commissionId] });
      return Promise.resolve({ status: "accepted" as const });
    },
    cancelCommission(commissionId: CommissionId) {
      calls.push({ method: "cancelCommission", args: [commissionId] });
      return Promise.resolve();
    },
    abandonCommission(commissionId: CommissionId, reason: string) {
      calls.push({ method: "abandonCommission", args: [commissionId, reason] });
      return Promise.resolve();
    },
    redispatchCommission(commissionId: CommissionId) {
      calls.push({ method: "redispatchCommission", args: [commissionId] });
      return Promise.resolve({ status: "accepted" as const });
    },
    addUserNote(commissionId: CommissionId, content: string) {
      calls.push({ method: "addUserNote", args: [commissionId, content] });
      return Promise.resolve();
    },
    checkDependencyTransitions(projectName: string) {
      calls.push({ method: "checkDependencyTransitions", args: [projectName] });
      return Promise.resolve();
    },
    recoverCommissions() {
      return Promise.resolve(0);
    },
    getActiveCommissions() {
      return 0;
    },
    createScheduledCommission(params: { projectName: string; title: string; workerName: string; prompt: string; cron: string }) {
      calls.push({ method: "createScheduledCommission", args: [params] });
      return Promise.resolve({ commissionId: "schedule-test-worker-20260221-120000" });
    },
    createTriggeredCommission(params: { projectName: string; title: string; workerName: string; prompt: string; match: unknown }) {
      calls.push({ method: "createTriggeredCommission", args: [params] });
      return Promise.resolve({ commissionId: "trigger-test-worker-20260221-120000" });
    },
    updateScheduleStatus(commissionId: CommissionId, targetStatus: string) {
      calls.push({ method: "updateScheduleStatus", args: [commissionId, targetStatus] });
      return Promise.resolve({ outcome: "executed", status: targetStatus });
    },
    updateTriggerStatus(commissionId: CommissionId, targetStatus: string, projectName: string) {
      calls.push({ method: "updateTriggerStatus", args: [commissionId, targetStatus, projectName] });
      return Promise.resolve({ commissionId: commissionId as string, status: targetStatus });
    },
    shutdown() {
      // no-op
    },
    ...overrides,
  };

  return { session, calls };
}

function makeTestApp(
  sessionOverrides: Partial<CommissionSessionForRoutes> = {},
) {
  const { session, calls } = makeMockCommissionSession(sessionOverrides);
  const { app } = createApp({
    health: {
      getMeetingCount: () => 0,
      getCommissionCount: () => session.getActiveCommissions(),
      getUptimeSeconds: () => 42,
    },
    commissionSession: session,
  });
  return { app, calls };
}

// -- Tests --

describe("POST /commission/request/commission/create", () => {
  test("creates commission and returns 201 with ID", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commission/request/commission/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName: "test-project",
        title: "Fix the auth bug",
        workerName: "test-worker",
        prompt: "Fix the authentication issue in login.ts",
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { commissionId: string };
    expect(body.commissionId).toBe(
      "commission-test-worker-20260221-120000",
    );
  });

  test("returns 400 for missing required fields", async () => {
    const { app } = makeTestApp();

    // Missing title
    const res = await app.request("/commission/request/commission/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName: "test-project",
        workerName: "test-worker",
        prompt: "Fix something",
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Missing required fields");
  });

  test("returns 400 for invalid JSON body", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commission/request/commission/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Invalid JSON");
  });

  test("passes all fields to session including optional ones", async () => {
    const { app, calls } = makeTestApp();

    await app.request("/commission/request/commission/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName: "my-project",
        title: "Build feature",
        workerName: "builder",
        prompt: "Build the thing",
        dependencies: ["dep-1", "dep-2"],
        resourceOverrides: { model: "sonnet" },
      }),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("createCommission");
    expect(calls[0].args[0]).toBe("my-project");
    expect(calls[0].args[1]).toBe("Build feature");
    expect(calls[0].args[2]).toBe("builder");
    expect(calls[0].args[3]).toBe("Build the thing");
    expect(calls[0].args[4]).toEqual(["dep-1", "dep-2"]);
    expect(calls[0].args[5]).toEqual({ model: "sonnet" });
  });

  test("returns 500 for internal errors", async () => {
    const { app } = makeTestApp({
      createCommission() {
        return Promise.reject(new Error('Project "unknown" not found'));
      },
    });

    const res = await app.request("/commission/request/commission/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName: "unknown",
        title: "Test",
        workerName: "test-worker",
        prompt: "Do something",
      }),
    });

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("not found");
  });
});

describe("POST /commission/request/commission/update", () => {
  test("returns 200 for valid update", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commission/request/commission/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionId: "commission-test-001", prompt: "Updated prompt" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  test("returns 409 when not pending", async () => {
    const { app } = makeTestApp({
      updateCommission() {
        return Promise.reject(
          new Error(
            'Cannot update commission "c-001": status is "in_progress", must be "pending"',
          ),
        );
      },
    });

    const res = await app.request("/commission/request/commission/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionId: "c-001", prompt: "New prompt" }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('must be "pending"');
  });

  test("returns 400 for invalid JSON body", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commission/request/commission/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Invalid JSON");
  });

  test("passes commissionId and updates to session", async () => {
    const { app, calls } = makeTestApp();

    await app.request("/commission/request/commission/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commissionId: "my-commission-42",
        prompt: "Updated prompt",
        dependencies: ["dep-a"],
      }),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("updateCommission");
    expect(calls[0].args[0]).toBe("my-commission-42");
    expect(calls[0].args[1]).toEqual({
      prompt: "Updated prompt",
      dependencies: ["dep-a"],
    });
  });
});

describe("POST /commission/run/dispatch", () => {
  test("returns 202 on success", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commission/run/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionId: "c-001" }),
    });

    expect(res.status).toBe(202);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("accepted");
  });

  test("returns 409 on wrong status", async () => {
    const { app } = makeTestApp({
      dispatchCommission() {
        return Promise.reject(
          new Error(
            'Cannot dispatch commission "c-001": status is "in_progress", must be "pending"',
          ),
        );
      },
    });

    const res = await app.request("/commission/run/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionId: "c-001" }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('must be "pending"');
  });

  test("passes correct commissionId to session", async () => {
    const { app, calls } = makeTestApp();

    await app.request("/commission/run/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionId: "specific-commission-99" }),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("dispatchCommission");
    expect(calls[0].args[0]).toBe("specific-commission-99");
  });
});

describe("POST /commission/run/cancel", () => {
  test("returns 200 on success", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commission/run/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionId: "c-001" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  test("returns 404 when not found", async () => {
    const { app } = makeTestApp({
      cancelCommission() {
        return Promise.reject(
          new Error(
            'Commission "unknown" not found in active commissions',
          ),
        );
      },
    });

    const res = await app.request("/commission/run/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionId: "unknown" }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("not found");
  });

  test("returns 409 when not cancellable", async () => {
    const { app } = makeTestApp({
      cancelCommission() {
        return Promise.reject(
          new Error(
            'Invalid commission transition: "completed" -> "cancelled"',
          ),
        );
      },
    });

    const res = await app.request("/commission/run/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionId: "c-completed" }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Invalid commission transition");
  });

  test("passes correct commissionId to session", async () => {
    const { app, calls } = makeTestApp();

    await app.request("/commission/run/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionId: "cancel-me-123" }),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("cancelCommission");
    expect(calls[0].args[0]).toBe("cancel-me-123");
  });
});

describe("POST /commission/run/redispatch", () => {
  test("returns 202 on success", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commission/run/redispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionId: "c-001" }),
    });

    expect(res.status).toBe(202);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("accepted");
  });

  test("returns 409 on wrong status", async () => {
    const { app } = makeTestApp({
      redispatchCommission() {
        return Promise.reject(
          new Error(
            'Cannot redispatch commission "c-001": status is "in_progress", must be "failed" or "cancelled"',
          ),
        );
      },
    });

    const res = await app.request("/commission/run/redispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionId: "c-001" }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('must be "failed" or "cancelled"');
  });

  test("passes correct commissionId to session", async () => {
    const { app, calls } = makeTestApp();

    await app.request("/commission/run/redispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionId: "redispatch-me-77" }),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("redispatchCommission");
    expect(calls[0].args[0]).toBe("redispatch-me-77");
  });
});

// IPC routes (progress, result, question) were removed in the in-process
// commission migration. Those endpoints no longer exist; callbacks handle
// progress/result/question directly within the commission session.

describe("POST /commission/request/commission/note", () => {
  test("returns 200", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commission/request/commission/note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionId: "c-001", content: "Please prioritize tests" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  test("returns 400 when content is missing", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commission/request/commission/note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionId: "c-001" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Missing required field: content");
  });

  test("passes commissionId and content to session", async () => {
    const { app, calls } = makeTestApp();

    await app.request("/commission/request/commission/note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionId: "note-me-42", content: "Use the existing auth module" }),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("addUserNote");
    expect(calls[0].args[0]).toBe("note-me-42");
    expect(calls[0].args[1]).toBe("Use the existing auth module");
  });
});

describe("POST /commission/run/abandon", () => {
  test("returns 200 on success with reason", async () => {
    const { app, calls } = makeTestApp();

    const res = await app.request("/commission/run/abandon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionId: "commission-test-001", reason: "Work done elsewhere" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("abandonCommission");
    expect(calls[0].args[0]).toBe("commission-test-001");
    expect(calls[0].args[1]).toBe("Work done elsewhere");
  });

  test("returns 400 when reason is missing", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commission/run/abandon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionId: "commission-test-001" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Missing required field: reason");
  });

  test("returns 400 on invalid JSON", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commission/run/abandon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Invalid JSON");
  });

  test("returns 404 when commission not found", async () => {
    const { app } = makeTestApp({
      abandonCommission() {
        return Promise.reject(
          new Error('Commission "ghost-001" not found in any project'),
        );
      },
    });

    const res = await app.request("/commission/run/abandon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionId: "ghost-001", reason: "Gone" }),
    });

    expect(res.status).toBe(404);
  });

  test("returns 409 on invalid transition", async () => {
    const { app } = makeTestApp({
      abandonCommission() {
        return Promise.reject(
          new Error('Cannot abandon commission "c1": it has an active session. Cancel it first.'),
        );
      },
    });

    const res = await app.request("/commission/run/abandon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionId: "c1", reason: "Test" }),
    });

    expect(res.status).toBe(409);
  });

  test("returns 500 on unexpected error", async () => {
    const { app } = makeTestApp({
      abandonCommission() {
        return Promise.reject(new Error("Unexpected disk error"));
      },
    });

    const res = await app.request("/commission/run/abandon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionId: "c1", reason: "Test" }),
    });

    expect(res.status).toBe(500);
  });
});

describe("POST /commission/request/commission/create (scheduled)", () => {
  test("passes type option when type is scheduled", async () => {
    const { app, calls } = makeTestApp();

    const res = await app.request("/commission/request/commission/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName: "test-project",
        title: "Weekly report",
        workerName: "writer",
        prompt: "Write the weekly report",
        type: "scheduled",
        cron: "0 9 * * 1",
        repeat: 4,
      }),
    });

    expect(res.status).toBe(201);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("createScheduledCommission");
    const params = calls[0].args[0] as Record<string, unknown>;
    expect(params.projectName).toBe("test-project");
    expect(params.title).toBe("Weekly report");
    expect(params.workerName).toBe("writer");
    expect(params.prompt).toBe("Write the weekly report");
    expect(params.cron).toBe("0 9 * * 1");
    expect(params.repeat).toBe(4);
  });

  test("returns 400 when type is scheduled but cron is missing", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commission/request/commission/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName: "test-project",
        title: "Weekly report",
        workerName: "writer",
        prompt: "Write the weekly report",
        type: "scheduled",
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("cron");
  });

  test("does not pass options for one-shot commissions", async () => {
    const { app, calls } = makeTestApp();

    await app.request("/commission/request/commission/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName: "test-project",
        title: "One-time task",
        workerName: "builder",
        prompt: "Build the thing",
      }),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].args[6]).toBeUndefined();
  });

  test("scheduled commission with cron but no repeat succeeds", async () => {
    const { app, calls } = makeTestApp();

    const res = await app.request("/commission/request/commission/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName: "test-project",
        title: "Indefinite schedule",
        workerName: "researcher",
        prompt: "Run forever",
        type: "scheduled",
        cron: "0 0 * * *",
      }),
    });

    expect(res.status).toBe(201);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("createScheduledCommission");
    const params = calls[0].args[0] as Record<string, unknown>;
    expect(params.cron).toBe("0 0 * * *");
    expect(params.repeat).toBeUndefined();
  });
});

describe("POST /commission/schedule/commission/update", () => {
  test("returns 200 on successful status transition", async () => {
    const { app, calls } = makeTestApp();

    const res = await app.request("/commission/schedule/commission/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionId: "schedule-test-001", status: "paused" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("paused");

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("updateScheduleStatus");
    expect(calls[0].args[0]).toBe("schedule-test-001");
    expect(calls[0].args[1]).toBe("paused");
  });

  test("returns 409 when transition is invalid (skipped outcome)", async () => {
    const { app } = makeTestApp({
      updateScheduleStatus() {
        return Promise.resolve({ outcome: "skipped", reason: "Already paused" });
      },
    });

    const res = await app.request("/commission/schedule/commission/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionId: "schedule-test-001", status: "paused" }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Already paused");
  });

  test("returns 409 when commission is not a scheduled type", async () => {
    const { app } = makeTestApp({
      updateScheduleStatus() {
        return Promise.reject(
          new Error('Commission "c-001" is not a scheduled commission'),
        );
      },
    });

    const res = await app.request("/commission/schedule/commission/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionId: "c-001", status: "paused" }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("not a scheduled");
  });

  test("returns 404 when commission is not found", async () => {
    const { app } = makeTestApp({
      updateScheduleStatus() {
        return Promise.reject(
          new Error('Commission "ghost-schedule" not found'),
        );
      },
    });

    const res = await app.request("/commission/schedule/commission/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionId: "ghost-schedule", status: "active" }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("not found");
  });

  test("returns 400 when status field is missing", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commission/schedule/commission/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionId: "schedule-test-001" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Missing required field: status");
  });

  test("returns 400 on invalid JSON", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commission/schedule/commission/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Invalid JSON");
  });
});

describe("POST /commission/request/commission/create (triggered)", () => {
  test("passes type triggered with match fields", async () => {
    const { app, calls } = makeTestApp();

    const res = await app.request("/commission/request/commission/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName: "test-project",
        title: "On completion",
        workerName: "writer",
        prompt: "Process results",
        type: "triggered",
        match: { type: "commission_status", fields: { status: "completed" } },
        approval: "auto",
        maxDepth: 5,
      }),
    });

    expect(res.status).toBe(201);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("createTriggeredCommission");
    const params = calls[0].args[0] as Record<string, unknown>;
    expect(params.projectName).toBe("test-project");
    expect(params.title).toBe("On completion");
    expect(params.match).toEqual({ type: "commission_status", fields: { status: "completed" } });
    expect(params.approval).toBe("auto");
    expect(params.maxDepth).toBe(5);
  });

  test("returns 400 when type is triggered but match is missing", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commission/request/commission/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName: "test-project",
        title: "Missing match",
        workerName: "writer",
        prompt: "Test",
        type: "triggered",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("match");
  });

  test("returns 400 when match.type is not a valid system event type", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commission/request/commission/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName: "test-project",
        title: "Bad type",
        workerName: "writer",
        prompt: "Test",
        type: "triggered",
        match: { type: "not_a_real_event" },
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("Invalid match.type");
    expect(body.error).toContain("not_a_real_event");
  });

  test("returns 400 when match.type is missing", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commission/request/commission/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName: "test-project",
        title: "No type",
        workerName: "writer",
        prompt: "Test",
        type: "triggered",
        match: { fields: { status: "completed" } },
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("Invalid match.type");
  });

  test("triggered with defaults for approval and maxDepth", async () => {
    const { app, calls } = makeTestApp();

    const res = await app.request("/commission/request/commission/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName: "test-project",
        title: "Defaults",
        workerName: "writer",
        prompt: "Test",
        type: "triggered",
        match: { type: "meeting_ended" },
      }),
    });

    expect(res.status).toBe(201);
    const params = calls[0].args[0] as Record<string, unknown>;
    // approval and maxDepth are undefined (the orchestrator applies defaults)
    expect(params.approval).toBeUndefined();
    expect(params.maxDepth).toBeUndefined();
  });
});

// -- POST /commission/trigger/commission/update --

describe("POST /commission/trigger/commission/update", () => {
  test("returns 400 when commissionId is missing", async () => {
    const { app } = makeTestApp();
    const res = await app.request("/commission/trigger/commission/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "paused" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("commissionId");
  });

  test("returns 400 when status is missing", async () => {
    const { app } = makeTestApp();
    const res = await app.request("/commission/trigger/commission/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionId: "test-id" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("status");
  });

  test("calls updateTriggerStatus and returns result", async () => {
    const { app, calls } = makeTestApp();
    const res = await app.request("/commission/trigger/commission/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commissionId: "commission-trigger-20260321-120000",
        status: "paused",
        projectName: "test-project",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.commissionId).toBe("commission-trigger-20260321-120000");
    expect(body.status).toBe("paused");

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("updateTriggerStatus");
  });

  test("returns 409 for invalid transitions", async () => {
    const { app } = makeTestApp({
      updateTriggerStatus() {
        throw new Error('Cannot transition trigger from "completed" to "active"');
      },
    });
    const res = await app.request("/commission/trigger/commission/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commissionId: "test-id",
        status: "active",
      }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("Cannot transition");
  });

  test("returns 409 for non-triggered commission", async () => {
    const { app } = makeTestApp({
      updateTriggerStatus() {
        throw new Error('Commission "test-id" is not a triggered commission');
      },
    });
    const res = await app.request("/commission/trigger/commission/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commissionId: "test-id",
        status: "paused",
      }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("not a triggered");
  });
});
