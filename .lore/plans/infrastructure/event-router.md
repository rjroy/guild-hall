---
title: "Plan: Event Router"
date: 2026-03-19
status: draft
tags: [event-router, notifications, channels, daemon-service, config]
modules: [event-bus, config, daemon]
related:
  - .lore/specs/infrastructure/event-router.md
  - .lore/brainstorm/event-router.md
---

# Plan: Event Router

## Goal

Add a notification system to the daemon. The Event Router subscribes to the EventBus, evaluates events against user-defined rules from `config.yaml`, and dispatches matches to configured channels (shell commands or webhooks). A user who wants a desktop notification when a commission finishes adds six lines of YAML and restarts the daemon.

This plan implements the full spec at `.lore/specs/infrastructure/event-router.md` (REQ-EVRT-1 through REQ-EVRT-25).

## Codebase Context

**EventBus** (`daemon/lib/event-bus.ts`): 13 `SystemEvent` variants. `createEventBus(log)` returns `{ emit, subscribe }`. Subscribers are stored in a `Set`. `subscribe()` returns an unsubscribe callback. The SSE route (`daemon/routes/events.ts`) subscribes synchronously and dispatches `writeSSE` fire-and-forget. The router follows the same pattern.

**Config schema** (`lib/config.ts`): `appConfigSchema` is a Zod object with `projects`, `models`, `settings`, and several optional scalars. Cross-reference validation uses `superRefine` (model name uniqueness check at lines 64-86). The router's channel-reference validation follows this same pattern.

**AppConfig type** (`lib/types.ts`): TypeScript interface at line 35. Both the Zod schema and the interface need the new `channels` and `notifications` fields.

**Production wiring** (`daemon/app.ts`): `createProductionApp()` creates the EventBus at line 190, reads config at line 188, and returns `{ app, registry, shutdown }`. The router hooks into this as a new service. The `shutdown` function already collects cleanup callbacks (scheduler.stop, briefingRefresh.stop); the router's unsubscribe callback joins that list.

**Logger** (`daemon/lib/log.ts`): `Log` interface with `error`, `warn`, `info`. Factory type `CreateLog = (tag: string) => Log`. The router uses tag `"event-router"`.

**Env var convention for shell channels**: The spec defines `EVENT_TYPE`, `EVENT_JSON`, and `EVENT_<FIELD_NAME>` in SCREAMING_SNAKE_CASE. The conversion from camelCase (`commissionId`) to SCREAMING_SNAKE (`COMMISSION_ID`) is a straightforward regex transformation.

## Implementation Steps

### Phase 1: Config Schema

#### Step 1: Define Zod schemas for channels and notifications

**Files**: `lib/config.ts`
**Addresses**: REQ-EVRT-2, REQ-EVRT-3, REQ-EVRT-4, REQ-EVRT-5, REQ-EVRT-8, REQ-EVRT-9

Define three new schemas:

1. **Channel schema**: A discriminated union on `type`. Two variants:
   - `shell`: requires `command` (non-empty string).
   - `webhook`: requires `url` (non-empty string, valid HTTP/HTTPS URL). Reuse the URL validation pattern from `modelDefinitionSchema.baseUrl` (lines 36-44).

2. **Channel map schema**: `z.record()` with key validation matching `^[a-zA-Z0-9_-]+$` (REQ-EVRT-8). Use `z.record(channelNameSchema, channelSchema)` where `channelNameSchema` is a `z.string().regex()`.

3. **Notification rule schema**: Object with `match` (object with required `type` string and optional `projectName` string) and `channel` (string). The `match.type` field validates against the 13 `SystemEvent` discriminant values. Extract these values into a const array (e.g., `SYSTEM_EVENT_TYPES`) from the `SystemEvent` type definition in `daemon/lib/event-bus.ts`, then reference it in the Zod schema via `z.enum()`. Since `lib/config.ts` should not import from `daemon/`, define the valid event type strings as a const array in `lib/types.ts` and import from there. Keep it in sync with `SystemEvent` via a type-level check (a mapped type that fails to compile if the arrays diverge).

4. **Notifications array schema**: `z.array(notificationRuleSchema)`.

#### Step 2: Add channel and notification fields to appConfigSchema

**Files**: `lib/config.ts`
**Addresses**: REQ-EVRT-1, REQ-EVRT-6, REQ-EVRT-7

