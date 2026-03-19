---
title: "Plan: Commission halted state and continuation"
date: 2026-03-16
status: executed
tags: [commissions, lifecycle, halted, continuation, max-turns, recovery]
modules: [commission/lifecycle, commission/orchestrator, manager-toolbox, commission-routes, lib/commissions, daemon/types]
related:
  - .lore/specs/commissions/commission-halted-continuation.md
  - .lore/specs/commissions/guild-hall-commissions.md
  - .lore/plans/commissions/abandoned-commission-state.md
---

# Plan: Commission Halted State and Continuation

## Spec Reference

**Spec**: `.lore/specs/commissions/commission-halted-continuation.md`

Requirements addressed:
- REQ-COM-33: `halted` status definition → Phase 1
- REQ-COM-34: Ten commission states → Phase 1
- REQ-COM-35: `halted` transition edges → Phase 1
- REQ-COM-36: maxTurns without result triggers `halted` → Phase 2
- REQ-COM-37: Halted state file persistence → Phase 2
- REQ-COM-38: Worktree preservation (no deletion) → Phase 2
- REQ-COM-39: `continue` action definition → Phase 3
- REQ-COM-40: `continue` implementation flow → Phase 3
- REQ-COM-40a: Fresh turn budget on continue → Phase 3
- REQ-COM-41: Continuation prompt content → Phase 3
- REQ-COM-42: `save` action definition → Phase 4
- REQ-COM-43: `save` implementation flow → Phase 4
- REQ-COM-44: Partial result recording → Phase 4
- REQ-COM-45: `halt_count` artifact field → Phase 2
- REQ-COM-45a: Timeline events for halt/continue/save → Phases 2, 3, 4
- REQ-COM-46: Crash recovery for halted commissions → Phase 5
- REQ-COM-47: Halted commissions don't count against cap → Phase 2
- REQ-COM-48: `check_commission_status` updates → Phase 6
- REQ-COM-49: Manager toolbox `continue_commission` and `save_commission` → Phase 6
- REQ-COM-50: Divergence from sleeping (design guidance) → all phases

## Codebase Context

### State Machine (Layer 2)

`daemon/services/commission/lifecycle.ts` owns the `TRANSITIONS` graph (line 48). Currently 9 states including `sleeping`. The `halted` state needs to be added here with edges matching REQ-COM-35. The lifecycle class uses a per-entry promise chain for concurrency control and defers event emission until after lock release.

New methods needed: `halt()` and an overload point for `continue` (careful: `continue` is a JS keyword; the mail system uses `wake()` for sleeping -> in_progress). The spec says `halted -> in_progress` via continue, which is the same target state as `wake()`. A new `continueHalted()` method with a distinct reason string avoids conflating the two flows.

### Commission Status Type

`daemon/types.ts:39` defines `CommissionStatus` as a union of 9 string literals. `"halted"` must be added. Every `switch` or conditional on `CommissionStatus` across the codebase needs to handle the new state. Key locations:
- `lifecycle.ts` TRANSITIONS map
- `orchestrator.ts` handleSessionCompletion, cancelCommission, recovery
- `lib/commissions.ts` STATUS_GROUP for sorting
- `daemon/services/manager/toolbox.ts` SUMMARY_GROUP for list counts

### Orchestrator (Layer 5)

`daemon/services/commission/orchestrator.ts` (900+ lines) is where the halt entry and continue/save flows live. Three areas need changes:

1. **handleSessionCompletion** (line 509): Currently, when `resultSubmitted === false`, the orchestrator calls `failAndCleanup`. The spec (REQ-COM-36) says when `outcome.reason === "maxTurns"` and `resultSubmitted === false`, transition to `halted` instead. This is the branching point.

2. **New `continueCommission()` and `saveCommission()` methods** on `CommissionSessionForRoutes` (line 94): Follow the pattern of `dispatchCommission()` and `cancelCommission()`. `continue` reads state file, validates worktree, transitions, launches session. `save` reads state file, validates worktree, runs squash-merge, transitions to completed.

