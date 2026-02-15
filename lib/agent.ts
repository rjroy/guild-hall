/**
 * Agent SDK Integration Layer
 *
 * Verification spike findings from @anthropic-ai/claude-agent-sdk@0.2.39
 * (claudeCodeVersion: "2.1.39"). All findings sourced directly from the
 * package's sdk.d.ts type definitions.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * Q1: IMPORTS / TOP-LEVEL API
 * ═══════════════════════════════════════════════════════════════════════
 *
 * The package exports a single top-level function `query()` plus types
 * and helpers. Key exports:
 *
 *   import { query, tool, createSdkMcpServer, AbortError } from "@anthropic-ai/claude-agent-sdk";
 *   import type {
 *     Query, Options, SDKMessage, SDKSystemMessage,
 *     SDKAssistantMessage, SDKPartialAssistantMessage,
 *     SDKResultMessage, SDKResultSuccess, SDKResultError,
 *     SDKStatusMessage, SDKToolProgressMessage, SDKToolUseSummaryMessage,
 *     SDKUserMessage, SDKHookStartedMessage, SDKHookProgressMessage,
 *     SDKHookResponseMessage, SDKAuthStatusMessage, SDKTaskNotificationMessage,
 *     SDKFilesPersistedEvent, SDKCompactBoundaryMessage,
 *     McpStdioServerConfig, McpSSEServerConfig, McpHttpServerConfig,
 *     McpSdkServerConfig, McpSdkServerConfigWithInstance, McpServerConfig,
 *     PermissionMode, HookEvent, HookCallback, HookCallbackMatcher,
 *     AgentDefinition, SdkMcpToolDefinition,
 *   } from "@anthropic-ai/claude-agent-sdk";
 *
 * There is NO class-based client in the TypeScript SDK. The Python SDK has
 * ClaudeSDKClient, but TypeScript uses `query()` exclusively.
 *
 * V2 unstable API also exports:
 *   - unstable_v2_createSession(options): SDKSession
 *   - unstable_v2_prompt(message, options): Promise<SDKResultMessage>
 *   - unstable_v2_resumeSession(sessionId, options): SDKSession
 * These are marked @alpha and UNSTABLE. Not suitable for production use.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * Q2: query() SIGNATURE
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   function query(params: {
 *     prompt: string | AsyncIterable<SDKUserMessage>;
 *     options?: Options;
 *   }): Query;
 *
 * The `Options` type contains ALL configuration. Key fields for Guild Hall:
 *
 *   options.cwd               - string, working directory (defaults to process.cwd())
 *   options.systemPrompt      - string | { type: 'preset', preset: 'claude_code', append?: string }
 *   options.permissionMode    - 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'delegate' | 'dontAsk'
 *   options.mcpServers        - Record<string, McpServerConfig>   // keyed by server name
 *   options.resume            - string (session ID to resume)
 *   options.sessionId         - string (custom session ID, must be UUID)
 *   options.forkSession       - boolean (fork on resume)
 *   options.continue          - boolean (continue most recent session in cwd)
 *   options.abortController   - AbortController (for cancellation)
 *   options.model             - string (e.g., 'claude-sonnet-4-5-20250929')
 *   options.maxTurns          - number
 *   options.maxBudgetUsd      - number
 *   options.hooks             - Partial<Record<HookEvent, HookCallbackMatcher[]>>
 *   options.agents            - Record<string, AgentDefinition>
 *   options.settingSources    - ('user' | 'project' | 'local')[]
 *   options.includePartialMessages - boolean (enables SDKPartialAssistantMessage events)
 *   options.persistSession    - boolean (default true; false disables session disk persistence)
 *   options.env               - Record<string, string | undefined>
 *   options.allowedTools      - string[] (auto-allowed without permission prompt)
 *   options.disallowedTools   - string[]
 *   options.tools             - string[] | { type: 'preset', preset: 'claude_code' }
 *   options.canUseTool        - CanUseTool callback
 *   options.outputFormat      - { type: 'json_schema', schema: Record<string, unknown> }
 *   options.thinking          - { type: 'adaptive' } | { type: 'enabled', budgetTokens: number } | { type: 'disabled' }
 *   options.effort            - 'low' | 'medium' | 'high' | 'max'
 *   options.plugins           - { type: 'local', path: string }[]
 *   options.sandbox           - SandboxSettings
 *
 * DIVERGENCE FROM PLAN:
 *   - Plan assumed mcpServers as an array. Actual API uses Record<string, McpServerConfig>
 *     where keys are server names. MCPManager.getServerConfigs() returns an array,
 *     so we need to convert to a Record keyed by member name.
 *   - Plan did not account for `includePartialMessages` option, which is required to
 *     receive streaming text events (SDKPartialAssistantMessage).
 *
 * ═══════════════════════════════════════════════════════════════════════
 * Q3: STREAMING / EVENT TYPES
 * ═══════════════════════════════════════════════════════════════════════
 *
 * query() returns a Query interface that extends AsyncGenerator<SDKMessage, void>.
 * You consume it with `for await (const message of queryResult)`.
 *
 * SDKMessage is a discriminated union on the `type` field:
 *
 *   type SDKMessage =
 *     | SDKAssistantMessage        // type: 'assistant'      - Complete assistant message with BetaMessage
 *     | SDKUserMessage             // type: 'user'           - User message (echoed back)
 *     | SDKUserMessageReplay       // type: 'user'           - Replayed user message (isReplay: true)
 *     | SDKResultMessage           // type: 'result'         - Final result (success or error)
 *     | SDKSystemMessage           // type: 'system'         - System messages (init, status, hooks, etc.)
 *     | SDKPartialAssistantMessage // type: 'stream_event'   - Streaming chunks (requires includePartialMessages)
 *     | SDKCompactBoundaryMessage  // type: 'system'         - Context compaction boundary
 *     | SDKStatusMessage           // type: 'system'         - Status changes (compacting, etc.)
 *     | SDKHookStartedMessage      // type: 'system'         - Hook lifecycle
 *     | SDKHookProgressMessage     // type: 'system'         - Hook progress
 *     | SDKHookResponseMessage     // type: 'system'         - Hook completed
 *     | SDKToolProgressMessage     // type: 'tool_progress'  - Tool execution progress
 *     | SDKAuthStatusMessage       // type: 'auth_status'    - Authentication state
 *     | SDKTaskNotificationMessage // type: 'system'         - Subagent task completed/failed
 *     | SDKFilesPersistedEvent     // type: 'system'         - Files persisted event
 *     | SDKToolUseSummaryMessage   // type: 'tool_use_summary' - Summary of preceding tool uses
 *
 * For system messages, further discriminated on `subtype`:
 *   'init' | 'status' | 'compact_boundary' | 'hook_started' | 'hook_progress' |
 *   'hook_response' | 'task_notification' | 'files_persisted'
 *
 * SDKPartialAssistantMessage wraps BetaRawMessageStreamEvent from the Anthropic SDK.
 * That includes content_block_start, content_block_delta, content_block_stop, etc.
 * The text deltas are inside event.delta.text for text content blocks.
 *
 * SDKAssistantMessage contains a full BetaMessage which has a `content` array of
 * content blocks (text, tool_use, tool_result, thinking). Tool use blocks contain
 * `type: 'tool_use'`, `id`, `name`, and `input`.
 *
 * SDKResultMessage is discriminated on `subtype`:
 *   - 'success': has `result: string`, `total_cost_usd`, `usage`, `session_id`
 *   - 'error_during_execution' | 'error_max_turns' | 'error_max_budget_usd' |
 *     'error_max_structured_output_retries': has `errors: string[]`, `total_cost_usd`
 *
 * MAPPING TO OUR SSE EVENTS:
 *
 *   SDK Message Type                 -> Our SSE Event
 *   ────────────────────────────────────────────────────────────────
 *   SDKSystemMessage (subtype init)  -> processing (agent started)
 *   SDKPartialAssistantMessage       -> assistant_text (parse delta.text from event)
 *   SDKAssistantMessage (tool_use)   -> tool_use (for each tool_use content block)
 *   SDKAssistantMessage (text)       -> (ignored, text already delivered via stream events)
 *   SDKToolProgressMessage           -> (currently no direct map; could extend tool_use)
 *   SDKToolUseSummaryMessage         -> tool_result (summary of tool execution)
 *   SDKStatusMessage                 -> status_change
 *   SDKResultMessage (success)       -> done
 *   SDKResultMessage (error_*)       -> error + done
 *   SDKAuthStatusMessage (error)     -> error (authentication failure)
 *
 *   Note: With includePartialMessages: true, text arrives via stream events
 *   (SDKPartialAssistantMessage). The complete SDKAssistantMessage also
 *   contains the full text, but we skip it to avoid duplication. Tool use
 *   blocks only appear in complete messages, so we extract those there.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * Q4: SESSION ID CAPTURE
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Every SDKMessage includes `session_id: string` and `uuid: UUID`.
 *
 * The session ID is available from the FIRST message emitted by the generator.
 * Specifically, the init system message (type: 'system', subtype: 'init') contains
 * `session_id`. But every subsequent message also carries `session_id`.
 *
 * SDKResultMessage (type: 'result') also contains `session_id`.
 *
 * Strategy: Capture session_id from the first message yielded by the generator.
 * No special init-message parsing required, but the init message gives the richest
 * context (model, tools, mcp_servers, permissionMode, etc.).
 *
 * ═══════════════════════════════════════════════════════════════════════
 * Q5: RESUME
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Resume parameter: `options.resume` (string, the session ID).
 *
 *   query({
 *     prompt: "Continue working on...",
 *     options: { resume: previousSessionId }
 *   })
 *
 * Additional resume-related options:
 *   - `options.forkSession`: boolean - Fork to new session ID on resume
 *   - `options.continue`: boolean - Continue most recent session in cwd
 *     (mutually exclusive with `resume`)
 *   - `options.resumeSessionAt`: string - Resume from specific message UUID
 *
 * ERROR ON EXPIRED SESSION:
 * The type definitions do not export a specific "session expired" error type.
 * The SDK exports only `AbortError extends Error`. Session expiration likely
 * surfaces as a generic Error or through SDKResultError with
 * subtype 'error_during_execution' and a message in the `errors` array.
 *
 * For detection: catch errors from the generator and check for session-related
 * error messages in the string content. Also check SDKResultError.errors array.
 * This needs runtime testing with an actual expired session to confirm the exact
 * error shape.
 *
 * DIVERGENCE FROM PLAN:
 *   - Plan assumed a specific error type for expired sessions. The SDK does not
 *     export one. We will need to detect expiration via error message matching.
 *   - This is a runtime behavior question that types alone cannot answer.
 *     Task 010 should include a manual test with a real expired session.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * Q6: INTERRUPT / STOP
 * ═══════════════════════════════════════════════════════════════════════
 *
 * The Query interface has an `interrupt()` method:
 *
 *   interface Query extends AsyncGenerator<SDKMessage, void> {
 *     interrupt(): Promise<void>;
 *     close(): void;
 *     setPermissionMode(mode: PermissionMode): Promise<void>;
 *     setModel(model?: string): Promise<void>;
 *     setMaxThinkingTokens(maxThinkingTokens: number | null): Promise<void>;
 *     initializationResult(): Promise<SDKControlInitializeResponse>;
 *     supportedCommands(): Promise<SlashCommand[]>;
 *     supportedModels(): Promise<ModelInfo[]>;
 *     mcpServerStatus(): Promise<McpServerStatus[]>;
 *     accountInfo(): Promise<AccountInfo>;
 *     rewindFiles(userMessageId: string, options?: { dryRun?: boolean }): Promise<RewindFilesResult>;
 *     reconnectMcpServer(serverName: string): Promise<void>;
 *     toggleMcpServer(serverName: string, enabled: boolean): Promise<void>;
 *     setMcpServers(servers: Record<string, McpServerConfig>): Promise<McpSetServersResult>;
 *     streamInput(stream: AsyncIterable<SDKUserMessage>): Promise<void>;
 *   }
 *
 * Two mechanisms for stopping:
 *
 * 1. `query.interrupt()`: Graceful interrupt. Returns Promise<void>.
 *    Stops the current turn. The generator should yield remaining messages
 *    and then complete.
 *
 * 2. `query.close()`: Forceful termination. Synchronous (returns void).
 *    Kills the underlying process. No further messages will be received.
 *    "Use this when you need to abort a query that is still running."
 *
 * 3. `options.abortController`: Pass an AbortController at query creation.
 *    Calling abortController.abort() triggers cleanup.
 *
 * For Guild Hall's stop button:
 *   - Use `interrupt()` first (graceful stop, lets agent wrap up)
 *   - Fall back to `close()` if interrupt hangs (with a timeout)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * Q7: MCP SERVER CONFIG
 * ═══════════════════════════════════════════════════════════════════════
 *
 * The SDK accepts MCP servers via `options.mcpServers`:
 *   Record<string, McpServerConfig>
 *
 * McpServerConfig is a union:
 *
 *   type McpServerConfig =
 *     | McpStdioServerConfig          // stdio (local process)
 *     | McpSSEServerConfig            // SSE (remote HTTP)
 *     | McpHttpServerConfig           // HTTP (remote)
 *     | McpSdkServerConfigWithInstance // in-process SDK server
 *
 * For stdio (our Guild Members):
 *
 *   type McpStdioServerConfig = {
 *     type?: 'stdio';      // OPTIONAL, defaults to stdio if omitted
 *     command: string;      // e.g., 'node', 'python'
 *     args?: string[];      // command arguments
 *     env?: Record<string, string>;  // environment variables
 *   };
 *
 * For SSE:
 *   type McpSSEServerConfig = { type: 'sse'; url: string; headers?: Record<string, string>; };
 *
 * For HTTP:
 *   type McpHttpServerConfig = { type: 'http'; url: string; headers?: Record<string, string>; };
 *
 * For in-process SDK servers:
 *   type McpSdkServerConfigWithInstance = { type: 'sdk'; name: string; instance: McpServer; };
 *
 * USAGE EXAMPLE for Guild Hall:
 *
 *   const mcpServers: Record<string, McpStdioServerConfig> = {};
 *   for (const member of guildMembers) {
 *     mcpServers[member.name] = {
 *       command: member.mcp.command,
 *       args: member.mcp.args,
 *       env: member.mcp.env,
 *     };
 *   }
 *   const q = query({ prompt: "...", options: { mcpServers } });
 *
 * DIVERGENCE FROM PLAN:
 *   - MCPManager.getServerConfigs() returns MCPServerConfig[] (our own type).
 *     The SDK expects Record<string, McpServerConfig> (keyed by name).
 *     Either change getServerConfigs() to return a Record, or convert at the
 *     call site. I recommend changing getServerConfigs() for task 008.
 *   - Our MCPServerConfig interface in mcp-manager.ts is compatible with
 *     McpStdioServerConfig since `type` is optional and defaults to 'stdio'.
 *     The field names match: command, args, env.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * SUMMARY OF DIVERGENCES (impact on tasks 008-011)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * TASK 008 (Basic query flow):
 *   - mcpServers must be Record<string, Config>, not Config[].
 *     Change MCPManager.getServerConfigs() to return Record<string, MCPServerConfig>
 *     or add a getServerConfigMap(memberNames) method.
 *   - Must pass `includePartialMessages: true` to get streaming text events.
 *   - Session ID is on every message, not just init. Capture from first message.
 *
 * TASK 009 (SSE streaming):
 *   - Streaming text comes from SDKPartialAssistantMessage (type: 'stream_event'),
 *     not from SDKAssistantMessage. The stream_event wraps BetaRawMessageStreamEvent.
 *     Need to parse content_block_delta events for text chunks.
 *   - Tool use comes from SDKAssistantMessage.message.content blocks of type 'tool_use'.
 *   - Tool results are inside the assistant message content after the tool runs.
 *     There is no separate SDK-level "tool_result" message. We extract from content blocks.
 *   - SDKToolProgressMessage (type: 'tool_progress') provides elapsed time during
 *     tool execution. Could map to a UI indicator.
 *   - SDKToolUseSummaryMessage (type: 'tool_use_summary') summarizes preceding tool uses.
 *
 * TASK 010 (Session resume):
 *   - Resume parameter is `options.resume` (string). Confirmed.
 *   - No specific error type for expired sessions. Need runtime testing.
 *     Build detection around error message string matching or SDKResultError.errors.
 *
 * TASK 011 (Stop/interrupt):
 *   - interrupt() method on Query interface. Confirmed.
 *   - close() also available for forceful termination. Confirmed.
 *   - abortController on Options also works for cancellation.
 *   - Recommend: interrupt() first, close() as timeout fallback.
 */

