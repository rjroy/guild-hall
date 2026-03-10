---
title: Guild Hall Scheduled Commissions
date: 2026-03-08
status: implemented
tags: [architecture, commissions, scheduling, cron, recurring-work, daemon]
modules: [commission-orchestrator, daemon-scheduler, manager-toolbox]
related:
  - .lore/brainstorm/scheduled-commissions.md
  - .lore/specs/guild-hall-commissions.md
  - .lore/specs/guild-hall-workers.md
  - .lore/specs/guild-hall-system.md
  - .lore/specs/guild-hall-views.md
  - .lore/specs/commission-layer-separation.md
req-prefix: SCOM
---

# Spec: Guild Hall Scheduled Commissions

## Overview

Scheduled commissions add recurring work to Guild Hall. A scheduled commission is a standing order: it defines what work should happen, which worker should do it, and how often. On each cadence, the system spawns a normal one-shot commission from the template and dispatches it. The spawned commission follows the full existing lifecycle (dispatch, in_progress, completed/failed, merge).

This spec extends the commission system ([Spec: Guild Hall Commissions](guild-hall-commissions.md)) with a `type` field, schedule-specific artifact fields, a daemon scheduler service, and two new manager toolbox tools. It does not modify the one-shot commission lifecycle. Spawned commissions are indistinguishable from manually created commissions except for a `source_schedule` back-reference.

The motivating use case is recurring lore maintenance: "Weekly, have Octavia run the `tend` skill." The mechanism is worker-agnostic and supports any recurring autonomous work pattern.

Depends on: [Spec: Guild Hall Commissions](guild-hall-commissions.md) for the one-shot commission lifecycle, artifact schema, dispatch mechanics, and activity timeline. [Spec: Guild Hall Workers](guild-hall-workers.md) for manager toolbox extension (REQ-WKR-25, REQ-WKR-26). [Spec: Guild Hall System](guild-hall-system.md) for artifact conventions (REQ-SYS-2), parity principle (REQ-SYS-39), and storage layout.

## Entry Points

- Guild Master creates a scheduled commission programmatically via `create_scheduled_commission` tool (from manager toolbox)
- User creates a scheduled commission through the UI (from views, parity with REQ-SYS-39)
- Daemon scheduler service ticks and evaluates cron expressions against registered schedules (from daemon timer)
- Guild Master modifies an existing schedule via `update_schedule` tool (from manager toolbox)
- Daemon starts up and reconciles missed schedule runs (from daemon startup)

## Requirements

### Commission Type Field

- REQ-SCOM-1: All commission artifacts gain a `type` field with two values: `one-shot` (default) and `scheduled`. Existing commissions without a `type` field are treated as `one-shot`. The `type` field is set at creation and is immutable after creation.

- REQ-SCOM-2: The `type` field determines which status set and lifecycle applies. One-shot commissions use the existing status set (REQ-COM-5). Scheduled commissions use a separate status set (REQ-SCOM-4). The two lifecycles do not overlap: a commission is one or the other, never both.

### Scheduled Commission Artifact

- REQ-SCOM-3: A scheduled commission artifact lives in the project's `.lore/commissions/` directory alongside one-shot commissions. It uses the same base frontmatter schema (REQ-COM-1, REQ-COM-2) with additional schedule-specific fields in a `schedule` block:

  ```yaml
  ---
  title: "Weekly lore maintenance"
  date: 2026-03-15
  type: scheduled
  status: active
  tags: [commission, scheduled]
  worker: guild-hall-writer
  prompt: "Run the tend skill. Proceed with all recommended updates."
  dependencies: []
  schedule:
    cron: "0 9 * * 1"
    repeat: null
    runs_completed: 12
    last_run: 2026-06-10T09:00:01.123Z
    last_spawned_id: commission-guild-hall-writer-20260610-090001
  activity_timeline:
    - timestamp: 2026-03-15T09:00:00.000Z
      event: created
      reason: "Schedule created by Guild Master"
  ---
  ```

- REQ-SCOM-3a: Schedule block fields:
  - **cron**: Standard 5-field cron expression (minute, hour, day-of-month, month, day-of-week). Defines the cadence. Required.
  - **repeat**: Optional positive integer. Maximum number of runs before the schedule auto-completes. `null` means indefinite (runs until paused, completed, or failed).
  - **runs_completed**: Integer counter, starts at 0. Incremented each time a spawned commission is created. The scheduler uses this with `repeat` to determine auto-completion.
  - **last_run**: ISO 8601 timestamp of the most recent spawn. `null` before the first run. The scheduler compares this against the cron expression to determine when the next run is due.
  - **last_spawned_id**: Commission ID of the most recently spawned one-shot commission. `null` before the first run. The scheduler checks this commission's status to prevent overlapping runs.