3. **Recovery** (line 1040 area): Currently only recovers `dispatched`, `in_progress`, and `sleeping`. Must add `halted` recovery: worktree exists -> register as halted (no action needed), worktree missing -> transition to failed.

### Mail Orchestrator Precedent

`daemon/services/mail/orchestrator.ts` provides the exact pattern for worktree preservation and session resume:
- **Sleep entry** (line 212): commit pending changes, extract sessionId, transition state, write state file, append timeline
- **Wake/resume** (line 501): read state file, transition sleeping -> in_progress, update state file, prepare SDK session with `resume: sessionId`
- **resumeCommissionSession** (line 566): prepares `SessionPrepSpec` with `resume: sessionId`, subscribes to EventBus, drains session, handles completion

The halted flow reuses this pattern but with different triggers and prompt content.

### Capacity

`daemon/services/commission/capacity.ts` checks `executions` map size. Halted commissions won't be in `executions` (they're removed on halt, like sleeping commissions are removed on sleep at orchestrator.ts:1898). When a halted commission continues, it re-enters `executions` and the capacity check runs before launch.

### Manager Toolbox

`daemon/services/manager/toolbox.ts` (1200+ lines) needs two new tool handlers: `makeContinueCommissionHandler` and `makeSaveCommissionHandler`. Follow the factory pattern of existing handlers. The `CommissionSessionForRoutes` interface is the contract; the manager toolbox calls through it.

### Commission Routes

`daemon/routes/commissions.ts` defines routes using the capability-oriented path grammar. New routes needed:
- `POST /commission/run/continue` (alongside dispatch, cancel, redispatch, abandon)
- `POST /commission/run/save`

### Sorting, Display, and Gem Colors

`lib/commissions.ts:248` STATUS_GROUP needs `halted: 1` (active group, per REQ-COM-48). The SUMMARY_GROUP in toolbox.ts:951 needs `halted: "active"`.

`lib/types.ts` has `ARTIFACT_STATUS_GROUP` which controls `statusToGem()` across the entire UI. Without an entry for `halted`, it falls through to the default red gem (blocked/failed). `halted` should map to group 1 (same as `sleeping`, active/in-progress gem). This is a one-liner but missing it means every halted commission displays as failed in the UI.

## Implementation Steps

### Phase 1: State machine and type

Add `halted` to the type system and transition graph. This phase is pure Layer 2 work with no orchestrator changes. All existing tests must continue passing.

#### Step 1.1: Add `halted` to CommissionStatus

**Files**: `daemon/types.ts`
**Addresses**: REQ-COM-33, REQ-COM-34

Add `"halted"` to the `CommissionStatus` union type at line 39.

#### Step 1.2: Add `halted` transitions to lifecycle

**Files**: `daemon/services/commission/lifecycle.ts`
**Addresses**: REQ-COM-35

Update the `TRANSITIONS` map at line 48:
- Add `in_progress` targets: append `"halted"` to the existing array
- Add `halted` entry: `["in_progress", "completed", "cancelled", "abandoned", "failed"]`

Add two new trigger methods:
- `halt(id, reason)`: transitions to `"halted"` (like `sleep()` but for the halted state)
- `continueHalted(id, reason)`: transitions from `halted` to `"in_progress"` (like `wake()` but semantically distinct)

#### Step 1.3: Update activeCount

**Files**: `daemon/services/commission/lifecycle.ts`
**Addresses**: REQ-COM-47

The `activeCount` getter at line 302 counts `dispatched` and `in_progress`. `halted` must NOT be counted here (same as `sleeping`). No change needed to this getter since `halted` is neither `dispatched` nor `in_progress`, but verify the capacity logic in the orchestrator is consistent (it uses the `executions` map, not `activeCount`).

#### Step 1.4: Update sorting, display, and gem mappings

**Files**: `lib/commissions.ts`, `daemon/services/manager/toolbox.ts`, `lib/types.ts`
**Addresses**: REQ-COM-48 (partial: sorting and display)

In `lib/commissions.ts` STATUS_GROUP (line 248): add `halted: 1` (active group).

In `daemon/services/manager/toolbox.ts` SUMMARY_GROUP (line 951): add `halted: "active"`.

