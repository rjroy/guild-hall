import { describe, test, expect } from "bun:test";
import { createApp } from "@/daemon/app";
import { createEventBus, type SystemEvent } from "@/daemon/services/event-bus";

function makeTestApp() {
  const eventBus = createEventBus();
  const app = createApp({
    health: {
      getMeetingCount: () => 0,
      getUptimeSeconds: () => 42,
    },
    eventBus,
  });
  return { app, eventBus };
}

/**
 * Reads SSE data lines from a response body stream.
 *
 * Collects chunks until the expected number of data lines are found,
 * then returns the parsed JSON payloads. Times out after 2 seconds
 * to avoid hanging tests.
 */
async function readSSEEvents(
  body: ReadableStream<Uint8Array>,
  expectedCount: number,
): Promise<SystemEvent[]> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const events: SystemEvent[] = [];
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
      // Keep the last incomplete block in the buffer
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        const trimmed = block.trim();
        if (!trimmed) continue;
        for (const line of trimmed.split("\n")) {
          if (line.startsWith("data:")) {
            const jsonStr = line.slice("data:".length).trim();
            if (jsonStr) {
              events.push(JSON.parse(jsonStr) as SystemEvent);
            }
          }
        }
      }
    }
  } finally {
    clearTimeout(timeout);
    reader.cancel("Done reading").catch(() => {});
  }

  return events;
}

describe("GET /events", () => {
  test("returns text/event-stream content type", async () => {
    const { app, eventBus } = makeTestApp();

    // Emit an event before the request so the stream has data to send
    // and eventually closes (the stream stays open otherwise).
    const resPromise = app.request("/events");

    // Give the stream a moment to set up, then emit and let it process
    await new Promise((resolve) => setTimeout(resolve, 10));
    eventBus.emit({ type: "meeting_ended", meetingId: "m-1" });

    const res = await resPromise;
    expect(res.headers.get("content-type")).toContain("text/event-stream");
  });

  test("streams events as JSON SSE data lines", async () => {
    const { app, eventBus } = makeTestApp();

    const resPromise = app.request("/events");

    // Emit events after a small delay to allow the stream to set up
    await new Promise((resolve) => setTimeout(resolve, 10));

    const event: SystemEvent = {
      type: "commission_status",
      commissionId: "c-1",
      status: "in_progress",
    };
    eventBus.emit(event);

    const res = await resPromise;
    const body = res.body;
    expect(body).not.toBeNull();

    const events = await readSSEEvents(body!, 1);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(event);
  });

  test("multiple events stream in order", async () => {
    const { app, eventBus } = makeTestApp();

    const resPromise = app.request("/events");

    await new Promise((resolve) => setTimeout(resolve, 10));

    const event1: SystemEvent = {
      type: "meeting_started",
      meetingId: "m-1",
      worker: "Scribe",
    };
    const event2: SystemEvent = {
      type: "commission_progress",
      commissionId: "c-1",
      summary: "Halfway done",
    };
    const event3: SystemEvent = {
      type: "meeting_ended",
      meetingId: "m-1",
    };

    eventBus.emit(event1);
    eventBus.emit(event2);
    eventBus.emit(event3);

    const res = await resPromise;
    const body = res.body;
    expect(body).not.toBeNull();

    const events = await readSSEEvents(body!, 3);
    expect(events).toHaveLength(3);
    expect(events[0]).toEqual(event1);
    expect(events[1]).toEqual(event2);
    expect(events[2]).toEqual(event3);
  });

  test("event data lines contain valid JSON", async () => {
    const { app, eventBus } = makeTestApp();

    const resPromise = app.request("/events");

    await new Promise((resolve) => setTimeout(resolve, 10));

    eventBus.emit({
      type: "commission_result",
      commissionId: "c-99",
      summary: "Done",
      artifacts: ["report.md"],
    });

    const res = await resPromise;
    const body = res.body;
    expect(body).not.toBeNull();

    const events = await readSSEEvents(body!, 1);
    expect(events[0].type).toBe("commission_result");
    if (events[0].type === "commission_result") {
      expect(events[0].commissionId).toBe("c-99");
      expect(events[0].artifacts).toEqual(["report.md"]);
    }
  });
});
