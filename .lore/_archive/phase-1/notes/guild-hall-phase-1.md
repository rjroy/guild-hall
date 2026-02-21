---
title: Implementation notes: guild-hall-phase-1
date: 2026-02-12
status: complete
tags: [implementation, notes, phase-1, frontend, sessions, mcp, agent-sdk]
source: .lore/plans/phase-1/guild-hall-phase-1.md
modules: [guild-hall]
related:
  - .lore/specs/phase-1/guild-hall-phase-1.md
  - .lore/plans/phase-1/guild-hall-phase-1.md
---

# Implementation Notes: Guild Hall Phase I

## Progress
- [x] Phase 1: Scaffold Next.js project with core dependencies
- [x] Phase 2: Define core types and Zod schemas
- [x] Phase 3: Implement plugin discovery and roster API
- [x] Phase 4: MCP server management
- [x] Phase 5: Session storage and API
- [x] Phase 6: Session completion API
- [x] Phase 7: Agent SDK API verification
- [x] Phase 8: Agent basic query flow
- [x] Phase 9: SSE streaming
- [x] Phase 10: Agent session resume
- [x] Phase 11: Agent stop/interrupt
- [x] Phase 12: Direct tool invocation
- [x] Phase 13: Frontend roster
- [x] Phase 14: Frontend board
- [x] Phase 15: Frontend workshop
- [x] Phase 16: Error handling hardening
- [x] Phase 17: Validate against spec

## Log

### Phase 1: Scaffold Next.js project with core dependencies
- Dispatched: create-next-app@latest with App Router, TypeScript, CSS modules. Next.js 16.1.6, React 19.2.3.
- Result: Scaffolding complete. All deps installed (agent-sdk 0.2.39, zod 4.3.6). CLAUDE.md, directories, placeholder pages created.
- Tests: 8/8 validation checks passed (dev server, lint, tsc, CLAUDE.md, directories, gitignore, strict mode, deps).
- Review: Three findings fixed: added bun-types to tsconfig types array, added forceConsistentCasingInFileNames, established CSS modules pattern with page.module.css. bun.lock needs to be committed (will happen with first commit). Guild-members gitignore pattern deferred since sample manifest (Task 3) needs to be committable.

### Phase 2: Define core types and Zod schemas
- Dispatched: lib/schemas.ts (3 Zod schemas + SessionStatusSchema), lib/types.ts (inferred types + API types + GuildMember runtime type), tests/lib/schemas.test.ts.
- Result: Zod 4.3.6 API confirmed working (discriminatedUnion, datetime validation, default stripping). 3 files created.
- Tests: 20 tests, 0 failures, 42 assertions. Covers valid/invalid manifests, all session statuses, all 7 SSE event types, missing fields, wrong types, extra field stripping.
- Review: Clean. No issues. `unknown` used appropriately for tool results.

### Phase 3: Implement plugin discovery and roster API
- Dispatched: lib/plugin-discovery.ts (FileSystem DI interface, discoverGuildMembers, getRoster with cache), app/api/roster/route.ts, sample manifest, tests.
- Result: 3 source files + 2 test files + 1 sample manifest created. Discovery validates manifests, handles errors gracefully, returns Map keyed by directory name.
- Tests: 13 new tests (33 total), all pass. Covers valid/invalid manifests, empty/missing dirs, caching, multiple members.
- Review: 3 findings fixed: (1) documented cache path-blindness as intentional Phase I limitation, (2) added non-null assertion safety comments per CLAUDE.md, (3) extracted shared mock-fs helper to tests/helpers/mock-fs.ts.