In `lib/types.ts` ARTIFACT_STATUS_GROUP: add `halted` to group 1 (same as `sleeping`, `in_progress`). This controls `statusToGem()` which determines gem colors across the entire UI. Without this, halted commissions show a red gem (indistinguishable from failed).

#### Step 1.5: Tests for Phase 1

**Files**: `tests/daemon/services/commission/lifecycle.test.ts` (new or existing)
**Expertise**: none

- Verify `halted` transitions: in_progress -> halted succeeds
- Verify halted -> in_progress, halted -> completed, halted -> cancelled, halted -> abandoned, halted -> failed all succeed
- Verify invalid transitions are rejected: halted -> pending, halted -> dispatched, halted -> blocked, halted -> sleeping
- Verify `activeCount` does not include halted commissions

### Phase 2: Halt entry path

Wire the orchestrator to transition to `halted` instead of `failed` when maxTurns is reached without a result. Includes state file persistence, worktree preservation, timeline events, and `halt_count`.

#### Step 2.1: Branch handleSessionCompletion for maxTurns

**Files**: `daemon/services/commission/orchestrator.ts`
**Addresses**: REQ-COM-36, REQ-COM-38

In `handleSessionCompletion` (line 509), before the existing `failAndCleanup` path at line 541, add a check:

```
if (!resultSubmitted && outcome.reason === "maxTurns") {
  await handleHalt(ctx, outcome);
  return;  // skip the existing fail path
}
```

The new `handleHalt` function:
1. Commits pending changes to the commission branch (like sleep entry at mail/orchestrator.ts:217)
2. Extracts `sessionId` from outcome. If null, fall through to `failAndCleanup` with reason "Halt failed: no session ID"
3. Transitions via `lifecycle.halt()`
4. Reads the latest `current_progress` from the artifact via `recordOps`
5. Writes halted state file (REQ-COM-37)
6. Increments `halt_count` in the artifact frontmatter (REQ-COM-45)
7. Appends `status_halted` timeline event with `turnsUsed` and `lastProgress` (REQ-COM-45a)
8. Syncs status to integration worktree
9. Removes from `executions` map (like sleeping at line 1898)
10. Does NOT call `lifecycle.forget()` (the commission stays tracked as `halted`)
11. Calls `enqueueAutoDispatch()` (frees a capacity slot)

#### Step 2.2: Add halt_count support to CommissionRecordOps

**Files**: `daemon/services/commission/record.ts`
**Addresses**: REQ-COM-45

Add a method to increment `halt_count` in the artifact frontmatter. If the field doesn't exist, initialize it to 1. Use the `replaceYamlField` utility from `daemon/lib/record-utils.ts` following the pattern of existing field updates.

Also add a method or parameter to read `current_progress` for inclusion in the state file.

#### Step 2.3: State file format

**Files**: `daemon/services/commission/orchestrator.ts`
**Addresses**: REQ-COM-37

The state file for halted commissions uses the existing `writeStateFile` helper. Shape:
```json
{
  "commissionId": "...",
  "projectName": "...",
  "workerName": "...",
  "status": "halted",
  "worktreeDir": "/absolute/path",
  "branchName": "claude/commission/...",
  "sessionId": "...",
  "haltedAt": "2026-03-16T...",
  "turnsUsed": 150,
  "lastProgress": "..."
}
```

This follows the sleeping state file pattern from `daemon/services/mail/types.ts`. A new `HaltedCommissionState` type should be defined alongside `SleepingCommissionState`.

#### Step 2.4: Tests for Phase 2

**Files**: `tests/daemon/services/commission/orchestrator.test.ts` (extend existing)
**Expertise**: none

- Simulate `outcome.reason === "maxTurns"` with `resultSubmitted === false`. Verify: commission transitions to `halted`, worktree is NOT deleted, state file contains all required fields, `halt_count` is 1, timeline has `status_halted` event, commission is removed from `executions`.
- Simulate `outcome.reason === "maxTurns"` with `resultSubmitted === true`. Verify: normal completion path (result wins over maxTurns).
- Simulate `outcome.reason === "maxTurns"` with no sessionId. Verify: falls through to `failAndCleanup`.
- Verify halted commission does not count against capacity (check `executions` map and `isAtCapacity`).

