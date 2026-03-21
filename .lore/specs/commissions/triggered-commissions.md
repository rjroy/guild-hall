---
title: Triggered Commissions
date: 2026-03-20
status: draft
tags: [commissions, event-router, automation, triggers, config]
modules: [event-router, config, commission-orchestrator, event-bus]
related:
  - .lore/brainstorm/triggered-commissions.md
  - .lore/specs/infrastructure/event-router.md
  - .lore/specs/commissions/guild-hall-commissions.md
  - .lore/specs/commissions/guild-hall-scheduled-commissions.md
req-prefix: TRIG
---

# Spec: Triggered Commissions

## Overview

Triggered commissions are the third commission creation path. Manual dispatch and scheduled cron are the first two. This one is event-driven: when a system event matches a rule, the system creates and dispatches a commission. Same lifecycle as any other commission once it exists. The difference is what causes it to exist.

Triggers are stateless rules in `config.yaml`, not stateful artifacts. They are reactions ("when X happens, also do Y"), not sequencing tools. Sequencing belongs to dependency chains defined at plan time.

The implementation extends the existing event router with a `dispatch` action type alongside the existing `shell` and `webhook` channels. The router already loops over rules and dispatches. This adds a third action type that creates commissions instead of sending notifications.

## Entry Points

- Event router spec (`.lore/specs/infrastructure/event-router.md`) listed "finer rule matching" and "matching on status, commissionId, other event fields" as exit points. Triggered commissions are the use case that justifies those exit points.
- Triggered commissions brainstorm (`.lore/brainstorm/triggered-commissions.md`) resolved design questions around matching, loop prevention, approval, and architecture.
- Standing delegation brainstorm (`.lore/brainstorm/standing-delegation.md`) named the concept; this spec defines the mechanism.

## Requirements

### Config Schema

- REQ-TRIG-1: A new optional top-level field `triggers` is added to `config.yaml`, alongside the existing `channels` and `notifications`. When absent, trigger dispatch is inert.

  ```yaml
  triggers:
    - name: review-after-implement
      match:
        type: commission_status
        fields:
          status: completed
      commission:
        worker: guild-hall-reviewer
        prompt: "Review the work from commission {{commissionId}}."
        title: "Review: {{commissionId}}"
      approval: auto
  ```

- REQ-TRIG-2: Each trigger rule has four top-level fields:

  | Field | Required | Type | Purpose |
  |-------|----------|------|---------|
  | `name` | Yes | string | Unique identifier for the rule, used in provenance tracking and logs |
  | `match` | Yes | object | Event matching criteria |
  | `commission` | Yes | object | Template for the commission to create |
  | `approval` | No | `"auto"` or `"confirm"` | Dispatch behavior. Defaults to `"confirm"`. |

- REQ-TRIG-3: Trigger names must be non-empty strings matching `^[a-zA-Z0-9_-]+$` (same character constraints as channel names). Names must be unique across the `triggers` array. Duplicates are a config validation error.

### Match Object

- REQ-TRIG-4: The trigger `match` object extends the notification rule's match with optional payload field matching. It supports:

  | Field | Required | Purpose |
  |-------|----------|---------|
  | `type` | Yes | Event type discriminant (validated against `SYSTEM_EVENT_TYPES`) |
  | `projectName` | No | Exact match on the event's `projectName` field |
  | `fields` | No | Key-value pairs matched against the event payload |

- REQ-TRIG-5: The `fields` object contains string key-value pairs. Each key names a top-level field on the event payload; each value is an exact string match. All specified fields must match for the rule to fire (AND logic). Fields not present on the event cause the rule to not match (same skip behavior as `projectName` in REQ-EVRT-15).

  ```yaml
  match:
    type: commission_status
    fields:
      status: completed
  ```

  This matches any `commission_status` event where `status === "completed"`. Non-string event fields are coerced to string for comparison (`runNumber: 1` in the event matches `"1"` in the rule).

