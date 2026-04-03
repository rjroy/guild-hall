---
title: Heartbeat Commission Dispatch
date: 2026-04-03
status: draft
tags: [commissions, heartbeat, scheduling, automation, haiku, simplification]
modules: [daemon-heartbeat, manager-toolbox, commission-orchestrator, event-bus]
related:
  - .lore/brainstorm/heartbeat-commission-dispatch.md
  - .lore/issues/redo-schedule-trigger-commissions.md
  - .lore/specs/commissions/guild-hall-scheduled-commissions.md
  - .lore/specs/commissions/triggered-commissions.md
  - .lore/specs/commissions/guild-hall-commissions.md
  - .lore/specs/infrastructure/event-router.md
req-prefix: HBT
---

# Spec: Heartbeat Commission Dispatch

## Overview

The heartbeat replaces both the scheduled commission system (~900 lines in `daemon/services/scheduler/`) and the triggered commission system (~300 lines in `daemon/services/trigger-evaluator.ts`) with a single mechanism: a per-project markdown file of standing instructions evaluated by a Guild Master session on Haiku at a configurable interval.

Instead of cron expressions and event-match rules frozen in YAML schemas, the user writes natural-language standing orders in `.lore/heartbeat.md`. Between ticks, the daemon appends condensed activity summaries from the EventBus. On each tick, Haiku reads the standing orders plus recent activity and decides which orders warrant new commissions. Trust markers (`[auto]`/`[confirm]`) on each order control whether commissions dispatch immediately or await user approval.

This spec covers: the heartbeat file format, the daemon loop, the GM session, event condensation, provenance, file scaffolding, dashboard UI, configuration, removal of the scheduler and trigger infrastructure, migration, and `CommissionType` simplification.

Supersedes: [Spec: Guild Hall Scheduled Commissions](commissions/guild-hall-scheduled-commissions.md) (SCOM), [Spec: Triggered Commissions](commissions/triggered-commissions.md) (TRIG).

Depends on: [Spec: Guild Hall Commissions](commissions/guild-hall-commissions.md) for one-shot commission lifecycle and creation API. [Spec: Event Router](infrastructure/event-router.md) for EventBus subscription (event condensation subscribes to the bus; the router itself is retained for notifications).

## Entry Points

- User writes standing orders in `.lore/heartbeat.md` via the artifact browser (from artifact editing UX)
- Daemon heartbeat loop ticks and evaluates standing orders per project (from daemon timer)
- User clicks `[Tick Now]` on the dashboard to trigger an immediate heartbeat evaluation (from dashboard UI)
- Daemon starts up and ensures `heartbeat.md` exists with instructional header (from project initialization)
- EventBus emits a system event; the condensation subscriber appends a summary line (from event bus)

## Requirements

### Heartbeat File Format

- REQ-HBT-1: Each registered project has a `heartbeat.md` file at `.lore/heartbeat.md`. The file is plain markdown, version-controlled with the project. It is the single interface for defining what the guild should do autonomously.

- REQ-HBT-2: The file has an instructional header followed by four sections, each introduced by a level-2 heading:

  **Instructional header** (everything before the first `##`): usage instructions explaining what the file is, how standing orders work, and how trust markers behave. Written by the daemon on scaffolding, never consumed by the heartbeat session.

  **`## Standing Orders`**: each line is a standing instruction. Lines beginning with `- ` are orders. Trust markers appear at the start of the order text:
     - `[auto]`: commission is created and dispatched immediately.
     - `[confirm]`: commission is created in `pending` status for user review.
     - No marker: defaults to `[confirm]`.

     Example:
     ```markdown
     ## Standing Orders
     - [auto] After any Dalton implementation, dispatch a Thorne review
     - [confirm] If test count has decreased since last week, investigate
     - Check for stale draft specs monthly
     ```

  **`## Watch Items`**: things to monitor but not necessarily act on. Haiku reads these as context that shapes judgment but does not create commissions from them directly.

  **`## Context Notes`**: operational context the heartbeat session should know (merge freezes, experimental features, etc.). Read by Haiku, not acted on as orders.

  **`## Recent Activity`**: daemon-managed section. Event condensation appends summaries here between ticks. The daemon clears this section after each tick.

