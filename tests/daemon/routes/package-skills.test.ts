import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import { z } from "zod";
import {
  createPackageSkillRoutes,
  type PackageSkillRouteDeps,
} from "@/daemon/routes/package-skills";
import type { SkillDefinition } from "@/lib/types";
import type {
  PackageSkill,
  SkillHandlerContext,
  SkillHandlerResult,
} from "@/daemon/services/skill-types";
import { SkillHandlerError } from "@/daemon/services/skill-types";

// -- Test helpers --

function makeDeps(overrides: Partial<PackageSkillRouteDeps> = {}): PackageSkillRouteDeps {
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

function makeSkillDefinition(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    skillId: "test.feature.operation",
    version: "1",
    name: "operation",
    description: "A test operation",
    invocation: { method: "POST", path: "/test/feature/operation" },
    sideEffects: "",
    context: {},
    eligibility: { tier: "any", readOnly: false },
    idempotent: false,
    hierarchy: { root: "test", feature: "feature" },
    ...overrides,
  };
}

function makePackageSkill(
  definition: SkillDefinition,
  handler: PackageSkill["handler"],
  streamHandler?: PackageSkill["streamHandler"],
): PackageSkill {
  return { definition, handler, streamHandler };
}

function mountRoutes(skills: PackageSkill[], deps: PackageSkillRouteDeps): Hono {
  const mod = createPackageSkillRoutes(skills, deps);
  const app = new Hono();
  app.route("/", mod.routes);
  return app;
}

// -- Tests --