- REQ-TRIG-6: The `match.type` field validates against `SYSTEM_EVENT_TYPES` at config parse time, same as notification rules (REQ-EVRT-5). A trigger with an invalid event type is a config error.

- REQ-TRIG-7: When a trigger specifies `match.projectName` and the event does not carry `projectName`, the trigger does not match. No lookup, no resolution. Same stateless behavior as the notification router (REQ-EVRT-15).

### Commission Template

- REQ-TRIG-8: The `commission` object in a trigger rule defines the commission to create when the trigger fires:

  | Field | Required | Type | Purpose |
  |-------|----------|------|---------|
  | `worker` | Yes | string | Worker package name |
  | `prompt` | Yes | string | Commission prompt (supports template variables) |
  | `title` | No | string | Commission title (supports template variables). Defaults to `"Triggered: {trigger name}"`. |
  | `dependencies` | No | string[] | Commission dependency IDs (each supports template variables) |
  | `projectName` | No | string | Target project (supports template variables). When omitted, uses the event's `projectName` if present. |

- REQ-TRIG-9: The `commission.worker` field must reference a valid worker package name. This is validated at dispatch time (when the trigger fires), not at config parse time, because worker packages are discovered at startup and may differ from what's in config. A trigger that references an unknown worker logs a warning and skips dispatch, same as a notification routing to an undefined channel.

- REQ-TRIG-10: The `commission.projectName` field determines which project receives the triggered commission. Resolution order: (1) explicit `projectName` in the commission template (after variable expansion), (2) `projectName` from the matched event, (3) if neither is available, the trigger skips dispatch and logs a warning. A commission cannot be created without a project.

### Template Variable Expansion

- REQ-TRIG-11: The `prompt`, `title`, `dependencies`, and `projectName` fields in the commission template support `{{fieldName}}` substitution from the matched event's payload. This is simple string interpolation: `{{commissionId}}` becomes the literal string value of the event's `commissionId` field.

- REQ-TRIG-12: Template variables reference top-level fields on the event object. Nested access is not supported. The available variables depend on the event type:

  | Event Type | Available Variables |
  |------------|-------------------|
  | `commission_status` | `commissionId`, `status`, `oldStatus`, `projectName`, `reason` |
  | `commission_result` | `commissionId`, `summary`, `artifacts` |
  | `schedule_spawned` | `scheduleId`, `spawnedId`, `projectName`, `runNumber` |
  | `meeting_ended` | `meetingId` |

  Other event types are matchable but have fewer useful variables. Array values (like `artifacts`) are joined with commas when substituted into a string. Undefined or missing fields expand to empty string.

- REQ-TRIG-13: Template expansion happens after match evaluation, before commission creation. If expansion produces an empty `prompt` or `worker`, the trigger skips dispatch and logs a warning.

### Approval Model

- REQ-TRIG-14: Each trigger rule specifies `approval: auto` or `approval: confirm`. The default is `confirm` (human-in-the-loop).

- REQ-TRIG-15: For `approval: auto`, the triggered commission is created and immediately dispatched. This follows the same path as scheduled commission spawning: `createCommission()` then `dispatchCommission()`.

- REQ-TRIG-16: For `approval: confirm`, the triggered commission is created in `pending` status but not dispatched. The user is responsible for reviewing and manually dispatching or cancelling. The commission's `activity_timeline` records that it was created by a trigger and is awaiting approval.

- REQ-TRIG-17: When depth limiting forces a downgrade (REQ-TRIG-22), the effective approval is `confirm` regardless of the rule's configured approval. The downgrade is recorded in two places: (1) the `activity_timeline` entry describes the depth limit trigger (REQ-TRIG-22 specifies the format), and (2) no separate frontmatter field is needed because the commission's `status: pending` and the timeline entry together convey the downgrade.

### Provenance Tracking

