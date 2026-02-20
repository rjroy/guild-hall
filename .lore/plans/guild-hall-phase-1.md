---
title: Guild Hall Phase I - Implementation Plan
date: 2026-02-11
status: draft
tags: [phase-1, implementation, nextjs, agent-sdk, mcp, sessions, frontend]
modules: [guild-hall]
related:
  - .lore/specs/phase-1/guild-hall-phase-1.md
  - .lore/brainstorm/guild-hall-phase-1.md
  - .lore/research/claude-agent-sdk.md
  - .lore/research/typescript-plugin-systems.md
---

# Plan: Guild Hall Phase I - Frontend Session Shell

## Spec Reference

**Spec**: `.lore/specs/phase-1/guild-hall-phase-1.md`

Requirements addressed:

- REQ-GH1-1: Next.js app with API routes → Step 1
- REQ-GH1-2: Agent SDK session management → Steps 7a, 7b
- REQ-GH1-3: SSE streaming during queries → Step 8
- REQ-GH1-4: Localhost only, no auth → Step 1
- REQ-GH1-5: Filesystem-discovered plugins → Step 3
- REQ-GH1-6: Roster displays guild members → Step 10
- REQ-GH1-7: Expandable tool list → Step 10
- REQ-GH1-8: Direct tool invocation from Roster → Steps 9, 10
- REQ-GH1-9: Roster visible from Dashboard and Workshop → Steps 10, 13
- REQ-GH1-10: Board displays session cards → Step 11
- REQ-GH1-11: Session card content → Step 11
- REQ-GH1-12: Click session card → Workshop → Step 11
- REQ-GH1-13: Create new session → Step 11
- REQ-GH1-14: Workshop conversation history → Step 12
- REQ-GH1-15: Real-time streaming → Step 12
- REQ-GH1-16: Message input → Step 12
- REQ-GH1-17: Stop control → Steps 7b, 12
- REQ-GH1-18: Workshop shows session guild members → Step 12
- REQ-GH1-19: Sessions as directories → Step 5
- REQ-GH1-20: Session creation lifecycle → Steps 5, 7b
- REQ-GH1-21: Session resume with SDK session ID → Step 7b
- REQ-GH1-22: Expired session handling → Steps 7b, 13
- REQ-GH1-23: Session statuses → Steps 2, 5, 7b
- REQ-GH1-24: Plugin manifest schema → Steps 2, 3
- REQ-GH1-25: MCP-only guild members, default cards → Steps 3, 10
- REQ-GH1-26: Manifest validation at startup → Step 3
- REQ-GH1-27: REST API endpoints → Steps 5, 6, 7b, 8, 9
- REQ-GH1-28: SSE event types → Step 8
- REQ-GH1-29: Direct tool invocation endpoint → Step 9
- REQ-GH1-30: Context file per session → Step 5
- REQ-GH1-31: Agent reads context file at query start → Step 7b
- REQ-GH1-32: Agent updates context file during queries → Step 7b
- REQ-GH1-33: Context file provides continuity after expiry → Step 7b
- REQ-GH1-34: Context file is plain text, user-editable → Step 5

## Codebase Context

The codebase is empty. No application code exists. The repository contains:

- `.lore/` with research, brainstorm, spec, and notes artifacts
- `.gitignore` (only `.env`)
- `LICENSE`

This is a greenfield build. No existing patterns, conventions, or code to work around. The plan defines the patterns.

### Target File Structure

```
guild-hall/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                         # Dashboard (Roster + Board)
│   ├── sessions/[id]/page.tsx           # Workshop
│   └── api/
│       ├── roster/route.ts
│       ├── sessions/route.ts
│       ├── sessions/[id]/route.ts
│       ├── sessions/[id]/messages/route.ts
│       ├── sessions/[id]/stop/route.ts
│       ├── sessions/[id]/complete/route.ts
│       ├── sessions/[id]/events/route.ts   # SSE
│       └── tools/invoke/route.ts
├── components/
│   ├── roster/
│   ├── board/
│   └── workshop/
├── lib/
│   ├── types.ts
│   ├── schemas.ts
│   ├── plugin-discovery.ts
│   ├── mcp-manager.ts
│   ├── session-store.ts
│   └── agent.ts
├── guild-members/                        # Plugin directory
├── sessions/                             # Session storage
├── tests/
├── package.json
├── tsconfig.json
├── next.config.ts
├── eslint.config.mjs
└── CLAUDE.md
```