### Phase 4: MCP server lifecycle management
- Dispatched: lib/mcp-manager.ts (MCPManager class, MCPServerFactory/MCPServerHandle interfaces, reference counting, event emission, invokeTool with auto-start).
- Result: 267-line module with full DI. MCPServerConfig is a placeholder shape for Phase 7 confirmation. Roster mutation is intentional (shared state).
- Tests: 17 new tests (52 total), all pass. Covers start/release/shared references, getServerConfigs, invokeTool (running + ad-hoc), errors, shutdown, subscribe/unsubscribe.
- Review: 2 findings fixed: (1) avoided Map mutation during iteration in releaseServersForSession, (2) added error handling in stopServer so one failed stop doesn't break cleanup for other servers. Added test for stop-error path (53 total tests).

### Phase 5: Session storage and CRUD API
- Dispatched: lib/session-store.ts (SessionStore class, SessionFileSystem DI, Clock DI, slugify, collision detection), API routes, StoredMessage type.
- Result: SessionStore with full CRUD. Shared node-session-store.ts for route adapter. MockSessionFs test helper. Context.md template with 4 sections.
- Tests: 32 new tests (85 total). Covers slugification, collision detection, CRUD operations, JSONL round-trip, sorted listing.
- Review: 5 findings fixed: (1) extracted shared nodeFs adapter to lib/node-session-store.ts, (2) added validation + restricted immutable fields in updateMetadata, (3) added StoredMessageSchema and JSONL resilience (skip corrupt lines), (4) fixed double clock() call in createSession, (5) moved CreateSessionBodySchema to shared schemas + added tests. 91 total tests.

### Phase 6: Session completion endpoint
- Dispatched: app/api/sessions/[id]/complete/route.ts, tests.
- Result: Thin route handler delegating to SessionStore. Handles idle/error (complete), completed/expired (no-op), running (409).
- Tests: 7 new tests (98 total). Covers all status transitions + persistence.
- Review: Clean. No issues.

### Phase 7: Agent SDK API verification
- Dispatched: Examined @anthropic-ai/claude-agent-sdk v0.2.39 type definitions. Created lib/agent.ts with 325-line header comment + placeholder stubs + event bus. Updated CLAUDE.md with SDK section.
- Result: All 7 questions answered. Key findings: query() is top-level function (not class), Options.mcpServers is Record<string, Config> not Config[], must pass includePartialMessages:true for streaming, session_id on every message, resume via options.resume string, interrupt() and close() on Query object.
- Divergences from plan (reflected in tasks 008-011):
  1. MCPManager.getServerConfigs must return Record not array
  2. SDKPartialAssistantMessage wraps BetaRawMessageStreamEvent for text streaming
  3. No separate tool_result SDK message type (results in content blocks)
  4. No specific error type for expired sessions (need string matching)
  5. Additional SDK events (ToolProgress, ToolUseSummary) not in plan

### Phase 8: Agent basic query flow with event bus
- Dispatched: lib/agent.ts (translateSdkMessage, startAgentQuery implementations), lib/agent-manager.ts (AgentManager class with DI), lib/server-context.ts (singleton wiring), messages API route. Updated MCPManager.getServerConfigs to return Record.
- Result: Core SDK integration complete. Structural types for Anthropic SDK internals (BetaMessage, BetaRawMessageStreamEvent) since the underlying package isn't a direct dependency. Permission mode set to bypassPermissions. Event accumulation on QueryHandle for message persistence.
- Tests: 63 new tests (145 total). Covers type guards, event translation, event bus, query lifecycle, agent manager orchestration.
- Review: 4 findings fixed: (1) CRITICAL: added assistant response persistence to messages.jsonl via accumulated events, (2) removed unsafe getSessionsDir() cast, added sessionsDir to AgentManagerDeps, (3) documented messageCount as "user-visible turns", (4) added .catch() error logging for SDK session ID persistence. 147 total tests.

### Phase 9: SSE streaming endpoint
- Dispatched: lib/sse.ts (formatSSEEvent, formatSSE), app/api/sessions/[id]/events/route.ts (SSE GET handler with ReadableStream).
- Result: SSE endpoint handles three paths: no query (status + close), query running (status + forward events), mid-query reconnect (running status + forward). Proper cleanup on client disconnect and done event.
- Tests: 26 new tests (173 total). Covers wire format, event types, idle/running/reconnect paths, multiple subscribers, cleanup.
- Review: Clean. Minor non-critical double-unsubscribe possibility noted but harmless (event bus idempotent).

