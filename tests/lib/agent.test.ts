import { describe, expect, it } from "bun:test";

import {
  translateSdkMessage,
  startAgentQuery,
  createEventBus,
  isSystemInitMessage,
  isAssistantMessage,
  isStreamEvent,
  isResultMessage,
  isSuccessResult,
  isErrorResult,
  isStatusMessage,
  isToolProgressMessage,
  isToolUseSummaryMessage,
} from "@/lib/agent";
import type {
  EventBus,
  QueryFn,
} from "@/lib/agent";
import type { SSEEvent } from "@/lib/types";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

// -- Mock SDK message factories --

// The SDK message types reference BetaMessage and BetaRawMessageStreamEvent
// from @anthropic-ai/sdk. For tests, we construct structurally compatible
// objects and cast to SDKMessage.

function makeInitMessage(sessionId = "sdk-session-1"): SDKMessage {
  return {
    type: "system",
    subtype: "init",
    session_id: sessionId,
    uuid: "00000000-0000-0000-0000-000000000001",
    agents: [],
    apiKeySource: "user",
    betas: [],
    claude_code_version: "2.1.39",
    cwd: "/tmp",
    tools: [],
    mcp_servers: [],
    model: "claude-sonnet-4-5-20250929",
    permissionMode: "bypassPermissions",
  } as unknown as SDKMessage;
}

function makeStreamTextDelta(
  text: string,
  sessionId = "sdk-session-1",
): SDKMessage {
  return {
    type: "stream_event",
    event: {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text },
    },
    parent_tool_use_id: null,
    uuid: "00000000-0000-0000-0000-000000000002",
    session_id: sessionId,
  } as unknown as SDKMessage;
}

function makeStreamNonTextDelta(sessionId = "sdk-session-1"): SDKMessage {
  return {
    type: "stream_event",
    event: {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    },
    parent_tool_use_id: null,
    uuid: "00000000-0000-0000-0000-000000000003",
    session_id: sessionId,
  } as unknown as SDKMessage;
}

function makeAssistantTextMessage(
  text: string,
  sessionId = "sdk-session-1",
): SDKMessage {
  return {
    type: "assistant",
    message: {
      content: [{ type: "text", text }],
    },
    parent_tool_use_id: null,
    uuid: "00000000-0000-0000-0000-000000000004",
    session_id: sessionId,
  } as unknown as SDKMessage;
}

function makeAssistantToolUseMessage(
  tools: Array<{ id: string; name: string; input: Record<string, unknown> }>,
  sessionId = "sdk-session-1",
): SDKMessage {
  return {
    type: "assistant",
    message: {
      content: tools.map((t) => ({
        type: "tool_use",
        id: t.id,
        name: t.name,
        input: t.input,
      })),
    },
    parent_tool_use_id: null,
    uuid: "00000000-0000-0000-0000-000000000005",
    session_id: sessionId,
  } as unknown as SDKMessage;
}

function makeAssistantMixedMessage(
  text: string,
  tool: { id: string; name: string; input: Record<string, unknown> },
  sessionId = "sdk-session-1",
): SDKMessage {
  return {
    type: "assistant",
    message: {
      content: [
        { type: "text", text },
        { type: "tool_use", id: tool.id, name: tool.name, input: tool.input },
      ],
    },
    parent_tool_use_id: null,
    uuid: "00000000-0000-0000-0000-000000000006",
    session_id: sessionId,
  } as unknown as SDKMessage;
}

function makeSuccessResult(sessionId = "sdk-session-1"): SDKMessage {
  return {
    type: "result",
    subtype: "success",
    duration_ms: 1000,
    duration_api_ms: 800,
    is_error: false,
    num_turns: 1,
    result: "Done",
    stop_reason: "end_turn",
    total_cost_usd: 0.01,
    usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    modelUsage: {},
    permission_denials: [],
    uuid: "00000000-0000-0000-0000-000000000007",
    session_id: sessionId,
  } as unknown as SDKMessage;
}

