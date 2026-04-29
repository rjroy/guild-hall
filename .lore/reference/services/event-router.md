---
title: Event Router
date: 2026-04-27
status: current
tags: [event-router, eventbus, filtering, tech-debt]
modules: [daemon-services]
---

# Event Router

## Status: tech debt (same as notification-service)

The Event Router exists and is wired into the daemon, but its only consumer today is the notification service — which isn't configured anywhere in production. The path is reachable; nothing actually exercises it. Documented because it exists. When notifications get real use, this is the matching layer underneath.

## Single bus subscription, fan-out to many handlers

`createEventRouter` subscribes to the EventBus once and walks its own `subscriptions[]` array on every event. New `router.subscribe(rule, handler)` calls push to the array; the returned per-subscription unsubscribe splices it out. The router is a 1:N filter layer between the bus's set-based pub/sub and consumers that want rule-based subscriptions.

## Three-field match rule

`{type, projectName?, fields?}`:

- `type` is required and matches against the event's `type` field exactly. The router's `SystemEventType` union is the closed set of valid values.
- `projectName` is optional. When set, the event must have a `projectName` field with that exact string. Events whose type carries no `projectName` (e.g., raw queue events) silently fail the match.
- `fields` is optional. Each entry is a glob pattern matched against the stringified value of that event field.

A rule with only `type` matches every event of that type. Adding `projectName` filters by project. `fields` is the catch-all for anything else (commission ID prefixes, worker name patterns, etc.).

## `fields` uses micromatch globs, not regex

`commission-dalton-*` works for "match any commission ID starting with `commission-dalton-`." `*` is "anything." Invalid patterns are caught, logged as warnings, and treated as no-match — a typo in a config file produces no notifications rather than crashing the dispatch loop.

The check is `key in eventRecord` so missing keys fail the match. Falsy values are stringified — a literal `false` field stringifies to `"false"` and pattern-matches against that.

## Fire-and-forget handlers, sync OR async

Sync handler throws → caught, logged, continue with the next subscription. Async handler rejects → `.then(undefined, errback)` catches the rejection, logs, continues. Other handlers for the same event still run. The router never propagates handler failures to callers.

## Two cleanup levels

`createEventRouter` returns `{router, cleanup}`. `cleanup()` detaches the entire router from the EventBus. Per-subscription `unsubscribe` (returned by `router.subscribe(...)`) just removes that one entry from the subscriptions array.

The daemon stores `cleanup` and calls it during shutdown via `cleanupRouter()` alongside the notification service's own cleanup. Without `cleanup`, a stopped router keeps receiving events on the EventBus.

## No ordering guarantees beyond insertion

Subscriptions fire in registration order. Two rules that both match an event both run — one doesn't shadow the other. There's no priority field, no exclusive-handler semantics. When handlers have side effects that compete (e.g., two channels for the same event type), that's the consumer's design problem.
