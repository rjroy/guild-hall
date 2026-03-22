---
title: Event Router
date: 2026-03-19
revised: 2026-03-21
status: implemented
tags: [event-router, notifications, channels, daemon-service, config]
modules: [event-bus, config, daemon]
related:
  - .lore/brainstorm/event-router.md
  - .lore/brainstorm/growth-surface-2026-03-17.md
  - .lore/brainstorm/triggered-commissions.md
req-prefix: EVRT
---

# Spec: Event Router

## Overview

The Event Router is a general-purpose filtered subscription layer over the EventBus. It evaluates events against match rules and calls registered handlers when rules match. The router does not know what its handlers do. It provides the matching; consumers provide the behavior.

The EventBus is a broadcast: every subscriber sees every event. The Event Router adds selectivity. A consumer registers a match rule and a handler. The router evaluates each event against all registered rules and invokes matching handlers. This is the same relationship as a raw TCP socket versus an HTTP router: the lower layer delivers everything, the higher layer dispatches based on criteria.

One system consumes the Event Router today:

1. **Notification Service**: dispatches matched events to external channels (shell commands, webhooks). Configured via `channels` and `notifications` in `config.yaml`.

Other daemon services (outcome triage, mail orchestrator, commission orchestrator) subscribe directly to the EventBus for their own internal needs. The Event Router is for rule-based matching with pluggable handlers, not a replacement for direct subscriptions.

The architecture supports additional consumers without changing the router. Triggered commissions, for example, would register their own handlers to create commissions when events match. The router doesn't need to know about commissions to support this.

## Entry Points

- Growth Surface brainstorm (`.lore/brainstorm/growth-surface-2026-03-17.md`) identified notifications as the highest-value external integration.
- Event Router brainstorm (`.lore/brainstorm/event-router.md`) resolved six design questions.
- Triggered Commissions brainstorm (`.lore/brainstorm/triggered-commissions.md`) identified the coupling between matching and dispatch as a blocker. This revision addresses that.
- EventBus (`daemon/lib/event-bus.ts`) already broadcasts `SystemEvent` to SSE subscribers. The router is a structured layer on top of that broadcast.

## Requirements

### Event Router

- REQ-EVRT-1: The Event Router is a daemon service created during startup (`createProductionApp`). It receives the EventBus and a `Log` as dependencies. It subscribes to the EventBus once and holds the subscription for the daemon's lifetime.

- REQ-EVRT-2: The router exposes a `subscribe` method. Each subscription consists of a match rule and a handler callback:

  ```typescript
  interface EventMatchRule {
    type: SystemEventType;
    projectName?: string;
  }

  interface EventRouter {
    subscribe(rule: EventMatchRule, handler: (event: SystemEvent) => void | Promise<void>): () => void;
  }
  ```

  The `subscribe` method returns an unsubscribe callback, following the EventBus pattern.

- REQ-EVRT-3: When an event arrives from the EventBus, the router evaluates every registered subscription's match rule against it. A rule matches when:
  1. The rule's `type` equals the event's `type`.
  2. If the rule specifies `projectName`, the event must have a `projectName` field equal to that value. If the event does not carry `projectName`, the rule does not match (skip, not error).
  3. If the rule does not specify `projectName`, the rule matches on `type` alone regardless of whether the event carries `projectName`.

- REQ-EVRT-4: Multiple subscriptions can match the same event. Each match invokes its handler independently. No deduplication.

- REQ-EVRT-5: Handler invocation is fire-and-forget. The router calls each matching handler without awaiting it, wrapping each call in a try/catch that logs failures. A slow handler does not block EventBus emission, other EventBus subscribers, or other router handlers.

- REQ-EVRT-6: Handler failures are logged at `warn` level with the event type and error message. A handler failure does not affect other handlers matched by the same event.

### Event Provenance

