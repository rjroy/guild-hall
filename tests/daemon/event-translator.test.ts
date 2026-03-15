import { describe, test, expect } from "bun:test";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { translateSdkMessage, createStreamTranslator } from "@/daemon/lib/agent-sdk/event-translator";
import type { GuildHallEvent, MeetingId, SdkSessionId } from "@/daemon/types";
import { asMeetingId, asSdkSessionId } from "@/daemon/types";

/**
 * Constructs a mock SDKSystemMessage (init).
 * Uses `as unknown as SDKMessage` because we can't import the UUID type
 * from crypto and the BetaRawMessageStreamEvent from the Anthropic SDK.
 */
function makeInitMessage(sessionId = "sdk-session-abc"): SDKMessage {
  return {
    type: "system",
    subtype: "init",
    session_id: sessionId,
    uuid: "00000000-0000-0000-0000-000000000001" as `${string}-${string}-${string}-${string}-${string}`,
    apiKeySource: "user",
    betas: [],
    claude_code_version: "2.1.50",
    cwd: "/tmp",
    tools: ["Read", "Glob"],
    mcp_servers: [],
    model: "claude-sonnet-4-6",
    permissionMode: "default",
    slash_commands: [],
    output_style: "text",
    skills: [],
    plugins: [],
  } as unknown as SDKMessage;
}

function makeStreamEventTextDelta(text: string): SDKMessage {
  return {
    type: "stream_event",
    event: {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text },
    },
    parent_tool_use_id: null,
    uuid: "00000000-0000-0000-0000-000000000002" as `${string}-${string}-${string}-${string}-${string}`,
    session_id: "sdk-session-abc",
  } as unknown as SDKMessage;
}

function makeStreamEventToolUseStart(name: string): SDKMessage {
  return {
    type: "stream_event",
    event: {
      type: "content_block_start",
      index: 1,
      content_block: { type: "tool_use", id: "tool-1", name, input: {} },
    },
    parent_tool_use_id: null,
    uuid: "00000000-0000-0000-0000-000000000003" as `${string}-${string}-${string}-${string}-${string}`,
    session_id: "sdk-session-abc",
  } as unknown as SDKMessage;
}

function makeStreamEventInputJsonDelta(): SDKMessage {
  return {
    type: "stream_event",
    event: {
      type: "content_block_delta",
      index: 1,
      delta: { type: "input_json_delta", partial_json: '{"path":' },
    },
    parent_tool_use_id: null,
    uuid: "00000000-0000-0000-0000-000000000004" as `${string}-${string}-${string}-${string}-${string}`,
    session_id: "sdk-session-abc",
  } as unknown as SDKMessage;
}

function makeStreamEventMessageStop(): SDKMessage {
  return {
    type: "stream_event",
    event: { type: "message_stop" },
    parent_tool_use_id: null,
    uuid: "00000000-0000-0000-0000-000000000005" as `${string}-${string}-${string}-${string}-${string}`,
    session_id: "sdk-session-abc",
  } as unknown as SDKMessage;
}

function makeStreamEventContentBlockStop(): SDKMessage {
  return {
    type: "stream_event",
    event: { type: "content_block_stop", index: 0 },
    parent_tool_use_id: null,
    uuid: "00000000-0000-0000-0000-000000000006" as `${string}-${string}-${string}-${string}-${string}`,
    session_id: "sdk-session-abc",
  } as unknown as SDKMessage;
}

function makeAssistantMessage(
  content: Array<Record<string, unknown>>,
): SDKMessage {
  return {
    type: "assistant",
    message: {
      id: "msg-1",
      type: "message",
      role: "assistant",
      content,
      model: "claude-sonnet-4-6",
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 50 },
    },
    parent_tool_use_id: null,
    uuid: "00000000-0000-0000-0000-000000000010" as `${string}-${string}-${string}-${string}-${string}`,
    session_id: "sdk-session-abc",
  } as unknown as SDKMessage;
}

function makeUserMessageWithToolResults(
  results: Array<Record<string, unknown>>,
): SDKMessage {
  return {
    type: "user",
    message: {
      role: "user",
      content: results,
    },
    parent_tool_use_id: null,
    session_id: "sdk-session-abc",
    uuid: "00000000-0000-0000-0000-000000000020" as `${string}-${string}-${string}-${string}-${string}`,
  } as unknown as SDKMessage;
}

