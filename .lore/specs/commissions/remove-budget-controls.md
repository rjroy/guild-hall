---
title: Remove Budget Controls from Commission System
date: 2026-03-22
status: draft
tags: [commissions, simplification, budget, resource-limits, halted-state]
modules: [guild-hall-core]
related:
  - .lore/specs/commissions/guild-hall-commissions.md
  - .lore/specs/commissions/commission-halted-continuation.md
  - .lore/specs/commissions/guild-hall-scheduled-commissions.md
  - .lore/specs/infrastructure/model-selection.md
  - .lore/specs/workers/guild-hall-workers.md
req-prefix: RBUDGET
---

# Spec: Remove Budget Controls from Commission System

## Overview

The `maxTurns` and `maxBudgetUsd` fields exist at every layer of the commission system: worker package defaults, commission artifact frontmatter, SDK session options, the halt trigger, scheduled commission templates, triggered commission overrides, the web UI form, and the manager toolbox schemas. They have provided no value. The Guild Master has no reliable intuition for appropriate values, leading to commissions halting or failing unnecessarily. Budget management belongs at the Anthropic account level (API usage limits), not within Guild Hall.

This spec defines two phases of removal:

**Phase 1** removes all turn-count and budget enforcement from the system: types, schemas, artifacts, UI fields, toolbox parameters, and the `maxTurns` trigger that was the only path into the `halted` state. The `model` field in `resourceOverrides` is preserved (it serves a different purpose: capability selection, not cost control). Commissions run to natural completion or failure.

**Phase 2** removes the `halted` commission state entirely. With `maxTurns` gone, no code path transitions a commission into `halted`. The entire halted infrastructure becomes dead code: the state itself, continue/save/abandon flows, crash recovery for halted commissions, preserved worktree logic, UI action buttons, manager toolbox tools (`continue_commission`, `save_commission`), and route endpoints. Removing it now avoids carrying ~2,000 lines of unreachable production code and ~1,200 lines of tests for behavior that cannot occur.

## Motivation

Three problems drive this removal:

1. **No good defaults exist.** Worker packages declare `maxTurns` values (120-300) based on speculation about workload. Real commissions routinely exceed them. The Illuminator's 120-turn default is too low for multi-draft image workflows; the writer's 300-turn default is too low for spec-and-plan commissions. Every default is wrong for some workload.

2. **The Guild Master cannot set overrides reliably.** When dispatching commissions, the Guild Master would need to predict how many SDK turns a task requires. It cannot. Complex tasks vary wildly. The override mechanism exists but produces no benefit because the caller has no signal to base the override on.

3. **Budget enforcement at this layer is redundant.** Anthropic API usage limits already cap spend at the account level. Guild Hall's per-session budget cap adds friction without adding safety, because the account-level limit is the real constraint.

## Scope

**Phase 1 (in scope):** Remove `maxTurns` and `maxBudgetUsd` from types, schemas, artifacts, UI, toolbox schemas, SDK session options, worker activation, package metadata, scheduled commission templates, the halt trigger, and all associated tests.

**Phase 2 (in scope):** Remove the `halted` commission state and all supporting infrastructure: `HaltedCommissionState` type, state file persistence, `handleHalt`, continue/save/abandon flows, crash recovery for halted commissions, `continue_commission` and `save_commission` manager toolbox tools, daemon route endpoints for continue/save, web UI action buttons and API proxy routes for halted commissions, and the `"halted"` status from filters, lifecycle transitions, and status groupings.

**Out of scope:**
- The `model` field in `resourceOverrides`. Model overrides serve a different purpose (capability selection) and stay.
- Internal SDK turn limits for lightweight utility sessions (triage, briefing, notes generator). These are internal implementation details, not user-facing budget controls. They use `maxTurns` on the `SdkQueryOptions` directly, not through the `resourceOverrides`/`resourceDefaults` pipeline.

## Requirements

### Phase 1: Budget Control Removal

#### Type Removal

- REQ-RBUDGET-1: Remove `ResourceDefaults` interface from `lib/types.ts`. Remove `resourceDefaults` from `WorkerMetadata`. Remove `resourceDefaults` from `ActivationContext`. Remove `resourceBounds` from `ActivationResult`.

- REQ-RBUDGET-2: Remove `resourceDefaultsSchema` from `lib/packages.ts`. The `guildHallSchema` for worker packages no longer includes `resourceDefaults`.

- REQ-RBUDGET-3: Remove `maxTurns` and `maxBudgetUsd` from the `resource_overrides` type in `CommissionMeta` (`lib/commissions.ts`). The field becomes `resource_overrides: { model?: string }`. Parsing logic drops the `maxTurns` and `maxBudgetUsd` extraction.