### Phase 3: Continue action

Resume a halted commission in the same worktree with a new SDK session. This is the heaviest phase: it mirrors the mail orchestrator's wake flow.

#### Step 3.1: Add continueCommission to CommissionSessionForRoutes

**Files**: `daemon/services/commission/orchestrator.ts`
**Addresses**: REQ-COM-39

Add to the interface (line 94):
```typescript
continueCommission(commissionId: CommissionId): Promise<{ status: "accepted" | "capacity_error" }>;
```

#### Step 3.2: Implement continueCommission

**Files**: `daemon/services/commission/orchestrator.ts`
**Addresses**: REQ-COM-39, REQ-COM-40, REQ-COM-40a, REQ-COM-41, REQ-COM-47

Implementation flow (mirroring `wakeCommission` at mail/orchestrator.ts:501):

1. Read halted state file to get `worktreeDir`, `branchName`, `sessionId`, `workerName`, `lastProgress`, `turnsUsed`.
2. Verify worktree exists on disk. If missing: `lifecycle.executionFailed()`, sync status, update state file, `lifecycle.forget()`, return error.
3. Check capacity via `isAtCapacity()`. If at limit: return `{ status: "capacity_error" }`. Do not change commission status (REQ-COM-47).
4. Transition `halted -> in_progress` via `lifecycle.continueHalted()`.
5. Update state file to `status: "in_progress"`.
6. Append timeline event: `status_in_progress` with reason "Continued from halted state".
7. Build continuation prompt (REQ-COM-41).
8. Create `ExecutionContext`, add to `executions` map.
9. Build `SessionPrepSpec` with `resume: sessionId` (like mail/orchestrator.ts:617-637).
10. Fire-and-forget: launch resumed session via a new `runContinuedCommissionSession` (or reuse `runCommissionSession` with the continuation prompt).

The continuation prompt (REQ-COM-41):
```
This commission was halted because it reached the turn limit ({turnsUsed} turns used).

Your last progress update was: {lastProgress}

Continue working on the commission from where you left off. Your worktree contains all the work you've done so far. Review what remains and complete the task. When finished, call submit_result with your summary.
```

**Fresh turn budget (REQ-COM-40a)**: The resumed session gets the same `maxTurns` as the original dispatch. Read `resource_overrides` from the commission artifact to determine this. `drainSdkSession` receives `maxTurns` from `options.maxTurns` which comes from `prepareSdkSession`, so this happens automatically when the session is prepared with the same worker package and resource overrides.

#### Step 3.3: Session completion after continue

When a continued session completes, it flows through the same `handleSessionCompletion`. If it hits maxTurns again without result, `handleHalt` fires again: `halt_count` increments, same state file pattern. If result is submitted, normal completion. If mail is sent, sleep flow. All existing paths work because the continued session is a normal SDK session in the same `ExecutionContext` shape.

The only subtlety: `handleHalt` must re-read and increment `halt_count` (not set to 1), which is handled by the increment logic in Step 2.2.

#### Step 3.4: Add continue route

**Files**: `daemon/routes/commissions.ts`
**Addresses**: REQ-COM-49 (route exposure)

Add `POST /commission/run/continue` following the pattern of dispatch (line 173):
- Read `commissionId` from body
- Call `commissionSession.continueCommission(commissionId)`
- Return result or error

#### Step 3.5: Tests for Phase 3

**Files**: `tests/daemon/services/commission/orchestrator.test.ts` (extend)
**Expertise**: none

- Continue a halted commission: verify worktree reused, session launched with continuation prompt containing turnsUsed and lastProgress, state file updated to in_progress.
- Continue with missing worktree: verify transition to failed, appropriate reason.
- Continue at capacity: verify rejection with capacity error, commission stays halted.
- Multi-continuation: halt, continue, halt again, continue again. Verify `halt_count` increments to 2, timeline records all transitions, each continuation gets a fresh turn budget.
- Continued session completes with result: verify normal completion (squash-merge, cleanup).
- Continued session hits maxTurns again: verify re-halt with incremented `halt_count`.

