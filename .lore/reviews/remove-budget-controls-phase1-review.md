---
title: "Review: Remove Budget Controls Phase 1"
date: 2026-03-22
status: complete
tags: [review, commissions, budget-removal]
reviewer: Thorne
commission: commission-Dalton-20260322-124224
spec: .lore/specs/commissions/remove-budget-controls.md
plan: .lore/plans/commissions/remove-budget-controls.md
---

# Review: Remove Budget Controls Phase 1

Reviewed commit `5f29e28` (49 files changed, 184 insertions, 982 deletions).

## Verdict

Phase 1 is well executed. Budget controls are cleanly removed from all user-facing paths. Internal utility session limits are preserved. Halted infrastructure is intact for Phase 2. Two findings at WARN level, two at INFO. No blockers.

---

## Focus Area 1: No Budget References Leaked

**Status: PASS**

Comprehensive grep of all source files under `lib/`, `daemon/`, `packages/`, and `web/` confirms:

- `resourceDefaults`: zero matches. Fully removed from types, schemas, worker packages, and activation.
- `resourceBounds`: zero matches. Fully removed from types, activation results, and SDK session assembly.
- `maxBudgetUsd`: zero matches in source files (one expected reference in notes-generator test verifying the field is `undefined`).
- `maxTurns`: only expected matches remain (see Focus Area 2).

Test files are also clean. All budget-related test blocks were deleted. Remaining `maxTurns` references in tests are for internal utility limits (notes-generator `maxTurns: 1`, triage `TRIAGE_MAX_TURNS = 10`) and comments documenting removed test blocks.

## Focus Area 2: Internal Utility Session Limits Preserved

**Status: PASS**

Three internal utility sessions retain their `maxTurns` safeguards:

| Utility | File | Value | Method |
|---------|------|-------|--------|
| Briefing (full) | `daemon/services/briefing-generator.ts:548` | 200 | Post-prep mutation: `options.maxTurns = 200` |
| Briefing (cheap) | `daemon/services/briefing-generator.ts:647` | 10 | Post-prep mutation: `options.maxTurns = 10` |
| Briefing (single) | `daemon/services/briefing-generator.ts:581, 676` | 1 | Direct on `SdkQueryOptions` |
| Triage | `daemon/services/outcome-triage.ts:307` | 10 | Direct on `SdkQueryOptions` |
| Notes generator | `daemon/services/meeting/notes-generator.ts:190` | 1 | Direct on `SdkQueryOptions` |

The briefing generator's migration from `resourceOverrides.maxTurns` to post-prep `options.maxTurns` is correct. The `SdkQueryOptions` type still has `maxTurns?: number` (it's the SDK's interface, not Guild Hall's budget system), so the post-prep assignment is type-safe.

## Focus Area 3: Halted State Infrastructure Intact

**Status: PASS with one finding (WARN-1)**

All halted infrastructure is present and functional:

- `daemon/services/commission/halted-types.ts` — `HaltedCommissionState` type present
- `daemon/types.ts` — `"halted"` in `CommissionStatus` union
- `daemon/services/commission/lifecycle.ts` — halted transitions, `halt()`, `continueHalted()` all present
- `daemon/services/commission/orchestrator.ts` — `continueCommission`, `saveCommission`, `cancelHaltedCommission`, state file utilities, halted recovery all present
- `daemon/routes/commissions.ts` — continue and save routes present
- `daemon/services/manager/toolbox.ts` — `continue_commission` and `save_commission` tools present
- `web/components/commission/CommissionActions.tsx` — continue/save buttons present
- `web/components/commission/commission-filter.ts` — `"halted"` in `DEFAULT_STATUSES` and Active filter group

One exception:

**WARN-1: Scheduler halted check removed prematurely.** `daemon/services/scheduler/index.ts:510` — `isSpawnedCommissionActive` no longer includes `status === "halted"` in its active check. The diff shows this was removed as part of Phase 1, but the spec assigns this to Phase 2 (REQ-RBUDGET-44). While the behavior is arguably correct even now (a halted commission isn't consuming turns), this is a Phase 2 scope item that was pulled forward without the surrounding Phase 2 context. The scheduler comment was also updated from "dispatched, in_progress, or halted" to "dispatched or in_progress" (line 493).

Impact: Low. The behavior change is defensible. But it creates a discrepancy: the rest of Phase 1 treats halted infrastructure as preserved, while the scheduler treats it as already irrelevant. Phase 2 should verify this was intentional and not double-remove it.

## Focus Area 4: REQ Compliance

### REQ-RBUDGET-1: PASS
`ResourceDefaults` interface removed. `resourceDefaults` removed from `WorkerMetadata` and `ActivationContext`. `resourceBounds` removed from `ActivationResult`. All in `lib/types.ts`.

### REQ-RBUDGET-2: PASS
`resourceDefaultsSchema` removed from `lib/packages.ts`. `resourceDefaults` removed from `guildHallSchema`.

### REQ-RBUDGET-3: PASS
`resource_overrides` in `CommissionMeta` now `{ model?: string }`. `maxTurns`/`maxBudgetUsd` extraction removed from `parseCommissionData`. File: `lib/commissions.ts`.

### REQ-RBUDGET-4: PASS
`SessionPrepSpec.resourceOverrides` now `{ model?: string }`. File: `daemon/lib/agent-sdk/sdk-runner.ts:101`.

### REQ-RBUDGET-5: PASS
`SdkRunnerOutcome.reason` now `"completed" | undefined`. `"maxTurns"` and `"maxBudget"` variants removed. File: `daemon/lib/agent-sdk/sdk-runner.ts:145`.

### REQ-RBUDGET-6: PASS
`drainSdkSession` no longer takes an `opts` parameter. Turn counting preserved for `turnsUsed`. No threshold comparison. File: `daemon/lib/agent-sdk/sdk-runner.ts:209`.

### REQ-RBUDGET-7: PASS
`prepareSdkSession` no longer reads `maxTurns`/`maxBudgetUsd` from activation results or overrides. Lines 419-491 of sdk-runner.ts clean.

### REQ-RBUDGET-8: PASS
All three internal utility sessions preserved with direct `maxTurns` on options. See Focus Area 2 table.

### REQ-RBUDGET-9: PASS
`handleSessionCompletion` no longer checks `outcome.reason === "maxTurns"`. The entire `handleHalt` call block removed. File: `daemon/services/commission/orchestrator.ts:499` area.

### REQ-RBUDGET-10: PASS
`handleHalt` removed as dead code. Comment at line 523 documents the removal and notes Phase 2 cleanup ahead.

### REQ-RBUDGET-11: PASS
Sessions completing without a result and without a halt trigger go to the fail path. The removed code block was the only path that could divert to halted.

### REQ-RBUDGET-12: PASS
`createCommission`, `createScheduledCommission`, and `createTriggeredCommission` no longer write `maxTurns`/`maxBudgetUsd` to YAML. Resource override block only written when `model` is present.

### REQ-RBUDGET-13: PASS
`resource_overrides` block omitted when only `model` is absent. Condition changed from three-field check to `ro?.model \!== undefined`.

### REQ-RBUDGET-14: PASS
All six worker `package.json` files have `resourceDefaults` removed: illuminator, researcher, reviewer, steward, visionary, writer.

### REQ-RBUDGET-15: PASS
`resourceDefaults: { maxTurns: 200 }` removed from Guild Master metadata in `daemon/services/manager/worker.ts:129-131`.

### REQ-RBUDGET-16: PASS
`resourceBounds` assembly removed from both `packages/shared/worker-activation.ts` and `daemon/services/manager/worker.ts:253-256`.

### REQ-RBUDGET-17: PASS
`maxTurns` and `maxBudgetUsd` removed from `create_commission` Zod schema. `resourceOverrides` parameter description updated to "Override the worker's default model." File: `daemon/services/manager/toolbox.ts:1512`.

### REQ-RBUDGET-18: PASS
Same removal from `create_scheduled_commission` and `update_schedule` schemas. Descriptions updated. Lines 1599, 1614.

### REQ-RBUDGET-19: PASS
Route body types updated in `daemon/routes/commissions.ts:53, 165`.

### REQ-RBUDGET-20: PASS
Regex-based YAML update logic for `maxTurns`/`maxBudgetUsd` removed from `update_commission` handler. Only `model` regex remains. Lines 987-1002 area.

### REQ-RBUDGET-21: PASS
`readResourceOverrides` in scheduler now only parses `model`. `maxTurns`/`maxBudgetUsd` parsing removed. Lines 480-492.

### REQ-RBUDGET-22: PASS
"Max Turns" and "Max Budget (USD)" input fields removed from `CommissionForm.tsx`. State variables `maxTurns` and `maxBudgetUsd` removed. `useCallback` dependency array updated.

### REQ-RBUDGET-23: PASS
Checked CSS module. The `overridesField`, `overridesLabel`, and `numberInput` classes are shared with the model selector and remain used.

### REQ-RBUDGET-24: PASS
`CLAUDE.md` updated. Commission lifecycle description changed from "Commissions that hit `maxTurns`..." to "Commissions may enter `halted` state...". `docs/usage/commissions.md` updated to remove maxTurns-specific halted documentation.

### REQ-RBUDGET-25: PASS (no action required)
Lore specs are historical artifacts. Spec explicitly says they don't need updating in this commission.

### REQ-RBUDGET-26: PASS
Comment in `halted-types.ts` updated from "When a commission hits maxTurns" to "When a commission is halted".

---

## Additional Findings

### WARN-2: Stale budget language in halted infrastructure

Two places in halted infrastructure (Phase 2 territory) still use budget-concept language:

1. `daemon/services/commission/orchestrator.ts:2100` — continuation prompt says "This commission was halted because it reached the turn limit". Since maxTurns no longer triggers halt, this message is now false. No code path reaches this line currently, but it's misleading documentation of the halted state's purpose.

2. `daemon/services/manager/toolbox.ts:1548` — `continue_commission` tool description says "fresh turn budget". Budget language in a system that no longer has budgets.

Impact: Low. These are inside dead code paths (no trigger into halted exists). Phase 2 deletes all of this. But if Phase 2 is delayed, these are confusing to anyone reading the code.

### INFO-1: Briefing generator JSDoc inaccuracy (pre-existing)

`daemon/services/briefing-generator.ts:6` says `maxTurns: 30` but the code uses 200 (full), 10 (cheap), and 1 (single-turn). This inaccuracy predates this commission. Not introduced by Dalton, but worth noting since the file was touched.

### INFO-2: Orchestrator comment references REQ-COM-40a

`daemon/services/commission/orchestrator.ts:2107` still has a comment reading "Read resource_overrides from integration artifact for fresh turn budget (REQ-COM-40a)" that was updated to "for model override" in the diff. Confirmed this was updated correctly.

---

## Summary

| Severity | Count | Description |
|----------|-------|-------------|
| BLOCKER | 0 | — |
| ERROR | 0 | — |
| WARN | 2 | Premature scheduler halted removal (scope), stale budget language in halted infra |
| INFO | 2 | Pre-existing JSDoc inaccuracy, confirmed comment update |

Phase 1 is clean. All 26 REQs satisfied. Budget references fully removed from user-facing code. Internal limits preserved. Halted infrastructure intact. Ready for merge.
