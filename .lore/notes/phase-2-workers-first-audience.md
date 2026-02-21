---
title: "Implementation notes: phase-2-workers-first-audience"
date: 2026-02-21
status: complete
tags: [implementation, notes]
source: .lore/plans/phase-2-workers-first-audience.md
modules: [guild-hall-core, guild-hall-ui]
---

# Implementation Notes: Phase 2 - Workers + First Audience

## Progress
- [x] Phase 1: Dependencies and daemon scaffolding
- [x] Phase 2: Package types and discovery
- [x] Phase 3: Sample worker package
- [x] Phase 4: Base toolbox and toolbox resolution
- [x] Phase 5: Event types and event translator
- [x] Phase 6: Meeting session management
- [x] Phase 7: Daemon HTTP API
- [x] Phase 8: Next.js daemon integration
- [x] Phase 9: Meeting view components
- [x] Phase 10: Start audience flow and worker picker
- [x] Phase 11: Navigation and dashboard updates
- [x] Phase 12: Integration testing
- [x] Phase 13: Spec validation

## Log

### Phase 1: Dependencies and daemon scaffolding
- Dispatched: Install hono, @anthropic-ai/claude-agent-sdk, concurrently. Create daemon/index.ts, daemon/app.ts, daemon/routes/health.ts, daemon/lib/socket.ts. Update package.json scripts and CLAUDE.md.
- Result: All files created. DI factory pattern applied throughout (createApp, createHealthRoutes). Socket lifecycle with PID-based liveness checks. SIGINT/SIGTERM handlers for clean shutdown. CLAUDE.md updated with daemon architecture.
- Tests: 18 new tests (13 socket, 4 health, 1 structure). 189 total, 0 failures. Typecheck and lint clean.

### Phase 2: Package types and discovery
- Dispatched: Extend lib/types.ts with WorkerIdentity, WorkerMetadata, ToolboxMetadata, PackageMetadata, DiscoveredPackage. Create lib/packages.ts with Zod schemas and discoverPackages(), getWorkers(), getToolboxes(), getWorkerByName(). Package name validation for path-unsafe characters.
- Result: All types and schemas created. Combined worker+toolbox type handled via array. Package name validation rejects slashes, backslashes, double-dots, spaces, non-ASCII. First scan path wins for duplicates.
- Tests: 41 new tests. 230 total, 0 failures. Typecheck clean.

### Phase 3: Sample worker package
- Dispatched: Add ActivationContext, ActivationResult, ResolvedToolSet to lib/types.ts. Create packages/sample-assistant/ with package.json and index.ts. Write tests.
- Result: Types added. Sample worker discoverable via discoverPackages(). activate() concatenates posture + memory + agenda. ResolvedToolSet.mcpServers typed as unknown[] (placeholder for Task 004).
- Tests: 13 new tests. 243 total, 0 failures. Typecheck clean.

### Phase 4: Base toolbox and toolbox resolution
- Dispatched: Create daemon/services/base-toolbox.ts with 6 tools (read/write memory, read/write/list artifacts, record_decision). Create daemon/services/toolbox-resolver.ts. Update ResolvedToolSet in lib/types.ts to use McpSdkServerConfigWithInstance.
- Result: Tool handlers exported as standalone factory functions for testability. Path traversal prevention on all file operations. Domain toolbox existence check validates against discovered packages. Missing toolbox error names worker and lists available packages.
- Tests: 30 new tests (22 base-toolbox, 8 toolbox-resolver). 273 total, 0 failures. Typecheck clean.

### Phase 5: Event types and event translator
- Dispatched: Create daemon/types.ts with GuildHallEvent union type and branded MeetingId/SdkSessionId types. Create daemon/services/event-translator.ts with translateSdkMessage() pure function.
- Result: All 6 event types defined. Branded types with helper constructors. Text deduplication: SDKAssistantMessage text blocks ignored per double-data retro. All non-public SDK message types return empty arrays (no leaking). Tool result extraction from SDKUserMessage with best-effort name resolution.
- Tests: 37 new tests. 310 total, 0 failures. Typecheck clean.

### Phase 6: Meeting session management
- Dispatched: Create daemon/services/meeting-session.ts with createMeetingSession(deps) factory. Implements createMeeting (async generator), sendMessage (resume via session ID), closeMeeting, interruptTurn.
- Result: Full lifecycle implemented. queryFn and activateFn DI seams for testing. Branded MeetingId/SdkSessionId used throughout. Meeting artifacts written with raw template literals (avoids gray-matter reformatting). Errors yielded as GuildHallEvent error events, not thrown. Session ID captured from init message and persisted. Cap enforcement against config.meetingCap.
- Tests: 37 new tests. 347 total, 0 failures. Typecheck clean.

### Phase 7: Daemon HTTP API
- Dispatched: Create daemon/routes/meetings.ts (4 endpoints), daemon/routes/workers.ts (1 endpoint). Update daemon/app.ts with production wiring via createProductionApp(). Update daemon/index.ts to call it.
- Result: SSE streaming via Hono's streamSSE(). POST /meetings returns SSE directly (no race condition). Production wiring reads config, discovers packages, creates real meeting session with SDK query. Fallback to basic app if production setup fails. Portrait base64 encoding for worker metadata.
- Tests: 30 new tests (22 meetings, 8 workers). 377 total, 0 failures. Typecheck clean.

