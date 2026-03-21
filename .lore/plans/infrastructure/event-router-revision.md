---
title: "Plan: Event Router Revision"
date: 2026-03-21
status: draft
tags: [event-router, notifications, channels, daemon-service, refactor]
modules: [event-bus, config, daemon]
related:
  - .lore/specs/infrastructure/event-router.md
  - .lore/plans/infrastructure/event-router.md
  - .lore/brainstorm/event-router.md
  - .lore/brainstorm/triggered-commissions.md
---

# Plan: Event Router Revision

## Goal

Separate the Event Router from notification dispatch. The current implementation (`daemon/services/event-router.ts`) fuses event matching with channel dispatch into a single factory. The revised spec splits these into two services: a generic `EventRouter` that matches events and invokes handlers, and a `NotificationService` that consumes the router for channel dispatch. This makes the matching layer reusable for triggered commissions and other future consumers without the router knowing about channels, webhooks, or shell commands.

This plan implements the revised spec at `.lore/specs/infrastructure/event-router.md` (REQ-EVRT-1 through REQ-EVRT-30).

## Codebase Context

**What already exists and stays.** The config layer is complete. `lib/config.ts` already has `channelSchema`, `notificationRuleSchema`, `appConfigSchema` with `channels` and `notifications` fields, and `superRefine` cross-reference validation (REQ-EVRT-10 through REQ-EVRT-18). `lib/types.ts` has `ChannelConfig`, `NotificationRule`, `SystemEventType`, `SYSTEM_EVENT_TYPES`, and the `AppConfig` fields. These satisfy the config requirements and do not change.

**What changes.** The single `createEventRouter` function in `daemon/services/event-router.ts` currently accepts channels, notifications, and dispatch stubs alongside the EventBus. It returns a bare cleanup function. The revised spec requires it to return an `EventRouter` interface with a `subscribe` method and no knowledge of channels. Channel dispatch moves to a new `createNotificationService` factory that consumes the router.

**Production wiring** (`daemon/app.ts`, lines 548-554): Currently creates the fused router with `config.channels` and `config.notifications`. This rewires to create the generic router first, then the notification service.

**Tests** (`tests/daemon/services/event-router.test.ts`): 416 lines covering matching, dispatch, failure handling, inert behavior, and cleanup. These tests test the right behaviors but through the wrong interface. They'll be restructured to test the router and notification service separately.

**EventBus** (`daemon/lib/event-bus.ts`): Unchanged. The router subscribes to it; the notification service doesn't touch it directly.

**Log** (`daemon/lib/log.ts`): Unchanged. The router uses tag `"event-router"`, the notification service uses tag `"notification-service"` (REQ-EVRT-27).

## Implementation Steps

### Phase 1: Rewrite the Event Router

Replaces the existing `daemon/services/event-router.ts` with the generic matching layer. This is the foundation everything else depends on.

#### Step 1: Define the EventRouter interface and rewrite the factory

**Files**: `daemon/services/event-router.ts`
**Addresses**: REQ-EVRT-1, REQ-EVRT-2, REQ-EVRT-3, REQ-EVRT-4, REQ-EVRT-5, REQ-EVRT-6, REQ-EVRT-8, REQ-EVRT-9, REQ-EVRT-27, REQ-EVRT-29

Replace the current file contents entirely. The new module exports:

```typescript
interface EventMatchRule {
  type: SystemEventType;
  projectName?: string;
}

interface EventRouter {
  subscribe(rule: EventMatchRule, handler: (event: SystemEvent) => void | Promise<void>): () => void;
}

function createEventRouter(deps: { eventBus: EventBus; log: Log }): { router: EventRouter; cleanup: () => void };
```

The factory:

1. Subscribes to the EventBus once.
2. Maintains a list of `{ rule, handler }` entries.
3. On each event, iterates entries and evaluates the match rule:
   - `rule.type` must equal `event.type`.
   - If `rule.projectName` is set, the event must carry a `projectName` field with the same value. If the event doesn't carry `projectName`, skip (no error).
   - If `rule.projectName` is not set, type match alone is sufficient.
4. For each match, invokes the handler fire-and-forget (`void handler(event)` or `void Promise.resolve().then(...)`) wrapped in try/catch. Failures log at `warn` with event type and error message (REQ-EVRT-5, REQ-EVRT-6).
5. Logs at `info` when a subscription matches an event (REQ-EVRT-28).
6. The `subscribe` method returns an unsubscribe callback that removes the entry from the list.
7. The factory returns `{ router, cleanup }` where `cleanup` is the EventBus unsubscribe.