import type {
  Query,
  Options,
  SDKMessage,
  SDKSystemMessage,
  SDKAssistantMessage,
  SDKPartialAssistantMessage,
  SDKResultMessage,
  SDKResultSuccess,
  SDKResultError,
  SDKStatusMessage,
  SDKToolProgressMessage,
  SDKToolUseSummaryMessage,
  McpStdioServerConfig,
  McpServerConfig,
  PermissionMode,
} from "@anthropic-ai/claude-agent-sdk";

import type { SSEEvent } from "./types";

// -- Structural types for Anthropic SDK internals --
//
// BetaMessage and BetaRawMessageStreamEvent come from @anthropic-ai/sdk, which
// is a transitive dependency of the agent SDK. We only have the agent SDK's
// .d.ts references to these types, so we define structural accessors here.
// These match the known Anthropic API shapes.

/** A content block in BetaMessage.content */
type ContentBlock = {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
};

/** Structural type for BetaRawMessageStreamEvent delta payloads */
type StreamEventDelta = {
  type?: string;
  text?: string;
};

/** Structural accessor for the stream event's nested shape */
type StreamEventPayload = {
  type: string;
  delta?: StreamEventDelta;
};

/** Structural accessor for BetaMessage */
type MessagePayload = {
  content: ContentBlock[];
};

