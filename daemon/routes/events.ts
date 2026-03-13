import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { EventBus } from "@/daemon/lib/event-bus";
import type { RouteModule, SkillDefinition } from "@/lib/types";

export interface EventRoutesDeps {
  eventBus: EventBus;
}

/**
 * Creates the system-wide SSE event stream route.
 *
 * GET /system/events/stream/subscribe - Subscribes to the event bus and streams
 *     each SystemEvent as a JSON SSE message. Unsubscribes on client disconnect.
 */
export function createEventRoutes(deps: EventRoutesDeps): RouteModule {
  const routes = new Hono();

  routes.get("/system/events/stream/subscribe", (c) => {
    return streamSSE(c, async (stream) => {
      const unsubscribe = deps.eventBus.subscribe((event) => {
        // writeSSE is async but we fire-and-forget from the synchronous
        // callback. The stream buffers writes internally.
        void stream.writeSSE({ data: JSON.stringify(event) });
      });

      // When the client disconnects, the stream's abort signal fires.
      // Clean up the subscription so the event bus doesn't hold a
      // reference to a dead connection.
      stream.onAbort(() => {
        unsubscribe();
      });

      // Keep the stream open until the client disconnects.
      // Without this, Hono closes the response when the callback returns.
      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          resolve();
        });
      });
    });
  });

  const skills: SkillDefinition[] = [
    {
      skillId: "system.events.stream.subscribe",
      version: "1",
      name: "subscribe",
      description: "Subscribe to system event stream (SSE)",
      invocation: { method: "GET", path: "/system/events/stream/subscribe" },
      sideEffects: "",
      context: {},
      eligibility: { tier: "any", readOnly: true },
      idempotent: true,
      streaming: { eventTypes: ["commission_status", "meeting_status", "meeting_message"] },
      hierarchy: { root: "system", feature: "events", object: "stream" },
    },
  ];

  return { routes, skills };
}
