---
title: Remove Budget Controls from Commission System
date: 2026-03-22
status: draft
tags: [commissions, simplification, budget, resource-limits]
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

This spec defines the removal of all turn-count and budget enforcement from the system. The `model` field in `resourceOverrides` is preserved (it serves a different purpose: capability selection, not cost control). The `halted` state is preserved for other triggers (SDK session expiry, user-initiated stops), but the `maxTurns` trigger for halting is removed. Commissions run to natural completion or failure.

## Motivation

Three problems drive this removal:

1. **No good defaults exist.** Worker packages declare `maxTurns` values (120-300) based on speculation about workload. Real commissions routinely exceed them. The Illuminator's 120-turn default is too low for multi-draft image workflows; the writer's 300-turn default is too low for spec-and-plan commissions. Every default is wrong for some workload.

2. **The Guild Master cannot set overrides reliably.** When dispatching commissions, the Guild Master would need to predict how many SDK turns a task requires. It cannot. Complex tasks vary wildly. The override mechanism exists but produces no benefit because the caller has no signal to base the override on.

3. **Budget enforcement at this layer is redundant.** Anthropic API usage limits already cap spend at the account level. Guild Hall's per-session budget cap adds friction without adding safety, because the account-level limit is the real constraint.

## Scope

**In scope:** Remove `maxTurns` and `maxBudgetUsd` from types, schemas, artifacts, UI, toolbox schemas, SDK session options, worker activation, package metadata, scheduled commission templates, the halt trigger, and all associated tests.

**Out of scope:**
- The `halted` state and its continuation/save/cancel flows. These remain for SDK errors and user-initiated stops. Only the `maxTurns` trigger is removed.
- The `model` field in `resourceOverrides`. Model overrides serve a different purpose (capability selection) and stay.
- Internal SDK turn limits for lightweight utility sessions (triage, briefing, notes generator). These are internal implementation details, not user-facing budget controls. They use `maxTurns` on the `SdkQueryOptions` directly, not through the `resourceOverrides`/`resourceDefaults` pipeline.

## Requirements

### Type Removal

- REQ-RBUDGET-1: Remove `ResourceDefaults` interface from `lib/types.ts`. Remove `resourceDefaults` from `WorkerMetadata`. Remove `resourceDefaults` from `ActivationContext`. Remove `resourceBounds` from `ActivationResult`.

- REQ-RBUDGET-2: Remove `resourceDefaultsSchema` from `lib/packages.ts`. The `guildHallSchema` for worker packages no longer includes `resourceDefaults`.

- REQ-RBUDGET-3: Remove `maxTurns` and `maxBudgetUsd` from the `resource_overrides` type in `CommissionMeta` (`lib/commissions.ts`). The field becomes `resource_overrides: { model?: string }`. Parsing logic drops the `maxTurns` and `maxBudgetUsd` extraction.

- REQ-RBUDGET-4: Remove `maxTurns` and `maxBudgetUsd` from `SessionPrepSpec.resourceOverrides` (`daemon/lib/agent-sdk/sdk-runner.ts`). The type becomes `resourceOverrides?: { model?: string }`.

- REQ-RBUDGET-5: Remove `maxTurns` and `maxBudgetUsd` from `SdkRunnerOutcome.reason`. The `"maxTurns"` and `"maxBudget"` reason variants are removed. `reason` becomes `"completed" | undefined` (completed on success, undefined on abort/error).

- REQ-RBUDGET-6: Remove the `maxTurns` parameter from `drainSdkSession`. The function no longer checks turn counts against a limit. It still counts turns for `turnsUsed` (observability) but does not halt on a threshold.

### SDK Session Changes

- REQ-RBUDGET-7: `prepareSdkSession` no longer reads `maxTurns` or `maxBudgetUsd` from activation results or resource overrides. The built `SdkQueryOptions` object omits these fields. The SDK runs without turn or budget limits from Guild Hall's side.

- REQ-RBUDGET-8: The briefing generator's `resourceOverrides` retains `maxTurns` for its internal sessions. These are lightweight utility sessions where a turn limit is an implementation safeguard, not a user-facing budget control. The briefing generator sets `maxTurns` directly on its `SdkQueryOptions`, not through the `resourceOverrides` pipeline. Same for the triage runner and notes generator.

### Commission Lifecycle Changes

- REQ-RBUDGET-9: The `maxTurns` trigger for the `halted` state is removed. `handleSessionCompletion` no longer checks `outcome.reason === "maxTurns"`. A session that completes without submitting a result transitions to `failed`, regardless of turn count.

- REQ-RBUDGET-10: The `halted` state itself, and all its flows (continue, save, cancel, crash recovery), remain intact. Other triggers for halting may be added in the future (e.g., SDK session expiry with preserved worktree). The halt infrastructure is valuable; the maxTurns trigger is not.

- REQ-RBUDGET-11: The `handleHalt` function's commit message changes from `"Halted (maxTurns): ..."` to a generic message if any other halt trigger is added. For now, if `handleHalt` is not called (because maxTurns was the only trigger), the function can remain as dead code or be removed. Implementation decides.