- REQ-TRIG-18: Triggered commissions carry a `triggered_by` block in their YAML frontmatter:

  ```yaml
  triggered_by:
    source_id: commission-Dalton-20260320-143000
    trigger_rule: review-after-implement
    depth: 1
  ```

  | Field | Type | Purpose |
  |-------|------|---------|
  | `source_id` | string | The context ID from the event that fired the trigger: `commissionId` for commission events, `meetingId` for meeting events, `scheduleId` for schedule events. |
  | `trigger_rule` | string | The `name` of the trigger rule that fired |
  | `depth` | number | How many trigger firings deep this commission is in the chain |

- REQ-TRIG-19: The `depth` field is computed from the source's own `triggered_by.depth` when the source is a commission with a readable artifact. If the source commission has `depth: 1`, the new commission gets `depth: 2`. If the source commission has no `triggered_by` (it was manually created or scheduled), the new commission gets `depth: 1`. For non-commission event sources (e.g., `meeting_ended`, `schedule_spawned`), depth is always 1. No artifact read is attempted for non-commission sources.

- REQ-TRIG-20: For commission-sourced triggers, computing depth requires reading the source commission's artifact frontmatter to check for `triggered_by`. This is the one place the trigger system reads commission state. The read targets the integration worktree, same path used by `createCommission`. If the artifact cannot be read (not found, parse error), depth defaults to 1 and a warning is logged. For non-commission sources, this read is skipped entirely.

### Loop Prevention

- REQ-TRIG-21: Two mechanisms prevent runaway trigger chains:

  1. **Depth limit** (primary): A configurable maximum trigger depth. When a triggered commission would exceed this depth, the safety behavior from REQ-TRIG-22 applies.
  2. **Source exclusion** (secondary): A trigger rule does not fire on events from commissions that were themselves created by the same trigger rule.

- REQ-TRIG-22: The depth limit is configurable per trigger rule via an optional `maxDepth` field (default: 3). When a trigger would create a commission at depth > maxDepth, the commission is still created but with `approval: confirm` regardless of the rule's configured approval. The `activity_timeline` records: `"Depth limit reached (depth N > maxDepth M). Created with approval: confirm."` This ensures humans review deep chains without silently dropping triggered work.

- REQ-TRIG-23: Source exclusion works by comparing the event's source commission's `triggered_by.trigger_rule` against the current rule's `name`. If they match, the rule skips. This prevents the most common accidental loop: a review trigger firing on its own review commissions. Source exclusion only applies to commission-sourced events (where an artifact can be read). Non-commission sources cannot be self-loops by definition.

  Example: The trigger `review-after-implement` fires when Dalton completes. It creates a review commission. When the review commission completes, the `commission_status` event has a `commissionId` whose artifact has `triggered_by.trigger_rule: "review-after-implement"`. The same trigger rule sees this and skips.

- REQ-TRIG-24: Source exclusion requires the same artifact read as depth computation (REQ-TRIG-20). Both checks happen in one read. If the artifact is unreadable, source exclusion is skipped (fail-open; the depth limit is still the primary safety mechanism).

### Architecture

- REQ-TRIG-25: Trigger dispatch is a new action type on the existing event router, extending `createEventRouter`. The router's subscriber callback evaluates notification rules (existing behavior) and trigger rules (new behavior) against each event.

- REQ-TRIG-26: `EventRouterDeps` gains two new fields:

  | Field | Type | Purpose |
  |-------|------|---------|
  | `triggers` | `TriggerRule[]` | Parsed trigger rules from config |
  | `dispatchTrigger` | `(rule, event) => Promise<void>` | Callback that creates and dispatches the triggered commission |

  The `dispatchTrigger` callback is a DI seam. In production, it calls `commissionSession.createCommission()` and optionally `commissionSession.dispatchCommission()`. In tests, it's a mock. The router does not import commission infrastructure directly.

