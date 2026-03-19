---
title: "Event Router: Where It Breaks and What It Becomes"
date: 2026-03-18
status: approved
tags: [brainstorm, event-router, notifications, channels, daemon-service]
modules: [event-bus, packages, config]
related:
  - .lore/brainstorm/growth-surface-2026-03-17.md
---

# Event Router: Where It Breaks and What It Becomes

**Origin:** Proposal 1 in [Growth Surface brainstorm](growth-surface-2026-03-17.md). User asked to explore where it breaks or what it expands into.

**Starting point:** An EventRouter daemon service subscribes to the EventBus, evaluates events against user-defined rules, and dispatches to channel handlers. Channels are a new package type.

---

## Question 1: Does this need to be a package type?

The growth-surface proposal says channels are a new package type (`"channel"`) discovered alongside workers and toolboxes. Each channel exports `notify(event, config) => Promise<void>`.

But the first channel (desktop notifications via `notify-send`) is a shell command. The second likely candidate (a webhook) is a URL + POST. Neither requires the package machinery of discovery, metadata validation, and hot-reloading.

**Option A: Channel packages.** Full package type. Discoverable, versionable, distributable. The channel is a JS/TS module with a typed export. Follows the existing pattern.

**Option B: Channel config entries.** No new package type. Each channel is a config block with a `type` discriminant: `shell` (runs a command with event data as env vars or stdin), `webhook` (POSTs JSON to a URL), or `script` (runs a JS file). Simpler. No package discovery changes. But loses type safety and the package distribution model.

**Option C: Both, layered.** Config entries for simple channels (shell, webhook). Package type for channels that need state, authentication, or complex formatting (Telegram bot, email via SMTP). Config entries are evaluated first, packages second. The router doesn't care which kind it's dispatching to; both conform to the same `notify` interface internally.

**Lean:** Option C. Shell and webhook cover 80% of notification needs without touching the package system. But the architecture should allow packages for the 20% that need more.

---

## Question 2: What does the rule format look like?

The proposal says rules live in config and match on event type + conditions. What does that actually look like in YAML?

```yaml
channels:
  desktop:
    type: shell
    command: "notify-send 'Guild Hall' '$MESSAGE'"

  webhook:
    type: webhook
    url: "https://hooks.example.com/guild-hall"

rules:
  - match:
      type: commission_result
    channel: desktop

  - match:
      type: commission_status
      status: [failed, halted]
    channel: desktop

  - match:
      type: commission_status
      status: failed
      projectName: "guild-hall"
    channel: webhook
```

**Where this gets tricky:** The `match` object needs to express "event type X where field Y equals Z." That's a mini query language. The `SystemEvent` union has 13 variants, each with different fields. A match against `commissionId` is different from a match against `status`.

**Simpler alternative:** Don't build a query language. Match only on `type` (the discriminant) and optionally `projectName` (which most events carry or can be resolved). That's two fields. If the user needs finer filtering, they write a script channel that does its own filtering. Keep the router dumb.

**Lean:** Match on `type` and `projectName` only. Two fields, no query language, covers the primary use case ("tell me when commissions finish in this project").

---

## Question 3: What happens when a channel fails?

`notify-send` can't fail meaningfully. But a webhook can timeout, a Telegram API can rate-limit, an SMTP server can reject. The EventBus is synchronous and fire-and-forget.

**Option A: Log and drop.** Channel failure is logged. Event is gone. The user checks the log if they notice missing notifications. Simple, no state.

**Option B: Retry with backoff.** Failed notifications queue for retry. Needs a retry buffer, backoff logic, and a cap on retries. Adds state and complexity.

**Option C: Dead letter log.** Failed notifications write to a file (`~/.guild-hall/state/notifications/failed.jsonl`). No retry. The user can inspect what was lost. Minimal state, auditable.

**Lean:** Option A for v1 with structured logging. Option C is a natural follow-up if users actually lose notifications they care about. Option B is over-engineering until proven necessary.

---

## Question 4: Should the router be async or synchronous?

The EventBus `emit()` is synchronous. The SSE subscriber does `void stream.writeSSE(...)` (fire-and-forget async). If the router subscribes the same way, channel dispatch is async but the emit call doesn't wait.

This is correct. A webhook that takes 2 seconds to respond should not block commission status transitions. The router subscribes synchronously, dispatches asynchronously, and catches errors internally.

No tension here. The existing pattern handles it.

---

## Question 5: Where does templating live?

The proposal mentions "channel + template." A desktop notification needs a one-line summary. An email needs a subject and body. A webhook needs JSON. These are different formats for the same event.

**Option A: Per-channel templates.** Each channel config includes a template string with variable interpolation. `"Commission {{commissionId}} completed: {{summary}}"`. The router renders the template before dispatching.

**Option B: Per-channel formatters.** Package-type channels export a `format(event) => string` function. Config-type channels get a default format per event type. The router calls the formatter, then dispatches the result.

**Option C: No templating in v1.** The router passes the event object to the channel. Shell channels get env vars (`EVENT_TYPE`, `COMMISSION_ID`, `SUMMARY`). Webhooks get raw JSON. The channel decides how to present it. Templating is a v2 concern.

**Lean:** Option C. Templating is a rabbit hole. Shell scripts can format their own output. Webhooks can post-process. Package channels have full JS. Don't build a template engine when the channels can handle it.

---

## Question 6: Config location

The proposal suggests `config.yaml` or a new `channels.yaml`. The existing config schema has a `settings: Record<string, unknown>` escape hatch, but that's untyped. Adding top-level fields to the config schema is straightforward (Zod schema in `lib/config.ts` is exported and extensible).

**Lean:** Add `channels` and `notificationRules` (or just `notifications`) as new top-level fields in `config.yaml`. Keep everything in one file. A separate `channels.yaml` adds file discovery and merge logic for no benefit at this scale.

---

## What breaks

1. **The "channel" package type touches package discovery.** `lib/packages.ts` discriminates on `type: "worker" | "toolbox" | ["worker", "toolbox"]`. Adding `"channel"` means extending `PackageMetadata`, adding `ChannelMetadata`, updating `discoverPackages()`, and adding filter helpers. If we go with Option C (config entries + packages), this is deferred until someone actually builds a package-type channel.

2. **Event provenance is uneven.** Not all events carry `projectName`. `meeting_ended` has only `meetingId`. `commission_progress` has `commissionId` but no `projectName`. If rules match on `projectName`, the router needs to resolve it from the ID. That means the router needs access to commission/meeting state, or events need to carry `projectName` consistently. The latter is the cleaner fix but requires touching every emit site.

3. **Config validation timing.** Channel references in rules need to resolve to actual channels. If a rule references `desktop` but no channel named `desktop` is configured, that's a config error. Validation happens at daemon startup, not at event time. But what about package-type channels that fail to load? The router needs to handle "channel was configured but isn't available" gracefully at runtime too.

---

## What it becomes

The minimal useful version is:

- **Router service** (~100-150 lines): subscribes to EventBus, evaluates rules, dispatches async.
- **Two config blocks** in `config.yaml`: `channels` (named channel definitions) and `notifications` (rules mapping event types to channels).
- **Two built-in channel types**: `shell` (runs a command) and `webhook` (POSTs JSON).
- **Match on two fields**: event `type` and `projectName` (when present on the event).
- **Failure handling**: log and drop.
- **No templating**: channels receive event data as env vars (shell) or JSON (webhook).

The package-type channel system, templating, retry logic, and finer rule matching are all natural extensions but none are needed to solve the core problem: "tell me when a commission finishes."
