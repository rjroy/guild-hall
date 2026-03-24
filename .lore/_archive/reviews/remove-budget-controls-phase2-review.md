---
title: "Review: Remove Budget Controls Phase 2 (Halted State Removal)"
date: 2026-03-22
status: complete
tags: [review, commissions, budget-removal, halted-state]
reviewer: Thorne
commission: commission-Dalton-20260322-124244
spec: .lore/specs/commissions/remove-budget-controls.md
plan: .lore/plans/commissions/remove-budget-controls.md
---

# Review: Remove Budget Controls Phase 2 (Halted State Removal)

Reviewed commit `4fb5477` (26 files changed, 111 insertions, 2636 deletions).

## Verdict

The primary removal is done correctly. Continue/save routes, toolbox tools, UI buttons, and lifecycle transitions for `halted` are gone. The cancel route works for `in_progress` and `dispatched`. Crash recovery handles `in_progress` and `dispatched`. CommissionActions renders cancel/abandon for valid states.

Five residual `halted` references survive in source code that should have been cleaned. These are confirmed defects, not style concerns. They reference a state that no longer exists in the type system and will either silently accumulate dead code paths or cause type-safety gaps if the `CommissionStatus` union is ever tightened further.

---

## Focus Area 1: No Halted References Remain in Source or Tests

**Status: FAIL (5 residual references in source, tests clean)**

Tests are fully clean. No `halted` string appears anywhere in `tests/`.

Source files have these residuals:

### DEFECT-1: `lib/types.ts:95` — `halted` in `STATUS_SORT_ORDER`

```typescript
halted: 1,
```

The `STATUS_SORT_ORDER` map still includes `halted` as a sort group member. `CommissionStatus` no longer includes `"halted"`, so this key maps a value that can never appear. Dead code.

**Impact:** Low. The sort function uses `?? 9` for unknown statuses, so this line is unreachable. But it contradicts the removal and will confuse anyone reading this map to understand which statuses exist.

**Fix:** Delete the `halted: 1,` line.

### DEFECT-2: `daemon/services/manager/toolbox.ts:1210` — `halted` in `SUMMARY_GROUP`

```typescript
halted: "active",
```

Same pattern as DEFECT-1. The `SUMMARY_GROUP` map in the `check_commission_status` tool's list-mode projection still maps `halted` to `"active"`. Dead entry.

**Fix:** Delete the `halted: "active",` line.

### DEFECT-3: `daemon/services/manager/toolbox.ts:1278-1298` — Halted diagnostic block in `check_commission_status`

```typescript
// REQ-COM-48: halted commission diagnostic fields
if (meta.status === "halted") {
  const stateFilePath = path.join(
    deps.guildHallHome, "state", "commissions", `${args.commissionId}.json`,
  );
  try {
    const stateRaw = await fs.readFile(stateFilePath, "utf-8");
    const stateData = JSON.parse(stateRaw) as {
      turnsUsed?: number;
      lastProgress?: string;
    };
    // ...
```

This is a 20-line block that reads halted state files and appends diagnostic fields (`turnsUsed`, `lastProgress`) to the status check response. `meta.status` is parsed from artifact frontmatter as a string, not typed as `CommissionStatus`, so the compiler cannot flag this as unreachable. The block silently persists as dead code.

REQ-COM-48 (from the halted-continuation spec) is now superseded. The code implementing it should be removed.

**Impact:** Medium. This is the largest residual. It reads from the filesystem for a state that cannot exist, references a spec requirement that's been superseded, and makes the `check_commission_status` tool harder to reason about.

**Fix:** Delete the entire `if (meta.status === "halted") { ... }` block (lines 1278-1298) and the REQ-COM-48 comment.

### DEFECT-4: `daemon/services/manager/context.ts:150` — Halted in active commission filter

```typescript
(c) => c.status === "dispatched" || c.status === "in_progress" || c.status === "halted",
```

The briefing context builder filters commissions for the "active" section. The `|| c.status === "halted"` condition is dead. Since `CommissionMeta.status` is a string (not the union type), the compiler won't catch it.

