---
title: "Commission: Validate scheduler removal residue issue and plan fixes"
date: 2026-04-12
status: dispatched
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Validate the open issue at `.lore/issues/scheduler-removal-residue.md` against the current codebase. The issue was filed on April 5 and may be stale.\n\nThe issue claims four categories of dead code from a removed scheduler/trigger system:\n\n1. **Dead type stubs** in `daemon/lib/toolbox-utils.ts:31-32` — `scheduleLifecycle` and `triggerEvaluator` fields typed as `unknown`\n2. **Stale test: trigger route** in `tests/cli/cli-error-handling.test.ts:108-109, 122-124` — references `/commission/trigger/commission/update`\n3. **Stale test: commission type** in `tests/components/commission-view.test.tsx:115, 119` — uses `commissionType: \"scheduled\"`\n4. **Stale specs** in `event-router.md:74` and `event-router-field-matching.md:210, 233` — reference removed `schedule_spawned` event type\n\nFor each item:\n- Check whether the referenced code/text still exists at those locations\n- If it moved, find where it went\n- If it was already cleaned up, note that\n\nAlso do a broader grep sweep for `scheduleLifecycle`, `triggerEvaluator`, `schedule_spawned`, and `commissionType.*scheduled` to catch anything the issue missed or confirm the full scope.\n\n**Deliverables:**\n1. Update the issue file (`.lore/issues/scheduler-removal-residue.md`) to reflect current findings. If all items are resolved, set status to `resolved`. If some remain, update the description to reflect only what's still present.\n2. If any items remain, produce a plan at `.lore/plans/scheduler-removal-residue-cleanup.md` covering the fixes needed. Keep the plan proportional to the work — if it's a 15-minute grep-and-delete, the plan should be short."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-04-12T14:24:32.675Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-12T14:24:32.677Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
