---
title: Implement cancel and delete handlers
date: 2026-02-17
status: complete
tags: [task]
source: .lore/plans/worker-dispatch.md
related:
  - .lore/specs/phase-1/worker-dispatch.md
sequence: 9
modules: [researcher-plugin]
---

# Task: Implement Cancel and Delete Handlers

## What

Implement `worker/cancel` and `worker/delete` handlers. This task covers the passive (filesystem) parts. The active part of cancel (aborting the Agent SDK session) is wired in Task 012.

**worker/cancel handler**: Accepts `{ jobId: string }`. Updates `meta.json` status to "cancelled", sets `completedAt`. Returns `{ jobId, status: "cancelled" }`.

Idempotent: cancelling an already-completed or already-cancelled job is a no-op that returns the current status. This follows REQ-WD-16.

The handler should accept an optional callback or injected `abortFn` that Task 012 will provide to also call `abortController.abort()` on the running Agent SDK session. For now, the handler just updates filesystem state.

**worker/delete handler**: Accepts `{ jobId: string }`. Checks status via `jobStore.getJob(jobId)`:
- If "completed" or "cancelled": calls `jobStore.deleteJob(jobId)`, returns `{ jobId, deleted: true }`
- If "running" or "failed": returns JSON-RPC error code -32602 with message explaining why deletion is blocked
- If unknown jobId: returns JSON-RPC error code -32602

Deletion is permanent (REQ-WD-18). The job directory and all contents are removed.

Wire both handlers into `server.ts`.

## Validation

- Cancel updates status to "cancelled" with completedAt
- Cancel returns `{ jobId, status: "cancelled" }`
- Cancel on already-completed job returns current status (no-op)
- Cancel on already-cancelled job returns current status (no-op)
- Cancel on unknown jobId returns JSON-RPC error
- Delete removes directory for completed job
- Delete removes directory for cancelled job
- Delete returns JSON-RPC error on running job with descriptive message
- Delete returns JSON-RPC error on failed job with descriptive message
- Delete returns JSON-RPC error on unknown jobId
- Deleted job is no longer returned by listJobs
- 90%+ coverage

## Why

From `.lore/specs/phase-1/worker-dispatch.md`:
- REQ-WD-16: `worker/cancel` terminates session, cancelling completed/cancelled is no-op
- REQ-WD-17: `worker/delete` removes job directory, only completed/cancelled can be deleted
- REQ-WD-18: Deletion is permanent

## Files

- `guild-members/researcher/handlers.ts` (modify: add cancel and delete handlers)
- `guild-members/researcher/server.ts` (modify: wire cancel and delete handlers)
- `tests/researcher/handlers-cancel-delete.test.ts` (create)
