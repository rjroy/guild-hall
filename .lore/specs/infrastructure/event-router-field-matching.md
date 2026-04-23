---
title: "Event Router: Field Matching"
date: 2026-03-21
status: implemented
tags: [event-router, matching, micromatch, glob, notifications, config, infrastructure]
modules: [event-router, config, types]
related:
  - .lore/specs/infrastructure/event-router.md
  - .lore/brainstorm/event-router-advanced-matching.md
req-prefix: EVFM
---

# Spec: Event Router Field Matching

## Overview

This spec adds arbitrary payload field matching to the Event Router's `EventMatchRule`. A new optional `fields` property holds key-value pairs matched against top-level fields on the event object using micromatch glob patterns. All field conditions must match (AND logic).

The gap this fills: the Event Router can filter on `type` and `projectName`, but not on payload fields like `status`. "Notify when a commission completes" requires matching `commission_status` events where `status` equals `"completed"`, which the router cannot express today. The implemented Event Router spec (`event-router.md`) named this as an explicit exit point (line 190): "Extend `EventMatchRule` with additional optional fields."

Field values are glob patterns evaluated by `micromatch.isMatch()`. Plain strings without glob characters match themselves literally (backward compatible with exact match behavior). Glob support enables brace expansion (`{completed,failed}`) for single-field OR, wildcards (`commission-Dalton-*`) for pattern matching, and negation (`!pending`) for exclusion.

## Entry Points

- Event Router spec exit point: "Finer rule matching" (`.lore/specs/infrastructure/event-router.md`, line 190).
- Advanced Matching brainstorm recommendation (`.lore/brainstorm/event-router-advanced-matching.md`, "Recommended Direction" section).
- Consumer needs analysis in the brainstorm identifies status filtering as the #1 unmet need for both notifications and triggered commissions.

## Scope

**In scope:** Add `fields?: Record<string, string>` to `EventMatchRule` with micromatch glob pattern matching against arbitrary event payload fields. Update the match evaluation, config schema, and TypeScript types. Handle invalid glob patterns gracefully.

**Out of scope:** Event enrichment (parallel track), triggered commissions (separate spec), compound/OR rules, condition expressions, glob matching on `type` or `projectName`.

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

  The interface is defined in `apps/daemon/services/event-router.ts`. This is an additive change. Existing rules without `fields` continue to work unchanged.

- REQ-EVFM-2: When a rule specifies `fields`, the `matches()` function iterates over each entry. For each key-value pair `(key, pattern)`:
  1. If the event object does not have the key as a top-level property, the rule does not match (skip, not error).
  2. If the event object has the key, its value is coerced to a string via `String()` and matched against `pattern` using `micromatch.isMatch()`.
  3. All field conditions must hold for the rule to match (AND logic).

  This is consistent with the existing `projectName` behavior: a rule that specifies a field the event doesn't carry silently skips.

- REQ-EVFM-3: The `fields` check runs after the `type` and `projectName` checks. Evaluation order: type (exact), projectName (if specified), fields (if specified). A rule that fails type or projectName matching short-circuits before evaluating fields.

- REQ-EVFM-4: The `fields` object may be empty (`{}`). An empty `fields` object imposes no additional constraints and matches the same as a rule without `fields`.

- REQ-EVFM-5: Field keys in `fields` are not validated against the event type's known properties. A rule with `fields: { nonexistent: "foo" }` is valid config but never matches any event, since no event carries a `nonexistent` property. This is the same silent-skip behavior as matching `projectName` on events that don't carry it.

### Glob Pattern Matching

- REQ-EVFM-6: micromatch is called without the `{ dot: true }` option. Event field values are plain strings (status codes, identifiers, summaries), not file paths. The `dot` option controls whether `*` matches strings starting with `.`, which is file-path semantics. For event fields, the default behavior (no special treatment of dots) is correct.

  This differs from the existing micromatch usage in `apps/daemon/lib/agent-sdk/sdk-runner.ts` (line 292), which uses `{ dot: true }` because it matches file paths and shell commands. The difference is intentional.

- REQ-EVFM-7: No options object is passed to `micromatch.isMatch()`. The call is `micromatch.isMatch(value, pattern)` with two arguments only. Default micromatch behavior applies for all settings.