// Re-export SDK types that downstream code will need
export type { Query, Options, SDKMessage, PermissionMode };

// -- Agent query options (Guild Hall's view of what a query needs) --

export type AgentQueryOptions = {
  /** The user's message */
  prompt: string;
  /** MCP servers keyed by member name */
  mcpServers: Record<string, McpServerConfig>;
  /** Working directory for the agent session */
  cwd: string;
  /** System prompt (includes context file instructions) */
  systemPrompt: string;
  /** Permission mode for the session */
  permissionMode: PermissionMode;
  /** SDK session ID to resume (undefined for new sessions) */
  resumeSessionId?: string;
};

// -- Query handle for tracking running queries --

export type QueryHandle = {
  query: Query;
  sessionId: string;
  abortController: AbortController;
  /** Resolves when the query iteration completes. Used by AgentManager for cleanup. */
  _iterationPromise?: Promise<void>;
  /** SSE events accumulated during iteration, for persistence by AgentManager. */
  _accumulatedEvents: SSEEvent[];
};

// -- Event bus types --

export type EventCallback = (event: SSEEvent) => void;

export type EventBus = {
  subscribe(sessionId: string, callback: EventCallback): () => void;
  emit(sessionId: string, event: SSEEvent): void;
};

// -- SDK message type guards --

