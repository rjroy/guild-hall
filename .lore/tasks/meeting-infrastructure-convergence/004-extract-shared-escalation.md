---
title: Extract shared merge conflict escalation
date: 2026-03-02
status: pending
tags: [task]
source: .lore/plans/meeting-infrastructure-convergence.md
related: [.lore/specs/meeting-infrastructure-convergence.md]
sequence: 4
modules: [escalation, commission-orchestrator]
---

# Task: Extract shared merge conflict escalation

## What

Create `daemon/lib/escalation.ts` with a single exported function:

```typescript
escalateMergeConflict(opts: {
  activityType: "commission" | "meeting";
  activityId: string;
  branchName: string;
  projectName: string;
  createMeetingRequest: (params: { projectName: string; workerName: string; reason: string }) => Promise<void>;
  managerPackageName: string;
}): Promise<void>
```

The function builds a reason string parameterized by `activityType` and `activityId`, including the branch name and instructions for manual resolution. It calls `createMeetingRequest` and wraps in try/catch with `console.error` on failure. The error is logged, not rethrown.

Wire into `daemon/services/commission/orchestrator.ts` immediately: replace the inline escalation block (approximately lines 585-607) with a call to `escalateMergeConflict`. The meeting wiring happens in task 006 when the orchestrator is rewritten.

## Validation

- `escalateMergeConflict` exists at `daemon/lib/escalation.ts`.
- Reason message contains the activity ID and branch name for both `"commission"` and `"meeting"` activity types.
- When `createMeetingRequest` succeeds, the function completes without error.
- When `createMeetingRequest` throws, the error is caught, logged via `console.error`, and not rethrown.
- Commission orchestrator calls `escalateMergeConflict` instead of inline escalation logic.
- All existing commission tests pass with no modifications.
- Unit tests in `tests/daemon/lib/escalation.test.ts`.

## Why

From `.lore/specs/meeting-infrastructure-convergence.md`:
- REQ-MIC-6: "Merge conflict escalation to Guild Master is shared between commissions and meetings. A single escalation function creates a Guild Master meeting request with conflict details."

## Files

- `daemon/lib/escalation.ts` (create)
- `daemon/services/commission/orchestrator.ts` (modify)
- `tests/daemon/lib/escalation.test.ts` (create)