Key differences from current implementation:
- No `channels`, `notifications`, `dispatchShell`, or `dispatchWebhook` in deps.
- Returns `{ router, cleanup }` instead of a bare cleanup function.
- The `subscribe` method is the public API, not an internal notification-loop.
- `EventMatchRule` and `EventRouter` are exported types.

The `camelToScreamingSnake` helper moves to the notification service (Phase 2). `buildEventEnv`, `defaultDispatchShell`, and `defaultDispatchWebhook` also move.

#### Step 2: Tests for the generic Event Router

**Files**: `tests/daemon/services/event-router.test.ts`
**Addresses**: REQ-EVRT-1 through REQ-EVRT-9, REQ-EVRT-27, REQ-EVRT-28, REQ-EVRT-29

Replace the existing test file. Tests focus on the generic subscribe/match/handler contract:

**Subscription and matching:**
1. `subscribe` with a type rule invokes the handler when a matching event is emitted.
2. `subscribe` with a type rule does not invoke the handler for a non-matching event type.
3. Rule with `projectName` matches when the event carries the same `projectName`.
4. Rule with `projectName` skips when the event does not carry `projectName` (no error, handler not called).
5. Rule with `projectName` skips when the event carries a different `projectName`.
6. Rule without `projectName` matches regardless of whether the event carries `projectName`.

**Multiple subscriptions:**
7. Multiple subscriptions matching the same event each fire independently (REQ-EVRT-4).
8. The same handler registered twice fires twice (no dedup).

**Handler failure isolation:**
9. A handler that throws does not prevent other handlers from firing.
10. A handler that throws is logged at `warn` level (use `collectingLog` to verify).

**Unsubscribe:**
11. The callback returned by `subscribe` removes that subscription. After calling it, emitting a matching event does not fire the handler.
12. Unsubscribing one subscription does not affect others.

**Cleanup:**
13. Calling `cleanup` (from the factory return) unsubscribes from the EventBus. No handlers fire after cleanup.

**Logging:**
14. Info log emitted when a subscription matches (REQ-EVRT-28).

Run: `bun test tests/daemon/services/event-router.test.ts`

### Phase 2: Create the Notification Service

Extracts channel dispatch from the old router into a standalone consumer of the Event Router.

#### Step 3: Create the notification service factory

**Files**: `daemon/services/notification-service.ts` (new)
**Addresses**: REQ-EVRT-10, REQ-EVRT-11, REQ-EVRT-12, REQ-EVRT-13, REQ-EVRT-19, REQ-EVRT-20, REQ-EVRT-21, REQ-EVRT-22, REQ-EVRT-23, REQ-EVRT-24, REQ-EVRT-25, REQ-EVRT-26, REQ-EVRT-27, REQ-EVRT-30

The module exports:

```typescript
interface NotificationServiceDeps {
  router: EventRouter;
  channels: Record<string, ChannelConfig>;
  notifications: NotificationRule[];
  log: Log;
  // DI seams for testing (production uses defaults)
  dispatchShell?: (command: string, env: Record<string, string>) => Promise<void>;
  dispatchWebhook?: (url: string, body: unknown) => Promise<void>;
}

function createNotificationService(deps: NotificationServiceDeps): () => void;
```

Behavior:

1. If `channels` is empty or `notifications` is empty, return a no-op cleanup without registering subscriptions (REQ-EVRT-21).
2. For each notification rule, call `router.subscribe(rule.match, handler)` where the handler:
   - Looks up the channel by `rule.channel` name.
   - If the channel is `shell`, builds env vars and calls `dispatchShell`.
   - If the channel is `webhook`, calls `dispatchWebhook`.
   - Wraps dispatch in try/catch. Failures log at `warn` with channel name, channel type, event type, and error message (REQ-EVRT-25).
   - Logs at `info` when dispatch begins (REQ-EVRT-28).
3. Collects all unsubscribe callbacks. Returns a cleanup function that calls all of them.

Move these functions from the current `event-router.ts` into this file:
- `camelToScreamingSnake` (export it for testing)
- `buildEventEnv`
- `defaultDispatchShell`
- `defaultDispatchWebhook`

#### Step 4: Tests for the notification service

**Files**: `tests/daemon/services/notification-service.test.ts` (new)
**Addresses**: REQ-EVRT-10 through REQ-EVRT-26, REQ-EVRT-28, REQ-EVRT-30

The notification service tests need a real `EventRouter` (from Phase 1) since the notification service is a consumer. Create a helper that sets up an EventBus, an EventRouter, and a NotificationService with mock dispatchers.