- REQ-EVFM-8: Exact strings without glob characters (`*`, `?`, `[`, `]`, `{`, `}`, `!` at start) match themselves literally under micromatch. Every rule using plain string values produces identical results to exact comparison. This is a micromatch guarantee, not something the implementation enforces.

### Pattern Capabilities

These are not features the implementation builds. They are consequences of using micromatch. The spec documents them so consumers know what's available.

- REQ-EVFM-9: **Wildcards.** `*` matches any sequence of characters except path separators. `?` matches exactly one character. For event field values (which don't contain path separators), `*` effectively matches any string.

  ```yaml
  fields:
    commissionId: "commission-Dalton-*"     # any Dalton commission
    status: "c*"                            # completed, cancelled, ...
  ```

- REQ-EVFM-10: **Brace expansion.** `{a,b,c}` matches any of the comma-separated alternatives. This provides single-field OR without compound rules.

  ```yaml
  fields:
    status: "{completed,failed}"    # completed OR failed
  ```

- REQ-EVFM-11: **Negation.** A `!` prefix negates the pattern. `!pending` matches any value that is not `"pending"`. Negation can combine with other patterns: `!{pending,dispatched}` matches anything except `"pending"` or `"dispatched"`.

  ```yaml
  fields:
    status: "!pending"                      # anything except pending
    status: "!{pending,dispatched}"         # anything except pending or dispatched
  ```

- REQ-EVFM-12: **Character classes.** `[abc]` matches any single character in the set. `[!abc]` matches any character not in the set. Available but unlikely to see practical use for event fields.

### `projectName` Remains Separate

- REQ-EVFM-13: `projectName` stays as a dedicated named field on `EventMatchRule`. It is not migrated into `fields`. Both `projectName: "guild-hall"` at the rule level and `fields: { projectName: "guild-hall" }` are functionally equivalent, but the dedicated field is kept for config ergonomics and backward compatibility.

  If both `projectName` and `fields.projectName` are specified on the same rule, both must match. No conflict resolution is needed because both apply AND logic against the same event property.

- REQ-EVFM-14: The `type` and `projectName` fields on `EventMatchRule` continue to use exact string comparison. Only `fields` values use glob matching.

### Config Schema

- REQ-EVFM-15: The `notificationRuleSchema` in `lib/config.ts` extends the `match` object with an optional `fields` property:

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

  Field keys are arbitrary strings. Field values are strings (which may contain glob patterns). No parse-time validation of glob syntax is performed.

- REQ-EVFM-16: The `NotificationRule` type in `lib/types.ts` mirrors the schema:

  ```typescript
  export interface NotificationRule {
    match: { type: SystemEventType; projectName?: string; fields?: Record<string, string> };
    channel: string;
  }
  ```

### Invalid Pattern Handling

- REQ-EVFM-17: Invalid glob patterns do not crash the router. The `matches()` function wraps the `micromatch.isMatch()` call for each field in a try/catch. If micromatch throws (e.g., for a malformed pattern like `[unclosed`), the field is treated as non-matching (the rule does not match for that event). The error is logged at `warn` level with the field name, pattern, and error message.

  This is a safety net, not a design pattern. Users should write valid patterns. The router should not crash if they don't.

- REQ-EVFM-18: The warn log for invalid patterns fires once per event evaluation, not once per daemon lifetime. No deduplication or rate limiting. If an invalid pattern is in a high-frequency rule, the logs will be noisy. This is acceptable: the noise is the signal that the pattern needs fixing.

  Rationale for no parse-time validation: micromatch does not provide a "validate pattern" function. The only way to detect an invalid pattern is to call `micromatch.isMatch()` and catch a thrown error. Running this at config parse time would require inventing a test string and trying each pattern, which is fragile and misleading.

### No Changes Required

- REQ-EVFM-19: The notification service (`apps/daemon/services/notification-service.ts`) requires no changes. It passes `rule.match` through to `router.subscribe()` untouched. The new `fields` property flows through the existing code path.

- REQ-EVFM-20: The EventBus (`apps/daemon/lib/event-bus.ts`) and all event emit sites require no changes. The `fields` matching reads whatever properties events already carry. No event enrichment is part of this spec.

- REQ-EVFM-21: The `EventRouter` interface (the `subscribe` method signature) does not change. It already accepts `EventMatchRule`, which gains the optional `fields` property.

- REQ-EVFM-22: The only file that gains a new import is `apps/daemon/services/event-router.ts` (`micromatch`). The matching logic change is in the `fields` loop within `matches()`.

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

Worker-scoped notifications via commissionId pattern:

```yaml
notifications:
  - match:
      type: commission_status
      fields:
        status: "{completed,failed}"
        commissionId: "commission-Dalton-*"
    channel: desktop
```

Exclude noisy statuses:

```yaml
notifications:
  - match:
      type: commission_status
      fields:
        status: "!{pending,dispatched,in_progress}"
    channel: ops-webhook
```

Commission-scoped by worker pattern:

```yaml
notifications:
  - match:
      type: commission_status
      projectName: guild-hall
      fields:
        workerName: "Dalton"
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

These examples also work for triggered commission rules (once that spec is implemented), since both consumers share the Event Router's `EventMatchRule`.

## Coercion Behavior

Event fields are not all strings. The `artifacts` field on `commission_result` is an array. The `String()` coercion handles these cases:

| Event field value | `String()` result | Matches pattern |
|-------------------|-------------------|-----------------|
| `"completed"` | `"completed"` | `"completed"`, `"c*"`, `"{completed,failed}"` |
| `42` | `"42"` | `"42"`, `"4?"`, `"*"` |
| `["a.md", "b.md"]` | `"a.md,b.md"` | `"a.md,b.md"` (fragile, but valid) |
| `undefined` | Field missing, skip | No match |

Matching against coerced arrays or objects is technically possible but not a recommended pattern. The primary use case is matching string fields (`status`, `commissionId`, `projectName`, `worker`, `summary`, etc.).

## Explicit Non-Goals

- **Glob matching on `type` or `projectName`.** These remain exact match. `type` is validated against `SystemEventType` at config parse time; glob would defeat that. `projectName` is a scoping dimension, not a pattern target.
- **`{ dot: true }` or any micromatch options.** Event field values are not file paths.
- **Validation of field names against event type schemas.** A rule can name any field. If the event doesn't carry it, the rule silently skips. No compile-time or parse-time validation that the field exists on the specified event type.
- **Pattern validation at config parse time.** No reliable way to do it without false positives. Invalid patterns fail at match time with a logged warning.
- **Pattern compilation or caching.** micromatch handles its own internal caching. No explicit precompilation in the router.
- **Negation as a separate feature.** Negation comes free via micromatch's native `!pattern` support.
- **Compound rules (OR).** Two separate rules pointing at the same channel accomplish OR. Brace expansion (`{completed,failed}`) covers single-field OR.
- **Condition expressions.** Disproportionate complexity for no use case that glob patterns can't handle.
- **Event enrichment.** Adding `workerName` or `projectName` to more event types is a parallel track, not part of this spec.
- **Changes to the `fields` type.** It stays `Record<string, string>`. No pattern-specific wrapper type.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Pattern validation tooling | Users frequently write invalid patterns that silently never match | Add a CLI command or config validation mode that tests patterns against sample events |
| Glob on `projectName` | Users need project-name patterns (e.g., `guild-hall-*`) | Extend `projectName` matching to use micromatch |
| Match logging enhancement | Users can't tell why a rule isn't matching | Add debug-level logging that shows each field comparison result |
| Field name validation | Users are confused by typos in field names that silently never match | Add event-type-aware validation in the config schema |
| Event enrichment | Matching on worker name or projectName is needed for events that don't carry those fields | Add fields to `SystemEvent` variants at emit sites |

## Success Criteria

- [ ] `EventMatchRule` in `apps/daemon/services/event-router.ts` includes `fields?: Record<string, string>`
- [ ] `micromatch` is imported in `apps/daemon/services/event-router.ts`
- [ ] `matches()` evaluates `fields` entries using `micromatch.isMatch()` after `type` and `projectName` checks
- [ ] No options object is passed to `micromatch.isMatch()` (no `{ dot: true }`)
- [ ] Missing event fields cause skip (no match), not error
- [ ] Non-string event field values are coerced via `String()` before comparison
- [ ] All field conditions use AND logic (all must match)
- [ ] Empty `fields` object (`{}`) imposes no additional constraints
- [ ] Exact string values without glob characters still match (backward compatible)
- [ ] Wildcard patterns match (`commission-Dalton-*` matches `commission-Dalton-20260321-143000`)
- [ ] Brace expansion works (`{completed,failed}` matches `completed` and `failed` but not `pending`)
- [ ] Negation works (`!pending` matches `completed` but not `pending`)
- [ ] Invalid glob patterns do not crash the router (caught, logged at warn, treated as non-match)
- [ ] `type` and `projectName` remain exact string comparison (unaffected)
- [ ] `NotificationRule` in `lib/types.ts` includes `fields` on the `match` object
- [ ] `notificationRuleSchema` in `lib/config.ts` includes `fields` as `z.record(z.string(), z.string()).optional()`
- [ ] Existing rules without `fields` continue to work unchanged (backward compatible)
- [ ] Notification service passes `fields` through to the router without modification
- [ ] All existing Event Router tests continue to pass
- [ ] New tests cover: field match, field mismatch, missing field skip, multiple fields AND, coercion, empty fields, combined with projectName, wildcard match, brace expansion, negation, invalid pattern handling, combined glob with other rule fields

## AI Validation

**Defaults:**
- Read the full spec before starting implementation.
- Verify every requirement has at least one test.
- Run `bun test` and confirm all tests pass before declaring work complete.

**Structural checks:**
- Confirm `EventMatchRule` in `apps/daemon/services/event-router.ts` has `fields?: Record<string, string>`.
- Confirm `apps/daemon/services/event-router.ts` imports `micromatch`.
- Confirm the `fields` loop in `matches()` calls `micromatch.isMatch(String(eventRecord[key]), pattern)` without a third argument.
- Confirm the `fields` loop wraps `micromatch.isMatch()` in a try/catch that logs at `warn` level and returns `false` on error.
- Confirm `type` matching still uses `rule.type !== event.type` (exact, not micromatch).
- Confirm `projectName` matching still uses `===` comparison (exact, not micromatch).
- Confirm `notificationRuleSchema` in `lib/config.ts` includes `fields: z.record(z.string(), z.string()).optional()` inside the `match` object.
- Confirm `NotificationRule` in `lib/types.ts` includes `fields?: Record<string, string>` on the `match` property.
- Confirm no changes to `apps/daemon/services/notification-service.ts`, `apps/daemon/lib/event-bus.ts`, or any event emit sites.
- Confirm no options object (especially not `{ dot: true }`) is passed to `micromatch.isMatch()`. Compare with `apps/daemon/lib/agent-sdk/sdk-runner.ts:292` which intentionally uses `{ dot: true }` for file paths. The difference is deliberate.

**Behavioral checks:**
- Test that `fields: { status: "completed" }` matches `status: "completed"` (exact match).
- Test that `fields: { status: "completed" }` does not match `status: "failed"` (exact mismatch).
- Test that `fields: { workerName: "Dalton" }` does not match an event without `workerName` (missing field skip).
- Test that `fields: { status: "completed", commissionId: "c1" }` only matches when both conditions hold (AND logic).
- Test that `fields: { runNumber: "1" }` matches an event where `runNumber` is the number `1` (coercion via `String()`).
- Test that `fields: {}` matches the same events as a rule without `fields`.
- Test that a rule with both `projectName: "guild-hall"` and `fields: { status: "completed" }` requires both conditions.
- Test that `fields: { commissionId: "commission-Dalton-*" }` matches `commissionId: "commission-Dalton-20260321-143000"`.
- Test that `fields: { commissionId: "commission-Dalton-*" }` does not match `commissionId: "commission-Sable-20260321-143000"`.
- Test that `fields: { status: "{completed,failed}" }` matches both `status: "completed"` and `status: "failed"`.
- Test that `fields: { status: "{completed,failed}" }` does not match `status: "pending"`.
- Test that `fields: { status: "!pending" }` matches `status: "completed"` and does not match `status: "pending"`.
- Test that `fields: { status: "[unclosed" }` does not crash, does not match, and produces a warn-level log.
- Test that all existing Event Router tests pass without modification.
