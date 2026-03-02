---
title: Implement Layer 2 - Commission Lifecycle
date: 2026-03-01
status: complete
tags: [task]
source: .lore/plans/commission-layer-separation.md
related:
  - .lore/specs/commission-layer-separation.md
  - .lore/design/commission-layer-separation.md
sequence: 2
modules: [commission-lifecycle]
---

# Task: Implement Layer 2 - Commission Lifecycle

## What

Create `daemon/services/commission/lifecycle.ts` implementing the `CommissionLifecycle` class from the design doc. Two dependencies: `CommissionRecordOps` (Layer 1) and `emitEvent: (event: SystemEvent) => void`.

**State machine** (8 states, transition graph per REQ-CLS-6):

```
pending     -> dispatched, blocked, cancelled, abandoned
blocked     -> pending, cancelled, abandoned
dispatched  -> in_progress, failed, cancelled
in_progress -> completed, failed, cancelled
completed   -> failed
failed      -> pending, abandoned
cancelled   -> pending, abandoned
abandoned   -> (terminal)
```

**Registration methods:**
- `create(id, projectName, artifactPath, initialStatus)` - write initial status + timeline, track in state map
- `register(id, projectName, status, artifactPath)` - populate state tracker only (recovery)
- `forget(id)` - remove from state tracker (post-cleanup)

**Transition triggers** (named methods, no from-state required from caller):
- `dispatch(id)`, `cancel(id, reason)`, `abandon(id)`, `redispatch(id)`, `block(id)`, `unblock(id)`
- `executionStarted(id, artifactPath)` - also updates the write path
- `executionCompleted(id)`, `executionFailed(id, reason)`

**In-progress signals:**
- `progressReported(id, summary)` - validates in_progress, updates progress via Layer 1
- `resultSubmitted(id, summary, artifacts?)` - validates in_progress + not already submitted, updates result via Layer 1
- `questionLogged(id, question)` - validates in_progress, appends timeline via Layer 1

**Queries:** `getStatus(id)`, `getProjectName(id)`, `getArtifactPath(id)`, `isTracked(id)`, `activeCount`, `setArtifactPath(id, path)`

**Concurrency:** Per-entry promise chain. Lock protects validate-write-update. Event emission after lock release.

**Internal state:** `TrackedCommission` per the design (commissionId, projectName, status, artifactPath, resultSignalReceived, lock). No worktreeDir, branchName, or abortController (those belong to Layer 5).

Use `pr-review-toolkit:type-design-analyzer` to review `CommissionLifecycle`, `TrackedCommission`, and `TransitionResult` types after implementation.

## Validation

- Every valid transition in the graph executes and emits the correct event
- Every invalid transition is rejected with a descriptive error
- Signals validate against current state (progressReported on a pending commission is rejected)
- `resultSubmitted` rejects duplicates (resultSignalReceived flag)
- `executionStarted` updates the artifact path
- Concurrent transitions on the same commission: one executes, the other is skipped with a descriptive reason string in `TransitionResult`
- `create` writes initial status and timeline via Layer 1
- `register` populates state without writing
- `forget` removes from tracker
- Tests use mocked `CommissionRecordOps` (verify correct calls to Layer 1) and spy `emitEvent`

## Why

From `.lore/specs/commission-layer-separation.md`:

- REQ-CLS-6: Layer 2 owns the commission state machine with eight states and the specified transition graph
- REQ-CLS-7: Layer 2 validates every transition against the graph before executing it
- REQ-CLS-8: Layer 2 writes commission artifact updates through Layer 1 as part of transition execution
- REQ-CLS-9: Layer 2 emits events when state changes occur
- REQ-CLS-10: Layer 2 replaces the ActivityMachine for commissions (commission-specific, not shared)
- REQ-CLS-11: Layer 2 handles concurrent transition safety
- REQ-CLS-12: Layer 2 exposes a signal interface for receiving execution updates
- REQ-CLS-13: Signal contract defines progressReported, resultSubmitted, questionLogged, executionStarted, executionFailed, executionCompleted
- REQ-CLS-14: Signals validate against current state before taking effect
- REQ-CLS-15: Signal mechanism is a design decision (design chose direct method calls)

## Files

- `daemon/services/commission/lifecycle.ts` (create)
- `tests/daemon/services/commission/lifecycle.test.ts` (create)
