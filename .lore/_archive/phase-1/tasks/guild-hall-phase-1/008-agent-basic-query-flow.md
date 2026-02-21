---
title: Implement basic Agent SDK query flow with event bus
date: 2026-02-11
status: complete
tags: [task]
source: .lore/_archive/phase-1/plans/guild-hall-phase-1.md
sequence: 8
modules: [guild-hall]
related:
  - .lore/_archive/phase-1/specs/guild-hall-phase-1.md
  - .lore/_archive/phase-1/plans/guild-hall-phase-1.md
---

# Task: Implement basic Agent SDK query flow with event bus

## What

Build the core agent integration in `lib/agent.ts` (extending the header comment from task 007):

**Query flow** (new session, first message):
1. Get MCP server configs via `mcpManager.getServerConfigs(memberNames)`
2. Build system prompt with context file instructions: read `context.md` at query start, update it as work progresses, keep it concise, remove stale information
3. Call `query()` with: user message, MCP configs, system prompt, permission mode (acceptEdits), working directory = session directory
4. Capture SDK session ID from response, store in `meta.json`
5. Iterate async generator, emit events through event bus
6. After completion: update session metadata (status: idle, increment messageCount, update lastActivityAt)
7. Append user message and assistant response to `messages.jsonl`

**Single-query enforcement**: Track running queries in `Map<sessionId, QueryHandle>`. Reject concurrent queries for the same session.

**Event bus**:
- `subscribe(sessionId, callback)`: Subscribe to events. Returns unsubscribe function.
- `emit(sessionId, event)`: Emit typed event (processing, assistant_text, tool_use, tool_result, status_change, error, done).
- Multiple subscribers per session supported (multiple browser tabs).
- Injected for testability.

**Context file system prompt** (exact text to include in system prompt):
Instructions for the agent to read context.md at query start, update it during work, maintain it as a living summary of goal/decisions/progress/resources.

Create `app/api/sessions/[id]/messages/route.ts`:
- `POST`: Body `{ content: string }`. Starts a query. Returns 202 Accepted. Returns 409 if query already running. Returns 404 if session not found.

## Validation

- Calling the query function with a user message triggers `query()` with correct parameters (mocked SDK)
- SDK session ID is captured and stored in meta.json after first query
- Streaming events from the SDK are translated to typed events and emitted on the event bus
- Session status transitions: idle -> running -> idle on completion
- Message count increments and lastActivityAt updates after query completion
- User message and assistant response are appended to messages.jsonl
- Concurrent query for the same session returns 409
- System prompt includes context file instructions (string match test)
- Event bus supports multiple subscribers and all receive events
- Unsubscribe function stops event delivery to that subscriber

## Why

REQ-GH1-2: "Each user message triggers a `query()` call; the agent runs, completes, and stops. There is no persistent agent process between queries."

REQ-GH1-20: "Creating a session... initializes an Agent SDK session, and records the SDK session ID in metadata."

REQ-GH1-31: "The agent reads the context file at the start of each query."

REQ-GH1-32: "The agent updates the context file as work progresses."

## Files

- `lib/agent.ts` (modify)
- `app/api/sessions/[id]/messages/route.ts` (create)
- `tests/lib/agent.test.ts` (create)
- `tests/api/session-messages.test.ts` (create)