### Phase 4: Save action

Merge partial work from a halted commission without agent completion.

#### Step 4.1: Add saveCommission to CommissionSessionForRoutes

**Files**: `daemon/services/commission/orchestrator.ts`
**Addresses**: REQ-COM-42

Add to the interface:
```typescript
saveCommission(commissionId: CommissionId, reason?: string): Promise<void>;
```

#### Step 4.2: Implement saveCommission

**Files**: `daemon/services/commission/orchestrator.ts`
**Addresses**: REQ-COM-42, REQ-COM-43, REQ-COM-44

Implementation flow:

1. Read halted state file to get `worktreeDir`, `branchName`, `projectName`, `turnsUsed`, `lastProgress`.
2. Verify worktree exists. If missing: transition to failed with "Worktree not found for save."
3. Commit any uncommitted changes (safety net per REQ-COM-43).
4. Update `result_summary` on the artifact (REQ-COM-44): either the caller's reason or the system-generated message.
5. Transition `halted -> completed` via `lifecycle.executionCompleted()`.
6. Run squash-merge via `workspace.finalize()` (same as `handleSuccessfulCompletion` at line 552).
7. If merge succeeds: clean up worktree, delete branch, remove state file, emit events.
8. If merge fails: transition to failed, escalate conflict (same as line 612-628).
9. Append timeline: `status_completed` with `partial: "true"` and save reason (REQ-COM-45a).
10. `lifecycle.forget()`.
11. `enqueueAutoDispatch()` + `checkDependencyTransitions()`.

#### Step 4.3: Add save route

**Files**: `daemon/routes/commissions.ts`
**Addresses**: REQ-COM-49 (route exposure)

Add `POST /commission/run/save` with `commissionId` and optional `reason` in body.

#### Step 4.4: Tests for Phase 4

**Files**: `tests/daemon/services/commission/orchestrator.test.ts` (extend)
**Expertise**: none

- Save a halted commission: verify squash-merge to claude, completion marked as partial (timeline has `partial: "true"`), result_summary updated, worktree cleaned up.
- Save with custom reason: verify reason appears in result_summary.
- Save with missing worktree: verify transition to failed.
- Save with merge conflict: verify escalation and failure path.

### Phase 5: Crash recovery

Handle halted commissions on daemon restart.

#### Step 5.1: Add halted recovery to recoverCommissions

**Files**: `daemon/services/commission/orchestrator.ts`
**Addresses**: REQ-COM-46

In `recoverCommissions()`, after the sleeping commission recovery block (around line 970) and before the active commission recovery (line 1040), add a halted recovery block:

```
if (state.status === "halted") {
  // Check worktree exists
  if (worktreeExists) {
    // Register as halted, no action needed (wait for user)
    lifecycle.register(cId, state.projectName, "halted", artifactPath);
    recovered++;
  } else {
    // Worktree lost: register as halted, transition to failed
    lifecycle.register(cId, state.projectName, "halted", artifactPath);
    lifecycle.executionFailed(cId, "Worktree lost during restart.");
    syncStatusToIntegration(...);
    writeStateFile(... status: "failed");
    lifecycle.forget(cId);
    recovered++;
  }
  continue;
}
```

This mirrors the sleeping recovery pattern (line 973-1002) but simpler: no mail reader to re-activate, no mail status to check. A halted commission with an intact worktree just stays halted.

#### Step 5.2: Tests for Phase 5

**Files**: `tests/daemon/services/commission/orchestrator.test.ts` (extend)
**Expertise**: none

- Daemon restart with halted state file and existing worktree: verify commission registered as halted, no transition occurs, commission waits for user action.
- Daemon restart with halted state file and missing worktree: verify transition to failed with "Worktree lost during restart."
- Verify halted commissions survive restart without counting against capacity.

### Phase 6: Manager toolbox and status tool

Give the Guild Master visibility into halted commissions and the ability to trigger continue/save.

#### Step 6.1: Update check_commission_status for halted

**Files**: `daemon/services/manager/toolbox.ts`
**Addresses**: REQ-COM-48

