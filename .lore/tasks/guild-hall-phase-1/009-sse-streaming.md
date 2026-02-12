---
title: Implement SSE streaming endpoint
date: 2026-02-11
status: pending
tags: [task]
source: .lore/plans/guild-hall-phase-1.md
sequence: 9
modules: [guild-hall]
---

# Task: Implement SSE streaming endpoint

## What

Create `lib/sse.ts`:
- `formatSSEEvent(type: string, data: object): string`: Produces `event: {type}\ndata: {JSON}\n\n` formatted string.

Create `app/api/sessions/[id]/events/route.ts`:

`GET /api/sessions/[id]/events`: Returns a `ReadableStream` with SSE headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`).

**Event types** (matching SSEEventSchema from task 002):
- `processing`: Agent working, no output yet
- `assistant_text`: `{ text: string }` streamed chunk
- `tool_use`: `{ toolName, toolInput, toolUseId }`
- `tool_result`: `{ toolUseId, result }`
- `status_change`: `{ status: SessionStatus }`
- `error`: `{ message, recoverable }`
- `done`: Query completed, stream closes

**Connection behavior**:
- Client connects, no query running: send `status_change` with current status, close
- Client connects, query running (normal): subscribe to event bus, forward events until `done`
- Client connects mid-query (reconnection after page refresh): send `status_change` with `running`, forward events from current point (no replay). Client fetches full conversation via GET after query completes.
- Multiple SSE connections to the same session are supported (event bus allows multiple subscribers)

**Cleanup**: Unsubscribe from event bus when SSE connection closes (client disconnect or stream end).

## Validation

- `formatSSEEvent` produces correctly formatted SSE strings with proper newlines
- SSE endpoint returns correct headers (Content-Type, Cache-Control, Connection)
- When no query is running, endpoint sends status_change and closes
- When a query is running, endpoint forwards events from the event bus
- Mid-query connection sends `running` status then forwards subsequent events
- Stream closes after `done` event
- Client disconnect triggers cleanup (unsubscribe from event bus)
- Multiple simultaneous connections to the same session all receive events

## Why

REQ-GH1-3: "While a query is executing, agent activity streams from backend to frontend via SSE. The SSE connection is open for the duration of a query, not permanently."

REQ-GH1-28: "The backend exposes an SSE endpoint for subscribing to session events. Event types include: processing, assistant text, tool use, tool result, session status change, and error."

## Files

- `lib/sse.ts` (create)
- `app/api/sessions/[id]/events/route.ts` (create)
- `tests/lib/sse.test.ts` (create)
- `tests/api/session-events.test.ts` (create)