- REQ-SCOM-3b: The `prompt` field on a scheduled commission is a template. Each spawned commission receives this prompt verbatim. The prompt should be self-contained: it must include any "assume yes" or autonomy instructions since no human is present at spawn time.

### Status Transitions

- REQ-SCOM-4: Scheduled commissions have four statuses:
  - **active**: Schedule is live. The scheduler evaluates its cron expression on each tick and spawns commissions when due.
  - **paused**: Schedule is temporarily disabled. The scheduler skips it. All state (cron, runs_completed, last_run) is preserved. Resuming returns to `active` without losing history.
  - **completed**: Schedule has finished. Either `repeat` was reached, or the user/manager explicitly completed it. Terminal state.
  - **failed**: Schedule encountered an unrecoverable problem (e.g., referenced worker no longer exists, repeated spawn failures). Terminal state. The schedule artifact and its history are preserved.

- REQ-SCOM-5: Valid transitions:
  - active -> paused (user or manager pauses)
  - active -> completed (repeat count reached, or user/manager explicitly completes)
  - active -> failed (unrecoverable error)
  - paused -> active (user or manager resumes)
  - paused -> completed (user or manager explicitly completes while paused)
  - paused -> failed (unrecoverable error detected while paused)
  - failed -> active (user or manager reactivates after fixing the underlying problem)

- REQ-SCOM-6: Every status transition is recorded in the schedule's activity timeline with a timestamp and reason, following the same convention as one-shot commissions (REQ-COM-8).

- REQ-SCOM-7: When `repeat` is set and `runs_completed` reaches `repeat`, the scheduler transitions the schedule to `completed` with reason "Repeat count reached ({n}/{n})." This happens after the final spawned commission is created, not after it completes.

### Spawned Commissions

- REQ-SCOM-8: A spawned commission is a normal one-shot commission (REQ-COM-1 through REQ-COM-32 apply in full) with one additional field: `source_schedule`. This field contains the commission ID of the parent scheduled commission. It is set at creation and is immutable.

- REQ-SCOM-9: Spawned commissions follow the full one-shot lifecycle as defined in REQ-COM-5 (pending, blocked, dispatched, in_progress, sleeping, completed, failed, cancelled, abandoned). They merge back to `claude` on completion, respect concurrent limits, and support redispatch. The schedule system has no special authority over a spawned commission after creation.

- REQ-SCOM-10: Spawned commission naming follows the existing convention (REQ-COM-1) with no special prefix. The commission ID is derived from the worker name and timestamp, the same as any manually created commission. The `source_schedule` field is the only link back to the parent.

- REQ-SCOM-11: The spawned commission's `prompt` is copied verbatim from the schedule's `prompt` field. The spawned commission's `worker`, `dependencies`, and `tags` are also copied from the schedule. Resource overrides on the schedule artifact, if present, carry through to each spawned commission.

### Daemon Scheduler Service

- REQ-SCOM-12: The daemon gains a scheduler service that runs on a 60-second timer. On each tick, it:
  1. Scans `.lore/commissions/` across all registered projects for artifacts with `type: scheduled` and `status: active`.
  2. For each active schedule, evaluates the cron expression against `last_run` to determine if a new run is due.
  3. Checks whether `last_spawned_id` references a commission that is still active (dispatched, in_progress, or sleeping). If yes, skips this schedule for this tick (no overlapping runs).
  4. Creates a one-shot commission artifact from the schedule template.
  5. Dispatches the spawned commission through the existing dispatch path (REQ-COM-9).
  6. Updates the schedule artifact: increments `runs_completed`, sets `last_run` to now, sets `last_spawned_id` to the new commission's ID.
  7. Appends a spawn event to the schedule's activity timeline (REQ-SCOM-16).
  8. If `repeat` is set and `runs_completed` now equals `repeat`, transitions the schedule to `completed` (REQ-SCOM-7).

- REQ-SCOM-13: The 60-second tick interval matches cron's native minute granularity. This departs from the brainstorm's 5-minute suggestion because a 5-minute tick would delay scheduled runs by up to 5 minutes past their cron time, which is unnecessary given that the scan (reading frontmatter from commission files) is lightweight. If performance becomes a concern with many schedules, the scheduler can cache parsed schedule metadata in memory and invalidate on file change. This optimization is deferred until measured need.