## Implementation Steps

### Step 1: Project Scaffolding

**Files**: package.json, tsconfig.json, next.config.ts, eslint.config.mjs, .gitignore, CLAUDE.md, app/layout.tsx, app/page.tsx
**Addresses**: REQ-GH1-1, REQ-GH1-4
**Expertise**: None

Scaffold the Next.js app with `bunx create-next-app@latest`. App Router, TypeScript, no Tailwind (use CSS modules or plain CSS to keep things simple initially, unless Tailwind proves needed for the dashboard layout).

Configure:
- `tsconfig.json` with strict mode, path aliases (`@/` for root)
- `eslint.config.mjs` with typescript-eslint flat config
- `.gitignore` for Next.js + bun + sessions/ + guild-members/ runtime data (but not the guild-members directory itself, just its contents)

Add CLAUDE.md with project conventions:
- bun for package management and testing
- No `mock.module()` (bun limitation)
- Dependency injection for testability
- Agent SDK integration patterns

Install core dependencies:
- `@anthropic-ai/claude-agent-sdk` (Agent SDK)
- `zod` (schema validation)

Dev dependencies:
- `typescript`, `bun-types`, `typescript-eslint`, `eslint`, `prettier`

Create placeholder `app/layout.tsx` and `app/page.tsx`. Verify the dev server starts.

### Step 2: Core Types and Schemas

**Files**: lib/types.ts, lib/schemas.ts
**Addresses**: REQ-GH1-23, REQ-GH1-24, REQ-GH1-28
**Expertise**: None

Define the data model that every subsequent step depends on.

**lib/schemas.ts** (Zod schemas, source of truth):

- `GuildMemberManifestSchema`: Validates `guild-member.json` files. Fields: name, displayName, description, version, mcp (command, args, env). This is the Phase I manifest, MCP-only.
- `SessionMetadataSchema`: Validates `meta.json` files. Fields: id, name, status, guildMembers (array of names), sdkSessionId (nullable), createdAt, lastActivityAt, messageCount.
- `SSEEventSchema`: Discriminated union for event types: processing, assistant_text, tool_use, tool_result, status_change, error.

**lib/types.ts** (TypeScript types derived from schemas + runtime types):

- Infer types from Zod schemas (`z.infer<typeof ...>`)
- `SessionStatus`: `"idle" | "running" | "completed" | "expired" | "error"`
- `GuildMemberStatus`: `"connected" | "disconnected" | "error"`
- `GuildMember`: Runtime representation (manifest data + connection status + tool list)
- API request/response types for each endpoint

**API contract decision**: Only one query may run per session at a time. `POST /api/sessions/[id]/messages` returns 409 Conflict if a query is already running. This is a Phase I simplification that prevents race conditions. Document it in the API types so it's enforced consistently across Steps 6, 7b, and 8.

Tests: Validate schemas accept valid data and reject invalid data. Test edge cases in manifest parsing (missing fields, wrong types, extra fields).

### Step 3: Plugin Discovery and Roster API

**Files**: lib/plugin-discovery.ts, app/api/roster/route.ts
**Addresses**: REQ-GH1-5, REQ-GH1-24, REQ-GH1-25, REQ-GH1-26, REQ-GH1-27 (roster endpoint)
**Expertise**: None

**lib/plugin-discovery.ts**:

Scan the `guild-members/` directory at startup. For each subdirectory:
1. Look for `guild-member.json`
2. Parse and validate against `GuildMemberManifestSchema`
3. Valid manifests → guild member registered with `disconnected` status
4. Invalid manifests → log error, register with `error` status and error message

The discovery function takes the guild-members directory path as a parameter (dependency injection for testing). Returns a `Map<string, GuildMember>` keyed by name.

**app/api/roster/route.ts**:

GET handler. Returns the full roster: all guild members with their status, description, and tool list (empty until MCP servers connect). The roster is held in module-level state, initialized once on first request (or via a startup hook).

Create a sample `guild-members/example/guild-member.json` for development and testing.

Tests: Discovery with valid manifests, invalid manifests, empty directory, missing directory. Roster endpoint returns correct shape.

### Step 4: MCP Server Management

**Files**: lib/mcp-manager.ts
**Addresses**: REQ-GH1-5 (server startup), REQ-GH1-20 (start servers for session), REQ-GH1-21 (restart if needed), REQ-GH1-29 (direct tool invocation support)
**Expertise**: None