- REQ-TRIG-27: When triggers are absent or empty, the router behaves exactly as today. The new code path only activates when `triggers.length > 0`. The existing inertness guard in `createEventRouter` (REQ-EVRT-25) currently returns a no-op when channels or notifications are empty. This guard must change: the router returns a no-op only when it has no channels-with-notifications AND no triggers. A user with only triggers (no channels, no notifications) must still get an active router. The updated condition is: `(no channels || no notifications) && no triggers`.

- REQ-TRIG-28: Trigger dispatch is fire-and-forget async, same as channel dispatch (REQ-EVRT-11). Failures are logged at `warn` level with the trigger name, event type, and error message. A failed trigger does not affect other triggers or notification dispatches for the same event.

- REQ-TRIG-29: The `dispatchTrigger` callback is responsible for: reading the source commission artifact (for depth and source exclusion), computing the effective approval, performing template variable expansion, calling `createCommission`, and conditionally calling `dispatchCommission`. This logic lives outside the router (in a dedicated trigger dispatch function wired in `createProductionApp`), keeping the router itself a thin matching-and-routing layer.

### Config Validation

- REQ-TRIG-30: The `triggers` array is validated by a Zod schema added to `appConfigSchema`. The schema validates:
  - `name`: non-empty, matches `^[a-zA-Z0-9_-]+$`, unique across triggers
  - `match.type`: valid `SystemEvent` type
  - `match.projectName`: optional string
  - `match.fields`: optional `Record<string, string>`
  - `commission.worker`: non-empty string
  - `commission.prompt`: non-empty string
  - `commission.title`: optional string
  - `commission.dependencies`: optional `string[]`
  - `commission.projectName`: optional string
  - `approval`: optional, one of `"auto"` or `"confirm"`
  - `maxDepth`: optional positive integer

- REQ-TRIG-31: Trigger name uniqueness is enforced via `superRefine` on the triggers array, following the pattern used for model name uniqueness in `appConfigSchema`.

### Type Definitions

- REQ-TRIG-32: New types are added to `lib/types.ts`:

  ```typescript
  interface TriggerCommissionTemplate {
    worker: string;
    prompt: string;
    title?: string;
    dependencies?: string[];
    projectName?: string;
  }

  interface TriggerRule {
    name: string;
    match: {
      type: SystemEventType;
      projectName?: string;
      fields?: Record<string, string>;
    };
    commission: TriggerCommissionTemplate;
    approval?: "auto" | "confirm";
    maxDepth?: number;
  }
  ```

- REQ-TRIG-33: `AppConfig` gains an optional `triggers?: TriggerRule[]` field.

- REQ-TRIG-34: The `triggered_by` type for commission frontmatter is defined and used when writing triggered commission artifacts:

  ```typescript
  interface TriggeredBy {
    source_id: string;
    trigger_rule: string;
    depth: number;
  }
  ```

### Commission Creation

- REQ-TRIG-35: Triggered commissions are created through the existing `createCommission` API on `CommissionSessionForRoutes`. The `options` parameter is extended with trigger provenance fields, following the pattern of the existing `sourceSchedule`:

  ```typescript
  options?: {
    type?: CommissionType;
    sourceSchedule?: string;
    sourceTrigger?: {
      triggerRule: string;
      sourceId: string;
      depth: number;
    };
  }
  ```

  `sourceTrigger` and `sourceSchedule` are mutually exclusive. A commission is created by one mechanism.

- REQ-TRIG-36: When `options.sourceTrigger` is provided, `createCommission` writes the `triggered_by` block into the commission artifact frontmatter using the values from `sourceTrigger` (`triggerRule` maps to `trigger_rule`, `sourceId` maps to `source_id`, `depth` maps to `depth`).

- REQ-TRIG-37: The `activity_timeline` entry for trigger-created commissions records: `"Commission created by trigger: {rule name} (source: {source commission ID}, depth: {N})"`.

## Explicit Non-Goals

