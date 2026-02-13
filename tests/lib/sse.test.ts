import { describe, expect, it } from "bun:test";

import { formatSSEEvent, formatSSE } from "@/lib/sse";
import type { SSEEvent } from "@/lib/types";

describe("formatSSEEvent", () => {
  it("produces correct SSE wire format", () => {
    const result = formatSSEEvent("test", { key: "value" });
    expect(result).toBe('event: test\ndata: {"key":"value"}\n\n');
  });

  it("formats empty data object", () => {
    const result = formatSSEEvent("ping", {});
    expect(result).toBe("event: ping\ndata: {}\n\n");
  });

  it("JSON-escapes special characters in data values", () => {
    const result = formatSSEEvent("msg", {
      text: 'line1\nline2\t"quoted"',
    });
    const parsed = JSON.parse(result.split("data: ")[1].trim()) as Record<
      string,
      unknown
    >;
    expect(parsed.text).toBe('line1\nline2\t"quoted"');
  });

  it("handles nested objects in data", () => {
    const result = formatSSEEvent("complex", {
      outer: { inner: [1, 2, 3] },
    });
    expect(result).toBe(
      'event: complex\ndata: {"outer":{"inner":[1,2,3]}}\n\n',
    );
  });

  it("handles numeric and boolean values", () => {
    const result = formatSSEEvent("data", {
      count: 42,
      active: true,
      empty: null,
    });
    expect(result).toBe(
      'event: data\ndata: {"count":42,"active":true,"empty":null}\n\n',
    );
  });
});

describe("formatSSE", () => {
  it("formats a processing event", () => {
    const event: SSEEvent = { type: "processing" };
    const result = formatSSE(event);
    expect(result).toBe("event: processing\ndata: {}\n\n");
  });

  it("formats an assistant_text event", () => {
    const event: SSEEvent = { type: "assistant_text", text: "Hello world" };
    const result = formatSSE(event);
    expect(result).toBe(
      'event: assistant_text\ndata: {"text":"Hello world"}\n\n',
    );
  });

  it("formats a tool_use event", () => {
    const event: SSEEvent = {
      type: "tool_use",
      toolName: "read_file",
      toolInput: { path: "/tmp/test.txt" },
      toolUseId: "tool-123",
    };
    const result = formatSSE(event);
    expect(result).toBe(
      'event: tool_use\ndata: {"toolName":"read_file","toolInput":{"path":"/tmp/test.txt"},"toolUseId":"tool-123"}\n\n',
    );
  });

  it("formats a tool_result event", () => {
    const event: SSEEvent = {
      type: "tool_result",
      toolUseId: "tool-123",
      result: { summary: "File read successfully" },
    };
    const result = formatSSE(event);
    expect(result).toBe(
      'event: tool_result\ndata: {"toolUseId":"tool-123","result":{"summary":"File read successfully"}}\n\n',
    );
  });

  it("formats a status_change event", () => {
    const event: SSEEvent = { type: "status_change", status: "running" };
    const result = formatSSE(event);
    expect(result).toBe(
      'event: status_change\ndata: {"status":"running"}\n\n',
    );
  });

  it("formats an error event", () => {
    const event: SSEEvent = {
      type: "error",
      message: "Something broke",
      recoverable: false,
    };
    const result = formatSSE(event);
    expect(result).toBe(
      'event: error\ndata: {"message":"Something broke","recoverable":false}\n\n',
    );
  });

  it("formats a done event", () => {
    const event: SSEEvent = { type: "done" };
    const result = formatSSE(event);
    expect(result).toBe("event: done\ndata: {}\n\n");
  });

  it("handles special characters in text content", () => {
    const event: SSEEvent = {
      type: "assistant_text",
      text: 'She said "hello"\nNew line\ttab',
    };
    const result = formatSSE(event);
    // The data line should be valid JSON
    const dataLine = result.split("data: ")[1].trimEnd();
    const parsed = JSON.parse(dataLine) as { text: string };
    expect(parsed.text).toBe('She said "hello"\nNew line\ttab');
  });

  it("handles unicode characters", () => {
    const event: SSEEvent = {
      type: "assistant_text",
      text: "Hello \u{1F600} world \u00E9\u00E8",
    };
    const result = formatSSE(event);
    const dataLine = result.split("data: ")[1].trimEnd();
    const parsed = JSON.parse(dataLine) as { text: string };
    expect(parsed.text).toContain("\u{1F600}");
  });
});