- REQ-HBT-3: The daemon does not parse the file structurally beyond checking whether content exists below the instructional header. Haiku reads the raw markdown and interprets it. The section headings are conventions for the user and the GM session prompt, not schema-enforced boundaries.

### Heartbeat Daemon Loop

- REQ-HBT-4: The daemon runs a heartbeat loop on a configurable interval (REQ-HBT-28). On each tick, it iterates all registered projects sequentially. For each project:
  1. Reads `.lore/heartbeat.md` from the integration worktree.
  2. Checks whether any content exists below the instructional header. If the file contains only the header (or doesn't exist), the project is skipped. Zero cost.
  3. Runs a constrained Guild Master session on Haiku (REQ-HBT-8).
  4. Processes the session's commission requests (REQ-HBT-12).
  5. Clears the `## Recent Activity` section (REQ-HBT-20).

- REQ-HBT-5: The loop uses post-completion scheduling (same pattern as `createBriefingRefreshService` in `daemon/services/briefing-refresh.ts`). After all projects are evaluated, the next tick is scheduled after the configured interval. This prevents pile-up if a tick takes longer than the interval.

- REQ-HBT-6: Error handling per project: if the heartbeat session fails for a project (SDK error, rate limit, timeout), the daemon logs the error at `warn` level and moves to the next project. No retry. Rate-limit errors are expected (subscription users hitting hourly caps) and should not be treated as exceptional. The `## Recent Activity` section is NOT cleared on failure, so the context is preserved for the next tick.

- REQ-HBT-7: On daemon startup, the heartbeat loop starts after the briefing refresh service. No catch-up logic. If the daemon was down, the first tick happens at the configured interval after startup. Standing orders are not time-sensitive enough to warrant immediate evaluation on restart.

### Heartbeat GM Session

- REQ-HBT-8: The heartbeat session uses the Guild Master worker identity, activated through the standard `prepareSdkSession` + `runSdkSession` pipeline (same pattern as `generateWithFullSdk` in `daemon/services/briefing-generator.ts`). The model is Haiku (configurable via `systemModels.heartbeat` in `~/.guild-hall/config.yaml`, defaulting to `"haiku"`).

- REQ-HBT-9: The session's system prompt constrains the GM to heartbeat dispatcher mode:
  - Read the standing orders and recent activity.
  - For each standing order, decide whether it warrants a new commission right now.
  - Consider watch items and context notes when making decisions.
  - If an order is ambiguous (the instruction itself is unclear or contradictory), skip it entirely.
  - If the order is clear but the context is insufficient to know whether action is warranted, create the request with `confirm` trust regardless of the order's marker.
  - Do not modify the heartbeat file, propose architectural changes, or expand scope.
  - Check recent activity for evidence that an order has already been acted on. If a commission for the same order was created recently, skip it.

- REQ-HBT-10: The session has access to a constrained tool set. The GM's system toolboxes are stripped (same approach as the briefing's `makeBriefingResolveToolSet`), then replaced with a heartbeat-specific toolbox containing:
  - **`create_heartbeat_commission`**: creates a commission request (not direct commission creation). Parameters: `worker` (string), `title` (string), `prompt` (string), `trust` (`"auto"` | `"confirm"`), `standing_order` (the original order text that prompted this request), `activity_context` (the activity line that triggered it, if any).
  - **Read-only project state tools**: the base toolbox's `read_memory` and `project_briefing` tools, so Haiku can check what's already in progress.

  The session does NOT have access to `create_commission`, `dispatch_commission`, `initiate_meeting`, or any other manager coordination tools.

- REQ-HBT-11: The session receives the heartbeat file content as the user prompt. The system prompt provides the behavioral constraints. `maxTurns` is set to 30 (sufficient for reading the file and making tool calls, but bounded). `contextId` is `heartbeat-{projectName}-{tickTimestamp}` (unique per tick, no conversation continuity across ticks). Each tick is a fresh evaluation with no memory of prior ticks.

### Commission Request Processing

