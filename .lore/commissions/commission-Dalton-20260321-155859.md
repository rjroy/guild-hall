---
title: "Commission: Triggered commissions Phase 1a: Types, provenance, record ops, template expansion"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Steps 1 through 4 of `.lore/plans/commissions/triggered-commissions-core.md`.\n\nRead the full plan first, then implement:\n\n**Step 1: Type definitions** — Extend `CommissionType` in `daemon/types.ts` to include `\"triggered\"`. Add `TriggeredBy` and `TriggerBlock` interfaces. Import `EventMatchRule` from `daemon/services/event-router.ts`.\n\n**Step 2: Commission creation with trigger provenance** — Extend `createCommission()` in `daemon/services/commission/orchestrator.ts` to accept `sourceTrigger` in options. Write `triggered_by` YAML block and update activity_timeline entry when present.\n\n**Step 3: Trigger record operations** — Add `readTriggerMetadata()`, `writeTriggerFields()`, and `readTriggeredBy()` to `CommissionRecordOps` in `daemon/services/commission/record.ts`. Follow the `readScheduleMetadata()`/`writeScheduleFields()` patterns.\n\n**Step 4: Template variable expansion** — Create the `expandTemplate(template, event)` pure function in `daemon/services/trigger-evaluator.ts`. Simple `{{fieldName}}` substitution from event payload. Arrays join with commas, missing fields expand to empty string.\n\nAll tests must pass. Each step has specific test requirements listed in the plan. Run `bun test` before declaring complete."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T22:58:59.923Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T22:58:59.925Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