### Phase 8: Next.js daemon integration
- Dispatched: Create lib/daemon-client.ts (Unix socket HTTP client), 6 API proxy routes, DaemonStatus component, update layout.
- Result: Daemon client uses node:http with socketPath. daemonStreamAsync returns ReadableStream for SSE proxying. Typed DaemonError with ECONNREFUSED/ENOENT classification. 6 thin proxy routes with 503 when offline. DaemonStatus polls /api/daemon/health every 5s, shows amber pulsing gem when offline, cleans up interval on unmount.
- Tests: 18 new tests (real Hono servers on temp Unix sockets). 395 total, 0 failures. Typecheck clean.

### Phase 9: Meeting view components
- Dispatched: Create meeting page route, 7 meeting components (MeetingHeader, ChatInterface, MessageBubble, StreamingMessage, ToolUseIndicator, MessageInput, ErrorMessage), shared types, tests.
- Result: Server component reads meeting artifact, handles not-found/closed. ChatInterface manages streaming state with local accumulator variables (avoids stale closures). SSE parsing from fetch response. Auto-scroll, abort controller for stop. User messages right-aligned with brass border, worker messages left-aligned with parchment + portrait. Pulsing cursor animation. Expandable tool indicators. Auto-growing textarea with Enter-to-send.
- Tests: 40 new tests. 435 total, 0 failures. Typecheck clean.

### Phase 10: Start audience flow and worker picker
- Dispatched: Create WorkerPicker modal, StartAudienceButton, MeetingList. Update ProjectHeader, project page meetings tab, ChatInterface for sessionStorage.
- Result: WorkerPicker split into wrapper + content to avoid lint issues. SSE stream consumed in picker, first-turn messages stored in sessionStorage, navigation to meeting view. MeetingList server component shows open/closed meetings with gems. ArtifactMeta extended with extras field for unknown frontmatter keys (worker name, agenda).
- Tests: 20 new tests. 455 total, 0 failures. Typecheck clean.

### Phase 11: Navigation and dashboard updates
- Dispatched: Update RecentArtifacts for meeting routing, add "View Meeting" link to artifact page, verify all navigation flows, update navigation tests.
- Result: artifactHref() function routes open meetings to meeting view, closed to artifact view. Meeting banner on artifact page for open meetings. All existing breadcrumb/tab navigation verified working. No dead ends.
- Tests: 15 new tests. 470 total, 0 failures. Typecheck clean.

### Phase 12: Integration testing
- Dispatched: Write daemon integration test (full HTTP-to-SSE path with mocked SDK) and verify all component tests from prior phases cover integration gaps.
- Result: 29 new tests in tests/daemon/integration.test.ts. Full end-to-end daemon test: POST /meetings, POST /messages, DELETE, GET /health, GET /workers all exercised through real Hono app with mocked query(). Meeting flow UI test deemed redundant (component tests from phases 9-10 already cover picker-to-chat and message display paths).
- Tests: 29 new tests. 499 total, 0 failures. Typecheck clean.

### Phase 13: Spec validation
- Dispatched: Fresh-context validation agent checked all 35 Phase 2 REQs against implementation.
- Result: 30 MET, 5 PARTIAL (all expected scope boundaries). Domain toolbox loading (WKR-6/6a/12), requested/declined meeting states (MTG-4/5), and git worktree (MTG-8 steps 3-4) all deferred by design.
- Correctness findings requiring remediation:
  1. Meeting page reads agenda from artifact body (empty on first load) instead of frontmatter `agenda` field
  2. Meeting page passes empty string for workerDisplayTitle instead of looking up worker package metadata
  3. CLAUDE.md stale: test count (189 vs 499), missing Phase 2 modules, API routes, component descriptions
- Minor: Worker portrait URL not passed to ChatInterface message bubbles (header only)
- Remediation: Fixed agenda to read from `meta.extras?.agenda` frontmatter field. Added `workerDisplayTitle` to meeting artifact frontmatter at creation time (daemon writes it from worker identity). Meeting page now reads both `worker` and `workerDisplayTitle` from extras. CLAUDE.md updated with Phase 2 status, daemon modules, API routes, components. 499 tests, 0 failures.

## Divergence

- **Domain toolbox loading deferred (WKR-6/6a/12)**: resolveToolSet validates that domain toolbox packages exist but does not create MCP servers from them. Harmless in Phase 2 (sample worker has empty domainToolboxes). Domain toolbox activation is Phase 3+ scope.
- **Meeting states requested/declined not implemented (MTG-4/5)**: Only open/closed states exist. Worker-initiated meeting requests are Phase 3+ scope.
- **Git worktree not implemented (MTG-8 steps 3-4)**: Meetings use os.tmpdir() instead of git activity branches and worktrees. Git integration is Phase 3+ scope.
- **Start Audience is generic, not manager-specific (VIEW-17)**: The spec says "Start Audience with Guild Master." Phase 2 implements a generic worker picker because no manager worker exists yet. Phase 6 will narrow the primary button.
