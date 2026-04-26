---
title: Triggered Commissions
date: 2026-03-20
revised: 2026-03-21
status: superseded
superseded_by: .lore/specs/heartbeat-commission-dispatch.md
tags: [commissions, event-router, automation, triggers, artifacts]
modules: [event-router, commission-orchestrator, trigger-evaluator]
related:
  - .lore/brainstorm/triggered-commissions.md
  - .lore/specs/infrastructure/event-router.md
  - .lore/specs/infrastructure/event-router-field-matching.md
  - .lore/specs/commissions/guild-hall-commissions.md
  - .lore/specs/commissions/guild-hall-scheduled-commissions.md
req-prefix: TRIG
---

# Spec: Triggered Commissions

## Overview

Triggered commissions are the third commission creation path. Manual dispatch and scheduled cron are the first two. This one is event-driven: when a system event matches a rule, the system creates and dispatches a commission. Same lifecycle as any other commission once it exists. The difference is what causes it to exist.

Triggers live as commission artifacts with `type: triggered` in `.lore/commissions/`, following the same pattern as scheduled commissions. Both are standing orders that spawn one-shot commissions from a template. They differ only in activation mechanism: cron tick for schedules, event match for triggers.

Triggers are reactions ("when X happens, also do Y"), not sequencing tools. Sequencing belongs to dependency chains defined at plan time. A trigger with `approval: auto` fires without human intervention. A trigger with `approval: confirm` creates the commission in `pending` for human review before dispatch.

Event matching is delegated entirely to the Event Router (`apps/daemon/services/event-router.ts`). The trigger evaluator service calls `router.subscribe(rule, handler)` for each active trigger, using the same `EventMatchRule` shape that the notification service uses. The router provides type matching, projectName matching, and field-level glob matching via micromatch. The triggered commissions spec does not define any matching logic.

## Entry Points

- Event router spec (`.lore/specs/infrastructure/event-router.md`) lists triggered commissions as an exit point: "when X happens, create commission Y" as a second Event Router consumer.
- Field matching spec (`.lore/specs/infrastructure/event-router-field-matching.md`) provides the `fields` glob matching that makes triggers expressive enough for real use (status filtering, commissionId patterns, brace expansion, negation).
- Triggered commissions brainstorm (`.lore/brainstorm/triggered-commissions.md`) resolved design questions around matching, loop prevention, approval, and architecture.
- Standing delegation brainstorm (`.lore/brainstorm/standing-delegation.md`) named the concept; this spec defines the mechanism.

## Requirements

### Trigger Artifact

- REQ-TRIG-1: `"triggered"` is added to the `CommissionType` union in `apps/daemon/types.ts` alongside `"one-shot"` and `"scheduled"`. A triggered commission is a commission artifact in `.lore/commissions/` with `type: triggered`. It follows the same base frontmatter schema as other commissions (REQ-COM-1, REQ-COM-2) with additional trigger-specific fields in a `trigger` block:

  ```yaml
  ---
  title: "Review after implementation"
  date: 2026-03-21
  type: triggered
  status: active
  tags: [commission, triggered]
  worker: guild-hall-reviewer
  prompt: "Review the work from commission {{commissionId}}."
  dependencies: []
  trigger:
    match:
      type: commission_status
      fields:
        status: completed
    approval: auto
    maxDepth: 3
    runs_completed: 0
    last_triggered: null
    last_spawned_id: null
  activity_timeline:
    - timestamp: 2026-03-21T10:00:00.000Z
      event: created
      reason: "Trigger created by Guild Master"
  ---
  ```

- REQ-TRIG-2: The `trigger` block contains the event matching rule, approval mode, loop prevention settings, and runtime state:

  | Field | Required | Type | Purpose |
  |-------|----------|------|---------|
  | `match` | Yes | `EventMatchRule` | Event matching criteria passed to `router.subscribe()` |
  | `approval` | No | `"auto"` or `"confirm"` | Dispatch behavior. Defaults to `"confirm"`. |
  | `maxDepth` | No | positive integer | Maximum trigger chain depth. Defaults to 3. |
  | `runs_completed` | No | integer | How many times this trigger has fired. Starts at 0. |
  | `last_triggered` | No | ISO 8601 timestamp or null | When this trigger last fired. |
  | `last_spawned_id` | No | string or null | Commission ID of the most recently spawned one-shot. |