**lib/mcp-manager.ts**:

Manages the lifecycle of MCP server processes. The Agent SDK's MCP integration handles the actual protocol, but we need to track which servers are running and why.

**4.1: Server lifecycle with reference counting**

MCP servers are shared across sessions. A server starts when the first session needs it and stops when no sessions need it. The MCP manager tracks a `Map<memberName, Set<sessionId>>` to know which sessions are using which servers.

Interface:
- `startServersForSession(sessionId, memberNames)`: For each member, add sessionId to the reference set. Start the server if it wasn't already running.
- `releaseServersForSession(sessionId)`: Remove sessionId from all reference sets. Stop any servers with empty reference sets.
- `getServerConfigs(memberNames)`: Return the MCP server configuration objects that the Agent SDK expects for a `query()` call.
- `isRunning(memberName)`: Check if a server is currently running.

**4.2: Server start/stop**

Given a guild member's MCP config (command, args, env), spawn the process and produce the configuration object the Agent SDK expects. For stdio servers, this means command and args. Track the process handle for cleanup.

**4.3: Status tracking and tool listing**

Each guild member has a connection status (connected, disconnected, error). After a server starts, query its tool list via the MCP protocol and update the guild member's tool count and tool descriptions in the roster.

**4.4: Direct tool invocation**

Expose `invokeTool(memberName, toolName, toolInput)` for user-directed tool calls (Step 9). This calls the tool directly via the MCP client, outside of an Agent SDK session. If the server isn't running, start it with a temporary reference (auto-released after the call).

**4.5: Event emission**

Emit events when server status changes (started, stopped, error, tool list updated). The SSE streaming layer (Step 8) and the roster API can subscribe to these events to keep clients informed.

Tests: Mock process spawning. Test reference counting (two sessions share a server, one releases, server stays; both release, server stops). Test tool listing. Test direct invocation. Test error handling for failed server starts. Test cleanup on app shutdown.

### Step 5: Session Storage

**Files**: lib/session-store.ts, app/api/sessions/route.ts, app/api/sessions/[id]/route.ts
**Addresses**: REQ-GH1-19, REQ-GH1-20 (directory creation), REQ-GH1-23, REQ-GH1-27 (session endpoints), REQ-GH1-30, REQ-GH1-34
**Expertise**: None

**lib/session-store.ts**:

CRUD operations on session directories. The sessions directory path is injected.

- **Create session**: Create directory with `meta.json` (initial status: idle, no SDK session ID yet), empty `context.md` (template with section headers: Goal, Decisions, In Progress, Resources), empty `messages.jsonl`, `artifacts/` directory.
- **List sessions**: Scan sessions directory, read each `meta.json`, return sorted by `lastActivityAt` descending.
- **Read session**: Read `meta.json` and `messages.jsonl` for a specific session.
- **Update metadata**: Write updated `meta.json` (status changes, SDK session ID, message count, timestamps).
- **Append message**: Append a JSON line to `messages.jsonl`. Messages include: role (user/assistant), content, timestamp, and for tool interactions: tool name, tool input, tool result.

Session IDs are generated from the creation timestamp and name: `YYYY-MM-DD-slugified-name`. Collision detection: check if `sessions/YYYY-MM-DD-slugified-name` exists on the filesystem. If it does, append `-2`, `-3`, etc. until a unique ID is found.

**API routes**:

- `GET /api/sessions`: List all sessions (metadata only, no messages).
- `POST /api/sessions`: Create a new session. Body: `{ name, guildMembers: string[] }`. Returns the created session metadata.
- `GET /api/sessions/[id]`: Session details including full message history.

Tests: Create, list, read sessions. Verify directory structure. Test collision handling. Test message appending and reading.

### Step 6: Session Completion API

**Files**: app/api/sessions/[id]/complete/route.ts
**Addresses**: REQ-GH1-23, REQ-GH1-27 (complete endpoint)
**Expertise**: None

`POST /api/sessions/[id]/complete`: Sets session status to `completed`. Updates `meta.json`. No-op if already completed or expired.

This is separate from stop (which interrupts a running query). Complete is the user explicitly ending a session.

**Design decision**: Completing a running session returns 409 Conflict. The user must stop the query first, then complete. This aligns with the single-query-per-session contract from Step 2.

