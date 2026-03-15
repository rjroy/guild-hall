---
title: "Commission: Research triage: claude-agent-sdk-ref-typescript"
date: 2026-03-14
status: completed
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Triage the research document `.lore/research/claude-agent-sdk-ref-typescript.md` against the current state of the Guild Hall codebase and its specs.\n\nAnswer three questions:\n\n1. **Was this research used?** Look at the current implementation. Did concepts, patterns, or decisions from this research make it into the codebase? Cite specific files or patterns if so.\n\n2. **Is there still something to learn from it?** Does the research contain insights, patterns, or recommendations that haven't been applied yet but could be valuable going forward?\n\n3. **Is the research invalid given our current direction?** Compare the research's assumptions and recommendations against the specs in `.lore/specs/` and the current implementation. Did we deliberately go a different direction? A research item that's simply \"not yet implemented\" is different from one where we chose the opposite approach.\n\nBased on your answers, classify this research as exactly one of:\n- **FUTURE** — Not yet used, but still relevant and valuable for upcoming work.\n- **PRESENT** — Actively informing current implementation or decisions.\n- **PAST** — No longer of benefit. We either absorbed what we needed or went a different direction.\n\nWrite your classification and reasoning as a note on this commission. Be specific and cite evidence."
dependencies: []
linked_artifacts:
  - .lore/research/claude-agent-sdk-ref-typescript.md

