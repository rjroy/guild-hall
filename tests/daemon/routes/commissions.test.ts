import { describe, test, expect } from "bun:test";
import { createApp } from "@/daemon/app";
import type { CommissionSessionForRoutes } from "@/daemon/services/commission-session";
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
      resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number },
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
        resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number };
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
    redispatchCommission(commissionId: CommissionId) {
      calls.push({ method: "redispatchCommission", args: [commissionId] });
      return Promise.resolve({ status: "accepted" as const });
    },
    reportProgress(commissionId: CommissionId, summary: string) {
      calls.push({ method: "reportProgress", args: [commissionId, summary] });
    },
    reportResult(
      commissionId: CommissionId,
      summary: string,
      artifacts?: string[],
    ) {
      calls.push({
        method: "reportResult",
        args: [commissionId, summary, artifacts],
      });
    },
    reportQuestion(commissionId: CommissionId, question: string) {
      calls.push({
        method: "reportQuestion",
        args: [commissionId, question],
      });
    },
    addUserNote(commissionId: CommissionId, content: string) {
      calls.push({ method: "addUserNote", args: [commissionId, content] });
      return Promise.resolve();
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
  const app = createApp({
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

describe("POST /commissions", () => {
  test("creates commission and returns 201 with ID", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commissions", {
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
    const res = await app.request("/commissions", {
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

    const res = await app.request("/commissions", {
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

    await app.request("/commissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName: "my-project",
        title: "Build feature",
        workerName: "builder",
        prompt: "Build the thing",
        dependencies: ["dep-1", "dep-2"],
        resourceOverrides: { maxTurns: 50, maxBudgetUsd: 2.5 },
      }),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("createCommission");
    expect(calls[0].args[0]).toBe("my-project");
    expect(calls[0].args[1]).toBe("Build feature");
    expect(calls[0].args[2]).toBe("builder");
    expect(calls[0].args[3]).toBe("Build the thing");
    expect(calls[0].args[4]).toEqual(["dep-1", "dep-2"]);
    expect(calls[0].args[5]).toEqual({ maxTurns: 50, maxBudgetUsd: 2.5 });
  });

  test("returns 500 for internal errors", async () => {
    const { app } = makeTestApp({
      createCommission() {
        return Promise.reject(new Error('Project "unknown" not found'));
      },
    });

    const res = await app.request("/commissions", {
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

describe("PUT /commissions/:id", () => {
  test("returns 200 for valid update", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commissions/commission-test-001", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Updated prompt" }),
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

    const res = await app.request("/commissions/c-001", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "New prompt" }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('must be "pending"');
  });

  test("returns 400 for invalid JSON body", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commissions/c-001", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Invalid JSON");
  });

  test("passes commissionId and updates to session", async () => {
    const { app, calls } = makeTestApp();

    await app.request("/commissions/my-commission-42", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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

describe("POST /commissions/:id/dispatch", () => {
  test("returns 202 on success", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commissions/c-001/dispatch", {
      method: "POST",
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

    const res = await app.request("/commissions/c-001/dispatch", {
      method: "POST",
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('must be "pending"');
  });

  test("passes correct commissionId to session", async () => {
    const { app, calls } = makeTestApp();

    await app.request("/commissions/specific-commission-99/dispatch", {
      method: "POST",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("dispatchCommission");
    expect(calls[0].args[0]).toBe("specific-commission-99");
  });
});

describe("DELETE /commissions/:id", () => {
  test("returns 200 on success", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commissions/c-001", {
      method: "DELETE",
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

    const res = await app.request("/commissions/unknown", {
      method: "DELETE",
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

    const res = await app.request("/commissions/c-completed", {
      method: "DELETE",
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Invalid commission transition");
  });

  test("passes correct commissionId to session", async () => {
    const { app, calls } = makeTestApp();

    await app.request("/commissions/cancel-me-123", {
      method: "DELETE",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("cancelCommission");
    expect(calls[0].args[0]).toBe("cancel-me-123");
  });
});

describe("POST /commissions/:id/redispatch", () => {
  test("returns 202 on success", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commissions/c-001/redispatch", {
      method: "POST",
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

    const res = await app.request("/commissions/c-001/redispatch", {
      method: "POST",
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('must be "failed" or "cancelled"');
  });

  test("passes correct commissionId to session", async () => {
    const { app, calls } = makeTestApp();

    await app.request("/commissions/redispatch-me-77/redispatch", {
      method: "POST",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("redispatchCommission");
    expect(calls[0].args[0]).toBe("redispatch-me-77");
  });
});

describe("POST /commissions/:id/progress", () => {
  test("returns 200", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commissions/c-001/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary: "50% complete" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  test("returns 400 when summary is missing", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commissions/c-001/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Missing required field: summary");
  });

  test("passes commissionId and summary to session", async () => {
    const { app, calls } = makeTestApp();

    await app.request("/commissions/progress-me-42/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary: "Running tests" }),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("reportProgress");
    expect(calls[0].args[0]).toBe("progress-me-42");
    expect(calls[0].args[1]).toBe("Running tests");
  });
});

describe("POST /commissions/:id/result", () => {
  test("returns 200", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commissions/c-001/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: "All tests pass",
        artifacts: ["path/to/file.ts"],
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  test("returns 400 when summary is missing", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commissions/c-001/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artifacts: ["file.ts"] }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Missing required field: summary");
  });

  test("passes commissionId, summary, and artifacts to session", async () => {
    const { app, calls } = makeTestApp();

    await app.request("/commissions/result-me-42/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: "Done building",
        artifacts: ["a.ts", "b.ts"],
      }),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("reportResult");
    expect(calls[0].args[0]).toBe("result-me-42");
    expect(calls[0].args[1]).toBe("Done building");
    expect(calls[0].args[2]).toEqual(["a.ts", "b.ts"]);
  });
});

describe("POST /commissions/:id/question", () => {
  test("returns 200", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commissions/c-001/question", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "Which auth strategy?" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  test("returns 400 when question is missing", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commissions/c-001/question", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Missing required field: question");
  });

  test("passes commissionId and question to session", async () => {
    const { app, calls } = makeTestApp();

    await app.request("/commissions/question-me-42/question", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "Should I use Redis?" }),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("reportQuestion");
    expect(calls[0].args[0]).toBe("question-me-42");
    expect(calls[0].args[1]).toBe("Should I use Redis?");
  });
});

describe("POST /commissions/:id/note", () => {
  test("returns 200", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commissions/c-001/note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Please prioritize tests" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  test("returns 400 when content is missing", async () => {
    const { app } = makeTestApp();

    const res = await app.request("/commissions/c-001/note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Missing required field: content");
  });

  test("passes commissionId and content to session", async () => {
    const { app, calls } = makeTestApp();

    await app.request("/commissions/note-me-42/note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Use the existing auth module" }),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("addUserNote");
    expect(calls[0].args[0]).toBe("note-me-42");
    expect(calls[0].args[1]).toBe("Use the existing auth module");
  });
});
