---
title: "Commission: Plan: Triggered commissions - Phase 2 (Guild Master tools)"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Create an implementation plan at `.lore/plans/commissions/triggered-commissions-tools.md` for the Guild Master toolbox tools for triggered commissions.\n\nRead the full spec at `.lore/specs/commissions/triggered-commissions.md` first.\n\nThis plan covers Phase 2: the `create_triggered_commission` and `update_trigger` tools in the manager toolbox. Specifically:\n\n- REQ-TRIG-25a (create_triggered_commission tool)\n- REQ-TRIG-25b (update_trigger tool)\n- REQ-TRIG-25c (DI patterns)\n- REQ-TRIG-25d (dynamic subscription registration without restart)\n\nThis plan depends on Phase 1 (core architecture) being complete. It assumes the trigger evaluator exists with `registerTrigger()` and `unregisterTrigger()` methods, and that `CommissionType` includes `\"triggered\"`.\n\nReference existing patterns:\n- `daemon/services/manager/toolbox.ts` (existing manager tools like `create_scheduled_commission`, `update_schedule`)\n- The `make*Handler(deps: ManagerToolboxDeps)` pattern\n- How `create_scheduled_commission` delegates to daemon routes\n- How `update_schedule` operates on artifacts and the scheduler service\n\nFollow the plan format used in `.lore/plans/` — phases with clear deliverables, test requirements, and dependency notes. Note the dependency on the Phase 1 plan."
dependencies:
  - commission-Octavia-20260321-135813
linked_artifacts: []

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
current_progress: ""
projectName: guild-hall
---