- REQ-HBT-12: The heartbeat session's `create_heartbeat_commission` tool calls are collected after the session completes. Each call becomes a commission request. The daemon processes requests sequentially:

  1. Validate the `worker` field against discovered worker packages. Skip if unknown (log at `warn`).
  2. Determine effective trust: if the request's `trust` is `"auto"` AND the corresponding standing order has `[auto]`, use `auto`. Otherwise, use `confirm`. Haiku can downgrade but never upgrade trust.
  3. Create the commission via the existing `createCommission` API on `CommissionSessionForRoutes`, with `type: "one-shot"` and `heartbeat_source` provenance (REQ-HBT-21).
  4. If effective trust is `auto`, dispatch immediately via the existing dispatch path. If `confirm`, leave in `pending` status.

- REQ-HBT-13: Trust validation works by comparing the request's `standing_order` field against lines in `## Standing Orders`. For each line marked `[auto]`, the daemon extracts the order text (everything after `[auto] `, trimmed). The `standing_order` field from Haiku's request is also trimmed. A match is exact equality (case-insensitive) between the extracted line text and the request's `standing_order`. If no matching `[auto]` line is found, effective trust is `confirm` regardless of what Haiku requested. This prevents a compromised or confused model from auto-dispatching work the user hasn't explicitly trusted.

### Event Condensation

- REQ-HBT-14: An EventBus subscriber appends condensed activity summaries to the `## Recent Activity` section of each project's `heartbeat.md`. The subscriber is registered at daemon startup, alongside the notification service and triage subscribers.

- REQ-HBT-15: Not all events are condensed. The following event types produce activity lines:

  | Event Type | Summary Format |
  |------------|----------------|
  | `commission_status` (terminal: completed, failed, cancelled, abandoned) | `{commissionId} {status}` |
  | `commission_result` | `{commissionId} result: {summary}` (truncated to 200 chars) |
  | `meeting_ended` | `Meeting {meetingId} ended` |

  Events that are operational noise (progress updates, queued/dequeued, artifact additions, manager notes, in-progress status changes) are excluded. The goal is outcomes, not play-by-play.

- REQ-HBT-16: Each activity line is prefixed with a timestamp in `HH:MM` format (local time) and appended as a markdown list item:
  ```markdown
  - 14:32 commission-Dalton-20260401-140000 completed
  - 14:45 commission-Thorne-20260401-143000 result: 2 findings, 0 critical (truncated...)
  ```

- REQ-HBT-17: The subscriber writes to the integration worktree's copy of `heartbeat.md`. The write appends to the `## Recent Activity` section. If the section doesn't exist, the subscriber creates it at the end of the file.

- REQ-HBT-18: Event condensation is scoped to the event's `projectName`. Events without a `projectName` (e.g., `meeting_ended`) are matched to a project by looking up the meeting/commission ID in state files. If the project cannot be determined, the event is dropped.

- REQ-HBT-19: The subscriber filters events by project to avoid writing cross-project activity into a project's heartbeat file. Only events belonging to the project are written.

- REQ-HBT-20: After each successful heartbeat tick for a project, the daemon clears the `## Recent Activity` section (replaces its contents with an empty list). This prevents unbounded growth and ensures each tick sees only activity since the last tick.

### Provenance

- REQ-HBT-21: Commissions created by the heartbeat carry a `heartbeat_source` block in their YAML frontmatter:

  ```yaml
  heartbeat_source:
    prompt: "After any Dalton implementation, dispatch a Thorne review"
    activity: "commission-Dalton-20260401-140000 completed"
    tick: "2026-04-01T15:00:00.000Z"
  ```

  | Field | Type | Purpose |
  |-------|------|---------|
  | `prompt` | string | The standing order text that caused this commission |
  | `activity` | string or null | The activity line that triggered the order, if identifiable |
  | `tick` | string (ISO 8601) | Timestamp of the heartbeat tick that created this commission |

- REQ-HBT-22: The `heartbeat_source` block is written by the `createCommission` call. The creation API gains a new optional field in its `options` parameter:

  ```typescript
  options?: {
    heartbeatSource?: {
      prompt: string;
      activity: string | null;
      tick: string;
    };
  }
  ```

  This replaces the existing `sourceSchedule` and `sourceTrigger` options, which are removed (REQ-HBT-34).