Tests: Complete an idle session. Attempt to complete an already-completed session. Attempt to complete a running session (verify 409).

### Step 7a: Agent SDK API Verification

**Files**: tests/lib/agent-sdk-spike.test.ts (throwaway spike)
**Addresses**: REQ-GH1-2 (precondition verification)
**Expertise**: None (but findings gate Step 7b)

Before building the agent wrapper, verify the TypeScript Agent SDK's actual API against the installed package. The research doc is based on documentation, not tested code. Assumptions that turn out wrong here would cascade through Steps 7b, 8, and 12.

Write a minimal test file (spike, not production) that:

1. **Imports**: Verify what `@anthropic-ai/claude-agent-sdk` exports. What is the top-level API? Is it `query()` as a standalone function, a class constructor, or something else?
2. **`query()` signature**: What parameters does it accept? Confirm: prompt/message, MCP server configs, system prompt, permission mode, working directory, resume session ID. Check the actual parameter names and types.
3. **Streaming**: How does `query()` return streaming events? Is it an async generator? What are the event/message types? Map them to the SSE event types defined in Step 2.
4. **Session ID capture**: How do you get the SDK session ID from a query response? Is it in the init message, the result, or somewhere else?
5. **Resume**: What does the `resume` option look like? Is it `resume: sessionId` or `sessionId: id` or something else? What happens when the session ID is expired (what error type)?
6. **Interrupt**: How do you interrupt a running query? Is there an `interrupt()` method on the Query object? What does it return?
7. **MCP server config shape**: What format does the SDK expect for MCP servers? Confirm the structure for stdio servers (command, args, env).

Document findings in a comment block at the top of `lib/agent.ts` (or in CLAUDE.md if broadly useful). Delete the spike test after the API is confirmed.

If the API diverges from assumptions, update Step 7b's approach before implementing.

### Step 7b: Agent SDK Integration

**Files**: lib/agent.ts, app/api/sessions/[id]/messages/route.ts, app/api/sessions/[id]/stop/route.ts
**Addresses**: REQ-GH1-2, REQ-GH1-17, REQ-GH1-20, REQ-GH1-21, REQ-GH1-22, REQ-GH1-27 (messages/stop endpoints), REQ-GH1-31, REQ-GH1-32, REQ-GH1-33
**Expertise**: Depends on Step 7a findings

**lib/agent.ts**: Wraps the Agent SDK. This is the core integration point. Broken into substeps:

**7b.1: Basic query flow**

Implement the happy path: new session, first message.

1. Get MCP server configs for the session's guild members (via MCP manager, Step 4)
2. Build the system prompt (see 7b.4 for context file instructions)
3. Call `query()` with: the user's message, MCP server configs, system prompt, permission mode (acceptEdits for Phase I), working directory set to the session's directory
4. Capture the SDK session ID from the response and store it in `meta.json`
5. Iterate the async generator to yield streaming events
6. After completion, update session metadata (status back to idle, message count, timestamp)
7. Emit events through an event bus (see Event Emission API below)

Enforce the single-query-per-session contract: if a query is already running for this session, reject with 409. Track running queries in a `Map<sessionId, QueryHandle>`.

**7b.2: Session resume**

Add resume support to the query flow:

1. Read the SDK session ID from `meta.json`
2. Ensure MCP servers are running via `startServersForSession` (restart if needed)
3. Call `query()` with `resume: sessionId` (exact parameter name from Step 7a)
4. If resume fails (expired session), mark status as `expired`, return error to client
5. Client can then start fresh: a new `query()` without `resume`, producing a new SDK session ID. The context file and message history remain.

**7b.3: Stop/interrupt**

Track running queries by session ID in the `Map<sessionId, QueryHandle>`. The stop endpoint retrieves the handle and calls `interrupt()`. After interruption, session status returns to idle.

API routes:
- `POST /api/sessions/[id]/messages`: Body: `{ content: string }`. Triggers a query. Returns immediately with 202. The client subscribes to SSE for results. Returns 409 if a query is already running.
- `POST /api/sessions/[id]/stop`: Interrupts the running query. Returns 200 on success, 409 if no query is running.

**7b.4: Context file integration**

The agent receives system prompt instructions to:
- Read `context.md` at the start of each query for orientation
- Update `context.md` as decisions are made, tasks progress, or the situation changes
- Keep it concise: what we're doing, what's been decided, what's in progress, what matters
- Remove stale information rather than accumulating