- **Artifact-based trigger definitions.** Triggers live in `config.yaml` only. No `.lore/triggers/` directory.
- **Glob/pattern matching on fields.** Match fields use exact string comparison. No micromatch, no wildcards. Without pattern matching and without worker name on events, triggers cannot be scoped to a specific worker type without also controlling project scoping.
- **Event enrichment.** Events are not modified to carry additional metadata (worker name, tags). See "Event Data Gap" below.
- **Trust escalation.** No automatic promotion from `confirm` to `auto` based on firing history.
- **Trigger history or analytics.** No tracking of how often rules fire or what they produce.
- **Workflow definitions.** No way to compose triggers + dependencies into repeatable patterns.
- **Cross-project triggers.** The `commission.projectName` template field enables targeting a different project than the event source, but this is not a first-class cross-project feature. No project-scoped trigger rules.
- **Reusable commission templates.** Templates are inline in each trigger rule.
- **Dry-run validation.** No way to test a trigger rule without emitting a real event.
- **Overlap prevention.** If an event matches a trigger three times (via three rules), three commissions are created. Triggers are reactions to specific events, not recurring cadence.
- **Hot-reload.** Config is read at startup. Changes require a daemon restart (same limitation as channels and notifications).

## Event Data Gap

The `commission_status` event carries `commissionId`, `status`, `oldStatus`, `projectName`, and `reason`. It does not carry the worker name. The `commission_result` event carries `commissionId`, `summary`, and `artifacts` but not `projectName` or worker name.

This means you cannot write a trigger rule that says "when a Dalton commission completes" using the match object alone. You would need to either:

1. Match broadly on `commission_status` with `status: completed` and rely on the triggered commission's own intelligence to determine context from the prompt (viable: the prompt includes `{{commissionId}}` and the worker can read the artifact).
2. Match on `projectName` to scope the trigger to a specific project (partially useful).

**Assessment for v1:** This gap does not block v1. The "smart prompt" approach works because triggered commissions are full commissions with access to the filesystem. A review trigger's prompt says "Review {{commissionId}}" and the review worker reads that commission's artifact, discovers the worker, and proceeds. The trigger creates the commission with enough context for the worker to take it from there.

**Flagged for design pass:** If v1 trigger usage reveals that the lack of worker name on events makes triggers too coarse-grained (too many false-positive firings), a follow-up spec should add optional fields to `commission_status` and `commission_result` events. This is an additive change to the event types in `daemon/lib/event-bus.ts` and the emit sites in `daemon/services/commission/lifecycle.ts` and `daemon/services/commission/toolbox.ts`. It requires no changes to the trigger matching logic, which already handles arbitrary string fields via `match.fields`.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Event enrichment | Triggers fire too broadly without worker/tag filtering | New spec: add worker name and optional tags to commission events |
| Artifact-based triggers | Users need the Guild Master to create/modify triggers without config edits | New spec: `.lore/triggers/` artifacts with discovery |
| Pattern matching | Exact-match fields are insufficient (need "any Dalton commission" via glob) | Extend `match.fields` to support micromatch patterns |
| Trust escalation | Users want `confirm` triggers to auto-promote after N successful firings | New spec: firing history and promotion logic |
| Dry-run validation | Users can't test trigger rules without real events | New spec: `POST /triggers/test` endpoint |

## Success Criteria

- [ ] `triggers` field parses and validates in `config.yaml`
- [ ] Zod schema rejects: invalid trigger names, duplicate names, invalid event types, empty worker/prompt, invalid approval values
- [ ] Router evaluates trigger rules alongside notification rules
- [ ] Matching supports `type`, `projectName`, and `fields` (exact string match on event payload)
- [ ] Matched triggers create commissions with correct worker, prompt, title, dependencies, and projectName
- [ ] Template variables (`{{fieldName}}`) expand from event payload
- [ ] `triggered_by` frontmatter is written with source_id, trigger_rule, and depth
- [ ] `approval: auto` creates and dispatches; `approval: confirm` creates in pending only
- [ ] Depth limit prevents runaway chains (commission created with `confirm` when depth exceeds maxDepth)
- [ ] Source exclusion prevents same-rule self-loops
- [ ] Source exclusion is skipped (fail-open) when the source commission artifact cannot be read
- [ ] Trigger on `commission_result` with no `projectName` in template and no `projectName` on event skips dispatch with warning
- [ ] Non-commission event sources (e.g., `meeting_ended`) produce depth 1 without attempting artifact read
- [ ] Trigger dispatch failures are logged at `warn` and don't affect other dispatches
- [ ] Router is inert when no triggers are configured (backward compatible)
- [ ] All existing event router tests continue to pass
- [ ] New tests cover trigger matching, variable expansion, provenance, depth limiting, and source exclusion

