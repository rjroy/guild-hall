---
title: "Commission: Triggered commissions Phase 1a: Types, provenance, record ops, template expansion"
date: 2026-03-21
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Steps 1 through 4 of `.lore/plans/commissions/triggered-commissions-core.md`.\n\nRead the full plan first, then implement:\n\n**Step 1: Type definitions** — Extend `CommissionType` in `daemon/types.ts` to include `\"triggered\"`. Add `TriggeredBy` and `TriggerBlock` interfaces. Import `EventMatchRule` from `daemon/services/event-router.ts`.\n\n**Step 2: Commission creation with trigger provenance** — Extend `createCommission()` in `daemon/services/commission/orchestrator.ts` to accept `sourceTrigger` in options. Write `triggered_by` YAML block and update activity_timeline entry when present.\n\n**Step 3: Trigger record operations** — Add `readTriggerMetadata()`, `writeTriggerFields()`, and `readTriggeredBy()` to `CommissionRecordOps` in `daemon/services/commission/record.ts`. Follow the `readScheduleMetadata()`/`writeScheduleFields()` patterns.\n\n**Step 4: Template variable expansion** — Create the `expandTemplate(template, event)` pure function in `daemon/services/trigger-evaluator.ts`. Simple `{{fieldName}}` substitution from event payload. Arrays join with commas, missing fields expand to empty string.\n\nAll tests must pass. Each step has specific test requirements listed in the plan. Run `bun test` before declaring complete."
dependencies: []
linked_artifacts:
  - daemon/types.ts

  - daemon/services/commission/orchestrator.ts
  - daemon/services/commission/record.ts
  - daemon/services/trigger-evaluator.ts
  - tests/daemon/services/trigger-evaluator.test.ts
  - tests/daemon/services/commission/record.test.ts
  - tests/daemon/services/commission/orchestrator.test.ts
  - daemon/services/commission/orchestrator.ts
  - daemon/services/commission/record.ts
  - daemon/services/trigger-evaluator.ts
  - tests/daemon/services/trigger-evaluator.test.ts
  - tests/daemon/services/commission/record.test.ts
  - tests/daemon/services/commission/orchestrator.test.ts
activity_timeline:
  - timestamp: 2026-03-21T22:58:59.923Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T22:58:59.925Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-21T22:58:59.971Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-21T22:59:16.214Z
    event: progress_report
    reason: "Read the plan. Now reading the four source files needed for Steps 1-4."
  - timestamp: 2026-03-21T23:00:08.721Z
    event: progress_report
    reason: "Starting implementation. Steps 1-4 are independent. Implementing Step 1 (types), Step 2 (orchestrator), Step 3 (record ops), and Step 4 (template expansion) now."
  - timestamp: 2026-03-21T23:04:25.435Z
    event: result_submitted
    reason: "Implemented Steps 1-4 of the triggered commissions core plan. All 3271 tests pass, typecheck clean.\n\n**Step 1: Type definitions** (`daemon/types.ts`)\n- Extended `CommissionType` to `\"one-shot\" | \"scheduled\" | \"triggered\"`\n- Added `TriggeredBy` interface (`source_id`, `trigger_artifact`, `depth`)\n- Added `TriggerBlock` interface (`match`, `approval`, `maxDepth`, `runs_completed`, `last_triggered`, `last_spawned_id`)\n- Imported `EventMatchRule` from `daemon/services/event-router.ts`\n\n**Step 2: Commission creation with trigger provenance** (`daemon/services/commission/orchestrator.ts`)\n- Extended `createCommission()` options with `sourceTrigger: { triggerArtifact, sourceId, depth }`\n- Updated both interface and implementation signatures\n- Writes `triggered_by` YAML block into frontmatter when `sourceTrigger` present\n- Activity timeline reason includes trigger artifact, source ID, and depth\n- 3 new orchestrator tests verify the block, timeline, and backward compatibility\n\n**Step 3: Trigger record operations** (`daemon/services/commission/record.ts`)\n- Added `readTriggerMetadata()`: parses trigger block via gray-matter, handles Date coercion for ISO timestamps\n- Added `writeTriggerFields()`: regex-based replacement for `runs_completed`, `last_triggered`, `last_spawned_id`\n- Added `readTriggeredBy()`: returns `TriggeredBy | null`, gracefully handles missing files and parse errors\n- 14 new tests covering parsing, field updates, null handling, and error cases\n\n**Step 4: Template variable expansion** (`daemon/services/trigger-evaluator.ts`, new file)\n- Created `expandTemplate(template, event)` pure function\n- Handles string substitution, array joining with commas, missing fields as empty string\n- 8 tests covering all expansion behaviors"
  - timestamp: 2026-03-21T23:04:31.119Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Starting implementation. Steps 1-4 are independent. Implementing Step 1 (types), Step 2 (orchestrator), Step 3 (record ops), and Step 4 (template expansion) now."
projectName: guild-hall
---
Implemented Steps 1-4 of the triggered commissions core plan. All 3271 tests pass, typecheck clean.

**Step 1: Type definitions** (`daemon/types.ts`)
- Extended `CommissionType` to `"one-shot" | "scheduled" | "triggered"`
- Added `TriggeredBy` interface (`source_id`, `trigger_artifact`, `depth`)
- Added `TriggerBlock` interface (`match`, `approval`, `maxDepth`, `runs_completed`, `last_triggered`, `last_spawned_id`)
- Imported `EventMatchRule` from `daemon/services/event-router.ts`

**Step 2: Commission creation with trigger provenance** (`daemon/services/commission/orchestrator.ts`)
- Extended `createCommission()` options with `sourceTrigger: { triggerArtifact, sourceId, depth }`
- Updated both interface and implementation signatures
- Writes `triggered_by` YAML block into frontmatter when `sourceTrigger` present
- Activity timeline reason includes trigger artifact, source ID, and depth
- 3 new orchestrator tests verify the block, timeline, and backward compatibility

**Step 3: Trigger record operations** (`daemon/services/commission/record.ts`)
- Added `readTriggerMetadata()`: parses trigger block via gray-matter, handles Date coercion for ISO timestamps
- Added `writeTriggerFields()`: regex-based replacement for `runs_completed`, `last_triggered`, `last_spawned_id`
- Added `readTriggeredBy()`: returns `TriggeredBy | null`, gracefully handles missing files and parse errors
- 14 new tests covering parsing, field updates, null handling, and error cases

**Step 4: Template variable expansion** (`daemon/services/trigger-evaluator.ts`, new file)
- Created `expandTemplate(template, event)` pure function
- Handles string substitution, array joining with commas, missing fields as empty string
- 8 tests covering all expansion behaviors