Single commission mode (line 1012): When status is `halted`, include `turnsUsed` and `lastProgress` in the result. Read these from the state file (or from the most recent `status_halted` timeline event in the artifact). The state file is more reliable since it's always present for halted commissions.

To read the state file, the handler needs access to `guildHallHome` (already in deps) and the state file path pattern. Add a helper that reads the halted state file for a given commission ID.

List mode: already handled by the SUMMARY_GROUP update in Phase 1.

#### Step 6.2: Add continue_commission tool

**Files**: `daemon/services/manager/toolbox.ts`
**Addresses**: REQ-COM-49

New factory function `makeContinueCommissionHandler(deps)`:
- Schema: `{ commissionId: string }`
- Calls `deps.services.commissionSession.continueCommission(asCommissionId(args.commissionId))`
- Returns success or capacity error message

Register in `createManagerToolbox` alongside existing tools.

#### Step 6.3: Add save_commission tool

**Files**: `daemon/services/manager/toolbox.ts`
**Addresses**: REQ-COM-49

New factory function `makeSaveCommissionHandler(deps)`:
- Schema: `{ commissionId: string, reason?: string }`
- Calls `deps.services.commissionSession.saveCommission(asCommissionId(args.commissionId), args.reason)`
- Returns success or error message

Register in `createManagerToolbox` alongside existing tools.

#### Step 6.4: Update cancel for halted commissions

**Files**: `daemon/services/commission/orchestrator.ts`
**Addresses**: REQ-COM-35 (halted -> cancelled)

The existing `cancelCommission` (line 1924) handles active commissions (in `executions`), sleeping commissions, and pending/blocked commissions. Halted commissions need their own branch:

After the sleeping commission check (line 1956):
```
if (status === "halted") {
  await cancelHaltedCommission(commissionId, reason);
  return;
}
```

`cancelHaltedCommission`:
1. Read state file to get worktreeDir, branchName
2. Transition halted -> cancelled via lifecycle
3. Preserve and cleanup worktree (commit + remove worktree, keep branch)
4. Sync status to integration
5. Update state file to cancelled
6. `lifecycle.forget()`

