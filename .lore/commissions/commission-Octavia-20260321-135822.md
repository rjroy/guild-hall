---
title: "Commission: Plan: Triggered commissions - Phase 2 (Guild Master tools)"
date: 2026-03-21
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Create an implementation plan at `.lore/plans/commissions/triggered-commissions-tools.md` for the Guild Master toolbox tools for triggered commissions.\n\nRead the full spec at `.lore/specs/commissions/triggered-commissions.md` first.\n\nThis plan covers Phase 2: the `create_triggered_commission` and `update_trigger` tools in the manager toolbox. Specifically:\n\n- REQ-TRIG-25a (create_triggered_commission tool)\n- REQ-TRIG-25b (update_trigger tool)\n- REQ-TRIG-25c (DI patterns)\n- REQ-TRIG-25d (dynamic subscription registration without restart)\n\nThis plan depends on Phase 1 (core architecture) being complete. It assumes the trigger evaluator exists with `registerTrigger()` and `unregisterTrigger()` methods, and that `CommissionType` includes `\"triggered\"`.\n\nReference existing patterns:\n- `daemon/services/manager/toolbox.ts` (existing manager tools like `create_scheduled_commission`, `update_schedule`)\n- The `make*Handler(deps: ManagerToolboxDeps)` pattern\n- How `create_scheduled_commission` delegates to daemon routes\n- How `update_schedule` operates on artifacts and the scheduler service\n\nFollow the plan format used in `.lore/plans/` — phases with clear deliverables, test requirements, and dependency notes. Note the dependency on the Phase 1 plan."
dependencies:
  - commission-Octavia-20260321-135813
linked_artifacts:
  - .lore/plans/commissions/triggered-commissions-tools.md

activity_timeline:
  - timestamp: 2026-03-21T20:58:22.033Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T20:58:22.035Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-21T21:05:18.739Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-21T21:05:18.741Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-21T21:05:18.781Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-21T21:05:35.111Z
    event: progress_report
    reason: "Read the full spec. Now reading the Phase 1 core plan, the scheduled commissions plan for format reference, and the existing toolbox patterns for create_scheduled_commission and update_schedule."
  - timestamp: 2026-03-21T21:06:09.592Z
    event: progress_report
    reason: "All context gathered. Writing the Phase 2 plan for triggered commissions toolbox tools."
  - timestamp: 2026-03-21T21:12:01.195Z
    event: progress_report
    reason: "Plan written and reviewed. Applied three fixes from the plan reviewer: (1) corrected the services bag wiring to go through the orchestrator's inline construction sites with a triggerEvaluatorRef, (2) addressed combined status+field update ordering, (3) made the registerTrigger failure test case explicit."
  - timestamp: 2026-03-21T21:12:12.732Z
    event: result_submitted
    reason: "Created implementation plan at `.lore/plans/commissions/triggered-commissions-tools.md` covering Phase 2 of the triggered commissions feature: Guild Master toolbox tools.\n\nThe plan addresses all four requirements (REQ-TRIG-25a through 25d) across six implementation steps:\n\n1. Extend `ManagerToolboxDeps` with `triggerEvaluator` field\n2. Extend the commission creation route to handle `type: \"triggered\"` with trigger-specific fields\n3. `makeCreateTriggeredCommissionHandler` -- delegates to daemon route, then calls `registerTrigger` for immediate subscription\n4. `makeUpdateTriggerHandler` -- manages status transitions (active/paused/completed), field updates (match/approval/prompt), and subscription lifecycle\n5. Register both tools in the MCP server with Zod schemas\n6. Wire `triggerEvaluatorRef` through the orchestrator's inline services bags (same pattern as `scheduleLifecycleRef`)\n\nThe plan was reviewed by a fresh-context plan reviewer who identified three issues, all resolved:\n- Critical: The services bag is assembled inline in the orchestrator, not in `daemon/app.ts`. Step 6 now correctly specifies the `triggerEvaluatorRef` path through the orchestrator.\n- Important: Combined status+field updates could cause double register/unregister. Step 4 now specifies skipping the intermediate registration when field changes will handle it.\n- Minor: The `registerTrigger` failure recovery test case is now explicit in Step 3's test list."
  - timestamp: 2026-03-21T21:12:14.648Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Plan written and reviewed. Applied three fixes from the plan reviewer: (1) corrected the services bag wiring to go through the orchestrator's inline construction sites with a triggerEvaluatorRef, (2) addressed combined status+field update ordering, (3) made the registerTrigger failure test case explicit."
projectName: guild-hall
---
Created implementation plan at `.lore/plans/commissions/triggered-commissions-tools.md` covering Phase 2 of the triggered commissions feature: Guild Master toolbox tools.

The plan addresses all four requirements (REQ-TRIG-25a through 25d) across six implementation steps:

1. Extend `ManagerToolboxDeps` with `triggerEvaluator` field
2. Extend the commission creation route to handle `type: "triggered"` with trigger-specific fields
3. `makeCreateTriggeredCommissionHandler` -- delegates to daemon route, then calls `registerTrigger` for immediate subscription
4. `makeUpdateTriggerHandler` -- manages status transitions (active/paused/completed), field updates (match/approval/prompt), and subscription lifecycle
5. Register both tools in the MCP server with Zod schemas
6. Wire `triggerEvaluatorRef` through the orchestrator's inline services bags (same pattern as `scheduleLifecycleRef`)

The plan was reviewed by a fresh-context plan reviewer who identified three issues, all resolved:
- Critical: The services bag is assembled inline in the orchestrator, not in `daemon/app.ts`. Step 6 now correctly specifies the `triggerEvaluatorRef` path through the orchestrator.
- Important: Combined status+field updates could cause double register/unregister. Step 4 now specifies skipping the intermediate registration when field changes will handle it.
- Minor: The `registerTrigger` failure recovery test case is now explicit in Step 3's test list.
