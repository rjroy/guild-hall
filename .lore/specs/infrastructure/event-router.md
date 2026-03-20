---
title: Event Router
date: 2026-03-19
status: implemented
tags: [event-router, notifications, channels, daemon-service, config]
modules: [event-bus, config, daemon]
related:
  - .lore/brainstorm/event-router.md
  - .lore/brainstorm/growth-surface-2026-03-17.md
req-prefix: EVRT
---

# Spec: Event Router

## Overview

The Event Router is a daemon service that subscribes to the EventBus, evaluates events against user-defined notification rules, and dispatches matching events to configured channels. It solves a specific problem: "tell me when something happens in Guild Hall" without requiring the user to watch the UI.

Two channel types ship in v1: `shell` (runs a command) and `webhook` (POSTs JSON). Configuration lives in `config.yaml` as two new top-level fields: `channels` (named channel definitions) and `notifications` (rules mapping event types to channels).

Package-type channels are explicitly out of scope for this spec. The architecture allows them later, but no package discovery or metadata changes ship here.

## Entry Points

- Growth Surface brainstorm (`.lore/brainstorm/growth-surface-2026-03-17.md`) identified notifications as the highest-value external integration.
- Event Router brainstorm (`.lore/brainstorm/event-router.md`) resolved six design questions. This spec codifies those decisions.
- EventBus (`daemon/lib/event-bus.ts`) already broadcasts `SystemEvent` to SSE subscribers. The router is a second subscriber.

## Requirements

### Config Schema

- REQ-EVRT-1: Two new optional top-level fields are added to `config.yaml`: `channels` and `notifications`. Both are optional. When both are absent, the router is inert (subscribes but never dispatches).

- REQ-EVRT-2: `channels` is a named map. Each key is the channel name (used by rules to reference it). Each value has a `type` discriminant and type-specific fields:

  ```yaml
  channels:
    desktop:
      type: shell
      command: "notify-send 'Guild Hall' \"$EVENT_TYPE: $SUMMARY\""
    ops-webhook:
      type: webhook
      url: "https://hooks.example.com/guild-hall"
  ```

  Valid channel types for this spec are `shell` and `webhook`. The Zod schema rejects unknown types at parse time.

- REQ-EVRT-3: `notifications` is an array of rules. Each rule has a `match` object and a `channel` string referencing a named channel:

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

