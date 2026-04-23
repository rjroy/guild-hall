---
title: "Plan: Remove Budget Controls from Commission System"
date: 2026-03-22
status: executed
spec: .lore/specs/commissions/remove-budget-controls.md
tags: [commissions, simplification, budget, resource-limits, halted-state]
modules: [guild-hall-core]
---

# Plan: Remove Budget Controls from Commission System

## Overview

Two-phase removal of budget controls and the halted commission state. Each phase is a separate commission.

**Phase 1 commission** removes `maxTurns`, `maxBudgetUsd`, `resourceDefaults`, and `resourceBounds` from the entire system. The `model` field in `resourceOverrides` survives. Internal utility session turn limits (briefing, triage, notes) are untouched. Structured as four sub-phases, each independently committable and testable.

**Phase 2 commission** removes the `halted` commission state entirely. With `maxTurns` gone after Phase 1, no code path transitions a commission into `halted`. The entire halted infrastructure is dead code: the state type, continue/save/abandon flows, crash recovery, preserved worktree logic, UI action buttons, manager toolbox tools, and route endpoints. Removing it avoids carrying ~2,000 lines of unreachable production code and ~1,200 lines of tests for behavior that cannot occur.

## Surface Area Catalog

Every file that references `maxTurns`, `maxBudgetUsd`, `resourceDefaults`, or `resourceBounds` in the context of budget controls. Files are grouped by the phase that modifies them.

### Source Files (Phase 1, sub-phases 1-3)

| File | What changes |
|------|-------------|
| `lib/types.ts` | Remove `ResourceDefaults`, remove `resourceDefaults` from `WorkerMetadata` and `ActivationContext`, remove `resourceBounds` from `ActivationResult` |
| `lib/packages.ts` | Remove `resourceDefaultsSchema`, remove from `guildHallSchema` |
| `lib/commissions.ts` | Remove `maxTurns`/`maxBudgetUsd` from `CommissionMeta.resource_overrides` type and parsing |
| `apps/daemon/lib/agent-sdk/sdk-runner.ts` | Remove from `SessionPrepSpec.resourceOverrides`, `SdkRunnerOutcome.reason`, `drainSdkSession` opts, `prepareSdkSession` option assembly |
| `apps/daemon/services/commission/orchestrator.ts` | Remove maxTurns halt trigger, remove budget fields from artifact creation/update/parse functions |
| `apps/daemon/services/commission/halted-types.ts` | Update comment only |
| `apps/daemon/services/manager/worker.ts` | Remove `resourceDefaults` from Guild Master metadata, remove `resourceBounds` from `activateManager` |
| `apps/daemon/services/manager/toolbox.ts` | Remove `maxTurns`/`maxBudgetUsd` from all Zod schemas and YAML update logic |
| `apps/daemon/routes/commissions.ts` | Remove `maxTurns`/`maxBudgetUsd` from route body types |
| `apps/daemon/services/scheduler/index.ts` | Remove from `readResourceOverrides` |
| `packages/shared/worker-activation.ts` | Remove `resourceBounds` assembly |
| `apps/web/components/commission/CommissionForm.tsx` | Remove Max Turns and Max Budget input fields |

### Worker Packages (Phase 1, sub-phase 2)

| Package | Change |
|---------|--------|
| `packages/guild-hall-researcher/package.json` | Remove `resourceDefaults` |
| `packages/guild-hall-reviewer/package.json` | Remove `resourceDefaults` |
| `packages/guild-hall-illuminator/package.json` | Remove `resourceDefaults` |
| `packages/guild-hall-writer/package.json` | Remove `resourceDefaults` |
| `packages/guild-hall-visionary/package.json` | Remove `resourceDefaults` |
| `packages/guild-hall-steward/package.json` | Remove `resourceDefaults` |

### Test Files (Phase 1, sub-phase 3)