Add `channels` (optional) and `notifications` (optional) to `appConfigSchema`. Both fields are optional per REQ-EVRT-1: when absent, the router is inert.

Add a `superRefine` on the full schema (similar to the model name uniqueness check) to validate that every notification rule's `channel` field references a key in `channels`. If `notifications` is present but `channels` is absent or doesn't contain the referenced name, emit a Zod issue. This is REQ-EVRT-7.

#### Step 3: Extend AppConfig TypeScript interface

**Files**: `lib/types.ts`
**Addresses**: REQ-EVRT-6

Add the corresponding TypeScript types:

```typescript
interface ChannelConfig =
  | { type: "shell"; command: string }
  | { type: "webhook"; url: string };

interface NotificationRule {
  match: { type: string; projectName?: string };
  channel: string;
}
```

Add to `AppConfig`:
```typescript
channels?: Record<string, ChannelConfig>;
notifications?: NotificationRule[];
```

#### Step 4: Tests for config schema

**Files**: `tests/lib/config.test.ts`
**Addresses**: REQ-EVRT-1 through REQ-EVRT-9

Add a `describe("channels and notifications", ...)` block. Test cases:

1. Config parses successfully with valid channels and notifications.
2. Config parses successfully with neither field (inert case).
3. Rejects unknown channel type (not `shell` or `webhook`).
4. Rejects shell channel with empty command.
5. Rejects webhook channel with invalid URL (non-HTTP/S).
6. Rejects webhook channel with empty URL.
7. Rejects channel name with invalid characters (spaces, special chars).
8. Rejects notification rule with `match.type` not in the valid event types list.
9. Rejects notification rule referencing an undefined channel name.
10. Accepts notification rule with `projectName` in match.
11. Accepts notification rule without `projectName` in match.

Run `bun test tests/lib/config.test.ts` to confirm.

### Phase 2: Router Service

#### Step 5: Create the EventRouter factory

**Files**: `daemon/services/event-router.ts` (new)
**Addresses**: REQ-EVRT-10, REQ-EVRT-11, REQ-EVRT-12, REQ-EVRT-13, REQ-EVRT-15, REQ-EVRT-24, REQ-EVRT-25

Create `createEventRouter(deps)` factory. The deps interface:

```typescript
interface EventRouterDeps {
  eventBus: EventBus;
  channels: Record<string, ChannelConfig>;
  notifications: NotificationRule[];
  log: Log;
  dispatchShell?: (command: string, env: Record<string, string>) => Promise<void>;
  dispatchWebhook?: (url: string, body: unknown) => Promise<void>;
}
```

The `dispatchShell` and `dispatchWebhook` callbacks are DI seams for testing. Production passes `undefined` and the factory uses real implementations (Steps 6-7). Tests inject mocks.

Behavior:

1. If `channels` is empty or `notifications` is empty, return a no-op cleanup function without subscribing (REQ-EVRT-25).
2. Subscribe to `eventBus`. For each event:
   - Iterate over all notification rules.
   - A rule matches when `rule.match.type === event.type` AND (rule has no `projectName`, OR event carries `projectName` equal to the rule's value). If the event doesn't carry `projectName` and the rule requires it, skip (REQ-EVRT-15).
   - For each match, look up the channel by name. Log at `info` that dispatch begins (REQ-EVRT-23). Call the appropriate dispatch function (shell or webhook) without awaiting. Wrap in try/catch; on failure, log at `warn` with channel name, type, event type, and error message (REQ-EVRT-20, REQ-EVRT-21, REQ-EVRT-23).
3. Return the unsubscribe callback (REQ-EVRT-24).

The async dispatch wrapping: use `void Promise.resolve().then(async () => { ... }).catch(...)` or equivalent to ensure the dispatch is truly async and non-blocking. Each dispatch is independent (REQ-EVRT-13, REQ-EVRT-21).

#### Step 6: Implement shell channel dispatch

**Files**: `daemon/services/event-router.ts`
**Addresses**: REQ-EVRT-17, REQ-EVRT-19

Default `dispatchShell` implementation:

1. Build the env var map from the event object:
   - `EVENT_TYPE`: event's `type` string.
   - `EVENT_JSON`: `JSON.stringify(event)`.
   - For each top-level string field on the event, set `EVENT_<SCREAMING_SNAKE(fieldName)>`. The camelCase-to-SCREAMING_SNAKE conversion: insert underscore before each uppercase letter, then uppercase the whole thing.
2. Spawn `sh -c <command>` with the env vars merged into `process.env` via `Bun.spawn`.
3. Apply a 10-second timeout. If the process hasn't exited, kill it and throw.

#### Step 7: Implement webhook channel dispatch

**Files**: `daemon/services/event-router.ts`
**Addresses**: REQ-EVRT-18, REQ-EVRT-19

Default `dispatchWebhook` implementation:

1. `fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event), signal: AbortSignal.timeout(10_000) })`.
2. If the response is not ok, throw with the status code.
3. The `AbortSignal.timeout` handles the 10-second timeout.

#### Step 8: Tests for the router

**Files**: `tests/daemon/services/event-router.test.ts` (new)
**Addresses**: REQ-EVRT-10 through REQ-EVRT-25

Test cases using `createEventBus` with `nullLog` and injected mock dispatch functions:

**Matching logic:**
1. Rule with `match.type: "commission_result"` fires when `commission_result` event emitted. Verify dispatch called with correct channel.
2. Rule with `match.type: "commission_result"` does not fire for `meeting_ended` event.
3. Rule with `match.type` and `match.projectName` fires when event carries matching `projectName`.
4. Rule with `match.projectName` skips event that doesn't carry `projectName` (e.g., `commission_result` has no `projectName` field). No error, no dispatch.
5. Rule without `match.projectName` matches regardless of whether event has `projectName`.
6. Multiple rules matching the same event dispatch independently.
7. Two rules routing to the same channel fire the channel twice (no dedup).

**Channel dispatch:**
8. Shell dispatch receives correct env vars: `EVENT_TYPE`, `EVENT_JSON`, and field-specific vars (`EVENT_COMMISSION_ID`, `EVENT_SUMMARY`).
9. Webhook dispatch receives the full event object as JSON body.

**Failure handling:**
10. Shell dispatch failure logs at `warn` level. Use `collectingLog` to verify.
11. Webhook dispatch failure logs at `warn` level.
12. One channel failure does not prevent another channel from firing for the same event.

**Inert router:**
13. Empty channels map: factory returns cleanup function, no subscription (verify EventBus subscriber count stays at 0).
14. Empty notifications array: same behavior.

**Cleanup:**
15. Returned cleanup function unsubscribes from EventBus.

**Shell env var conversion:**
16. `commissionId` becomes `EVENT_COMMISSION_ID`.
17. `projectName` becomes `EVENT_PROJECT_NAME`.
18. `type` becomes `EVENT_TYPE` (matches the explicit `EVENT_TYPE` var).

Run `bun test tests/daemon/services/event-router.test.ts` to confirm.

### Phase 3: Production Wiring

#### Step 9: Wire the router into createProductionApp

**Files**: `daemon/app.ts`
**Addresses**: REQ-EVRT-10, REQ-EVRT-22, REQ-EVRT-24

After the EventBus is created and config is read (around line 190), create the router:

```typescript
const { createEventRouter } = await import("@/daemon/services/event-router");
const unsubscribeRouter = createEventRouter({
  eventBus,
  channels: config.channels ?? {},
  notifications: config.notifications ?? [],
  log: createLog("event-router"),
});
```

Add `unsubscribeRouter()` to the `shutdown` function alongside `scheduler.stop()` and `briefingRefresh.stop()`.

The router should be created early in the startup sequence (after EventBus and config, before session recovery) so it captures recovery events.

#### Step 10: Integration test

**Files**: `tests/daemon/services/event-router.test.ts` (append to existing)

Add an integration test that creates a real `EventBus`, a real router with mock dispatchers, emits an event, and verifies the mock was called. This validates the subscribe/emit/dispatch chain end-to-end without hitting the network or spawning processes.

### Phase 4: Validation

#### Step 11: Run full test suite

Run `bun test` and confirm all tests pass, including the new router tests.

#### Step 12: Validate against spec

Launch a sub-agent with fresh context. The agent reads the spec at `.lore/specs/infrastructure/event-router.md` and the implementation, then verifies:

- Every REQ has at least one test covering it.
- `appConfigSchema` includes channels and notifications with cross-reference validation.
- `AppConfig` in `lib/types.ts` includes the new optional fields.
- The router factory is wired in `createProductionApp()`.
- The router uses `Log` from `daemon/lib/log.ts`, not `console`.
- Shell env vars are correctly constructed.
- Webhook POSTs the correct body and content type.
- `projectName` matching correctly skips events without the field.
- Channel failures are logged but don't propagate.
- Empty config produces an inert router with no EventBus subscription.

## REQ Coverage Matrix

| REQ | Description | Step |
|-----|-------------|------|
| REQ-EVRT-1 | Optional top-level `channels` and `notifications` fields | 2, 4 |
| REQ-EVRT-2 | `channels` is a named map with type discriminant | 1, 4 |
| REQ-EVRT-3 | `notifications` is an array of rules with `match` and `channel` | 1, 4 |
| REQ-EVRT-4 | `match` supports exactly `type` (required) and `projectName` (optional) | 1, 4 |
| REQ-EVRT-5 | `match.type` validates against SystemEvent discriminant values | 1, 4 |
| REQ-EVRT-6 | Schema extends both Zod and TypeScript types | 2, 3 |
| REQ-EVRT-7 | Channel references in rules must resolve to defined channels | 2, 4 |
| REQ-EVRT-8 | Channel names match `^[a-zA-Z0-9_-]+$` | 1, 4 |
| REQ-EVRT-9 | Shell requires command, webhook requires valid URL | 1, 4 |
| REQ-EVRT-10 | Router created at startup, subscribes to EventBus | 5, 9 |
| REQ-EVRT-11 | Synchronous subscribe, async dispatch, fire-and-forget | 5, 8 |
| REQ-EVRT-12 | Rule matching logic (type + optional projectName) | 5, 8 |
| REQ-EVRT-13 | Multiple rules dispatch independently, no dedup | 5, 8 |
| REQ-EVRT-14 | Event provenance: which events carry projectName | 8 (test cases 3, 4) |
| REQ-EVRT-15 | No projectName resolution; skip if missing | 5, 8 |
| REQ-EVRT-16 | Future projectName additions work automatically | (architectural; no code change) |
| REQ-EVRT-17 | Shell channels use env vars (EVENT_TYPE, EVENT_JSON, field vars) | 6, 8 |
| REQ-EVRT-18 | Webhook channels POST JSON with Content-Type header | 7, 8 |
| REQ-EVRT-19 | 10-second timeout for both channel types | 6, 7 |
| REQ-EVRT-20 | Failures logged at warn, then dropped | 5, 8 |
| REQ-EVRT-21 | Channel failure doesn't affect other channels | 5, 8 |
| REQ-EVRT-22 | Uses injectable Log with tag "event-router" | 5, 9 |
| REQ-EVRT-23 | Info log on match+dispatch, warn log on failure | 5, 8 |
| REQ-EVRT-24 | Factory returns cleanup function (unsubscribe) | 5, 8 |
| REQ-EVRT-25 | Inert when no channels or rules configured | 5, 8 |

## Delegation Guide

All steps are standard daemon service implementation. No specialized expertise needed.

Phase 1 (config schema) and Phase 2 (router service) can be done by the same agent in sequence, since the router depends on the config types. Phase 3 (wiring) is a follow-up checkpoint. Phase 4 (validation) should use a fresh-context sub-agent.

The `SYSTEM_EVENT_TYPES` array in Step 1 is the one piece that crosses the `lib/` to `daemon/` boundary. The type-level sync check (a mapped type assertion) prevents drift without runtime coupling.

## Open Questions

**Event type list sync**: Step 1 proposes a const array of valid event type strings in `lib/types.ts` with a type-level assertion against `SystemEvent["type"]`. This requires `SystemEvent` to be importable from `lib/types.ts`, but it currently lives in `daemon/lib/event-bus.ts`. Two options:

1. Move the `SystemEvent` type (just the type, not the bus implementation) to `lib/types.ts`. This respects the existing boundary rule (`lib/` never imports from `daemon/`). The EventBus implementation in `daemon/` re-exports or imports from `lib/types.ts`.
2. Define the event type strings as a standalone const array in `lib/types.ts` without a compile-time assertion, and add a test that imports both and verifies they match.

Option 2 is simpler and avoids moving types across boundaries. The test catches drift at CI time, which is sufficient. Lean toward Option 2 unless the implementer finds a clean way to do Option 1.
