import { describe, test, expect } from "bun:test";
import {
  parseSSEBuffer,
  generateMessageId,
  consumeFirstTurnSSE,
} from "@/lib/sse-helpers";

describe("parseSSEBuffer", () => {
  test("parses single complete SSE line", () => {
    const buffer = 'data: {"type":"session","meetingId":"abc-123"}\n';
    const { events, remaining } = parseSSEBuffer(buffer);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("session");
    expect(events[0].meetingId).toBe("abc-123");
    expect(remaining).toBe("");
  });

  test("parses multiple complete lines", () => {
    const buffer =
      'data: {"type":"session","meetingId":"abc"}\n' +
      'data: {"type":"text_delta","text":"hello"}\n' +
      'data: {"type":"turn_end"}\n';

    const { events, remaining } = parseSSEBuffer(buffer);

    expect(events).toHaveLength(3);
    expect(events[0].type).toBe("session");
    expect(events[1].type).toBe("text_delta");
    expect(events[2].type).toBe("turn_end");
    expect(remaining).toBe("");
  });

  test("preserves incomplete buffer as remaining", () => {
    const buffer = 'data: {"type":"session"}\ndata: {"type":"tex';
    const { events, remaining } = parseSSEBuffer(buffer);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("session");
    expect(remaining).toBe('data: {"type":"tex');
  });

  test("skips malformed JSON lines", () => {
    const buffer = "data: not-json\ndata: {\"type\":\"session\"}\n";
    const { events, remaining } = parseSSEBuffer(buffer);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("session");
    expect(remaining).toBe("");
  });

  test("skips non-data lines", () => {
    const buffer = ": keepalive\ndata: {\"type\":\"session\"}\n";
    const { events } = parseSSEBuffer(buffer);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("session");
  });

  test("returns empty events for empty buffer", () => {
    const { events, remaining } = parseSSEBuffer("");
    expect(events).toEqual([]);
    expect(remaining).toBe("");
  });

  test("handles buffer with only incomplete line", () => {
    const { events, remaining } = parseSSEBuffer("data: partial");
    expect(events).toEqual([]);
    expect(remaining).toBe("data: partial");
  });
});

describe("generateMessageId", () => {
  test("returns a string starting with msg-", () => {
    const id = generateMessageId();
    expect(id).toMatch(/^msg-\d+$/);
  });

  test("returns unique IDs on successive calls", () => {
    const id1 = generateMessageId();
    const id2 = generateMessageId();
    expect(id1).not.toBe(id2);
  });
});

describe("consumeFirstTurnSSE", () => {
  /**
   * Creates a ReadableStream from an array of SSE data strings.
   * Each string is encoded as a Uint8Array chunk.
   */
  function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let index = 0;

    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(encoder.encode(chunks[index]));
          index++;
        } else {
          controller.close();
        }
      },
    });
  }

  test("captures meetingId from session event", async () => {
    const stream = makeStream([
      'data: {"type":"session","meetingId":"mtg-001"}\n',
      'data: {"type":"turn_end"}\n',
    ]);

    const result = await consumeFirstTurnSSE(stream);
    expect(result.meetingId).toBe("mtg-001");
  });

  test("includes user message when provided", async () => {
    const stream = makeStream([
      'data: {"type":"session","meetingId":"mtg-001"}\n',
      'data: {"type":"text_delta","text":"Hello"}\n',
      'data: {"type":"turn_end"}\n',
    ]);

    const result = await consumeFirstTurnSSE(stream, "My prompt");
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content).toBe("My prompt");
    expect(result.messages[1].role).toBe("assistant");
    expect(result.messages[1].content).toBe("Hello");
  });

  test("accumulates text deltas into a single assistant message", async () => {
    const stream = makeStream([
      'data: {"type":"session","meetingId":"mtg-001"}\n',
      'data: {"type":"text_delta","text":"Hello "}\n',
      'data: {"type":"text_delta","text":"world"}\n',
      'data: {"type":"turn_end"}\n',
    ]);

    const result = await consumeFirstTurnSSE(stream);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toBe("Hello world");
  });

  test("handles no user message", async () => {
    const stream = makeStream([
      'data: {"type":"session","meetingId":"mtg-001"}\n',
      'data: {"type":"text_delta","text":"Response"}\n',
      'data: {"type":"turn_end"}\n',
    ]);

    const result = await consumeFirstTurnSSE(stream);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe("assistant");
  });

  test("throws on error event", async () => {
    const stream = makeStream([
      'data: {"type":"session","meetingId":"mtg-001"}\n',
      'data: {"type":"error","reason":"something broke"}\n',
    ]);

    await expect(consumeFirstTurnSSE(stream)).rejects.toThrow(
      "something broke",
    );
  });

  test("throws when stream ends without meeting ID", async () => {
    const stream = makeStream([
      'data: {"type":"text_delta","text":"Hello"}\n',
      'data: {"type":"turn_end"}\n',
    ]);

    await expect(consumeFirstTurnSSE(stream)).rejects.toThrow(
      "Stream ended without a meeting ID",
    );
  });

  test("flushes accumulated text when stream ends without turn_end", async () => {
    const stream = makeStream([
      'data: {"type":"session","meetingId":"mtg-001"}\n',
      'data: {"type":"text_delta","text":"partial"}\n',
    ]);

    const result = await consumeFirstTurnSSE(stream);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toBe("partial");
  });

  test("handles chunked delivery across SSE boundaries", async () => {
    // Simulate data arriving in mid-line chunks
    const stream = makeStream([
      'data: {"type":"session","mee',
      'tingId":"mtg-001"}\ndata: {"type":"text_del',
      'ta","text":"chunked"}\ndata: {"type":"turn_end"}\n',
    ]);

    const result = await consumeFirstTurnSSE(stream);
    expect(result.meetingId).toBe("mtg-001");
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toBe("chunked");
  });

  test("ignores tool_use and tool_result events", async () => {
    const stream = makeStream([
      'data: {"type":"session","meetingId":"mtg-001"}\n',
      'data: {"type":"text_delta","text":"Before "}\n',
      'data: {"type":"tool_use","name":"search"}\n',
      'data: {"type":"tool_result","result":"found"}\n',
      'data: {"type":"text_delta","text":"after"}\n',
      'data: {"type":"turn_end"}\n',
    ]);

    const result = await consumeFirstTurnSSE(stream);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toBe("Before after");
  });
});
