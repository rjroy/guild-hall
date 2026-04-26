import { describe, test, expect } from "bun:test";
import { createApp } from "@/apps/daemon/app";
import type { CommissionSessionForRoutes } from "@/apps/daemon/services/commission/orchestrator";
import type { CommissionId } from "@/apps/daemon/types";

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
      options?: { source?: { description: string } },
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

