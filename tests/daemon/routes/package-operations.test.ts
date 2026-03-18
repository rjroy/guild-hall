import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import { z } from "zod";
import {
  createPackageOperationRoutes,
  type PackageOperationRouteDeps,
} from "@/daemon/routes/package-operations";
import type { OperationDefinition } from "@/lib/types";
import type {
  PackageOperation,
  OperationHandlerContext,
  OperationHandlerResult,
} from "@/daemon/services/operation-types";
import { OperationHandlerError } from "@/daemon/services/operation-types";

// -- Test helpers --

function makeDeps(overrides: Partial<PackageOperationRouteDeps> = {}): PackageOperationRouteDeps {
  return {
    config: {
      projects: [
        { name: "test-project", path: "/tmp/test-project" },
        { name: "other-project", path: "/tmp/other-project" },
      ],
    },
    guildHallHome: "/tmp/guild-hall",
    getCommissionStatus: () => Promise.resolve(undefined),
    getMeetingStatus: () => Promise.resolve(undefined),
    ...overrides,
  };
}

function makeOperationDefinition(overrides: Partial<OperationDefinition> = {}): OperationDefinition {
  return {
    operationId: "test.feature.operation",
    version: "1",
    name: "operation",
    description: "A test operation",
    invocation: { method: "POST", path: "/test/feature/operation" },
    sideEffects: "",
    context: {},
    idempotent: false,
    hierarchy: { root: "test", feature: "feature" },
    ...overrides,
  };
}

function makePackageOperation(
  definition: OperationDefinition,
  handler: PackageOperation["handler"],
  streamHandler?: PackageOperation["streamHandler"],
): PackageOperation {
  return { definition, handler, streamHandler };
}

function mountRoutes(skills: PackageOperation[], deps: PackageOperationRouteDeps): Hono {
  const mod = createPackageOperationRoutes(skills, deps);
  const app = new Hono();
  app.route("/", mod.routes);
  return app;
}

// -- Tests --