export function isSystemInitMessage(
  msg: SDKMessage,
): msg is SDKSystemMessage & { subtype: "init" } {
  return msg.type === "system" && "subtype" in msg && msg.subtype === "init";
}

export function isAssistantMessage(
  msg: SDKMessage,
): msg is SDKAssistantMessage {
  return msg.type === "assistant";
}

export function isStreamEvent(
  msg: SDKMessage,
): msg is SDKPartialAssistantMessage {
  return msg.type === "stream_event";
}

export function isResultMessage(msg: SDKMessage): msg is SDKResultMessage {
  return msg.type === "result";
}

export function isSuccessResult(msg: SDKMessage): msg is SDKResultSuccess {
  return msg.type === "result" && "subtype" in msg && msg.subtype === "success";
}

export function isErrorResult(msg: SDKMessage): msg is SDKResultError {
  return (
    msg.type === "result" && "subtype" in msg && msg.subtype !== "success"
  );
}

export function isStatusMessage(msg: SDKMessage): msg is SDKStatusMessage {
  return (
    msg.type === "system" && "subtype" in msg && msg.subtype === "status"
  );
}

export function isToolProgressMessage(
  msg: SDKMessage,
): msg is SDKToolProgressMessage {
  return msg.type === "tool_progress";
}

export function isToolUseSummaryMessage(
  msg: SDKMessage,
): msg is SDKToolUseSummaryMessage {
  return msg.type === "tool_use_summary";
}

