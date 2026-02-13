import { describe, expect, it } from "bun:test";

import { createEventBus } from "@/lib/agent";
import type { EventBus } from "@/lib/agent";
import { formatSSE } from "@/lib/sse";
import type { SSEEvent } from "@/lib/types";

// -- Helpers --

/**
 * Simulates the SSE route's "no query running" path: sends a single
 * status_change event with the current session status, then closes.
 */
function simulateNoQueryRunning(
  sessionStatus: string,
): { chunks: string[]; closed: boolean } {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let closed = false;

  // Simulate the ReadableStream controller
  const controller = {
    enqueue(data: Uint8Array) {
      chunks.push(decoder.decode(data));
    },
    close() {
      closed = true;
    },
  };

  // This mirrors the route's logic when !agentManager.isQueryRunning(sessionId)
  const statusEvent = formatSSE({
    type: "status_change",
    status: sessionStatus,
  } as SSEEvent);
  controller.enqueue(encoder.encode(statusEvent));
  controller.close();

  return { chunks, closed };
}

/**
 * Simulates the SSE route's "query running" path: subscribes to the event bus,
 * forwards events to the stream, and closes on "done".
 */
type StreamState = {
  chunks: string[];
  closed: boolean;
  unsubscribed: boolean;
};

function simulateQueryRunning(
  eventBus: EventBus,
  sessionId: string,
): StreamState {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const state: StreamState = {
    chunks: [],
    closed: false,
    unsubscribed: false,
  };

  const controller = {
    enqueue(data: Uint8Array) {
      state.chunks.push(decoder.decode(data));
    },
    close() {
      state.closed = true;
    },
  };

  const unsubscribe = eventBus.subscribe(sessionId, (event) => {
    const formatted = formatSSE(event);
    controller.enqueue(encoder.encode(formatted));

    if (event.type === "done") {
      unsubscribe();
      state.unsubscribed = true;
      controller.close();
    }
  });

  // Send initial running status
  const runningEvent = formatSSE({
    type: "status_change",
    status: "running",
  } as SSEEvent);
  controller.enqueue(encoder.encode(runningEvent));

  return state;
}

// -- Tests --

describe("SSE events endpoint (no query running)", () => {
  it("sends status_change with current session status and closes", () => {
    const { chunks, closed } = simulateNoQueryRunning("idle");

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(
      'event: status_change\ndata: {"status":"idle"}\n\n',
    );
    expect(closed).toBe(true);
  });

  it("sends completed status when session is completed", () => {
    const { chunks, closed } = simulateNoQueryRunning("completed");

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('"status":"completed"');
    expect(closed).toBe(true);
  });

  it("sends error status when session is in error state", () => {
    const { chunks, closed } = simulateNoQueryRunning("error");

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('"status":"error"');
    expect(closed).toBe(true);
  });
});

