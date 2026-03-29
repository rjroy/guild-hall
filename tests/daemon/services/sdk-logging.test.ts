import { describe, test, expect } from "bun:test";
import { logSdkMessage } from "@/daemon/lib/agent-sdk/sdk-logging";
import type { Log } from "@/daemon/lib/log";

/** Creates a Log that collects all messages into an array. */
function collectingLogForSdk(): { log: Log; logs: string[] } {
  const logs: string[] = [];
  const log: Log = {
    error(...args: unknown[]) { logs.push(args.join(" ")); },
    warn(...args: unknown[]) { logs.push(args.join(" ")); },
    info(...args: unknown[]) { logs.push(args.join(" ")); },
    debug(...args: unknown[]) { logs.push(args.join(" ")); },
  };
  return { log, logs };
}

describe("logSdkMessage", () => {
  function collect(msg: unknown): string[] {
    const { log, logs } = collectingLogForSdk();
    logSdkMessage(log, 1, msg);
    return logs;
  }

  // -- Types with their own summary line --

  test("logs system messages", () => {
    const logs = collect({ type: "system", subtype: "init", session_id: "abc" });
    expect(logs).toEqual(["[msg 1] system"]);
  });

  test("logs rate_limit_event messages", () => {
    const logs = collect({ type: "rate_limit_event" });
    expect(logs).toEqual(["[msg 1] rate_limit_event"]);
  });

  test("logs result with stop reason and cost", () => {
    const logs = collect({
      type: "result",
      stop_reason: "end_turn",
      total_cost_usd: "0.05",
    });
    expect(logs).toEqual(["[msg 1] result (stop=end_turn cost=$0.05)"]);
  });

  test("logs result without cost", () => {
    const logs = collect({ type: "result", stop_reason: "end_turn" });
    expect(logs).toEqual(["[msg 1] result (stop=end_turn)"]);
  });

  // -- Types silently skipped (no content blocks to inspect) --

  test("silently skips stream_event messages", () => {
    const logs = collect({ type: "stream_event", event: { type: "content_block_delta" } });
    expect(logs).toEqual([]);
  });

  test("silently skips unknown SDK message types", () => {
    const logs = collect({ type: "tool_progress" });
    expect(logs).toEqual([]);
  });

  // -- Content-block types (assistant, user) --

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

  test("notes missing content blocks for assistant messages", () => {
    const logs = collect({ type: "assistant" });
    expect(logs).toEqual(["[msg 1] assistant (no content blocks)"]);
  });

  test("notes missing content blocks for user messages", () => {
    const logs = collect({ type: "user" });
    expect(logs).toEqual(["[msg 1] user (no content blocks)"]);
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

  test("truncates long text content", () => {
    const longText = "x".repeat(400);
    const logs = collect({
      type: "assistant",
      message: {
        content: [{ type: "text", text: longText }],
      },
    });
    expect(logs[0]).toContain("x".repeat(300) + "...");
    expect(logs[0]).not.toContain("x".repeat(301));
  });

  test("uses message index in prefix", () => {
    const { log, logs } = collectingLogForSdk();
    logSdkMessage(log, 42, { type: "system" });
    expect(logs[0]).toStartWith("[msg 42]");
  });
});