- REQ-TRIG-3: The `match` field in the trigger block is an `EventMatchRule` as defined in `apps/daemon/services/event-router.ts`. It has the same shape used by notification rules:

  | Field | Required | Purpose |
  |-------|----------|---------|
  | `type` | Yes | Event type discriminant (exact match, validated against `SYSTEM_EVENT_TYPES`) |
  | `projectName` | No | Exact match on the event's `projectName` field |
  | `fields` | No | `Record<string, string>` matched via micromatch glob patterns |

  All matching behavior (exact type comparison, projectName skip semantics, field glob matching via micromatch, AND logic across fields, string coercion, invalid pattern handling) is provided by the Event Router (REQ-EVRT-3, REQ-EVFM-1 through REQ-EVFM-18). This spec does not define matching logic.

### Trigger Lifecycle

- REQ-TRIG-4: Triggered commissions use a status set parallel to scheduled commissions: `active`, `paused`, `completed`, `failed`. An `active` trigger has a live subscription on the Event Router. A `paused` trigger retains its configuration but has no subscription. `completed` and `failed` are terminal.

- REQ-TRIG-5: A trigger moves from `active` to `paused` via user action (manual pause, Guild Master tool). It moves from `paused` to `active` by resuming. Pausing removes the router subscription; resuming re-registers it.

- REQ-TRIG-6: Unlike scheduled commissions, triggered commissions have no `repeat` field. They are standing reactions until paused or completed manually. There is no auto-completion based on a run count.

### Commission Template

- REQ-TRIG-7: The trigger artifact's top-level `worker` and `prompt` fields define the commission template, same as scheduled commissions. When the trigger fires, a one-shot commission is created using these fields:

  | Source | Used For |
  |--------|----------|
  | `worker` | Worker package name for the spawned commission |
  | `prompt` | Commission prompt (supports template variables) |
  | `title` | Commission title (supports template variables). Defaults to `"Triggered: "` followed by the trigger artifact's title. |
  | `dependencies` | Commission dependency IDs (each supports template variables) |

- REQ-TRIG-8: The spawned commission targets the same project as the trigger artifact. Triggers are project-scoped: they live in a project's `.lore/commissions/` directory and their spawned commissions belong to that project. Cross-project dispatch is a non-goal.

- REQ-TRIG-9: The `worker` field must reference a valid worker package name. This is validated at dispatch time (when the trigger fires), not at scan time, because worker packages are discovered at startup and may differ from what's in the artifact. A trigger that references an unknown worker logs a warning and skips dispatch.

### Template Variable Expansion

- REQ-TRIG-10: The `prompt`, `title`, and `dependencies` fields support `{{fieldName}}` substitution from the matched event's payload. This is simple string interpolation: `{{commissionId}}` becomes the literal string value of the event's `commissionId` field.

- REQ-TRIG-11: Template variables reference top-level fields on the event object. Nested access is not supported. The available variables depend on the event type:

  | Event Type | Available Variables |
  |------------|-------------------|
  | `commission_status` | `commissionId`, `status`, `oldStatus`, `projectName`, `reason` |
  | `commission_result` | `commissionId`, `summary`, `artifacts` |
  | `schedule_spawned` | `scheduleId`, `spawnedId`, `projectName`, `runNumber` |
  | `meeting_ended` | `meetingId` |

  Other event types are matchable but have fewer useful variables. Array values (like `artifacts`) are joined with commas when substituted into a string. Undefined or missing fields expand to empty string.

- REQ-TRIG-12: Template expansion happens after match evaluation, before commission creation. If expansion produces an empty `prompt` or `worker`, the trigger skips dispatch and logs a warning.

### Approval Model

- REQ-TRIG-13: Each trigger specifies `approval: auto` or `approval: confirm` in its `trigger` block. The default is `confirm` (human-in-the-loop).

- REQ-TRIG-14: For `approval: auto`, the triggered commission is created and immediately dispatched. This follows the same path as scheduled commission spawning: `createCommission()` then `dispatchCommission()`.

- REQ-TRIG-15: For `approval: confirm`, the triggered commission is created in `pending` status but not dispatched. The user reviews and manually dispatches or cancels. The commission's `activity_timeline` records that it was created by a trigger and is awaiting approval.

