---
title: "Commission: Implement Scheduled Commissions"
date: 2026-03-09
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the Scheduled Commissions plan at `.lore/plans/guild-hall-scheduled-commissions.md`. This is a large feature with 11 steps: type system extensions, artifact schema, schedule lifecycle, record operations, manager toolbox, scheduler service, startup catch-up, daemon wiring, UI updates, cron library integration, and spec validation.\n\nKey guidance from the plan:\n\n**Architecture:**\n- Scheduled commissions are a new `type: scheduled` alongside existing `type: one-shot`. The two status sets do not overlap (REQ-SCOM-2).\n- `ScheduleLifecycle` is a separate class from `CommissionLifecycle`, not an extension. Four states: active, paused, completed, failed.\n- Schedule record ops extend existing Layer 1 (`record.ts`), not a parallel module. All artifact I/O stays in one Layer 1 per REQ-CLS-4.\n- The scheduler service is the first timer-based service in the daemon. It establishes the pattern.\n\n**Step ordering (from Delegation Guide):**\n- Step 10 (cron library) can run in parallel with Steps 1-4.\n- Steps 1-4 are a dependency chain (types -> artifact schema -> lifecycle -> record ops).\n- Step 5 (manager toolbox) depends on Steps 3-4.\n- Step 6 (scheduler) depends on Steps 3-4 and 10.\n- Step 7 (catch-up) extends Step 6.\n- Step 8 (daemon wiring) depends on Steps 6-7.\n- Step 9 (UI) depends on Step 2 for artifact format.\n- Step 11 (validation) is last.\n\n**Critical lessons from retros (repeated in the plan):**\n- DI factories need production wiring. Every constructor dep for `SchedulerService` must be instantiated in `createProductionApp` (Step 8). Tests with mocks pass even when production is broken.\n- Timer-based services have subtle failure modes: error in tick handler can kill the interval, unhandled promise rejections, race conditions between tick and shutdown.\n- `createProductionApp` return type changes to `{ app, shutdown }` so the scheduler can be stopped on SIGINT/SIGTERM.\n\n**Model selection integration:**\n- `resourceOverrides` includes `model?: string` (REQ-MODEL-7 already implemented).\n- Schedule templates copy `resource_overrides` including `model` to spawned commissions (REQ-MODEL-10).\n- Validate model names against `VALID_MODELS` using `isValidModel()` during schedule creation and update.\n\n**Open Questions to resolve during implementation:**\n1. Cron library: croner vs cron-parser. Test under bun before committing.\n2. Schedule routes: extend `PUT /commissions/:id` or new `PUT /schedules/:id`. Decide during Step 9.\n3. Consecutive failure threshold: start with 3 as a constant.\n\nSpecs: `.lore/specs/guild-hall-scheduled-commissions.md`, `.lore/specs/commission-layer-separation.md`\nBrainstorm: `.lore/brainstorm/scheduled-commissions.md`\n\nRun all tests before completing. Use `/lore-development:implement` to orchestrate the work."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-09T13:12:51.519Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T13:12:51.520Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
