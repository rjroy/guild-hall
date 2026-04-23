---
title: "Plan: Event Router Field Matching"
date: 2026-03-21
status: executed
tags: [event-router, matching, micromatch, glob, notifications, config, infrastructure]
modules: [event-router, config, types]
related:
  - .lore/specs/infrastructure/event-router-field-matching.md
  - .lore/brainstorm/event-router-advanced-matching.md
  - .lore/plans/infrastructure/event-router.md
---

# Plan: Event Router Field Matching

## Goal

Add arbitrary payload field matching to the Event Router. A `fields` property on `EventMatchRule` holds key-value pairs matched against event payload fields using micromatch glob patterns. This unlocks status filtering ("notify when a commission completes"), worker-scoping by commissionId pattern, brace expansion for single-field OR, and negation, all without new dependencies or architectural changes.

The spec is at `.lore/specs/infrastructure/event-router-field-matching.md` (REQ-EVFM-1 through REQ-EVFM-22).

## Codebase Context

**Event Router** (`apps/daemon/services/event-router.ts`): 91 lines. `EventMatchRule` interface (line 15) has `type` and optional `projectName`. The `matches()` function (line 80) is a standalone function that checks `type` (exact) then `projectName` (exact, optional). It does not currently receive the `log` dependency. The router's `createEventRouter(deps)` factory closes over `log` from deps.

**Config schema** (`lib/config.ts`): `notificationRuleSchema` (line 90) has `match: z.object({ type: z.enum(SYSTEM_EVENT_TYPES), projectName: z.string().optional() })`. The `fields` property adds here.

**Types** (`lib/types.ts`): `NotificationRule` interface (line 372) has `match: { type: SystemEventType; projectName?: string }`. The `fields` property mirrors here.

**Existing micromatch usage** (`apps/daemon/lib/agent-sdk/sdk-runner.ts:292`): Calls `micromatch.isMatch(value, patterns, { dot: true })` for file path matching. The event router intentionally omits `{ dot: true }` because event field values are not file paths (REQ-EVFM-6, REQ-EVFM-7).

**Existing tests** (`apps/daemon/tests/services/event-router.test.ts`): 208 lines, 15 tests across 5 describe blocks covering subscription, matching, unsubscribe, cleanup, and logging. Uses `collectingLog` for log assertions.

## Implementation Steps

This is a single-phase change. Three production files, one test file, no wiring changes.

### Step 1: Extend config schema

**File**: `lib/config.ts`
**Addresses**: REQ-EVFM-15

Add `fields` to the `match` object in `notificationRuleSchema`:

```typescript
match: z.object({
  type: z.enum(SYSTEM_EVENT_TYPES),
  projectName: z.string().optional(),
  fields: z.record(z.string(), z.string()).optional(),
}),
```

No parse-time validation of glob syntax. Keys are arbitrary strings, values are strings that may contain glob patterns.

### Step 2: Extend NotificationRule type

**File**: `lib/types.ts`
**Addresses**: REQ-EVFM-16

Add `fields` to the `match` property of `NotificationRule`:

```typescript
export interface NotificationRule {
  match: { type: SystemEventType; projectName?: string; fields?: Record<string, string> };
  channel: string;
}
```

### Step 3: Extend EventMatchRule and matches()

**File**: `apps/daemon/services/event-router.ts`
**Addresses**: REQ-EVFM-1, REQ-EVFM-2, REQ-EVFM-3, REQ-EVFM-4, REQ-EVFM-5, REQ-EVFM-6, REQ-EVFM-7, REQ-EVFM-8, REQ-EVFM-13, REQ-EVFM-14, REQ-EVFM-17, REQ-EVFM-18, REQ-EVFM-22

Three changes in this file:

1. **Import micromatch.** Add `import micromatch from "micromatch";` to the imports.

2. **Extend `EventMatchRule`.** Add `fields?: Record<string, string>` to the interface.

