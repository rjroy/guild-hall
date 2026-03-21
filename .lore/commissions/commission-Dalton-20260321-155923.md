---
title: "Commission: Triggered commissions Phase 1c: Trigger evaluator service + production wiring"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Steps 5 and 6 of `.lore/plans/commissions/triggered-commissions-core.md`.\n\nRead the full plan first. Steps 1-4 are already implemented (types, provenance, record ops, template expansion).\n\n**Step 5: Trigger evaluator service** — Create `daemon/services/trigger-evaluator.ts` with `createTriggerEvaluator(deps)` factory. Implements `initialize()` (scan projects for active triggers, register subscriptions), `registerTrigger()`, `unregisterTrigger()`, `shutdown()`. The trigger dispatch handler is the core: source artifact read, source exclusion, depth computation, effective approval, template expansion, commission creation, conditional dispatch, state update. All in fire-and-forget async. Follows the notification service consumer pattern.\n\n**Step 6: Production wiring** — Wire the trigger evaluator in `createProductionApp()` in `daemon/app.ts`. Position after Event Router and commission orchestrator. Use lazy ref pattern (like `scheduleLifecycleRef`). Add shutdown to daemon cleanup. Expose `triggerEvaluatorRef` for the manager toolbox.\n\nThis is the highest-risk code in the feature. The plan's Step 5 has 25+ specific test cases. Cover all of them. Run `bun test` before declaring complete."
dependencies:
  - commission-Thorne-20260321-155912
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T22:59:23.974Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T22:59:23.975Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-21T23:06:30.450Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-21T23:06:30.452Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
