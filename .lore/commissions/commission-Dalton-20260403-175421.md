---
title: "Commission: Heartbeat P7: Shared Infrastructure Cleanup (Types, Services, Routes, Events)"
date: 2026-04-04
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 7 of the Heartbeat Commission Dispatch plan. Surgical removal from shared files.\n\n**Plan**: `.lore/plans/heartbeat-commission-dispatch.md` — read Phase 7 in full.\n**Spec**: `.lore/specs/heartbeat-commission-dispatch.md` — reference for REQ IDs.\n\nPhase 6 (standalone file deletion) is complete. Broken imports will surface immediately — that's expected.\n\n## Step 1: Type and Service Cleanup (REQ-HBT-34, -35, -36, -38, -39, -40, -41a, -42, -43)\n\nModify these files to remove all schedule/trigger infrastructure:\n\n- `daemon/types.ts`: Remove CommissionType union, TriggeredBy, TriggerBlock, ScheduledCommissionStatus.\n- `daemon/services/commission/record.ts`: Remove ScheduleMetadata, readScheduleMetadata, writeScheduleFields, readTriggerMetadata, writeTriggerFields, readTriggeredBy, readType.\n- `daemon/services/commission/orchestrator.ts`: Remove createScheduledCommission, createTriggeredCommission methods and YAML templates. Remove sourceSchedule/sourceTrigger from createCommission options. Remove related imports (isValidCron, TRIGGER_STATUS_TRANSITIONS, scheduleLifecycleRef, triggerEvaluatorRef). Remove updateScheduleStatus/updateTriggerStatus from CommissionSessionForRoutes.\n- `daemon/services/manager/toolbox.ts`: Remove create_scheduled_commission, update_schedule, create_triggered_commission, update_trigger tool handlers/schemas. Remove scheduleLifecycle/triggerEvaluator optional deps.\n- `daemon/routes/commissions.ts`: Remove schedule/trigger update routes, schedule/trigger info parsing, nextOccurrence import, type branches.\n- `daemon/lib/event-bus.ts`: Remove schedule_spawned from SystemEvent union.\n- `lib/types.ts`: Remove schedule_spawned from SYSTEM_EVENT_TYPES. Remove scheduleId from OperationContext if present.\n- `lib/commissions.ts`: Remove sourceSchedule/sourceTrigger from CommissionMeta. Remove extractSourceTrigger. Remove source_schedule/triggered_by frontmatter parsing. Add `source: { description: string } | null` field and parse from source frontmatter.\n- `package.json`: Remove croner dependency.\n\n## Step 2: App Wiring Cleanup (REQ-HBT-37)\n\n- `daemon/app.ts`: Remove scheduleLifecycleRef, triggerEvaluatorRef, and their wiring. Remove dynamic imports of scheduler/schedule-lifecycle, scheduler/index, trigger-evaluator. Remove scheduler.catchUp(), scheduler.start(), scheduler.stop(). Remove triggerEvaluator.initialize(), triggerEvaluator.shutdown().\n\nWork methodically: remove types first, then fix every compilation error before running tests. `bun typecheck` is the primary gate. Update or remove any tests that reference removed types/functions.\n\n`bun typecheck` and `bun test` MUST pass before completing."
dependencies:
  - commission-Dalton-20260403-175401
linked_artifacts: []

resource_overrides:
  model: opus

activity_timeline:
  - timestamp: 2026-04-04T00:54:21.529Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-04T00:59:31.177Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-04-04T02:41:16.338Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-04-04T02:41:16.343Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
