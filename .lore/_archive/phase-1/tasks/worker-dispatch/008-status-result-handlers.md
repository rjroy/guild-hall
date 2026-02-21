---
title: Implement status and result handlers
date: 2026-02-17
status: complete
tags: [task]
source: .lore/_archive/phase-1/plans/worker-dispatch.md
related:
  - .lore/_archive/phase-1/specs/worker-dispatch.md
sequence: 8
modules: [researcher-plugin]
---

# Task: Implement Status and Result Handlers

## What

Implement `worker/status` and `worker/result` handlers in the researcher plugin.

**worker/status handler**: Accepts `{ jobId: string }`. Reads from JobStore:
- `getJob(jobId)` for metadata (jobId, status, description, startedAt, completedAt)
- `readSummary(jobId)` for self-reported progress
- `readQuestions(jobId)` for unresolved questions
- `readDecisions(jobId)` for autonomous decisions
- Error field from meta.json (set on failure)

Returns the full status object per REQ-WD-11:
```typescript
{
  jobId: string,
  status: "running" | "completed" | "failed" | "cancelled",
  description: string,
  summary: string | null,
  questions: string[] | null,
  decisions: Array<{ question: string, decision: string, reasoning: string }> | null,
  error: string | null,
  startedAt: string,
  completedAt: string | null
}
```

Unknown jobId returns JSON-RPC error code -32602 (invalid params) with descriptive message.

**worker/result handler**: Accepts `{ jobId: string }`. Returns `{ jobId, output, artifacts }` where:
- `output` is the text content of `result.md`
- `artifacts` is a list of filenames in the `artifacts/` subdirectory (or null if empty/missing)

Returns JSON-RPC error if job is still running, was cancelled, or failed.

Wire both handlers into `server.ts`.

## Validation

- Status returns all fields for a running job (summary null, questions null, decisions null)
- Status returns all fields for a completed job (with completedAt)
- Status includes questions when present (array of strings)
- Status includes decisions when present (array of objects with question/decision/reasoning)
- Status includes error for failed jobs
- Unknown jobId returns JSON-RPC error code -32602 with descriptive message
- Result returns output and artifacts for completed job
- Result returns null artifacts when no artifacts exist
- Result returns JSON-RPC error on running job
- Result returns JSON-RPC error on cancelled job
- Result returns JSON-RPC error on failed job
- 90%+ coverage

## Why

From `.lore/_archive/phase-1/specs/worker-dispatch.md`:
- REQ-WD-11: `worker/status` response shape with all fields
- REQ-WD-12: `questions` contains unresolved questions the worker documented
- REQ-WD-13: `decisions` contains judgment calls the worker made autonomously
- REQ-WD-14: `worker/result` returns output, errors on non-complete
- REQ-WD-15: Result format with output and artifacts
- REQ-WD-46: Unknown job ID returns JSON-RPC error code -32602

## Files

- `guild-members/researcher/handlers.ts` (modify: add status and result handlers)
- `guild-members/researcher/server.ts` (modify: wire status and result handlers)
- `tests/researcher/handlers-status-result.test.ts` (create)