- REQ-SCOM-14: On daemon startup, the scheduler reads all active schedules and their `last_run` timestamps. If a schedule was missed while the daemon was down (the current time is past the next cron occurrence after `last_run`), the scheduler runs one catch-up spawn, not all missed instances. The intent is cadence, not exact count: "this should happen roughly weekly" rather than "this must happen exactly 52 times per year." Catch-up spawns are recorded in the timeline with event `commission_spawned_catchup`.

- REQ-SCOM-15: The scheduler respects existing concurrent commission limits (REQ-COM-21, REQ-COM-22). If dispatching a spawned commission would exceed a limit, the spawned commission is created in `pending` status and queued for dispatch like any other commission. The schedule artifact still records the spawn (updates `last_run`, `runs_completed`, `last_spawned_id`), but the spawned commission waits for capacity.

### Activity Timeline Events

- REQ-SCOM-16: Schedule-specific timeline events:

  - **commission_spawned**: A new one-shot commission was created from this schedule.
    ```yaml
    - timestamp: 2026-06-17T09:00:01.123Z
      event: commission_spawned
      spawned_id: commission-guild-hall-writer-20260617-090001
      run_number: 13
      previous_run_outcome: completed
    ```

  - **commission_spawned_catchup**: Same as `commission_spawned`, but indicates this was a catch-up run after the daemon was down.
    ```yaml
    - timestamp: 2026-06-17T12:30:00.000Z
      event: commission_spawned_catchup
      spawned_id: commission-guild-hall-writer-20260617-123000
      run_number: 14
      previous_run_outcome: failed
      missed_since: 2026-06-17T09:00:00.000Z
    ```

  - **escalation_created**: The scheduler escalated a stuck run to the Guild Master.
    ```yaml
    - timestamp: 2026-06-20T09:00:01.456Z
      event: escalation_created
      stuck_commission_id: commission-guild-hall-writer-20260617-090001
      running_since: 2026-06-17T09:00:01.123Z
      reason: "Spawned commission has been active for 3d 0h, exceeding 2x cadence (2d 0h)"
    ```

  Standard lifecycle events (status transitions per REQ-SCOM-6) also appear in the timeline, using the same format as one-shot commissions.

### Stuck Run Escalation

- REQ-SCOM-17: If the previous spawned commission has been in an active state (dispatched, in_progress, or sleeping per [Spec: Worker-to-Worker Communication](worker-communication.md)) for longer than twice the interval between `last_run` and the next expected cron occurrence, and a new run is due, the scheduler escalates to the Guild Master. Escalation creates a meeting request (using the same mechanism as the manager toolbox's `initiate_meeting` tool) describing the stuck commission: which schedule, which spawned commission, how long it has been running (measured from the spawned commission's dispatch timestamp), and what the expected cadence is.

- REQ-SCOM-18: Escalation happens at most once per stuck spawned commission. The scheduler tracks whether it has escalated for the current `last_spawned_id` to avoid repeated meeting requests. This tracking is in-memory (reset on daemon restart, which is acceptable because restart also fails all active commissions per REQ-COM-27).

### Manager Toolbox Extensions

- REQ-SCOM-19: Two new tools are added to the manager toolbox (REQ-WKR-25, REQ-WKR-26):

  - **create_scheduled_commission**: Creates a scheduled commission artifact and sets it to `active`. Parameters:
    - `title` (string, required): Short title for the schedule.
    - `workerName` (string, required): Worker to assign for each spawned commission.
    - `prompt` (string, required): The work prompt, copied to each spawned commission.
    - `cron` (string, required): 5-field cron expression defining the cadence.
    - `repeat` (integer or null, optional): Maximum number of runs. Default: null (indefinite).
    - `dependencies` (string[], optional): Artifact paths each spawned commission depends on.
    - `resourceOverrides` (object, optional): `maxTurns` and `maxBudgetUsd` applied to each spawned commission.

    Returns: `{ commissionId, created: true, status: "active" }`.

  - **update_schedule**: Modifies an existing scheduled commission. Valid when the schedule is `active`, `paused`, or `failed`. Parameters:
    - `commissionId` (string, required): The scheduled commission to modify.
    - `cron` (string, optional): New cron expression.
    - `repeat` (integer or null, optional): New repeat count. Setting a value lower than `runs_completed` transitions to `completed`.
    - `prompt` (string, optional): New prompt for future spawned commissions (does not affect already-spawned commissions).
    - `status` (string, optional): Transition to `active`, `paused`, or `completed`. Must be a valid transition from the current status (REQ-SCOM-5).

    Returns: `{ commissionId, updated: true, status }`.

