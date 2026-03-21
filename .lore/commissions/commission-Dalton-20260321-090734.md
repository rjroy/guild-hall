---
title: "Commission: Event Router Revision: Phase 1 — Rewrite generic router"
date: 2026-03-21
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 1 of the Event Router revision plan at `.lore/plans/infrastructure/event-router-revision.md`.\n\n**Scope:** Steps 1-2 only (rewrite `daemon/services/event-router.ts` and its test file).\n\n**Read first:**\n- The revised spec: `.lore/specs/infrastructure/event-router.md`\n- The plan: `.lore/plans/infrastructure/event-router-revision.md` (Phase 1 section)\n- The current implementation: `daemon/services/event-router.ts`\n- The current tests: `tests/daemon/services/event-router.test.ts`\n- EventBus: `daemon/lib/event-bus.ts`\n- Log: `daemon/lib/log.ts`\n\n**What to do:**\n1. Replace `daemon/services/event-router.ts` entirely with the generic matching layer. Export `EventMatchRule`, `EventRouter` interfaces and `createEventRouter` factory. No channels, no notifications, no dispatch logic. The dispatch helpers (`camelToScreamingSnake`, `buildEventEnv`, `defaultDispatchShell`, `defaultDispatchWebhook`) leave this file — they'll move to the notification service in Phase 2.\n2. Replace `tests/daemon/services/event-router.test.ts` with tests for the generic router (14 test cases listed in the plan).\n\n**Do NOT touch:**\n- `daemon/app.ts` (that's Phase 3)\n- Config schema (`lib/config.ts`, `lib/types.ts`) — unchanged per the plan\n- Don't create the notification service yet (that's Phase 2)\n\n**Note:** `daemon/app.ts` will have broken imports after this phase since it still references the old `createEventRouter` signature. That's expected and will be fixed in Phase 3. Focus on making the router and its tests correct.\n\nRun `bun test tests/daemon/services/event-router.test.ts` to confirm router tests pass. The full suite may have import failures in `daemon/app.ts` — that's fine for this phase."
dependencies: []
linked_artifacts:
  - daemon/services/event-router.ts

  - tests/daemon/services/event-router.test.ts
  - tests/daemon/services/event-router.test.ts
activity_timeline:
  - timestamp: 2026-03-21T16:07:34.285Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T16:07:34.287Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-21T16:07:34.330Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-21T16:07:49.271Z
    event: progress_report
    reason: "Read all source files. Starting implementation: rewriting event-router.ts as generic matching layer, then rewriting tests."
  - timestamp: 2026-03-21T16:08:49.365Z
    event: progress_report
    reason: "Phase 1 complete. Rewrote event-router.ts as generic matching layer (exports EventMatchRule, EventRouter, createEventRouter). Rewrote test file with 14 tests covering subscription/matching, multiple subscriptions, failure isolation, unsubscribe, cleanup, and logging. All 14 tests pass."
  - timestamp: 2026-03-21T16:09:00.139Z
    event: result_submitted
    reason: "Phase 1 of the Event Router revision is complete.\n\n**What changed:**\n\n1. **`daemon/services/event-router.ts`** - Replaced entirely. Now exports `EventMatchRule`, `EventRouter` interfaces and `createEventRouter` factory. The factory takes `{ eventBus, log }` (no channels, notifications, or dispatch logic). Returns `{ router, cleanup }` where router has a `subscribe(rule, handler)` method. Dispatch helpers (`camelToScreamingSnake`, `buildEventEnv`, `defaultDispatchShell`, `defaultDispatchWebhook`) are removed from this file (they'll move to the notification service in Phase 2).\n\n2. **`tests/daemon/services/event-router.test.ts`** - Replaced entirely. 14 test cases covering all plan requirements:\n   - 6 subscription/matching tests (type match, type mismatch, projectName match/skip/mismatch, no-projectName wildcard)\n   - 2 multiple subscription tests (independent firing, no dedup)\n   - 2 failure isolation tests (other handlers still fire, warn logged)\n   - 2 unsubscribe tests (removes subscription, doesn't affect others)\n   - 1 cleanup test (detaches from EventBus)\n   - 1 logging test (info on match)\n\n**Test results:** 14 pass, 0 fail.\n\n**Expected breakage:** `daemon/app.ts` will have broken imports since it still references the old `createEventRouter` signature with channels/notifications. This is expected and will be fixed in Phase 3."
  - timestamp: 2026-03-21T16:09:04.573Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Phase 1 complete. Rewrote event-router.ts as generic matching layer (exports EventMatchRule, EventRouter, createEventRouter). Rewrote test file with 14 tests covering subscription/matching, multiple subscriptions, failure isolation, unsubscribe, cleanup, and logging. All 14 tests pass."
projectName: guild-hall
---
Phase 1 of the Event Router revision is complete.

**What changed:**

1. **`daemon/services/event-router.ts`** - Replaced entirely. Now exports `EventMatchRule`, `EventRouter` interfaces and `createEventRouter` factory. The factory takes `{ eventBus, log }` (no channels, notifications, or dispatch logic). Returns `{ router, cleanup }` where router has a `subscribe(rule, handler)` method. Dispatch helpers (`camelToScreamingSnake`, `buildEventEnv`, `defaultDispatchShell`, `defaultDispatchWebhook`) are removed from this file (they'll move to the notification service in Phase 2).

2. **`tests/daemon/services/event-router.test.ts`** - Replaced entirely. 14 test cases covering all plan requirements:
   - 6 subscription/matching tests (type match, type mismatch, projectName match/skip/mismatch, no-projectName wildcard)
   - 2 multiple subscription tests (independent firing, no dedup)
   - 2 failure isolation tests (other handlers still fire, warn logged)
   - 2 unsubscribe tests (removes subscription, doesn't affect others)
   - 1 cleanup test (detaches from EventBus)
   - 1 logging test (info on match)

**Test results:** 14 pass, 0 fail.

**Expected breakage:** `daemon/app.ts` will have broken imports since it still references the old `createEventRouter` signature with channels/notifications. This is expected and will be fixed in Phase 3.
