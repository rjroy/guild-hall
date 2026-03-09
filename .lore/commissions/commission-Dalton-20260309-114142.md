---
title: "Commission: Complete Scheduled Commissions: fix all review findings"
date: 2026-03-09
status: completed
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix all nine findings from Thorne's review of the Scheduled Commissions implementation. These are not optional. Every item was specified in the plan at `.lore/plans/guild-hall-scheduled-commissions.md` and must be completed.\n\n**Six defects:**\n\n1. **Duplicate register() throws block auto-completion and failure transitions** (scheduler/index.ts:438, :143). The scheduler calls `scheduleLifecycle.register()` unconditionally before `complete()` and `fail()`, but register() throws if already tracked. Schedules created via create_scheduled_commission are already tracked, so auto-completion throws. Fix: add `isTracked()` guard or make register() idempotent.\n\n2. **resource_overrides not carried through to spawned commissions** (scheduler/index.ts:379-386). `readArtifactField(raw, \"maxTurns\")` generates regex `^maxTurns: (.+)$`, which won't match indented fields like `  maxTurns: 10` under the `resource_overrides:` block. Model, maxTurns, and maxBudgetUsd are silently dropped. This breaks REQ-SCOM-11 and REQ-MODEL-10. Fix the regex to handle indented YAML fields, or use the existing `readScheduleMetadata` pattern to parse the resource_overrides block properly.\n\n3. **previous_run_outcome missing from timeline entries** (scheduler/index.ts:414-418). REQ-SCOM-16 requires `previous_run_outcome` in `commission_spawned` timeline events. Read the previous spawned commission's final status before recording the spawn event.\n\n4. **escalation_created timeline format wrong** (scheduler/index.ts:318-323). Uses `spawned_id` instead of spec's `stuck_commission_id`. Omits `running_since`. Fix the field names and add `running_since` from the spawned commission's dispatch timestamp.\n\n5. **UI schedule creation drops cron/repeat** (daemon/routes/commissions.ts:70). POST /commissions accepts schedule fields but doesn't write them to the artifact. There's a TODO comment acknowledging this. Implement the full schedule artifact creation through the route, matching what the manager toolbox's `create_scheduled_commission` does (REQ-SCOM-21 parity).\n\n6. **Schedule action buttons are disabled placeholders** (CommissionScheduleActions.tsx). Pause, Resume, Complete all disabled with \"Coming soon.\" Wire these to the daemon API. The plan's Step 9 specifies action buttons that call the daemon to update the schedule.\n\n**Three spec gaps (all specified in plan Step 9b):**\n\n7. **Next expected run display** (REQ-SCOM-23). The schedule detail view should show when the next run is expected. Compute from cron expression + last_run using the cron wrapper's `nextOccurrence()`.\n\n8. **Recent Runs section** (REQ-SCOM-23). Show the last 10 spawned commissions by filtering `.lore/commissions/` for artifacts with `source_schedule` matching this schedule's ID. Each entry links to the spawned commission's detail view.\n\n9. **Human-readable cron display** (REQ-SCOM-23). Show the cron expression in human-readable form. Use cronstrue library or a simple mapping for common patterns.\n\nRun all tests after fixing everything. Every item must be implemented, not deferred."
dependencies: []
linked_artifacts:
  - daemon/services/scheduler/index.ts

  - daemon/services/commission/orchestrator.ts
  - daemon/routes/commissions.ts
  - web/app/api/commissions/[commissionId]/schedule-status/route.ts
  - web/components/commission/CommissionScheduleActions.tsx
  - web/components/commission/CommissionScheduleInfo.tsx
  - web/components/commission/CommissionView.tsx
  - web/app/projects/[name]/commissions/[id]/page.tsx
  - daemon/services/commission/orchestrator.ts
  - daemon/routes/commissions.ts
  - web/app/api/commissions/[commissionId]/schedule-status/route.ts
  - web/components/commission/CommissionScheduleActions.tsx
  - web/components/commission/CommissionScheduleInfo.tsx
  - web/components/commission/CommissionView.tsx
  - web/app/projects/[name]/commissions/[id]/page.tsx