- REQ-RBUDGET-4: Remove `maxTurns` and `maxBudgetUsd` from `SessionPrepSpec.resourceOverrides` (`daemon/lib/agent-sdk/sdk-runner.ts`). The type becomes `resourceOverrides?: { model?: string }`.

- REQ-RBUDGET-5: Remove `maxTurns` and `maxBudgetUsd` from `SdkRunnerOutcome.reason`. The `"maxTurns"` and `"maxBudget"` reason variants are removed. `reason` becomes `"completed" | undefined` (completed on success, undefined on abort/error).

- REQ-RBUDGET-6: Remove the `maxTurns` parameter from `drainSdkSession`. The function no longer checks turn counts against a limit. It still counts turns for `turnsUsed` (observability) but does not halt on a threshold.

#### SDK Session Changes

- REQ-RBUDGET-7: `prepareSdkSession` no longer reads `maxTurns` or `maxBudgetUsd` from activation results or resource overrides. The built `SdkQueryOptions` object omits these fields. The SDK runs without turn or budget limits from Guild Hall's side.

- REQ-RBUDGET-8: The briefing generator's `resourceOverrides` retains `maxTurns` for its internal sessions. These are lightweight utility sessions where a turn limit is an implementation safeguard, not a user-facing budget control. The briefing generator sets `maxTurns` directly on its `SdkQueryOptions`, not through the `resourceOverrides` pipeline. Same for the triage runner and notes generator.

#### Commission Lifecycle Changes

- REQ-RBUDGET-9: The `maxTurns` trigger for the `halted` state is removed. `handleSessionCompletion` no longer checks `outcome.reason === "maxTurns"`. A session that completes without submitting a result transitions to `failed`, regardless of turn count.

- REQ-RBUDGET-10: After Phase 1, no code path transitions a commission into `halted`. The `handleHalt` function, state file writes, and the `"maxTurns"` halt trigger are all dead code. Phase 1 may leave `handleHalt` as dead code or remove it; Phase 2 completes the cleanup regardless.

- REQ-RBUDGET-11: A session that completes without submitting a result and without a recognized halt trigger transitions to `failed`. There is no fallback to `halted`.

#### Artifact Changes

- REQ-RBUDGET-12: Commission artifact frontmatter no longer includes `maxTurns` or `maxBudgetUsd` in `resource_overrides`. The `createCommission`, `createScheduledCommission`, and `updateCommission` functions stop writing these fields. Existing artifacts with these fields are harmless (ignored on parse).

- REQ-RBUDGET-13: The `resource_overrides` block in commission artifacts is retained when it contains a `model` value. If `resource_overrides` would be empty after removing budget fields, the block is omitted entirely.

#### Worker Package Changes

- REQ-RBUDGET-14: Remove `resourceDefaults` from all worker `package.json` files. The `guildHall` section no longer includes `resourceDefaults`. Affected packages: `guild-hall-researcher`, `guild-hall-reviewer`, `guild-hall-illuminator`, `guild-hall-writer`, `guild-hall-visionary`, `guild-hall-steward`.

- REQ-RBUDGET-15: Remove `resourceDefaults` from the Guild Master's hardcoded metadata in `daemon/services/manager/worker.ts`.

#### Worker Activation Changes

- REQ-RBUDGET-16: Remove `resourceBounds` assembly from worker activation functions. `packages/shared/worker-activation.ts` no longer reads `context.resourceDefaults` to build `resourceBounds`. `daemon/services/manager/worker.ts` (`activateManager`) no longer builds `resourceBounds`.

#### Toolbox and Route Changes

- REQ-RBUDGET-17: Remove `maxTurns` and `maxBudgetUsd` from the `create_commission` tool's Zod schema and all references in the manager toolbox (`daemon/services/manager/toolbox.ts`). The `resourceOverrides` parameter becomes `z.object({ model: z.string().optional() }).optional()`.

- REQ-RBUDGET-18: Remove `maxTurns` and `maxBudgetUsd` from the `create_scheduled_commission` and `update_schedule` tool schemas in the manager toolbox.

- REQ-RBUDGET-19: Remove `maxTurns` and `maxBudgetUsd` from the commission creation and scheduling route body types (`daemon/routes/commissions.ts`).

- REQ-RBUDGET-20: The `update_commission` tool's `resourceOverrides` handling in the manager toolbox removes the regex-based YAML update logic for `maxTurns` and `maxBudgetUsd`. Only `model` updates remain.

#### Scheduler Changes

- REQ-RBUDGET-21: `readResourceOverrides` in `daemon/services/scheduler/index.ts` stops parsing `maxTurns` and `maxBudgetUsd` from scheduled commission artifact YAML. It parses only `model`.

#### UI Changes

