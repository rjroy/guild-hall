---
title: "Commission: Event Router Revision: Phase 1 — Rewrite generic router"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 1 of the Event Router revision plan at `.lore/plans/infrastructure/event-router-revision.md`.\n\n**Scope:** Steps 1-2 only (rewrite `daemon/services/event-router.ts` and its test file).\n\n**Read first:**\n- The revised spec: `.lore/specs/infrastructure/event-router.md`\n- The plan: `.lore/plans/infrastructure/event-router-revision.md` (Phase 1 section)\n- The current implementation: `daemon/services/event-router.ts`\n- The current tests: `tests/daemon/services/event-router.test.ts`\n- EventBus: `daemon/lib/event-bus.ts`\n- Log: `daemon/lib/log.ts`\n\n**What to do:**\n1. Replace `daemon/services/event-router.ts` entirely with the generic matching layer. Export `EventMatchRule`, `EventRouter` interfaces and `createEventRouter` factory. No channels, no notifications, no dispatch logic. The dispatch helpers (`camelToScreamingSnake`, `buildEventEnv`, `defaultDispatchShell`, `defaultDispatchWebhook`) leave this file — they'll move to the notification service in Phase 2.\n2. Replace `tests/daemon/services/event-router.test.ts` with tests for the generic router (14 test cases listed in the plan).\n\n**Do NOT touch:**\n- `daemon/app.ts` (that's Phase 3)\n- Config schema (`lib/config.ts`, `lib/types.ts`) — unchanged per the plan\n- Don't create the notification service yet (that's Phase 2)\n\n**Note:** `daemon/app.ts` will have broken imports after this phase since it still references the old `createEventRouter` signature. That's expected and will be fixed in Phase 3. Focus on making the router and its tests correct.\n\nRun `bun test tests/daemon/services/event-router.test.ts` to confirm router tests pass. The full suite may have import failures in `daemon/app.ts` — that's fine for this phase."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T16:07:34.285Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T16:07:34.287Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