**Impact:** Low. The condition is unreachable, but it doesn't cause incorrect behavior.

**Fix:** Remove `|| c.status === "halted"` from the filter.

### DEFECT-5: `daemon/services/commission/record.ts:209-231` — `incrementHaltCount` method and tests

The `CommissionRecordOps` still exposes `incrementHaltCount()`, a method that manipulates the `halt_count` frontmatter field. This method existed solely to track how many times a commission was halted. With the halted state gone, nothing calls it, and the `halt_count` field has no consumers.

The corresponding tests in `tests/daemon/services/commission/record.test.ts` (lines 994-1044, ~50 lines) exercise this dead method.

**Impact:** Medium. This is a public method on a core interface (`CommissionRecordOps`) that serves no purpose. It adds surface area to the record layer and its tests validate behavior that cannot occur.

**Fix:** Delete the `incrementHaltCount` method from `record.ts` and its tests from `record.test.ts`.

---

## Focus Area 2: Cancel Route Works for `in_progress` and `dispatched`

**Status: PASS**

`cancelCommission` in `orchestrator.ts:1858-1934` handles three cases:

1. **Active execution context exists** (lines 1864-1886): Aborts the controller, calls `lifecycle.cancel`, runs `preserveAndCleanup`, writes state file, removes from executions. This covers `in_progress` and `dispatched` commissions that have an `ExecutionContext`.

2. **Tracked in lifecycle but no execution context** (lines 1890-1903): Calls `lifecycle.cancel`, syncs to integration, forgets. This covers `pending` and `blocked`.

3. **Not tracked, found in integration worktree** (lines 1906-1934): Reads status from artifact, validates it's `pending` or `blocked`, registers in lifecycle, cancels. This covers commissions found on disk but not in memory.

The halted-specific `cancelHaltedCommission` function is confirmed deleted. No branch calls it. The cancel route in `daemon/routes/commissions.ts` calls `cancelCommission` directly without any halted-specific dispatch.

The lifecycle transition graph in `lifecycle.ts` allows `dispatched -> cancelled` and `in_progress -> cancelled`. Both are valid.

---

## Focus Area 3: Crash Recovery Handles `in_progress` and `dispatched`

**Status: PASS (with note)**

`recoverCommissions` in `orchestrator.ts:830-920` (approximate lines after deletions):

- Sleeping commissions: transitioned to `failed` with explanation (line 862).
- Orphaned halted state files: skipped with warning log (lines 869-875). This is intentional defensive handling per the backward compatibility section of the spec.
- `dispatched` and `in_progress`: the recovery block at line 878+ filters to only these two statuses. Other statuses are silently skipped.

The orphaned halted state file handling (lines 869-875) is reasonable. The spec's backward compatibility section explicitly calls for logging a warning and skipping orphaned halted state files. This is correctly implemented.

---

## Focus Area 4: CommissionActions Renders Cancel/Abandon for Valid States

**Status: PASS**

`CommissionActions.tsx` now has four actions:

| Action | Visible when |
|--------|-------------|
| Dispatch | `status === "pending"` |
| Cancel | `status === "dispatched" \|\| "in_progress" \|\| "queued"` |
| Re-dispatch | `status === "failed" \|\| "cancelled"` |
| Abandon | `status === "pending" \|\| "blocked" \|\| "failed" \|\| "cancelled"` |

The `confirming` state type is `"cancel" | "redispatch" | "abandon" | null`. No `"continue"` or `"save"` variants remain. No `halted` status checks in any visibility condition. The component is clean and simplified.

---

## Focus Area 5: REQ-RBUDGET-27 through REQ-RBUDGET-50 Coverage