- REQ-EVRT-7: Of the 13 `SystemEvent` variants (as of this spec's revision), three carry `projectName`:
  - `commission_status`: `projectName` is optional (may be undefined).
  - `schedule_spawned`: `projectName` is required.
  - `toolbox_replicate`: `projectName` is required.

  The remaining 10 event types do not carry `projectName`.

- REQ-EVRT-8: The router does not resolve `projectName` from other identifiers. If a rule matches on `projectName` and the event doesn't carry it, the rule silently skips. No lookup against commission or meeting state. This keeps the router stateless and decoupled from activity services.

- REQ-EVRT-9: If future work adds `projectName` to more event types at the emit site, the router benefits automatically. No router changes needed, only changes to the emit calls. This spec does not require those changes.

### Notification Service

The notification service is the first consumer of the Event Router. It dispatches matched events to external channels. Configuration lives in `config.yaml`.

- REQ-EVRT-10: Two optional top-level fields exist in `config.yaml`: `channels` and `notifications`. Both are optional. When both are absent, the notification service registers no subscriptions with the router.

- REQ-EVRT-11: `channels` is a named map. Each key is the channel name. Each value has a `type` discriminant and type-specific fields:

  ```yaml
  channels:
    desktop:
      type: shell
      command: "notify-send 'Guild Hall' \"$EVENT_TYPE: $SUMMARY\""
    ops-webhook:
      type: webhook
      url: "https://hooks.example.com/guild-hall"
  ```

  Valid channel types are `shell` and `webhook`. The Zod schema rejects unknown types at parse time.

- REQ-EVRT-12: `notifications` is an array of rules. Each rule has a `match` object and a `channel` string referencing a named channel:

  ```yaml
  notifications:
    - match:
        type: commission_result
      channel: desktop
    - match:
        type: commission_status
        projectName: guild-hall
      channel: ops-webhook
  ```

- REQ-EVRT-13: The `match` object supports exactly two fields: `type` (required) and `projectName` (optional). Both are exact-match strings. This matches the Event Router's `EventMatchRule` shape.

- REQ-EVRT-14: The Zod schema for `match.type` validates against the `SystemEvent` discriminant values. A rule with `type: "nonexistent_event"` is a config error caught at parse time.

- REQ-EVRT-15: The config schema extends both `appConfigSchema` (Zod, `lib/config.ts`) and `AppConfig` (TypeScript interface, `lib/types.ts`) with the `channels` and `notifications` fields.

### Notification Config Validation

- REQ-EVRT-16: Channel name references in notification rules must resolve to a defined channel. A rule referencing `channel: "desktop"` when no channel named `desktop` is configured is a config validation error. This validation runs at config parse time via Zod `superRefine`.

- REQ-EVRT-17: Channel names must be non-empty strings matching `^[a-zA-Z0-9_-]+$`.

- REQ-EVRT-18: Shell channels require a non-empty `command` string. Webhook channels require a non-empty `url` string that parses as a valid HTTP or HTTPS URL.

### Notification Startup

- REQ-EVRT-19: The notification service is created during startup (`createProductionApp`) after the Event Router. It receives the Event Router, the parsed config (channels and notifications), and a `Log` as dependencies.

- REQ-EVRT-20: During initialization, the notification service iterates over the `notifications` array. For each rule, it calls `eventRouter.subscribe(rule.match, handler)` where the handler dispatches to the referenced channel. The service holds the unsubscribe callbacks for cleanup.

- REQ-EVRT-21: When `channels` or `notifications` are absent from config, the notification service creates no subscriptions. No overhead for users who don't configure notifications.

### Channel Handlers

- REQ-EVRT-22: Shell channels execute the configured `command` as a child process via `Bun.spawn`. The event is passed as environment variables:
  - `EVENT_TYPE`: The event's `type` string.
  - `EVENT_JSON`: The full event serialized as JSON.
  - Every top-level string field on the event object is set as `EVENT_<FIELD_NAME>` in SCREAMING_SNAKE_CASE.

  The command string is passed to the shell (`sh -c`). The channel does not parse or template the command.

- REQ-EVRT-23: Webhook channels POST the full event object as a JSON body to the configured URL. `Content-Type: application/json`. No authentication headers or request signing in v1.

- REQ-EVRT-24: Both channel types run with a 10-second timeout. Shell commands that don't exit are killed. Webhook requests that don't complete are aborted. Hardcoded defaults, not configurable.

### Notification Failure Handling

- REQ-EVRT-25: Channel dispatch failures are logged at `warn` level and dropped. No retry, no dead letter queue. The log entry includes: channel name, channel type, event type, and error message.

- REQ-EVRT-26: A channel failure does not affect other channels matched by the same event.

### Logging

- REQ-EVRT-27: The router uses the injectable logger with tag `"event-router"`. The notification service uses tag `"notification-service"`. Both follow the DI pattern established by REQ-LOG-4.

- REQ-EVRT-28: The router logs at `info` level when a subscription matches an event. The notification service logs at `info` level when dispatch begins and at `warn` level when dispatch fails. Neither logs every event received.

### Dependency Injection

- REQ-EVRT-29: The router is created by a factory function (`createEventRouter`) that accepts `EventBus` and `Log`. The factory returns an `EventRouter` instance (with the `subscribe` method) and a cleanup function.

- REQ-EVRT-30: The notification service is created by a factory function (`createNotificationService`) that accepts `EventRouter`, config (channels and notifications), and `Log`. The factory returns a cleanup function (which calls the unsubscribe callbacks for all registered subscriptions).

## Implementation Note

The current implementation (`daemon/services/event-router.ts`) fuses matching and channel dispatch into a single `createEventRouter` function. This revision separates them: `createEventRouter` becomes the generic matching layer, and a new `createNotificationService` becomes the channel dispatch consumer. The refactor preserves all existing behavior while making the matching logic available to other consumers.

## Explicit Non-Goals

- **Package-type channels.** Config entries only. The `lib/packages.ts` discovery system is not touched.
- **Rule matching beyond `type` and `projectName`.** Finer matching (on `status`, `commissionId`, glob patterns) is an exit point, not a v1 feature.
- **Templating or formatting.** Channels receive raw data. No template engine.
- **Retry or dead letter logging.** Failures are logged and dropped.
- **Channel authentication.** No auth headers for webhooks.
- **`projectName` resolution.** The router does not look up project context.
- **Hot-reload.** Config is read at startup. Changes require daemon restart.
- **Triggered commissions.** The router architecture supports them, but the trigger rules, commission templates, loop prevention, and approval model are a separate spec.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Triggered commissions | Users want "when X happens, create commission Y" | New spec for trigger rules as a second Event Router consumer |
| Package channels | A channel type can't be expressed as shell or webhook | New spec for channel package type |
| Finer rule matching | Users need to filter on `status`, `commissionId`, or other fields | Extend `EventMatchRule` with additional optional fields |
| Dead letter logging | Users report lost notifications they needed to audit | Add failed dispatch log file |
| `projectName` on more events | Rules matching on `projectName` skip too many events | Modify emit sites to include `projectName` |

## Success Criteria

- [ ] Event Router subscribes to EventBus and evaluates registered match rules
- [ ] `eventRouter.subscribe(rule, handler)` registers a subscription that fires when events match
- [ ] Multiple subscriptions can match the same event; each handler fires independently
- [ ] Handler failures are logged and do not affect other handlers
- [ ] `channels` and `notifications` fields parse and validate in `config.yaml`
- [ ] Zod schema rejects: unknown channel types, invalid URLs, missing required fields, rules referencing undefined channels, rules with invalid event types
- [ ] Notification service registers subscriptions on the Event Router for each config rule
- [ ] Shell channel executes command with event data as environment variables
- [ ] Webhook channel POSTs event JSON to configured URL
- [ ] Rules with `projectName` skip events that don't carry it (no error, no dispatch)
- [ ] Channel failures are logged at warn level and do not affect other dispatches
- [ ] Both router and notification service are injectable and testable (factory pattern, no global state)
- [ ] Notification service is inert (no subscriptions) when no channels or rules are configured
- [ ] All daemon tests pass, including new tests for the router and notification service

## AI Validation

**Defaults:**
- Read the full spec before starting implementation.
- Verify every requirement has at least one test.
- Run `bun test` and confirm all tests pass before declaring work complete.

**Structural checks:**
- Confirm `createEventRouter` in `daemon/services/event-router.ts` returns an `EventRouter` instance with a `subscribe` method, not a cleanup function that fuses matching with dispatch.
- Confirm `createNotificationService` exists as a separate factory that consumes the Event Router.
- Confirm `appConfigSchema` in `lib/config.ts` includes channel and notification schemas with cross-reference validation.
- Confirm `AppConfig` in `lib/types.ts` includes the optional `channels` and `notifications` fields.
- Confirm both factories are wired in `createProductionApp()` (`daemon/app.ts`), with the router created before the notification service.
- Confirm both services use `Log` from `daemon/lib/log.ts`, not direct `console` calls.

**Behavioral checks:**
- Test that `eventRouter.subscribe(rule, handler)` invokes the handler when a matching event is emitted.
- Test that a non-matching event does not invoke the handler.
- Test that a shell channel receives correct environment variables for each event field.
- Test that a webhook channel sends the correct JSON body and content type.
- Test that `projectName` matching skips events without the field.
- Test that handler failures are logged but don't propagate to other handlers.
- Test that an empty config (no channels, no notifications) produces a notification service with no subscriptions.
- Test that rules referencing undefined channels fail config validation.
- Test that rules with invalid `match.type` values fail config validation.