### Artifact Changes

- REQ-RBUDGET-12: Commission artifact frontmatter no longer includes `maxTurns` or `maxBudgetUsd` in `resource_overrides`. The `createCommission`, `createScheduledCommission`, and `updateCommission` functions stop writing these fields. Existing artifacts with these fields are harmless (ignored on parse).

- REQ-RBUDGET-13: The `resource_overrides` block in commission artifacts is retained when it contains a `model` value. If `resource_overrides` would be empty after removing budget fields, the block is omitted entirely.

### Worker Package Changes

- REQ-RBUDGET-14: Remove `resourceDefaults` from all worker `package.json` files. The `guildHall` section no longer includes `resourceDefaults`. Affected packages: `guild-hall-researcher`, `guild-hall-reviewer`, `guild-hall-illuminator`, `guild-hall-writer`, `guild-hall-visionary`, `guild-hall-steward`.

- REQ-RBUDGET-15: Remove `resourceDefaults` from the Guild Master's hardcoded metadata in `daemon/services/manager/worker.ts`.

### Worker Activation Changes

- REQ-RBUDGET-16: Remove `resourceBounds` assembly from worker activation functions. `packages/shared/worker-activation.ts` no longer reads `context.resourceDefaults` to build `resourceBounds`. `daemon/services/manager/worker.ts` (`activateManager`) no longer builds `resourceBounds`.

### Toolbox and Route Changes

- REQ-RBUDGET-17: Remove `maxTurns` and `maxBudgetUsd` from the `create_commission` tool's Zod schema and all references in the manager toolbox (`daemon/services/manager/toolbox.ts`). The `resourceOverrides` parameter becomes `z.object({ model: z.string().optional() }).optional()`.

- REQ-RBUDGET-18: Remove `maxTurns` and `maxBudgetUsd` from the `create_scheduled_commission` and `update_schedule` tool schemas in the manager toolbox.

- REQ-RBUDGET-19: Remove `maxTurns` and `maxBudgetUsd` from the commission creation and scheduling route body types (`daemon/routes/commissions.ts`).

- REQ-RBUDGET-20: The `update_commission` tool's `resourceOverrides` handling in the manager toolbox removes the regex-based YAML update logic for `maxTurns` and `maxBudgetUsd`. Only `model` updates remain.

### Scheduler Changes

- REQ-RBUDGET-21: `readResourceOverrides` in `daemon/services/scheduler/index.ts` stops parsing `maxTurns` and `maxBudgetUsd` from scheduled commission artifact YAML. It parses only `model`.

### UI Changes

- REQ-RBUDGET-22: Remove the "Max Turns" and "Max Budget (USD)" input fields from `CommissionForm.tsx`. Remove the associated state variables, validation logic, and inclusion in the `resourceOverrides` payload. The form retains the model override selector.

- REQ-RBUDGET-23: Remove the "Max Turns" and "Max Budget" labels from the `CommissionForm.module.css` styles if they become orphaned.

### Documentation Changes

- REQ-RBUDGET-24: Update `CLAUDE.md` commission lifecycle description to remove the `maxTurns` trigger from the halted state explanation. Update `docs/usage/commissions.md` to remove halted-due-to-maxTurns documentation.

- REQ-RBUDGET-25: Existing lore specs (guild-hall-commissions.md, commission-halted-continuation.md, guild-hall-workers.md, guild-hall-scheduled-commissions.md, guild-hall-views.md, model-selection.md) contain references to `maxTurns`, `maxBudgetUsd`, and `resourceDefaults`. These are historical artifacts. They do not need to be updated in this commission but should be updated when those specs are next revised.

### Halted State Type Update

- REQ-RBUDGET-26: Update the comment in `daemon/services/commission/halted-types.ts` to remove the `maxTurns` reference. The `HaltedCommissionState` type itself is unchanged (it describes preserved state, not the trigger).

## Backward Compatibility

Existing commission artifacts with `maxTurns` and `maxBudgetUsd` in their `resource_overrides` frontmatter will have those fields silently ignored during parsing (they map to `undefined` after the type change). No migration is needed.

Existing worker packages with `resourceDefaults` in their `package.json` will have those fields ignored by the updated schema. The Zod schema change makes the field absent; the JSON stays valid because Zod's `.strip()` behavior drops unknown keys.

## Acceptance Criteria

- [ ] No source file outside `.lore/` and `docs/` references `maxTurns` or `maxBudgetUsd` in the context of budget/resource controls (utility session turn limits in briefing/triage/notes are exempt)
- [ ] `resourceDefaults` and `resourceBounds` types are removed
- [ ] Commission form has no turn/budget inputs
- [ ] Manager toolbox schemas have no turn/budget fields
- [ ] Commissions run to natural completion without turn-count halting
- [ ] The `halted` state infrastructure (state file, continue, save, cancel, crash recovery) still functions
- [ ] All existing tests are updated or removed; no test references removed types
- [ ] Pre-commit hook passes (typecheck, lint, tests, build)