| REQ | Status | Evidence |
|-----|--------|----------|
| REQ-RBUDGET-27 | **PASS** | `halted-types.ts` deleted (confirmed via glob) |
| REQ-RBUDGET-28 | **PASS** | `"halted"` not in `CommissionStatus` union (`daemon/types.ts:58-66`) |
| REQ-RBUDGET-29 | **PASS** | No `halted` in `TRANSITIONS` map, no `halt()` or `continueHalted()` methods in lifecycle |
| REQ-RBUDGET-30 | **PASS** | `halted` not in `STATUS_GROUP` in `lib/commissions.ts`, no `status_halted` event mapping |
| REQ-RBUDGET-31 | **PASS** | `handleHalt` function removed from orchestrator |
| REQ-RBUDGET-32 | **PASS** | `continueCommission` removed from orchestrator and interface |
| REQ-RBUDGET-33 | **PASS** | `saveCommission` removed from orchestrator and interface |
| REQ-RBUDGET-34 | **PASS** | `cancelHaltedCommission` removed from orchestrator |
| REQ-RBUDGET-35 | **PARTIAL** | State file utilities kept (see Dalton's decision below) |
| REQ-RBUDGET-37 | **PASS** | `/commission/run/continue` route removed |
| REQ-RBUDGET-38 | **PASS** | `/commission/run/save` route removed |
| REQ-RBUDGET-39 | **PASS** | `continue_commission` tool removed from manager toolbox |
| REQ-RBUDGET-40 | **PASS** | `save_commission` tool removed from manager toolbox |
| REQ-RBUDGET-41 | **PASS** | Continue/save buttons, handlers, state removed from CommissionActions |
| REQ-RBUDGET-42 | **PASS** | Web API proxy routes for continue/save deleted |
| REQ-RBUDGET-43 | **PASS** | `"halted"` removed from `DEFAULT_STATUSES` and "Active" filter group |
| REQ-RBUDGET-44 | **PASS** | `|| status === "halted"` removed from `isSpawnedCommissionActive` |
| REQ-RBUDGET-45 | **PASS** | CLAUDE.md and docs/usage/commissions.md updated, no halted references |
| REQ-RBUDGET-46 | **PARTIAL** | Status set to `superseded` but the explanatory note is missing (see INFO-1) |
| REQ-RBUDGET-47 | **PASS** | All halted tests removed from lifecycle.test.ts |
| REQ-RBUDGET-48 | **PASS** | All halted tests removed from orchestrator.test.ts |
| REQ-RBUDGET-49 | **PASS** | Entire commission-actions.test.tsx deleted (all tests were halted-related or covered elsewhere) |
| REQ-RBUDGET-50 | **PASS** | Mock methods removed from commissions.test.ts test harness |

### REQ-RBUDGET-35: State File Utilities (Dalton's Decision)

Dalton chose to keep `commissionStatePath`, `writeStateFile`, and `deleteStateFile`. His reasoning: these utilities are used by the dispatch flow, cancel flow, abandon flow, and recovery for dispatched/in_progress commissions, not exclusively for halted state.

The spec says these "exist solely to persist and recover halted commission state." Dalton's observation is correct: the spec's claim is factually wrong. The state file utilities serve the broader commission lifecycle. Removing them would break active commission tracking. This decision is correct and well-documented.

---

## Additional Findings

### INFO-1: Missing superseded note on commission-halted-continuation.md

REQ-RBUDGET-46 specifies adding an explanatory note below the frontmatter:

> Superseded by `.lore/specs/commissions/remove-budget-controls.md` (Phase 2). The halted state was removed entirely after the maxTurns trigger was removed in Phase 1.

The `status: superseded` was set in the frontmatter, but the explanatory note was not added. The body still opens with the original overview text describing the halted state as a new feature.

**Impact:** Low. The status field communicates supersession. The missing note just makes it harder to trace why.

**Fix:** Add the superseded note below the closing `---` of the frontmatter.

---

## Summary

| Severity | Count | Details |
|----------|-------|---------|
| DEFECT | 5 | Residual halted references in source code (DEFECT 1-5) |
| INFO | 1 | Missing superseded note on spec |
| PASS | 19 of 24 REQs fully satisfied |
| PARTIAL | 2 REQs (REQ-RBUDGET-35 justified, REQ-RBUDGET-46 note missing) |

The primary removal work is solid. The five residual references are straightforward deletions. None of them cause runtime failures because the `halted` status can never appear in live data, but they contradict the goal of complete removal and add confusion for future readers.
