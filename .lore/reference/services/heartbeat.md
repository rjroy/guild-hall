---
title: Heartbeat
date: 2026-04-27
status: current
tags: [heartbeat, autonomous, standing-orders, condensation, dispatcher]
modules: [daemon-services-heartbeat, daemon-routes]
---

# Heartbeat

## What it is

A daemon-owned timer loop that pulses every hour (default), reads each registered project's `.lore/heartbeat.md`, and runs a constrained Guild Master session that evaluates standing orders and creates commissions. Workers and the user share the file as a live instruction surface; the daemon owns the loop.

## Post-completion scheduling, not setInterval

`scheduleNext` runs `runCycle()` and then schedules the next tick via `setTimeout` from the moment the cycle finished. This is the same pattern as `briefing-refresh.ts`. Two reasons:

- A long cycle doesn't queue overlapping ticks (which `setInterval` would).
- The rate-limit branch can schedule its own backoff timer without conflicting with the regular interval; `scheduleNext` only sets a regular-interval timer when `pendingTimer === null`.

`heartbeatIntervalMinutes` (default 60) sets the regular interval. `heartbeatBackoffMinutes` (default 300) sets the rate-limit backoff. The first tick happens after the regular interval, not at startup — REQ-HBT-7 — so daemon restarts don't trigger a flurry of catch-up runs.

## Rate-limit aborts the entire cycle, not just the project

`runCycle` walks projects sequentially. A project hitting a rate-limit returns `{ success: false, isRateLimit: true }`; `runCycle` returns immediately and schedules the backoff timer. The reasoning: rate limits are API-global, so pushing on to the next project compounds the throttle.

Per-project errors that aren't rate limits log + continue. The cycle still tries every other project.

## Tick-trigger condition: `hasContentBelowHeader`

The heartbeat file always exists (the daemon ensures it on startup) and always has the instructional header. A file with only the header — no orders, watch items, context notes, or activity below the first `## ` — is skipped. Without this guard, every tick spends Guild Master tokens reading "this file controls what the guild does autonomously" with nothing to do.

## `ensureHeartbeatFile` repairs the header on every startup

The daemon reads each project's heartbeat file at startup. The instructional preamble is replaced from the canonical template; everything from the first `##` onward is preserved. Goal: the user or a worker cannot drift the preamble out of sync — the daemon owns the instructional surface, the file owns the user-managed sections.

If no `##` heading exists at all, the entire file is replaced with the template (rare; only when a worker overwrote the whole file).

## Heartbeat sessions use Haiku by default

`config.systemModels.heartbeat` overrides; the fallback is `"haiku"`. Heartbeat runs hourly across N projects, so cost matters. Haiku-class models are also a deliberate constraint on what the dispatcher session can attempt — there's no opus-grade reasoning happening here, just "evaluate this list and dispatch what's clearly actionable."

## The session uses the Guild Master with a custom prompt

`runHeartbeatSession` activates the Guild Master worker but overrides the standard manager posture with `HEARTBEAT_SYSTEM_PROMPT`. The override changes the GM's mode from interactive assistant to dispatcher: evaluate standing orders, create commissions for what's clearly actionable, skip ambiguous orders rather than guess, watch out for redundancy with Recent Activity, and consider commissioning a cleanup if the file has grown unwieldy.

`activationExtras: { managerContext: "" }` blanks the system-state context that a regular GM session would receive. The dispatcher reads only the heartbeat file; the broader project state isn't load-bearing for it.

## System toolboxes are stripped at activation

`wrappedPrepDeps.resolveToolSet` rebuilds the worker metadata with `systemToolboxes: []` and attaches a heartbeat-specific MCP server. The dispatcher gets three coordination tools — `create_commission`, `dispatch_commission`, `initiate_meeting` — plus the read-only base toolbox tools (`read_memory`, `project_briefing`, `list_guild_capabilities`). The full manager toolbox (`create_pr`, `add_commission_note`, `sync_project`, etc.) is intentionally absent. A heartbeat tick can dispatch work; it cannot push branches or modify project state.

