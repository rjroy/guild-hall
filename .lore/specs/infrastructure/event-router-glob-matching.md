---
title: "Event Router: Glob Pattern Matching"
date: 2026-03-21
status: draft
tags: [event-router, matching, micromatch, glob, notifications, config, infrastructure]
modules: [event-router]
related:
  - .lore/specs/infrastructure/event-router.md
  - .lore/specs/infrastructure/event-router-field-matching.md
  - .lore/brainstorm/event-router-advanced-matching.md
depends-on:
  - .lore/specs/infrastructure/event-router-field-matching.md
req-prefix: EVGM
---

# Spec: Event Router Glob Pattern Matching

## Overview

This spec upgrades the Event Router's `fields` value comparison from exact string match to micromatch glob patterns. It is Phase 2 of the advanced matching extension outlined in the brainstorm at `.lore/brainstorm/event-router-advanced-matching.md`.

Phase 1 (`.lore/specs/infrastructure/event-router-field-matching.md`) adds `fields?: Record<string, string>` to `EventMatchRule` with exact string comparison. This spec replaces that comparison with `micromatch.isMatch()`. **Phase 1 must be implemented first.** This spec modifies the matching behavior Phase 1 introduces.

The upgrade is backward compatible. A string without glob characters matches itself literally under micromatch, so every Phase 1 rule continues to work unchanged. What changes is what users can express: brace expansion (`{completed,failed}`) for single-field OR, wildcards (`commission-Dalton-*`) for pattern matching, and negation (`!pending`) for exclusion.

## Entry Points

- Phase 1 spec exit point: "Glob pattern matching" (`.lore/specs/infrastructure/event-router-field-matching.md`, exit points table).
- Brainstorm Phase 2 recommendation (`.lore/brainstorm/event-router-advanced-matching.md`, "Phase 2: Glob Patterns via Micromatch").
- Implemented Event Router spec exit point: "Finer rule matching" (`.lore/specs/infrastructure/event-router.md`, line 190).

## Scope

**In scope:** Replace the exact string comparison in the `fields` matching loop with `micromatch.isMatch()`. Address config validation of invalid glob patterns.

**Out of scope:** Changes to `EventMatchRule`'s type signature (it stays `Record<string, string>`), event enrichment, triggered commissions, compound rules, the `projectName` field (stays exact match), changes to the notification service or EventBus.

## Requirements

### Matching Upgrade

- REQ-EVGM-1: The `matches()` function in `daemon/services/event-router.ts` replaces the exact string comparison for `fields` values with `micromatch.isMatch()`. The change is in the `fields` iteration loop introduced by Phase 1 (REQ-EVFM-2):

  ```typescript
  // Phase 1 (exact):
  if (String(eventRecord[key]) !== expected) return false;

  // Phase 2 (glob):
  if (!micromatch.isMatch(String(eventRecord[key]), expected)) return false;
  ```

  This is the only behavioral change in this spec.

- REQ-EVGM-2: micromatch is called without the `{ dot: true }` option. Event field values are plain strings (status codes, identifiers, summaries), not file paths. The `dot` option controls whether `*` matches strings starting with `.`, which is file-path semantics. For event fields, the default behavior (no special treatment of dots) is correct.

  This differs from the existing micromatch usage in `daemon/lib/agent-sdk/sdk-runner.ts` (line 292), which uses `{ dot: true }` because it matches file paths and shell commands. The difference is intentional.

- REQ-EVGM-3: No options object is passed to `micromatch.isMatch()`. The call is `micromatch.isMatch(value, pattern)` with two arguments only. Default micromatch behavior applies for all settings.

### Backward Compatibility

- REQ-EVGM-4: Exact strings without glob characters (`*`, `?`, `[`, `]`, `{`, `}`, `!` at start) match themselves literally under micromatch. Every rule that worked under Phase 1's exact comparison produces identical results under Phase 2. This is a micromatch guarantee, not something the implementation enforces.

