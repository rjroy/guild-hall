import { describe, test, expect } from "bun:test";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  translateSdkMessage,
  type TranslatorContext,
} from "@/daemon/services/event-translator";
import type { GuildHallEvent, MeetingId, SdkSessionId } from "@/daemon/types";
import { asMeetingId, asSdkSessionId } from "@/daemon/types";

// -- Helpers --

const context: TranslatorContext = {
  meetingId: "meeting-001",
  workerName: "code-reviewer",
};

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
      const events = translateSdkMessage(makeInitMessage("sess-42"), context);

      expect(events).toEqual([
        {
          type: "session",
          meetingId: "meeting-001",
          sessionId: "sess-42",
          worker: "code-reviewer",
        },
      ]);
    });

    test("init message uses context for meetingId and workerName", () => {
      const customContext: TranslatorContext = {
        meetingId: "meeting-xyz",
        workerName: "architect",
      };
      const events = translateSdkMessage(makeInitMessage(), customContext);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: "session",
        meetingId: "meeting-xyz",
        worker: "architect",
      });
    });
  });

  describe("SDKPartialAssistantMessage (stream_event)", () => {
    test("text_delta event produces text_delta", () => {
      const events = translateSdkMessage(
        makeStreamEventTextDelta("Hello, world!"),
        context,
      );

      expect(events).toEqual([{ type: "text_delta", text: "Hello, world!" }]);
    });

    test("tool_use content_block_start produces tool_use event", () => {
      const events = translateSdkMessage(
        makeStreamEventToolUseStart("Read"),
        context,
      );

      expect(events).toEqual([
        { type: "tool_use", name: "Read", input: {} },
      ]);
    });

    test("input_json_delta produces empty array", () => {
      const events = translateSdkMessage(
        makeStreamEventInputJsonDelta(),
        context,
      );

      expect(events).toEqual([]);
    });

    test("message_stop produces empty array", () => {
      const events = translateSdkMessage(
        makeStreamEventMessageStop(),
        context,
      );

      expect(events).toEqual([]);
    });

    test("content_block_stop produces empty array", () => {
      const events = translateSdkMessage(
        makeStreamEventContentBlockStop(),
        context,
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
        context,
      );

      expect(events).toEqual([]);
    });

    test("tool_use blocks produce tool_use events", () => {
      const events = translateSdkMessage(
        makeAssistantMessage([
          {
            type: "tool_use",
            id: "tool-1",
            name: "Read",
            input: { file_path: "/foo/bar.ts" },
          },
        ]),
        context,
      );

      expect(events).toEqual([
        {
          type: "tool_use",
          name: "Read",
          input: { file_path: "/foo/bar.ts" },
        },
      ]);
    });

    test("mixed text + tool_use produces only tool_use events", () => {
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
        context,
      );

      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({ type: "tool_use", name: "Glob" });
      expect(events[1]).toMatchObject({ type: "tool_use", name: "Read" });
    });

    test("empty content array produces empty array", () => {
      const events = translateSdkMessage(
        makeAssistantMessage([]),
        context,
      );

      expect(events).toEqual([]);
    });
  });

  describe("SDKUserMessage (tool results)", () => {
    test("tool_result blocks produce tool_result events", () => {
      const events = translateSdkMessage(
        makeUserMessageWithToolResults([
          {
            type: "tool_result",
            tool_use_id: "tool-1",
            content: "File contents here",
          },
        ]),
        context,
      );

      expect(events).toEqual([
        { type: "tool_result", name: "unknown", output: "File contents here" },
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
        context,
      );

      expect(events).toEqual([
        { type: "tool_result", name: "unknown", output: "Line 1\nLine 2" },
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
        context,
      );

      expect(events).toEqual([
        { type: "tool_result", name: "Bash", output: "exit code 0" },
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

      const events = translateSdkMessage(msg, context);
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

      const events = translateSdkMessage(msg, context);
      expect(events).toEqual([]);
    });
  });

  describe("SDKResultSuccess", () => {
    test("success produces turn_end with cost", () => {
      const events = translateSdkMessage(makeResultSuccess(0.042), context);

      expect(events).toEqual([{ type: "turn_end", cost: 0.042 }]);
    });

    test("success with zero cost includes cost", () => {
      const events = translateSdkMessage(makeResultSuccess(0), context);

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
        context,
      );

      expect(events).toEqual([
        { type: "error", reason: "Tool failed; Retries exhausted" },
      ]);
    });

    test("error_max_turns with empty errors falls back to subtype", () => {
      const events = translateSdkMessage(
        makeResultError("error_max_turns", []),
        context,
      );

      expect(events).toEqual([
        { type: "error", reason: "error_max_turns" },
      ]);
    });

    test("error_max_budget_usd produces error event", () => {
      const events = translateSdkMessage(
        makeResultError("error_max_budget_usd", ["Budget exceeded"]),
        context,
      );

      expect(events).toEqual([
        { type: "error", reason: "Budget exceeded" },
      ]);
    });

    test("error_max_structured_output_retries produces error event", () => {
      const events = translateSdkMessage(
        makeResultError("error_max_structured_output_retries", []),
        context,
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

      expect(translateSdkMessage(msg, context)).toEqual([]);
    });

    test("SDKStatusMessage produces empty array", () => {
      const msg = {
        type: "system",
        subtype: "status",
        status: "compacting",
        uuid: "00000000-0000-0000-0000-000000000051",
        session_id: "sdk-session-abc",
      } as unknown as SDKMessage;

      expect(translateSdkMessage(msg, context)).toEqual([]);
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

      expect(translateSdkMessage(msg, context)).toEqual([]);
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

      expect(translateSdkMessage(msg, context)).toEqual([]);
    });

    test("SDKAuthStatusMessage produces empty array", () => {
      const msg = {
        type: "auth_status",
        isAuthenticating: false,
        output: [],
        uuid: "00000000-0000-0000-0000-000000000054",
        session_id: "sdk-session-abc",
      } as unknown as SDKMessage;

      expect(translateSdkMessage(msg, context)).toEqual([]);
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

      expect(translateSdkMessage(msg, context)).toEqual([]);
    });

    test("SDKToolUseSummaryMessage produces empty array", () => {
      const msg = {
        type: "tool_use_summary",
        summary: "Used Read tool",
        preceding_tool_use_ids: ["tool-1"],
        uuid: "00000000-0000-0000-0000-000000000056",
        session_id: "sdk-session-abc",
      } as unknown as SDKMessage;

      expect(translateSdkMessage(msg, context)).toEqual([]);
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

      expect(translateSdkMessage(msg, context)).toEqual([]);
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

      expect(translateSdkMessage(msg, context)).toEqual([]);
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

      expect(translateSdkMessage(msg, context)).toEqual([]);
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

      expect(translateSdkMessage(msg, context)).toEqual([]);
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

describe("GuildHallEvent type coverage", () => {
  // Verifies all 6 event types can be constructed and are properly shaped
  test("all event types are constructible", () => {
    const events: GuildHallEvent[] = [
      { type: "session", meetingId: "m", sessionId: "s", worker: "w" },
      { type: "text_delta", text: "hello" },
      { type: "tool_use", name: "Read", input: { path: "/foo" } },
      { type: "tool_result", name: "Read", output: "contents" },
      { type: "turn_end", cost: 0.01 },
      { type: "turn_end" }, // cost is optional
      { type: "error", reason: "something went wrong" },
    ];

    expect(events).toHaveLength(7);
    // Verify each has a type field
    for (const event of events) {
      expect(event.type).toBeDefined();
    }
  });
});
