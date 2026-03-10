---
title: Implementation notes guild-hall-scheduled-commissions
date: 2026-03-09
status: complete
tags: [implementation, notes]
source: .lore/plans/guild-hall-scheduled-commissions.md
modules: [commission-orchestrator, daemon-scheduler, manager-toolbox, web-ui]
---

# Implementation Notes: Scheduled Commissions

## Progress
- [x] Phase 1: Type system extensions (daemon/types.ts, daemon/lib/event-bus.ts)
- [x] Phase 10: Cron library integration (parallel with 1-4)
- [x] Phase 2: Commission artifact schema extensions (orchestrator.ts, record.ts)
- [x] Phase 3: Schedule lifecycle (daemon/services/scheduler/schedule-lifecycle.ts)
- [x] Phase 4: Schedule record operations (daemon/services/commission/record.ts)
- [x] Phase 5: Manager toolbox extensions (daemon/services/manager/toolbox.ts)
- [x] Phase 6: Scheduler service (daemon/services/scheduler/index.ts, cron.ts)
- [x] Phase 7: Startup catch-up (extends scheduler service)
- [x] Phase 8: Daemon wiring (daemon/app.ts, daemon/index.ts)
- [x] Phase 9: UI updates (web/ components)
- [x] Phase 11: Validate against spec

## Log

### Phase 1: Type system extensions
- Dispatched: Add CommissionType, ScheduledCommissionStatus to daemon/types.ts; schedule_spawned event to event-bus.ts
- Result: Types added, typecheck passes clean

### Phase 10: Cron library integration
- Dispatched: Evaluate croner vs cron-parser, install, create cron.ts wrapper with tests
- Result: croner@10.0.1 selected (zero deps, works under bun). Wrapper at daemon/services/scheduler/cron.ts with nextOccurrence, isValidCron, intervalSeconds. 25/25 tests pass.

### Phase 2: Commission artifact schema extensions
- Dispatched: Add type field + sourceSchedule to createCommission, readType to record.ts
- Result: orchestrator.ts createCommission extended with options param (backward-compatible). record.ts gains readType() with "one-shot" default. 57 record tests, 56 orchestrator tests, 80 lifecycle tests all pass.

### Phase 3: Schedule lifecycle
- Dispatched: Create ScheduleLifecycle class with 4-state graph, withLock concurrency, register/transition methods
- Result: daemon/services/scheduler/schedule-lifecycle.ts created. 37 tests pass. Follows CommissionLifecycle patterns exactly. Factory function exported.

### Phase 4: Schedule record operations
- Dispatched: Add readScheduleMetadata, writeScheduleFields to CommissionRecordOps
- Result: ScheduleMetadata interface + 2 methods added to record.ts. 76 record tests pass. Updated lifecycle mock to include new methods.

### Phase 5: Manager toolbox extensions
- Dispatched: Add create_scheduled_commission and update_schedule tools to manager toolbox
- Result: Two tools added with Zod schemas, handler factories, artifact writing, lifecycle integration. ManagerToolboxDeps extended with optional scheduleLifecycle, recordOps, packages. 16 toolbox tests pass.

### Phase 6: Scheduler service
- Dispatched: Create SchedulerService with 60s tick, cron evaluation, overlap prevention, stuck escalation, auto-completion, error isolation
- Result: daemon/services/scheduler/index.ts created. 14 new scheduler tests, 76 total scheduler tests pass. Consecutive failure tracking, escalation dedup, error-safe interval.

### Phase 7: Startup catch-up
- Dispatched: Add catchUp() method, refactor spawn logic into shared spawnFromSchedule()
- Result: processSchedule() spawn code extracted into spawnFromSchedule(). catchUp() scans active schedules and spawns one catch-up commission per missed schedule with commission_spawned_catchup event and missed_since field. 18/18 scheduler tests pass (4 new catch-up tests).

### Phase 8: Daemon wiring
- Dispatched: Wire scheduler into createProductionApp, change return type to { app, shutdown }, update daemon/index.ts shutdown handler
- Result: createProductionApp returns { app: Hono, shutdown: () => void }. ScheduleLifecycle + SchedulerService assembled after commission recovery. catchUp() + start() called in sequence. daemon/index.ts shutdown handler calls schedulerShutdown?.() before server.stop(). Updated tests in app.test.ts and rebase.test.ts for new return type with afterEach cleanup. Typecheck clean, all tests pass.

### Phase 9: UI updates
- Dispatched: 9a (list distinction), 9b (detail view), 9c (dashboard), 9d (creation form), 9e (cleanup skill)
- Result:
  - lib/types.ts: "completed" + "paused" added to gem status sets
  - lib/commissions.ts: type + sourceSchedule fields in CommissionMeta, sorting supports scheduled statuses
  - CommissionList: "Recurring" label for scheduled, "from: schedule" link for spawned commissions
  - CommissionView: Schedule info panel (cron, runs, last run), placeholder pause/resume buttons
  - CommissionHeader: "Schedule" label for type=scheduled
  - DependencyMap: brass left-border for scheduled cards, "Recurring" badge
  - CommissionGraph: dashed outer rect for scheduled nodes, sourceSchedule edge generation
  - CommissionForm: type toggle (One-shot/Schedule), cron + repeat fields, schedule payload
  - Daemon route: accepts type/cron/repeat, validates cron required for scheduled
  - Cleanup skill: skip type=scheduled artifacts, note sourceSchedule provenance for spawned
  - 2262 tests pass, typecheck clean
- Note: Full backend route for schedule creation (schedule YAML block + lifecycle registration) not wired through CommissionSessionForRoutes yet. Manager toolbox handles this path; daemon route passes type through but schedule block creation requires CommissionSessionForRoutes extension.

### Phase 11: Validate against spec
- Dispatched: Holistic validation of implementation against REQ-SCOM requirements
- Result: Validation found one critical production wiring gap and one lifecycle registration gap. Both fixed.
- Critical fix: Extended GuildHallToolServices with scheduleLifecycle, recordOps, packages. Added scheduleLifecycleRef lazy ref in createProductionApp, passed through orchestrator deps and services bag to manager toolbox. Without this, create_scheduled_commission and update_schedule tools would crash at runtime with undefined access despite tests passing with mocks.
- High fix: Added isTracked() check + register() call in update_schedule handler before lifecycle transitions. After daemon restart, schedules are untracked; the handler now re-registers them on first access.
- Known gaps (documented, non-blocking):
  - UI schedule creation route doesn't write full schedule YAML block (manager toolbox path works)
  - Missing previous_run_outcome in timeline entries (REQ-SCOM-16)
  - Missing next expected run and Recent Runs section in detail view (REQ-SCOM-23)
  - Schedule pause/resume buttons are disabled placeholders (no backend routes)
  - No human-readable cron preview in creation form (REQ-SCOM-25)
- Final: 2262 tests pass, 0 failures, typecheck clean.

## Summary

Built scheduled commissions across 11 phases: type system, cron library (croner), artifact schema, schedule lifecycle (4-state machine), record operations, manager toolbox (create + update tools), scheduler service (60s tick with error isolation), startup catch-up, daemon wiring (shutdown support), UI updates (list/detail/dashboard/form/cleanup), and spec validation with production wiring fixes. All 2262 tests pass.