// -- SDK event to SSE event translation --

/**
 * Translate an SDK message to zero or more SSE events.
 *
 * A single SDK message can produce multiple SSE events (e.g., an assistant
 * message with both text and tool_use content blocks produces separate events
 * for each). Returns an empty array for SDK messages we don't surface to clients.
 */
export function translateSdkMessage(msg: SDKMessage): SSEEvent[] {
  // System init -> processing
  if (isSystemInitMessage(msg)) {
    return [{ type: "processing" }];
  }

  // Streaming text chunks -> assistant_text
  if (isStreamEvent(msg)) {
    return translateStreamEvent(msg);
  }

  // Complete assistant message -> tool_use and/or assistant_text events
  if (isAssistantMessage(msg)) {
    return translateAssistantMessage(msg);
  }

  // Success result -> done
  if (isSuccessResult(msg)) {
    return [{ type: "done" }];
  }

  // Error result -> error + done
  if (isErrorResult(msg)) {
    const errorMsg = msg.errors.join("; ") || `Agent error: ${msg.subtype}`;
    return [
      { type: "error", message: errorMsg, recoverable: false },
      { type: "done" },
    ];
  }

  // Tool use summary -> tool_result (maps summary to result event)
  if (isToolUseSummaryMessage(msg)) {
    // SDKToolUseSummaryMessage has preceding_tool_use_ids, use the first as toolUseId
    const toolUseId = msg.preceding_tool_use_ids[0] ?? "unknown";
    return [
      {
        type: "tool_result",
        toolUseId,
        result: { summary: msg.summary },
      },
    ];
  }

  // All other message types (user, hook, auth, compact, tool_progress, etc.)
  // are not surfaced to the client.
  return [];
}