- REQ-HBT-23: No depth tracking or mechanical loop prevention. Deduplication is Haiku's responsibility: the system prompt instructs it to check recent activity for evidence that an order has already been acted on. If a matching commission was created in the most recent tick's activity, skip the order. If deduplication proves unreliable in practice, a simple daemon-side check can be added later: before creating a commission, search recent commissions for one with a matching `heartbeat_source.prompt` in the last N hours.

- REQ-HBT-24: The `activity_timeline` entry for heartbeat-created commissions records: `"Commission created by heartbeat (standing order: {prompt text})"`.

### File Scaffolding

- REQ-HBT-25: When the daemon initializes a project (reads its config and sets up the integration worktree), it checks whether `.lore/heartbeat.md` exists. If not, it creates it with the instructional header and empty section headings. If the file exists, the daemon does not modify it.

- REQ-HBT-26: The scaffolded file content. The instructional header (everything before the first `##`) explains usage. The sections below are bare headings with no content, ready for the user to populate:

  ```markdown
  # Heartbeat

  This file controls what the guild does autonomously. Every hour (configurable),
  a Guild Master session reads this file and decides which standing orders warrant
  new commissions.

  **Standing Orders** are lines starting with `- `. Add trust markers to control dispatch:
  - `[auto]` dispatches immediately without your approval
  - `[confirm]` (or no marker) creates the commission for your review

  **Watch Items** are things to monitor. The guild reads these for context but won't
  create commissions from them directly.

  **Context Notes** are operational context the guild should know (merge freezes, priorities).

  **Recent Activity** is managed by the daemon. Don't edit this section manually.

  ## Standing Orders

  ## Watch Items

  ## Context Notes

  ## Recent Activity

  ```

### Dashboard UI

- REQ-HBT-27: The dashboard's project row gains a `[Tick Now]` button alongside existing project actions. Clicking it triggers an immediate heartbeat evaluation for that project via `POST /heartbeat/{projectName}/tick` on the daemon. The button is disabled while a tick is in progress (optimistic UI, re-enabled on response). The button shows a small indicator of the standing order count (number of `- ` prefixed lines in `## Standing Orders`) as a quick signal of payload weight. No indicator is shown when the count is zero.

### Configuration

- REQ-HBT-28: The heartbeat interval is configured in `~/.guild-hall/config.yaml` as `heartbeatIntervalMinutes`. Type: positive integer. Default: 60 (1 hour). Minimum: 5 (to prevent abuse of Haiku calls). The config schema in `lib/config.ts` validates this field with `z.number().int().min(5).optional()`.

- REQ-HBT-29: The heartbeat model is configured via `systemModels.heartbeat` in `~/.guild-hall/config.yaml`. Default: `"haiku"`. This follows the same pattern as `systemModels.briefing`. The `SystemModels` interface in `lib/types.ts` gains a `heartbeat?: string` field, and the `systemModelsSchema` in `lib/config.ts` gains `heartbeat: z.string().min(1).optional()`. If the user wants more capable evaluation, they set it to `"sonnet"`.

### Daemon Routes

- REQ-HBT-30: The daemon gains a `POST /heartbeat/{projectName}/tick` route that triggers an immediate heartbeat evaluation for the specified project. Returns `{ triggered: true }` on success, `{ error: "..." }` on failure. This is the backend for the `[Tick Now]` button.

- REQ-HBT-31: The daemon gains a `GET /heartbeat/{projectName}/status` route that returns the heartbeat state for a project: whether the file has content, the number of standing order lines, the timestamp of the last tick, the number of commissions created in the last tick, and the configured interval. Last-tick state is in-memory only (lost on daemon restart, which is acceptable since the next tick will run on schedule). The dashboard calls this route to populate the content-size indicator on the `[Tick Now]` button.

### Removal: Scheduler Infrastructure

- REQ-HBT-32: The following files are removed entirely:

  **Daemon services:**
  - `daemon/services/scheduler/index.ts` (SchedulerService class)
  - `daemon/services/scheduler/cron.ts` (cron parsing and next-occurrence logic)
  - `daemon/services/scheduler/schedule-lifecycle.ts` (schedule status transitions)

  **Tests:**
  - `tests/daemon/services/scheduler/scheduler.test.ts`
  - `tests/daemon/services/scheduler/cron.test.ts`
  - `tests/daemon/services/scheduler/schedule-lifecycle.test.ts`

  **Web components:**
  - `web/components/commission/CommissionScheduleInfo.tsx`
  - `web/components/commission/CommissionScheduleInfo.module.css`
  - `web/components/commission/CommissionScheduleActions.tsx`
  - `web/components/commission/CommissionScheduleActions.module.css`

  **API routes:**
  - `web/app/api/commissions/[commissionId]/schedule-status/route.ts`