- REQ-RBUDGET-22: Remove the "Max Turns" and "Max Budget (USD)" input fields from `CommissionForm.tsx`. Remove the associated state variables, validation logic, and inclusion in the `resourceOverrides` payload. The form retains the model override selector.

- REQ-RBUDGET-23: Remove the "Max Turns" and "Max Budget" labels from the `CommissionForm.module.css` styles if they become orphaned.

#### Documentation Changes

- REQ-RBUDGET-24: Update `CLAUDE.md` commission lifecycle description to note that `halted` is no longer reachable (Phase 1) or to remove it entirely (if Phase 2 is implemented in the same commission). Update `docs/usage/commissions.md` to remove halted-due-to-maxTurns documentation.

- REQ-RBUDGET-25: Existing lore specs (guild-hall-commissions.md, commission-halted-continuation.md, guild-hall-workers.md, guild-hall-scheduled-commissions.md, guild-hall-views.md, model-selection.md) contain references to `maxTurns`, `maxBudgetUsd`, and `resourceDefaults`. These are historical artifacts. They do not need to be updated in this commission but should be updated when those specs are next revised.

#### Halted State Type Update

- REQ-RBUDGET-26: In Phase 1, update the comment in `daemon/services/commission/halted-types.ts` to remove the `maxTurns` reference. Phase 2 deletes this file entirely (see REQ-RBUDGET-27).

### Phase 2: Halted State Removal

With `maxTurns` removed in Phase 1, no code path can transition a commission into `halted`. The halted infrastructure is dead code. Phase 2 removes it.

#### State and Type Removal

- REQ-RBUDGET-27: Delete `daemon/services/commission/halted-types.ts`. The `HaltedCommissionState` type is no longer used.

- REQ-RBUDGET-28: Remove `"halted"` from the `CommissionStatus` union type in `daemon/types.ts`.

- REQ-RBUDGET-29: Remove the `halted` entry from the lifecycle transition graph in `daemon/services/commission/lifecycle.ts`. Remove `"halted"` from the `in_progress` target states. Remove the `halt()` and `continueHalted()` lifecycle methods.

- REQ-RBUDGET-30: Remove `halted` from the `STATUS_GROUP` mapping in `lib/commissions.ts`. Remove the `halted: "status_halted"` entry from the event mapping.

#### Orchestrator Cleanup

- REQ-RBUDGET-31: Remove the `handleHalt` function from `daemon/services/commission/orchestrator.ts`. If Phase 1 left it as dead code, Phase 2 deletes it. If Phase 1 already removed it, this requirement is satisfied.

- REQ-RBUDGET-32: Remove the `continueCommission` function from the orchestrator. Remove `continueCommission` from the `CommissionSessionForRoutes` interface and the factory return object.

- REQ-RBUDGET-33: Remove the `saveCommission` function from the orchestrator. Remove `saveCommission` from the `CommissionSessionForRoutes` interface and the factory return object.

- REQ-RBUDGET-34: Remove the `cancelHaltedCommission` function from the orchestrator. The cancel route's halted-specific branch (which calls this function for worktree cleanup and branch preservation) is removed. Cancellation of `halted` commissions is no longer possible because the state does not exist.

- REQ-RBUDGET-35: Remove state file utilities from the orchestrator: `commissionStatePath`, `writeStateFile`, `deleteStateFile`. These exist solely to persist and recover halted commission state.

- REQ-RBUDGET-36: Remove halted state recovery from `recoverCommissions`. The recovery logic that scans for halted state files and reconciles them with artifact status is removed. Recovery still handles other states (in_progress, dispatched).

#### Route Removal

- REQ-RBUDGET-37: Remove the `POST /commission/run/continue` route from `daemon/routes/commissions.ts`.

- REQ-RBUDGET-38: Remove the `POST /commission/run/save` route from `daemon/routes/commissions.ts`.

#### Manager Toolbox Removal

- REQ-RBUDGET-39: Remove the `continue_commission` tool from the manager toolbox (`daemon/services/manager/toolbox.ts`). Remove the `makeContinueCommissionHandler` function and its tool registration.

- REQ-RBUDGET-40: Remove the `save_commission` tool from the manager toolbox. Remove the `makeSaveCommissionHandler` function and its tool registration.

#### Web UI Removal

- REQ-RBUDGET-41: Remove the continue and save action buttons from `web/components/commission/CommissionActions.tsx`. Remove the `handleContinue` and `handleSave` handlers, the `showContinue` and `showSave` visibility checks, the `saveReason` state variable, and the associated confirmation dialogs. The `"continue"` and `"save"` variants are removed from the confirming state union. If removing these leaves the component with only cancel/abandon actions, simplify accordingly.