/**
 * Extract text from a streaming event. The event wraps a BetaRawMessageStreamEvent.
 * We look for content_block_delta events where the delta has type text_delta.
 */
function translateStreamEvent(msg: SDKPartialAssistantMessage): SSEEvent[] {
  // Access the event payload structurally since BetaRawMessageStreamEvent
  // is from @anthropic-ai/sdk which we don't import directly.
  const event = msg.event as unknown as StreamEventPayload;

  if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
    return [{ type: "assistant_text", text: event.delta.text }];
  }

  return [];
}

/**
 * Extract tool_use blocks from a complete assistant message.
 *
 * Text blocks are NOT emitted here. When includePartialMessages is true
 * (which Guild Hall always sets), text arrives via SDKPartialAssistantMessage
 * stream events and is handled by translateStreamEvent. Emitting text from
 * the complete message too would double the content in both the live stream
 * and persisted messages.
 */
function translateAssistantMessage(msg: SDKAssistantMessage): SSEEvent[] {
  const events: SSEEvent[] = [];
  const message = msg.message as unknown as MessagePayload;

  if (!message?.content || !Array.isArray(message.content)) {
    return events;
  }

  for (const block of message.content) {
    if (block.type === "tool_use" && block.id && block.name) {
      events.push({
        type: "tool_use",
        toolName: block.name,
        toolInput: block.input ?? {},
        toolUseId: block.id,
      });
    }
    // Text blocks handled by stream events; thinking blocks ignored
  }

  return events;
}

// -- Core query function --

/** Injectable query function matching the SDK's query() signature. */
export type QueryFn = (params: { prompt: string; options?: Options }) => Query;