activity_timeline:
  - timestamp: 2026-03-09T18:41:42.573Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T18:41:42.574Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-09T18:41:42.610Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-09T18:41:51.674Z
    event: progress_report
    reason: "Starting work on all nine findings from Thorne's review. Reading the relevant source files first."
  - timestamp: 2026-03-09T18:49:23.435Z
    event: progress_report
    reason: "Completed fixes #1-#5 (daemon-side defects + route schedule creation). Now working on #6 (schedule action buttons) and #7-#9 (UI spec gaps)."
  - timestamp: 2026-03-09T18:53:11.105Z
    event: progress_report
    reason: "All nine fixes implemented. Running typecheck and tests now."
  - timestamp: 2026-03-09T19:02:14.216Z
    event: result_submitted
    reason: "All nine findings from Thorne's review are fixed. 2262 tests pass, 0 fail, typecheck clean.\n\n**Six defects fixed:**\n\n1. **Duplicate register() throws** — Added `isTracked()` guard before both `register()` call sites in `scheduler/index.ts` (auto-completion and failure transition paths). Schedules already tracked via `create_scheduled_commission` no longer throw.\n\n2. **resource_overrides not carried through** — Replaced three `readArtifactField()` calls (which use `^field:` regex) with a new `readResourceOverrides()` method that matches 2-space-indented fields under the `resource_overrides:` block. Model, maxTurns, and maxBudgetUsd now propagate to spawned commissions.\n\n3. **previous_run_outcome missing from timeline** — Added `getSpawnedCommissionStatus()` helper that reads the previous spawned commission's final status. The `commission_spawned` timeline entry now includes `previous_run_outcome` per REQ-SCOM-16.\n\n4. **escalation_created timeline format** — Changed `spawned_id` to `stuck_commission_id`, added `running_since` from the spawned commission's dispatch timestamp.\n\n5. **UI schedule creation drops cron/repeat** — Added `createScheduledCommission()` to `CommissionSessionForRoutes` interface and orchestrator. The POST `/commissions` route now calls it for `type: \"scheduled\"`, writing full schedule artifacts with cron, repeat, and resource_overrides (REQ-SCOM-21 parity).\n\n6. **Schedule action buttons** — Rewrote `CommissionScheduleActions.tsx` with functional Pause/Resume/Complete buttons. Added `POST /commissions/:id/schedule-status` daemon route and Next.js API proxy route.\n\n**Three spec gaps filled:**\n\n7. **Next expected run** — Computes from cron expression + last_run via `nextOccurrence()`. Displayed in schedule info section.\n\n8. **Recent Runs** — Filters `.lore/commissions/` for artifacts with matching `sourceSchedule`, sorted by date, limited to 10. Each entry links to the spawned commission's detail view.\n\n9. **Human-readable cron** — Implemented `describeCron()` with common pattern lookup table and basic field parsing. Displayed below the cron expression.\n\n**Files modified:**\n- `daemon/services/scheduler/index.ts` (fixes 1-4)\n- `daemon/services/commission/orchestrator.ts` (fix 5: new interface methods)\n- `daemon/routes/commissions.ts` (fixes 5-6: route changes)\n- `web/app/api/commissions/[commissionId]/schedule-status/route.ts` (new: API proxy)\n- `web/components/commission/CommissionScheduleActions.tsx` (fix 6: functional buttons)\n- `web/components/commission/CommissionScheduleActions.module.css` (fix 6: active styles)\n- `web/components/commission/CommissionScheduleInfo.tsx` (fixes 7-9: display)\n- `web/components/commission/CommissionScheduleInfo.module.css` (fixes 7-9: styles)\n- `web/components/commission/CommissionView.tsx` (extended ScheduleInfo interface)\n- `web/app/projects/[name]/commissions/[id]/page.tsx` (fixes 7-9: data computation)\n- `tests/daemon/routes/commissions.test.ts` (updated for createScheduledCommission)\n- `tests/daemon/services/scheduler/scheduler.test.ts` (updated mocks)\n- 4 additional test files (mock interface compliance)"
  - timestamp: 2026-03-09T19:02:17.451Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All nine fixes implemented. Running typecheck and tests now."
projectName: guild-hall
---
All nine findings from Thorne's review are fixed. 2262 tests pass, 0 fail, typecheck clean.

**Six defects fixed:**

1. **Duplicate register() throws** — Added `isTracked()` guard before both `register()` call sites in `scheduler/index.ts` (auto-completion and failure transition paths). Schedules already tracked via `create_scheduled_commission` no longer throw.

2. **resource_overrides not carried through** — Replaced three `readArtifactField()` calls (which use `^field:` regex) with a new `readResourceOverrides()` method that matches 2-space-indented fields under the `resource_overrides:` block. Model, maxTurns, and maxBudgetUsd now propagate to spawned commissions.

3. **previous_run_outcome missing from timeline** — Added `getSpawnedCommissionStatus()` helper that reads the previous spawned commission's final status. The `commission_spawned` timeline entry now includes `previous_run_outcome` per REQ-SCOM-16.

4. **escalation_created timeline format** — Changed `spawned_id` to `stuck_commission_id`, added `running_since` from the spawned commission's dispatch timestamp.

5. **UI schedule creation drops cron/repeat** — Added `createScheduledCommission()` to `CommissionSessionForRoutes` interface and orchestrator. The POST `/commissions` route now calls it for `type: "scheduled"`, writing full schedule artifacts with cron, repeat, and resource_overrides (REQ-SCOM-21 parity).

6. **Schedule action buttons** — Rewrote `CommissionScheduleActions.tsx` with functional Pause/Resume/Complete buttons. Added `POST /commissions/:id/schedule-status` daemon route and Next.js API proxy route.

**Three spec gaps filled:**

7. **Next expected run** — Computes from cron expression + last_run via `nextOccurrence()`. Displayed in schedule info section.

8. **Recent Runs** — Filters `.lore/commissions/` for artifacts with matching `sourceSchedule`, sorted by date, limited to 10. Each entry links to the spawned commission's detail view.

9. **Human-readable cron** — Implemented `describeCron()` with common pattern lookup table and basic field parsing. Displayed below the cron expression.

**Files modified:**
- `daemon/services/scheduler/index.ts` (fixes 1-4)
- `daemon/services/commission/orchestrator.ts` (fix 5: new interface methods)
- `daemon/routes/commissions.ts` (fixes 5-6: route changes)
- `web/app/api/commissions/[commissionId]/schedule-status/route.ts` (new: API proxy)
- `web/components/commission/CommissionScheduleActions.tsx` (fix 6: functional buttons)
- `web/components/commission/CommissionScheduleActions.module.css` (fix 6: active styles)
- `web/components/commission/CommissionScheduleInfo.tsx` (fixes 7-9: display)
- `web/components/commission/CommissionScheduleInfo.module.css` (fixes 7-9: styles)
- `web/components/commission/CommissionView.tsx` (extended ScheduleInfo interface)
- `web/app/projects/[name]/commissions/[id]/page.tsx` (fixes 7-9: data computation)
- `tests/daemon/routes/commissions.test.ts` (updated for createScheduledCommission)
- `tests/daemon/services/scheduler/scheduler.test.ts` (updated mocks)
- 4 additional test files (mock interface compliance)