### Removal: Trigger Infrastructure

- REQ-HBT-33: The following files are removed entirely:

  **Daemon services:**
  - `daemon/services/trigger-evaluator.ts`
  - `daemon/services/commission/trigger-lifecycle.ts`

  **Tests:**
  - `tests/daemon/services/trigger-evaluator.test.ts`
  - `tests/daemon/services/trigger-evaluator-service.test.ts`
  - `tests/components/trigger-form-data.test.ts`

  **Web components:**
  - `web/components/commission/TriggerInfo.tsx`
  - `web/components/commission/TriggerInfo.module.css`
  - `web/components/commission/TriggerActions.tsx`
  - `web/components/commission/TriggerActions.module.css`
  - `web/components/commission/trigger-form-data.ts`

  **API routes:**
  - `web/app/api/commissions/[commissionId]/trigger-status/route.ts`

### Removal: Shared Infrastructure

- REQ-HBT-34: The following types and interfaces are removed from `daemon/types.ts`:
  - `CommissionType` union (REQ-HBT-36 explains the replacement)
  - `TriggeredBy` interface
  - `TriggerBlock` interface
  - `ScheduledCommissionStatus` type

- REQ-HBT-35: The following are removed from `daemon/services/commission/record.ts`:
  - `ScheduleMetadata` interface
  - `readScheduleMetadata` method and implementation
  - `writeScheduleFields` method and implementation
  - `readTriggerMetadata` method and implementation
  - `writeTriggerFields` method and implementation
  - `readTriggeredBy` method and implementation
  - The import of `TriggerBlock` and `TriggeredBy` from `daemon/types`

- REQ-HBT-36: The following are removed from manager toolbox (`daemon/services/manager/toolbox.ts`):
  - `create_scheduled_commission` tool handler and schema
  - `update_schedule` tool handler and schema
  - `create_triggered_commission` tool handler and schema
  - `update_trigger` tool handler and schema

- REQ-HBT-37: The following are removed from `daemon/app.ts`:
  - `scheduleLifecycleRef` and its wiring
  - `triggerEvaluatorRef` and its wiring
  - Dynamic imports of `scheduler/schedule-lifecycle`, `scheduler/index`, and `trigger-evaluator`
  - `scheduler.catchUp()`, `scheduler.start()`, `scheduler.stop()` calls
  - `triggerEvaluator.initialize()`, `triggerEvaluator.shutdown()` calls
  - The `createScheduledCommission` and `createTriggeredCommission` methods on `CommissionSessionForRoutes`

- REQ-HBT-38: The following are removed from `daemon/routes/commissions.ts`:
  - `POST /commission/schedule/commission/update` route
  - `POST /commission/trigger/commission/update` route
  - Schedule info parsing block (the `scheduleInfo` variable and its population from `parsed.data.schedule`)
  - Trigger info parsing block (the `triggerInfo` variable and its population from `parsed.data.trigger`)
  - The import of `nextOccurrence` from `daemon/services/scheduler/cron`
  - Commission creation branches for `type === "scheduled"` and `type === "triggered"` in the POST handler

- REQ-HBT-39: The following are removed from `daemon/services/commission/orchestrator.ts`:
  - `createScheduledCommission` method and its YAML template
  - `createTriggeredCommission` method and its YAML template
  - `sourceSchedule` and `sourceTrigger` from the `createCommission` options type
  - The `sourceScheduleLine` and `triggeredByBlock` construction in `createCommission`
  - The import of `isValidCron` from `daemon/services/scheduler/cron`
  - The import of `TRIGGER_STATUS_TRANSITIONS` from `daemon/services/commission/trigger-lifecycle`

