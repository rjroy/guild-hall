---
title: "Commission: Event Router Revision: Phase 2 — Create notification service"
date: 2026-03-21
status: blocked
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 2 of the Event Router revision plan at `.lore/plans/infrastructure/event-router-revision.md`.\n\n**Scope:** Steps 3-4 only (create `daemon/services/notification-service.ts` and its test file).\n\n**Read first:**\n- The revised spec: `.lore/specs/infrastructure/event-router.md`\n- The plan: `.lore/plans/infrastructure/event-router-revision.md` (Phase 2 section)\n- The Phase 1 router: `daemon/services/event-router.ts` (already rewritten by Phase 1)\n- EventBus: `daemon/lib/event-bus.ts`\n- Log: `daemon/lib/log.ts`\n- Config types: `lib/types.ts` (for `ChannelConfig`, `NotificationRule`)\n\n**What to do:**\n1. Create `daemon/services/notification-service.ts` with `createNotificationService` factory. Move `camelToScreamingSnake`, `buildEventEnv`, `defaultDispatchShell`, `defaultDispatchWebhook` here from the old router (they were removed in Phase 1). Export `camelToScreamingSnake` for testing.\n2. Create `tests/daemon/services/notification-service.test.ts` with the 17 test cases listed in the plan.\n\n**Do NOT touch:**\n- `daemon/services/event-router.ts` (done in Phase 1)\n- `daemon/app.ts` (that's Phase 3)\n- Config schema — unchanged\n\nRun `bun test tests/daemon/services/notification-service.test.ts` to confirm notification service tests pass."
dependencies:
  - commission-Dalton-20260321-090734
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T16:07:43.949Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T16:07:43.950Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