3. **Extend `matches()`.** The function currently has no access to `log`, but REQ-EVFM-17 requires warn-level logging for invalid patterns. Pass `log` as a third parameter:

   ```typescript
   function matches(rule: EventMatchRule, event: SystemEvent, log: Log): boolean {
   ```

   Update the call site in the EventBus subscriber (line 41) to pass `log`.

   After the `projectName` check, add the fields loop:

   ```typescript
   if (rule.fields) {
     const eventRecord = event as Record<string, unknown>;
     for (const [key, pattern] of Object.entries(rule.fields)) {
       if (!(key in eventRecord)) return false;
       try {
         if (!micromatch.isMatch(String(eventRecord[key]), pattern)) return false;
       } catch (err) {
         log.warn(
           `invalid glob pattern for field "${key}": ${pattern} -`,
           err instanceof Error ? err.message : String(err),
         );
         return false;
       }
     }
   }
   ```

   Key behaviors:
   - `fields` check runs after `type` and `projectName` (REQ-EVFM-3).
   - Missing event field causes skip, not error (REQ-EVFM-5).
   - `String()` coercion handles non-string event values like numbers (REQ-EVFM-2).
   - Empty `fields` object (`{}`) enters the block but the loop body never executes, so it imposes no constraints (REQ-EVFM-4).
   - `micromatch.isMatch()` called with two arguments only, no options object (REQ-EVFM-7).
   - `type` and `projectName` remain exact comparison, untouched (REQ-EVFM-14).
   - Try/catch per field, not per rule, so a valid field can still match even if another field's pattern is broken. But since all fields must match (AND), and a broken pattern returns false, the rule as a whole won't match. The try/catch prevents a crash.

**Files not changed** (verification): `apps/daemon/services/notification-service.ts`, `apps/daemon/lib/event-bus.ts`, and all event emit sites remain untouched (REQ-EVFM-19, REQ-EVFM-20, REQ-EVFM-21).

### Step 4: Tests

**File**: `apps/daemon/tests/services/event-router.test.ts`
**Addresses**: All behavioral REQs

Add a new `describe("EventRouter field matching", ...)` block. The existing `makeRouter()` helper and `tick()` function work unchanged. All tests use the existing `collectingLog` pattern for log assertions.

**Test cases** (derived from spec AI Validation, Behavioral Checks):

| # | Test | Rule | Event | Expected | REQ |
|---|------|------|-------|----------|-----|
| 1 | Exact field match | `fields: { status: "completed" }` | `commission_status` with `status: "completed"` | Match | EVFM-2, EVFM-8 |
| 2 | Exact field mismatch | `fields: { status: "completed" }` | `commission_status` with `status: "failed"` | No match | EVFM-2 |
| 3 | Missing field skip | `fields: { workerName: "Dalton" }` | `commission_status` without `workerName` | No match, no error | EVFM-2, EVFM-5 |
| 4 | Multiple fields AND | `fields: { status: "completed", commissionId: "c1" }` | Both match | Match | EVFM-2 |
| 5 | Multiple fields AND (partial) | `fields: { status: "completed", commissionId: "c1" }` | Status matches, commissionId doesn't | No match | EVFM-2 |
| 6 | String coercion (number) | `fields: { someCount: "42" }` | any event with `someCount: 42` (number) | Match | EVFM-2 |
| 7 | Empty fields object | `fields: {}` | Any matching event | Match (same as no fields) | EVFM-4 |
| 8 | Combined with projectName | `projectName: "guild-hall", fields: { status: "completed" }` | `commission_status` with both | Match only when both hold | EVFM-3, EVFM-13 |
| 9 | Wildcard match | `fields: { commissionId: "commission-Dalton-*" }` | `commissionId: "commission-Dalton-20260321-143000"` | Match | EVFM-9 |
| 10 | Wildcard non-match | `fields: { commissionId: "commission-Dalton-*" }` | `commissionId: "commission-Sable-20260321-143000"` | No match | EVFM-9 |
| 11 | Brace expansion match | `fields: { status: "{completed,failed}" }` | `status: "completed"` | Match | EVFM-10 |
| 12 | Brace expansion match (second) | `fields: { status: "{completed,failed}" }` | `status: "failed"` | Match | EVFM-10 |
| 13 | Brace expansion non-match | `fields: { status: "{completed,failed}" }` | `status: "pending"` | No match | EVFM-10 |
| 14 | Negation match | `fields: { status: "!pending" }` | `status: "completed"` | Match | EVFM-11 |
| 15 | Negation non-match | `fields: { status: "!pending" }` | `status: "pending"` | No match | EVFM-11 |
| 16 | Invalid pattern handling | `fields: { status: "[unclosed" }` | Any `commission_status` | No match, no crash, warn logged | EVFM-17, EVFM-18 |
| 17 | Existing tests pass | (all existing tests) | (unchanged) | All pass | EVFM-14 |

Tests 1-16 all follow the same shape: create router, subscribe with a rule that includes `fields`, emit an event, tick, assert handler call count. Test 16 additionally asserts `logCtx.messages.warn` contains the field name and pattern.

Test 17 is implicit: running the full test file confirms existing tests pass alongside the new ones.

### Step 5: Run full test suite

Run `bun test` to confirm all 3,200+ tests pass, not just the router tests.

### Step 6: Structural validation

Launch a sub-agent with fresh context to verify against the spec's AI Validation section:

**Structural checks:**
- `EventMatchRule` has `fields?: Record<string, string>`.
- `micromatch` is imported in `event-router.ts`.
- `micromatch.isMatch()` called with two arguments only (no `{ dot: true }`).
- Try/catch wraps `micromatch.isMatch()`, logs at warn, returns false.
- `type` matching still uses `!==` (exact).
- `projectName` matching still uses `===` (exact).
- `notificationRuleSchema` has `fields: z.record(z.string(), z.string()).optional()`.
- `NotificationRule` has `fields?: Record<string, string>` on `match`.
- No changes to `notification-service.ts`, `event-bus.ts`, or emit sites.

## REQ Coverage Matrix

| REQ | Description | Step |
|-----|-------------|------|
| REQ-EVFM-1 | `EventMatchRule` gains `fields?: Record<string, string>` | 3 |
| REQ-EVFM-2 | Field matching: iterate entries, missing field skips, `String()` coercion, `micromatch.isMatch()` | 3, 4 |
| REQ-EVFM-3 | Fields check runs after type and projectName | 3 |
| REQ-EVFM-4 | Empty `fields` imposes no constraints | 3, 4 (test 7) |
| REQ-EVFM-5 | Unvalidated field keys; missing fields silently skip | 3, 4 (test 3) |
| REQ-EVFM-6 | No `{ dot: true }` option | 3 |
| REQ-EVFM-7 | No options object on `micromatch.isMatch()` | 3 |
| REQ-EVFM-8 | Exact strings match themselves (micromatch guarantee) | 4 (tests 1, 2) |
| REQ-EVFM-9 | Wildcard patterns | 4 (tests 9, 10) |
| REQ-EVFM-10 | Brace expansion | 4 (tests 11, 12, 13) |
| REQ-EVFM-11 | Negation | 4 (tests 14, 15) |
| REQ-EVFM-12 | Character classes (micromatch guarantee) | (no explicit test; covered by micromatch) |
| REQ-EVFM-13 | `projectName` stays separate | 3, 4 (test 8) |
| REQ-EVFM-14 | `type` and `projectName` remain exact comparison | 3, 4 (test 17) |
| REQ-EVFM-15 | Config schema adds `fields` | 1 |
| REQ-EVFM-16 | `NotificationRule` type adds `fields` | 2 |
| REQ-EVFM-17 | Invalid patterns caught, logged at warn, treated as non-match | 3, 4 (test 16) |
| REQ-EVFM-18 | Warn fires per event evaluation, no dedup | 3, 4 (test 16) |
| REQ-EVFM-19 | Notification service unchanged | 3 (verification) |
| REQ-EVFM-20 | EventBus unchanged | 3 (verification) |
| REQ-EVFM-21 | `EventRouter` subscribe signature unchanged | 3 |
| REQ-EVFM-22 | Only `event-router.ts` gains a new import | 3 |

## Files Changed

| File | Change |
|------|--------|
| `apps/daemon/services/event-router.ts` | Import micromatch, extend `EventMatchRule`, extend `matches()` with fields loop, pass `log` to `matches()` |
| `lib/config.ts` | Add `fields` to notification match schema |
| `lib/types.ts` | Add `fields` to `NotificationRule.match` |
| `apps/daemon/tests/services/event-router.test.ts` | Add 16 test cases for field matching |

No other files change. The notification service, EventBus, event emit sites, and production wiring (`apps/daemon/app.ts`) are untouched.

## Implementation Notes

**`matches()` needs `log` access.** The current `matches()` function is a standalone pure function with no dependencies. REQ-EVFM-17 requires warn-level logging when an invalid glob pattern throws. The simplest fix: add `log: Log` as a third parameter to `matches()` and update the single call site (line 41 in the EventBus subscriber closure, which already closes over `log`). This keeps the function testable and avoids restructuring the module.

**micromatch is already installed.** It's in `package.json` as a direct dependency, used in `sdk-runner.ts`. No `bun add` needed.

**No config schema tests needed for `fields`.** The existing `notificationRuleSchema` tests in `lib/tests/config.test.ts` cover the schema shape. Adding `fields` as an optional `z.record(z.string(), z.string())` is a trivial schema extension that Zod handles without edge cases. The behavioral tests in the router test file cover the interesting semantics (glob matching, coercion, missing fields).

## Delegation Guide

Single commission to Dalton. Steps 1-4 are sequential (each builds on the prior). Steps 5-6 are the verification pass.

The implementation is small enough that splitting into phases would add coordination overhead without reducing risk. The reviewer (Step 6) should be a fresh-context sub-agent that reads the spec and the implementation, not the same agent that wrote the code.