- REQ-RBUDGET-42: Delete the web API proxy routes for halted commission actions: `web/app/api/commissions/[commissionId]/continue/route.ts` and `web/app/api/commissions/[commissionId]/save/route.ts`.

- REQ-RBUDGET-43: Remove `"halted"` from the `DEFAULT_STATUSES` set and the "Active" filter group in `web/components/commission/commission-filter.ts`.

#### Scheduler Cleanup

- REQ-RBUDGET-44: Remove the `|| status === "halted"` check from `isSpawnedCommissionActive` in `daemon/services/scheduler/index.ts`. A commission can no longer be in `halted` status, so the check is dead code.

#### Documentation Updates

- REQ-RBUDGET-45: Update `CLAUDE.md` to remove all references to the `halted` commission state: the lifecycle flow description (`pending` -> `dispatched` -> `in_progress` -> `completed`/`failed`, no `halted`), the `halted-types.ts` entry in the daemon service descriptions, and any mention of continue/save flows. Update `docs/usage/commissions.md` to remove halted state documentation.

- REQ-RBUDGET-46: The `commission-halted-continuation.md` spec in `.lore/specs/commissions/` becomes historical. Add a status note marking it as superseded by this spec. Do not delete it (it documents the original design intent).

#### Test Cleanup

- REQ-RBUDGET-47: Remove all halted-related tests from `tests/daemon/services/commission/lifecycle.test.ts`: the "halted transitions" describe block, `halt()` tests, `continueHalted()` tests, and transitions from/to halted.

- REQ-RBUDGET-48: Remove all halted-related tests from `tests/daemon/services/commission/orchestrator.test.ts`: halt entry tests, `continueCommission` tests, `saveCommission` tests, cancel/abandon halted commission tests, halted crash recovery tests, and capacity-related halted tests.

- REQ-RBUDGET-49: Remove all halted-related tests from `tests/components/commission-actions.test.tsx`: halted status visibility, handleContinue, handleSave, save reason, mutual exclusion of halted actions, API proxy route tests for continue/save, and button order tests for halted status.

- REQ-RBUDGET-50: Remove the `continueCommission` and `saveCommission` mock setup from the test harness in `tests/daemon/routes/commissions.test.ts`. Remove the `POST /commission/run/save` describe block and any `POST /commission/run/continue` tests.

## Backward Compatibility

**Phase 1:** Existing commission artifacts with `maxTurns` and `maxBudgetUsd` in their `resource_overrides` frontmatter will have those fields silently ignored during parsing (they map to `undefined` after the type change). No migration is needed. Existing worker packages with `resourceDefaults` in their `package.json` will have those fields ignored by the updated schema. The Zod schema change makes the field absent; the JSON stays valid because Zod's `.strip()` behavior drops unknown keys.

**Phase 2:** Existing commission artifacts with `status: halted` in their frontmatter will have an unrecognized status value. Since no running commission can be in `halted` state after Phase 1 (no trigger exists), this only affects historical artifacts. The artifact remains parseable; the status string is just not a valid `CommissionStatus` union member. If any halted state files exist in `~/.guild-hall/state/commissions/`, they are orphaned and can be safely deleted. The implementation should log a warning and skip any orphaned state files found during recovery.

## Acceptance Criteria

### Phase 1

- [ ] No source file outside `.lore/` and `docs/` references `maxTurns` or `maxBudgetUsd` in the context of budget/resource controls (utility session turn limits in briefing/triage/notes are exempt)
- [ ] `resourceDefaults` and `resourceBounds` types are removed
- [ ] Commission form has no turn/budget inputs
- [ ] Manager toolbox schemas have no turn/budget fields
- [ ] Commissions run to natural completion without turn-count halting
- [ ] No code path transitions a commission into `halted`
- [ ] All existing tests are updated or removed; no test references removed types
- [ ] Pre-commit hook passes (typecheck, lint, tests, build)

### Phase 2

- [ ] `"halted"` is not a valid `CommissionStatus`
- [ ] `halted-types.ts` is deleted
- [ ] No `handleHalt`, `continueCommission`, `saveCommission`, or `cancelHaltedCommission` functions exist in the orchestrator
- [ ] No state file utilities (`commissionStatePath`, `writeStateFile`, `deleteStateFile`) exist in the orchestrator
- [ ] `continue_commission` and `save_commission` tools are not registered in the manager toolbox
- [ ] No daemon routes for `/commission/run/continue` or `/commission/run/save`
- [ ] No web API proxy routes for continue or save
- [ ] `CommissionActions` component has no continue/save buttons
- [ ] Commission filters do not reference `halted`
- [ ] Crash recovery does not scan for halted state files
- [ ] `commission-halted-continuation.md` spec is marked as superseded
- [ ] All halted-related tests are removed
- [ ] Pre-commit hook passes (typecheck, lint, tests, build)