- REQ-TRIG-16: When depth limiting forces a downgrade (REQ-TRIG-22), the effective approval is `confirm` regardless of the trigger's configured approval. The downgrade is recorded in the `activity_timeline` entry (REQ-TRIG-22 specifies the format). The commission's `status: pending` and the timeline entry together convey the downgrade.

### Provenance Tracking

- REQ-TRIG-17: Spawned commissions carry a `triggered_by` block in their YAML frontmatter:

  ```yaml
  triggered_by:
    source_id: commission-Dalton-20260320-143000
    trigger_artifact: commission-triggered-review-after-implement
    depth: 1
  ```

  | Field | Type | Purpose |
  |-------|------|---------|
  | `source_id` | string | The context ID from the event that fired the trigger: `commissionId` for commission events, `meetingId` for meeting events, `scheduleId` for schedule events. |
  | `trigger_artifact` | string | The filename (without extension) of the trigger commission artifact that fired |
  | `depth` | number | How many trigger firings deep this commission is in the chain |

- REQ-TRIG-18: The `depth` field is computed from the source's own `triggered_by.depth` when the source is a commission with a readable artifact. If the source commission has `depth: 1`, the new commission gets `depth: 2`. If the source commission has no `triggered_by` (it was manually created or scheduled), the new commission gets `depth: 1`. For non-commission event sources (e.g., `meeting_ended`, `schedule_spawned`), depth is always 1. No artifact read is attempted for non-commission sources.

- REQ-TRIG-19: For commission-sourced triggers, computing depth requires reading the source commission's artifact frontmatter to check for `triggered_by`. This is the one place the trigger system reads commission state. The read targets the integration worktree, same path used by `createCommission`. If the artifact cannot be read (not found, parse error), depth defaults to 1 and a warning is logged. For non-commission sources, this read is skipped entirely.

### Loop Prevention

- REQ-TRIG-20: Two mechanisms prevent runaway trigger chains:

  1. **Depth limit** (primary): A configurable maximum trigger depth. When a triggered commission would exceed this depth, the safety behavior from REQ-TRIG-22 applies.
  2. **Source exclusion** (secondary): A trigger does not fire on events from commissions that were themselves created by the same trigger artifact.

- REQ-TRIG-21: The depth limit defaults to 3 and is configurable per trigger via the `maxDepth` field in the `trigger` block. When a trigger would create a commission at depth > maxDepth, the commission is still created but with `approval: confirm` regardless of the trigger's configured approval. Deep chains may represent legitimate work that deserves human review, so the depth limit is a soft downgrade, not a hard block.

- REQ-TRIG-22: The `activity_timeline` entry for depth-limited commissions records: `"Depth limit reached (depth N > maxDepth M). Created with approval: confirm."`.

- REQ-TRIG-23: Source exclusion works by comparing the event's source commission's `triggered_by.trigger_artifact` against the current trigger's artifact name. If they match, the trigger skips (hard skip, not downgrade). Source exclusion catches definitional self-loops with no user value, so silent skip is the right behavior. This prevents the most common accidental loop: a review trigger firing on its own review commissions.

  Example: The trigger `review-after-implement` fires when Dalton completes. It creates a review commission. When the review commission completes, the `commission_status` event has a `commissionId` whose artifact has `triggered_by.trigger_artifact: "commission-triggered-review-after-implement"`. The same trigger sees this and skips.

- REQ-TRIG-24: Source exclusion requires the same artifact read as depth computation (REQ-TRIG-19). Both checks happen in one read. If the artifact is unreadable, source exclusion is skipped (fail-open; the depth limit is still the primary safety mechanism). Source exclusion only applies to commission-sourced events. Non-commission sources cannot be self-loops by definition.

### Trigger Creation and Management Tools

- REQ-TRIG-25a: A `create_triggered_commission` tool is added to the manager toolbox (`apps/daemon/services/manager/toolbox.ts`). It writes the trigger artifact to `.lore/commissions/` and registers the subscription on the Event Router. Parameters mirror the trigger artifact structure:

  | Parameter | Required | Type | Purpose |
  |-----------|----------|------|---------|
  | `title` | Yes | string | Short title for the trigger |
  | `workerName` | Yes | string | Worker package name for spawned commissions |
  | `prompt` | Yes | string | Commission prompt (supports `{{fieldName}}` template variables) |
  | `match` | Yes | `EventMatchRule` shape (`type` required, `projectName` and `fields` optional) | Event matching criteria passed to `router.subscribe()` |
  | `approval` | No | `"auto"` or `"confirm"` | Dispatch behavior. Defaults to `"confirm"`. |
  | `maxDepth` | No | positive integer | Maximum trigger chain depth. Defaults to 3. |
  | `dependencies` | No | string[] | Commission dependency IDs (each supports template variables) |

  The tool validates `match.type` against `SYSTEM_EVENT_TYPES` and validates `workerName` against discovered packages. On success, it returns the trigger artifact ID and `status: "active"`. On failure, it returns an error with `isError: true`.