**Channel dispatch:**
1. Shell dispatch receives correct env vars: `EVENT_TYPE`, `EVENT_JSON`, and field-specific vars (`EVENT_COMMISSION_ID`, `EVENT_SUMMARY`).
2. Shell dispatch receives the correct command string from the channel config.
3. Webhook dispatch receives the full event object as body.
4. Webhook dispatch is called with the correct URL from the channel config.

**Failure handling:**
5. Shell dispatch failure logs at `warn` with channel name and error message.
6. Webhook dispatch failure logs at `warn` with channel name and error message.
7. One channel failure does not prevent another channel from firing for the same event (REQ-EVRT-26).

**Inert behavior:**
8. Empty channels map: no subscriptions registered, cleanup is a no-op.
9. Empty notifications array: same.

**Cleanup:**
10. Cleanup function unsubscribes all handlers. After cleanup, emitting matching events does not trigger dispatch.

**Timeout wiring (REQ-EVRT-24):**
11. Verify `defaultDispatchShell` passes a 10-second timeout (inspect that `Bun.spawn` is killed after 10s, or test via the DI seam by confirming the default implementation exists and is used when no override is provided).
12. Verify `defaultDispatchWebhook` uses `AbortSignal.timeout(10_000)`.

These are structural checks that the timeout survived the move. The actual timeout behavior is integration-level and hard to unit test without real delays, so verify the mechanism is wired rather than waiting 10 seconds in a test.

**camelToScreamingSnake (moved from router tests):**
13. `commissionId` -> `COMMISSION_ID`
14. `projectName` -> `PROJECT_NAME`
15. `type` -> `TYPE`
16. `summary` -> `SUMMARY`

**Integration (end-to-end through router):**
17. Emit event on EventBus, verify it flows through router matching to notification dispatch. This is the existing integration test from the old file, adapted to the two-service architecture.

Run: `bun test tests/daemon/services/notification-service.test.ts`

### Phase 3: Production Wiring

#### Step 5: Rewire createProductionApp

**Files**: `daemon/app.ts`
**Addresses**: REQ-EVRT-1, REQ-EVRT-19, REQ-EVRT-29, REQ-EVRT-30

Replace the current event router wiring (lines 548-554) with:

```typescript
const { createEventRouter } = await import("@/daemon/services/event-router");
const { router: eventRouter, cleanup: cleanupRouter } = createEventRouter({
  eventBus,
  log: createLog("event-router"),
});

const { createNotificationService } = await import("@/daemon/services/notification-service");
const cleanupNotifications = createNotificationService({
  router: eventRouter,
  channels: config.channels ?? {},
  notifications: config.notifications ?? [],
  log: createLog("notification-service"),
});
```

Update the `shutdown` function body:

```typescript
shutdown: () => {
  scheduler.stop();
  briefingRefresh.stop();
  cleanupNotifications();
  cleanupRouter();
  unsubscribeTriage();
},
```