- REQ-SCOM-20: Both tools follow the existing manager toolbox patterns: Zod schemas for input validation, JSON responses, error handling that returns `isError: true` with a descriptive message. The tools are registered in `createManagerToolbox()` alongside the existing tools.

- REQ-SCOM-21: Schedule creation follows the parity principle (REQ-SYS-39, REQ-COM-4). The user can create scheduled commissions through the UI, the Guild Master can create them programmatically. Both produce the same artifact. The UI creation form is specified in REQ-SCOM-25.

### UI Requirements

- REQ-SCOM-22: The Project view's Commissions tab (REQ-VIEW-16) lists both one-shot and scheduled commissions. Scheduled commissions are visually distinguished with a recurring indicator (icon or label) alongside their status gem. One-shot commissions with a `source_schedule` field show a subtle link to their parent schedule.

- REQ-SCOM-23: The Commission detail view (REQ-VIEW-20 through REQ-VIEW-27) adapts when displaying a scheduled commission:
  - Header shows the schedule status gem and the cron expression in human-readable form (e.g., "Every Monday at 9:00 AM").
  - A "Schedule" section replaces the dispatch button area, showing: cron expression, next expected run (computed from cron + last_run), runs completed / repeat count (or "indefinite"), and last run timestamp.
  - A "Recent Runs" section lists the most recent spawned commissions (last 10) with their status gems, linking to each spawned commission's detail view.
  - Action buttons: **Pause** (when active), **Resume** (when paused), **Complete** (when active or paused). Each requires confirmation.

- REQ-SCOM-24: The Dashboard dependency map (REQ-VIEW-14) renders scheduled commissions as a distinct node shape (e.g., double-bordered or with a recurring icon) to differentiate them from one-shot commissions. Spawned commissions appear as normal nodes connected to their parent schedule node.

- REQ-SCOM-25: Schedule creation is accessible from the Project view (extending REQ-VIEW-19). The creation form includes: title, worker selection, agentic prompt, cron expression input (with a human-readable preview, e.g., "Runs every Monday at 9:00 AM"), optional repeat count, dependency selection, and optional resource overrides. A type toggle or separate button distinguishes "Create Commission" from "Create Schedule."

### Integration with cleanup-commissions

- REQ-SCOM-26: Spawned commissions are eligible for the `cleanup-commissions` skill like any other completed one-shot commission. The `source_schedule` field gives the cleanup skill provenance context: it can group spawned commissions by their parent schedule when summarizing a batch, and it can note recurring patterns (e.g., "12 weekly runs, all successful") without extracting each one individually.

- REQ-SCOM-27: Schedule artifacts themselves are NOT eligible for cleanup by `cleanup-commissions`. They are standing orders with ongoing purpose, not completed work products. A schedule artifact is only removed when the user or manager transitions it to `completed` (and even then, the artifact persists as a historical record in `.lore/commissions/`). Deletion of completed schedule artifacts is a manual decision, same as any other lore artifact.

### Timeline Compression

- REQ-SCOM-28: Long-lived schedules accumulate spawn events. The `tend` skill (which is the motivating use case for scheduled commissions) can include a compression pass on schedule timelines: summarize old spawn entries into a block ("Ran 48 times between 2026-01 and 2026-12, 45 successful, 3 failed"), keep the last N entries (default: 10) in full detail. This compression is a `tend` concern, not a scheduler concern. The scheduler always appends full entries.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Cron library selection | Implementation needs a cron expression evaluator | Research: evaluate lightweight JS/TS cron libraries for "next occurrence after timestamp X" capability |
| Tend skill enhancement | Tend needs timeline compression logic for schedule artifacts | Worker domain plugin: guild-hall-writer |

## Success Criteria

