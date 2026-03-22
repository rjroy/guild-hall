---
title: "Plan: Remove Budget Controls from Commission System"
date: 2026-03-22
status: draft
spec: .lore/specs/commissions/remove-budget-controls.md
tags: [commissions, simplification, budget, resource-limits]
modules: [guild-hall-core]
---

# Plan: Remove Budget Controls from Commission System

## Overview

Clean removal of `maxTurns`, `maxBudgetUsd`, `resourceDefaults`, and `resourceBounds` from the entire system. The `model` field in `resourceOverrides` survives. The `halted` state survives but loses its only current trigger. Internal utility session turn limits (briefing, triage, notes) are untouched.

The work is structured as four phases. Each phase is independently committable and testable. Phases 1-3 are the core removal. Phase 4 is documentation and cleanup.

## Surface Area Catalog

Every file that references `maxTurns`, `maxBudgetUsd`, `resourceDefaults`, or `resourceBounds` in the context of budget controls. Files are grouped by the phase that modifies them.

### Source Files (Phase 1-3)

| File | What changes |
|------|-------------|
| `lib/types.ts` | Remove `ResourceDefaults`, remove `resourceDefaults` from `WorkerMetadata` and `ActivationContext`, remove `resourceBounds` from `ActivationResult` |
| `lib/packages.ts` | Remove `resourceDefaultsSchema`, remove from `guildHallSchema` |
| `lib/commissions.ts` | Remove `maxTurns`/`maxBudgetUsd` from `CommissionMeta.resource_overrides` type and parsing |
| `daemon/lib/agent-sdk/sdk-runner.ts` | Remove from `SessionPrepSpec.resourceOverrides`, `SdkRunnerOutcome.reason`, `drainSdkSession` opts, `prepareSdkSession` option assembly |
| `daemon/services/commission/orchestrator.ts` | Remove maxTurns halt trigger, remove budget fields from artifact creation/update/parse functions |
| `daemon/services/commission/halted-types.ts` | Update comment only |
| `daemon/services/manager/worker.ts` | Remove `resourceDefaults` from Guild Master metadata, remove `resourceBounds` from `activateManager` |
| `daemon/services/manager/toolbox.ts` | Remove `maxTurns`/`maxBudgetUsd` from all Zod schemas and YAML update logic |
| `daemon/routes/commissions.ts` | Remove `maxTurns`/`maxBudgetUsd` from route body types |
| `daemon/services/scheduler/index.ts` | Remove from `readResourceOverrides` |
| `packages/shared/worker-activation.ts` | Remove `resourceBounds` assembly |
| `web/components/commission/CommissionForm.tsx` | Remove Max Turns and Max Budget input fields |

### Worker Packages (Phase 2)

| Package | Change |
|---------|--------|
| `packages/guild-hall-researcher/package.json` | Remove `resourceDefaults` |
| `packages/guild-hall-reviewer/package.json` | Remove `resourceDefaults` |
| `packages/guild-hall-illuminator/package.json` | Remove `resourceDefaults` |
| `packages/guild-hall-writer/package.json` | Remove `resourceDefaults` |
| `packages/guild-hall-visionary/package.json` | Remove `resourceDefaults` |
| `packages/guild-hall-steward/package.json` | Remove `resourceDefaults` |

### Test Files (Phase 3)