- REQ-HBT-40: The `schedule_spawned` event type is removed from `SystemEvent` in `daemon/lib/event-bus.ts` and from `SYSTEM_EVENT_TYPES` in `lib/types.ts`. No new event types are added. The heartbeat creates commissions through the existing `createCommission` path, which already emits `commission_status` events.

- REQ-HBT-41: The following are modified in web components:
  - `CommissionView.tsx`: remove conditional rendering of `CommissionScheduleInfo`, `CommissionScheduleActions`, `TriggerInfo`, and `TriggerActions` panels.
  - `CommissionList.tsx`: remove the "Recurring" and "Trigger" labels, remove `source_schedule` and `triggered_by` link rendering.
  - `CommissionHeader.tsx`: remove schedule/trigger-specific header content (cron display, trigger status).
  - `CommissionForm.tsx` and `CommissionForm.module.css`: remove the schedule/trigger creation tabs and their form fields.

### Removal: Shared Types and Parsing

- REQ-HBT-41a: The following are modified in `lib/commissions.ts`:
  - Remove `sourceSchedule` and `sourceTrigger` fields from the `Commission` interface.
  - Remove the `extractSourceTrigger` function.
  - Remove parsing of `source_schedule` and `triggered_by` frontmatter fields.
  - Add `heartbeatSource` field (type `{ prompt: string; activity: string | null; tick: string } | null`) and parse it from `heartbeat_source` frontmatter.

- REQ-HBT-41b: The commission detail page at `web/app/projects/[name]/commissions/[id]/page.tsx` is modified:
  - Remove the `scheduleInfo` and `triggerInfo` build blocks.
  - Remove conditional rendering that passes these to `CommissionScheduleInfo`, `CommissionScheduleActions`, `TriggerInfo`, and `TriggerActions`.
  - Optionally add display of `heartbeatSource` provenance (standing order text and tick timestamp) if the commission has one.

### CommissionType Simplification

- REQ-HBT-42: The `CommissionType` union in `daemon/types.ts` (`"one-shot" | "scheduled" | "triggered"`) is removed entirely. All commissions are one-shot. The `type` field in commission artifact frontmatter becomes unnecessary: existing artifacts with `type: one-shot` continue to parse correctly (the field is ignored), and new commissions omit it.

- REQ-HBT-43: The `readType` method on `CommissionRecordOps` is removed. Any code that branches on commission type (`if (type === "scheduled")`, `if (type === "triggered")`) is simplified to remove the dead branches.

- REQ-HBT-44: Existing commission artifacts with `type: scheduled` or `type: triggered` in their frontmatter become historical. They are not automatically cleaned up. The `type` field is harmless (unknown frontmatter fields are ignored by gray-matter). If a `tend` sweep encounters them, it can flag them for manual removal.

### HeartbeatSource in Commission Record

- REQ-HBT-45: The `CommissionRecordOps` interface gains a new method:

  ```
  readHeartbeatSource(artifactPath: string): Promise<HeartbeatSource | null>
  ```

  Where `HeartbeatSource` is:
  ```typescript
  interface HeartbeatSource {
    prompt: string;
    activity: string | null;
    tick: string;
  }
  ```

  This replaces `readTriggeredBy`. The implementation reads the `heartbeat_source` YAML block from commission frontmatter.

### Migration

- REQ-HBT-46: Existing scheduled commissions with `status: active` or `status: paused` are not automatically converted. Migration is manual: the user reads their active schedules and writes equivalent standing orders in `heartbeat.md`. The spec retirement (REQ-HBT-48) provides guidance.

- REQ-HBT-47: Existing triggered commissions with `status: active` or `status: paused` are not automatically converted. Same manual migration: read the trigger's match rule and prompt, write an equivalent natural-language standing order. The heartbeat is more expressive (natural language vs. YAML schemas), so most triggers translate directly.

  Example migration:
  ```yaml
  # Trigger artifact (old):
  trigger:
    match:
      type: commission_status
      fields:
        status: completed
        commissionId: "commission-Dalton-*"
    approval: auto
  prompt: "Review the work from commission {{commissionId}}."
  ```
  becomes:
  ```markdown
  # Standing order (new):
  - [auto] After any Dalton implementation completes, dispatch a Thorne review of the completed commission
  ```

### Spec Retirement

