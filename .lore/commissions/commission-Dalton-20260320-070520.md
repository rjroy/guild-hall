---
title: "Commission: Event Router: Config Schema + Router Service (Phases 1-2)"
date: 2026-03-20
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phases 1 and 2 of the Event Router plan at `.lore/plans/infrastructure/event-router.md`. This covers Steps 1-8.\n\n**Read first:**\n- The spec: `.lore/specs/infrastructure/event-router.md`\n- The plan: `.lore/plans/infrastructure/event-router.md`\n- The existing files you'll modify: `lib/config.ts`, `lib/types.ts`, `daemon/lib/event-bus.ts`\n- The existing config tests: `tests/lib/config.test.ts`\n- Production wiring for context (don't modify yet): `daemon/app.ts`\n\n**Phase 1 — Config Schema (Steps 1-4):**\n1. Define Zod schemas for channels (shell/webhook discriminated union) and notification rules in `lib/config.ts`\n2. Add optional `channels` and `notifications` fields to `appConfigSchema` with superRefine cross-reference validation\n3. Extend `AppConfig` interface in `lib/types.ts` with matching TypeScript types\n4. Add comprehensive config schema tests in `tests/lib/config.test.ts`\n\nKey decisions from the plan:\n- Event type strings go as a const array in `lib/types.ts` (NOT imported from daemon). Add a test that imports both and verifies they match — no compile-time assertion across the boundary.\n- Channel name validation: `^[a-zA-Z0-9_-]+$`\n- URL validation for webhooks follows the pattern from `modelDefinitionSchema.baseUrl`\n\n**Phase 2 — Router Service (Steps 5-8):**\n5. Create `daemon/services/event-router.ts` with `createEventRouter(deps)` factory\n6. Implement default shell dispatch (Bun.spawn, env vars, 10s timeout)\n7. Implement default webhook dispatch (fetch, JSON body, 10s timeout)\n8. Create comprehensive router tests in `tests/daemon/services/event-router.test.ts`\n\nKey decisions from the plan:\n- DI seams: `dispatchShell` and `dispatchWebhook` callbacks in deps for testability\n- Inert when channels or notifications empty (no EventBus subscription)\n- Async dispatch: fire-and-forget, each dispatch independent\n- camelCase to SCREAMING_SNAKE conversion for env vars\n- Factory returns unsubscribe cleanup function\n\n**Run `bun test` after each phase to confirm no regressions. All tests must pass before completing.**"
dependencies: []
linked_artifacts:
  - lib/types.ts

  - lib/config.ts
  - daemon/services/event-router.ts
  - tests/lib/config.test.ts
  - tests/daemon/services/event-router.test.ts
  - lib/config.ts
  - daemon/services/event-router.ts
  - tests/lib/config.test.ts
  - tests/daemon/services/event-router.test.ts
activity_timeline:
  - timestamp: 2026-03-20T14:05:20.966Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T14:06:00.168Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-20T14:06:00.214Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-20T14:06:06.769Z
    event: progress_report
    reason: "Reading spec, plan, and existing source files before implementation."
  - timestamp: 2026-03-20T14:06:28.272Z
    event: progress_report
    reason: "Starting Phase 1: Config Schema. Adding event types, channel/notification types to lib/types.ts, Zod schemas to lib/config.ts, and tests."
  - timestamp: 2026-03-20T14:07:59.535Z
    event: progress_report
    reason: "Phase 1 complete. 68 config tests pass (15 new). Starting Phase 2: Router Service."
  - timestamp: 2026-03-20T14:10:40.387Z
    event: result_submitted
    reason: "Phases 1 and 2 of the Event Router implemented. All tests pass (3184 total, 0 failures), types check clean.\n\n**Phase 1 — Config Schema (Steps 1-4):**\n- Added `SYSTEM_EVENT_TYPES` const array (13 event types), `SystemEventType`, `ChannelConfig`, and `NotificationRule` types to `lib/types.ts`\n- Added `channels` and `notifications` optional fields to `AppConfig` interface\n- Added Zod schemas in `lib/config.ts`: `channelSchema` (discriminated union on shell/webhook), `notificationRuleSchema` (match.type validated against SYSTEM_EVENT_TYPES), channel name regex validation\n- Added `superRefine` cross-reference validation ensuring notification rules reference defined channels\n- Added 15 new config tests plus a sync test verifying SYSTEM_EVENT_TYPES matches SystemEvent discriminants\n\n**Phase 2 — Router Service (Steps 5-8):**\n- Created `daemon/services/event-router.ts` with `createEventRouter(deps)` factory\n- DI seams: `dispatchShell` and `dispatchWebhook` callbacks with production defaults\n- Default shell dispatch: `Bun.spawn([\"sh\", \"-c\", command])` with env vars and 10s timeout\n- Default webhook dispatch: `fetch()` with JSON body, Content-Type header, 10s AbortSignal timeout\n- camelCase to SCREAMING_SNAKE env var conversion via `camelToScreamingSnake()`\n- Inert when channels or notifications empty (no EventBus subscription)\n- Fire-and-forget async dispatch, failures logged at warn level\n- Returns unsubscribe cleanup function\n- 24 router tests covering: matching logic, projectName filtering, channel dispatch, failure handling, inert behavior, cleanup, env var conversion, info logging, end-to-end integration"
  - timestamp: 2026-03-20T14:10:42.593Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Phase 1 complete. 68 config tests pass (15 new). Starting Phase 2: Router Service."
projectName: guild-hall
---
Phases 1 and 2 of the Event Router implemented. All tests pass (3184 total, 0 failures), types check clean.

**Phase 1 — Config Schema (Steps 1-4):**
- Added `SYSTEM_EVENT_TYPES` const array (13 event types), `SystemEventType`, `ChannelConfig`, and `NotificationRule` types to `lib/types.ts`
- Added `channels` and `notifications` optional fields to `AppConfig` interface
- Added Zod schemas in `lib/config.ts`: `channelSchema` (discriminated union on shell/webhook), `notificationRuleSchema` (match.type validated against SYSTEM_EVENT_TYPES), channel name regex validation
- Added `superRefine` cross-reference validation ensuring notification rules reference defined channels
- Added 15 new config tests plus a sync test verifying SYSTEM_EVENT_TYPES matches SystemEvent discriminants

**Phase 2 — Router Service (Steps 5-8):**
- Created `daemon/services/event-router.ts` with `createEventRouter(deps)` factory
- DI seams: `dispatchShell` and `dispatchWebhook` callbacks with production defaults
- Default shell dispatch: `Bun.spawn(["sh", "-c", command])` with env vars and 10s timeout
- Default webhook dispatch: `fetch()` with JSON body, Content-Type header, 10s AbortSignal timeout
- camelCase to SCREAMING_SNAKE env var conversion via `camelToScreamingSnake()`
- Inert when channels or notifications empty (no EventBus subscription)
- Fire-and-forget async dispatch, failures logged at warn level
- Returns unsubscribe cleanup function
- 24 router tests covering: matching logic, projectName filtering, channel dispatch, failure handling, inert behavior, cleanup, env var conversion, info logging, end-to-end integration