describe("createPackageSkillRoutes", () => {
  describe("route generation", () => {
    test("registers GET route at the correct path", async () => {
      const def = makeSkillDefinition({
        invocation: { method: "GET", path: "/test/items/list" },
      });
      const handler = (): Promise<SkillHandlerResult> => Promise.resolve({
        data: { items: [] },
      });
      const app = mountRoutes([makePackageSkill(def, handler)], makeDeps());

      const res = await app.request("/test/items/list");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ items: [] });
    });

    test("registers POST route at the correct path", async () => {
      const def = makeSkillDefinition({
        invocation: { method: "POST", path: "/test/items/create" },
      });
      const handler = (): Promise<SkillHandlerResult> => Promise.resolve({
        data: { created: true },
        status: 201,
      });
      const app = mountRoutes([makePackageSkill(def, handler)], makeDeps());

      const res = await app.request("/test/items/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toEqual({ created: true });
    });

    test("returns RouteModule with skills array", () => {
      const def = makeSkillDefinition();
      const handler = (): Promise<SkillHandlerResult> => Promise.resolve({ data: {} });
      const mod = createPackageSkillRoutes(
        [makePackageSkill(def, handler)],
        makeDeps(),
      );

      expect(mod.skills).toHaveLength(1);
      expect(mod.skills[0].skillId).toBe("test.feature.operation");
    });

    test("handles multiple skills", () => {
      const def1 = makeSkillDefinition({
        skillId: "test.a.op1",
        invocation: { method: "GET", path: "/test/a/op1" },
      });
      const def2 = makeSkillDefinition({
        skillId: "test.a.op2",
        invocation: { method: "POST", path: "/test/a/op2" },
      });
      const handler = (): Promise<SkillHandlerResult> => Promise.resolve({ data: {} });
      const mod = createPackageSkillRoutes(
        [makePackageSkill(def1, handler), makePackageSkill(def2, handler)],
        makeDeps(),
      );

      expect(mod.skills).toHaveLength(2);
    });
  });

  describe("parameter extraction", () => {
    test("GET extracts query params", async () => {
      let receivedCtx: SkillHandlerContext | undefined;
      const def = makeSkillDefinition({
        invocation: { method: "GET", path: "/test/read" },
      });
      const handler = (ctx: SkillHandlerContext): Promise<SkillHandlerResult> => {
        receivedCtx = ctx;
        return Promise.resolve({ data: { ok: true } });
      };
      const app = mountRoutes([makePackageSkill(def, handler)], makeDeps());

      await app.request("/test/read?foo=bar&count=42");

      expect(receivedCtx).toBeDefined();
      expect(receivedCtx!.params.foo).toBe("bar");
      expect(receivedCtx!.params.count).toBe("42");
    });

    test("POST extracts body params", async () => {
      let receivedCtx: SkillHandlerContext | undefined;
      const def = makeSkillDefinition({
        invocation: { method: "POST", path: "/test/write" },
      });
      const handler = (ctx: SkillHandlerContext): Promise<SkillHandlerResult> => {
        receivedCtx = ctx;
        return Promise.resolve({ data: { ok: true } });
      };
      const app = mountRoutes([makePackageSkill(def, handler)], makeDeps());

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
      const def = makeSkillDefinition({
        invocation: { method: "POST", path: "/test/validated" },
        requestSchema: schema,
      });
      const handler = (): Promise<SkillHandlerResult> => Promise.resolve({ data: {} });
      const app = mountRoutes([makePackageSkill(def, handler)], makeDeps());

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
      let receivedCtx: SkillHandlerContext | undefined;
      const schema = z.object({
        name: z.string(),
        count: z.number(),
      });
      const def = makeSkillDefinition({
        invocation: { method: "POST", path: "/test/validated" },
        requestSchema: schema,
      });
      const handler = (ctx: SkillHandlerContext): Promise<SkillHandlerResult> => {
        receivedCtx = ctx;
        return Promise.resolve({ data: { ok: true } });
      };
      const app = mountRoutes([makePackageSkill(def, handler)], makeDeps());

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
      const def = makeSkillDefinition({
        context: { project: true },
        invocation: { method: "POST", path: "/test/ctx" },
      });
      const handler = (): Promise<SkillHandlerResult> => Promise.resolve({ data: {} });
      const app = mountRoutes([makePackageSkill(def, handler)], makeDeps());

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
      const def = makeSkillDefinition({
        context: { project: true },
        invocation: { method: "POST", path: "/test/ctx" },
      });
      const handler = (): Promise<SkillHandlerResult> => Promise.resolve({ data: {} });
      const app = mountRoutes([makePackageSkill(def, handler)], makeDeps());

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
      let receivedCtx: SkillHandlerContext | undefined;
      const def = makeSkillDefinition({
        context: { project: true },
        invocation: { method: "POST", path: "/test/ctx" },
      });
      const handler = (ctx: SkillHandlerContext): Promise<SkillHandlerResult> => {
        receivedCtx = ctx;
        return Promise.resolve({ data: {} });
      };
      const app = mountRoutes([makePackageSkill(def, handler)], makeDeps());

      await app.request("/test/ctx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName: "test-project" }),
      });

      expect(receivedCtx).toBeDefined();
      expect(receivedCtx!.projectName).toBe("test-project");
    });

    test("missing required commissionId returns 400", async () => {
      const def = makeSkillDefinition({
        context: { commissionId: true },
        invocation: { method: "POST", path: "/test/ctx" },
      });
      const handler = (): Promise<SkillHandlerResult> => Promise.resolve({ data: {} });
      const app = mountRoutes([makePackageSkill(def, handler)], makeDeps());

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
      const def = makeSkillDefinition({
        context: { commissionId: true },
        invocation: { method: "POST", path: "/test/ctx" },
      });
      const handler = (): Promise<SkillHandlerResult> => Promise.resolve({ data: {} });
      const deps = makeDeps({
        getCommissionStatus: () => Promise.resolve(undefined),
      });
      const app = mountRoutes([makePackageSkill(def, handler)], deps);

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
      const def = makeSkillDefinition({
        context: { commissionId: true },
        invocation: { method: "POST", path: "/test/ctx" },
      });
      const handler = (): Promise<SkillHandlerResult> => Promise.resolve({ data: {} });
      const deps = makeDeps({
        getCommissionStatus: () => Promise.resolve("completed"),
      });
      const app = mountRoutes([makePackageSkill(def, handler)], deps);

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
      let receivedCtx: SkillHandlerContext | undefined;
      const def = makeSkillDefinition({
        context: { commissionId: true },
        invocation: { method: "POST", path: "/test/ctx" },
      });
      const handler = (ctx: SkillHandlerContext): Promise<SkillHandlerResult> => {
        receivedCtx = ctx;
        return Promise.resolve({ data: {} });
      };
      const deps = makeDeps({
        getCommissionStatus: () => Promise.resolve("in_progress"),
      });
      const app = mountRoutes([makePackageSkill(def, handler)], deps);

      await app.request("/test/ctx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commissionId: "commission-active-123" }),
      });

      expect(receivedCtx).toBeDefined();
      expect(receivedCtx!.commissionId).toBe("commission-active-123");
    });

    test("missing required meetingId returns 400", async () => {
      const def = makeSkillDefinition({
        context: { meetingId: true },
        invocation: { method: "POST", path: "/test/ctx" },
      });
      const handler = (): Promise<SkillHandlerResult> => Promise.resolve({ data: {} });
      const app = mountRoutes([makePackageSkill(def, handler)], makeDeps());

      const res = await app.request("/test/ctx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    test("non-existent meeting returns 404", async () => {
      const def = makeSkillDefinition({
        context: { meetingId: true },
        invocation: { method: "POST", path: "/test/ctx" },
      });
      const handler = (): Promise<SkillHandlerResult> => Promise.resolve({ data: {} });
      const deps = makeDeps({
        getMeetingStatus: () => Promise.resolve(undefined),
      });
      const app = mountRoutes([makePackageSkill(def, handler)], deps);

      const res = await app.request("/test/ctx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId: "meeting-missing-123" }),
      });

      expect(res.status).toBe(404);
    });

    test("outcome state meeting returns 409", async () => {
      const def = makeSkillDefinition({
        context: { meetingId: true },
        invocation: { method: "POST", path: "/test/ctx" },
      });
      const handler = (): Promise<SkillHandlerResult> => Promise.resolve({ data: {} });
      const deps = makeDeps({
        getMeetingStatus: () => Promise.resolve("closed"),
      });
      const app = mountRoutes([makePackageSkill(def, handler)], deps);

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
        const def = makeSkillDefinition({
          skillId: `test.outcome.${state}`,
          context: { commissionId: true },
          invocation: { method: "POST", path: `/test/outcome/${state}` },
        });
        const handler = (): Promise<SkillHandlerResult> => Promise.resolve({ data: {} });
        const deps = makeDeps({
          getCommissionStatus: () => Promise.resolve(state),
        });
        const app = mountRoutes([makePackageSkill(def, handler)], deps);

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
        const def = makeSkillDefinition({
          skillId: `test.meeting.${state}`,
          context: { meetingId: true },
          invocation: { method: "POST", path: `/test/meeting/${state}` },
        });
        const handler = (): Promise<SkillHandlerResult> => Promise.resolve({ data: {} });
        const deps = makeDeps({
          getMeetingStatus: () => Promise.resolve(state),
        });
        const app = mountRoutes([makePackageSkill(def, handler)], deps);

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
    test("handler receives correct SkillHandlerContext with resolved context", async () => {
      let receivedCtx: SkillHandlerContext | undefined;
      const def = makeSkillDefinition({
        context: { project: true },
        invocation: { method: "POST", path: "/test/full" },
      });
      const handler = (ctx: SkillHandlerContext): Promise<SkillHandlerResult> => {
        receivedCtx = ctx;
        return Promise.resolve({ data: { received: true } });
      };
      const app = mountRoutes([makePackageSkill(def, handler)], makeDeps());

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
      const def = makeSkillDefinition();
      const handler = (): Promise<SkillHandlerResult> => Promise.resolve({
        data: { ok: true },
      });
      const app = mountRoutes([makePackageSkill(def, handler)], makeDeps());

      const res = await app.request("/test/feature/operation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
    });

    test("handler result uses custom status code", async () => {
      const def = makeSkillDefinition();
      const handler = (): Promise<SkillHandlerResult> => Promise.resolve({
        data: { created: true },
        status: 201,
      });
      const app = mountRoutes([makePackageSkill(def, handler)], makeDeps());

      const res = await app.request("/test/feature/operation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(201);
    });
  });

  describe("error handling", () => {
    test("SkillHandlerError returns specified status code", async () => {
      const def = makeSkillDefinition();
      const handler = (): Promise<SkillHandlerResult> => {
        return Promise.reject(new SkillHandlerError("Not allowed", 403));
      };
      const app = mountRoutes([makePackageSkill(def, handler)], makeDeps());

      const res = await app.request("/test/feature/operation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Not allowed");
    });

    test("non-SkillHandlerError propagates as 500", async () => {
      const def = makeSkillDefinition();
      const handler = (): Promise<SkillHandlerResult> => {
        return Promise.reject(new Error("Unexpected crash"));
      };

      const mod = createPackageSkillRoutes(
        [makePackageSkill(def, handler)],
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
      const def = makeSkillDefinition({
        streaming: { eventTypes: ["progress", "done"] },
        invocation: { method: "POST", path: "/test/stream" },
      });
      const streamHandler: PackageSkill["streamHandler"] = (_ctx, emit) => {
        emit("progress", { step: 1 });
        emit("progress", { step: 2 });
        emit("done", { result: "complete" });
        return Promise.resolve();
      };
      const app = mountRoutes(
        [makePackageSkill(def, undefined, streamHandler)],
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
      const def = makeSkillDefinition({
        streaming: { eventTypes: ["data"] },
        invocation: { method: "POST", path: "/test/stream-error" },
      });
      const streamHandler: PackageSkill["streamHandler"] = () => {
        return Promise.reject(new SkillHandlerError("Stream failed", 422));
      };
      const app = mountRoutes(
        [makePackageSkill(def, undefined, streamHandler)],
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
      const def = makeSkillDefinition();
      const app = mountRoutes(
        [{ definition: def } as PackageSkill],
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
