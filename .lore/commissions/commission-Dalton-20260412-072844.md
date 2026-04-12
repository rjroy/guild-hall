---
title: "Commission: Scheduler removal residue cleanup"
date: 2026-04-12
status: completed
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Execute the cleanup plan at `.lore/plans/scheduler-removal-residue-cleanup.md`. Read the plan in full before starting.\n\nThis is a grep-and-delete cleanup of dead scheduler/trigger references across five files. Production code is already clean. All changes are in tests, types, and specs.\n\nThe plan has five steps. Execute all five (including the optional Step 5). After all edits:\n\n1. `bun run typecheck` must pass\n2. `bun test` must pass (full suite)\n3. Grep for `scheduleLifecycle`, `triggerEvaluator`, `schedule_spawned`, and `commissionType.*scheduled` and confirm zero hits outside of archived/historical lore directories (`.lore/_archive/`, `.lore/brainstorm/`, `.lore/retros/`, `.lore/plans/commissions/`, `.lore/specs/_abandoned/`).\n\nAfter verification, update the issue at `.lore/issues/scheduler-removal-residue.md` to status `resolved` and the plan to status `executed`."
dependencies: []
linked_artifacts:
  - .lore/issues/scheduler-removal-residue.md

  - .lore/plans/scheduler-removal-residue-cleanup.md
  - daemon/lib/toolbox-utils.ts
  - tests/cli/cli-error-handling.test.ts
  - tests/components/commission-view.test.tsx
  - .lore/specs/infrastructure/event-router.md
  - .lore/specs/infrastructure/event-router-field-matching.md
  - .lore/plans/infrastructure/event-router-field-matching.md
  - .lore/plans/scheduler-removal-residue-cleanup.md
  - daemon/lib/toolbox-utils.ts
  - tests/cli/cli-error-handling.test.ts
  - tests/components/commission-view.test.tsx
  - .lore/specs/infrastructure/event-router.md
  - .lore/specs/infrastructure/event-router-field-matching.md
  - .lore/plans/infrastructure/event-router-field-matching.md
resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-04-12T14:28:44.644Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-12T14:28:44.645Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-12T14:28:44.692Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-12T14:28:52.446Z
    event: progress_report
    reason: "Plan read. Starting five-step cleanup: remove dead type stubs, fix stale test fixtures, fix stale commission type, update event-router specs, update plan reference. Reading all target files now."
  - timestamp: 2026-04-12T14:30:16.954Z
    event: progress_report
    reason: "All files read. Executing changes: Step 1 (toolbox-utils.ts types), Step 2 (cli test fixtures), Step 3 (commission-view test), Steps 4+5 (event-router specs and plan)."
  - timestamp: 2026-04-12T14:31:57.829Z
    event: result_submitted
    reason: "Scheduler removal residue cleaned. All five steps complete.\n\n**Changes made:**\n1. `daemon/lib/toolbox-utils.ts`: Removed `scheduleLifecycle?: unknown` and `triggerEvaluator?: unknown` from `GuildHallToolServices`. Updated JSDoc to describe only the remaining optional fields.\n2. `tests/cli/cli-error-handling.test.ts`: Replaced `commission.trigger.commission.update` operationId/path with `commission.request.commission.update` in two test fixtures.\n3. `tests/components/commission-view.test.tsx`: Removed `commissionType: \"scheduled\"` prop and its assertion from the \"accepts optional props\" test.\n4. `.lore/specs/infrastructure/event-router.md`: Updated REQ-EVRT-7 — count from 13→10 variants, two→two with projectName, removed `schedule_spawned` bullet, updated remaining count from 10→8.\n5. `.lore/specs/infrastructure/event-router-field-matching.md`: Replaced `schedule_spawned` YAML example with a `commission_status` example; removed `runNumber on schedule_spawned` clause from coercion text.\n6. `.lore/plans/infrastructure/event-router-field-matching.md`: Replaced test matrix row 6's `schedule_spawned`/`runNumber` with a generic numeric coercion example.\n\n**Verification:** `bun run typecheck` clean. 3538 tests pass, 0 fail. Grep for all four residue patterns returns zero hits outside permitted archive directories. Issue marked resolved, plan marked executed."
  - timestamp: 2026-04-12T14:32:00.270Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All files read. Executing changes: Step 1 (toolbox-utils.ts types), Step 2 (cli test fixtures), Step 3 (commission-view test), Steps 4+5 (event-router specs and plan)."
projectName: guild-hall
---
Scheduler removal residue cleaned. All five steps complete.

**Changes made:**
1. `daemon/lib/toolbox-utils.ts`: Removed `scheduleLifecycle?: unknown` and `triggerEvaluator?: unknown` from `GuildHallToolServices`. Updated JSDoc to describe only the remaining optional fields.
2. `tests/cli/cli-error-handling.test.ts`: Replaced `commission.trigger.commission.update` operationId/path with `commission.request.commission.update` in two test fixtures.
3. `tests/components/commission-view.test.tsx`: Removed `commissionType: "scheduled"` prop and its assertion from the "accepts optional props" test.
4. `.lore/specs/infrastructure/event-router.md`: Updated REQ-EVRT-7 — count from 13→10 variants, two→two with projectName, removed `schedule_spawned` bullet, updated remaining count from 10→8.
5. `.lore/specs/infrastructure/event-router-field-matching.md`: Replaced `schedule_spawned` YAML example with a `commission_status` example; removed `runNumber on schedule_spawned` clause from coercion text.
6. `.lore/plans/infrastructure/event-router-field-matching.md`: Replaced test matrix row 6's `schedule_spawned`/`runNumber` with a generic numeric coercion example.

**Verification:** `bun run typecheck` clean. 3538 tests pass, 0 fail. Grep for all four residue patterns returns zero hits outside permitted archive directories. Issue marked resolved, plan marked executed.