### Phase 10: Agent session resume
- Dispatched: Resume/fresh-start logic in AgentManager.runQuery, expired session detection via string matching on error events, bug fix for error event accumulation in iterateQuery.
- Result: Resume when sdkSessionId exists AND status != expired. Fresh start otherwise. Expired detection checks error messages for session-related keywords. Bug found: error/done events in catch/finally weren't being accumulated, preventing expiration detection.
- Tests: 12 new tests (185 total). Covers resume with sdkSessionId, no resume without it, MCP server ordering, expiration detection (multiple patterns), fresh start preserving context/messages.
- Review: Skipped (thin changes on thoroughly-reviewed base, no new architectural decisions).

### Phase 11: Agent stop/interrupt
- Dispatched: Stop API route, status_change event emission in awaitCompletion, removed unused stopAgentQuery stub from lib/agent.ts.
- Result: Phase 8's AgentManager.stopQuery was already correct (abort controller). Added status_change emission to event bus after query completion. Stop route: 404/409/200 pattern.
- Tests: 11 new tests (196 total). Covers abort signal, status transition, lastActivityAt update, event emission, running query removal, post-stop reuse.

### Phase 12: Direct tool invocation
- Dispatched: app/api/tools/invoke/route.ts, InvokeToolBodySchema in schemas.ts, getMCPManager/getRosterMap in server-context.ts.
- Result: Thin route handler with handleInvokeTool extracted for testability. Body validated with Zod. MCPManager.invokeTool handles server lifecycle. Route maps errors to 400/404/500.
- Tests: 16 new tests (212 total). Covers invocation, validation errors, 404 for missing members, 500 for execution errors, response shapes.

### Phase 13: Frontend Roster components
- Dispatched: RosterPanel, GuildMemberCard, ToolList, ToolInvokeForm, dashboard layout, CSS modules, schema-fields utility.
- Result: Dashboard two-column layout (340px roster, flexible board). CSS variables for light/dark mode. Schema-to-form-field converter for JSON Schema basic types. Responsive with mobile breakpoint.
- Tests: 39 new tests (228 -> 251 after fixes). schema-fields utility + component logic tests.
- Review: 5 findings fixed: (1) CRITICAL: changed GuildMember.tools from string[] to ToolInfo[] so roster has full tool metadata including inputSchema, (2) CRITICAL: added 21 component logic tests, (3) added aria-expanded for accessibility, (4) ToolList now renders tool descriptions, (5) empty schemas show "No parameters required" instead of JSON textarea.

### Phase 14: Frontend Board components
- Dispatched: BoardPanel, SessionCard, CreateSessionDialog, relative-time utility, dashboard layout integration.
- Result: Two-column dashboard with Roster + Board. Session cards with status dots (5 statuses), guild member chips, relative timestamps, message counts. CreateSessionDialog modal with name input + guild member checkboxes. Link navigation to /sessions/[id].
- Tests: 28 new tests (280 total), then reduced to 276 after review fixes (removed tests that verified fixture data).
- Review: 5 findings fixed: (1) CRITICAL: extracted pure logic (formatMessageLabel, canSubmitSession, buildCreateSessionBody, toggleSetMember) to lib/board-utils.ts so tests exercise actual functions instead of reimplementing component logic, (2) CRITICAL: replaced hardcoded #f59e0b with --status-expired CSS variable in both light/dark themes, (3) added aria-labelledby to CreateSessionDialog, (4) documented focus trap as Phase I limitation, (5) added comment documenting sort order API contract in BoardPanel. 276 total tests.