function makeResultSuccess(cost: number): SDKMessage {
  return {
    type: "result",
    subtype: "success",
    total_cost_usd: cost,
    duration_ms: 5000,
    duration_api_ms: 4500,
    is_error: false,
    num_turns: 3,
    result: "Done.",
    stop_reason: "end_turn",
    usage: {
      input_tokens: 1000,
      output_tokens: 500,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    modelUsage: {},
    permission_denials: [],
    uuid: "00000000-0000-0000-0000-000000000030" as `${string}-${string}-${string}-${string}-${string}`,
    session_id: "sdk-session-abc",
  } as unknown as SDKMessage;
}

function makeResultError(
  subtype: string,
  errors: string[],
): SDKMessage {
  return {
    type: "result",
    subtype,
    errors,
    duration_ms: 1000,
    duration_api_ms: 900,
    is_error: true,
    num_turns: 1,
    stop_reason: null,
    total_cost_usd: 0.01,
    usage: {
      input_tokens: 100,
      output_tokens: 10,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    modelUsage: {},
    permission_denials: [],
    uuid: "00000000-0000-0000-0000-000000000040" as `${string}-${string}-${string}-${string}-${string}`,
    session_id: "sdk-session-abc",
  } as unknown as SDKMessage;
}

// -- Tests --

describe("translateSdkMessage", () => {
  describe("SDKSystemMessage (init)", () => {
    test("init message produces session event with correct IDs", () => {
      const events = translateSdkMessage(makeInitMessage("sess-42"));

      expect(events).toEqual([
        {
          type: "session",
          sessionId: "sess-42",
        },
      ]);
    });

    test("init message produces session event without activity IDs", () => {
      const events = translateSdkMessage(makeInitMessage());

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: "session",
        sessionId: "sdk-session-abc",
      });
    });
  });

  describe("SDKPartialAssistantMessage (stream_event)", () => {
    test("text_delta event produces text_delta", () => {
      const events = translateSdkMessage(
        makeStreamEventTextDelta("Hello, world!"),
      );

      expect(events).toEqual([{ type: "text_delta", text: "Hello, world!" }]);
    });

    test("tool_use content_block_start produces tool_use event with id", () => {
      const events = translateSdkMessage(
        makeStreamEventToolUseStart("Read"),
      );

      expect(events).toEqual([
        { type: "tool_use", name: "Read", input: {}, id: "tool-1" },
      ]);
    });

    test("input_json_delta produces empty array", () => {
      const events = translateSdkMessage(
        makeStreamEventInputJsonDelta(),
      );

      expect(events).toEqual([]);
    });

    test("message_stop produces empty array", () => {
      const events = translateSdkMessage(
        makeStreamEventMessageStop(),
      );

      expect(events).toEqual([]);
    });

    test("content_block_stop produces empty array", () => {
      const events = translateSdkMessage(
        makeStreamEventContentBlockStop(),
      );

      expect(events).toEqual([]);
    });
  });

  describe("SDKAssistantMessage (text deduplication)", () => {
    test("text-only content produces empty array (double-data prevention)", () => {
      const events = translateSdkMessage(
        makeAssistantMessage([
          { type: "text", text: "Here is my analysis..." },
        ]),
      );

      expect(events).toEqual([]);
    });

    test("tool_use blocks produce empty array (double-data prevention)", () => {
      const events = translateSdkMessage(
        makeAssistantMessage([
          {
            type: "tool_use",
            id: "tool-1",
            name: "Read",
            input: { file_path: "/foo/bar.ts" },
          },
        ]),
      );

      expect(events).toEqual([]);
    });

    test("mixed text + tool_use produces empty array (double-data prevention)", () => {
      const events = translateSdkMessage(
        makeAssistantMessage([
          { type: "text", text: "Let me check that file." },
          {
            type: "tool_use",
            id: "tool-1",
            name: "Glob",
            input: { pattern: "**/*.ts" },
          },
          { type: "text", text: "And also this one." },
          {
            type: "tool_use",
            id: "tool-2",
            name: "Read",
            input: { file_path: "/src/index.ts" },
          },
        ]),
      );

      expect(events).toEqual([]);
    });

    test("empty content array produces empty array", () => {
      const events = translateSdkMessage(
        makeAssistantMessage([]),
      );

      expect(events).toEqual([]);
    });
  });

  describe("SDKUserMessage (tool results)", () => {
    test("tool_result blocks produce tool_result events with toolUseId", () => {
      const events = translateSdkMessage(
        makeUserMessageWithToolResults([
          {
            type: "tool_result",
            tool_use_id: "tool-1",
            content: "File contents here",
          },
        ]),
      );

      expect(events).toEqual([
        { type: "tool_result", name: "unknown", output: "File contents here", toolUseId: "tool-1" },
      ]);
    });

    test("tool_result with array content extracts text parts", () => {
      const events = translateSdkMessage(
        makeUserMessageWithToolResults([
          {
            type: "tool_result",
            tool_use_id: "tool-2",
            content: [
              { type: "text", text: "Line 1\n" },
              { type: "text", text: "Line 2" },
            ],
          },
        ]),
      );

      expect(events).toEqual([
        { type: "tool_result", name: "unknown", output: "Line 1\nLine 2", toolUseId: "tool-2" },
      ]);
    });

    test("tool_result with name field uses it", () => {
      const events = translateSdkMessage(
        makeUserMessageWithToolResults([
          {
            type: "tool_result",
            tool_use_id: "tool-3",
            name: "Bash",
            content: "exit code 0",
          },
        ]),
      );

      expect(events).toEqual([
        { type: "tool_result", name: "Bash", output: "exit code 0", toolUseId: "tool-3" },
      ]);
    });

    test("user message without tool_result blocks produces empty array", () => {
      const msg = {
        type: "user",
        message: {
          role: "user",
          content: [{ type: "text", text: "Please fix the bug" }],
        },
        parent_tool_use_id: null,
        session_id: "sdk-session-abc",
        uuid: "00000000-0000-0000-0000-000000000021",
      } as unknown as SDKMessage;

      const events = translateSdkMessage(msg);
      expect(events).toEqual([]);
    });

    test("user message with string content (not array) produces empty array", () => {
      const msg = {
        type: "user",
        message: {
          role: "user",
          content: "Just a plain string message",
        },
        parent_tool_use_id: null,
        session_id: "sdk-session-abc",
        uuid: "00000000-0000-0000-0000-000000000022",
      } as unknown as SDKMessage;

      const events = translateSdkMessage(msg);
      expect(events).toEqual([]);
    });
  });

  describe("SDKResultSuccess", () => {
    test("success produces turn_end with cost", () => {
      const events = translateSdkMessage(makeResultSuccess(0.042));

      expect(events).toEqual([{ type: "turn_end", cost: 0.042 }]);
    });

    test("success with zero cost includes cost", () => {
      const events = translateSdkMessage(makeResultSuccess(0));

      expect(events).toEqual([{ type: "turn_end", cost: 0 }]);
    });
  });

  describe("SDKResultError", () => {
    test("error_during_execution with error messages", () => {
      const events = translateSdkMessage(
        makeResultError("error_during_execution", [
          "Tool failed",
          "Retries exhausted",
        ]),
      );

      expect(events).toEqual([
        { type: "error", reason: "Tool failed; Retries exhausted" },
      ]);
    });

    test("error_max_turns with empty errors falls back to subtype", () => {
      const events = translateSdkMessage(
        makeResultError("error_max_turns", []),
      );

      expect(events).toEqual([
        { type: "error", reason: "error_max_turns" },
      ]);
    });

    test("error_max_budget_usd produces error event", () => {
      const events = translateSdkMessage(
        makeResultError("error_max_budget_usd", ["Budget exceeded"]),
      );

      expect(events).toEqual([
        { type: "error", reason: "Budget exceeded" },
      ]);
    });

    test("error_max_structured_output_retries produces error event", () => {
      const events = translateSdkMessage(
        makeResultError("error_max_structured_output_retries", []),
      );

      expect(events).toEqual([
        { type: "error", reason: "error_max_structured_output_retries" },
      ]);
    });
  });

  describe("unknown/internal message types", () => {
    test("SDKCompactBoundaryMessage produces empty array", () => {
      const msg = {
        type: "system",
        subtype: "compact_boundary",
        compact_metadata: { trigger: "auto", pre_tokens: 5000 },
        uuid: "00000000-0000-0000-0000-000000000050",
        session_id: "sdk-session-abc",
      } as unknown as SDKMessage;

      expect(translateSdkMessage(msg)).toEqual([]);
    });

    test("SDKStatusMessage produces empty array", () => {
      const msg = {
        type: "system",
        subtype: "status",
        status: "compacting",
        uuid: "00000000-0000-0000-0000-000000000051",
        session_id: "sdk-session-abc",
      } as unknown as SDKMessage;

      expect(translateSdkMessage(msg)).toEqual([]);
    });

    test("SDKHookStartedMessage produces empty array", () => {
      const msg = {
        type: "system",
        subtype: "hook_started",
        hook_id: "hook-1",
        hook_name: "test",
        hook_event: "PreToolUse",
        uuid: "00000000-0000-0000-0000-000000000052",
        session_id: "sdk-session-abc",
      } as unknown as SDKMessage;

      expect(translateSdkMessage(msg)).toEqual([]);
    });

    test("SDKToolProgressMessage produces empty array", () => {
      const msg = {
        type: "tool_progress",
        tool_use_id: "tool-1",
        tool_name: "Bash",
        parent_tool_use_id: null,
        elapsed_time_seconds: 5,
        uuid: "00000000-0000-0000-0000-000000000053",
        session_id: "sdk-session-abc",
      } as unknown as SDKMessage;

      expect(translateSdkMessage(msg)).toEqual([]);
    });

    test("SDKAuthStatusMessage produces empty array", () => {
      const msg = {
        type: "auth_status",
        isAuthenticating: false,
        output: [],
        uuid: "00000000-0000-0000-0000-000000000054",
        session_id: "sdk-session-abc",
      } as unknown as SDKMessage;

      expect(translateSdkMessage(msg)).toEqual([]);
    });

    test("SDKTaskNotificationMessage produces empty array", () => {
      const msg = {
        type: "system",
        subtype: "task_notification",
        task_id: "task-1",
        status: "completed",
        output_file: "/tmp/output",
        summary: "Task done",
        uuid: "00000000-0000-0000-0000-000000000055",
        session_id: "sdk-session-abc",
      } as unknown as SDKMessage;

      expect(translateSdkMessage(msg)).toEqual([]);
    });

    test("SDKToolUseSummaryMessage produces empty array", () => {
      const msg = {
        type: "tool_use_summary",
        summary: "Used Read tool",
        preceding_tool_use_ids: ["tool-1"],
        uuid: "00000000-0000-0000-0000-000000000056",
        session_id: "sdk-session-abc",
      } as unknown as SDKMessage;

      expect(translateSdkMessage(msg)).toEqual([]);
    });

    test("SDKHookProgressMessage produces empty array", () => {
      const msg = {
        type: "system",
        subtype: "hook_progress",
        hook_id: "hook-1",
        hook_name: "test",
        hook_event: "PreToolUse",
        stdout: "",
        stderr: "",
        output: "",
        uuid: "00000000-0000-0000-0000-000000000057",
        session_id: "sdk-session-abc",
      } as unknown as SDKMessage;

      expect(translateSdkMessage(msg)).toEqual([]);
    });

    test("SDKTaskStartedMessage produces empty array", () => {
      const msg = {
        type: "system",
        subtype: "task_started",
        task_id: "task-2",
        description: "Running analysis",
        uuid: "00000000-0000-0000-0000-000000000058",
        session_id: "sdk-session-abc",
      } as unknown as SDKMessage;

      expect(translateSdkMessage(msg)).toEqual([]);
    });

    test("SDKFilesPersistedEvent produces empty array", () => {
      const msg = {
        type: "system",
        subtype: "files_persisted",
        files: [],
        failed: [],
        processed_at: "2026-02-21T00:00:00Z",
        uuid: "00000000-0000-0000-0000-000000000059",
        session_id: "sdk-session-abc",
      } as unknown as SDKMessage;

      expect(translateSdkMessage(msg)).toEqual([]);
    });
  });

  describe("SDKUserMessageReplay", () => {
    test("replay messages are user type and produce empty array when no tool results", () => {
      const msg = {
        type: "user",
        message: { role: "user", content: "Replayed prompt" },
        parent_tool_use_id: null,
        isReplay: true,
        uuid: "00000000-0000-0000-0000-000000000060",
        session_id: "sdk-session-abc",
      } as unknown as SDKMessage;

      expect(translateSdkMessage(msg)).toEqual([]);
    });
  });

  describe("full tool invocation sequence (no duplicates)", () => {
    test("stream_event emits tool_use, assistant message emits nothing, user message emits tool_result with matching ID", () => {
      // Step 1: stream_event content_block_start
      const streamEvents = translateSdkMessage(
        makeStreamEventToolUseStart("Read"),
      );
      expect(streamEvents).toEqual([
        { type: "tool_use", name: "Read", input: {}, id: "tool-1" },
      ]);

      // Step 2: assistant message with the same tool_use block (finalized)
      const assistantEvents = translateSdkMessage(
        makeAssistantMessage([
          {
            type: "tool_use",
            id: "tool-1",
            name: "Read",
            input: { file_path: "/foo/bar.ts" },
          },
        ]),
      );
      expect(assistantEvents).toEqual([]);

      // Step 3: user message with tool_result referencing tool-1
      const userEvents = translateSdkMessage(
        makeUserMessageWithToolResults([
          {
            type: "tool_result",
            tool_use_id: "tool-1",
            content: "File contents here",
          },
        ]),
      );
      expect(userEvents).toEqual([
        { type: "tool_result", name: "unknown", output: "File contents here", toolUseId: "tool-1" },
      ]);

      // Total: exactly 1 tool_use + 1 tool_result, no duplicates
      const allEvents = [...streamEvents, ...assistantEvents, ...userEvents];
      const toolUseEvents = allEvents.filter(e => e.type === "tool_use");
      const toolResultEvents = allEvents.filter(e => e.type === "tool_result");
      expect(toolUseEvents).toHaveLength(1);
      expect(toolResultEvents).toHaveLength(1);
    });
  });
});