## AI Validation

**Defaults:**
- Read the full spec before starting implementation.
- Verify every requirement has at least one test.
- Run `bun test` and confirm all tests pass before declaring work complete.

**Structural checks:**
- Confirm `appConfigSchema` in `lib/config.ts` includes trigger schema with name uniqueness validation.
- Confirm `AppConfig` in `lib/types.ts` includes the `triggers` field and new types (`TriggerRule`, `TriggerCommissionTemplate`, `TriggeredBy`).
- Confirm `EventRouterDeps` in `daemon/services/event-router.ts` includes `triggers` and `dispatchTrigger`.
- Confirm `createCommission` in `daemon/services/commission/orchestrator.ts` supports `sourceTrigger` (with `triggerRule`, `sourceId`, `depth`) in options and writes `triggered_by` frontmatter.
- Confirm the trigger dispatch function is wired in `createProductionApp()` (`daemon/app.ts`).

**Behavioral checks:**
- Test that trigger rules match on `type` alone.
- Test that trigger rules match on `type` + `projectName`.
- Test that trigger rules match on `type` + `fields` (exact string match).
- Test that `fields` matching skips events where the field is absent (not an error).
- Test that non-string event fields are coerced to string for comparison.
- Test that `{{fieldName}}` expands correctly in prompt, title, dependencies.
- Test that undefined template variables expand to empty string.
- Test that `triggered_by` frontmatter is written with correct source_id, trigger_rule, and depth.
- Test that depth is computed from source commission's `triggered_by.depth`.
- Test that depth defaults to 1 when source commission has no `triggered_by`.
- Test that depth is 1 for non-commission event sources (no artifact read attempted).
- Test that source exclusion skips a rule when the source commission was created by the same rule.
- Test that source exclusion is skipped (fail-open) when the source artifact is unreadable.
- Test that depth limit downgrades approval to `confirm`.
- Test that `approval: auto` calls both `createCommission` and `dispatchCommission`.
- Test that `approval: confirm` calls only `createCommission`.
- Test that trigger dispatch failures don't propagate.
- Test that an empty triggers array produces inert behavior.
- Test that existing notification routing is unaffected.
- Test that a trigger on `commission_result` with no `projectName` in template skips dispatch and logs a warning.
- Test that non-commission event sources (e.g., `meeting_ended`) produce depth 1 triggered commissions without artifact reads.
- Test that the router subscribes when only triggers are configured (no channels/notifications).

## Constraints

- Triggers require daemon restart to change (config is read at startup).
- Template expansion is simple string substitution only. No conditionals, loops, or nested access.
- Depth computation requires one filesystem read per trigger firing (source commission artifact). This is acceptable given trigger firings are infrequent relative to event volume.
- The `dispatchTrigger` callback must not block the event router's subscriber. All trigger work (artifact reads, commission creation, dispatch) happens in a fire-and-forget async wrapper.

## Review Notes (2026-03-21)

**Blocking concern: this spec needs significant revision before approval.**

The following decisions were made in a review meeting. The spec as written does not reflect them yet. The event router architecture question (below) must be resolved before this spec can be finalized.

### Decision: Triggers are commission artifacts, not config rules

REQ-TRIG-1 places triggers in `config.yaml` alongside `channels` and `notifications`. This is wrong. Triggered commissions should follow the same pattern as scheduled commissions:

