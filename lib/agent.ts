/**
 * Agent SDK Integration Layer
 *
 * Verification spike findings from @anthropic-ai/claude-agent-sdk.
 * Q1-Q7: originally verified against 0.2.39 (claudeCodeVersion: "2.1.39").
 * Q8-Q14: verified against 0.2.45 (claudeCodeVersion: "2.1.45").
 * All findings sourced directly from the package's sdk.d.ts type definitions.
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
 *   options.plugins           - { type: 'local', path: string }[]  // Passed through from AgentQueryOptions.plugins
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
 * Q8: createSdkMcpServer() FUNCTION SIGNATURE (verified against 0.2.45)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Import:
 *   import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
 *
 * Signature:
 *   function createSdkMcpServer(options: CreateSdkMcpServerOptions): McpSdkServerConfigWithInstance;
 *
 *   type CreateSdkMcpServerOptions = {
 *     name: string;
 *     version?: string;
 *     tools?: Array<SdkMcpToolDefinition<any>>;
 *   };
 *
 * The return type `McpSdkServerConfigWithInstance` is:
 *   { type: 'sdk'; name: string; instance: McpServer; }
 *
 * This means `createSdkMcpServer()` returns a value that can be placed
 * directly into the `mcpServers` record passed to `query()`. Usage:
 *
 *   const server = createSdkMcpServer({ name: "worker-internal", tools: [...] });
 *   query({ prompt, options: {
 *     mcpServers: { "worker-internal": server },
 *   }});
 *
 * PLAN CONFIRMATION: The plan's usage pattern in Step 10 is correct:
 *   mcpServers: { "worker-internal": { type: "sdk", name: "worker-internal", instance: internalTools } }
 * However, `createSdkMcpServer` returns the full config object (including
 * `type` and `name`), so the cleaner pattern is:
 *   const internalTools = createSdkMcpServer({ name: "worker-internal", tools: [...] });
 *   mcpServers: { "worker-internal": internalTools }
 *
 * If calls to this server run longer than 60s, set the environment variable
 * CLAUDE_CODE_STREAM_CLOSE_TIMEOUT (per the JSDoc on createSdkMcpServer).
 *
 * ═══════════════════════════════════════════════════════════════════════
 * Q9: tool() HELPER AND ZOD SCHEMAS (verified against 0.2.45)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Import:
 *   import { tool } from "@anthropic-ai/claude-agent-sdk";
 *
 * Signature:
 *   function tool<Schema extends AnyZodRawShape>(
 *     name: string,
 *     description: string,
 *     inputSchema: Schema,
 *     handler: (args: InferShape<Schema>, extra: unknown) => Promise<CallToolResult>,
 *     extras?: { annotations?: ToolAnnotations },
 *   ): SdkMcpToolDefinition<Schema>;
 *
 * The `AnyZodRawShape` type accepts both Zod 3 and Zod 4 raw shapes:
 *   type AnyZodRawShape = ZodRawShape | ZodRawShape_2;
 *
 * `InferShape<Schema>` maps each key's `_output` type, giving the handler
 * fully typed input. The handler receives parsed/validated args, not raw JSON.
 *
 * The `CallToolResult` return type is from `@modelcontextprotocol/sdk/types.js`:
 *   { content: Array<{ type: "text"; text: string }>; isError?: boolean }
 *
 * IMPORTANT: The SDK has `zod` ^4.0.0 as a peerDependency. This project
 * uses Zod 3 (from the existing `zod` package). The `AnyZodRawShape` type
 * accepts both Zod 3 and Zod 4 schemas, so our existing `z.object()` shapes
 * will work. However, the SDK also imports `import { z } from 'zod/v4'` for
 * its internal schema definitions. If there's a conflict, we may need to
 * install `zod@4` as a peer. Verify at integration time.
 *
 * Usage example:
 *   import { z } from "zod";
 *   import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
 *
 *   const updateSummary = tool(
 *     "update_summary",
 *     "Update the running summary of work completed so far",
 *     { summary: z.string() },
 *     async (args) => ({
 *       content: [{ type: "text", text: `Summary updated: ${args.summary}` }],
 *     }),
 *   );
 *
 *   const server = createSdkMcpServer({
 *     name: "worker-internal",
 *     tools: [updateSummary],
 *   });
 *
 * ═══════════════════════════════════════════════════════════════════════
 * Q10: McpSdkServerConfigWithInstance AND PASSING TO query()
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   type McpSdkServerConfigWithInstance = McpSdkServerConfig & {
 *     instance: McpServer;   // from @modelcontextprotocol/sdk/server/mcp.js
 *   };
 *
 *   type McpSdkServerConfig = { type: 'sdk'; name: string; };
 *
 * The `McpServerConfig` union (what `options.mcpServers` values accept):
 *   McpStdioServerConfig | McpSSEServerConfig | McpHttpServerConfig | McpSdkServerConfigWithInstance
 *
 * So in-process SDK servers are passed alongside stdio/HTTP servers in the
 * same `mcpServers` record. The dispatch bridge (Step 3b) creates one entry
 * per worker-capable plugin, and the agent-manager merges them with the
 * existing tool-server configs:
 *
 *   const allServers = {
 *     ...toolServerConfigs,          // from MCPManager (stdio/http)
 *     ...dispatchServerConfigs,      // from dispatch bridge (sdk)
 *   };
 *   query({ prompt, options: { mcpServers: allServers } });
 *
 * PLAN CONFIRMATION: The architecture of per-plugin dispatch MCP servers is
 * compatible with the SDK. Each worker-capable plugin gets one in-process
 * server keyed as `${plugin}-dispatch` in the mcpServers record.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * Q11: TYPED INPUT IN TOOL HANDLERS
 * ═══════════════════════════════════════════════════════════════════════
 *
 * The handler signature is:
 *   (args: InferShape<Schema>, extra: unknown) => Promise<CallToolResult>
 *
 * `InferShape<Schema>` resolves each Zod schema key to its output type:
 *   type InferShape<T extends AnyZodRawShape> = {
 *     [K in keyof T]: T[K] extends { _output: infer O } ? O : never;
 *   } & {};
 *
 * This means handlers receive TYPED input, not raw objects. If the schema
 * declares `{ jobId: z.string() }`, the handler receives `{ jobId: string }`.
 *
 * The `extra` parameter is typed as `unknown`. In MCP SDK, this is the
 * `RequestHandlerExtra` context, but the Agent SDK doesn't expose a typed
 * version. Ignore it unless we need server-level context.
 *
 * PLAN CONFIRMATION: The plan's assumption that handlers receive typed input
 * is correct. No divergence.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * Q12: options.tools vs allowedTools vs disallowedTools (REQ-WD-31)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Three separate fields control tool availability:
 *
 * 1. `options.tools` - Defines the BASE SET of available built-in tools.
 *    Type: `string[] | { type: 'preset'; preset: 'claude_code' }`
 *    - `string[]` - Only these specific built-in tools are available
 *    - `[]` (empty array) - All built-in tools disabled
 *    - `{ type: 'preset', preset: 'claude_code' }` - All default tools
 *    - Not specified / undefined - Assumed SDK default (all tools), but inferred, not documented in JSDoc. Verify at runtime.
 *
 * 2. `options.allowedTools` - Auto-allowed WITHOUT permission prompt.
 *    These tools execute automatically without asking the user. This is
 *    about permission auto-approval, NOT about which tools exist.
 *
 * 3. `options.disallowedTools` - Removes tools from the model's context
 *    entirely. Cannot be used even if otherwise allowed.
 *
 * For REQ-WD-31 (restrict workers to read-only tools):
 *   `tools: ["Read", "Grep", "Glob", "WebSearch", "WebFetch"]`
 *
 * This is the correct approach. Setting `tools` to a specific array limits
 * the built-in tools available to exactly those named tools. The worker will
 * not have access to Bash, Edit, Write, or any other tool not in the list.
 * MCP tools from `mcpServers` are separate and always available.
 *
 * Combined with `permissionMode: "bypassPermissions"`, the worker gets:
 *   - Built-in tools: Read, Grep, Glob, WebSearch, WebFetch (all auto-allowed)
 *   - MCP tools: whatever the worker-internal SDK server provides
 *   - No Bash, Edit, Write, NotebookEdit, or other destructive tools
 *
 * PLAN CONFIRMATION: The plan's `tools: ["Read", "Grep", "Glob", "WebSearch",
 * "WebFetch"]` correctly achieves REQ-WD-31. No divergence.
 *
 * NOTE: `allowedTools` and `disallowedTools` are independent of `tools`.
 * The plan does not use `allowedTools` or `disallowedTools` for workers,
 * which is correct since `bypassPermissions` mode auto-allows everything.
 * `disallowedTools` is not needed when `tools` already restricts the set.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * Q13: AbortController FOR CANCELLATION (verified against 0.2.45)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * The `Options` type explicitly includes:
 *   abortController?: AbortController;
 *
 * JSDoc: "Controller for cancelling the query. When aborted, the query will
 * stop and clean up resources."
 *
 * Three cancellation mechanisms exist:
 *
 * 1. `options.abortController` - Set at query creation time. Calling
 *    `abortController.abort()` triggers cleanup. Best for external callers
 *    that don't hold a reference to the Query object (our case: the cancel
 *    handler has the AbortController but not the Query).
 *
 * 2. `query.interrupt()` - Graceful interrupt (async). Stops current turn.
 *
 * 3. `query.close()` - Forceful termination (sync). Kills process.
 *
 * PLAN CONFIRMATION: The plan's approach of passing AbortController to
 * `spawnWorkerAgent` and retaining it in a `Map<string, AbortController>`
 * for cancellation is correct and supported by the SDK. The cancel handler
 * calls `abortController.abort()` without needing the Query object.
 *
 * This is cleaner than the fallback pattern the plan considered (passing
 * a `onQueryCreated` callback). AbortController is the right mechanism.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * Q14: settingSources FOR ISOLATION (verified against 0.2.45)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * The `Options` type includes:
 *   settingSources?: SettingSource[];
 *
 * Where `SettingSource = 'user' | 'project' | 'local'`.
 *
 * JSDoc: "When omitted or empty, no filesystem settings are loaded (SDK
 * isolation mode). Must include 'project' to load CLAUDE.md files."
 *
 * BEHAVIOR:
 *   - `settingSources: []` - No settings loaded. Full isolation. No CLAUDE.md.
 *   - `settingSources: undefined` (omitted) - Same as empty: no settings.
 *   - `settingSources: ["project"]` - Loads .claude/settings.json and CLAUDE.md
 *   - `settingSources: ["user"]` - Loads ~/.claude/settings.json
 *
 * For worker agents (Step 10):
 *   `settingSources: []` is correct. Workers should not pick up filesystem
 *   settings or CLAUDE.md files from the host project. They get their
 *   context entirely from the system prompt.
 *
 * For the main agent (existing code in lib/agent.ts startAgentQuery):
 *   Currently uses `settingSources: ["user"]`. This loads user-level settings
 *   but NOT project-level CLAUDE.md. This is intentional for Guild Hall since
 *   the agent should use Guild Hall's system prompt, not the user's CLAUDE.md.
 *
 * For memory compaction (Step 9):
 *   `settingSources: []`, `persistSession: false` is correct. Compaction is a
 *   lightweight query that should not load any external settings.
 *
 * PLAN CONFIRMATION: All three uses of settingSources in the plan match the
 * SDK behavior. No divergence.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * NEW IN 0.2.45: CHANGES FROM 0.2.39 (what the header was originally against)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Compared to the 0.2.39 types the existing Q1-Q7 documented:
 *
 * 1. SDKMessage union now includes SDKTaskStartedMessage and SDKRateLimitEvent
 *    (the latter is referenced but not declared in .d.ts, likely an oversight).
 *    Our translateSdkMessage() gracefully ignores unknown message types via the
 *    catch-all `return []`, so no code change is needed.
 *
 * 2. Query interface gained new methods:
 *    - stopTask(taskId: string): Promise<void> - stops a running sub-agent task
 *    - setMcpServers(servers): Promise<McpSetServersResult> - dynamic MCP management
 *    - toggleMcpServer(serverName, enabled): Promise<void>
 *    - reconnectMcpServer(serverName): Promise<void>
 *    These are useful for future features but not needed for worker dispatch.
 *
 * 3. Options gained new fields:
 *    - agent?: string - Named agent for the main thread
 *    - agents?: Record<string, AgentDefinition> - Custom subagent definitions
 *    - betas?: SdkBeta[] - Beta features (context-1m-2025-08-07)
 *    - effort?: 'low' | 'medium' | 'high' | 'max' - Effort control
 *    - thinking?: adaptive/enabled/disabled - Replaces maxThinkingTokens
 *    - plugins?: SdkPluginConfig[] - Plugin loading
 *    - sandbox?: SandboxSettings - Execution sandboxing
 *    - enableFileCheckpointing?: boolean
 *    - persistSession?: boolean - Already documented in Q2
 *    Workers could use `effort: 'high'` and sandboxing in the future.
 *
 * 4. PermissionMode now includes 'delegate' (restricts to Teammate/Task tools).
 *    Not relevant for workers.
 *
 * 5. zod is now a peerDependency at ^4.0.0, up from the Zod 3 used internally.
 *    The SDK accepts both Zod 3 and Zod 4 schemas (AnyZodRawShape union).
 *    See Q9 for implications.
 *
 * No breaking changes detected that affect existing Guild Hall code or the
 * worker dispatch plan.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * SUMMARY OF DIVERGENCES (impact on worker dispatch tasks)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ZERO DIVERGENCES FOUND. The plan's assumptions about:
 * - createSdkMcpServer() signature and usage (Step 3b, 8) -- CONFIRMED
 * - tool() helper with Zod schemas (Step 3b, 8) -- CONFIRMED
 * - McpSdkServerConfigWithInstance in mcpServers record (Step 3b, 10) -- CONFIRMED
 * - Typed handler input (Step 8) -- CONFIRMED
 * - tools option for built-in tool restriction (Step 10) -- CONFIRMED
 * - AbortController for cancellation (Step 10) -- CONFIRMED
 * - settingSources: [] for isolation (Step 10) -- CONFIRMED
 *
 * All match the actual 0.2.45 API. Proceed with implementation as planned.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * SUMMARY OF DIVERGENCES FROM ORIGINAL Q1-Q7 (impact on Phase 1 code)
 * NOTE: This file is ~1030 lines, exceeding the 800-line heuristic in
 * code-quality.md. The header comment block (~620 lines) is the single
 * source of truth for Agent SDK API verification findings, following the
 * research-then-build pattern that caught 5 API divergences in Phase 1.
 * Splitting the header into a separate file would break co-location with
 * the code it documents. The implementation below the header is ~400
 * lines, well within limits.
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
  /** Claude Code plugins to load (plugin-only and hybrid members) */
  plugins?: { type: "local"; path: string }[];
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
//
// SDKMessage is a discriminated union from the agent SDK whose .d.ts
// re-exports can't be resolved by eslint's type-checker. The type guards
// are correct (narrowing on the `type` discriminant), but eslint sees the
// property accesses as unsafe. Suppress for the entire block.
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

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

/* eslint-enable @typescript-eslint/no-unsafe-member-access */

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
    settingSources: ["user"],
  };

  if (options.resumeSessionId) {
    sdkOptions.resume = options.resumeSessionId;
  }

  if (options.plugins && options.plugins.length > 0) {
    sdkOptions.plugins = options.plugins;
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
