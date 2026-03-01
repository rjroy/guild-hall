import { describe, test, expect } from "bun:test";
import {
  truncateSdkStr,
  sdkStr,
  logSdkMessage,
} from "@/daemon/services/commission-sdk-logging";

describe("truncateSdkStr", () => {
  test("returns short strings unchanged", () => {
    expect(truncateSdkStr("hello")).toBe("hello");
  });

  test("truncates strings exceeding default max (300)", () => {
    const long = "x".repeat(400);
    const result = truncateSdkStr(long);
    expect(result).toBe("x".repeat(300) + "...");
  });

  test("truncates at custom max", () => {
    expect(truncateSdkStr("abcdef", 3)).toBe("abc...");
  });

  test("returns exact-length strings unchanged", () => {
    expect(truncateSdkStr("abc", 3)).toBe("abc");
  });
});

describe("sdkStr", () => {
  test("extracts string values", () => {
    expect(sdkStr({ key: "value" }, "key")).toBe("value");
  });

  test("converts numbers to strings", () => {
    expect(sdkStr({ count: 42 }, "count")).toBe("42");
  });

  test("returns fallback for missing keys", () => {
    expect(sdkStr({}, "missing", "default")).toBe("default");
  });

  test("returns empty string fallback by default", () => {
    expect(sdkStr({}, "missing")).toBe("");
  });

  test("returns fallback for non-string, non-number values", () => {
    expect(sdkStr({ obj: { nested: true } }, "obj", "nope")).toBe("nope");
  });
});

describe("logSdkMessage", () => {
  function collect(msg: unknown): string[] {
    const logs: string[] = [];
    logSdkMessage((s) => logs.push(s), 1, msg);
    return logs;
  }

  test("logs system messages", () => {
    const logs = collect({ type: "system", subtype: "init", session_id: "abc" });
    expect(logs).toEqual(["[msg 1] system"]);
  });

  test("logs rate_limit_event messages", () => {
    const logs = collect({ type: "rate_limit_event" });
    expect(logs).toEqual(["[msg 1] rate_limit_event"]);
  });

  test("logs text content blocks", () => {
    const logs = collect({
      type: "assistant",
      message: {
        content: [{ type: "text", text: "Hello world" }],
      },
    });
    expect(logs).toEqual(["[msg 1] assistant/text: Hello world"]);
  });

  test("logs tool_use content blocks with input", () => {
    const logs = collect({
      type: "assistant",
      message: {
        content: [{ type: "tool_use", name: "read_file", input: { path: "/tmp/test.ts" } }],
      },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("assistant/tool_use: read_file(");
    expect(logs[0]).toContain("/tmp/test.ts");
  });

  test("logs tool_result content blocks (ok)", () => {
    const logs = collect({
      type: "user",
      message: {
        content: [{ type: "tool_result", content: "file contents here", is_error: false }],
      },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("tool_result [ok]:");
    expect(logs[0]).toContain("file contents here");
  });

  test("logs tool_result content blocks (error)", () => {
    const logs = collect({
      type: "user",
      message: {
        content: [{ type: "tool_result", content: "something broke", is_error: true }],
      },
    });
    expect(logs[0]).toContain("tool_result [ERROR]:");
  });

  test("logs tool_result with array content", () => {
    const logs = collect({
      type: "user",
      message: {
        content: [{
          type: "tool_result",
          content: [{ text: "part1" }, { text: "part2" }],
          is_error: false,
        }],
      },
    });
    expect(logs[0]).toContain("part1; part2");
  });

  test("logs result messages with stop reason and cost", () => {
    const logs = collect({
      type: "result",
      stop_reason: "end_turn",
      total_cost_usd: "0.05",
      message: { content: [{ type: "text", text: "done" }] },
    });
    expect(logs).toHaveLength(2);
    expect(logs[0]).toContain("result (stop=end_turn cost=$0.05)");
    expect(logs[1]).toContain("result/text: done");
  });

  test("logs messages without content blocks", () => {
    const logs = collect({ type: "assistant" });
    expect(logs).toEqual(["[msg 1] assistant (no content blocks)"]);
  });

  test("logs unknown block types with type prefix", () => {
    const logs = collect({
      type: "assistant",
      message: {
        content: [{ type: "image" }],
      },
    });
    expect(logs).toEqual(["[msg 1] assistant/image"]);
  });

  test("uses message index in prefix", () => {
    const logs: string[] = [];
    logSdkMessage((s) => logs.push(s), 42, { type: "system" });
    expect(logs[0]).toStartWith("[msg 42]");
  });
});
