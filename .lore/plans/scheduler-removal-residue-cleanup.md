---
title: "Plan: Scheduler Removal Residue Cleanup"
date: 2026-04-12
status: executed
tags: [cleanup, heartbeat, dead-code]
related:
  - .lore/issues/scheduler-removal-residue.md
  - .lore/retros/commission-cleanup-2026-04-05.md
---

# Plan: Scheduler Removal Residue Cleanup

## Goal

Remove all remaining references to the old scheduler/trigger system from tests, types, and specs. Production code is already clean.

## Scope

Five source locations, plus one low-priority plan reference. All changes are deletions or text replacements. No behavioral changes, no new code.

## Steps

### Step 1: Remove dead type stubs from toolbox-utils.ts

File: `apps/daemon/lib/toolbox-utils.ts`

1. Delete lines 31-32 (`scheduleLifecycle?: unknown;` and `triggerEvaluator?: unknown;`).
2. Update the JSDoc comment at lines 24-25 to remove the reference to `scheduleLifecycle`. The comment should describe only the remaining optional fields (`recordOps` and `packages`).

Verify: `bun run typecheck` passes. No production code references these fields (confirmed by grep).

### Step 2: Replace stale test fixtures in cli-error-handling.test.ts

File: `apps/cli/tests/cli-error-handling.test.ts`

Two test cases (lines 107-119 and 121-130) use `commission.trigger.commission.update` as fixture data for `validateArgs` and `usageLine` tests. The tests aren't testing the route itself, just argument validation logic.

1. Replace `operationId: "commission.trigger.commission.update"` and the corresponding `path` with an existing route (e.g., `commission.create` or `commission.update`).
2. Adjust parameters to match the replacement route's signature.

Verify: `bun test apps/cli/tests/cli-error-handling.test.ts` passes.

### Step 3: Fix stale commission type in commission-view test

File: `apps/web/tests/components/commission-view.test.tsx`

Lines 115 and 119 use `commissionType: "scheduled"`, but `commissionType` doesn't exist in production code at all.

1. If the test is verifying that arbitrary props pass through, replace `"scheduled"` with a valid value or remove the `commissionType` lines entirely.
2. If the test was specifically for scheduled commission rendering (now removed), delete the test case.

Verify: `bun test apps/web/tests/components/commission-view.test.tsx` passes.

### Step 4: Update event-router specs

Two active specs reference the removed `schedule_spawned` event type.

**`.lore/specs/infrastructure/event-router.md:72-74`** (REQ-EVRT-7): The requirement lists three events that carry `projectName`. Remove the `schedule_spawned` bullet and update the count from "three" to "two" (only `commission_status` and `toolbox_replicate` remain). Verify the count against `apps/daemon/lib/event-bus.ts` before committing.

**`.lore/specs/infrastructure/event-router-field-matching.md`**:
- Line 210: Replace the `schedule_spawned` YAML example with a `commission_status` example that demonstrates field matching.
- Line 233: Replace "The `runNumber` field on `schedule_spawned` is a number" with a real example of a non-string event field (e.g., `artifacts` on `commission_result` is already mentioned in the same sentence, so just delete the `schedule_spawned` clause).

### Step 5 (optional): Update executed plan

**`.lore/plans/infrastructure/event-router-field-matching.md:134`**: Test matrix row 6 uses `schedule_spawned` with `runNumber: 1` to demonstrate string coercion. Replace with a current event type that has a numeric field, or replace with a generic example. This is a historical plan so the priority is low.

## Delegation

Single worker (Dalton). This is a 15-minute grep-and-edit task across five files. No architectural decisions. Run the full test suite after all edits to confirm nothing else broke.

## Verification

1. `bun run typecheck` passes.
2. `bun test` passes (full suite).
3. Grep for `scheduleLifecycle`, `triggerEvaluator`, `schedule_spawned`, and `commissionType.*scheduled` returns zero hits outside of `.lore/_archive/`, `.lore/brainstorm/`, `.lore/retros/`, `.lore/plans/commissions/`, and `.lore/specs/_abandoned/`.
