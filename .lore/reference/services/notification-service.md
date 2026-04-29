---
title: Notification Service
date: 2026-04-27
status: current
tags: [notifications, channels, dispatch, tech-debt]
modules: [daemon-services]
---

# Notification Service

## Status: tech debt

The notification service is wired into the daemon (`createProductionApp` builds it, the EventBus + Event Router feed it, shutdown cleans it up) but it has no real use. No project ships with `channels` or `notifications` configured; the service runs as a no-op. It's documented because it exists and is reachable, not because anyone depends on it.

When the feature is actually exercised, this doc is the starting point. Until then, treat anything below as untested-in-production behavior — the contract is what the code says, not what users have observed.

## Inert when unconfigured

If `channels` is empty or `notifications` is empty, the service returns a no-op cleanup function without subscribing to anything. Both have to be set for the service to do anything. A user with channels but no rules, or rules but no channels, gets nothing.

## Two channel types

`shell` runs a command via the platform shell. `webhook` does an HTTP POST. No other types — adding one requires extending the type union and adding a dispatcher.

## Channel resolution is at subscribe time, not dispatch time

`channels[rule.channel]` is looked up once when registering the subscription. A rule pointing to an unknown channel is silently skipped — no subscriber registered. Mid-runtime channel changes don't propagate; config reload would need to tear down the service and create a new one.

## Shell env vars are auto-derived from event fields

Every dispatch builds:

- `EVENT_TYPE` — the event's type field.
- `EVENT_JSON` — full event as JSON.
- `EVENT_<FIELD>` — for each top-level string field, camelCase → SCREAMING_SNAKE_CASE. `commissionId` → `EVENT_COMMISSION_ID`.

Only string fields get individual env vars. Nested objects, arrays, numbers, booleans show up only in `EVENT_JSON`. Merged env is `{...process.env, ...env}` — caller env is preserved, EVENT_* takes precedence.

## Platform shell selection

`shellForPlatform(platform)` returns `["cmd.exe", "/c"]` on Windows, `["sh", "-c"]` elsewhere. Extracted so tests can verify both branches without mocking `process.platform`.

## 10-second timeout per dispatch, fire-and-forget

Shell: `setTimeout` + `proc.kill()`. Webhook: `AbortSignal.timeout(10_000)`. Hard-coded; no per-channel override.

The dispatch runs in a detached `void (async () => ...)()` IIFE. Failures log a warning and discard. There's no retry, no dead-letter queue. When the feature gets real use, retry/DLQ is the obvious first thing it'll need.

## Webhook body is the unfiltered event

JSON, `Content-Type: application/json`, non-2xx throws (and the throw is caught + logged). No filtering or transformation at the channel layer — receivers do their own extraction.

## Cleanup unsubscribes everything

`createNotificationService` returns a function that calls every registered unsubscriber. Daemon shutdown calls it. Without it, a stopped service leaves dead subscribers in the Event Router.