This uses the agent's built-in file tools (Read, Edit). The working directory is set to the session directory, so `context.md` is directly accessible.

**Event emission API** (consumed by Step 8):

The agent module exposes a typed event bus per session:
- `subscribe(sessionId, callback)`: Subscribe to events for a session. Returns an unsubscribe function.
- `emit(sessionId, event)`: Emit an event for a session. Called internally as the query progresses.
- Events are the same types as the SSE events: processing, assistant_text, tool_use, tool_result, status_change, error, done.

Use an EventEmitter or Map of callbacks, injected for testability. Multiple subscribers per session are supported (handles the case where multiple browser tabs are open for the same session).

Tests per substep:
- 7b.1: Mock the Agent SDK. Test query lifecycle (start, stream events, complete). Test 409 on concurrent query.
- 7b.2: Test resume with valid session ID. Test expired session detection and status transition.
- 7b.3: Test stop/interrupt. Test 409 when no query running.
- 7b.4: Test system prompt includes context file instructions. Verify the prompt text is correct.

### Step 8: SSE Streaming

**Files**: lib/sse.ts, app/api/sessions/[id]/events/route.ts
**Addresses**: REQ-GH1-3, REQ-GH1-15, REQ-GH1-28
**Expertise**: None

**lib/sse.ts**:

Utility for SSE formatting: `formatSSEEvent(type, data)` produces `event: type\ndata: JSON\n\n`.

**app/api/sessions/[id]/events/route.ts**:

GET handler that returns a `ReadableStream` with SSE headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`).

The stream subscribes to the session's active query (if one is running). Events:

- `processing`: Agent is working, no output yet. Sent when query starts and periodically during tool execution.
- `assistant_text`: Streamed text chunk from the agent. `{ text: string }`.
- `tool_use`: Agent is calling a tool. `{ toolName: string, toolInput: object, toolUseId: string }`.
- `tool_result`: Tool returned a result. `{ toolUseId: string, result: object }`.
- `status_change`: Session status changed. `{ status: SessionStatus }`.
- `error`: Something went wrong. `{ message: string, recoverable: boolean }`.
- `done`: Query completed. Stream closes.

The connection model: client connects to SSE when entering the Workshop or after sending a message. The stream stays open for the duration of the query. When the query completes, the server sends a `done` event and closes. The client reconnects for the next query.

If the client connects and no query is running, send a `status_change` event with current status and close.

**Mid-query reconnection** (e.g., page refresh while agent is running): If the client connects while a query is already in progress, the server sends a `status_change` event with `running` status and begins forwarding events from that point forward. No replay of missed events. The client knows the agent is working and will see new events as they arrive. After the query completes, the client can fetch the full conversation via `GET /api/sessions/[id]` to fill in anything it missed.

**Event bus integration**: The SSE route subscribes to the event bus exposed by Step 7b's agent module. Multiple SSE connections to the same session are supported (the event bus allows multiple subscribers). Clean up subscriptions when the SSE connection closes.

Tests: Verify SSE formatting. Test event subscription and delivery. Test stream cleanup on client disconnect. Test reconnection behavior.

### Step 9: Direct Tool Invocation

**Files**: app/api/tools/invoke/route.ts
**Addresses**: REQ-GH1-8, REQ-GH1-27 (tool invocation endpoint), REQ-GH1-29
**Expertise**: None

`POST /api/tools/invoke`: Body: `{ guildMember: string, toolName: string, toolInput: object }`.

This is user-directed tool use, no agent involved. The backend calls `mcpManager.invokeTool(memberName, toolName, toolInput)` (exposed in Step 4.4). The MCP manager handles starting the server if needed and calling the tool directly via the MCP protocol.

Returns: `{ result: object }` on success, error details on failure.

Tests: Invoke a tool on a running server. Invoke on a stopped server (should auto-start). Invoke with invalid guild member or tool name. Invoke with invalid input.

### Step 10: Frontend - Roster

**Files**: components/roster/RosterPanel.tsx, components/roster/GuildMemberCard.tsx, components/roster/ToolList.tsx, components/roster/ToolInvokeForm.tsx
**Addresses**: REQ-GH1-6, REQ-GH1-7, REQ-GH1-8, REQ-GH1-9, REQ-GH1-25
**Expertise**: Frontend design

**RosterPanel**: Fetches guild members from `GET /api/roster`. Renders a list of `GuildMemberCard` components. Visible on both the Dashboard and Workshop layouts.

**GuildMemberCard**: Displays name, description, connection status (badge or indicator), and tool count. Clicking expands to show the `ToolList`.

**ToolList**: Shows individual tools with name and description. Each tool has an "Invoke" action that opens the `ToolInvokeForm`.

**ToolInvokeForm**: Dynamic form generated from the tool's input schema (JSON Schema from MCP). Phase I: custom implementation supporting basic types only (string, number, boolean, enum, required/optional). No third-party form library. If tools have complex nested schemas, render a raw JSON textarea as fallback. Submit calls `POST /api/tools/invoke`. Displays the result inline.

The Roster is a shared component rendered in the Dashboard layout (alongside the Board) and in the Workshop layout (as a sidebar or panel). The exact layout depends on viewport, but the component is the same.

Tests: Render with mock data. Test expand/collapse. Test form generation from schema. Test invocation flow with mocked API.

### Step 11: Frontend - Board

**Files**: components/board/BoardPanel.tsx, components/board/SessionCard.tsx, components/board/CreateSessionDialog.tsx
**Addresses**: REQ-GH1-10, REQ-GH1-11, REQ-GH1-12, REQ-GH1-13
**Expertise**: Frontend design

**BoardPanel**: Fetches sessions from `GET /api/sessions`. Renders session cards sorted by last activity. Includes a "New Session" button.

**SessionCard**: Displays session name, status (with visual indicator), configured guild members (as small badges), last activity timestamp, message count. Clicking navigates to `/sessions/[id]` (Workshop).

**CreateSessionDialog**: Modal or panel. User enters session name, selects guild members from the roster (checkboxes), and submits. Calls `POST /api/sessions`. On success, navigates to the new session's Workshop.

Tests: Render with mock session data. Test sorting. Test creation flow. Test navigation on card click.

### Step 12: Frontend - Workshop

**Files**: app/sessions/[id]/page.tsx, components/workshop/WorkshopView.tsx, components/workshop/ConversationHistory.tsx, components/workshop/MessageBubble.tsx, components/workshop/ToolCallDisplay.tsx, components/workshop/MessageInput.tsx, components/workshop/ProcessingIndicator.tsx
**Addresses**: REQ-GH1-14, REQ-GH1-15, REQ-GH1-16, REQ-GH1-17, REQ-GH1-18
**Expertise**: Frontend design, SSE client integration

**12.1: State management**

Define the Workshop's state model. A custom hook (`useWorkshopSession`) manages:
- `session`: Session metadata (from initial fetch)
- `messages`: Message list (loaded from API, appended by SSE events)
- `status`: Current session status (idle, running, expired, etc.)
- `streamingText`: Accumulated text for the in-progress assistant message

State transitions:
- User sends message → status: running, SSE connects
- SSE `assistant_text` → append to streamingText
- SSE `tool_use` → append tool call to messages
- SSE `tool_result` → update the pending tool call with its result
- SSE `done` → flush streamingText to messages as a complete assistant message, status: idle
- SSE `error` → display error, status depends on recoverability
- Stop button → POST stop, status: idle when confirmed

**12.2: SSE client integration**

Build a `useSSE(sessionId)` hook that:
- Connects to `GET /api/sessions/[id]/events` using `EventSource` or fetch-based reader
- Parses typed events (matching Step 2's SSE event schema)
- Calls state update callbacks for each event type
- Handles reconnection: if the connection drops mid-query, reconnect and receive a `status_change` event (per Step 8's mid-query reconnection spec)
- Cleans up on unmount

**12.3: Static components**

Components that render data without managing streaming state:

- **ConversationHistory**: Renders the message list. Each message is a `MessageBubble` or `ToolCallDisplay`. Scrolls to bottom on new content.
- **MessageBubble**: User messages and assistant text. Accepts a `streaming` prop for the in-progress message.
- **ToolCallDisplay**: Shows tool name, input (collapsible), result (collapsible). Visual distinction between pending (no result yet) and completed.

**12.4: Dynamic components**

Components that interact with session state:

- **app/sessions/[id]/page.tsx**: Fetches session details from `GET /api/sessions/[id]`. Renders `WorkshopView` with the Roster in a sidebar.
- **WorkshopView**: Orchestrates the Workshop. Shows configured guild members (REQ-GH1-18), wires `useWorkshopSession` and `useSSE` together, renders conversation + input + processing state.
- **MessageInput**: Text input with send button. Disabled when `status` is `running`. Sends `POST /api/sessions/[id]/messages`. The SSE hook handles the response stream.
- **ProcessingIndicator**: Visible when `status` is `running`. Shows that the agent is working. Includes a stop button that calls `POST /api/sessions/[id]/stop`.
- **Expired session handling**: If status is `expired`, show a message explaining it. Offer a "Start Fresh" button that creates a new SDK session (POST to messages without resume). Context file and message history are preserved.

**12.5: Integration test**

Test the full Workshop flow end-to-end with mocked API and SSE:
1. Load session, render conversation history
2. Send a message, verify SSE connects, verify streaming text appears
3. Receive tool_use and tool_result events, verify they render
4. Receive done event, verify message is finalized, input re-enables
5. Click stop, verify POST to stop endpoint, verify status returns to idle
6. Load an expired session, verify the "Start Fresh" UI appears

### Step 13: Error Handling and Edge Cases

**Files**: Modifications across lib/ and components/
**Addresses**: REQ-GH1-9 (Roster visible in Workshop), REQ-GH1-22 (expired session end-to-end), REQ-GH1-26 (invalid manifest display)
**Expertise**: None

Sweep through the implementation for error handling gaps. This is a hardening pass, not new functionality. The individual error cases should be handled in their respective steps, but this step verifies they all work together.

1. **Invalid manifests** (REQ-GH1-26): Already handled in Step 3 (error status in roster). Verify the error message is displayed in the Roster UI, both on the Dashboard and in the Workshop sidebar.
2. **MCP server crash**: If a server process dies during a session, the MCP manager detects it (Step 4.3), emits a status change event (Step 4.5), and the Workshop shows an error. The user can retry (server restarts via reference counting).
3. **Expired SDK session** (REQ-GH1-22): Already handled in Step 7b.2. Verify the full flow end-to-end: detection, status transition to `expired`, UI indication in Workshop, "Start Fresh" button creates a new SDK session with context.md preserved.
4. **SSE connection drop**: Client-side reconnection in Step 12.2. Verify: if the server restarts mid-query, the client reconnects and receives a `status_change` event per Step 8's mid-query reconnection spec.
5. **File system errors**: Session directory permissions, disk full, etc. Surface as error status with descriptive messages.
6. **Roster in Workshop** (REQ-GH1-9): Verify the Roster component renders correctly in the Workshop sidebar layout, not just on the Dashboard.

Tests: Integration-level tests for error scenarios. Invalid manifest renders error card in both Dashboard and Workshop views. Server crash during query surfaces error event via SSE. Expired session shows correct UI and allows fresh start.

### Step 14: Validate Against Spec

Launch a sub-agent that reads the spec at `.lore/specs/phase-1/guild-hall-phase-1.md`, reviews the entire implementation, and flags any requirements not met. This step is not optional.

The validator checks:
- Every REQ-GH1-* has corresponding implementation
- Success criteria from the spec are all achievable
- Constraints are respected (localhost only, TS throughout, SSE not WS, file-based storage, MCP-only plugins, Agent SDK v0.2.39+)

## Delegation Guide

Steps requiring specialized expertise:

- **Steps 10-12 (Frontend)**: Frontend design review. The dashboard layout, component hierarchy, and streaming UX should be reviewed for usability. The spec says "dashboard first, not chatbot" so the layout needs to feel like a command center.
- **Step 7a (Agent SDK Verification)**: Must be completed before Step 7b begins. The findings from 7a may require adjusting the approach in 7b, 8, and 12.2. If the SDK API diverges significantly from the research doc, reconvene before proceeding.

## Open Questions

1. **Agent SDK V1 vs V2**: The research mentions a V2 preview with `send()`/`receive()` patterns. Default to V1 (stable) unless Step 7a reveals V2 is clearly better for the streaming use case.

2. **Session and guild-members directory locations**: The plan puts both in the project root. Should these be configurable via environment variables? Default to project root, add env var support if needed during implementation.

3. **Message format in messages.jsonl**: The exact JSON shape for stored messages. Should align with Agent SDK's message types where possible to minimize translation. Define during Step 2, refine during Step 7a when the actual SDK types are confirmed.
