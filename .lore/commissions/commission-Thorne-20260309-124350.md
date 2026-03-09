---
title: "Commission: Review: Scheduled Commissions gap fills"
date: 2026-03-09
status: dispatched
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the fixes from commission `commission-Dalton-20260309-114142` (Complete Scheduled Commissions: fix all review findings). These are the nine items from your previous review that were left unfinished.\n\n**Previous review:** `commission-Thorne-20260309-111553`\n**Plan:** `.lore/plans/guild-hall-scheduled-commissions.md`\n**Spec:** `.lore/specs/guild-hall-scheduled-commissions.md`\n\n**What was fixed:**\n\n1. **Duplicate register() throws** — Added `isTracked()` guard before both `register()` call sites in `scheduler/index.ts`. Verify the guard is in both paths (auto-completion at :438 area and failure transition at :143 area).\n\n2. **resource_overrides not carried through** — Replaced `readArtifactField()` calls with a new `readResourceOverrides()` method matching 2-space-indented fields. Verify `model`, `maxTurns`, and `maxBudgetUsd` all propagate correctly to spawned commissions (REQ-SCOM-11, REQ-MODEL-10).\n\n3. **previous_run_outcome** — Added `getSpawnedCommissionStatus()` helper. Verify the `commission_spawned` timeline entry includes `previous_run_outcome` per REQ-SCOM-16.\n\n4. **escalation_created timeline** — Changed `spawned_id` to `stuck_commission_id`, added `running_since`. Verify field names match the spec.\n\n5. **UI schedule creation** — Added `createScheduledCommission()` to `CommissionSessionForRoutes` interface and orchestrator. POST `/commissions` route calls it for `type: \"scheduled\"`. Verify full parity with the manager toolbox's `create_scheduled_commission` (REQ-SCOM-21): cron, repeat, resource_overrides including model all written to the artifact.\n\n6. **Action buttons** — Rewrote `CommissionScheduleActions.tsx` with functional Pause/Resume/Complete. Added `POST /commissions/:id/schedule-status` daemon route and Next.js API proxy. Verify buttons are wired end-to-end: client component -> Next.js API route -> daemon route -> schedule lifecycle transition.\n\n7. **Next expected run** — Computed from cron + last_run. Verify it displays correctly in the schedule info section.\n\n8. **Recent Runs** — Filters for `sourceSchedule` match, sorted by date, limited to 10. Verify each entry links to the spawned commission detail view.\n\n9. **Human-readable cron** — `describeCron()` with pattern lookup table. Verify it handles common expressions (daily, weekly, monthly, every N minutes).\n\n**Files changed:**\n- `daemon/services/scheduler/index.ts` (fixes 1-4)\n- `daemon/services/commission/orchestrator.ts` (fix 5)\n- `daemon/routes/commissions.ts` (fixes 5-6)\n- `web/app/api/commissions/[commissionId]/schedule-status/route.ts` (new)\n- `web/components/commission/CommissionScheduleActions.tsx` (fix 6)\n- `web/components/commission/CommissionScheduleActions.module.css` (fix 6)\n- `web/components/commission/CommissionScheduleInfo.tsx` (fixes 7-9)\n- `web/components/commission/CommissionScheduleInfo.module.css` (fixes 7-9)\n- `web/components/commission/CommissionView.tsx` (extended interface)\n- `web/app/projects/[name]/commissions/[id]/page.tsx` (fixes 7-9)\n- `tests/daemon/routes/commissions.test.ts`\n- `tests/daemon/services/scheduler/scheduler.test.ts`\n- 4 additional test files\n\n**Review focus:** Verify all nine items are actually complete this time, not partially done or stubbed. Check that the new route and API proxy follow existing patterns. Confirm 2262 tests pass."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-09T19:43:50.703Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T19:43:50.704Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