| File | What changes |
|------|-------------|
| `tests/lib/packages.test.ts` | Remove `resourceDefaults` assertions |
| `tests/lib/commissions.test.ts` | Remove `maxTurns`/`maxBudgetUsd` from test data and assertions |
| `tests/lib/workspace-scoping.test.ts` | Remove budget fields from test data |
| `tests/packages/worker-role-smoke.test.ts` | Remove `resourceDefaults` from test data |
| `tests/packages/worker-activation.test.ts` | Remove `resourceDefaults`/`resourceBounds` from test data |
| `tests/packages/guild-hall-illuminator/integration.test.ts` | Remove maxTurns assertion |
| `tests/daemon/services/sdk-runner.test.ts` | Remove maxTurns/maxBudget tests, update remaining tests |
| `tests/daemon/services/commission/orchestrator.test.ts` | Remove halt-entry tests for maxTurns, update `resourceBounds` in remaining tests |
| `tests/daemon/services/commission/record.test.ts` | Remove budget fields from test data |
| `tests/daemon/services/manager/toolbox.test.ts` | Remove `maxTurns`/`maxBudgetUsd` from resourceOverrides test data |
| `tests/daemon/services/manager-toolbox.test.ts` | Remove budget-related assertions |
| `tests/daemon/services/manager-worker.test.ts` | Remove `resourceDefaults`/`resourceBounds` tests |
| `tests/daemon/services/manager-context.test.ts` | Remove `resourceDefaults` from context data |
| `tests/daemon/services/briefing-generator.test.ts` | Remove `resourceBounds` from test data |
| `tests/daemon/services/outcome-triage.test.ts` | Remove maxTurns assertion (triage's internal limit stays, but the assertion on the exact value may need updating) |
| `tests/daemon/services/trigger-evaluator-service.test.ts` | Remove `_resourceOverrides` placeholder |
| `tests/daemon/services/scheduler/scheduler.test.ts` | Remove budget fields from `resourceOverrides` parameter |
| `tests/daemon/services/meeting/orchestrator.test.ts` | Remove `resourceDefaults`/`resourceBounds` from test data |
| `tests/daemon/services/meeting/recovery.test.ts` | Remove `resourceDefaults`/`resourceBounds` from test data |
| `tests/daemon/meeting-session.test.ts` | Remove `resourceDefaults`/`resourceBounds`/`maxTurns` assertions |
| `tests/daemon/meeting-project-scope.test.ts` | Remove `resourceDefaults`/`resourceBounds` from test data |
| `tests/daemon/integration.test.ts` | Remove `resourceDefaults`/`resourceBounds`/`maxTurns` assertions |
| `tests/daemon/integration-commission.test.ts` | Remove `resourceBounds` from test data |
| `tests/daemon/commission-toolbox.test.ts` | Remove budget fields from test data |
| `tests/daemon/notes-generator.test.ts` | Remove `maxTurns`/`maxBudgetUsd` assertions (except internal limit checks), remove `resourceDefaults`/`resourceBounds` from test data |
| `tests/daemon/routes/commissions.test.ts` | Remove budget fields from test data and assertions |
| `tests/daemon/routes/commissions-read.test.ts` | Remove budget fields from test data and assertions |
| `tests/components/commission-form.test.tsx` | Remove maxTurns/maxBudgetUsd form interaction tests |

### Files NOT Modified (internal utility limits preserved)

| File | Why untouched |
|------|--------------|
| `daemon/services/briefing-generator.ts` | Uses `maxTurns` on `SdkQueryOptions` directly for internal session limits (200, 10, 1). These are implementation safeguards, not user-facing budget controls. However, `resourceOverrides.maxTurns` in `SessionPrepSpec` will no longer exist, so the briefing generator must set `maxTurns` directly on the options object post-prep, not through `resourceOverrides`. See Phase 1 Step 3. |
| `daemon/services/outcome-triage.ts` | Uses `maxTurns` directly on `SdkQueryOptions` (TRIAGE_MAX_TURNS = 10). Internal safeguard. Untouched. |
| `daemon/services/meeting/notes-generator.ts` | Uses `maxTurns: 1` directly on `SdkQueryOptions`. Internal safeguard. Untouched. |

### Documentation (Phase 4)

| File | What changes |
|------|-------------|
| `CLAUDE.md` | Update commission lifecycle description |
| `docs/usage/commissions.md` | Remove maxTurns halted documentation |

## Phase 1: Core Type and Logic Removal

**Goal:** Remove budget types and enforcement from the runtime path. After this phase, the system compiles and runs without budget controls.

**REQs covered:** REQ-RBUDGET-1 through REQ-RBUDGET-11, REQ-RBUDGET-26

### Step 1: Remove types from lib/

**Files:** `lib/types.ts`, `lib/packages.ts`, `lib/commissions.ts`

In `lib/types.ts`:
- Delete the `ResourceDefaults` interface (lines 172-175)
- Remove `resourceDefaults?: ResourceDefaults` from `WorkerMetadata` (line 202)
- Remove `resourceDefaults` block from `ActivationContext` (lines 268-271)
- Remove `resourceBounds` block from `ActivationResult` (lines 298-301)

In `lib/packages.ts`:
- Delete `resourceDefaultsSchema` (lines 50-53)
- Remove `resourceDefaults` from the `guildHallSchema` (find where it's used in the worker schema and remove it)

In `lib/commissions.ts`:
- Change `resource_overrides` type to `{ model?: string }` (line 34)
- Remove `maxTurns` and `maxBudgetUsd` extraction from `parseCommissionData` (lines 101-106)

**Verification:** `bun run typecheck` will fail with many downstream errors. This is expected; they're fixed in subsequent steps.

### Step 2: Remove from SDK runner

**File:** `daemon/lib/agent-sdk/sdk-runner.ts`

- Remove `maxTurns` and `maxBudgetUsd` from `SessionPrepSpec.resourceOverrides` type (line 106). It becomes `resourceOverrides?: { model?: string }`.
- Remove `"maxTurns"` and `"maxBudget"` from `SdkRunnerOutcome.reason` (line 148). It becomes `reason?: "completed"`.
- Remove `opts` parameter from `drainSdkSession` (line 213). The function still counts turns for `turnsUsed` but doesn't compare against a limit. The reason assignment simplifies: if not aborted and no error, reason is `"completed"`.
- In `prepareSdkSession`, remove `maxTurns` and `maxBudgetUsd` assembly (lines 486-487) and their spread into the options object (lines 567-568). The `activation.resourceBounds` reference is removed entirely since the type no longer exists.

### Step 3: Fix briefing generator's maxTurns path

**File:** `daemon/services/briefing-generator.ts`

The briefing generator currently sets `maxTurns` via `SessionPrepSpec.resourceOverrides`:
```typescript
resourceOverrides: { maxTurns: 200, model: deps.config.systemModels?.briefing ?? "sonnet" },
```

After Step 2, `resourceOverrides` no longer has `maxTurns`. The briefing generator needs to set `maxTurns` directly on the options object after `prepareSdkSession` returns:

```typescript
// Before: resourceOverrides: { maxTurns: 200, model: "sonnet" }
// After:  resourceOverrides: { model: "sonnet" }
// Then post-prep: prepResult.result.options.maxTurns = 200;
```

Apply this pattern to all three briefing session types:
- `generateWithFullSdk` (line 531): `maxTurns: 200`
- `querySingleTurnSdk` (line 580 and 674): `maxTurns: 1`
- `generateWithCheapSdk` (line 629): `maxTurns: 10`

For the single-turn sessions that build `SdkQueryOptions` directly (lines 580, 674), `maxTurns: 1` is already set directly on the options. No change needed there.

For `generateWithFullSdk` and `generateWithCheapSdk`, move `maxTurns` from `resourceOverrides` to a post-prep override on the options object.

### Step 4: Remove from commission orchestrator

**File:** `daemon/services/commission/orchestrator.ts`

This is the largest single file change. Work through these areas:

**Halt trigger removal (lines 502-513):**
Remove the `if (!resultSubmitted && outcome.reason === "maxTurns")` block. Sessions that complete without a result now always go to the fail path. The `handleHalt` function becomes unreachable from the maxTurns path. Since halted state may be triggered by other mechanisms in the future, leave `handleHalt` in place but update the comment. If code review determines it should be removed as dead code, that's acceptable.

**drainSdkSession call (line 2136):**
Remove `{ maxTurns: options.maxTurns }` argument. Call becomes `drainSdkSession(runSdkSession(queryFn, prompt, options, log))`.

**Artifact creation functions** (`createCommission` ~line 1304, `createScheduledCommission` ~line 1420, `createTriggeredCommission` ~line 1522):
- Remove `maxTurns` and `maxBudgetUsd` from the `resourceOverrides` parameter types
- Remove the `maxTurns`/`maxBudgetUsd` conditional lines from the YAML template strings
- The `resource_overrides` block is only written if `model` is present

**Artifact update function** (`updateCommission` ~line 1748):
- Remove `maxTurns` and `maxBudgetUsd` from `resourceOverrides` in the update type
- Remove the regex-based YAML update logic for `maxTurns` and `maxBudgetUsd` (lines ~1795-1813)

**Artifact read functions** (`dispatchCommission` ~line 1888, `continueCommission` ~line 2267):
- Remove `maxTurns` and `maxBudgetUsd` extraction from `resource_overrides` parsing
- The `resourceOverrides` object passed to `SessionPrepSpec` retains only `model`

**Commit message** (line 551):
Update `Halted (maxTurns)` to a generic halt message, or leave as-is if `handleHalt` becomes dead code.

### Step 5: Remove from worker activation

**Files:** `packages/shared/worker-activation.ts`, `daemon/services/manager/worker.ts`

In `packages/shared/worker-activation.ts`:
- Remove `resourceBounds` from the returned `ActivationResult` (lines 78-79 and surrounding structure)

In `daemon/services/manager/worker.ts`:
- Remove `resourceDefaults: { maxTurns: 200 }` from Guild Master metadata (lines 147-149)
- Remove `resourceBounds` from `activateManager` return (lines 234-237)
- Remove the line about `resourceOverrides` from the model guidance text (line 100), or update it to say "model" only

### Step 6: Remove from routes and scheduler

**Files:** `daemon/routes/commissions.ts`, `daemon/services/scheduler/index.ts`

In `daemon/routes/commissions.ts`:
- Remove `maxTurns` and `maxBudgetUsd` from the `resourceOverrides` type in the create and scheduled-create route body schemas (lines 56, 168)

In `daemon/services/scheduler/index.ts`:
- Remove `maxTurns` and `maxBudgetUsd` parsing from `readResourceOverrides` (lines 488-492). The function returns `{ model?: string }`.

### Step 7: Remove from manager toolbox schemas

**File:** `daemon/services/manager/toolbox.ts`

- Remove `maxTurns: z.number().optional()` and `maxBudgetUsd: z.number().optional()` from the `create_commission` Zod schema (lines 1539-1541)
- Same for `create_scheduled_commission` schema (lines 1628-1630)
- Same for `update_schedule` schema (lines 1645-1647)
- Same for the `update_commission` handler's `resourceOverrides` schema (line 829 area)
- Remove the `maxTurns`/`maxBudgetUsd` regex update logic from the `update_commission` handler (lines 991-1002)
- Update tool descriptions to remove budget language

### Step 8: Remove from halted-types comment

**File:** `daemon/services/commission/halted-types.ts`

Update the doc comment (lines 1-7) to remove the `maxTurns` reference. Describe the halted state generically: "When a commission is halted without submitting a result, the orchestrator persists this state to disk."

**Phase 1 verification:** `bun run typecheck` should pass after all steps. The system compiles without budget types.

## Phase 2: Package and UI Cleanup

**Goal:** Remove budget controls from worker packages and the web UI.

**REQs covered:** REQ-RBUDGET-14, REQ-RBUDGET-22, REQ-RBUDGET-23

### Step 9: Remove resourceDefaults from worker packages

**Files:** All 6 worker `package.json` files listed in the catalog.

Remove the `resourceDefaults` key and its contents from each `guildHall` section. The structure goes from:
```json
"resourceDefaults": {
  "maxTurns": 300
}
```
to: key removed entirely.

### Step 10: Remove budget inputs from CommissionForm

**File:** `web/components/commission/CommissionForm.tsx`

- Remove `maxTurns` and `maxBudgetUsd` state variables (lines 53-54)
- Remove the parsing and inclusion of `maxTurns`/`maxBudgetUsd` in `resourceOverrides` (lines 133-142)
- Remove from the `useCallback` dependency array (line 201)
- Remove the "Max Turns" and "Max Budget (USD)" input fields and their labels (lines 370-402)
- The `resourceOverrides` object now only includes `model` when set

Check `web/components/commission/CommissionForm.module.css` for any styles that become orphaned. The `overridesField` and `overridesLabel` classes are likely shared with the model selector, so they stay.

**Phase 2 verification:** `bun run build` should pass. The UI renders without budget fields.

## Phase 3: Test Updates

**Goal:** Update all tests to match the new types. This is the highest-volume phase but the most mechanical.

**REQs covered:** All REQs implicitly (tests validate the spec).

### Step 11: Update test helpers and fixtures

Many test files construct `WorkerMetadata`, `ActivationContext`, or `ActivationResult` objects with `resourceDefaults`/`resourceBounds`. These all need the fields removed. The test files are listed in the catalog above.

**Approach:** Work file by file. For each test file:

1. Remove `resourceDefaults` from any `WorkerMetadata` or `ActivationContext` construction
2. Remove `resourceBounds` from any `ActivationResult` construction or assertion
3. Remove `maxTurns`/`maxBudgetUsd` from any `resource_overrides` test data or assertions
4. Remove tests that are entirely about budget behavior (e.g., "maxTurns without result transitions to halted" test group in orchestrator.test.ts, "reason is 'maxTurns'" tests in sdk-runner.test.ts)
5. Keep tests that exercise the halted state through other means, if any exist (currently none, the halted tests all use maxTurns as the trigger)

**Key test file decisions:**

`tests/daemon/services/sdk-runner.test.ts`:
- Remove "reason is 'maxTurns'" test (line 317)
- Remove "reason is 'completed' when turn count is below maxTurns" test (line 330)
- Update "reason works without maxTurns opt" test (line 364) to just verify reason is "completed" on success
- Remove `resourceDefaults`/`resourceBounds` from `prepareSdkSession` test fixtures
- Remove the "resourceOverrides.maxTurns/maxBudgetUsd override" test (line 513 area)
- Keep the "resourceOverrides.model overrides activation model" test (line 776)

`tests/daemon/services/commission/orchestrator.test.ts`:
- The `describe("halt entry (maxTurns without result)")` block (line 2628+) contains ~6 tests. Remove the entire block. The halted state has no trigger after this removal. If the halted infrastructure is tested elsewhere (continue, save, cancel), those tests remain.
- Remove `maxTurns` from `resourceBounds` in all remaining test fixtures. Since `resourceBounds` is removed from `ActivationResult`, these all need updating.
- Remove `maxTurns`/`maxBudgetUsd` from `resourceOverrides` in artifact creation tests

`tests/components/commission-form.test.tsx`:
- Remove the test that submits maxTurns and maxBudgetUsd values (line 126 area)

### Step 12: Run tests and fix stragglers

After the mechanical updates, run `bun test` and fix any remaining failures. Type errors will guide the remaining spots.

**Phase 3 verification:** `bun test` passes. `bun run typecheck` passes.

## Phase 4: Documentation

**Goal:** Update user-facing documentation.

**REQs covered:** REQ-RBUDGET-24, REQ-RBUDGET-25

### Step 13: Update CLAUDE.md

Remove the `maxTurns` reference from the commission lifecycle description (line 130). The halted state description changes to: "Commissions may enter `halted` state with worktree and session preserved."

### Step 14: Update docs/usage/commissions.md

Remove the halted-due-to-maxTurns section (line 62 area). Replace with a description of halted state that doesn't reference maxTurns.

### Step 15: Update worker guidance text

In `daemon/services/manager/worker.ts`, the model guidance line (line 100) mentions `resourceOverrides`. Update to say: "To override a worker's default model, set `model` in `resourceOverrides` when creating the commission."

This line may already say exactly that. Verify and adjust if it mentions maxTurns or maxBudgetUsd.

**Phase 4 verification:** Full pre-commit hook passes: `bun run typecheck && bun run lint && bun test && bun run build`.

## Execution Notes

**Delegation:** This is a single implementation commission for Dalton. The work is mechanical (type removal, cascading fixes) with no design ambiguity. All decisions are made in this plan.

**Review:** Dispatch a Thorne review after implementation. Focus areas: (1) no budget references leaked through, (2) internal utility session limits are preserved, (3) halted state infrastructure is intact.

**Risk:** The briefing generator's `maxTurns` path (Step 3) is the one area requiring judgment rather than mechanical deletion. The generator currently sets `maxTurns` through `resourceOverrides` on `SessionPrepSpec`. After the type change, it needs to set `maxTurns` directly on the options object. The pattern is clear but the exact wiring depends on whether `prepareSdkSession` returns a mutable options object. It does (it's a plain object spread), so post-prep mutation is safe.

**Order matters:** Phase 1 must be done in step order (types first, then consumers). Phase 2 and Phase 3 can be interleaved but Phase 1 must come first. Phase 4 is independent.