Order matters: notification service unsubscribes its handlers first, then the router detaches from the EventBus. `unsubscribeTriage` stays (it's a separate EventBus subscriber).

The router must be created before the notification service (REQ-EVRT-19, REQ-EVRT-30). Keep both before session recovery so they capture recovery events.

### Phase 4: Validation

#### Step 6: Run full test suite

Run `bun test` and confirm all tests pass, including the new router and notification service tests.

#### Step 7: Fresh-context review

Launch a sub-agent with fresh context to verify against the spec. The agent reads the revised spec and the implementation, then checks:

- `createEventRouter` returns an `EventRouter` with a `subscribe` method, not a cleanup function that fuses matching with dispatch.
- `createNotificationService` exists as a separate factory that consumes the Event Router.
- `appConfigSchema` includes channel and notification schemas with cross-reference validation (already present, verify unchanged).
- `AppConfig` in `lib/types.ts` includes `channels?` and `notifications?` (already present, verify unchanged).
- Both factories are wired in `createProductionApp()`, router first.
- Router uses `Log` with tag `"event-router"`, notification service uses `"notification-service"`.
- Handler failures in the router are logged but don't propagate.
- Channel failures in the notification service are logged but don't propagate.
- Empty config produces an inert notification service with no subscriptions.
- The `shutdown` function in `createProductionApp` calls both `cleanupNotifications()` and `cleanupRouter()`.
- The `SYSTEM_EVENT_TYPES` array in `lib/types.ts` still has 11 entries matching the `SystemEvent` union in `daemon/lib/event-bus.ts` (sync test in `tests/lib/config.test.ts` guards this, but verify it still passes).
- Every REQ ID has at least one test.

## REQ Coverage Matrix

| REQ | Description | Step |
|-----|-------------|------|
| REQ-EVRT-1 | Router is a daemon service, receives EventBus and Log | 1, 5 |
| REQ-EVRT-2 | Router exposes `subscribe(rule, handler)` returning unsubscribe | 1, 2 |
| REQ-EVRT-3 | Match rule evaluation (type required, projectName optional) | 1, 2 |
| REQ-EVRT-4 | Multiple subscriptions fire independently, no dedup | 1, 2 |
| REQ-EVRT-5 | Handler invocation is fire-and-forget with try/catch logging | 1, 2 |
| REQ-EVRT-6 | Handler failures logged at warn, do not affect other handlers | 1, 2 |
| REQ-EVRT-7 | Event provenance: which events carry projectName | 2 (test cases 3-6) |
| REQ-EVRT-8 | No projectName resolution; skip if missing | 1, 2 |
| REQ-EVRT-9 | Future projectName additions work automatically | Architectural, no code |
| REQ-EVRT-10 | Optional `channels` and `notifications` in config | Existing (no change) |
| REQ-EVRT-11 | `channels` is a named map with type discriminant | Existing (no change) |
| REQ-EVRT-12 | `notifications` is an array with match and channel | Existing (no change) |
| REQ-EVRT-13 | `match` supports type (required) and projectName (optional) | Existing (no change) |
| REQ-EVRT-14 | `match.type` validates against SystemEvent discriminants | Existing (no change) |
| REQ-EVRT-15 | Config extends both Zod and TypeScript types | Existing (no change) |
| REQ-EVRT-16 | Channel references must resolve to defined channels | Existing (no change) |
| REQ-EVRT-17 | Channel names match `^[a-zA-Z0-9_-]+$` | Existing (no change) |
| REQ-EVRT-18 | Shell requires command, webhook requires valid URL | Existing (no change) |
| REQ-EVRT-19 | Notification service created at startup after router | 5 |
| REQ-EVRT-20 | Notification service iterates rules, calls router.subscribe | 3, 4 |
| REQ-EVRT-21 | Inert when no channels or rules configured | 3, 4 |
| REQ-EVRT-22 | Shell channels use env vars (EVENT_TYPE, EVENT_JSON, field vars) | 3, 4 |
| REQ-EVRT-23 | Webhook channels POST JSON with Content-Type | 3, 4 |
| REQ-EVRT-24 | 10-second timeout for both channel types | 3 |
| REQ-EVRT-25 | Channel failures logged at warn, dropped | 3, 4 |
| REQ-EVRT-26 | Channel failure doesn't affect other channels | 3, 4 |
| REQ-EVRT-27 | Router uses tag "event-router", notification uses "notification-service" | 1, 3 |
| REQ-EVRT-28 | Router logs info on match; notification logs info on dispatch, warn on failure | 1, 2, 3, 4 |
| REQ-EVRT-29 | Router is DI factory accepting EventBus and Log | 1 |
| REQ-EVRT-30 | Notification service is DI factory accepting router, config, Log | 3 |

## Delegation Guide

All four phases are standard daemon service work. Commission to Dalton.

**Phase 1 and Phase 2** are the core work and should be done together in one commission. The notification service depends on the router types, so sequential execution within a single session avoids coordination overhead. Expected scope: delete the old file, write the new router, write the notification service, write both test files, confirm both pass.

**Phase 3** is a wiring change (5 lines in `daemon/app.ts`). It can be part of the same commission as Phases 1-2, or split if the commission is getting long. If split, it should run second since it depends on the new exports.

**Phase 4** validation uses a fresh-context sub-agent (Thorne or a reviewer). The implementing agent should run `bun test` before declaring complete. The fresh-context review is a follow-up commission.

## Resolved Questions

**Should the router store subscriptions in a Set or an Array?** Array. Subscriptions need stable iteration order and support for duplicates (two identical rules are two subscriptions). The unsubscribe callback removes by reference, not by value, so duplicates don't collide.

**Should EventMatchRule and EventRouter types live in lib/types.ts or daemon/services/event-router.ts?** In `daemon/services/event-router.ts`. These types are daemon-internal (only the router and its consumers use them). They don't need to cross the lib/daemon boundary. Config types (`ChannelConfig`, `NotificationRule`) stay in `lib/types.ts` because config validation runs in `lib/`.

**What happens to tests that import `camelToScreamingSnake` from the old location?** The import path changes to `daemon/services/notification-service.ts`. The function moves with the dispatch logic it serves.
