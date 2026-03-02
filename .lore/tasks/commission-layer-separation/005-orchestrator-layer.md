---
title: Implement Layer 5 - Orchestrator
date: 2026-03-01
status: complete
tags: [task]
source: .lore/plans/commission-layer-separation.md
related:
  - .lore/specs/commission-layer-separation.md
  - .lore/design/commission-layer-separation.md
sequence: 5
modules: [commission-orchestrator]
---

# Task: Implement Layer 5 - Orchestrator

## What

Create `daemon/services/commission/orchestrator.ts` implementing `CommissionSessionForRoutes` so routes and manager toolbox continue to work unchanged. The orchestrator is the only module that imports from all layers.

**Dependencies**: `CommissionLifecycle` (Layer 2), `WorkspaceOps` (Layer 3), `SessionRunner` (Layer 4), `CommissionRecordOps` (Layer 1, for addUserNote), plus capacity functions, EventBus, config, path utilities.

**Tracked execution state per running commission** (`ExecutionContext`):
- commissionId, projectName, workerName, worktreeDir, branchName, abortController, attempt, checkoutScope, heartbeatTimer

This is the execution half of the old `ActiveCommissionEntry`. The lifecycle owns identity and status; the orchestrator correlates by commissionId.

**Six flows:**

1. **Dispatch flow** (10 steps): validate artifact, check capacity, lifecycle.dispatch, workspace.prepare, lifecycle.executionStarted, create execution context + heartbeat, fire-and-forget session runner, return status.

2. **Session completion flow** (11 steps): clear heartbeat, check aborted, if result submitted: lifecycle.executionCompleted + workspace.finalize (handle merge conflict), if no result: lifecycle.executionFailed + workspace.preserveAndCleanup, sync to integration, cleanup context, scanAutoDispatch + checkDependencyTransitions.

3. **Cancel flow** (5 steps): lifecycle.cancel, if active: abort + clear heartbeat + preserveAndCleanup + sync + cleanup, if pending/blocked: forget, scanAutoDispatch.

4. **Recovery flow** (4 steps): scan state files, register + executionFailed + cleanup for each, scan orphaned worktrees, scanAutoDispatch.

5. **Dependency flow**: scan integration worktree, register blocked commissions with satisfied deps, lifecycle.unblock, forget.

6. **Update flow**: validate status is pending via lifecycle.getStatus, read and modify frontmatter fields via Layer 1, if dependencies changed check if commission should be blocked or unblocked.

**Heartbeat** (REQ-CLS-31a): Per-commission `setTimeout`. Created at `executionStarted`. Reset on each `progressReported` callback. Cleared on any terminal transition. Timeout fires `lifecycle.executionFailed("process unresponsive")` then aborts execution.

**Manager toolbox migration** (two changes to eliminate direct artifact writes):

1. **`manager_dispatched` timeline entry**: The dispatch flow's timeline entry written by `lifecycle.dispatch()` already records dispatch. The Guild Master's attribution is included in the dispatch reason. The manager toolbox's separate `appendTimelineEntry` call is removed. Intentional observable change: `manager_dispatched` event type disappears from new timelines.

2. **`add_commission_note` tool**: Replaced with `commissionSession.addUserNote(cid, content)`. The orchestrator's `addUserNote` writes via Layer 1 directly (not through lifecycle, since notes don't change state) and emits `commission_manager_note` event.

**Open question to resolve**: Whether both manager notes and route-originated notes should emit the same event type, or preserve current behavior (only manager notes trigger SSE). Current behavior can be preserved or unified. Decide during implementation.

Use `pr-review-toolkit:silent-failure-hunter` to review error handling in dispatch, completion, cancel, and recovery flows after implementation.

## Validation

- **Orchestrator wiring test**: Simulate full dispatch-through-completion. Verify Layer 5 calls Layer 3, then Layer 4, translates callbacks to signals, signals reach Layer 2 and produce correct artifact writes.
- **Race condition test**: Concurrent executionCompleted and cancellation for the same commission. Exactly one succeeds.
- **Crash recovery test**: Simulate daemon restart with stale state files and orphaned worktrees. Verify Layer 5 reconciles through Layer 2 signals and Layer 3 cleanup.
- **Heartbeat test**: No progress signal within threshold triggers executionFailed and abort.
- **Merge conflict escalation**: workspace.finalize returns conflict, orchestrator calls executionFailed and creates meeting request.
- **Cancel during workspace preparation**: Cancel arrives between dispatch and executionStarted. Workspace cleaned up, commission cancelled.
- **Dependency auto-transitions**: Blocked commission becomes pending when dependency completes.
- **addUserNote during execution**: Note written to correct worktree (activity, not integration).
- Mock Layer 3 (git) and Layer 4 (SDK session) at their interfaces, but use real Layer 1 (filesystem) and real Layer 2 (lifecycle) for integration testing across layer boundaries.

## Why

From `.lore/specs/commission-layer-separation.md`:

- REQ-CLS-17: Layer 5 mediates between execution layers and lifecycle layer
- REQ-CLS-26: Layer 5 wires everything together, subscribes to Layer 2 events, coordinates Layer 3 and 4
- REQ-CLS-27: Layer 5 owns capacity management
- REQ-CLS-28: Layer 5 owns crash recovery
- REQ-CLS-29: Layer 5 owns auto-dispatch and dependency checking
- REQ-CLS-30: Layer 5 translates Layer 4 session callbacks into Layer 2 signals
- REQ-CLS-30a: Layer 5 owns merge conflict escalation
- REQ-CLS-30b: Layer 5 owns terminal-state artifact visibility
- REQ-CLS-31a: Layer 5 owns heartbeat monitoring

## Files

- `daemon/services/commission/orchestrator.ts` (create)
- `tests/daemon/services/commission/orchestrator.test.ts` (create)