describe("createPackageOperationRoutes", () => {
  describe("route generation", () => {
    test("registers GET route at the correct path", async () => {
      const def = makeOperationDefinition({
        invocation: { method: "GET", path: "/test/items/list" },
      });
      const handler = (): Promise<OperationHandlerResult> => Promise.resolve({
        data: { items: [] },
      });
      const app = mountRoutes([makePackageOperation(def, handler)], makeDeps());

      const res = await app.request("/test/items/list");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ items: [] });
    });

    test("registers POST route at the correct path", async () => {
      const def = makeOperationDefinition({
        invocation: { method: "POST", path: "/test/items/create" },
      });
      const handler = (): Promise<OperationHandlerResult> => Promise.resolve({
        data: { created: true },
        status: 201,
      });
      const app = mountRoutes([makePackageOperation(def, handler)], makeDeps());

      const res = await app.request("/test/items/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toEqual({ created: true });
    });

    test("returns RouteModule with operations array", () => {
      const def = makeOperationDefinition();
      const handler = (): Promise<OperationHandlerResult> => Promise.resolve({ data: {} });
      const mod = createPackageOperationRoutes(
        [makePackageOperation(def, handler)],
        makeDeps(),
      );

      expect(mod.operations).toHaveLength(1);
      expect(mod.operations[0].operationId).toBe("test.feature.operation");
    });

    test("handles multiple operations", () => {
      const def1 = makeOperationDefinition({
        operationId: "test.a.op1",
        invocation: { method: "GET", path: "/test/a/op1" },
      });
      const def2 = makeOperationDefinition({
        operationId: "test.a.op2",
        invocation: { method: "POST", path: "/test/a/op2" },
      });
      const handler = (): Promise<OperationHandlerResult> => Promise.resolve({ data: {} });
      const mod = createPackageOperationRoutes(
        [makePackageOperation(def1, handler), makePackageOperation(def2, handler)],
        makeDeps(),
      );

      expect(mod.operations).toHaveLength(2);
    });
  });

  describe("parameter extraction", () => {
    test("GET extracts query params", async () => {
      let receivedCtx: OperationHandlerContext | undefined;
      const def = makeOperationDefinition({
        invocation: { method: "GET", path: "/test/read" },
      });
      const handler = (ctx: OperationHandlerContext): Promise<OperationHandlerResult> => {
        receivedCtx = ctx;
        return Promise.resolve({ data: { ok: true } });
      };
      const app = mountRoutes([makePackageOperation(def, handler)], makeDeps());

      await app.request("/test/read?foo=bar&count=42");

      expect(receivedCtx).toBeDefined();
      expect(receivedCtx!.params.foo).toBe("bar");
      expect(receivedCtx!.params.count).toBe("42");
    });

    test("POST extracts body params", async () => {
      let receivedCtx: OperationHandlerContext | undefined;
      const def = makeOperationDefinition({
        invocation: { method: "POST", path: "/test/write" },
      });
      const handler = (ctx: OperationHandlerContext): Promise<OperationHandlerResult> => {
        receivedCtx = ctx;
        return Promise.resolve({ data: { ok: true } });
      };
      const app = mountRoutes([makePackageOperation(def, handler)], makeDeps());

      await app.request("/test/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "hello", value: 123 }),
      });

      expect(receivedCtx).toBeDefined();
      expect(receivedCtx!.params.name).toBe("hello");
      expect(receivedCtx!.params.value).toBe(123);
    });
  });

  describe("Zod schema validation", () => {
    test("rejects invalid params when schema is present", async () => {
      const schema = z.object({
        name: z.string(),
        count: z.number(),
      });
      const def = makeOperationDefinition({
        invocation: { method: "POST", path: "/test/validated" },
        requestSchema: schema,
      });
      const handler = (): Promise<OperationHandlerResult> => Promise.resolve({ data: {} });
      const app = mountRoutes([makePackageOperation(def, handler)], makeDeps());

      const res = await app.request("/test/validated", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: 123, count: "not a number" }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Validation error");
    });

    test("passes valid params through schema", async () => {
      let receivedCtx: OperationHandlerContext | undefined;
      const schema = z.object({
        name: z.string(),
        count: z.number(),
      });
      const def = makeOperationDefinition({
        invocation: { method: "POST", path: "/test/validated" },
        requestSchema: schema,
      });
      const handler = (ctx: OperationHandlerContext): Promise<OperationHandlerResult> => {
        receivedCtx = ctx;
        return Promise.resolve({ data: { ok: true } });
      };
      const app = mountRoutes([makePackageOperation(def, handler)], makeDeps());

      await app.request("/test/validated", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "hello", count: 5 }),
      });

      expect(receivedCtx).toBeDefined();
      expect(receivedCtx!.params.name).toBe("hello");
      expect(receivedCtx!.params.count).toBe(5);
    });
  });

  describe("context validation", () => {
    test("missing required project returns 400", async () => {
      const def = makeOperationDefinition({
        context: { project: true },
        invocation: { method: "POST", path: "/test/ctx" },
      });
      const handler = (): Promise<OperationHandlerResult> => Promise.resolve({ data: {} });
      const app = mountRoutes([makePackageOperation(def, handler)], makeDeps());

      const res = await app.request("/test/ctx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("projectName");
    });

    test("non-existent project returns 404", async () => {
      const def = makeOperationDefinition({
        context: { project: true },
        invocation: { method: "POST", path: "/test/ctx" },
      });
      const handler = (): Promise<OperationHandlerResult> => Promise.resolve({ data: {} });
      const app = mountRoutes([makePackageOperation(def, handler)], makeDeps());

      const res = await app.request("/test/ctx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName: "nonexistent" }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain("not found");
    });

    test("valid project passes context validation", async () => {
      let receivedCtx: OperationHandlerContext | undefined;
      const def = makeOperationDefinition({
        context: { project: true },
        invocation: { method: "POST", path: "/test/ctx" },
      });
      const handler = (ctx: OperationHandlerContext): Promise<OperationHandlerResult> => {
        receivedCtx = ctx;
        return Promise.resolve({ data: {} });
      };
      const app = mountRoutes([makePackageOperation(def, handler)], makeDeps());

      await app.request("/test/ctx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName: "test-project" }),
      });

      expect(receivedCtx).toBeDefined();
      expect(receivedCtx!.projectName).toBe("test-project");
    });

    test("missing required commissionId returns 400", async () => {
      const def = makeOperationDefinition({
        context: { commissionId: true },
        invocation: { method: "POST", path: "/test/ctx" },
      });
      const handler = (): Promise<OperationHandlerResult> => Promise.resolve({ data: {} });
      const app = mountRoutes([makePackageOperation(def, handler)], makeDeps());

      const res = await app.request("/test/ctx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("commissionId");
    });

    test("non-existent commission returns 404", async () => {
      const def = makeOperationDefinition({
        context: { commissionId: true },
        invocation: { method: "POST", path: "/test/ctx" },
      });
      const handler = (): Promise<OperationHandlerResult> => Promise.resolve({ data: {} });
      const deps = makeDeps({
        getCommissionStatus: () => Promise.resolve(undefined),
      });
      const app = mountRoutes([makePackageOperation(def, handler)], deps);

      const res = await app.request("/test/ctx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commissionId: "commission-missing-123" }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain("not found");
    });

    test("outcome state commission returns 409", async () => {
      const def = makeOperationDefinition({
        context: { commissionId: true },
        invocation: { method: "POST", path: "/test/ctx" },
      });
      const handler = (): Promise<OperationHandlerResult> => Promise.resolve({ data: {} });
      const deps = makeDeps({
        getCommissionStatus: () => Promise.resolve("completed"),
      });
      const app = mountRoutes([makePackageOperation(def, handler)], deps);

      const res = await app.request("/test/ctx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commissionId: "commission-done-123" }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain("outcome state");
    });

    test("non-outcome-state commission passes validation", async () => {
      let receivedCtx: OperationHandlerContext | undefined;
      const def = makeOperationDefinition({
        context: { commissionId: true },
        invocation: { method: "POST", path: "/test/ctx" },
      });
      const handler = (ctx: OperationHandlerContext): Promise<OperationHandlerResult> => {
        receivedCtx = ctx;
        return Promise.resolve({ data: {} });
      };
      const deps = makeDeps({
        getCommissionStatus: () => Promise.resolve("in_progress"),
      });
      const app = mountRoutes([makePackageOperation(def, handler)], deps);

      await app.request("/test/ctx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commissionId: "commission-active-123" }),
      });

      expect(receivedCtx).toBeDefined();
      expect(receivedCtx!.commissionId).toBe("commission-active-123");
    });

    test("missing required meetingId returns 400", async () => {
      const def = makeOperationDefinition({
        context: { meetingId: true },
        invocation: { method: "POST", path: "/test/ctx" },
      });
      const handler = (): Promise<OperationHandlerResult> => Promise.resolve({ data: {} });
      const app = mountRoutes([makePackageOperation(def, handler)], makeDeps());

      const res = await app.request("/test/ctx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    test("non-existent meeting returns 404", async () => {
      const def = makeOperationDefinition({
        context: { meetingId: true },
        invocation: { method: "POST", path: "/test/ctx" },
      });
      const handler = (): Promise<OperationHandlerResult> => Promise.resolve({ data: {} });
      const deps = makeDeps({
        getMeetingStatus: () => Promise.resolve(undefined),
      });
      const app = mountRoutes([makePackageOperation(def, handler)], deps);

      const res = await app.request("/test/ctx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId: "meeting-missing-123" }),
      });

      expect(res.status).toBe(404);
    });

    test("outcome state meeting returns 409", async () => {
      const def = makeOperationDefinition({
        context: { meetingId: true },
        invocation: { method: "POST", path: "/test/ctx" },
      });
      const handler = (): Promise<OperationHandlerResult> => Promise.resolve({ data: {} });
      const deps = makeDeps({
        getMeetingStatus: () => Promise.resolve("closed"),
      });
      const app = mountRoutes([makePackageOperation(def, handler)], deps);

      const res = await app.request("/test/ctx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId: "meeting-closed-123" }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain("outcome state");
    });

    test("all outcome commission states are rejected", async () => {
      const outcomeStates = ["completed", "failed", "cancelled", "abandoned"];

      for (const state of outcomeStates) {
        const def = makeOperationDefinition({
          operationId: `test.outcome.${state}`,
          context: { commissionId: true },
          invocation: { method: "POST", path: `/test/outcome/${state}` },
        });
        const handler = (): Promise<OperationHandlerResult> => Promise.resolve({ data: {} });
        const deps = makeDeps({
          getCommissionStatus: () => Promise.resolve(state),
        });
        const app = mountRoutes([makePackageOperation(def, handler)], deps);

        const res = await app.request(`/test/outcome/${state}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commissionId: "commission-123" }),
        });

        expect(res.status).toBe(409);
      }
    });

    test("both outcome meeting states are rejected", async () => {
      const outcomeStates = ["closed", "declined"];

      for (const state of outcomeStates) {
        const def = makeOperationDefinition({
          operationId: `test.meeting.${state}`,
          context: { meetingId: true },
          invocation: { method: "POST", path: `/test/meeting/${state}` },
        });
        const handler = (): Promise<OperationHandlerResult> => Promise.resolve({ data: {} });
        const deps = makeDeps({
          getMeetingStatus: () => Promise.resolve(state),
        });
        const app = mountRoutes([makePackageOperation(def, handler)], deps);

        const res = await app.request(`/test/meeting/${state}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meetingId: "meeting-123" }),
        });

        expect(res.status).toBe(409);
      }
    });
  });

  describe("handler invocation", () => {
    test("handler receives correct OperationHandlerContext with resolved context", async () => {
      let receivedCtx: OperationHandlerContext | undefined;
      const def = makeOperationDefinition({
        context: { project: true },
        invocation: { method: "POST", path: "/test/full" },
      });
      const handler = (ctx: OperationHandlerContext): Promise<OperationHandlerResult> => {
        receivedCtx = ctx;
        return Promise.resolve({ data: { received: true } });
      };
      const app = mountRoutes([makePackageOperation(def, handler)], makeDeps());

      await app.request("/test/full", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName: "test-project", extra: "data" }),
      });

      expect(receivedCtx).toBeDefined();
      expect(receivedCtx!.projectName).toBe("test-project");
      expect(receivedCtx!.params.projectName).toBe("test-project");
      expect(receivedCtx!.params.extra).toBe("data");
    });

    test("handler result status defaults to 200", async () => {
      const def = makeOperationDefinition();
      const handler = (): Promise<OperationHandlerResult> => Promise.resolve({
        data: { ok: true },
      });
      const app = mountRoutes([makePackageOperation(def, handler)], makeDeps());

      const res = await app.request("/test/feature/operation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
    });

    test("handler result uses custom status code", async () => {
      const def = makeOperationDefinition();
      const handler = (): Promise<OperationHandlerResult> => Promise.resolve({
        data: { created: true },
        status: 201,
      });
      const app = mountRoutes([makePackageOperation(def, handler)], makeDeps());

      const res = await app.request("/test/feature/operation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(201);
    });
  });

  describe("error handling", () => {
    test("OperationHandlerError returns specified status code", async () => {
      const def = makeOperationDefinition();
      const handler = (): Promise<OperationHandlerResult> => {
        return Promise.reject(new OperationHandlerError("Not allowed", 403));
      };
      const app = mountRoutes([makePackageOperation(def, handler)], makeDeps());

      const res = await app.request("/test/feature/operation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Not allowed");
    });

    test("non-OperationHandlerError propagates as 500", async () => {
      const def = makeOperationDefinition();
      const handler = (): Promise<OperationHandlerResult> => {
        return Promise.reject(new Error("Unexpected crash"));
      };

      const mod = createPackageOperationRoutes(
        [makePackageOperation(def, handler)],
        makeDeps(),
      );
      const app = new Hono();
      // Add a Hono error handler so the error doesn't bubble out of the test
      app.onError((err, c) => {
        return c.json({ error: err.message }, 500);
      });
      app.route("/", mod.routes);

      const res = await app.request("/test/feature/operation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Unexpected crash");
    });
  });

  describe("streaming", () => {
    /**
     * Reads SSE events from a response body stream.
     * Returns parsed event/data pairs. Times out after 2 seconds.
     */
    async function readSSEStream(
      body: ReadableStream<Uint8Array>,
      expectedCount: number,
    ): Promise<Array<{ event: string; data: unknown }>> {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      const events: Array<{ event: string; data: unknown }> = [];
      let buffer = "";

      const timeout = setTimeout(() => {
        reader.cancel("Test timeout").catch(() => {});
      }, 2000);

      try {
        while (events.length < expectedCount) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse complete SSE messages (terminated by double newline)
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() ?? "";

          for (const block of blocks) {
            const trimmed = block.trim();
            if (!trimmed) continue;
            let eventName = "";
            let dataStr = "";
            for (const line of trimmed.split("\n")) {
              if (line.startsWith("event:")) {
                eventName = line.slice("event:".length).trim();
              } else if (line.startsWith("data:")) {
                dataStr = line.slice("data:".length).trim();
              }
            }
            if (eventName || dataStr) {
              events.push({
                event: eventName,
                data: dataStr ? JSON.parse(dataStr) : undefined,
              });
            }
          }
        }
      } finally {
        clearTimeout(timeout);
        reader.cancel("Done reading").catch(() => {});
      }

      return events;
    }

    test("streamHandler receives emitter and events are written to SSE", async () => {
      const def = makeOperationDefinition({
        streaming: { eventTypes: ["progress", "done"] },
        invocation: { method: "POST", path: "/test/stream" },
      });
      const streamHandler: PackageOperation["streamHandler"] = (_ctx, emit) => {
        emit("progress", { step: 1 });
        emit("progress", { step: 2 });
        emit("done", { result: "complete" });
        return Promise.resolve();
      };
      const app = mountRoutes(
        [makePackageOperation(def, undefined, streamHandler)],
        makeDeps(),
      );

      const res = await app.request("/test/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      expect(res.body).not.toBeNull();

      const events = await readSSEStream(res.body!, 3);
      expect(events).toHaveLength(3);
      expect(events[0].event).toBe("progress");
      expect(events[0].data).toEqual({ step: 1 });
      expect(events[1].event).toBe("progress");
      expect(events[1].data).toEqual({ step: 2 });
      expect(events[2].event).toBe("done");
      expect(events[2].data).toEqual({ result: "complete" });
    });

    test("streamHandler error emits error event", async () => {
      const def = makeOperationDefinition({
        streaming: { eventTypes: ["data"] },
        invocation: { method: "POST", path: "/test/stream-error" },
      });
      const streamHandler: PackageOperation["streamHandler"] = () => {
        return Promise.reject(new OperationHandlerError("Stream failed", 422));
      };
      const app = mountRoutes(
        [makePackageOperation(def, undefined, streamHandler)],
        makeDeps(),
      );

      const res = await app.request("/test/stream-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200); // SSE connection itself succeeds
      expect(res.body).not.toBeNull();

      const events = await readSSEStream(res.body!, 1);
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe("error");
      expect((events[0].data as { error: string }).error).toBe("Stream failed");
    });
  });

  describe("no handler configured", () => {
    test("returns 500 when neither handler nor streamHandler is set", async () => {
      const def = makeOperationDefinition();
      const app = mountRoutes(
        [{ definition: def } as PackageOperation],
        makeDeps(),
      );

      const res = await app.request("/test/feature/operation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("No handler configured");
    });
  });
});