- [ ] Commission artifacts support a `type` field (`one-shot` / `scheduled`); existing commissions without `type` default to `one-shot`
- [ ] Scheduled commission artifacts contain a `schedule` block with cron, repeat, runs_completed, last_run, and last_spawned_id
- [ ] Scheduled commissions use the four-status lifecycle (active, paused, completed, failed) with defined transitions
- [ ] Invalid status transitions on scheduled commissions are rejected with `isError: true` responses and descriptive messages (per REQ-SCOM-20)
- [ ] The daemon scheduler service ticks every 60 seconds and evaluates active schedules
- [ ] When a cron expression fires, a one-shot commission is spawned with `source_schedule` back-reference and dispatched
- [ ] The scheduler does not create overlapping runs (skips when previous spawn is still active)
- [ ] On daemon startup, missed schedules get one catch-up run, not all missed instances
- [ ] Stuck runs (active beyond 2x cadence) escalate to the Guild Master via meeting request
- [ ] Escalation happens at most once per stuck spawned commission
- [ ] `create_scheduled_commission` and `update_schedule` tools are available in the manager toolbox
- [ ] Schedule creation follows the parity principle (UI and manager produce the same artifact)
- [ ] When `repeat` is set and `runs_completed` reaches `repeat`, the schedule auto-completes
- [ ] Pausing a schedule preserves all state; resuming continues from where it left off
- [ ] The scheduler respects concurrent commission limits when dispatching spawned commissions
- [ ] Spawned commissions are eligible for `cleanup-commissions`; schedule artifacts are not
- [ ] Schedule activity timeline records spawn events, catch-up events, escalations, and status transitions
- [ ] The UI distinguishes scheduled commissions from one-shot commissions in the Project view, Commission detail view, Dashboard dependency map, and creation form (REQ-SCOM-22 through REQ-SCOM-25)
- [ ] The Commission detail view for a schedule shows cron, next run, recent runs, and schedule-specific actions

## AI Validation

**Defaults:**
- Unit tests with mocked filesystem, cron evaluation, and commission creation
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Scheduler tick test: create active schedules with various cron expressions, advance time past due, verify spawned commissions are created with correct fields
- Overlap prevention test: set last_spawned_id to an active commission, verify the scheduler skips the schedule
- Catch-up test: simulate daemon downtime, verify exactly one catch-up spawn per missed schedule on startup
- Repeat count test: create schedule with repeat=3, run three ticks, verify auto-completion after third spawn
- Pause/resume test: pause an active schedule, advance past due, verify no spawn; resume, verify spawn on next tick
- Stuck escalation test: set last_spawned_id to a commission active for 2x cadence, verify meeting request created; verify no duplicate escalation on subsequent ticks
- Manager tool test: create_scheduled_commission and update_schedule produce valid artifacts with correct fields
- Update_schedule validation test: verify invalid transitions are rejected, repeat < runs_completed triggers completion
- Concurrent limits test: scheduler spawns commission when at capacity, verify commission is created pending and queued
- Source_schedule test: spawned commissions carry source_schedule field, cleanup skill can read it
- Type field backward compatibility test: commission artifacts without `type` field are treated as one-shot throughout the system

## Constraints

- No database. All schedule state is files (same as one-shot commissions).
- Cron evaluation needs a third-party library. Selection deferred to implementation (see Exit Points). The only required capability is "given this expression and a timestamp, when is the next occurrence?"
- The scheduler runs within the daemon process. It is not a separate process or cron job. If the daemon is down, schedules don't fire (catch-up on restart handles this).
- Schedule artifacts live in `.lore/commissions/`, not a separate directory. The `type` field is the discriminator.
- "Assuming yes" behavior is a prompt concern. The schedule's `prompt` field must include autonomy instructions. The system does not inject them.
- The scheduler writes to the integration worktree's commission files (same write path as the manager toolbox). Spawned commissions get their own activity worktrees per the existing dispatch flow.

## Context

- [Brainstorm: Scheduled Commissions](.lore/brainstorm/scheduled-commissions.md): Core design decisions settled there. This spec formalizes them and resolves the open questions (paused status, tick interval, spawn event format, UI representation, cleanup integration). Cron library selection remains an open research exit point.
- [Spec: Guild Hall Commissions](guild-hall-commissions.md): The one-shot commission lifecycle. Spawned commissions follow this lifecycle in full.
- [Spec: Guild Hall Workers](guild-hall-workers.md): Manager toolbox (REQ-WKR-25, REQ-WKR-26). The two new tools extend the manager's capabilities.
- [Spec: Commission Layer Separation](commission-layer-separation.md): The scheduler service interacts with Layers 1-2 (record and lifecycle) to create and dispatch spawned commissions. It does not bypass the layer boundaries.
- [Brainstorm: Lore Proliferation & Maintenance](.lore/brainstorm/lore-proliferation-maintenance.md): Timeline compression and the `tend` use case.