### Phase 15: Frontend Workshop with SSE streaming
- Dispatched: Workshop state machine (lib/workshop-state.ts), SSE client parsing (lib/sse-parse.ts), React hooks (useWorkshopSession, useSSE), 7 components (WorkshopView, ConversationHistory, MessageBubble, ToolCallDisplay, MessageInput, ProcessingIndicator), session page route.
- Result: Full Workshop with real-time SSE streaming. Pure state machine for all transitions (processing, assistant_text, tool_use, tool_result, status_change, error, done). EventSource-based SSE client with named event listeners. Grid layout with RosterPanel sidebar. Loading/error/404/expired states. Textarea with Enter-to-send and auto-grow. Stop button with processing indicator.
- Tests: 76 new tests (352 total), then reduced to 341 after review fixes (removed tautological tests, added state machine tests).
- Review: 6 findings fixed: (1) CRITICAL: injected ClockFn into addUserMessage and applySSEEvent for deterministic timestamps, (2) CRITICAL: replaced all non-null assertions in tests with type-safe assertSession/assertDefined guards, (3) CRITICAL: extracted component logic to lib/workshop-utils.ts (getSSEUrl, isConversationEmpty, shouldSubmitOnKey, etc.) so tests exercise real functions, (4) IMPORTANT: fixed status stuck on "running" when sendMessage POST fails (setSessionError now accepts resetStatus flag), (5) REQ-GH1-18: member chips in header acknowledged as sufficient for Phase I, (6) added exhaustive switch check in applySSEEvent. 341 total tests.

### Phase 16: Error handling and edge case hardening
- Dispatched: Integration test sweep across module boundaries. 25 tests in tests/integration/error-handling.test.ts covering 7 areas.
- Result: Found and fixed a real bug: getSession() crashed on corrupt JSON in meta.json instead of returning null (JSON.parse was outside try-catch). Added defensive handling.
- Tests: 27 new tests (368 total). Covers: invalid manifests (3), MCP server crash (3), expired SDK session full flow (4), SSE reconnection/event bus lifecycle (3), filesystem errors (5), workshop state machine resilience (7), roster data consistency for both contexts (2).
- Review: 2 findings fixed: (1) CRITICAL: added REQ-GH1-9 Roster-in-Workshop tests verifying data layer consistency between Dashboard and Workshop contexts, (2) added block comment documenting guard-then-assert pattern for non-null assertions. 368 total tests.

### Phase 17: Validate implementation against spec
- Dispatched: Fresh-context sub-agent read spec and reviewed entire codebase. Checked all 34 requirements, 10 success criteria, 6 constraints, and test coverage.
- Result: 32/34 requirements MET. All 6 constraints COMPLIANT. All 10 success criteria achievable. 368 tests across 20 files with comprehensive DI-based mocking.
- Gaps found:
  1. REQ-GH1-8 / REQ-GH1-29 (partially met): MCPServerFactory in server-context.ts is a stub. Direct tool invocation code path is complete and tested, but can't spawn real MCP server processes at runtime. Does NOT affect agent queries (SDK manages its own servers).
  2. REQ-GH1-20 (deviation): MCP servers and SDK session initialized on first message, not at session creation. Better design than spec describes (no wasted resources on unused sessions).
- Bug fixed during Phase 16 (not Phase 17): getSession() corrupt JSON handling.
- Validator noted: No additional remediation needed for Phase I. Factory stub is a known limitation documented since Phase 4/7. Deferred initialization is an improvement.

## Divergence

- REQ-GH1-20 deferred initialization: Session creation does not start MCP servers or initialize SDK session. Both happen on first message. This is intentional (no wasted resources for sessions created but never used). Spec should be updated to reflect this. (approved by architecture)
- MCPServerFactory stub: Direct tool invocation (REQ-GH1-8, REQ-GH1-29) requires a real factory that spawns MCP server processes. Code path is complete and tested with mock factories. The stub exists because the Agent SDK manages its own MCP servers for agent queries, making the factory only needed for the "user-directed mode." Implementing the real factory is a small, isolated change to server-context.ts. (pending)
