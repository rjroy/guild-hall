---
title: Implement dispatch and list handlers
date: 2026-02-17
status: pending
tags: [task]
source: .lore/plans/worker-dispatch.md
related:
  - .lore/specs/worker-dispatch.md
sequence: 7
modules: [researcher-plugin]
---

# Task: Implement Dispatch and List Handlers

## What

Implement `worker/dispatch` and `worker/list` handlers on top of JobStore, and wire them into the researcher server.

**worker/dispatch handler**: Accepts `{ description: string, task: string, config?: object }`. Calls `jobStore.createJob(description, task, config)`. Returns `{ jobId }`.

The actual agent spawn happens in Task 012. For now, dispatch creates the job directory with status "running" and returns immediately. Tests in this task do not verify status transitions beyond "running."

**worker/list handler**: Accepts `{ detail?: "simple" | "detailed", filter?: string }`. Calls `jobStore.listJobs()`. If `filter` is provided, match against `description` using glob (`picomatch`, added as dependency in Task 006). Return shape depends on `detail`:

- Simple (default): `{ jobs: [{ jobId, status }] }`
- Detailed: `{ jobs: [{ jobId, status, description, summary }] }` where `summary` comes from `jobStore.readSummary(jobId)` (may be null)

**Wiring**: Replace the stub handlers in `server.ts` for `worker/dispatch` and `worker/list` with calls to the real handlers. Create a `handlers.ts` module (or add to existing) following the DI factory pattern.

## Validation

- Dispatch creates job and returns jobId
- Dispatch writes task.md with correct content
- Dispatch writes config.json (or empty object when no config)
- Dispatch sets meta.json status to "running" with startedAt
- List returns all jobs in simple mode (default)
- List returns all jobs in detailed mode with summary
- List with filter returns only matching descriptions
- List with filter handles glob patterns (wildcards, partial matches)
- List returns empty array when no jobs exist
- Handlers use injected JobStore (no real disk in tests)
- 90%+ coverage

## Why

From `.lore/specs/worker-dispatch.md`:
- REQ-WD-5: `worker/dispatch` accepts `{ description, task, config? }` and returns `{ jobId }` within 30s timeout
- REQ-WD-6: `description` is short label, `task` is full prompt, `config` is plugin-specific
- REQ-WD-8: `worker/list` accepts `{ detail?, filter? }`, filter matches as glob against descriptions
- REQ-WD-9: Simple mode returns `{ jobs: [{ jobId, status }] }`
- REQ-WD-10: Detailed mode returns `{ jobs: [{ jobId, status, description, summary }] }`

## Files

- `guild-members/researcher/handlers.ts` (create)
- `guild-members/researcher/server.ts` (modify: wire dispatch and list handlers)
- `tests/researcher/handlers-dispatch-list.test.ts` (create)
