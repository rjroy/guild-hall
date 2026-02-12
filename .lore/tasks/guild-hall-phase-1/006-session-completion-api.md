---
title: Implement session completion endpoint
date: 2026-02-11
status: pending
tags: [task]
source: .lore/plans/guild-hall-phase-1.md
sequence: 6
modules: [guild-hall]
---

# Task: Implement session completion endpoint

## What

Create `app/api/sessions/[id]/complete/route.ts`:

`POST /api/sessions/[id]/complete`: Sets session status to `completed` via `sessionStore.updateMetadata()`. Updates `lastActivityAt`.

Behavior:
- Idle session: set status to `completed`, return 200
- Already completed: no-op, return 200
- Expired session: no-op, return 200
- Running session: return 409 Conflict with message "Stop the running query before completing the session" (aligns with single-query-per-session contract from task 002)
- Nonexistent session: return 404

## Validation

- Completing an idle session sets status to `completed` in meta.json
- Completing an already-completed session returns 200 without modification
- Completing a running session returns 409 with descriptive error message
- Completing a nonexistent session returns 404
- `lastActivityAt` is updated on successful completion

## Why

REQ-GH1-23: "Session statuses: idle (no query running, ready for new messages), running (a query is currently executing), completed (user explicitly ended the session), expired (SDK session ID no longer valid), error (unrecoverable failure)."

REQ-GH1-27: "The backend exposes REST endpoints for: ...completing a session."

## Files

- `app/api/sessions/[id]/complete/route.ts` (create)
- `tests/api/session-complete.test.ts` (create)