## `create_commission` auto-injects `source.description` (REQ-HBT-22)

The dispatcher tool requires `source_description` as a parameter and passes it through to `commissionSession.createCommission(... { source: { description } })`. The artifact records which standing order triggered the commission. Without this, post-hoc tracing of "which order spawned this work?" is guesswork.

## Session uses `noopEventBus`

The manager toolbox emissions inside the heartbeat session are silenced. The actual commissions created during the tick still emit through `commissionSession`'s regular flow (which has a real EventBus). The `noopEventBus` here just suppresses the activation-time / tool-execution-time emissions of the dispatcher session itself, which are operational noise.

## `maxTurns: 30`

Hard cap on the dispatcher session. A heartbeat tick that doesn't decide what to do in 30 turns is doing too much; the cap keeps cost predictable across hourly runs.

## `contextId` is per-tick

`heartbeat-{projectName}-{tickTimestamp}`. Each tick gets its own decisions directory under `state/heartbeats/`. There is no state that survives across ticks — the in-memory `lastTicks` map records timestamp + commissions-created for the status route, and is wiped on daemon restart.

## Recent Activity is daemon-managed

`## Recent Activity` is the section the daemon writes into. The condensation subscriber appends terminal-event lines as commissions and meetings finish; the heartbeat tick reads them as context; a successful tick clears the section via `clearRecentActivity`. The user is told (in the template) not to edit this section by hand.

`appendToSection` handles missing or empty sections — if a worker stripped `## Recent Activity` from the file, the next event recreates it before any other section heading.

## Condensation subscribes to terminal events only (REQ-HBT-15/16)

Three event types produce activity lines:

- `commission_status` with status in `{completed, failed, cancelled, abandoned}`. Other commission statuses (progress, dispatched, in_progress, queued) are excluded — they're operational noise that would saturate the section between ticks.
- `commission_result` — adds `result: <truncated summary>` (200-char cap).
- `meeting_ended`.

Lines are formatted as `- HH:MM <text>`. The timestamp is local time, two-digit zero-padded.

## Per-project write serialization (REQ-HBT-17)

`writeQueues: Map<projectName, Promise<void>>`. Each event's append is chained onto the project's queue. Two events for the same project, fired concurrently, never race; events for different projects run independently. Without the per-project queue, simultaneous appends would interleave file content and corrupt the section.

## Project resolution falls back to state files

`commission_status` carries `projectName` directly when the lifecycle emits it. `commission_result` and `meeting_ended` don't, so the condenser reads `state/commissions/<id>.json` or `state/meetings/<id>.json` to find the project name. Missing state file → silently skip the entry. The state files are still around at this point (they're cleaned up after the lifecycle finishes recording the terminal event).

## `add_heartbeat_entry` is in the base toolbox

Every worker (not just the Guild Master) can append to Standing Orders, Watch Items, or Context Notes in the project's heartbeat file. This makes the file a shared instruction surface — workers leave standing orders for follow-up work; the user edits between ticks; the heartbeat tick reads the live state.

The base tool restricts the section enum to those three names; Recent Activity is excluded because workers writing to it would race with the condensation subscriber.

## Manual tick route

`POST /heartbeat/{projectName}/tick` calls `tickProject(name)`. Same `tickSingleProject` path as the cycle; respects the same rate-limit detection. Manual ticks don't disturb the running cycle's schedule — they're independent invocations.

`getLastTick(projectName)` returns the in-memory state for the status route: `{ timestamp, commissionsCreated }`. Missing → never ticked (or last tick was before daemon restart).

## `service.stop()` unsubscribes condensation

Without the unsubscribe, a stopped service would still write activity entries to disk on every event. `stop()` clears the pending timer and calls the registered `unsubscribeCondensation` returned at construction time. Daemon shutdown calls `stop()` via the lifecycle in `app.ts`.
