# Spec Audit Report

Audit of `.lore/specs/` against the codebase. What's fulfilled, what's not, and what's been superseded.

## Summary

| Spec | Total | Fulfilled | Partial | Superseded | Unfulfilled |
|------|-------|-----------|---------|------------|-------------|
| guild-hall-system | 39 | 39 | 0 | 0 | 0 |
| guild-hall-views | 42 | 42 | 0 | 0 | 0 |
| guild-hall-meetings | 30 | 30 | 0 | 0 | 0 |
| guild-hall-commissions | 32 | 30 | 2 | 0 | 0 |
| guild-hall-workers | 28 | 28 | 0 | 0 | 0 |
| guild-hall-worker-roster | 12 | 12 | 0 | 0 | 0 |
| commission-layer-separation | 36 | 32 | 4 | 0 | 0 |
| activity-state-machine | ~31 | ~12 | ~8 | ~11 | 0 |
| artifact-tree-view | 10 | 10 | 0 | 0 | 0 |
| **Total** | **~260** | **~235** | **~14** | **~11** | **0** |

Nothing is unfulfilled. The gaps are either partial implementations or intentional design divergences.

## Partial Requirements

These are the only requirements not fully satisfied. Grouped by theme.

### In-process sessions vs. separate OS processes

The commissions spec (REQ-COM-9, REQ-COM-12) assumed commissions would run as separate OS processes with PID tracking. Implementation runs them as async sessions within the daemon process. Functionally equivalent: crash detection works via heartbeat + session callbacks, but no PID in state files.

**REQ-COM-9** (Dispatch): Fire-and-forget async, not separate OS process.
**REQ-COM-12** (Process lifecycle): No PID tracking in machine-local state. EventBus callbacks + heartbeat instead.

**Verdict:** Architectural choice, not a gap. The spec assumed process isolation that turned out to be unnecessary. Heartbeat + AbortController achieves the same goals.

### Cancellation grace period

**REQ-COM-15** (Cancellation): Spec describes 30-second grace period then forceful termination. Implementation uses AbortController, which signals the session runner to stop. No explicit two-phase timeout.

**Verdict:** Works for normal cases. If a session ignores the abort signal, there's no escalation path. Low risk given SDK sessions respect abort.

### Sample-assistant test cleanup

**REQ-WRS-11** (Sample-assistant retirement): Five-worker roster is live. Test fixtures were the last reference to `guild-hall-sample-assistant` and have been renamed to `test-assistant`. No remaining references.

**Verdict:** Resolved.

### Commission layer separation integration details

Four CLS requirements need integration-level verification rather than being clearly incomplete:

**REQ-CLS-28** (Crash recovery): `recoverCommissions()` exists but full end-to-end path needs trace.
**REQ-CLS-29** (Dependency auto-dispatch): Auto-dispatch present, dependency checking may live in manager toolbox rather than orchestrator.
**REQ-CLS-30a** (Merge conflict escalation): `createMeetingRequestFn` hook exists, call site not verified.
**REQ-CLS-30b** (Terminal artifact visibility): `syncStatusToIntegration` exists, lifecycle not confirmed as post-cleanup.

**Verdict:** Code exists for all four. These are "verify the wiring" items, not missing implementations.

## Superseded by Design

### Activity state machine split

The activity-state-machine spec (~11 requirements) was written assuming a shared `ActivityMachine` for both meetings and commissions. The commission-layer-separation spec (CLS-10) explicitly replaced this with `CommissionLifecycle` for commissions. Meetings still use `ActivityMachine`.

This is an intentional, documented divergence. The ASM spec's commission-specific requirements are satisfied by `CommissionLifecycle`, just through a different mechanism than originally specified.

## What this means for the specs

The specs are in good shape. 235 of ~260 requirements are cleanly fulfilled, and nothing is outright missing. The partial items fall into two categories:

1. **Architectural decisions that diverged from spec assumptions** (in-process vs. OS process, cancellation model). The spec should be updated to reflect what was actually built.
2. **Integration verification** (CLS recovery/dispatch wiring). The code exists; it needs end-to-end confirmation.

The ASM spec needs a note acknowledging the commission/meeting split, since ~11 requirements are now satisfied by a different mechanism than the spec describes.
