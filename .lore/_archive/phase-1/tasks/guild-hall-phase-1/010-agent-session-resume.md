---
title: Implement Agent SDK session resume
date: 2026-02-11
status: complete
tags: [task]
source: .lore/plans/phase-1/guild-hall-phase-1.md
sequence: 10
modules: [guild-hall]
related:
  - .lore/specs/phase-1/guild-hall-phase-1.md
  - .lore/plans/phase-1/guild-hall-phase-1.md
---

# Task: Implement Agent SDK session resume

## What

Extend `lib/agent.ts` to support resuming existing SDK sessions:

1. When a session has an existing `sdkSessionId` in `meta.json`, call `query()` with the resume parameter (exact name from task 007 findings)
2. Before querying, ensure MCP servers are running via `mcpManager.startServersForSession()`
3. If resume fails because the session ID is expired (detect the specific error type from task 007 findings), transition session status to `expired` and return an error response
4. When a session is `expired`, the user can start fresh: POST to messages without resume triggers a new `query()` call that produces a new SDK session ID. Context file and message history are preserved. The system prompt tells the new agent session to read `context.md` for orientation.

Update `app/api/sessions/[id]/messages/route.ts`:
- If session has sdkSessionId and status is not expired: resume
- If session has no sdkSessionId or status is expired and user sends a message: start fresh (new query, new SDK session ID)
- Return appropriate error if resume fails

## Validation

- Sending a message to a session with an existing SDK session ID calls `query()` with resume parameter (mocked SDK)
- MCP servers are started before the resume query
- If resume fails with expired session error, session status transitions to `expired`
- `expired` status is persisted in meta.json
- Sending a message to an expired session starts a fresh SDK session (new query without resume)
- Fresh start preserves context.md and messages.jsonl (they are not deleted or reset)
- New SDK session ID is stored in meta.json after fresh start
- The messages route correctly determines whether to resume or start fresh based on session state

## Why

REQ-GH1-21: "Sending a message to an existing session calls query() with the stored SDK session ID, resuming the conversation. MCP servers are restarted if they're not already running."

REQ-GH1-22: "When a stored SDK session ID is no longer valid, the session is marked expired. The user can start a fresh SDK session from the same directory, preserving the context file and message history."

REQ-GH1-33: "When a session expires and the user starts a fresh SDK session, the context file provides continuity."

## Files

- `lib/agent.ts` (modify)
- `app/api/sessions/[id]/messages/route.ts` (modify)
- `tests/lib/agent.test.ts` (modify, add resume tests)
- `tests/api/session-messages.test.ts` (modify, add resume/expire tests)