- Live in `.lore/commissions/` as commission artifacts with `type: triggered`
- Daemon scans commission directories at startup, registers triggers (same as scheduled commissions)
- When an event matches, spawn a one-shot commission from the template
- Guild Master can create them; users see them in the commissions list

The rationale: anything that spawns commissions should live in commission artifacts. Scheduled and triggered commissions do the same thing (spawn one-shot commissions from a template), differing only in activation mechanism (cron tick vs event match). Splitting them across config.yaml and artifacts splits a single concept across two homes.

### Decision: Triggers are stateful, not stateless

The brainstorm argued triggers are "stateless rules" and therefore belong in config. This was rejected. Triggers should track state like scheduled commissions do: how many times they've fired, when they last fired, what they last spawned. They should also be project-scoped (config.yaml is global, not tied to any project).

Expected frontmatter shape:

```yaml
---
type: triggered
status: active
worker: guild-hall-reviewer
prompt: "Review the work from commission {{commissionId}}."
title: "Review: {{commissionId}}"
triggers:
  match:
    type: commission_status
    fields:
      status: completed
  approval: auto
  maxDepth: 3
  runs_completed: 0
  last_triggered: null
  last_spawned_id: null
---
```

### Decision: No `repeat` field

Unlike scheduled commissions, triggered commissions do not support a `repeat` (max firings) field. They are standing reactions until paused or completed manually.

### Unresolved: Event router architecture

The event router's `channels` and `notifications` live in the global `config.yaml`, not scoped to any project. This is inconsistent with the rest of Guild Hall, where everything is project-centric. The triggered commissions spec assumed it would extend the event router, but if the event router's architecture changes (e.g., notification rules become project-scoped artifacts), the trigger evaluator's design changes with it.

This must be resolved before finalizing the triggered commissions spec. Specifically:

- Should a new trigger evaluator service subscribe to the EventBus independently (like the scheduler), rather than extending the event router?
- Does the event router itself need to move to a project-scoped model?

### Requirements affected

If the commission-artifact model is adopted, the following requirements need rewriting or removal:

- **REQ-TRIG-1** (config.yaml location): Replace entirely. Triggers live in commission artifacts.
- **REQ-TRIG-2, 3** (trigger rule shape, name validation): Rewrite to describe frontmatter fields instead of config array entries.
- **REQ-TRIG-25, 26, 27** (event router extension, EventRouterDeps): Likely replaced by a trigger evaluator service that subscribes to EventBus directly.
- **REQ-TRIG-29** (dispatchTrigger callback): May change depending on trigger evaluator architecture.
- **REQ-TRIG-30, 31** (Zod config validation): Replace with commission artifact schema validation.
- **REQ-TRIG-32, 33** (types in lib/types.ts, AppConfig): `AppConfig.triggers` field is no longer needed. Types move to commission schema.

Requirements likely preserved with minor adjustments:
- **REQ-TRIG-4 through 7** (match object): Core matching logic is sound regardless of where triggers live.
- **REQ-TRIG-8 through 13** (commission template, variable expansion): Template fields move to frontmatter but the mechanics are the same.
- **REQ-TRIG-14 through 17** (approval model): Unchanged.
- **REQ-TRIG-18 through 24** (provenance, loop prevention): Unchanged.
- **REQ-TRIG-35 through 37** (commission creation API): Unchanged.

## Context

- Brainstorm: `.lore/brainstorm/triggered-commissions.md` (resolved design questions, but its recommendation to use config.yaml was rejected)
- Event router spec: `.lore/specs/infrastructure/event-router.md` (architecture under review)
- Event router implementation: `daemon/services/event-router.ts`
- EventBus types: `daemon/lib/event-bus.ts`
- Scheduled commissions spec: `.lore/specs/commissions/guild-hall-scheduled-commissions.md` (the pattern triggers should follow)
- Commission orchestrator: `daemon/services/commission/orchestrator.ts` (createCommission API)