function makeErrorResult(
  errors: string[] = ["Something went wrong"],
  subtype = "error_during_execution",
  sessionId = "sdk-session-1",
): SDKMessage {
  return {
    type: "result",
    subtype,
    duration_ms: 500,
    duration_api_ms: 400,
    is_error: true,
    num_turns: 1,
    total_cost_usd: 0.005,
    usage: { input_tokens: 50, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    modelUsage: {},
    permission_denials: [],
    errors,
    uuid: "00000000-0000-0000-0000-000000000008",
    session_id: sessionId,
  } as unknown as SDKMessage;
}

function makeToolUseSummary(
  summary: string,
  toolUseIds: string[] = ["tool-1"],
  sessionId = "sdk-session-1",
): SDKMessage {
  return {
    type: "tool_use_summary",
    summary,
    preceding_tool_use_ids: toolUseIds,
    uuid: "00000000-0000-0000-0000-000000000009",
    session_id: sessionId,
  } as unknown as SDKMessage;
}

function makeStatusMessage(sessionId = "sdk-session-1"): SDKMessage {
  return {
    type: "system",
    subtype: "status",
    status: "compacting",
    uuid: "00000000-0000-0000-0000-000000000011",
    session_id: sessionId,
  } as unknown as SDKMessage;
}

function makeToolProgressMessage(sessionId = "sdk-session-1"): SDKMessage {
  return {
    type: "tool_progress",
    tool_use_id: "tool-1",
    elapsed_ms: 500,
    uuid: "00000000-0000-0000-0000-000000000012",
    session_id: sessionId,
  } as unknown as SDKMessage;
}

function makeUserMessage(sessionId = "sdk-session-1"): SDKMessage {
  return {
    type: "user",
    message: { role: "user", content: "Hello" },
    uuid: "00000000-0000-0000-0000-000000000010",
    session_id: sessionId,
  } as unknown as SDKMessage;
}

// -- Mock async generator for SDK query --

function createMockQuery(
  messages: SDKMessage[],
): ReturnType<QueryFn> {
  async function* generator() {
    for (const msg of messages) {
      // Wrap in resolved promise to satisfy require-await rule
      yield await Promise.resolve(msg);
    }
  }

  const gen = generator();

  // Add the Query interface methods as stubs
  const queryObj = gen as ReturnType<QueryFn>;
  (queryObj as unknown as Record<string, unknown>).interrupt = () => Promise.resolve();
  (queryObj as unknown as Record<string, unknown>).close = () => {};

  return queryObj;
}

function createMockQueryFn(messages: SDKMessage[]): QueryFn {
  return () => createMockQuery(messages);
}

function createFailingQueryFn(error: Error): QueryFn {
  return () => {
    async function* generator(): AsyncGenerator<SDKMessage> {
      yield await Promise.reject(error);
    }
    const gen = generator();
    (gen as unknown as Record<string, unknown>).interrupt = () => Promise.resolve();
    (gen as unknown as Record<string, unknown>).close = () => {};
    return gen as ReturnType<QueryFn>;
  };
}

// -- Collect SSE events from event bus --

function collectEvents(eventBus: EventBus, sessionId: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  eventBus.subscribe(sessionId, (event) => events.push(event));
  return events;
}

// -- Tests --

describe("type guards", () => {
  it("isSystemInitMessage identifies init messages", () => {
    expect(isSystemInitMessage(makeInitMessage())).toBe(true);
    expect(isSystemInitMessage(makeUserMessage())).toBe(false);
    expect(isSystemInitMessage(makeSuccessResult())).toBe(false);
  });

  it("isAssistantMessage identifies assistant messages", () => {
    expect(isAssistantMessage(makeAssistantTextMessage("hi"))).toBe(true);
    expect(isAssistantMessage(makeUserMessage())).toBe(false);
  });

  it("isStreamEvent identifies stream events", () => {
    expect(isStreamEvent(makeStreamTextDelta("hi"))).toBe(true);
    expect(isStreamEvent(makeUserMessage())).toBe(false);
  });

  it("isResultMessage identifies result messages", () => {
    expect(isResultMessage(makeSuccessResult())).toBe(true);
    expect(isResultMessage(makeErrorResult())).toBe(true);
    expect(isResultMessage(makeUserMessage())).toBe(false);
  });

  it("isSuccessResult identifies success results", () => {
    expect(isSuccessResult(makeSuccessResult())).toBe(true);
    expect(isSuccessResult(makeErrorResult())).toBe(false);
  });

  it("isErrorResult identifies error results", () => {
    expect(isErrorResult(makeErrorResult())).toBe(true);
    expect(isErrorResult(makeSuccessResult())).toBe(false);
  });

  it("isStatusMessage identifies status messages", () => {
    expect(isStatusMessage(makeStatusMessage())).toBe(true);
    expect(isStatusMessage(makeInitMessage())).toBe(false);
    expect(isStatusMessage(makeUserMessage())).toBe(false);
  });

  it("isToolProgressMessage identifies tool progress messages", () => {
    expect(isToolProgressMessage(makeToolProgressMessage())).toBe(true);
    expect(isToolProgressMessage(makeUserMessage())).toBe(false);
  });

  it("isToolUseSummaryMessage identifies tool use summaries", () => {
    expect(isToolUseSummaryMessage(makeToolUseSummary("done"))).toBe(true);
    expect(isToolUseSummaryMessage(makeUserMessage())).toBe(false);
  });
});

describe("translateSdkMessage", () => {
  it("translates system init to processing event", () => {
    const events = translateSdkMessage(makeInitMessage());
    expect(events).toEqual([{ type: "processing" }]);
  });

  it("translates text stream delta to assistant_text event", () => {
    const events = translateSdkMessage(makeStreamTextDelta("Hello "));
    expect(events).toEqual([{ type: "assistant_text", text: "Hello " }]);
  });

  it("returns empty array for non-text stream events", () => {
    const events = translateSdkMessage(makeStreamNonTextDelta());
    expect(events).toEqual([]);
  });

  it("does not emit text from complete assistant message (text comes from stream events)", () => {
    const events = translateSdkMessage(
      makeAssistantTextMessage("Complete response"),
    );
    expect(events).toEqual([]);
  });

  it("translates assistant tool_use message to tool_use events", () => {
    const events = translateSdkMessage(
      makeAssistantToolUseMessage([
        { id: "tool-1", name: "read_file", input: { path: "/tmp/test" } },
        { id: "tool-2", name: "write_file", input: { path: "/tmp/out", content: "data" } },
      ]),
    );
    expect(events).toEqual([
      {
        type: "tool_use",
        toolName: "read_file",
        toolInput: { path: "/tmp/test" },
        toolUseId: "tool-1",
      },
      {
        type: "tool_use",
        toolName: "write_file",
        toolInput: { path: "/tmp/out", content: "data" },
        toolUseId: "tool-2",
      },
    ]);
  });

  it("translates mixed assistant message to only tool_use (text from stream events)", () => {
    const events = translateSdkMessage(
      makeAssistantMixedMessage("Let me read that file", {
        id: "tool-1",
        name: "read_file",
        input: { path: "/tmp/test" },
      }),
    );
    expect(events).toEqual([
      {
        type: "tool_use",
        toolName: "read_file",
        toolInput: { path: "/tmp/test" },
        toolUseId: "tool-1",
      },
    ]);
  });

  it("translates success result to done event", () => {
    const events = translateSdkMessage(makeSuccessResult());
    expect(events).toEqual([{ type: "done" }]);
  });

  it("translates error result to error and done events", () => {
    const events = translateSdkMessage(
      makeErrorResult(["Rate limit exceeded", "Try again later"]),
    );
    expect(events).toEqual([
      {
        type: "error",
        message: "Rate limit exceeded; Try again later",
        recoverable: false,
      },
      { type: "done" },
    ]);
  });

  it("translates error result with empty errors array", () => {
    const events = translateSdkMessage(
      makeErrorResult([], "error_max_turns"),
    );
    expect(events).toEqual([
      {
        type: "error",
        message: "Agent error: error_max_turns",
        recoverable: false,
      },
      { type: "done" },
    ]);
  });

  it("translates tool use summary to tool_result event", () => {
    const events = translateSdkMessage(
      makeToolUseSummary("Read 3 files successfully", ["tool-1", "tool-2"]),
    );
    expect(events).toEqual([
      {
        type: "tool_result",
        toolUseId: "tool-1",
        result: { summary: "Read 3 files successfully" },
      },
    ]);
  });

  it("returns empty array for user messages", () => {
    const events = translateSdkMessage(makeUserMessage());
    expect(events).toEqual([]);
  });

  it("handles assistant message with empty content array", () => {
    const msg = {
      type: "assistant",
      message: { content: [] },
      parent_tool_use_id: null,
      uuid: "00000000-0000-0000-0000-000000000000",
      session_id: "test",
    } as unknown as SDKMessage;
    const events = translateSdkMessage(msg);
    expect(events).toEqual([]);
  });
});

describe("createEventBus", () => {
  it("delivers events to subscribers", () => {
    const bus = createEventBus();
    const events: SSEEvent[] = [];
    bus.subscribe("session-1", (e) => events.push(e));

    bus.emit("session-1", { type: "processing" });
    bus.emit("session-1", { type: "done" });

    expect(events).toEqual([{ type: "processing" }, { type: "done" }]);
  });

  it("delivers events to multiple subscribers", () => {
    const bus = createEventBus();
    const events1: SSEEvent[] = [];
    const events2: SSEEvent[] = [];
    bus.subscribe("session-1", (e) => events1.push(e));
    bus.subscribe("session-1", (e) => events2.push(e));

    bus.emit("session-1", { type: "processing" });

    expect(events1).toHaveLength(1);
    expect(events2).toHaveLength(1);
  });

  it("isolates events by session ID", () => {
    const bus = createEventBus();
    const events1: SSEEvent[] = [];
    const events2: SSEEvent[] = [];
    bus.subscribe("session-1", (e) => events1.push(e));
    bus.subscribe("session-2", (e) => events2.push(e));

    bus.emit("session-1", { type: "processing" });
    bus.emit("session-2", { type: "done" });

    expect(events1).toEqual([{ type: "processing" }]);
    expect(events2).toEqual([{ type: "done" }]);
  });

  it("unsubscribe stops event delivery", () => {
    const bus = createEventBus();
    const events: SSEEvent[] = [];
    const unsub = bus.subscribe("session-1", (e) => events.push(e));

    bus.emit("session-1", { type: "processing" });
    unsub();
    bus.emit("session-1", { type: "done" });

    expect(events).toEqual([{ type: "processing" }]);
  });

  it("does not error when emitting to a session with no subscribers", () => {
    const bus = createEventBus();
    // Should not throw
    bus.emit("nonexistent", { type: "done" });
  });
});

describe("startAgentQuery", () => {
  // Guild Hall session ID used for event bus routing (distinct from SDK session ID)
  const guildSessionId = "guild-session-1";

  it("iterates messages and emits translated SSE events", async () => {
    const bus = createEventBus();
    const sdkSessionId = "sdk-session-abc";

    const queryFn = createMockQueryFn([
      makeInitMessage(sdkSessionId),
      makeStreamTextDelta("Hello ", sdkSessionId),
      makeStreamTextDelta("world!", sdkSessionId),
      makeSuccessResult(sdkSessionId),
    ]);

    // Subscribe with our session ID (not the SDK session ID)
    const events = collectEvents(bus, guildSessionId);
    let capturedId = "";

    const handle = startAgentQuery(
      guildSessionId,
      {
        prompt: "Hi",
        mcpServers: {},
        cwd: "/tmp",
        systemPrompt: "You are helpful.",
        permissionMode: "bypassPermissions",
      },
      bus,
      (id) => { capturedId = id; },
      queryFn,
    );

    // Wait for iteration to complete
    await handle._iterationPromise;

    expect(capturedId).toBe(sdkSessionId);
    expect(handle.sessionId).toBe(sdkSessionId);

    // Verify event sequence: processing, text, text, done
    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toEqual([
      "processing",
      "assistant_text",
      "assistant_text",
      "done",
    ]);
  });

  it("captures SDK session ID from the first message", async () => {
    const bus = createEventBus();
    const sdkSessionId = "captured-session-id";

    const queryFn = createMockQueryFn([
      makeInitMessage(sdkSessionId),
      makeSuccessResult(sdkSessionId),
    ]);

    let capturedId = "";
    const handle = startAgentQuery(
      guildSessionId,
      {
        prompt: "Hi",
        mcpServers: {},
        cwd: "/tmp",
        systemPrompt: "",
        permissionMode: "bypassPermissions",
      },
      bus,
      (id) => { capturedId = id; },
      queryFn,
    );

    await handle._iterationPromise;

    expect(capturedId).toBe(sdkSessionId);
    expect(handle.sessionId).toBe(sdkSessionId);
  });

  it("emits done event even when no result message is yielded", async () => {
    const bus = createEventBus();
    const sdkSessionId = "sdk-session-xyz";

    // Query yields init but no result
    const queryFn = createMockQueryFn([
      makeInitMessage(sdkSessionId),
      makeAssistantTextMessage("partial response", sdkSessionId),
    ]);

    const events = collectEvents(bus, guildSessionId);

    const handle = startAgentQuery(
      guildSessionId,
      {
        prompt: "Hi",
        mcpServers: {},
        cwd: "/tmp",
        systemPrompt: "",
        permissionMode: "bypassPermissions",
      },
      bus,
      () => {},
      queryFn,
    );

    await handle._iterationPromise;

    // Should have processing (from init), then assistant_text,
    // then a done appended by iterateQuery
    const lastEvent = events[events.length - 1];
    expect(lastEvent.type).toBe("done");
  });

  it("emits error and done on generator failure", async () => {
    const bus = createEventBus();

    // Subscribe with our session ID
    const events = collectEvents(bus, guildSessionId);

    const queryFn = createFailingQueryFn(new Error("Connection lost"));

    const handle = startAgentQuery(
      guildSessionId,
      {
        prompt: "Hi",
        mcpServers: {},
        cwd: "/tmp",
        systemPrompt: "",
        permissionMode: "bypassPermissions",
      },
      bus,
      () => {},
      queryFn,
    );

    await handle._iterationPromise;

    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toContain("error");
    expect(eventTypes).toContain("done");

    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    if (errorEvent && errorEvent.type === "error") {
      expect(errorEvent.message).toBe("Connection lost");
      expect(errorEvent.recoverable).toBe(false);
    }
  });

  it("passes resume session ID to SDK options", () => {
    const bus = createEventBus();
    let receivedOptions: Record<string, unknown> | undefined;

    const queryFn: QueryFn = (params) => {
      receivedOptions = params.options as Record<string, unknown>;
      return createMockQuery([makeInitMessage(), makeSuccessResult()]);
    };

    startAgentQuery(
      guildSessionId,
      {
        prompt: "Continue",
        mcpServers: {},
        cwd: "/tmp",
        systemPrompt: "",
        permissionMode: "bypassPermissions",
        resumeSessionId: "previous-session-id",
      },
      bus,
      () => {},
      queryFn,
    );

    expect(receivedOptions).toBeDefined();
    expect(receivedOptions!.resume).toBe("previous-session-id");
    expect(receivedOptions!.includePartialMessages).toBe(true);
  });

  it("does not pass resume when resumeSessionId is undefined", () => {
    const bus = createEventBus();
    let receivedOptions: Record<string, unknown> | undefined;

    const queryFn: QueryFn = (params) => {
      receivedOptions = params.options as Record<string, unknown>;
      return createMockQuery([makeInitMessage(), makeSuccessResult()]);
    };

    startAgentQuery(
      guildSessionId,
      {
        prompt: "Fresh start",
        mcpServers: {},
        cwd: "/tmp",
        systemPrompt: "",
        permissionMode: "bypassPermissions",
      },
      bus,
      () => {},
      queryFn,
    );

    expect(receivedOptions).toBeDefined();
    expect(receivedOptions!.resume).toBeUndefined();
  });

  it("does not emit duplicate done when result message already has done", async () => {
    const bus = createEventBus();
    const sdkSessionId = "sdk-session-dup";

    const queryFn = createMockQueryFn([
      makeInitMessage(sdkSessionId),
      makeSuccessResult(sdkSessionId),
    ]);

    const events = collectEvents(bus, guildSessionId);

    const handle = startAgentQuery(
      guildSessionId,
      {
        prompt: "Hi",
        mcpServers: {},
        cwd: "/tmp",
        systemPrompt: "",
        permissionMode: "bypassPermissions",
      },
      bus,
      () => {},
      queryFn,
    );

    await handle._iterationPromise;

    // Count done events: should be exactly 1
    const doneCount = events.filter((e) => e.type === "done").length;
    expect(doneCount).toBe(1);
  });
});