| File | What changes |
|------|-------------|
| `lib/tests/packages.test.ts` | Remove `resourceDefaults` assertions |
| `lib/tests/commissions.test.ts` | Remove `maxTurns`/`maxBudgetUsd` from test data and assertions |
| `lib/tests/workspace-scoping.test.ts` | Remove budget fields from test data |
| `packages/tests/worker-role-smoke.test.ts` | Remove `resourceDefaults` from test data |
| `packages/tests/worker-activation.test.ts` | Remove `resourceDefaults`/`resourceBounds` from test data |
| `packages/guild-hall-illuminator/tests/integration.test.ts` | Remove maxTurns assertion |
| `apps/daemon/tests/services/sdk-runner.test.ts` | Remove maxTurns/maxBudget tests, update remaining tests |
| `apps/daemon/tests/services/commission/orchestrator.test.ts` | Remove halt-entry tests for maxTurns, update `resourceBounds` in remaining tests |
| `apps/daemon/tests/services/commission/record.test.ts` | Remove budget fields from test data |
| `apps/daemon/tests/services/manager/toolbox.test.ts` | Remove `maxTurns`/`maxBudgetUsd` from resourceOverrides test data |
| `apps/daemon/tests/services/manager-toolbox.test.ts` | Remove budget-related assertions |
| `apps/daemon/tests/services/manager-worker.test.ts` | Remove `resourceDefaults`/`resourceBounds` tests |
| `apps/daemon/tests/services/manager-context.test.ts` | Remove `resourceDefaults` from context data |
| `apps/daemon/tests/services/briefing-generator.test.ts` | Remove `resourceBounds` from test data |
| `apps/daemon/tests/services/outcome-triage.test.ts` | Remove maxTurns assertion (triage's internal limit stays, but the assertion on the exact value may need updating) |
| `apps/daemon/tests/services/trigger-evaluator-service.test.ts` | Remove `_resourceOverrides` placeholder |
| `apps/daemon/tests/services/scheduler/scheduler.test.ts` | Remove budget fields from `resourceOverrides` parameter |
| `apps/daemon/tests/services/meeting/orchestrator.test.ts` | Remove `resourceDefaults`/`resourceBounds` from test data |
| `apps/daemon/tests/services/meeting/recovery.test.ts` | Remove `resourceDefaults`/`resourceBounds` from test data |
| `apps/daemon/tests/meeting-session.test.ts` | Remove `resourceDefaults`/`resourceBounds`/`maxTurns` assertions |
| `apps/daemon/tests/meeting-project-scope.test.ts` | Remove `resourceDefaults`/`resourceBounds` from test data |
| `apps/daemon/tests/integration.test.ts` | Remove `resourceDefaults`/`resourceBounds`/`maxTurns` assertions |
| `apps/daemon/tests/integration-commission.test.ts` | Remove `resourceBounds` from test data |
| `apps/daemon/tests/commission-toolbox.test.ts` | Remove budget fields from test data |
| `apps/daemon/tests/notes-generator.test.ts` | Remove `maxTurns`/`maxBudgetUsd` assertions (except internal limit checks), remove `resourceDefaults`/`resourceBounds` from test data |
| `apps/daemon/tests/routes/commissions.test.ts` | Remove budget fields from test data and assertions |
| `apps/daemon/tests/routes/commissions-read.test.ts` | Remove budget fields from test data and assertions |
| `apps/web/tests/components/commission-form.test.tsx` | Remove maxTurns/maxBudgetUsd form interaction tests |

### Files NOT Modified (internal utility limits preserved)

| File | Why untouched |
|------|--------------|
| `apps/daemon/services/briefing-generator.ts` | Uses `maxTurns` on `SdkQueryOptions` directly for internal session limits (200, 10, 1). These are implementation safeguards, not user-facing budget controls. However, `resourceOverrides.maxTurns` in `SessionPrepSpec` will no longer exist, so the briefing generator must set `maxTurns` directly on the options object post-prep, not through `resourceOverrides`. See Phase 1 Step 3. |
| `apps/daemon/services/outcome-triage.ts` | Uses `maxTurns` directly on `SdkQueryOptions` (TRIAGE_MAX_TURNS = 10). Internal safeguard. Untouched. |
| `apps/daemon/services/meeting/notes-generator.ts` | Uses `maxTurns: 1` directly on `SdkQueryOptions`. Internal safeguard. Untouched. |

### Documentation (Phase 1 sub-phase 4)

| File | What changes |
|------|-------------|
| `CLAUDE.md` | Update commission lifecycle description (Phase 1: note halted unreachable; Phase 2: remove halted entirely) |
| `docs/usage/commissions.md` | Remove maxTurns halted documentation |

### Phase 2: Halted State Removal

#### Source Files

| File | What changes |
|------|-------------|
| `apps/daemon/services/commission/halted-types.ts` | Delete entire file |
| `apps/daemon/types.ts` | Remove `"halted"` from `CommissionStatus` union |
| `apps/daemon/services/commission/lifecycle.ts` | Remove halted from transition graph, delete `halt()` and `continueHalted()` methods |
| `apps/daemon/services/commission/orchestrator.ts` | Remove `handleHalt`, `continueCommission`, `saveCommission`, `cancelHaltedCommission`, `commissionStatePath`, `writeStateFile`, `deleteStateFile`, halted recovery from `recoverCommissions`; remove from `CommissionSessionForRoutes` interface |
| `apps/daemon/routes/commissions.ts` | Remove `POST /commission/run/continue` and `POST /commission/run/save` routes |
| `apps/daemon/services/manager/toolbox.ts` | Remove `continue_commission` and `save_commission` tools, `makeContinueCommissionHandler`, `makeSaveCommissionHandler` |
| `apps/web/components/commission/CommissionActions.tsx` | Remove continue/save buttons, handlers, confirmation dialogs, `saveReason` state |
| `apps/web/app/api/commissions/[commissionId]/continue/route.ts` | Delete entire file |
| `apps/web/app/api/commissions/[commissionId]/save/route.ts` | Delete entire file |
| `apps/web/components/commission/commission-filter.ts` | Remove `"halted"` from `DEFAULT_STATUSES` and "Active" filter group |
| `apps/daemon/services/scheduler/index.ts` | Remove `status === "halted"` from `isSpawnedCommissionActive` |
| `lib/commissions.ts` | Remove `halted` from `STATUS_GROUP` and event mapping |

#### Documentation Files

| File | What changes |
|------|-------------|
| `CLAUDE.md` | Remove all halted references: lifecycle flow, daemon service descriptions, continue/save mentions |
| `docs/usage/commissions.md` | Remove halted state documentation entirely |
| `.lore/specs/commissions/commission-halted-continuation.md` | Mark status as `superseded` |

#### Test Files

| File | What changes |
|------|-------------|
| `apps/daemon/tests/services/commission/lifecycle.test.ts` | Remove entire "halted transitions" describe block (~lines 844-990) |
| `apps/daemon/tests/services/commission/orchestrator.test.ts` | Remove halt entry tests (~lines 2629-2827), recovery halted tests (~lines 938-1050), continueCommission tests (~lines 2866-3179), saveCommission tests (~lines 3183-3380), cancel/abandon halted tests (~lines 3343-3455) |
| `apps/web/tests/components/commission-actions.test.tsx` | Remove halted visibility, handleContinue, handleSave, save reason, halted action mutual exclusion, API proxy route tests for continue/save |
| `apps/daemon/tests/routes/commissions.test.ts` | Remove `continueCommission`/`saveCommission` mock setup, `POST /commission/run/save` describe block, `POST /commission/run/continue` tests |

## Phase 1 Commission: Budget Control Removal

### Sub-phase 1: Core Type and Logic Removal

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

**File:** `apps/daemon/lib/agent-sdk/sdk-runner.ts`

- Remove `maxTurns` and `maxBudgetUsd` from `SessionPrepSpec.resourceOverrides` type (line 106). It becomes `resourceOverrides?: { model?: string }`.
- Remove `"maxTurns"` and `"maxBudget"` from `SdkRunnerOutcome.reason` (line 148). It becomes `reason?: "completed"`.
- Remove `opts` parameter from `drainSdkSession` (line 213). The function still counts turns for `turnsUsed` but doesn't compare against a limit. The reason assignment simplifies: if not aborted and no error, reason is `"completed"`.
- In `prepareSdkSession`, remove `maxTurns` and `maxBudgetUsd` assembly (lines 486-487) and their spread into the options object (lines 567-568). The `activation.resourceBounds` reference is removed entirely since the type no longer exists.

### Step 3: Fix briefing generator's maxTurns path

**File:** `apps/daemon/services/briefing-generator.ts`

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

**File:** `apps/daemon/services/commission/orchestrator.ts`

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

**Files:** `packages/shared/worker-activation.ts`, `apps/daemon/services/manager/worker.ts`

In `packages/shared/worker-activation.ts`:
- Remove `resourceBounds` from the returned `ActivationResult` (lines 78-79 and surrounding structure)

In `apps/daemon/services/manager/worker.ts`:
- Remove `resourceDefaults: { maxTurns: 200 }` from Guild Master metadata (lines 147-149)
- Remove `resourceBounds` from `activateManager` return (lines 234-237)
- Remove the line about `resourceOverrides` from the model guidance text (line 100), or update it to say "model" only

### Step 6: Remove from routes and scheduler

**Files:** `apps/daemon/routes/commissions.ts`, `apps/daemon/services/scheduler/index.ts`

In `apps/daemon/routes/commissions.ts`:
- Remove `maxTurns` and `maxBudgetUsd` from the `resourceOverrides` type in the create and scheduled-create route body schemas (lines 56, 168)

In `apps/daemon/services/scheduler/index.ts`:
- Remove `maxTurns` and `maxBudgetUsd` parsing from `readResourceOverrides` (lines 488-492). The function returns `{ model?: string }`.

### Step 7: Remove from manager toolbox schemas

**File:** `apps/daemon/services/manager/toolbox.ts`

- Remove `maxTurns: z.number().optional()` and `maxBudgetUsd: z.number().optional()` from the `create_commission` Zod schema (lines 1539-1541)
- Same for `create_scheduled_commission` schema (lines 1628-1630)
- Same for `update_schedule` schema (lines 1645-1647)
- Same for the `update_commission` handler's `resourceOverrides` schema (line 829 area)
- Remove the `maxTurns`/`maxBudgetUsd` regex update logic from the `update_commission` handler (lines 991-1002)
- Update tool descriptions to remove budget language

### Step 8: Remove from halted-types comment

**File:** `apps/daemon/services/commission/halted-types.ts`

Update the doc comment (lines 1-7) to remove the `maxTurns` reference. Describe the halted state generically: "When a commission is halted without submitting a result, the orchestrator persists this state to disk."

**Sub-phase 1 verification:** `bun run typecheck` should pass after all steps. The system compiles without budget types.

### Sub-phase 2: Package and UI Cleanup

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

**File:** `apps/web/components/commission/CommissionForm.tsx`

- Remove `maxTurns` and `maxBudgetUsd` state variables (lines 53-54)
- Remove the parsing and inclusion of `maxTurns`/`maxBudgetUsd` in `resourceOverrides` (lines 133-142)
- Remove from the `useCallback` dependency array (line 201)
- Remove the "Max Turns" and "Max Budget (USD)" input fields and their labels (lines 370-402)
- The `resourceOverrides` object now only includes `model` when set

Check `apps/web/components/commission/CommissionForm.module.css` for any styles that become orphaned. The `overridesField` and `overridesLabel` classes are likely shared with the model selector, so they stay.

**Sub-phase 2 verification:** `bun run build` should pass. The UI renders without budget fields.

### Sub-phase 3: Test Updates

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

`apps/daemon/tests/services/sdk-runner.test.ts`:
- Remove "reason is 'maxTurns'" test (line 317)
- Remove "reason is 'completed' when turn count is below maxTurns" test (line 330)
- Update "reason works without maxTurns opt" test (line 364) to just verify reason is "completed" on success
- Remove `resourceDefaults`/`resourceBounds` from `prepareSdkSession` test fixtures
- Remove the "resourceOverrides.maxTurns/maxBudgetUsd override" test (line 513 area)
- Keep the "resourceOverrides.model overrides activation model" test (line 776)

`apps/daemon/tests/services/commission/orchestrator.test.ts`:
- The `describe("halt entry (maxTurns without result)")` block (line 2628+) contains ~6 tests. Remove the entire block. The halted state has no trigger after this removal. If the halted infrastructure is tested elsewhere (continue, save, cancel), those tests remain.
- Remove `maxTurns` from `resourceBounds` in all remaining test fixtures. Since `resourceBounds` is removed from `ActivationResult`, these all need updating.
- Remove `maxTurns`/`maxBudgetUsd` from `resourceOverrides` in artifact creation tests

`apps/web/tests/components/commission-form.test.tsx`:
- Remove the test that submits maxTurns and maxBudgetUsd values (line 126 area)

### Step 12: Run tests and fix stragglers

After the mechanical updates, run `bun test` and fix any remaining failures. Type errors will guide the remaining spots.

**Sub-phase 3 verification:** `bun test` passes. `bun run typecheck` passes.

### Sub-phase 4: Documentation

**Goal:** Update user-facing documentation.

**REQs covered:** REQ-RBUDGET-24, REQ-RBUDGET-25

### Step 13: Update CLAUDE.md

Remove the `maxTurns` reference from the commission lifecycle description (line 130). The halted state description changes to: "Commissions may enter `halted` state with worktree and session preserved."

### Step 14: Update docs/usage/commissions.md

Remove the halted-due-to-maxTurns section (line 62 area). Replace with a description of halted state that doesn't reference maxTurns.

### Step 15: Update worker guidance text

In `apps/daemon/services/manager/worker.ts`, the model guidance line (line 100) mentions `resourceOverrides`. Update to say: "To override a worker's default model, set `model` in `resourceOverrides` when creating the commission."

This line may already say exactly that. Verify and adjust if it mentions maxTurns or maxBudgetUsd.

**Sub-phase 4 verification:** Full pre-commit hook passes: `bun run typecheck && bun run lint && bun test && bun run build`.

## Phase 2 Commission: Halted State Removal

**Goal:** Remove the `halted` commission state and all supporting infrastructure. After Phase 1 removes `maxTurns`, no code path can transition a commission into `halted`. Everything below is dead code removal.

**REQs covered:** REQ-RBUDGET-27 through REQ-RBUDGET-50

**Prerequisite:** Phase 1 commission must be merged to master before Phase 2 begins.

### Step 16: Delete halted type and remove from status union

**Files:** `apps/daemon/services/commission/halted-types.ts`, `apps/daemon/types.ts`, `lib/commissions.ts`

- Delete `apps/daemon/services/commission/halted-types.ts` entirely. The `HaltedCommissionState` type is no longer used.
- Remove `"halted"` from the `CommissionStatus` union type in `apps/daemon/types.ts`.
- Remove `halted` from the `STATUS_GROUP` mapping in `lib/commissions.ts`. Remove the `halted: "status_halted"` entry from the event mapping.

**Verification:** `bun run typecheck` will fail with many downstream errors pointing to every consumer of the halted state. This is expected; the errors guide the remaining steps.

### Step 17: Remove halted from lifecycle

**File:** `apps/daemon/services/commission/lifecycle.ts`

- Remove the `halted` entry from the `TRANSITIONS` map (line 53): `halted: ["in_progress", "completed", "cancelled", "abandoned", "failed"]`.
- Remove `"halted"` from the `in_progress` target states array.
- Delete the `halt()` method (lines 168-170).
- Delete the `continueHalted()` method (lines 172-174).
- Update the transition graph comment (lines 13-18) to remove halted lines.

### Step 18: Remove halted functions from orchestrator

**File:** `apps/daemon/services/commission/orchestrator.ts`

This is the largest single change. Work through these areas in order:

**Remove from `CommissionSessionForRoutes` interface (lines 159-160):**
- Delete `continueCommission(commissionId: CommissionId): Promise<{ status: "accepted" | "capacity_error" }>`
- Delete `saveCommission(commissionId: CommissionId, reason?: string): Promise<void>`

**Remove state file utilities (lines 277-297):**
- Delete `commissionStatePath()` (lines 277-279)
- Delete `writeStateFile()` (lines 281-288)
- Delete `deleteStateFile()` (lines 290-297)
- Remove the `HaltedCommissionState` import from `halted-types.ts`

**Remove `handleHalt()` (lines 545-647):**
Delete the entire 100-line halt entry function. If Phase 1 already removed it as dead code, this step is satisfied.

**Remove `cancelHaltedCommission()` (lines 832-906):**
Delete the function. Remove the halted-specific branch from the cancel route handler that calls it. The cancel route's remaining logic handles only `in_progress` and `dispatched` states.

**Remove halted recovery from `recoverCommissions()` (lines 1086-1137):**
Delete the halted recovery block that scans for state files, checks worktree existence, and reconciles halted commissions. Recovery continues to handle `in_progress` and `dispatched` states.

**Remove `continueCommission()` (lines 2161-2356):**
Delete the entire 196-line function. It reads halted state files, verifies worktree integrity, transitions to `in_progress`, builds a continuation prompt, and relaunches the SDK session.

**Remove `saveCommission()` (lines 2364-2539):**
Delete the entire 176-line function. It reads halted state files, commits pending changes, updates the result summary, transitions to `completed`, and runs a squash-merge.

**Remove from factory return object:**
Remove `continueCommission` and `saveCommission` from the object returned by the orchestrator factory function.

### Step 19: Remove daemon routes for continue and save

**File:** `apps/daemon/routes/commissions.ts`

- Delete the `POST /commission/run/continue` route handler (lines 290-322).
- Delete the `POST /commission/run/save` route handler (lines 324-353).
- Remove `continueCommission` and `saveCommission` from the destructured deps in the route factory, since they come from `CommissionSessionForRoutes`.

### Step 20: Remove manager toolbox tools

**File:** `apps/daemon/services/manager/toolbox.ts`

- Delete `makeContinueCommissionHandler()` (lines 632-686) and its tool registration (line 1516).
- Delete `makeSaveCommissionHandler()` (lines 688-731) and its tool registration (line 1517).
- Remove the "halted commission tools" comment header (lines 630-631).

### Step 21: Remove web UI halted infrastructure

**Files:** Multiple web components and API routes.

**CommissionActions.tsx** (`apps/web/components/commission/CommissionActions.tsx`):
- Remove `"continue" | "save"` from the confirming state union type (line 33-35).
- Delete the `saveReason` state variable (line 37).
- Delete `handleContinue()` handler (lines 129-148).
- Delete `handleSave()` handler (lines 150-176).
- Remove `showContinue` and `showSave` visibility checks (lines 180-181).
- Remove `status === "halted"` from the `showAbandon` condition (line 189).
- Delete the continue confirmation dialog (lines 213-250).
- Delete the save confirmation dialog with textarea (lines 252-301).
- If the component now only has cancel/abandon buttons, simplify the confirming state type accordingly.

**Delete API proxy routes:**
- Delete `apps/web/app/api/commissions/[commissionId]/continue/route.ts` (entire file, 25 lines).
- Delete `apps/web/app/api/commissions/[commissionId]/save/route.ts` (entire file, 37 lines).

**Commission filter** (`apps/web/components/commission/commission-filter.ts`):
- Remove `"halted"` from the `DEFAULT_STATUSES` set (line 9).
- Remove `"halted"` from the "Active" filter group (line 18).

### Step 22: Remove scheduler halted check

**File:** `apps/daemon/services/scheduler/index.ts`

- Remove `|| status === "halted"` from `isSpawnedCommissionActive()` (line 519). The function becomes:
  ```typescript
  return status === "dispatched" || status === "in_progress";
  ```
- Update the comment (lines 502-503) to remove the halted mention.

### Step 23: Update documentation

**CLAUDE.md:**
- Update the commission lifecycle description (line 130). Remove halted entirely:
  ```
  **Commission lifecycle.** Commissions flow through: `pending` -> `dispatched` -> `in_progress` -> `completed`/`failed`. Scheduled commissions use `apps/daemon/services/scheduler/` with croner.
  ```
- Update the routes table (line 45): change `Create, list, dispatch, continue, save, cancel` to `Create, list, dispatch, cancel`.
- Update the services table (line 62): change `Commission orchestrator (dispatch, lifecycle, halted state, capacity)` to `Commission orchestrator (dispatch, lifecycle, capacity)`.

**docs/usage/commissions.md:**
Remove any remaining halted state documentation. After Phase 1 removed the maxTurns/halted-trigger docs, Phase 2 removes any lingering halted state references (action buttons, continue/save flows).

**.lore/specs/commissions/commission-halted-continuation.md:**
Update frontmatter `status` from `implemented` to `superseded`. Add a note below the frontmatter:
```
> Superseded by `.lore/specs/commissions/remove-budget-controls.md` (Phase 2). The halted state was removed entirely after the maxTurns trigger was removed in Phase 1.
```

### Step 24: Remove halted tests

Work through each test file. The volume is high but the work is mechanical: delete entire describe blocks and remove halted references from fixtures.

**`apps/daemon/tests/services/commission/lifecycle.test.ts` (lines 844-990):**
Delete the entire "halted transitions" describe block (~146 lines). This covers:
- `halt()` and `continueHalted()` transition tests
- Transitions from halted to completed, cancelled, abandoned, failed
- Rejected transitions from halted to pending, dispatched, blocked
- `halt()` and `continueHalted()` event emission tests
- Halted commissions not counting as active
- Halt/continue cycle test
- Concurrent halt rejection test

**`apps/daemon/tests/services/commission/orchestrator.test.ts`:**
Delete these blocks:
- Halt entry tests (~lines 2629-2827, ~198 lines): maxTurns without result transitions, halt_count increment, timeline recording, removal from executions
- Halted recovery tests (~lines 938-1050, ~112 lines): intact worktree stays halted, missing worktree transitions to failed, capacity after recovery
- `continueCommission` tests (~lines 2866-3179, ~313 lines): continuation with prompt, worktree missing failure, capacity failure
- `saveCommission` tests (~lines 3183-3380, ~197 lines): partial work save with squash-merge, worktree missing failure
- Cancel/abandon halted tests (~lines 3343-3455, ~112 lines): branch preserved, worktree cleanup, status sync, dependent unblocking

**`apps/web/tests/components/commission-actions.test.tsx`:**
Delete all halted-related test cases:
- Halted status visibility (showContinue, showSave)
- `handleContinue` handler tests
- `handleSave` handler tests
- Save reason textarea tests
- Mutual exclusion of halted actions
- API proxy route tests for continue/save
- Button order tests for halted status

**`apps/daemon/tests/routes/commissions.test.ts`:**
- Remove `continueCommission` and `saveCommission` from the mock setup in the test harness (they come from `CommissionSessionForRoutes`).
- Delete the `POST /commission/run/save` describe block.
- Delete any `POST /commission/run/continue` tests.

### Step 25: Run tests and verify

Run `bun test` and fix any remaining type errors or test failures. The typecheck errors from Step 16 should all be resolved by Steps 17-24.

**Phase 2 verification:** Full pre-commit hook passes: `bun run typecheck && bun run lint && bun test && bun run build`.

## Execution Notes

**Delegation:** Two separate commissions for Dalton.

*Phase 1 commission:* Budget control removal (Steps 1-15). Mechanical type removal with cascading fixes. One judgment call: the briefing generator's `maxTurns` path (Step 3). The pattern is clear but the exact wiring depends on whether `prepareSdkSession` returns a mutable options object. It does (plain object spread), so post-prep mutation is safe.

*Phase 2 commission:* Halted state removal (Steps 16-25). Pure dead code deletion. No design judgment required. Every function, route, and test being removed is verifiably unreachable after Phase 1 removes the only trigger into halted state.

**Review:** Dispatch a Thorne review after each commission.

Phase 1 review focus: (1) no budget references leaked through, (2) internal utility session limits are preserved, (3) halted state infrastructure is intact (Phase 1 does not remove it).

Phase 2 review focus: (1) no halted references remain in source or tests, (2) cancel route still works for `in_progress` and `dispatched` states (the halted branch is removed but the others stay), (3) crash recovery still handles `in_progress` and `dispatched` states, (4) `CommissionActions` component still renders cancel/abandon for valid states.

**Order matters:** Phase 1 must be merged before Phase 2 begins. Within Phase 1, sub-phase 1 must be done in step order (types first, then consumers). Sub-phases 2 and 3 can be interleaved. Sub-phase 4 is independent. Within Phase 2, Step 16 creates the type errors that guide Steps 17-24. Step 25 is final verification.

**Risk:** Phase 2 is lower risk than Phase 1. It is pure deletion of unreachable code. The only subtlety is the cancel route: it currently has a halted-specific branch (`cancelHaltedCommission`) alongside the general cancel path. Removing the halted branch must not break cancellation of `in_progress` or `dispatched` commissions. The reviewer should verify this specifically.