- REQ-HBT-48: The following specs are moved to `.lore/specs/_abandoned/` with status set to `superseded`:
  - `.lore/specs/commissions/guild-hall-scheduled-commissions.md`
  - `.lore/specs/commissions/triggered-commissions.md`
  - `.lore/specs/ui/triggered-commission-creation-ux.md` (if it exists)

### Daemon Wiring

- REQ-HBT-49: The heartbeat service is wired in `createProductionApp()` in `daemon/app.ts`. It is constructed after the briefing refresh service and before the outcome triage service. It receives:
  - The SDK `queryFn` and `prepDeps` (for running GM sessions)
  - All discovered packages (for worker validation)
  - The `AppConfig` (for interval and model config)
  - `guildHallHome` (for path resolution)
  - The `EventBus` (for the condensation subscriber)
  - The `CommissionSessionForRoutes` (for creating and dispatching commissions)
  - A `Log` instance

- REQ-HBT-50: The event condensation subscriber is registered during heartbeat service construction, not separately. The service owns both the loop and the condensation.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Deduplication backstop | Haiku proves unreliable at skipping already-acted-on orders | Simple daemon-side check: reject commissions with matching `heartbeat_source.prompt` in last N hours |
| Cross-project heartbeat | User needs standing orders that span multiple projects | Global `heartbeat.md` at `~/.guild-hall/heartbeat.md`, evaluated once per tick |
| Heartbeat history | User wants to see what the heartbeat has done over time | Heartbeat tick log in state directory, viewable from dashboard |

## Success Criteria

- [ ] `.lore/heartbeat.md` is created with instructional header on project initialization
- [ ] Standing orders with `[auto]`/`[confirm]` markers are respected by the heartbeat session
- [ ] No marker defaults to `[confirm]` behavior
- [ ] Haiku can downgrade trust to `confirm` but never upgrade to `auto`
- [ ] The heartbeat loop ticks at the configured interval and evaluates all registered projects
- [ ] Projects with empty heartbeat files (no content below header) are skipped at zero cost
- [ ] Rate-limit errors are logged and skipped, not retried
- [ ] Event condensation appends outcome summaries to `## Recent Activity` between ticks
- [ ] The `## Recent Activity` section is cleared after each successful tick
- [ ] Commissions created by the heartbeat carry `heartbeat_source` frontmatter with prompt, activity, and tick
- [ ] The `[Tick Now]` button triggers an immediate heartbeat evaluation for a project
- [ ] The heartbeat model defaults to Haiku and is configurable via `systemModels.heartbeat`
- [ ] The heartbeat interval defaults to 60 minutes and is configurable via `heartbeatIntervalMinutes`
- [ ] The heartbeat service is constructed in `createProductionApp()` and starts its loop and condensation subscriber on daemon startup
- [ ] `GET /heartbeat/{projectName}/status` returns file content status, standing order count, last tick timestamp, and interval
- [ ] Trust matching uses case-insensitive exact equality after prefix stripping, not substring
- [ ] All scheduler files are removed: `daemon/services/scheduler/` (3 files), tests (3 files), UI (4 files), API route (1 file)
- [ ] All trigger files are removed: `daemon/services/trigger-evaluator.ts`, `trigger-lifecycle.ts`, tests (3 files), UI (5 files), API route (1 file)
- [ ] `lib/commissions.ts` `sourceSchedule`/`sourceTrigger` fields replaced with `heartbeatSource`
- [ ] `CommissionType`, `TriggeredBy`, `TriggerBlock`, `ScheduledCommissionStatus` are removed from `daemon/types.ts`
- [ ] Schedule/trigger record operations are removed from `daemon/services/commission/record.ts`
- [ ] Schedule/trigger manager toolbox tools are removed
- [ ] `schedule_spawned` event type is removed from EventBus and `SYSTEM_EVENT_TYPES`
- [ ] Commission creation no longer accepts `sourceSchedule` or `sourceTrigger` options
- [ ] Commission creation accepts `heartbeatSource` option and writes `heartbeat_source` frontmatter
- [ ] Schedule/trigger specs are moved to `_abandoned/` with status `superseded`
- [ ] Existing schedule/trigger artifacts remain in place as historical records
- [ ] The heartbeat session has read-only project state tools and `create_heartbeat_commission` only
- [ ] The heartbeat session does NOT have access to manager coordination tools

