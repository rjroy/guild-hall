---
title: Double status_completed timeline entries on commission completion
date: 2026-03-07
status: resolved
tags: [bug-fix, commissions, infrastructure]
modules: [commission-lifecycle, commission-orchestrator]
---

# Double status_completed Timeline Entries

## What Happens

Every completed commission gets two `status_completed` entries in its activity timeline, seconds apart.

## Why

Two code paths both write `status_completed` during the completion flow:

1. `lifecycle.executionCompleted()` calls `transition()`, which calls `recordOps.writeStatusAndTimeline()` on the **activity worktree** artifact (`lifecycle.ts:348`). This writes `status_completed`.
2. `workspace.finalize()` squash-merges the activity worktree (carrying that entry) into the integration worktree.
3. `syncStatusToIntegration()` then appends a **second** `status_completed` to the integration worktree artifact (`orchestrator.ts:575`).

The same pattern exists for `status_failed` (lifecycle writes one, `syncStatusToIntegration` writes another).

## Fix Direction

`syncStatusToIntegration()` exists to ensure the integration worktree has the correct status after cleanup. Since `workspace.finalize()` already merged the lifecycle's status write, `syncStatusToIntegration` only needs to handle the case where finalize didn't merge (failed commissions, preserved worktrees). For the successful-merge path, the sync is redundant.

Options:
- Skip `syncStatusToIntegration` when `finalizeResult.merged` is true (the squash-merge already carried the status)
- Have `syncStatusToIntegration` check whether the status entry already exists before appending