- REQ-TRIG-25b: An `update_trigger` tool is added to the manager toolbox. It modifies an existing trigger artifact. Accepts the trigger's commission ID plus optional fields to update:

  | Parameter | Required | Type | Purpose |
  |-----------|----------|------|---------|
  | `commissionId` | Yes | string | The trigger commission ID to update |
  | `status` | No | string | New status: `"active"`, `"paused"`, or `"completed"` |
  | `match` | No | `EventMatchRule` shape | New event matching criteria |
  | `approval` | No | `"auto"` or `"confirm"` | New approval mode |
  | `prompt` | No | string | New commission prompt |

  Status transitions follow the same state machine as REQ-TRIG-4/5: `active` to `paused`, `paused` to `active`, either to `completed`. Invalid transitions return an error. When status changes to `paused`, the router subscription is removed. When status changes to `active`, the subscription is re-registered. Field updates (match, approval, prompt) on an active trigger remove the old subscription and register a new one with the updated rule. The tool validates the commission is `type: triggered` before applying changes.

- REQ-TRIG-25c: Both tools follow the same DI patterns as `create_scheduled_commission` and `update_schedule`. They are `make*Handler(deps: ManagerToolboxDeps)` functions that receive `callRoute`, `log`, `guildHallHome`, `projectName`, and other deps. `create_triggered_commission` delegates to the daemon route for commission creation (same as `create_scheduled_commission`). `update_trigger` operates directly on the artifact and trigger evaluator service (same pattern as `update_schedule`).

- REQ-TRIG-25d: `create_triggered_commission` calls the daemon route to write the artifact, then notifies the trigger evaluator to register a subscription for the new trigger. `update_trigger` writes artifact changes, then notifies the trigger evaluator to update or remove the subscription. The trigger evaluator exposes methods for this: `registerTrigger(artifactPath)` and `unregisterTrigger(commissionId)`. This avoids requiring a daemon restart when triggers are created or modified through tools.

### Trigger State Updates

- REQ-TRIG-25: When a trigger fires and a spawned commission is created successfully, the trigger artifact is updated. State updates happen after `createCommission` succeeds, regardless of subsequent dispatch outcome (for `approval: auto`, a dispatch failure does not roll back the state update):
  - `runs_completed` is incremented by 1.
  - `last_triggered` is set to the current ISO 8601 timestamp.
  - `last_spawned_id` is set to the spawned commission's ID.
  - An `activity_timeline` entry records the firing.

- REQ-TRIG-26: State updates are written to the trigger artifact in the integration worktree. The update follows the same pattern as scheduled commission state updates (REQ-SCOM-3a): read the artifact, modify the frontmatter fields, write it back.

### Architecture

- REQ-TRIG-27: A trigger evaluator service is created during startup (`createProductionApp`). It receives the Event Router, access to commission artifacts across projects, commission creation and dispatch capabilities, and a `Log`. It is a separate service from the notification service, following the same consumer pattern.

- REQ-TRIG-28: During initialization, the trigger evaluator scans `.lore/commissions/` in all registered projects for artifacts with `type: triggered` and `status: active`. For each active trigger, it calls `router.subscribe(trigger.match, handler)` where the handler performs the trigger dispatch logic (template expansion, provenance, loop checks, commission creation). The service holds the unsubscribe callbacks.

  This mirrors how the scheduler scans for `type: scheduled` artifacts.

- REQ-TRIG-29: The trigger evaluator is decoupled from the Event Router's internals. It uses the public `router.subscribe(rule, handler)` API (REQ-EVRT-2). The router handles all matching. The trigger evaluator's handler only runs when the router has already confirmed a match.

- REQ-TRIG-30: Each trigger's handler is responsible for: reading the source commission artifact (for depth and source exclusion), computing the effective approval, performing template variable expansion, calling `createCommission`, conditionally calling `dispatchCommission`, and updating the trigger artifact's state. All of this runs in a fire-and-forget async wrapper so the handler does not block the router.