describe("branded types", () => {
  test("asMeetingId returns a branded string", () => {
    const id: MeetingId = asMeetingId("meeting-001");
    // Should be usable as a string
    expect(id.startsWith("meeting")).toBe(true);
    expect(typeof id).toBe("string");
  });

  test("asSdkSessionId returns a branded string", () => {
    const id: SdkSessionId = asSdkSessionId("sess-abc");
    expect(id.includes("sess")).toBe(true);
    expect(typeof id).toBe("string");
  });

  test("branded types prevent accidental assignment at compile time", () => {
    // This test documents the compile-time behavior. At runtime both are
    // strings, but TypeScript prevents assigning MeetingId to SdkSessionId
    // and vice versa without an explicit cast.
    const meetingId: MeetingId = asMeetingId("m-1");
    const sessionId: SdkSessionId = asSdkSessionId("s-1");

    // Both are strings at runtime
    expect(typeof meetingId).toBe("string");
    expect(typeof sessionId).toBe("string");

    // Verify they carry their values correctly (cast to string because
    // branded types intentionally reject direct comparison with plain strings)
    expect(meetingId as string).toBe("m-1");
    expect(sessionId as string).toBe("s-1");
  });
});

describe("createStreamTranslator (input_json_delta accumulation)", () => {
  function makeToolUseStart(name: string, id: string, index: number): SDKMessage {
    return {
      type: "stream_event",
      event: {
        type: "content_block_start",
        index,
        content_block: { type: "tool_use", id, name, input: {} },
      },
      parent_tool_use_id: null,
      uuid: "00000000-0000-0000-0000-100000000001" as `${string}-${string}-${string}-${string}-${string}`,
      session_id: "sdk-session-abc",
    } as unknown as SDKMessage;
  }

  function makeInputJsonDelta(index: number, partialJson: string): SDKMessage {
    return {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index,
        delta: { type: "input_json_delta", partial_json: partialJson },
      },
      parent_tool_use_id: null,
      uuid: "00000000-0000-0000-0000-100000000002" as `${string}-${string}-${string}-${string}-${string}`,
      session_id: "sdk-session-abc",
    } as unknown as SDKMessage;
  }

  function makeBlockStop(index: number): SDKMessage {
    return {
      type: "stream_event",
      event: { type: "content_block_stop", index },
      parent_tool_use_id: null,
      uuid: "00000000-0000-0000-0000-100000000003" as `${string}-${string}-${string}-${string}-${string}`,
      session_id: "sdk-session-abc",
    } as unknown as SDKMessage;
  }

  test("accumulates input_json_delta and emits tool_input on content_block_stop", () => {
    const translate = createStreamTranslator();

    // Start tool_use block at index 1
    const startEvents = translate(makeToolUseStart("Read", "tool-42", 1));
    expect(startEvents).toEqual([
      { type: "tool_use", name: "Read", input: {}, id: "tool-42" },
    ]);

    // Send input_json_delta chunks
    expect(translate(makeInputJsonDelta(1, '{"file_'))).toEqual([]);
    expect(translate(makeInputJsonDelta(1, 'path":"/foo/'))).toEqual([]);
    expect(translate(makeInputJsonDelta(1, 'bar.ts"}'))).toEqual([]);

    // content_block_stop triggers tool_input emission
    const stopEvents = translate(makeBlockStop(1));
    expect(stopEvents).toEqual([
      { type: "tool_input", toolUseId: "tool-42", input: { file_path: "/foo/bar.ts" } },
    ]);
  });

  test("handles multiple concurrent tool_use blocks at different indices", () => {
    const translate = createStreamTranslator();

    // Start two tool blocks
    translate(makeToolUseStart("Read", "tool-a", 1));
    translate(makeToolUseStart("Glob", "tool-b", 2));

    // Interleave input deltas
    translate(makeInputJsonDelta(1, '{"file_path":'));
    translate(makeInputJsonDelta(2, '{"pattern":'));
    translate(makeInputJsonDelta(1, '"/src/index.ts"}'));
    translate(makeInputJsonDelta(2, '"**/*.ts"}'));

    // Stop block 2 first
    const stopB = translate(makeBlockStop(2));
    expect(stopB).toEqual([
      { type: "tool_input", toolUseId: "tool-b", input: { pattern: "**/*.ts" } },
    ]);

    // Stop block 1
    const stopA = translate(makeBlockStop(1));
    expect(stopA).toEqual([
      { type: "tool_input", toolUseId: "tool-a", input: { file_path: "/src/index.ts" } },
    ]);
  });

  test("content_block_stop for non-tool block (e.g., text) emits nothing", () => {
    const translate = createStreamTranslator();

    // Text block stop at index 0 (no tool_use start recorded)
    const events = translate(makeBlockStop(0));
    expect(events).toEqual([]);
  });

  test("text_delta events still pass through", () => {
    const translate = createStreamTranslator();

    const events = translate(makeStreamEventTextDelta("Hello"));
    expect(events).toEqual([{ type: "text_delta", text: "Hello" }]);
  });

  test("non-stream_event messages delegate to stateless translator", () => {
    const translate = createStreamTranslator();

    const events = translate(makeInitMessage("sess-99"));
    expect(events).toEqual([{ type: "session", sessionId: "sess-99" }]);
  });

  test("malformed JSON in accumulated chunks emits nothing on block stop", () => {
    const translate = createStreamTranslator();

    translate(makeToolUseStart("Read", "tool-bad", 1));
    translate(makeInputJsonDelta(1, '{"broken": '));
    // No closing brace

    const events = translate(makeBlockStop(1));
    expect(events).toEqual([]);
  });

  test("tool_use block with no input deltas emits nothing on block stop", () => {
    const translate = createStreamTranslator();

    translate(makeToolUseStart("Read", "tool-empty", 1));
    // No input_json_delta events

    const events = translate(makeBlockStop(1));
    expect(events).toEqual([]);
  });
});

describe("GuildHallEvent type coverage", () => {
  // Verifies all 6 event types can be constructed and are properly shaped
  test("all event types are constructible", () => {
    const events: GuildHallEvent[] = [
      { type: "session", meetingId: "m", sessionId: "s", worker: "w" },
      { type: "text_delta", text: "hello" },
      { type: "tool_use", name: "Read", input: { path: "/foo" } },
      { type: "tool_use", name: "Read", input: { path: "/foo" }, id: "tool-1" },
      { type: "tool_input", toolUseId: "tool-1", input: { path: "/foo" } },
      { type: "tool_result", name: "Read", output: "contents" },
      { type: "tool_result", name: "Read", output: "contents", toolUseId: "tool-1" },
      { type: "turn_end", cost: 0.01 },
      { type: "turn_end" }, // cost is optional
      { type: "error", reason: "something went wrong" },
    ];

    expect(events).toHaveLength(10);
    // Verify each has a type field
    for (const event of events) {
      expect(event.type).toBeDefined();
    }
  });
});
