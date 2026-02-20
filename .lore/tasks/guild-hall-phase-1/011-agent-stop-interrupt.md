---
title: Implement agent stop/interrupt
date: 2026-02-11
status: complete
tags: [task]
source: .lore/plans/guild-hall-phase-1.md
sequence: 11
modules: [guild-hall]
related:
  - .lore/specs/phase-1/guild-hall-phase-1.md
  - .lore/plans/guild-hall-phase-1.md
---

# Task: Implement agent stop/interrupt

## What

Extend `lib/agent.ts` to support stopping a running query:

- The running query map (`Map<sessionId, QueryHandle>`) from task 008 already tracks active queries
- Add a `stopQuery(sessionId: string)` method that retrieves the handle and calls the SDK's interrupt method (exact name from task 007 findings)
- After interruption, session status returns to `idle`, lastActivityAt is updated
- Emit a `status_change` event through the event bus so SSE clients are notified

Create `app/api/sessions/[id]/stop/route.ts`:
- `POST`: Calls `stopQuery(sessionId)`. Returns 200 on success. Returns 409 if no query is running. Returns 404 if session not found.

## Validation

- Calling stop on a running query invokes the SDK interrupt method (mocked SDK)
- After stop, session status transitions from `running` to `idle`
- Stop emits a `status_change` event with `idle` status on the event bus
- Calling stop when no query is running returns 409
- Calling stop for a nonexistent session returns 404
- The interrupted query's async generator terminates cleanly (no dangling promises)

## Why

REQ-GH1-17: "The Workshop provides a stop control that interrupts the agent mid-execution."

## Files

- `lib/agent.ts` (modify)
- `app/api/sessions/[id]/stop/route.ts` (create)
- `tests/lib/agent.test.ts` (modify, add stop tests)
- `tests/api/session-stop.test.ts` (create)