activity_timeline:
  - timestamp: 2026-03-14T21:40:41.675Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-14T21:40:41.676Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-14T21:40:41.721Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-14T21:40:48.923Z
    event: progress_report
    reason: "Reading research document and gathering codebase context for triage."
  - timestamp: 2026-03-14T21:41:25.060Z
    event: progress_report
    reason: "Read research document and core SDK integration files. Now comparing specific SDK patterns used against the research reference."
  - timestamp: 2026-03-14T21:42:07.922Z
    event: progress_report
    reason: "Analysis complete. Compiling findings across all three questions and preparing final classification."
  - timestamp: 2026-03-14T21:42:39.178Z
    event: result_submitted
    reason: "## Classification: PRESENT\n\nThis research is actively informing the current implementation. The core SDK integration layer was built directly against patterns documented in this reference, and it remains the authoritative lookup resource for SDK capabilities.\n\n---\n\n### 1. Was this research used?\n\nYes, extensively. The Guild Hall SDK integration layer reflects this reference across the board.\n\n**Core API (`query()` + `Options`):** The `SdkQueryOptions` type in `daemon/lib/agent-sdk/sdk-runner.ts:41-82` mirrors the documented `Options` type field-for-field: `systemPrompt` (preset form with `append`), `permissionMode`, `mcpServers`, `allowedTools`, `tools` (preset form), `plugins`, `settingSources`, `cwd`, `maxTurns`, `maxBudgetUsd`, `abortController`, `model`, `resume`, `env`, `sandbox`, `canUseTool`, `includePartialMessages`. This isn't accidental similarity. The type is a deliberately narrowed projection of the SDK's `Options`.\n\n**MCP tool creation (`tool()` + `createSdkMcpServer()`):** Used in every toolbox: `daemon/services/base-toolbox.ts:149-183`, `daemon/services/commission/toolbox.ts:276-308`, `daemon/services/meeting/toolbox.ts`, `daemon/services/manager/toolbox.ts`, `daemon/services/mail/toolbox.ts`, `packages/guild-hall-email/index.ts`. All follow the documented pattern: Zod schema, handler returning `CallToolResult`.\n\n**SDK message types:** The event translator (`daemon/lib/agent-sdk/event-translator.ts`) handles every documented message type: `SDKSystemMessage` (init subtype, line 100-116), `SDKPartialAssistantMessage`/`stream_event` (content_block_delta and content_block_start, lines 120-153), `SDKAssistantMessage` (lines 158-172, deliberately skipped to avoid double-data), `SDKUserMessage` with tool_result blocks (lines 176-196), `SDKResultMessage` with success and error subtypes (lines 234-259).\n\n**`SandboxSettings`:** `sdk-runner.ts:478-487` constructs sandbox settings matching the documented type shape: `enabled`, `autoAllowBashIfSandboxed`, `allowUnsandboxedCommands`, `network.allowLocalBinding`.\n\n**`CanUseTool` / `PermissionResult`:** `buildCanUseTool` at `sdk-runner.ts:286-322` implements the documented callback signature and return types (`behavior: \"allow\"` with `updatedInput`, `behavior: \"deny\"` with `message`).\n\n**`SdkPluginConfig`:** Domain plugin resolution at `sdk-runner.ts:362-380` builds `{ type: \"local\", path: string }` objects matching the documented type.\n\n**`SettingSource`:** `sdk-runner.ts:514` passes `[\"local\", \"project\", \"user\"]`, all three documented values.\n\n---\n\n### 2. Is there still something to learn from it?\n\nYes, several documented features are unused and relevant to planned or potential work:\n\n- **Structured outputs (`outputFormat`):** Not used anywhere. Could improve briefing generation or commission result parsing by enforcing JSON schema output.\n- **`fallbackModel`:** Not used. Relevant to the local model support feature (REQ-LOCAL series). If a local model is unreachable, a fallback to a cloud model would improve resilience.\n- **`hooks` option (SDK-level hooks):** Not used. Guild Hall has its own EventBus, but SDK hooks (especially `PreCompact`, `Stop`, `SessionEnd`) could feed into the compaction and session lifecycle systems.\n- **`betas` (1M context window):** Not used. Long commissions or meetings could benefit from extended context.\n- **`forkSession`:** Not used. Could be relevant for the mail reader pattern where a session resumes but might benefit from isolation.\n- **`Query` object methods (`interrupt()`, `setModel()`, `setPermissionMode()`, `mcpServerStatus()`):** Not used. The codebase drains the generator directly. `interrupt()` is relevant if the daemon ever needs to cleanly interrupt a running session (currently uses AbortController). `mcpServerStatus()` could improve diagnostics.\n- **V2 interface (`send()`/`receive()`):** Mentioned in the research's opening note. Not explored. Could simplify the multi-turn conversation pattern used in meetings.\n- **Tool input/output type schemas:** The detailed documentation of built-in tool I/O shapes (lines 826-1820) isn't referenced in the codebase. These types would be useful for building type-safe `canUseTool` implementations or SDK hooks that inspect tool inputs/outputs.\n\n---\n\n### 3. Is the research invalid given our current direction?\n\nNo. Nothing in this reference conflicts with the current architecture. The research is a pure API reference, not prescriptive about application architecture. Guild Hall's design decisions (wrapping SDK behind SdkRunnerEvent, translating messages through event-translator, using EventBus instead of SDK hooks, building toolboxes as MCP servers) are all compatible with and supported by the documented API. The codebase uses the SDK as documented; it just doesn't use all of it.\n\n---\n\n### Reasoning\n\nPRESENT, not PAST, because the document is still consulted whenever SDK integration work happens. The toolbox system, event translator, sandbox settings, and canUseTool callback were all built from this reference. The unused features (structured outputs, fallback models, SDK hooks, extended context) are relevant to active or planned features. PRESENT, not FUTURE, because the majority of the document's content is already absorbed into working code. This is a living reference, not a backlog item."
  - timestamp: 2026-03-14T21:42:47.380Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Analysis complete. Compiling findings across all three questions and preparing final classification."
projectName: guild-hall
---
## Classification: PRESENT

This research is actively informing the current implementation. The core SDK integration layer was built directly against patterns documented in this reference, and it remains the authoritative lookup resource for SDK capabilities.

---

### 1. Was this research used?

Yes, extensively. The Guild Hall SDK integration layer reflects this reference across the board.

**Core API (`query()` + `Options`):** The `SdkQueryOptions` type in `daemon/lib/agent-sdk/sdk-runner.ts:41-82` mirrors the documented `Options` type field-for-field: `systemPrompt` (preset form with `append`), `permissionMode`, `mcpServers`, `allowedTools`, `tools` (preset form), `plugins`, `settingSources`, `cwd`, `maxTurns`, `maxBudgetUsd`, `abortController`, `model`, `resume`, `env`, `sandbox`, `canUseTool`, `includePartialMessages`. This isn't accidental similarity. The type is a deliberately narrowed projection of the SDK's `Options`.

