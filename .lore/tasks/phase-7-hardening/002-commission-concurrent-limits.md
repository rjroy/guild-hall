---
title: Commission Concurrent Limits and FIFO Queue
date: 2026-02-23
status: pending
tags: [task]
source: .lore/plans/phase-7-hardening.md
related: [.lore/specs/guild-hall-commissions.md]
sequence: 2
modules: [guild-hall-core]
---

# Task: Commission Concurrent Limits and FIFO Queue

## What

Add concurrent commission limits with FIFO queuing when capacity is full.

**Config schema** (`lib/config.ts`):
- Add `commissionCap?: number` to `ProjectConfig` (per-project limit, default 3).
- Add `maxConcurrentCommissions?: number` to `AppConfig` (global limit, default 10).

**Dispatch path** (`daemon/routes/commissions.ts`, `daemon/services/commission-session.ts`):
1. Before spawning a worker process, check running commission count against both per-project and global limits.
2. If either limit is reached, return `{ status: "queued" }` instead of `{ status: "accepted" }`. The commission stays `pending`.
3. On commission completion/failure/cancellation, check for pending commissions that can now dispatch. Select the oldest by creation date (FIFO). The "queue" is the set of `pending` commissions sorted by creation date across all projects (single FIFO per REQ-COM-22). The oldest pending commission that also fits within its project's per-project limit gets dispatched next.
4. Auto-dispatch fires the same dispatch sequence: create branch, worktree, spawn process.

**Event types** (`daemon/services/event-bus.ts`):
- Add `commission_queued` SystemEvent (when dispatch is deferred due to capacity).
- Add `commission_dequeued` SystemEvent (when auto-dispatched from queue on capacity open).
- Emit through EventBus so SSE subscribers receive these events.

Reducing limits does not cancel running commissions. Increasing limits immediately auto-dispatches pending commissions up to new capacity.

## Validation

- Dispatch within limits: returns `{ status: "accepted" }`, commission proceeds normally.
- Dispatch at per-project limit: returns `{ status: "queued" }`, commission stays `pending`, `commission_queued` event emitted.
- Dispatch at global limit: returns `{ status: "queued" }` even if per-project limit not reached.
- Commission completion triggers auto-dispatch: oldest pending commission across all projects that fits within its project limit dispatches next. `commission_dequeued` event emitted.
- FIFO ordering: with multiple pending commissions, the oldest by creation date dispatches first.
- Reducing limits: running commissions continue, no new dispatches until count drops below limit.
- Increasing limits: pending commissions auto-dispatch immediately up to new capacity.
- Config schema validates new fields and applies defaults (3 per-project, 10 global).
- Unit tests covering: at-limit queuing, cross-project FIFO ordering, auto-dispatch on capacity open, limit changes.

## Why

From `.lore/specs/guild-hall-commissions.md`:
- REQ-COM-21: "Configurable concurrent commission limits: Per-project limit (default: 3), Global limit (default: 10)."
- REQ-COM-22: "When dispatch would exceed a limit, the commission stays pending. The system dispatches it when capacity opens. Pending commissions dispatch in creation order (FIFO)."
- REQ-COM-23: "Reducing limits does not cancel running commissions; dispatching pauses until the running count falls below the new limit."

From `.lore/design/process-architecture.md`: "the dispatch queue is trivial (readdir + sort by creation date + counter)."

## Files

- `lib/config.ts` (modify: add commission limit fields)
- `daemon/services/commission-session.ts` (modify: capacity check, auto-dispatch)
- `daemon/routes/commissions.ts` (modify: dispatch endpoint returns queued)
- `daemon/services/event-bus.ts` (modify: add event types)
- `tests/daemon/commission-concurrent-limits.test.ts` (create)