This follows the sleeping cancel pattern (`cancelSleepingCommission` at line 718) but is simpler: no mail reader to cancel (step 2 of the sleeping cancel calls `mailOrchestrator.cancelReaderForCommission`, which doesn't apply here). Halted commissions have no concurrent sessions.

#### Step 6.5: Update abandon for halted commissions

**Files**: `daemon/services/commission/orchestrator.ts`
**Addresses**: REQ-COM-35 (halted -> abandoned)

The existing `abandonCommission` (line 2008) has a different structure than `cancelCommission`. It checks `executions.has()` first (throws if active), then checks sleeping, then falls to tracked-in-lifecycle. A halted commission IS tracked in lifecycle but not in executions.

Add an explicit halted branch after the sleeping check, structured like `cancelHaltedCommission`:
1. Read state file to get worktreeDir, branchName
2. Transition halted -> abandoned via `lifecycle.abandon()`
3. Preserve and cleanup worktree (commit pending changes, remove worktree, keep branch)
4. Sync status to integration
5. Update state file to abandoned
6. `lifecycle.forget()`

Do NOT rely on the existing non-sleeping tracked path in `abandonCommission` because it does not perform worktree cleanup. Halted commissions have a live worktree that must be cleaned up on abandon, unlike the typical abandon flow which operates on already-terminated commissions with no worktree.

#### Step 6.6: Tests for Phase 6

**Files**: `tests/daemon/services/manager/toolbox.test.ts`, `tests/daemon/services/commission/orchestrator.test.ts` (extend)
**Expertise**: none

- `check_commission_status` single mode: halted commission returns turnsUsed and lastProgress.
- `check_commission_status` list mode: halted commission appears in active group.
- `continue_commission` tool: verify it calls continueCommission and returns appropriate result.
- `save_commission` tool: verify it calls saveCommission with optional reason.
- Cancel halted commission: verify transition to cancelled, worktree cleaned up, branch preserved.
- Abandon halted commission: verify transition to abandoned, worktree cleaned up, branch preserved.

### Phase 7: Validate against spec

Launch a sub-agent that reads the spec at `.lore/specs/commissions/commission-halted-continuation.md`, reviews the implementation, and verifies every success criterion. This step is not optional.

**Success criteria checklist:**
- [ ] `halted` is a valid commission status with correct transitions in the state machine
- [ ] maxTurns without result submission transitions to `halted`, not `failed`
- [ ] Halted commissions preserve worktree, branch, session ID, and diagnostic info in state file
- [ ] `continue` resumes the session in the same worktree with a continuation prompt
- [ ] Continued sessions get a fresh turn budget
- [ ] `save` merges partial work to the integration branch and marks completion as partial
- [ ] Cancel and abandon work on halted commissions using existing flows
- [ ] Halted commissions do not count against the concurrent commission cap
- [ ] `check_commission_status` shows halted commissions with diagnostic fields
- [ ] Daemon restart recovers halted commissions correctly (stays halted if worktree exists, fails if missing)
- [ ] Activity timeline records halt, continuation, and save events with appropriate metadata
- [ ] `halt_count` tracks the number of halt/continue cycles

## Delegation Guide

### Per-phase review strategy

| Phase | Reviewer Agent | Why |
|-------|---------------|-----|
| Phase 1 (state machine) | `pr-review-toolkit:type-design-analyzer` | New type added to `CommissionStatus` union. Verify all switch sites handle it. |
| Phase 2 (halt entry) | `pr-review-toolkit:silent-failure-hunter` | The halt entry path has error handling that could mask failures (no sessionId, commit failures, state file write failures). Verify no silent swallowing. |
| Phase 3 (continue) | `pr-review-toolkit:code-reviewer` + `lore-development:spec-reviewer` on the spec | The continue flow is the most complex new code. Code review for correctness, spec review to verify all REQ-COM-39/40/41 are addressed. |
| Phase 4 (save) | `pr-review-toolkit:code-reviewer` | Save reuses squash-merge infrastructure. Review for correct reuse vs. missed edge cases (conflict handling, partial flag). |
| Phase 5 (recovery) | `pr-review-toolkit:silent-failure-hunter` | Recovery paths are error-heavy. Verify no worktree loss scenarios are silently handled. |
| Phase 6 (toolbox) | `pr-review-toolkit:code-reviewer` | New tools follow established patterns. Review for consistency with existing tool handlers. |
| Phase 7 (validation) | `lore-development:spec-reviewer` | Fresh-context validation of full implementation against spec requirements. |

### Cross-cutting concerns to check at every phase

- Run full test suite after each phase. No phase should break existing tests.
- Verify `CommissionStatus` exhaustiveness: any code that switches on status or checks for specific statuses must handle `halted`.
- State file reads in the orchestrator must handle the case where the file was written by a different version (forward compatibility).

## Open Questions

1. **UI for halted commissions**: The spec defines `halted` as a distinct display state but doesn't specify UI elements (continue/save buttons in the commission detail view, halted badge styling). This plan covers the daemon-side implementation. A separate UI plan may be needed, or it can be handled as a follow-up commission.

2. **`resource_overrides` on continue (RESOLVED)**: REQ-COM-40a says "if the user wants to increase the budget for a continuation, they update `resource_overrides` on the commission artifact before continuing." The `updateCommission` method already supports modifying `resource_overrides` on pending commissions. Decision: add `halted` to the allowed statuses in `updateCommission`'s status check. This is a one-line change and should be done in Phase 3, Step 3.2, since continue is the primary consumer. Without this, the REQ-COM-40a workflow for adjusting turn budget before continuing is broken. Note: `resource_overrides` comes from the integration worktree artifact (not the state file), and `prepareSdkSession` reads it from the artifact during session prep.

3. **HaltedCommissionState type location**: The sleeping state type lives in `daemon/services/mail/types.ts`. The halted state type could live in a new `daemon/services/commission/types.ts` or alongside the sleeping type. Recommendation: create `daemon/services/commission/halted-types.ts` to keep it close to where it's consumed. The mail types file is mail-specific; halted is commission-specific.