- REQ-TRIG-31: Handler failures are logged at `warn` level with the trigger artifact name, event type, and error message. A failed trigger does not affect other triggers or notification dispatches for the same event.

- REQ-TRIG-32: When no active triggers exist across any project, the trigger evaluator creates no subscriptions. No overhead for users who don't use triggers.

### Commission Creation

- REQ-TRIG-33: Triggered commissions are created through the existing `createCommission` API on `CommissionSessionForRoutes`. The `options` parameter is extended with trigger provenance fields, following the pattern of the existing `sourceSchedule`:

  ```typescript
  options?: {
    type?: CommissionType;
    sourceSchedule?: string;
    sourceTrigger?: {
      triggerArtifact: string;
      sourceId: string;
      depth: number;
    };
  }
  ```

  `sourceTrigger` and `sourceSchedule` are mutually exclusive. A commission is created by one mechanism.

- REQ-TRIG-34: When `options.sourceTrigger` is provided, `createCommission` writes the `triggered_by` block into the commission artifact frontmatter using the values from `sourceTrigger` (`triggerArtifact` maps to `trigger_artifact`, `sourceId` maps to `source_id`, `depth` maps to `depth`).

- REQ-TRIG-35: The `activity_timeline` entry for trigger-created commissions records: `"Commission created by trigger: {trigger artifact name} (source: {source ID}, depth: {N})"`.

### Type Definitions

- REQ-TRIG-36: The `triggered_by` type for spawned commission frontmatter:

  ```typescript
  interface TriggeredBy {
    source_id: string;
    trigger_artifact: string;
    depth: number;
  }
  ```

- REQ-TRIG-37: The trigger block type for trigger commission artifacts. This is used for frontmatter parsing, not for config:

  ```typescript
  interface TriggerBlock {
    match: EventMatchRule;
    approval?: "auto" | "confirm";
    maxDepth?: number;
    runs_completed: number;
    last_triggered: string | null;
    last_spawned_id: string | null;
  }
  ```

  `EventMatchRule` is imported from `apps/daemon/services/event-router.ts`. The trigger evaluator reads this from the artifact frontmatter and passes `match` directly to `router.subscribe()`.

### Web UI

- REQ-TRIG-38: Triggered commissions appear in the commission list alongside scheduled commissions. The list view shows:
  - Status gem indicator (matching the existing color scheme for `active`, `paused`, `completed`, `failed`)
  - A "Trigger" label appended to the title (same pattern as the "Recurring" label for scheduled commissions)
  - Worker name and creation timestamp
  - Prompt preview