## AI Validation

**Defaults:**
- Unit tests with mocked filesystem, EventBus, and SDK sessions
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Heartbeat loop test: create a heartbeat file with standing orders, mock the SDK session to return commission requests, verify commissions are created with correct `heartbeat_source` frontmatter
- Trust escalation prevention test: Haiku requests `auto` for an order that has no `[auto]` marker; verify commission is created with `confirm`
- Trust downgrade test: Haiku requests `confirm` for an `[auto]` order; verify commission is created with `confirm`
- Empty file skip test: heartbeat file with only instructional header; verify no SDK session is started
- Event condensation test: emit commission_status (completed) and commission_result events; verify summary lines appear in `## Recent Activity`
- Activity clearing test: after a successful tick, verify `## Recent Activity` is empty
- Rate limit handling test: SDK session throws rate limit error; verify project is skipped, activity is preserved, next project is evaluated
- Tick Now test: POST to `/heartbeat/{project}/tick`; verify immediate evaluation runs and returns result
- Scaffolding test: initialize a project without `heartbeat.md`; verify file is created with correct header
- Scaffolding idempotency test: initialize a project with existing `heartbeat.md` content; verify file is not modified
- Trust matching specificity test: verify `[auto]` trust is granted only when the `standing_order` text exactly matches (case-insensitive, trimmed) a line in `## Standing Orders` marked `[auto]`; verify a similar but distinct line does not grant auto trust
- Removal verification: after implementation, verify all files listed in REQ-HBT-32 through REQ-HBT-41b are gone, `bun typecheck` passes, and `bun test` passes
- Provenance roundtrip test: create a commission via heartbeat, read it back, verify `heartbeat_source` fields match

## Constraints

- No database. Heartbeat state is files (same as the rest of Guild Hall).
- The heartbeat session runs within the daemon process. Not a separate process.
- Event condensation writes are asynchronous and must not block the EventBus. Write operations to `heartbeat.md` are serialized per project (queue or mutex) to prevent concurrent append corruption from rapid event sequences.
- The heartbeat file must stay concise for Haiku's context window. The daemon clears recent activity after each tick, and the user is responsible for pruning stale standing orders.
- The `croner` dependency (currently used by the scheduler for cron parsing) can be removed from `package.json` after scheduler removal. Verify no other code imports it.
- Migration from scheduled/triggered commissions to standing orders is manual. No automatic conversion tool.
- The heartbeat does not replace the Event Router. The router continues to serve notification channel dispatch (shell commands, webhooks). Only the trigger evaluator consumer is removed.

## Context

- [Brainstorm: Heartbeat Commission Dispatch](.lore/brainstorm/heartbeat-commission-dispatch.md): all six proposals approved. Resolved questions lock down file location, session model, editing UX, tick interval, and cost model.
- [Issue: Redo Schedule/Trigger Commissions](.lore/issues/redo-schedule-trigger-commissions.md): the originating issue.
- [Spec: Guild Hall Scheduled Commissions](.lore/specs/commissions/guild-hall-scheduled-commissions.md): superseded by this spec. 28 requirements (SCOM) across cron evaluation, overlap prevention, catch-up, stuck escalation, and lifecycle management.
- [Spec: Triggered Commissions](.lore/specs/commissions/triggered-commissions.md): superseded by this spec. 42 requirements (TRIG) across event matching, template expansion, provenance, loop prevention, and lifecycle management.
- [Spec: Guild Hall Commissions](.lore/specs/commissions/guild-hall-commissions.md): the one-shot commission lifecycle. Heartbeat-created commissions follow this lifecycle in full.
- [Spec: Event Router](.lore/specs/infrastructure/event-router.md): retained for notification dispatch. The heartbeat's event condensation subscribes directly to the EventBus, not through the router.
- Briefing generator pattern (`daemon/services/briefing-generator.ts`): the heartbeat follows the same `prepareSdkSession` + `runSdkSession` pattern for GM sessions.
- Briefing refresh pattern (`daemon/services/briefing-refresh.ts`): the heartbeat loop follows the same post-completion scheduling pattern.