- REQ-EVRT-4: The `match` object supports exactly two fields: `type` (required, matches the `SystemEvent` discriminant) and `projectName` (optional, matches the event's `projectName` field when present). No other fields are matchable. Both fields are exact-match strings, not patterns or arrays.

- REQ-EVRT-5: The Zod schema for `match.type` validates against the `SystemEvent` discriminant values. A rule with `type: "nonexistent_event"` is a config error caught at parse time. The valid values are the 13 `SystemEvent` type strings defined in `daemon/lib/event-bus.ts`.

- REQ-EVRT-6: The config schema extends both `appConfigSchema` (Zod, `lib/config.ts`) and `AppConfig` (TypeScript interface, `lib/types.ts`) with the new fields.

### Config Validation

- REQ-EVRT-7: Channel name references in notification rules must resolve to a defined channel. A rule referencing `channel: "desktop"` when no channel named `desktop` is configured is a config validation error. This validation runs at config parse time via Zod `superRefine`, following the pattern used for model name uniqueness in `appConfigSchema`.

- REQ-EVRT-8: Channel names must be non-empty strings matching `^[a-zA-Z0-9_-]+$` (alphanumeric, hyphens, underscores). This prevents YAML parsing ambiguity and keeps names usable as identifiers.

- REQ-EVRT-9: Shell channels require a non-empty `command` string. Webhook channels require a non-empty `url` string that parses as a valid HTTP or HTTPS URL. These are structural validations in the Zod schema, not runtime checks.

### Router Service

- REQ-EVRT-10: The EventRouter is a daemon service created during startup (`createProductionApp`). It receives the EventBus and parsed config as dependencies. It subscribes to the EventBus once and holds the subscription for the daemon's lifetime.

- REQ-EVRT-11: The router subscribes synchronously to the EventBus (matching the existing subscriber pattern in `daemon/routes/events.ts`). Channel dispatch is asynchronous. The router calls the channel handler without awaiting it, wrapping each dispatch in a try/catch that logs failures. A slow webhook does not block EventBus emission or other subscribers.

- REQ-EVRT-12: When an event arrives, the router evaluates every notification rule against it. A rule matches when:
  1. The rule's `match.type` equals the event's `type`.
  2. If the rule specifies `match.projectName`, the event must have a `projectName` field equal to that value. If the event does not carry `projectName`, the rule does not match (skip, not error).
  3. If the rule does not specify `match.projectName`, the rule matches on `type` alone regardless of whether the event carries `projectName`.

- REQ-EVRT-13: Multiple rules can match the same event. Each match dispatches independently. If two rules route the same event to different channels, both channels fire. If two rules route the same event to the same channel, the channel fires twice. No deduplication.

### Event Provenance

- REQ-EVRT-14: Of the 13 `SystemEvent` variants (as of this spec's writing), three carry `projectName`:
  - `commission_status`: `projectName` is optional (may be undefined).
  - `schedule_spawned`: `projectName` is required.
  - `toolbox_replicate`: `projectName` is required.

  The remaining 10 event types (`commission_progress`, `commission_result`, `commission_artifact`, `commission_manager_note`, `commission_queued`, `commission_dequeued`, `commission_mail_sent`, `mail_reply_received`, `meeting_started`, `meeting_ended`) do not carry `projectName`.

- REQ-EVRT-15: The router does not resolve `projectName` from other identifiers. If a rule matches on `projectName` and the event doesn't carry it, the rule silently skips. No lookup against commission or meeting state. This keeps the router stateless and decoupled from activity services.

- REQ-EVRT-16: If future work adds `projectName` to more event types at the emit site, the router benefits automatically. No router changes needed, only changes to the emit calls. This spec does not require those changes.

### Channel Handlers

- REQ-EVRT-17: Shell channels execute the configured `command` as a child process via `Bun.spawn` (or equivalent). The event is passed as environment variables, not command-line arguments. The following env vars are set for every event:
  - `EVENT_TYPE`: The event's `type` string.
  - `EVENT_JSON`: The full event serialized as JSON.
  - Every top-level string field on the event object is set as `EVENT_<FIELD_NAME>` in SCREAMING_SNAKE_CASE (e.g., `commissionId` becomes `EVENT_COMMISSION_ID`, `projectName` becomes `EVENT_PROJECT_NAME`).

  The command string is passed to the shell (`sh -c`). The channel does not parse or template the command; the user's shell script handles formatting.

- REQ-EVRT-18: Webhook channels POST the full event object as a JSON body to the configured URL. The request uses `Content-Type: application/json`. No authentication headers, custom headers, or request signing in v1. The channel does not transform or template the payload.

- REQ-EVRT-19: Both channel types run with a timeout. Shell commands that don't exit within 10 seconds are killed. Webhook requests that don't complete within 10 seconds are aborted. These are hardcoded defaults, not configurable in v1.

### Failure Handling

- REQ-EVRT-20: Channel failures are logged and dropped. No retry, no dead letter queue, no persistent failure record. The log entry includes: the channel name, the channel type, the event type, and the error message. Log level is `warn` (not `error`, because a failed notification is a degraded experience, not a system failure).

- REQ-EVRT-21: A channel failure does not affect other channels matched by the same event. Each dispatch is independent.

### Logging

- REQ-EVRT-22: The router uses the injectable logger (`Log` interface from `daemon/lib/log.ts`) with tag `"event-router"`. It follows the DI pattern established by REQ-LOG-4 in the injectable-daemon-logger spec.

- REQ-EVRT-23: The router logs at `info` level when: a rule matches an event and dispatch begins. The router logs at `warn` level when: a channel dispatch fails. The router does not log every event received (that's the EventBus's job).

### Dependency Injection

- REQ-EVRT-24: The router is created by a factory function (`createEventRouter`) that accepts dependencies including `EventBus`, config (channels and notification rules), and `Log`. The factory returns a cleanup function (the EventBus unsubscribe callback). This follows the DI pattern used by other daemon services.

- REQ-EVRT-25: When `channels` or `notifications` are absent from config, the factory still returns a valid cleanup function but does not subscribe to the EventBus. No subscription means no overhead for users who don't configure notifications.

## Explicit Non-Goals

- **Package-type channels.** Config entries only. The `lib/packages.ts` discovery system is not touched.
- **Rule matching beyond `type` and `projectName`.** No matching on `status`, `commissionId`, `summary`, or other event fields.
- **Templating or formatting.** Channels receive raw data (env vars or JSON). No template engine, no per-channel format strings.
- **Retry or dead letter logging.** Failures are logged and dropped.
- **Channel authentication.** No auth headers for webhooks, no token management.
- **`projectName` resolution.** The router does not look up project context from commission or meeting IDs.
- **Hot-reload of channel config.** Config is read at startup. Changes require a daemon restart.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Package channels needed | A user needs a channel type that can't be expressed as shell or webhook (Telegram bot, email via SMTP) | New spec for channel package type extending `lib/packages.ts` |
| Finer rule matching | Users need to filter on `status`, `commissionId`, or other event fields | Extend `match` object in config schema |
| Dead letter logging | Users report lost notifications they needed to audit | Add failed dispatch log file (Option C from brainstorm Q3) |
| `projectName` on more events | Rules matching on `projectName` skip too many events | Modify emit sites to include `projectName` on commission/meeting events |

## Success Criteria

- [ ] `channels` and `notifications` fields parse and validate in `config.yaml`
- [ ] Zod schema rejects: unknown channel types, invalid URLs, missing required fields, rules referencing undefined channels, rules with invalid event types
- [ ] Router subscribes to EventBus and dispatches matching events to configured channels
- [ ] Shell channel executes command with event data as environment variables
- [ ] Webhook channel POSTs event JSON to configured URL
- [ ] Rules with `projectName` skip events that don't carry it (no error, no dispatch)
- [ ] Channel failures are logged at warn level and do not affect other dispatches
- [ ] Router is injectable and testable (factory pattern, no global state)
- [ ] Router is inert (no subscription) when no channels or rules are configured
- [ ] All daemon tests pass, including new tests for the router

## AI Validation

**Defaults:**
- Read the full spec before starting implementation.
- Verify every requirement has at least one test.
- Run `bun test` and confirm all tests pass before declaring work complete.

**Structural checks:**
- Confirm `appConfigSchema` in `lib/config.ts` includes channel and notification schemas with cross-reference validation.
- Confirm `AppConfig` in `lib/types.ts` includes the new optional fields matching the Zod schema.
- Confirm the router factory is wired in `createProductionApp()` (`daemon/app.ts`).
- Confirm the router uses `Log` from `daemon/lib/log.ts`, not direct `console` calls.

**Behavioral checks:**
- Test that a shell channel receives correct environment variables for each event field.
- Test that a webhook channel sends the correct JSON body and content type.
- Test that `projectName` matching skips events without the field.
- Test that channel failures are logged but don't propagate.
- Test that an empty config (no channels, no notifications) produces an inert router.
- Test that rules referencing undefined channels fail config validation.
- Test that rules with invalid `match.type` values fail config validation.