- REQ-TRIG-39: The commission detail view for triggered commissions (`type: triggered`) shows trigger-specific panels in the sidebar, following the same conditional rendering pattern as scheduled commissions in `CommissionView.tsx`:

  1. **TriggerInfo panel** (parallel to `CommissionScheduleInfo`): Displays the trigger's configuration and runtime state:
     - Match rule summary: event type, projectName (if set), field patterns
     - Approval mode (`auto` or `confirm`)
     - Max depth
     - Runs completed count
     - Last triggered timestamp (formatted to local date/time)
     - Last spawned commission ID (clickable link to that commission's detail page)
     - Recent spawns section: list of recently spawned commissions (up to 10) with status and timestamp, same pattern as the scheduled commission's "recent runs" list

  2. **TriggerActions panel** (parallel to `CommissionScheduleActions`): Action buttons following the same confirmation pattern as halted commission action buttons:
     - **Pause/Resume** toggle: shows "Pause Trigger" when active, "Resume Trigger" when paused
     - **Complete Trigger** button: marks the trigger as completed (terminal)
     - Buttons are disabled when the daemon is offline
     - Each action calls a Next.js API route that proxies to the daemon

- REQ-TRIG-40: The Next.js API route for trigger status updates follows the existing proxy pattern. A `POST /api/commissions/[commissionId]/trigger-status` route proxies to the daemon, which delegates to the trigger evaluator's lifecycle methods (same path as `/api/commissions/[commissionId]/schedule-status` for scheduled commissions).

- REQ-TRIG-41: Triggered commissions use the existing commission filter groups. `active` triggers appear in the "Active" filter group; `paused` triggers appear in the "Idle" group; `completed` triggers appear in the "Done" group.

- REQ-TRIG-42: Spawned one-shot commissions created by a trigger show a "from: [trigger-id]" reference in the commission list, linking back to the parent trigger artifact. This follows the same pattern as scheduled commission spawns showing "from: [schedule-id]".

## Match Examples

These examples demonstrate what the Event Router provides automatically through `EventMatchRule` with field matching. The trigger evaluator writes these match rules; the router evaluates them.

Fire when any commission completes:

```yaml
trigger:
  match:
    type: commission_status
    fields:
      status: completed
```

Fire when a commission fails for a specific project:

```yaml
trigger:
  match:
    type: commission_status
    projectName: guild-hall
    fields:
      status: failed
```

Worker-scoped via commissionId pattern (glob matching from REQ-EVFM-9):

```yaml
trigger:
  match:
    type: commission_status
    fields:
      status: completed
      commissionId: "commission-Dalton-*"
```

Multiple terminal statuses via brace expansion (REQ-EVFM-10):

```yaml
trigger:
  match:
    type: commission_status
    fields:
      status: "{completed,failed}"
```

Exclude noisy statuses via negation (REQ-EVFM-11):

```yaml
trigger:
  match:
    type: commission_status
    fields:
      status: "!{pending,dispatched,in_progress}"
```

Schedule-scoped by ID pattern:

```yaml
trigger:
  match:
    type: schedule_spawned
    projectName: guild-hall
    fields:
      scheduleId: "nightly-*"
```

## Event Data Gap

The `commission_status` event carries `commissionId`, `status`, `oldStatus`, `projectName`, and `reason`. It does not carry the worker name. The `commission_result` event carries `commissionId`, `summary`, and `artifacts` but not `projectName` or worker name.

This means you cannot write a trigger match that says "when a Dalton commission completes" without using commissionId glob patterns as a workaround (`commissionId: "commission-Dalton-*"`). This works because commission IDs contain the worker name as a substring, but it's a convention, not a contract.

**Assessment:** This gap does not block the feature. Two mitigations work today:

1. **CommissionId patterns.** The naming convention `commission-{worker}-{timestamp}` is stable enough for glob matching. `commissionId: "commission-Dalton-*"` matches any Dalton commission.
2. **Smart prompts.** The triggered commission's prompt says "Review {{commissionId}}." The worker reads that commission's artifact, discovers the worker, and proceeds. The trigger creates enough context for the worker to take it from there.

**Flagged for follow-up:** If trigger usage reveals that commissionId patterns are too fragile, a follow-up spec should add optional `workerName` and `projectName` fields to `commission_status` and `commission_result` events. This is additive (new fields on `SystemEvent` variants, changes to emit sites in `apps/daemon/services/commission/lifecycle.ts` and `apps/daemon/services/commission/toolbox.ts`). The router's generic field matching picks up any new event fields automatically.

## Explicit Non-Goals

- **Config-based trigger definitions.** Triggers live as commission artifacts, not in `config.yaml`. The notification service owns config-based rules; triggered commissions own artifact-based rules.
- **Custom matching logic.** All matching is delegated to the Event Router. The trigger evaluator does not duplicate `matches()` or implement its own field comparison.
- **Event enrichment.** Events are not modified to carry additional metadata (worker name, tags). See "Event Data Gap" above.
- **Trust escalation.** No automatic promotion from `confirm` to `auto` based on firing history.
- **Trigger history or analytics.** State tracking (runs_completed, last_triggered, last_spawned_id) covers operational needs. No aggregate analytics.
- **Workflow definitions.** No way to compose triggers + dependencies into repeatable patterns. Use explicit dependency chains for sequencing.
- **Cross-project triggers.** Triggers are scoped to the project they live in. No cross-project dispatch.
- **Reusable commission templates.** Templates are inline in each trigger artifact.
- **Dry-run validation.** No way to test a trigger rule without emitting a real event.
- **Overlap prevention.** If an event matches three triggers, three commissions are created. Triggers are reactions to specific events, not recurring cadence. Each firing is independent.
- **Repeat/auto-completion.** Unlike scheduled commissions, triggers have no `repeat` field. They fire indefinitely until paused or completed manually.
- **Hot-reload from filesystem.** Triggers created or modified through the manager toolbox tools are registered immediately (REQ-TRIG-25d). Triggers added by hand-editing YAML are discovered on daemon startup only. No filesystem watch for external changes.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Event enrichment | Triggers fire too broadly without worker filtering | New spec: add `workerName` to commission events |
| Filesystem hot-reload | Users hand-editing trigger YAML want changes picked up without restart | Filesystem watch on `.lore/commissions/` for trigger artifacts |
| Trust escalation | Users want `confirm` triggers to auto-promote after N successful firings | New spec: firing history and promotion logic |
| Dry-run validation | Users can't test trigger rules without real events | New spec: `POST /triggers/test` endpoint |

## Success Criteria

- [ ] Trigger artifacts with `type: triggered` are scanned from `.lore/commissions/` at startup
- [ ] Active triggers register subscriptions on the Event Router via `router.subscribe()`
- [ ] Paused/completed/failed triggers do not register subscriptions
- [ ] Matching is handled entirely by the Event Router (no custom matching in the trigger evaluator)
- [ ] All `EventMatchRule` features work: type matching, projectName, fields with glob patterns, brace expansion, negation
- [ ] Matched triggers create one-shot commissions with correct worker, prompt, title, dependencies
- [ ] Template variables (`{{fieldName}}`) expand from event payload
- [ ] `triggered_by` frontmatter is written with source_id, trigger_artifact, and depth
- [ ] `approval: auto` creates and dispatches; `approval: confirm` creates in pending only
- [ ] Depth limit prevents runaway chains (commission created with `confirm` when depth exceeds maxDepth)
- [ ] Source exclusion prevents same-trigger self-loops
- [ ] Source exclusion is skipped (fail-open) when the source commission artifact cannot be read
- [ ] Non-commission event sources (e.g., `meeting_ended`) produce depth 1 without attempting artifact read
- [ ] Trigger artifact state is updated after each firing (runs_completed, last_triggered, last_spawned_id)
- [ ] Trigger dispatch failures are logged at `warn` and don't affect other dispatches
- [ ] `CommissionType` in `apps/daemon/types.ts` includes `"triggered"`
- [ ] `create_triggered_commission` tool in the manager toolbox creates trigger artifacts and registers subscriptions without daemon restart
- [ ] `update_trigger` tool modifies trigger configuration and manages subscriptions (pause removes, resume re-registers)
- [ ] Both tools validate inputs (event type against `SYSTEM_EVENT_TYPES`, worker against discovered packages, status transitions)
- [ ] Trigger list view shows active/paused/completed triggers with "Trigger" label, status gem, and runtime state
- [ ] Trigger detail view shows TriggerInfo panel (match rule, approval, depth, runs, last triggered, recent spawns)
- [ ] Trigger detail view shows TriggerActions panel (Pause/Resume toggle, Complete button) with confirmation pattern
- [ ] Spawned commissions show "from: [trigger-id]" in the commission list, linking to the parent trigger
- [ ] Next.js API route proxies trigger status updates to daemon
- [ ] No active triggers means no subscriptions (inert)
- [ ] All existing event router tests continue to pass
- [ ] New tests cover: trigger scanning, subscription registration, variable expansion, provenance, depth limiting, source exclusion, state updates, approval modes

## AI Validation

**Defaults:**
- Read the full spec before starting implementation.
- Verify every requirement has at least one test.
- Run `bun test` and confirm all tests pass before declaring work complete.

**Structural checks:**
- Confirm a `createTriggerEvaluator` factory exists in a new file (e.g., `apps/daemon/services/trigger-evaluator.ts`).
- Confirm the trigger evaluator receives an `EventRouter` instance and calls `router.subscribe()` for each active trigger.
- Confirm `createCommission` in `apps/daemon/services/commission/orchestrator.ts` supports `sourceTrigger` (with `triggerArtifact`, `sourceId`, `depth`) in options and writes `triggered_by` frontmatter.
- Confirm `CommissionType` in `apps/daemon/types.ts` includes `"triggered"` alongside `"one-shot"` and `"scheduled"`.
- Confirm the trigger evaluator is wired in `createProductionApp()` (`apps/daemon/app.ts`), created after the Event Router.
- Confirm the trigger evaluator uses `Log` from `apps/daemon/lib/log.ts`, not direct `console` calls.
- Confirm no matching logic exists in the trigger evaluator. All matching is in the Event Router.
- Confirm `makeCreateTriggeredCommissionHandler` and `makeUpdateTriggerHandler` exist in `apps/daemon/services/manager/toolbox.ts` following the `make*Handler(deps: ManagerToolboxDeps)` pattern.
- Confirm both tools are registered in the manager MCP server's tool list with Zod schemas for parameter validation.
- Confirm the trigger evaluator exposes `registerTrigger(artifactPath)` and `unregisterTrigger(commissionId)` methods for dynamic subscription management.
- Confirm `TriggerInfo` and `TriggerActions` components exist in `apps/web/components/commission/`.
- Confirm `CommissionView.tsx` conditionally renders trigger panels when `commissionType === "triggered"`.
- Confirm a `POST /api/commissions/[commissionId]/trigger-status` Next.js API route exists and proxies to the daemon.

**Behavioral checks:**
- Test that active triggers register subscriptions and receive matching events.
- Test that paused triggers do not register subscriptions.
- Test that `{{fieldName}}` expands correctly in prompt, title, dependencies.
- Test that undefined template variables expand to empty string.
- Test that `triggered_by` frontmatter is written with correct source_id, trigger_artifact, and depth.
- Test that depth is computed from source commission's `triggered_by.depth`.
- Test that depth defaults to 1 when source commission has no `triggered_by`.
- Test that depth is 1 for non-commission event sources (no artifact read attempted).
- Test that source exclusion skips a trigger when the source commission was created by the same trigger.
- Test that source exclusion does not skip when the source commission was created by a different trigger.
- Test that source exclusion is skipped (fail-open) when the source artifact is unreadable.
- Test that depth limit downgrades approval to `confirm`.
- Test that `approval: auto` calls both `createCommission` and `dispatchCommission`.
- Test that `approval: confirm` calls only `createCommission`.
- Test that trigger artifact state (runs_completed, last_triggered, last_spawned_id) is updated after firing.
- Test that trigger dispatch failures don't propagate.
- Test that no active triggers produces inert behavior.
- Test that existing notification routing is unaffected.
- Test that `create_triggered_commission` writes a valid trigger artifact and registers a subscription.
- Test that `create_triggered_commission` validates `match.type` against known event types and rejects invalid ones.
- Test that `create_triggered_commission` validates `workerName` against discovered packages and rejects unknown workers.
- Test that `update_trigger` transitions status correctly (active to paused, paused to active, either to completed).
- Test that `update_trigger` rejects invalid status transitions (e.g., completed to active).
- Test that `update_trigger` rejects updates to non-triggered commissions.
- Test that pausing a trigger via `update_trigger` removes the router subscription.
- Test that resuming a trigger via `update_trigger` re-registers the router subscription.
- Test that updating match/approval/prompt on an active trigger replaces the old subscription with a new one.
- Test that the trigger detail page renders TriggerInfo with match rule, approval, depth, runs_completed, and recent spawns.
- Test that TriggerActions buttons call the correct API endpoints and update trigger status.

## Constraints

- Triggers created through manager toolbox tools are registered immediately. Triggers added by hand-editing YAML are discovered on daemon startup only.
- Template expansion is simple string substitution only. No conditionals, loops, or nested access.
- Depth computation requires one filesystem read per trigger firing (source commission artifact). Acceptable given trigger firings are infrequent relative to event volume.
- Trigger state updates require one filesystem write per firing (trigger artifact). Same frequency concern; acceptable.
- The trigger handler must not block the Event Router's subscriber. All trigger work (artifact reads, commission creation, dispatch, state update) happens in a fire-and-forget async wrapper.

## Context

- Brainstorm: `.lore/brainstorm/triggered-commissions.md` (resolved design questions; its recommendation to use config.yaml was rejected in review)
- Advanced matching brainstorm: `.lore/brainstorm/event-router-advanced-matching.md` (led to field matching spec)
- Event router spec: `.lore/specs/infrastructure/event-router.md` (the generic matching layer)
- Field matching spec: `.lore/specs/infrastructure/event-router-field-matching.md` (glob pattern matching on fields)
- Event router implementation: `apps/daemon/services/event-router.ts` (provides `subscribe(rule, handler)`)
- Notification service implementation: `apps/daemon/services/notification-service.ts` (the first router consumer; trigger evaluator follows the same pattern)
- Scheduled commissions spec: `.lore/specs/commissions/guild-hall-scheduled-commissions.md` (the pattern triggers follow for artifact structure and state tracking)
- Commission orchestrator: `apps/daemon/services/commission/orchestrator.ts` (createCommission API)
