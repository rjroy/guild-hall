---
title: "Commission: Complete Scheduled Commissions: fix all review findings"
date: 2026-03-09
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix all nine findings from Thorne's review of the Scheduled Commissions implementation. These are not optional. Every item was specified in the plan at `.lore/plans/guild-hall-scheduled-commissions.md` and must be completed.\n\n**Six defects:**\n\n1. **Duplicate register() throws block auto-completion and failure transitions** (scheduler/index.ts:438, :143). The scheduler calls `scheduleLifecycle.register()` unconditionally before `complete()` and `fail()`, but register() throws if already tracked. Schedules created via create_scheduled_commission are already tracked, so auto-completion throws. Fix: add `isTracked()` guard or make register() idempotent.\n\n2. **resource_overrides not carried through to spawned commissions** (scheduler/index.ts:379-386). `readArtifactField(raw, \"maxTurns\")` generates regex `^maxTurns: (.+)$`, which won't match indented fields like `  maxTurns: 10` under the `resource_overrides:` block. Model, maxTurns, and maxBudgetUsd are silently dropped. This breaks REQ-SCOM-11 and REQ-MODEL-10. Fix the regex to handle indented YAML fields, or use the existing `readScheduleMetadata` pattern to parse the resource_overrides block properly.\n\n3. **previous_run_outcome missing from timeline entries** (scheduler/index.ts:414-418). REQ-SCOM-16 requires `previous_run_outcome` in `commission_spawned` timeline events. Read the previous spawned commission's final status before recording the spawn event.\n\n4. **escalation_created timeline format wrong** (scheduler/index.ts:318-323). Uses `spawned_id` instead of spec's `stuck_commission_id`. Omits `running_since`. Fix the field names and add `running_since` from the spawned commission's dispatch timestamp.\n\n5. **UI schedule creation drops cron/repeat** (daemon/routes/commissions.ts:70). POST /commissions accepts schedule fields but doesn't write them to the artifact. There's a TODO comment acknowledging this. Implement the full schedule artifact creation through the route, matching what the manager toolbox's `create_scheduled_commission` does (REQ-SCOM-21 parity).\n\n6. **Schedule action buttons are disabled placeholders** (CommissionScheduleActions.tsx). Pause, Resume, Complete all disabled with \"Coming soon.\" Wire these to the daemon API. The plan's Step 9 specifies action buttons that call the daemon to update the schedule.\n\n**Three spec gaps (all specified in plan Step 9b):**\n\n7. **Next expected run display** (REQ-SCOM-23). The schedule detail view should show when the next run is expected. Compute from cron expression + last_run using the cron wrapper's `nextOccurrence()`.\n\n8. **Recent Runs section** (REQ-SCOM-23). Show the last 10 spawned commissions by filtering `.lore/commissions/` for artifacts with `source_schedule` matching this schedule's ID. Each entry links to the spawned commission's detail view.\n\n9. **Human-readable cron display** (REQ-SCOM-23). Show the cron expression in human-readable form. Use cronstrue library or a simple mapping for common patterns.\n\nRun all tests after fixing everything. Every item must be implemented, not deferred."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-09T18:41:42.573Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T18:41:42.574Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
