---
title: "Commission: Review: Implement Scheduled Commissions"
date: 2026-03-09
status: completed
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the completed work from commission `commission-Dalton-20260309-061251` (Implement Scheduled Commissions). This is a large feature, the biggest commission in this batch.\n\n**What changed:** Added scheduled commissions to the daemon. Schedules are commission artifacts with `type: scheduled`, a four-state lifecycle (active/paused/completed/failed), a cron-based scheduler service (60s tick), catch-up on startup, stuck run escalation via meeting requests, two new manager toolbox tools, and UI updates across commission list, detail view, dashboard, and creation form.\n\n**Plan:** `.lore/plans/commissions/guild-hall-scheduled-commissions.md`\n**Spec:** `.lore/specs/commissions/guild-hall-scheduled-commissions.md`\n**Layer spec:** `.lore/specs/commissions/commission-layer-separation.md`\n\n**Implementation covered 11 steps:**\n1. Type extensions: `CommissionType`, `ScheduledCommissionStatus` in `daemon/types.ts`, `schedule_spawned` event in `event-bus.ts`\n2. Artifact schema: `createCommission()` extended with trailing `options?: { type?, sourceSchedule? }`, `readType()` added to `CommissionRecordOps`\n3. Schedule lifecycle: `daemon/services/scheduler/schedule-lifecycle.ts` (37 tests), four-state machine, separate from `CommissionLifecycle`\n4. Record operations: `readScheduleMetadata()`, `writeScheduleFields()` added to `CommissionRecordOps` in `record.ts`\n5. Manager toolbox: `create_scheduled_commission` and `update_schedule` tools (16 tests)\n6. Scheduler service: `daemon/services/scheduler/index.ts`, 60s tick, overlap prevention, stuck run escalation, consecutive failure tracking (14 tests)\n7. Startup catch-up: `catchUp()` method, refactored `spawnFromSchedule()` shared method (4 tests)\n8. Daemon wiring: `createProductionApp` return type changed to `{ app, shutdown }`, scheduler wired with all deps\n9. UI: Commission list recurring indicator, schedule detail view, dashboard dependency map, creation form with type toggle\n10. Cron library: croner@10.0.1 wrapped in `daemon/services/scheduler/cron.ts` (25 tests)\n11. Self-validation (Dalton's own pass flagged several gaps, see below)\n\n**Dalton's self-validation flagged these issues. Verify whether they were fixed:**\n- Missing production wiring for `scheduleLifecycle`/`recordOps`/`packages` in the services bag passed to manager toolbox\n- `update_schedule` lifecycle registration gap\n- Missing UI elements: next expected run display, Recent Runs section, Complete button, confirmation dialogs\n- Missing `previous_run_outcome` in timeline events\n- UI parity gap for schedule creation via the daemon route\n\n**Review focus areas:**\n1. **Production wiring (Step 8):** This is the #1 failure mode in this codebase (documented in 3+ retros). Verify every `SchedulerService` dep is instantiated in `createProductionApp()`. Verify the `{ app, shutdown }` return type change is correct in `daemon/index.ts`.\n2. **Layer boundaries:** Scheduler interacts with Layers 1-2 only. No direct artifact writes. Schedule field updates through `CommissionRecordOps`, status transitions through `ScheduleLifecycle`. Verify no boundary violations.\n3. **Timer error handling:** Error in tick handler must not kill the interval. Verify the catch-and-continue pattern for individual schedule failures. Verify the consecutive failure threshold (3 ticks -> failed transition).\n4. **Overlap prevention:** Verify `last_spawned_id` is checked before spawning. Verify \"still active\" means `dispatched`, `in_progress`, or `sleeping`.\n5. **Stuck run escalation:** Verify 2x cadence threshold, at-most-once escalation tracking, meeting request creation.\n6. **Catch-up:** Verify exactly one catch-up spawn per missed schedule, not one per missed tick. Verify `commission_spawned_catchup` timeline event.\n7. **Model selection integration:** Verify `resource_overrides` including `model` flows from schedule template to spawned commission (REQ-MODEL-10). Verify model validation in both toolbox tools.\n8. **Cron wrapper:** Verify croner is isolated behind the wrapper in `cron.ts`. Verify `nextOccurrence`, `isValidCron`, `intervalSeconds` work correctly.\n9. **Spec compliance:** Check all REQ-SCOM-1 through REQ-SCOM-28 requirements.\n10. **Test coverage:** 2262 tests reported passing. Verify new tests exist for each step. Watch for gaps in the scheduler service tests (timer mocking, error propagation, shutdown race conditions)."
dependencies: []
linked_artifacts:
  - .lore/specs/commissions/guild-hall-scheduled-commissions.md

  - .lore/plans/commissions/guild-hall-scheduled-commissions.md
  - daemon/services/scheduler/index.ts
  - daemon/services/scheduler/schedule-lifecycle.ts
  - daemon/services/scheduler/cron.ts
  - daemon/services/commission/record.ts
  - daemon/services/manager/toolbox.ts
  - daemon/app.ts
  - daemon/index.ts
  - daemon/routes/commissions.ts
  - web/components/commission/CommissionScheduleInfo.tsx
  - web/components/commission/CommissionScheduleActions.tsx
  - .lore/plans/commissions/guild-hall-scheduled-commissions.md
  - daemon/services/scheduler/index.ts
  - daemon/services/scheduler/schedule-lifecycle.ts
  - daemon/services/scheduler/cron.ts
  - daemon/services/commission/record.ts
  - daemon/services/manager/toolbox.ts
  - daemon/app.ts
  - daemon/index.ts
  - daemon/routes/commissions.ts
  - web/components/commission/CommissionScheduleInfo.tsx
  - web/components/commission/CommissionScheduleActions.tsx
activity_timeline:
  - timestamp: 2026-03-09T18:15:53.939Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T18:15:53.941Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-09T18:15:53.978Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-09T18:16:03.453Z
    event: progress_report
    reason: "Starting review of commission-Dalton-20260309-061251 (Scheduled Commissions). Reading spec, plan, and layer separation spec first."
  - timestamp: 2026-03-09T18:16:42.396Z
    event: progress_report
    reason: "Read production wiring (daemon/app.ts, daemon/index.ts) and record operations (record.ts). Now reading manager toolbox and orchestrator for the createCommission extensions."
  - timestamp: 2026-03-09T18:18:36.863Z
    event: progress_report
    reason: "UI and test coverage reviewed via sub-agents. Now checking the orchestrator's createCommission signature for the options parameter, and verifying specific Dalton self-validation items."
  - timestamp: 2026-03-09T18:19:45.269Z
    event: progress_report
    reason: "All implementation files reviewed. Now compiling findings for the final report. Key defects identified: missing previous_run_outcome in timeline entries, incomplete escalation_created timeline fields, UI parity gap for schedule creation via daemon route, missing next-run display, missing Recent Runs section, disabled action buttons, and scheduler's register-before-every-transition pattern creating duplicate registration risk."
  - timestamp: 2026-03-09T18:22:40.799Z
    event: result_submitted
    reason: "## Review: commission-Dalton-20260309-061251 (Scheduled Commissions)\n\n### Disposition\n\nThe backend scheduling infrastructure is solid: the schedule lifecycle state machine, cron wrapper, scheduler service tick loop, catch-up logic, overlap prevention, stuck-run escalation, production wiring, and layer boundary compliance are all well-implemented. The production wiring (historically the #1 failure mode) is correct, including the lazy ref pattern for the circular dependency between the orchestrator and scheduler.\n\nSix defects and three spec gaps remain. Two defects affect runtime correctness (duplicate register throws, resource_overrides not carried through to spawned commissions). Four defects affect spec compliance (missing previous_run_outcome, wrong escalation_created format, UI creation route drops schedule metadata, disabled action buttons). Three spec gaps affect UI completeness (next-run display, Recent Runs section, human-readable cron).\n\nOf the eight issues Dalton's self-validation flagged, two were fixed (production wiring, update_schedule registration gap). Six were not fixed.\n\n### Defects (fix before merge)\n\n1. **Duplicate register() throws block auto-completion and failure transitions** (scheduler/index.ts:438, :143). The scheduler calls `scheduleLifecycle.register()` unconditionally before `complete()` and `fail()`, but register() throws if already tracked. Schedules created via create_scheduled_commission are already tracked, so auto-completion throws. Fix: add `isTracked()` guard.\n\n2. **resource_overrides not carried through to spawned commissions** (scheduler/index.ts:379-386). `readArtifactField(raw, \"maxTurns\")` generates regex `^maxTurns: (.+)$`, which won't match indented fields like `  maxTurns: 10` under the `resource_overrides:` block. Model, maxTurns, and maxBudgetUsd are silently dropped. Breaks REQ-SCOM-11 and REQ-MODEL-10.\n\n3. **previous_run_outcome missing from timeline entries** (scheduler/index.ts:414-418). REQ-SCOM-16 requires this field. Not implemented.\n\n4. **escalation_created timeline format wrong** (scheduler/index.ts:318-323). Uses `spawned_id` instead of spec's `stuck_commission_id`. Omits `running_since`. The duration detail computed for the meeting request is not captured in the timeline.\n\n5. **UI schedule creation drops cron/repeat** (daemon/routes/commissions.ts:70). POST /commissions accepts schedule fields but doesn't write them to the artifact. TODO comment acknowledges this. Breaks REQ-SCOM-21 parity.\n\n6. **Schedule action buttons are disabled placeholders** (CommissionScheduleActions.tsx). Pause, Resume, Complete all disabled with \"Coming soon.\" Breaks REQ-SCOM-23.\n\n### Spec gaps (deferred is acceptable if tracked)\n\n- Missing \"Next expected run\" display (REQ-SCOM-23)\n- Missing \"Recent Runs\" section with spawned commission links (REQ-SCOM-23)\n- Missing human-readable cron display (REQ-SCOM-23)\n\n### What's working well\n\n- Layer boundaries: scheduler reads through recordOps, transitions through ScheduleLifecycle, creates commissions through commissionSession. No boundary violations.\n- Production wiring: scheduleLifecycleRef lazy pattern, sequential assembly, shutdown handler all correct.\n- Timer error handling: catch-and-continue per schedule, consecutive failure threshold with reset on success.\n- Overlap prevention: checks last_spawned_id status against dispatched/in_progress/sleeping.\n- Stuck run escalation: 2x cadence threshold, at-most-once via in-memory Set, meeting request creation.\n- Catch-up: exactly one spawn per missed schedule, not per missed tick.\n- Cron isolation: croner fully wrapped behind cron.ts, all three functions work correctly.\n- Test quality: 96 new tests with temp dir isolation, mock tracking, concurrency testing."
  - timestamp: 2026-03-09T18:22:46.012Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All implementation files reviewed. Now compiling findings for the final report. Key defects identified: missing previous_run_outcome in timeline entries, incomplete escalation_created timeline fields, UI parity gap for schedule creation via daemon route, missing next-run display, missing Recent Runs section, disabled action buttons, and scheduler's register-before-every-transition pattern creating duplicate registration risk."
projectName: guild-hall
---
## Review: commission-Dalton-20260309-061251 (Scheduled Commissions)

### Disposition

The backend scheduling infrastructure is solid: the schedule lifecycle state machine, cron wrapper, scheduler service tick loop, catch-up logic, overlap prevention, stuck-run escalation, production wiring, and layer boundary compliance are all well-implemented. The production wiring (historically the #1 failure mode) is correct, including the lazy ref pattern for the circular dependency between the orchestrator and scheduler.

Six defects and three spec gaps remain. Two defects affect runtime correctness (duplicate register throws, resource_overrides not carried through to spawned commissions). Four defects affect spec compliance (missing previous_run_outcome, wrong escalation_created format, UI creation route drops schedule metadata, disabled action buttons). Three spec gaps affect UI completeness (next-run display, Recent Runs section, human-readable cron).

Of the eight issues Dalton's self-validation flagged, two were fixed (production wiring, update_schedule registration gap). Six were not fixed.

### Defects (fix before merge)

1. **Duplicate register() throws block auto-completion and failure transitions** (scheduler/index.ts:438, :143). The scheduler calls `scheduleLifecycle.register()` unconditionally before `complete()` and `fail()`, but register() throws if already tracked. Schedules created via create_scheduled_commission are already tracked, so auto-completion throws. Fix: add `isTracked()` guard.

2. **resource_overrides not carried through to spawned commissions** (scheduler/index.ts:379-386). `readArtifactField(raw, "maxTurns")` generates regex `^maxTurns: (.+)$`, which won't match indented fields like `  maxTurns: 10` under the `resource_overrides:` block. Model, maxTurns, and maxBudgetUsd are silently dropped. Breaks REQ-SCOM-11 and REQ-MODEL-10.

3. **previous_run_outcome missing from timeline entries** (scheduler/index.ts:414-418). REQ-SCOM-16 requires this field. Not implemented.

4. **escalation_created timeline format wrong** (scheduler/index.ts:318-323). Uses `spawned_id` instead of spec's `stuck_commission_id`. Omits `running_since`. The duration detail computed for the meeting request is not captured in the timeline.

5. **UI schedule creation drops cron/repeat** (daemon/routes/commissions.ts:70). POST /commissions accepts schedule fields but doesn't write them to the artifact. TODO comment acknowledges this. Breaks REQ-SCOM-21 parity.

6. **Schedule action buttons are disabled placeholders** (CommissionScheduleActions.tsx). Pause, Resume, Complete all disabled with "Coming soon." Breaks REQ-SCOM-23.

### Spec gaps (deferred is acceptable if tracked)

- Missing "Next expected run" display (REQ-SCOM-23)
- Missing "Recent Runs" section with spawned commission links (REQ-SCOM-23)
- Missing human-readable cron display (REQ-SCOM-23)

### What's working well

- Layer boundaries: scheduler reads through recordOps, transitions through ScheduleLifecycle, creates commissions through commissionSession. No boundary violations.
- Production wiring: scheduleLifecycleRef lazy pattern, sequential assembly, shutdown handler all correct.
- Timer error handling: catch-and-continue per schedule, consecutive failure threshold with reset on success.
- Overlap prevention: checks last_spawned_id status against dispatched/in_progress/sleeping.
- Stuck run escalation: 2x cadence threshold, at-most-once via in-memory Set, meeting request creation.
- Catch-up: exactly one spawn per missed schedule, not per missed tick.
- Cron isolation: croner fully wrapped behind cron.ts, all three functions work correctly.
- Test quality: 96 new tests with temp dir isolation, mock tracking, concurrency testing.