- REQ-EVGM-5: The `EventMatchRule` interface does not change. `fields` remains `Record<string, string>`. Glob patterns are strings. The type system does not distinguish between literal values and glob patterns.

- REQ-EVGM-6: The `type` and `projectName` fields on `EventMatchRule` continue to use exact string comparison. Only `fields` values use glob matching.

### Pattern Capabilities

These are not features the implementation builds. They are consequences of using micromatch. The spec documents them so consumers know what's available.

- REQ-EVGM-7: **Wildcards.** `*` matches any sequence of characters except path separators. `?` matches exactly one character. For event field values (which don't contain path separators), `*` effectively matches any string.

  ```yaml
  fields:
    commissionId: "commission-Dalton-*"     # any Dalton commission
    status: "c*"                            # completed, cancelled, ...
  ```

- REQ-EVGM-8: **Brace expansion.** `{a,b,c}` matches any of the comma-separated alternatives. This provides single-field OR without compound rules.

  ```yaml
  fields:
    status: "{completed,failed}"    # completed OR failed
  ```

- REQ-EVGM-9: **Negation.** A `!` prefix negates the pattern. `!pending` matches any value that is not `"pending"`. Negation can combine with other patterns: `!{pending,dispatched}` matches anything except `"pending"` or `"dispatched"`.

  ```yaml
  fields:
    status: "!pending"                      # anything except pending
    status: "!{pending,dispatched}"         # anything except pending or dispatched
  ```

- REQ-EVGM-10: **Character classes.** `[abc]` matches any single character in the set. `[!abc]` matches any character not in the set. Available but unlikely to see practical use for event fields.

### Config Validation

- REQ-EVGM-11: The config schema for `fields` values does not change. Values remain `z.string()`. No parse-time validation of glob syntax is performed.

  Rationale: micromatch does not provide a "validate pattern" function. The only way to detect an invalid pattern (e.g., `[unclosed`) is to call `micromatch.isMatch()` and catch a thrown error. Running this at config parse time would require inventing a test string and trying each pattern, which is fragile and misleading (a pattern could be valid but never match any real event value).

- REQ-EVGM-12: Invalid glob patterns do not crash the router. The `matches()` function wraps the `micromatch.isMatch()` call for each field in a try/catch. If micromatch throws (e.g., for a malformed pattern like `[unclosed`), the field is treated as non-matching (the rule does not match for that event). The error is logged at `warn` level with the field name, pattern, and error message.

  This is a safety net, not a design pattern. Users should write valid patterns. The router should not crash if they don't.

- REQ-EVGM-13: The warn log for invalid patterns fires once per event evaluation, not once per daemon lifetime. No deduplication or rate limiting. If an invalid pattern is in a high-frequency rule, the logs will be noisy. This is acceptable: the noise is the signal that the pattern needs fixing.

### No Other Changes

- REQ-EVGM-14: The notification service, EventBus, event emit sites, config schema, and TypeScript types require no changes. The only file modified is `daemon/services/event-router.ts`: one import added (`micromatch`) and the comparison line in the `fields` loop replaced.

## Config Examples

Worker-scoped notifications:

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

Schedule-scoped by ID pattern:

```yaml
notifications:
  - match:
      type: schedule_spawned
      projectName: guild-hall
      fields:
        scheduleId: "nightly-*"
    channel: desktop
```

These examples also work for triggered commission rules (once that spec is implemented), since both consumers share the Event Router's `EventMatchRule`.

## Explicit Non-Goals

- **Glob matching on `type` or `projectName`.** These remain exact match. `type` is validated against `SystemEventType` at config parse time; glob would defeat that. `projectName` is a scoping dimension, not a pattern target.
- **`{ dot: true }` or any micromatch options.** Event field values are not file paths.
- **Pattern validation at config parse time.** No reliable way to do it without false positives. Invalid patterns fail at match time with a logged warning.
- **Pattern compilation or caching.** micromatch handles its own internal caching. No explicit precompilation in the router.
- **Changes to the `fields` type.** It stays `Record<string, string>`. No pattern-specific wrapper type.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Pattern validation tooling | Users frequently write invalid patterns that silently never match | Add a CLI command or config validation mode that tests patterns against sample events |
| Glob on `projectName` | Users need project-name patterns (e.g., `guild-hall-*`) | Extend `projectName` matching to use micromatch |
| Match logging enhancement | Users can't tell why a rule isn't matching | Add debug-level logging that shows each field comparison result |

## Success Criteria

- [ ] `matches()` in `daemon/services/event-router.ts` uses `micromatch.isMatch()` for `fields` value comparison
- [ ] `micromatch` is imported in `daemon/services/event-router.ts`
- [ ] No options object is passed to `micromatch.isMatch()` (no `{ dot: true }`)
- [ ] Exact string values without glob characters still match (backward compatible with Phase 1)
- [ ] Wildcard patterns match (`commission-Dalton-*` matches `commission-Dalton-20260321-143000`)
- [ ] Brace expansion works (`{completed,failed}` matches `completed` and `failed` but not `pending`)
- [ ] Negation works (`!pending` matches `completed` but not `pending`)
- [ ] Invalid glob patterns do not crash the router (caught, logged at warn, treated as non-match)
- [ ] `type` and `projectName` remain exact string comparison (unaffected)
- [ ] All existing Event Router and Phase 1 field matching tests continue to pass
- [ ] New tests cover: wildcard match, brace expansion, negation, invalid pattern handling, combined glob with other rule fields

## AI Validation

**Defaults:**
- Read the full spec and the Phase 1 spec before starting implementation.
- Verify every requirement has at least one test.
- Run `bun test` and confirm all tests pass before declaring work complete.

**Structural checks:**
- Confirm `daemon/services/event-router.ts` imports `micromatch`.
- Confirm the `fields` loop in `matches()` calls `micromatch.isMatch(String(eventRecord[key]), expected)` without a third argument.
- Confirm the `fields` loop wraps `micromatch.isMatch()` in a try/catch that logs at `warn` level and returns `false` on error.
- Confirm `type` matching still uses `rule.type !== event.type` (exact, not micromatch).
- Confirm `projectName` matching still uses `=== ` comparison (exact, not micromatch).
- Confirm no changes to `lib/config.ts`, `lib/types.ts`, `daemon/services/notification-service.ts`, `daemon/lib/event-bus.ts`, or any event emit sites.
- Confirm no options object (especially not `{ dot: true }`) is passed to `micromatch.isMatch()`. Compare with `daemon/lib/agent-sdk/sdk-runner.ts:292` which intentionally uses `{ dot: true }` for file paths. The difference is deliberate.

**Behavioral checks:**
- Test that `fields: { status: "completed" }` still matches `status: "completed"` (exact match backward compat).
- Test that `fields: { status: "completed" }` still does not match `status: "failed"` (exact mismatch backward compat).
- Test that `fields: { commissionId: "commission-Dalton-*" }` matches `commissionId: "commission-Dalton-20260321-143000"`.
- Test that `fields: { commissionId: "commission-Dalton-*" }` does not match `commissionId: "commission-Sable-20260321-143000"`.
- Test that `fields: { status: "{completed,failed}" }` matches both `status: "completed"` and `status: "failed"`.
- Test that `fields: { status: "{completed,failed}" }` does not match `status: "pending"`.
- Test that `fields: { status: "!pending" }` matches `status: "completed"` and does not match `status: "pending"`.
- Test that `fields: { status: "[unclosed" }` does not crash, does not match, and produces a warn-level log.
- Test that a rule combining `projectName: "guild-hall"` with `fields: { status: "{completed,failed}" }` requires both conditions.
- Test that all Phase 1 tests pass without modification.
