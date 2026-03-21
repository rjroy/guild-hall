---
title: "Event Router: Field Matching"
date: 2026-03-21
status: draft
tags: [event-router, matching, notifications, config, infrastructure]
modules: [event-router, config, types]
related:
  - .lore/specs/infrastructure/event-router.md
  - .lore/brainstorm/event-router-advanced-matching.md
req-prefix: EVFM
---

# Spec: Event Router Field Matching

## Overview

This spec adds arbitrary payload field matching to the Event Router's `EventMatchRule`. A new optional `fields` property holds key-value pairs that are compared against top-level fields on the event object. All field conditions must match (AND logic). This is Phase 1 of the advanced matching extension outlined in the brainstorm at `.lore/brainstorm/event-router-advanced-matching.md`.

The primary gap this fills: the Event Router can filter on `type` and `projectName`, but not on payload fields like `status`. "Notify when a commission completes" requires matching `commission_status` events where `status` equals `"completed"`, which the router cannot express today. The implemented Event Router spec (`event-router.md`) named this as an explicit exit point (line 190): "Extend `EventMatchRule` with additional optional fields."

## Entry Points

- Event Router spec exit point: "Finer rule matching" (`.lore/specs/infrastructure/event-router.md`, line 190).
- Advanced Matching brainstorm, Phase 1 recommendation (`.lore/brainstorm/event-router-advanced-matching.md`, "Recommended Direction" section).
- Consumer needs analysis in the brainstorm identifies status filtering as the #1 unmet need for both notifications and triggered commissions.

## Scope

**In scope:** Add `fields?: Record<string, string>` to `EventMatchRule` for exact string matching against arbitrary event payload fields. Update the match evaluation, config schema, and TypeScript types.

**Out of scope:** Glob/pattern matching on field values (Phase 2), event enrichment (parallel track), triggered commissions (separate spec), compound/OR rules, condition expressions.

## Requirements

### Match Rule Extension

- REQ-EVFM-1: `EventMatchRule` gains an optional `fields` property of type `Record<string, string>`:

  ```typescript
  export interface EventMatchRule {
    type: SystemEventType;
    projectName?: string;
    fields?: Record<string, string>;
  }
  ```

  The interface is defined in `daemon/services/event-router.ts`. This is an additive change. Existing rules without `fields` continue to work unchanged.

- REQ-EVFM-2: When a rule specifies `fields`, the `matches()` function iterates over each entry. For each key-value pair `(key, expected)`:
  1. If the event object does not have the key as a top-level property, the rule does not match (skip, not error).
  2. If the event object has the key, its value is coerced to a string via `String()` and compared to `expected` as an exact string match.
  3. All field conditions must hold for the rule to match (AND logic).

  This is consistent with the existing `projectName` behavior: a rule that specifies a field the event doesn't carry silently skips.

- REQ-EVFM-3: The `fields` check runs after the `type` and `projectName` checks. Evaluation order: type (exact), projectName (if specified), fields (if specified). A rule that fails type or projectName matching short-circuits before evaluating fields.

- REQ-EVFM-4: The `fields` object may be empty (`{}`). An empty `fields` object imposes no additional constraints and matches the same as a rule without `fields`.

- REQ-EVFM-5: Field keys in `fields` are not validated against the event type's known properties. A rule with `fields: { nonexistent: "foo" }` is valid config but never matches any event, since no event carries a `nonexistent` property. This is the same silent-skip behavior as matching `projectName` on events that don't carry it.

### `projectName` Remains Separate

- REQ-EVFM-6: `projectName` stays as a dedicated named field on `EventMatchRule`. It is not migrated into `fields`. Both `projectName: "guild-hall"` at the rule level and `fields: { projectName: "guild-hall" }` are functionally equivalent, but the dedicated field is kept for config ergonomics and backward compatibility.

  If both `projectName` and `fields.projectName` are specified on the same rule, both must match. No conflict resolution is needed because both apply AND logic against the same event property.

### Config Schema

- REQ-EVFM-7: The `notificationRuleSchema` in `lib/config.ts` extends the `match` object with an optional `fields` property:

  ```typescript
  export const notificationRuleSchema = z.object({
    match: z.object({
      type: z.enum(SYSTEM_EVENT_TYPES),
      projectName: z.string().optional(),
      fields: z.record(z.string(), z.string()).optional(),
    }),
    channel: z.string(),
  });
  ```

  Field keys are arbitrary strings. Field values are strings. No further validation on key names.

- REQ-EVFM-8: The `NotificationRule` type in `lib/types.ts` mirrors the schema:

  ```typescript
  export interface NotificationRule {
    match: { type: SystemEventType; projectName?: string; fields?: Record<string, string> };
    channel: string;
  }
  ```

### No Changes Required

- REQ-EVFM-9: The notification service (`daemon/services/notification-service.ts`) requires no changes. It passes `rule.match` through to `router.subscribe()` untouched. The new `fields` property flows through the existing code path.

- REQ-EVFM-10: The EventBus (`daemon/lib/event-bus.ts`) and all event emit sites require no changes. The `fields` matching reads whatever properties events already carry. No event enrichment is part of this spec.

- REQ-EVFM-11: The `EventRouter` interface (the `subscribe` method signature) does not change. It already accepts `EventMatchRule`, which gains the optional `fields` property.

## Config Examples

