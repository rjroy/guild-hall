---
title: Daemon HTTP API
date: 2026-02-21
status: pending
tags: [task]
source: .lore/plans/phase-2-workers-first-audience.md
related:
  - .lore/specs/guild-hall-meetings.md
  - .lore/design/process-architecture.md
  - .lore/retros/sse-streaming-bug-fix.md
sequence: 7
modules: [guild-hall-core]
---

# Task: Daemon HTTP API

## What

Create HTTP routes that expose the meeting session and worker discovery through the daemon's Hono app, with SSE streaming for real-time responses.

**`daemon/routes/meetings.ts`:**

- `POST /meetings`: Create meeting and stream first turn. Request body: `{ projectName, workerName, prompt }`. Response: `200 text/event-stream` with SSE events. First event is always `session` (contains meetingId, sessionId). Stream closes after turn completes. Uses Hono's `streamSSE()` helper. SSE streaming retro lesson: POST returns the stream directly (no separate GET subscribe).
- `POST /meetings/:meetingId/messages`: Send follow-up message. Request body: `{ message }`. Response: same SSE format. Validates meetingId exists and is open.
- `DELETE /meetings/:meetingId`: Close meeting. Response: `200 { status: "ok" }`.
- `POST /meetings/:meetingId/interrupt`: Stop current generation. Response: `200 { status: "ok" }`.

**`daemon/routes/workers.ts`:**

- `GET /workers`: List discovered worker packages. Response: `200 { workers: [{ name, displayTitle, description, portraitUrl? }] }`. Portraits base64-encoded in response payload for Phase 2 simplicity.

**Update `daemon/app.ts`** to mount meeting and worker routes.

**Production wiring verification** (worker-dispatch retro): The daemon's `app.ts` must instantiate a real `MeetingSession` service with real dependencies (discovered packages, config, real SDK query function). Routes receive the service instance, not a factory. Verify the wiring in `daemon/index.ts` or `daemon/app.ts` connects real dependencies end-to-end.

## Validation

- `POST /meetings` returns SSE stream with `session` event first, then `text_delta`/`tool_use`/`tool_result` events, then `turn_end`
- `POST /meetings` with invalid project returns 404
- `POST /meetings` with unknown worker returns 404
- `POST /meetings` when cap reached returns 409
- `POST /meetings/:id/messages` returns SSE stream for follow-up
- `POST /meetings/:id/messages` with unknown meeting returns 404
- `DELETE /meetings/:id` closes meeting, returns 200
- `POST /meetings/:id/interrupt` stops generation, returns 200
- `GET /workers` returns discovered workers with metadata
- SSE events are properly formatted (`data:` prefix, double newline termination)
- Error during streaming emits error event and closes stream cleanly

## Why

From `.lore/specs/guild-hall-meetings.md`:
- REQ-MTG-14: Meeting responses stream incrementally
- REQ-MTG-15: Event types visible to the UI

From `.lore/design/process-architecture.md`: Daemon API endpoints, SSE event stream design.

From `.lore/retros/sse-streaming-bug-fix.md`: POST must confirm before GET subscribes. The daemon's POST /meetings returns the SSE stream directly.

## Files

- `daemon/routes/meetings.ts` (create)
- `daemon/routes/workers.ts` (create)
- `daemon/app.ts` (modify: mount routes, wire dependencies)
- `daemon/index.ts` (modify if wiring needs updating)
- `tests/daemon/routes/meetings.test.ts` (create)
- `tests/daemon/routes/workers.test.ts` (create)