describe("SSE events endpoint (query running)", () => {
  it("sends running status immediately, then forwards events", () => {
    const bus = createEventBus();
    const sessionId = "test-session-1";

    const state = simulateQueryRunning(bus, sessionId);

    // Should have the initial running status
    expect(state.chunks).toHaveLength(1);
    expect(state.chunks[0]).toBe(
      'event: status_change\ndata: {"status":"running"}\n\n',
    );

    // Emit events through the bus
    bus.emit(sessionId, { type: "processing" });
    bus.emit(sessionId, { type: "assistant_text", text: "Hello" });

    expect(state.chunks).toHaveLength(3);
    expect(state.chunks[1]).toBe("event: processing\ndata: {}\n\n");
    expect(state.chunks[2]).toBe(
      'event: assistant_text\ndata: {"text":"Hello"}\n\n',
    );
    expect(state.closed).toBe(false);
  });

  it("closes stream and unsubscribes on done event", () => {
    const bus = createEventBus();
    const sessionId = "test-session-2";

    const state = simulateQueryRunning(bus, sessionId);

    bus.emit(sessionId, { type: "assistant_text", text: "Response" });
    bus.emit(sessionId, { type: "done" });

    expect(state.closed).toBe(true);
    expect(state.unsubscribed).toBe(true);

    // The done event itself should be in the chunks
    const lastChunk = state.chunks[state.chunks.length - 1];
    expect(lastChunk).toBe("event: done\ndata: {}\n\n");
  });

  it("does not receive events after done", () => {
    const bus = createEventBus();
    const sessionId = "test-session-3";

    const state = simulateQueryRunning(bus, sessionId);

    bus.emit(sessionId, { type: "done" });
    const chunkCountAfterDone = state.chunks.length;

    // These should not be delivered since we unsubscribed
    bus.emit(sessionId, { type: "assistant_text", text: "late message" });

    expect(state.chunks.length).toBe(chunkCountAfterDone);
  });

  it("forwards error events before done", () => {
    const bus = createEventBus();
    const sessionId = "test-session-4";

    const state = simulateQueryRunning(bus, sessionId);

    bus.emit(sessionId, {
      type: "error",
      message: "Something failed",
      recoverable: false,
    });
    bus.emit(sessionId, { type: "done" });

    // running status + error + done = 3 chunks
    expect(state.chunks).toHaveLength(3);
    expect(state.chunks[1]).toBe(
      'event: error\ndata: {"message":"Something failed","recoverable":false}\n\n',
    );
    expect(state.closed).toBe(true);
  });

  it("forwards tool_use and tool_result events", () => {
    const bus = createEventBus();
    const sessionId = "test-session-5";

    const state = simulateQueryRunning(bus, sessionId);

    bus.emit(sessionId, {
      type: "tool_use",
      toolName: "read_file",
      toolInput: { path: "/tmp/test" },
      toolUseId: "tool-1",
    });
    bus.emit(sessionId, {
      type: "tool_result",
      toolUseId: "tool-1",
      result: { summary: "File contents" },
    });
    bus.emit(sessionId, { type: "done" });

    // running + tool_use + tool_result + done = 4 chunks
    expect(state.chunks).toHaveLength(4);
    expect(state.chunks[1]).toContain("event: tool_use");
    expect(state.chunks[1]).toContain('"toolName":"read_file"');
    expect(state.chunks[2]).toContain("event: tool_result");
    expect(state.chunks[2]).toContain('"toolUseId":"tool-1"');
  });

  it("supports multiple concurrent subscribers", () => {
    const bus = createEventBus();
    const sessionId = "test-session-6";

    const state1 = simulateQueryRunning(bus, sessionId);
    const state2 = simulateQueryRunning(bus, sessionId);

    bus.emit(sessionId, { type: "processing" });

    // Both subscribers receive the processing event (plus their initial running status)
    expect(state1.chunks).toHaveLength(2);
    expect(state2.chunks).toHaveLength(2);
    expect(state1.chunks[1]).toBe("event: processing\ndata: {}\n\n");
    expect(state2.chunks[1]).toBe("event: processing\ndata: {}\n\n");
  });
});

describe("SSE wire format compliance", () => {
  it("every chunk ends with double newline", () => {
    const bus = createEventBus();
    const sessionId = "test-format";

    const state = simulateQueryRunning(bus, sessionId);
    bus.emit(sessionId, { type: "processing" });
    bus.emit(sessionId, { type: "assistant_text", text: "test" });
    bus.emit(sessionId, { type: "done" });

    for (const chunk of state.chunks) {
      expect(chunk.endsWith("\n\n")).toBe(true);
    }
  });

  it("every chunk starts with 'event:' field", () => {
    const bus = createEventBus();
    const sessionId = "test-format-2";

    const state = simulateQueryRunning(bus, sessionId);
    bus.emit(sessionId, { type: "processing" });
    bus.emit(sessionId, { type: "done" });

    for (const chunk of state.chunks) {
      expect(chunk.startsWith("event: ")).toBe(true);
    }
  });

  it("data field contains valid JSON", () => {
    const bus = createEventBus();
    const sessionId = "test-format-3";

    const state = simulateQueryRunning(bus, sessionId);
    bus.emit(sessionId, {
      type: "assistant_text",
      text: 'Quotes "and" newlines\n here',
    });
    bus.emit(sessionId, { type: "done" });

    for (const chunk of state.chunks) {
      const dataLine = chunk.split("data: ")[1].trimEnd();
      // Should not throw
      expect(() => { JSON.parse(dataLine); }).not.toThrow();
    }
  });
});