**MCP tool creation (`tool()` + `createSdkMcpServer()`):** Used in every toolbox: `daemon/services/base-toolbox.ts:149-183`, `daemon/services/commission/toolbox.ts:276-308`, `daemon/services/meeting/toolbox.ts`, `daemon/services/manager/toolbox.ts`, `daemon/services/mail/toolbox.ts`, `packages/guild-hall-email/index.ts`. All follow the documented pattern: Zod schema, handler returning `CallToolResult`.

**SDK message types:** The event translator (`daemon/lib/agent-sdk/event-translator.ts`) handles every documented message type: `SDKSystemMessage` (init subtype, line 100-116), `SDKPartialAssistantMessage`/`stream_event` (content_block_delta and content_block_start, lines 120-153), `SDKAssistantMessage` (lines 158-172, deliberately skipped to avoid double-data), `SDKUserMessage` with tool_result blocks (lines 176-196), `SDKResultMessage` with success and error subtypes (lines 234-259).

**`SandboxSettings`:** `sdk-runner.ts:478-487` constructs sandbox settings matching the documented type shape: `enabled`, `autoAllowBashIfSandboxed`, `allowUnsandboxedCommands`, `network.allowLocalBinding`.

**`CanUseTool` / `PermissionResult`:** `buildCanUseTool` at `sdk-runner.ts:286-322` implements the documented callback signature and return types (`behavior: "allow"` with `updatedInput`, `behavior: "deny"` with `message`).

**`SdkPluginConfig`:** Domain plugin resolution at `sdk-runner.ts:362-380` builds `{ type: "local", path: string }` objects matching the documented type.

**`SettingSource`:** `sdk-runner.ts:514` passes `["local", "project", "user"]`, all three documented values.

---

### 2. Is there still something to learn from it?

Yes, several documented features are unused and relevant to planned or potential work:

- **Structured outputs (`outputFormat`):** Not used anywhere. Could improve briefing generation or commission result parsing by enforcing JSON schema output.
- **`fallbackModel`:** Not used. Relevant to the local model support feature (REQ-LOCAL series). If a local model is unreachable, a fallback to a cloud model would improve resilience.
- **`hooks` option (SDK-level hooks):** Not used. Guild Hall has its own EventBus, but SDK hooks (especially `PreCompact`, `Stop`, `SessionEnd`) could feed into the compaction and session lifecycle systems.
- **`betas` (1M context window):** Not used. Long commissions or meetings could benefit from extended context.
- **`forkSession`:** Not used. Could be relevant for the mail reader pattern where a session resumes but might benefit from isolation.
- **`Query` object methods (`interrupt()`, `setModel()`, `setPermissionMode()`, `mcpServerStatus()`):** Not used. The codebase drains the generator directly. `interrupt()` is relevant if the daemon ever needs to cleanly interrupt a running session (currently uses AbortController). `mcpServerStatus()` could improve diagnostics.
- **V2 interface (`send()`/`receive()`):** Mentioned in the research's opening note. Not explored. Could simplify the multi-turn conversation pattern used in meetings.
- **Tool input/output type schemas:** The detailed documentation of built-in tool I/O shapes (lines 826-1820) isn't referenced in the codebase. These types would be useful for building type-safe `canUseTool` implementations or SDK hooks that inspect tool inputs/outputs.

---

### 3. Is the research invalid given our current direction?

No. Nothing in this reference conflicts with the current architecture. The research is a pure API reference, not prescriptive about application architecture. Guild Hall's design decisions (wrapping SDK behind SdkRunnerEvent, translating messages through event-translator, using EventBus instead of SDK hooks, building toolboxes as MCP servers) are all compatible with and supported by the documented API. The codebase uses the SDK as documented; it just doesn't use all of it.

---

### Reasoning

PRESENT, not PAST, because the document is still consulted whenever SDK integration work happens. The toolbox system, event translator, sandbox settings, and canUseTool callback were all built from this reference. The unused features (structured outputs, fallback models, SDK hooks, extended context) are relevant to active or planned features. PRESENT, not FUTURE, because the majority of the document's content is already absorbed into working code. This is a living reference, not a backlog item.