/**
 * Start or resume an agent query.
 *
 * Calls the provided queryFn (injected for testability) with the configured
 * options, starts iterating the async generator in the background, translates
 * SDK messages to SSE events, and emits them through the event bus. Captures
 * the SDK session ID from the first message.
 *
 * Returns a QueryHandle immediately. The iteration runs in the background
 * (not awaited), so the caller can track the handle and abort if needed.
 * The returned promise resolves once the query object is created, not when
 * iteration finishes.
 */
export function startAgentQuery(
  sessionId: string,
  options: AgentQueryOptions,
  eventBus: EventBus,
  onSessionId: (id: string) => void,
  queryFn: QueryFn,
): QueryHandle {
  const abortController = new AbortController();

  const sdkOptions: Options = {
    mcpServers: options.mcpServers,
    cwd: options.cwd,
    systemPrompt: options.systemPrompt,
    permissionMode: options.permissionMode,
    abortController,
    includePartialMessages: true,
  };

  if (options.resumeSessionId) {
    sdkOptions.resume = options.resumeSessionId;
  }

  const q = queryFn({ prompt: options.prompt, options: sdkOptions });

  const handle: QueryHandle = {
    query: q,
    sessionId: "",
    abortController,
    _accumulatedEvents: [],
  };

  // Start consuming the generator in the background. The iteration promise
  // is fire-and-forget from the caller's perspective; the handle allows
  // tracking and interruption.
  const iterationPromise = iterateQuery(
    sessionId, q, eventBus, handle, onSessionId,
  );

  // Store the iteration promise on the handle so callers can await completion
  // if needed (e.g., for cleanup after the query finishes).
  handle._iterationPromise = iterationPromise;

  return handle;
}

/**
 * Iterate the SDK query generator, translating messages and emitting events.
 * Captures the SDK session_id from the first message for resume support.
 *
 * Events are emitted to the event bus using the Guild Hall session ID
 * (not the SDK session ID), since that's what subscribers use.
 */
async function iterateQuery(
  sessionId: string,
  q: Query,
  eventBus: EventBus,
  handle: QueryHandle,
  onSessionId: (id: string) => void,
): Promise<void> {
  let sessionIdCaptured = false;
  let emittedDone = false;

  try {
    for await (const msg of q) {
      // Capture SDK session_id from the first message (for resume support)
      if (!sessionIdCaptured && "session_id" in msg) {
        const sdkSessionId = (msg as { session_id: string }).session_id;
        handle.sessionId = sdkSessionId;
        onSessionId(sdkSessionId);
        sessionIdCaptured = true;
      }

      const events = translateSdkMessage(msg);
      for (const event of events) {
        eventBus.emit(sessionId, event);
        handle._accumulatedEvents.push(event);
        if (event.type === "done") {
          emittedDone = true;
        }
      }
    }
  } catch (err) {
    // Emit error event for unexpected failures during iteration
    const message = err instanceof Error ? err.message : String(err);
    const errorEvent: SSEEvent = {
      type: "error",
      message,
      recoverable: false,
    };
    eventBus.emit(sessionId, errorEvent);
    handle._accumulatedEvents.push(errorEvent);
  }

  // Ensure we always emit a done event when iteration completes
  if (!emittedDone) {
    const doneEvent: SSEEvent = { type: "done" };
    eventBus.emit(sessionId, doneEvent);
    handle._accumulatedEvents.push(doneEvent);
  }
}

// -- Event bus --

/**
 * Create an event bus for routing SSE events to subscribers.
 */
export function createEventBus(): EventBus {
  const subscribers = new Map<string, Set<EventCallback>>();

  return {
    subscribe(sessionId: string, callback: EventCallback): () => void {
      let subs = subscribers.get(sessionId);
      if (!subs) {
        subs = new Set();
        subscribers.set(sessionId, subs);
      }
      subs.add(callback);

      return () => {
        subs.delete(callback);
        if (subs.size === 0) {
          subscribers.delete(sessionId);
        }
      };
    },

    emit(sessionId: string, event: SSEEvent): void {
      const subs = subscribers.get(sessionId);
      if (!subs) return;
      for (const callback of subs) {
        callback(event);
      }
    },
  };
}
