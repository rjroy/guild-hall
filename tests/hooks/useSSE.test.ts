import { describe, expect, it } from "bun:test";

import type { SSEEvent } from "@/lib/types";
import { parseSSEData, SSE_EVENT_TYPES } from "@/lib/sse-parse";

// -- Assertion helpers --

/** Narrows a nullable parse result to guarantee it is non-null. Fails the test if null. */
function assertParsed(result: SSEEvent | null): asserts result is SSEEvent {
  expect(result).not.toBeNull();
}

// -- Tests --

describe("SSE event parsing", () => {
  describe("SSE_EVENT_TYPES", () => {
    it("includes all expected event types", () => {
      const expected = [
        "processing",
        "assistant_text",
        "tool_use",
        "tool_result",
        "status_change",
        "error",
        "done",
      ] as const;
      expect(SSE_EVENT_TYPES).toEqual(expected);
    });
  });

  describe("parseSSEData", () => {
    it("parses processing event", () => {
      const result = parseSSEData("processing", "{}");
      expect(result).toEqual({ type: "processing" });
    });

    it("parses assistant_text event", () => {
      const result = parseSSEData(
        "assistant_text",
        '{"text":"Hello world"}',
      );
      expect(result).toEqual({ type: "assistant_text", text: "Hello world" });
    });

    it("parses tool_use event", () => {
      const data = JSON.stringify({
        toolName: "read_file",
        toolInput: { path: "/tmp/test.txt" },
        toolUseId: "tool-42",
      });
      const result = parseSSEData("tool_use", data);
      expect(result).toEqual({
        type: "tool_use",
        toolName: "read_file",
        toolInput: { path: "/tmp/test.txt" },
        toolUseId: "tool-42",
      });
    });

    it("parses tool_result event", () => {
      const data = JSON.stringify({
        toolUseId: "tool-42",
        result: { content: "file data" },
      });
      const result = parseSSEData("tool_result", data);
      expect(result).toEqual({
        type: "tool_result",
        toolUseId: "tool-42",
        result: { content: "file data" },
      });
    });

    it("parses status_change event", () => {
      const result = parseSSEData("status_change", '{"status":"running"}');
      expect(result).toEqual({ type: "status_change", status: "running" });
    });

    it("parses error event", () => {
      const data = JSON.stringify({
        message: "Agent crashed",
        recoverable: false,
      });
      const result = parseSSEData("error", data);
      expect(result).toEqual({
        type: "error",
        message: "Agent crashed",
        recoverable: false,
      });
    });

    it("parses done event", () => {
      const result = parseSSEData("done", "{}");
      expect(result).toEqual({ type: "done" });
    });

    it("returns null for unknown event type", () => {
      const result = parseSSEData("unknown_type", "{}");
      expect(result).toBeNull();
    });

    it("returns null for malformed JSON", () => {
      const result = parseSSEData("processing", "not json");
      expect(result).toBeNull();
    });

    it("returns null for empty data string", () => {
      const result = parseSSEData("processing", "");
      expect(result).toBeNull();
    });

    it("handles extra fields in data gracefully", () => {
      const result = parseSSEData(
        "assistant_text",
        '{"text":"hi","extra":"field"}',
      );
      // The extra field passes through since we spread the data
      assertParsed(result);
      expect(result.type).toBe("assistant_text");
      if (result.type === "assistant_text") {
        expect(result.text).toBe("hi");
      }
    });
  });

  describe("wire format correspondence", () => {
    // Verifies that the SSE event names we listen for match the types
    // sent by the server's formatSSE function (which uses event.type
    // as the SSE event name).

    it("event type names match SSEEvent type discriminator values", () => {
      const typeValues = [
        "processing",
        "assistant_text",
        "tool_use",
        "tool_result",
        "status_change",
        "error",
        "done",
      ] as const;

      for (const type of typeValues) {
        expect((SSE_EVENT_TYPES as readonly string[]).includes(type)).toBe(
          true,
        );
      }
    });
  });
});
