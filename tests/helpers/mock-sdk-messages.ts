import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

/**
 * Factories for structurally compatible SDKMessage objects.
 * The SDK message types reference BetaMessage and BetaRawMessageStreamEvent
 * from @anthropic-ai/sdk. These factories construct minimal compatible objects
 * and cast to SDKMessage for test isolation.
 */

export function makeInitMessage(sessionId = "sdk-session-1"): SDKMessage {
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

export function makeStreamTextDelta(
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

export function makeSuccessResult(sessionId = "sdk-session-1"): SDKMessage {
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

export function makeAssistantMessage(
  content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>,
  sessionId = "sdk-session-1",
): SDKMessage {
  return {
    type: "assistant",
    message: { content },
    uuid: "00000000-0000-0000-0000-000000000003",
    session_id: sessionId,
  } as unknown as SDKMessage;
}

export function makeToolUseSummary(
  toolUseIds: string[],
  summary: string,
  sessionId = "sdk-session-1",
): SDKMessage {
  return {
    type: "tool_use_summary",
    preceding_tool_use_ids: toolUseIds,
    summary,
    uuid: "00000000-0000-0000-0000-000000000004",
    session_id: sessionId,
  } as unknown as SDKMessage;
}
