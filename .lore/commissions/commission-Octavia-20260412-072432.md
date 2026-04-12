---
title: "Commission: Validate scheduler removal residue issue and plan fixes"
date: 2026-04-12
status: completed
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Validate the open issue at `.lore/issues/scheduler-removal-residue.md` against the current codebase. The issue was filed on April 5 and may be stale.\n\nThe issue claims four categories of dead code from a removed scheduler/trigger system:\n\n1. **Dead type stubs** in `daemon/lib/toolbox-utils.ts:31-32` — `scheduleLifecycle` and `triggerEvaluator` fields typed as `unknown`\n2. **Stale test: trigger route** in `tests/cli/cli-error-handling.test.ts:108-109, 122-124` — references `/commission/trigger/commission/update`\n3. **Stale test: commission type** in `tests/components/commission-view.test.tsx:115, 119` — uses `commissionType: \"scheduled\"`\n4. **Stale specs** in `event-router.md:74` and `event-router-field-matching.md:210, 233` — reference removed `schedule_spawned` event type\n\nFor each item:\n- Check whether the referenced code/text still exists at those locations\n- If it moved, find where it went\n- If it was already cleaned up, note that\n\nAlso do a broader grep sweep for `scheduleLifecycle`, `triggerEvaluator`, `schedule_spawned`, and `commissionType.*scheduled` to catch anything the issue missed or confirm the full scope.\n\n**Deliverables:**\n1. Update the issue file (`.lore/issues/scheduler-removal-residue.md`) to reflect current findings. If all items are resolved, set status to `resolved`. If some remain, update the description to reflect only what's still present.\n2. If any items remain, produce a plan at `.lore/plans/scheduler-removal-residue-cleanup.md` covering the fixes needed. Keep the plan proportional to the work — if it's a 15-minute grep-and-delete, the plan should be short."
dependencies: []
linked_artifacts:
  - .lore/issues/scheduler-removal-residue.md

  - .lore/plans/scheduler-removal-residue-cleanup.md
  - .lore/plans/scheduler-removal-residue-cleanup.md
activity_timeline:
  - timestamp: 2026-04-12T14:24:32.675Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-12T14:24:32.677Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-12T14:24:32.754Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-12T14:24:38.956Z
    event: progress_report
    reason: "Starting validation of scheduler-removal-residue issue. Reading the issue file and checking all four referenced locations."
  - timestamp: 2026-04-12T14:25:11.028Z
    event: progress_report
    reason: "All four issue items confirmed still present. The broader grep also found references in archived specs, brainstorms, plans, and retros (expected, not actionable). Now checking the toolbox-utils comment and determining if the issue also missed anything in production code."
  - timestamp: 2026-04-12T14:26:27.150Z
    event: result_submitted
    reason: "Validated all four items in the scheduler-removal-residue issue against the current codebase. All four are confirmed still present at their original locations:\n\n1. **Dead type stubs** (`toolbox-utils.ts:31-32`): `scheduleLifecycle?: unknown` and `triggerEvaluator?: unknown` still there. JSDoc comment at lines 24-25 is also stale.\n2. **Stale test: trigger route** (`cli-error-handling.test.ts:108-109, 122-124`): Two tests still use the removed `/commission/trigger/commission/update` route as fixture data.\n3. **Stale test: commission type** (`commission-view.test.tsx:115, 119`): Still uses `commissionType: \"scheduled\"`. `commissionType` doesn't exist anywhere in production code.\n4. **Stale specs** (`event-router.md:74`, `event-router-field-matching.md:210, 233`): `schedule_spawned` references still present in both active specs.\n\nProduction code is clean: no hits for any of these terms in `daemon/`, `web/`, or `lib/`.\n\nOne additional finding: `.lore/plans/infrastructure/event-router-field-matching.md:134` also references `schedule_spawned` in its test matrix (low priority, executed plan).\n\nUpdated the issue with validation timestamp and enriched descriptions. Created a cleanup plan proportional to the work (five targeted edits, no architectural decisions)."
  - timestamp: 2026-04-12T14:26:31.781Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All four issue items confirmed still present. The broader grep also found references in archived specs, brainstorms, plans, and retros (expected, not actionable). Now checking the toolbox-utils comment and determining if the issue also missed anything in production code."
projectName: guild-hall
---
Validated all four items in the scheduler-removal-residue issue against the current codebase. All four are confirmed still present at their original locations:

1. **Dead type stubs** (`toolbox-utils.ts:31-32`): `scheduleLifecycle?: unknown` and `triggerEvaluator?: unknown` still there. JSDoc comment at lines 24-25 is also stale.
2. **Stale test: trigger route** (`cli-error-handling.test.ts:108-109, 122-124`): Two tests still use the removed `/commission/trigger/commission/update` route as fixture data.
3. **Stale test: commission type** (`commission-view.test.tsx:115, 119`): Still uses `commissionType: "scheduled"`. `commissionType` doesn't exist anywhere in production code.
4. **Stale specs** (`event-router.md:74`, `event-router-field-matching.md:210, 233`): `schedule_spawned` references still present in both active specs.

Production code is clean: no hits for any of these terms in `daemon/`, `web/`, or `lib/`.

One additional finding: `.lore/plans/infrastructure/event-router-field-matching.md:134` also references `schedule_spawned` in its test matrix (low priority, executed plan).

Updated the issue with validation timestamp and enriched descriptions. Created a cleanup plan proportional to the work (five targeted edits, no architectural decisions).