Status filtering (the primary use case):

```yaml
notifications:
  - match:
      type: commission_status
      fields:
        status: completed
    channel: desktop
```

Combined with projectName:

```yaml
notifications:
  - match:
      type: commission_status
      projectName: guild-hall
      fields:
        status: failed
    channel: ops-webhook
```

Matching on commissionId (exact):

```yaml
notifications:
  - match:
      type: commission_status
      fields:
        commissionId: "commission-Dalton-20260321-143000"
    channel: desktop
```

Multiple field conditions (AND):

```yaml
notifications:
  - match:
      type: commission_status
      fields:
        status: completed
        projectName: guild-hall
    channel: desktop
```

## Coercion Behavior

Event fields are not all strings. The `runNumber` field on `schedule_spawned` is a number. The `artifacts` field on `commission_result` is an array. The `String()` coercion handles these cases:

| Event field value | `String()` result | Matches rule value |
|-------------------|-------------------|--------------------|
| `"completed"` | `"completed"` | `"completed"` |
| `42` | `"42"` | `"42"` |
| `["a.md", "b.md"]` | `"a.md,b.md"` | `"a.md,b.md"` (fragile, but valid) |
| `undefined` | Field missing, skip | No match |

Matching against coerced arrays or objects is technically possible but not a recommended pattern. The primary use case is matching string fields (`status`, `commissionId`, `projectName`, `worker`, `summary`, etc.).

## Explicit Non-Goals

- **Glob or pattern matching on field values.** Exact string comparison only. Phase 2 (brainstorm section "Phase 2: Glob Patterns via Micromatch") upgrades this to `micromatch.isMatch()`. This spec does not include that.
- **Validation of field names against event type schemas.** A rule can name any field. If the event doesn't carry it, the rule silently skips. No compile-time or parse-time validation that the field exists on the specified event type.
- **Negation.** No `!` prefix or `not` wrapper. Negation comes free in Phase 2 via micromatch.
- **Compound rules (OR).** Two separate rules pointing at the same channel accomplish OR. No `any` or array-of-match syntax.
- **Event enrichment.** Adding `workerName` or `projectName` to more event types is a parallel track, not part of this spec.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Glob pattern matching | Users need worker-scoping via commissionId patterns, negation, or multi-value matching | Phase 2: upgrade `fields` comparison to `micromatch.isMatch()` |
| Field name validation | Users are confused by typos in field names that silently never match | Add event-type-aware validation in the config schema |
| Event enrichment | Matching on worker name or projectName is needed for events that don't carry those fields | Add fields to `SystemEvent` variants at emit sites |

## Success Criteria

- [ ] `EventMatchRule` in `daemon/services/event-router.ts` includes `fields?: Record<string, string>`
- [ ] `matches()` evaluates `fields` entries with exact string comparison after `type` and `projectName` checks
- [ ] Missing event fields cause skip (no match), not error
- [ ] Non-string event field values are coerced via `String()` before comparison
- [ ] All field conditions use AND logic (all must match)
- [ ] Empty `fields` object (`{}`) imposes no additional constraints
- [ ] `NotificationRule` in `lib/types.ts` includes `fields` on the `match` object
- [ ] `notificationRuleSchema` in `lib/config.ts` includes `fields` as `z.record(z.string(), z.string()).optional()`
- [ ] Existing rules without `fields` continue to work unchanged (backward compatible)
- [ ] Notification service passes `fields` through to the router without modification
- [ ] All existing Event Router tests continue to pass
- [ ] New tests cover: field match, field mismatch, missing field skip, multiple fields AND, coercion, empty fields, combined with projectName

## AI Validation

**Defaults:**
- Read the full spec before starting implementation.
- Verify every requirement has at least one test.
- Run `bun test` and confirm all tests pass before declaring work complete.

**Structural checks:**
- Confirm `EventMatchRule` in `daemon/services/event-router.ts` has `fields?: Record<string, string>`.
- Confirm `matches()` in `daemon/services/event-router.ts` iterates `rule.fields` entries after the `projectName` check, using `String()` coercion and exact comparison.
- Confirm `notificationRuleSchema` in `lib/config.ts` includes `fields: z.record(z.string(), z.string()).optional()` inside the `match` object.
- Confirm `NotificationRule` in `lib/types.ts` includes `fields?: Record<string, string>` on the `match` property.
- Confirm no changes to `daemon/services/notification-service.ts`, `daemon/lib/event-bus.ts`, or any event emit sites.

**Behavioral checks:**
- Test that a rule with `fields: { status: "completed" }` matches a `commission_status` event with `status: "completed"`.
- Test that a rule with `fields: { status: "completed" }` does not match a `commission_status` event with `status: "failed"`.
- Test that a rule with `fields: { workerName: "Dalton" }` does not match a `commission_status` event that has no `workerName` field (missing field skip).
- Test that a rule with `fields: { status: "completed", commissionId: "c1" }` only matches when both conditions hold.
- Test that a rule with `fields: { runNumber: "1" }` matches a `schedule_spawned` event where `runNumber` is the number `1` (coercion via `String()`).
- Test that a rule with `fields: {}` matches the same events as a rule without `fields`.
- Test that a rule with both `projectName: "guild-hall"` and `fields: { status: "completed" }` requires both conditions.
- Test that all existing Event Router tests pass without modification.
