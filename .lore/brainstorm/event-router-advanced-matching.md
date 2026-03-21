---
title: "Event Router: Advanced Matching"
date: 2026-03-21
status: resolved
author: Octavia
tags: [brainstorm, event-router, matching, notifications, triggers, config]
related:
  - .lore/specs/infrastructure/event-router.md
  - .lore/specs/commissions/triggered-commissions.md
  - .lore/brainstorm/triggered-commissions.md
---

# Event Router: Advanced Matching

The event router matches on two things: `type` (exact) and `projectName` (exact, optional). Multiple specs and brainstorms have floated richer filtering. This brainstorm gathers those scattered proposals, evaluates them against real consumer needs, and recommends a direction.

## Current State

### What the Router Matches On

`EventMatchRule` in `daemon/services/event-router.ts`:

```typescript
interface EventMatchRule {
  type: SystemEventType;
  projectName?: string;
}
```

The `matches()` function (line 80) checks:
1. `rule.type === event.type` (exact, required)
2. If `rule.projectName` is set, the event must carry a matching `projectName`. Events without `projectName` silently skip.

### What Events Carry

11 `SystemEvent` variants in `daemon/lib/event-bus.ts`:

| Event Type | Fields Beyond `type` | Has `projectName`? |
|------------|---------------------|-------------------|
| `commission_status` | commissionId, status, oldStatus?, reason? | Optional |
| `commission_progress` | commissionId, summary | No |
| `commission_result` | commissionId, summary, artifacts? | No |
| `commission_artifact` | commissionId, artifactPath | No |
| `commission_manager_note` | commissionId, content | No |
| `commission_queued` | commissionId, reason | No |
| `commission_dequeued` | commissionId, reason | No |
| `meeting_started` | meetingId, worker | No |
| `meeting_ended` | meetingId | No |
| `schedule_spawned` | scheduleId, spawnedId, runNumber | Required |
| `toolbox_replicate` | action, tool, model, files, cost, contextId | Required |

The imbalance is striking: most commission events don't carry `projectName`, and none carry the worker name. `commission_status` is the only commission event with optional `projectName`.

### How Consumers Register

The notification service (`daemon/services/notification-service.ts`) iterates over `notifications` from config, calls `router.subscribe(rule.match, handler)` for each. The router's `subscribe` method stores `{ rule, handler }` pairs. When an event arrives, the router iterates all subscriptions and calls handlers for matches.

The router is a generic matching layer. It doesn't know about channels, notifications, or commissions. Consumers register handlers; the router calls them when rules match.

## Scattered Ideas

### Event Router Spec (implemented)

The spec's exit points table (`event-router.md:186-192`) explicitly names:

> **Finer rule matching**: "Users need to filter on `status`, `commissionId`, or other fields. Extend `EventMatchRule` with additional optional fields."

The non-goals section (line 176) says:

> "Rule matching beyond `type` and `projectName`. Finer matching (on `status`, `commissionId`, glob patterns) is an exit point, not a v1 feature."

These were deliberate deferrals. The router was designed to be extended.

### Triggered Commissions Spec (draft)

The draft spec (`triggered-commissions.md`) introduces a `fields` object for arbitrary payload matching:

```yaml
match:
  type: commission_status
  fields:
    status: completed
```

REQ-TRIG-4/5 define the mechanics: `fields` is `Record<string, string>`, each key names a top-level event field, each value is exact string match, all must match (AND logic), missing fields cause skip (not error). Non-string event fields coerce to string.

The spec explicitly defers glob/pattern matching as a non-goal (line 265): "Match fields use exact string comparison. No micromatch, no wildcards."

But the exit points table (line 295) names it as a follow-up: "Extend `match.fields` to support micromatch patterns."

### Triggered Commissions Brainstorm (resolved)

The brainstorm (`brainstorm/triggered-commissions.md`) proposes three options for matching:

**Option A: Extended Match Object.** Named fields like `status`, `worker` added to the match. Simple but schema-coupled; adding a new matchable field requires a schema change.

**Option B: Condition Expression.** JavaScript-like strings (`"worker === 'Thorne' && artifacts.some(...)"`). Powerful but dangerous: security concerns, fragile, typos silently fail.

**Option C: Pattern Matching (recommended).** Glob patterns on string fields via micromatch. `commissionId: "commission-guild-hall-developer-*"` gives worker-scoping without an expression language.

The brainstorm also identifies the **Event Data Gap**: `commission_status` doesn't carry worker name, `commission_result` doesn't carry `projectName`. You can't write "when a Dalton commission completes" without either enriching events or doing artifact lookups. The brainstorm's conclusion: the "smart prompt" workaround is viable for v1 (triggered commission reads the source artifact to discover context).

### Triggered Commissions Review Notes (2026-03-21)

The spec review rejected `config.yaml` as the location for triggers, favoring commission artifacts instead. It also flagged an open question about whether the event router's own architecture needs to become project-scoped. This doesn't directly affect matching semantics, but it affects where matching rules live and how they're discovered.

## Pattern Catalog

Seven matching approaches, ordered from simplest to most complex.

### 1. Named Field Extensions

Add well-known optional fields to `EventMatchRule` for common event properties.

```yaml
match:
  type: commission_status
  status: completed
  projectName: guild-hall
```

**Config syntax:** Flat keys at the match level. Each is a specific event field.

```typescript
interface EventMatchRule {
  type: SystemEventType;
  projectName?: string;
  status?: string;         // new
  commissionId?: string;   // new
  worker?: string;         // new (requires event enrichment)
}
```

**Pros:** Dead simple. No expression language. Zod validates each field independently. IDE-friendly (known shape). Easy to explain.

**Cons:** Every new matchable field requires a schema change, a type change, and an update to the `matches()` function. Doesn't scale. Creates pressure to add every field "just in case."

**Complexity:** Low. A few more `if` branches in `matches()`.

**Verdict:** Good for the first one or two fields. Bad as a general strategy.

### 2. Generic Fields Object (Exact Match)

This is what the triggered commissions spec proposes. A `fields` key holding arbitrary key-value pairs matched against the event payload.

```yaml
match:
  type: commission_status
  fields:
    status: completed
```

**Config syntax:** Nested `fields` object. Keys are event field names. Values are exact strings.

```typescript
interface EventMatchRule {
  type: SystemEventType;
  projectName?: string;
  fields?: Record<string, string>;
}
```

**Matching logic:** For each key in `fields`, look up the same key on the event object. Coerce to string. Compare. All must match (AND). Missing field on the event means no match (skip).

**Pros:** Open-ended without schema changes. Any new event field is immediately matchable. Simple mental model (key = value).

**Cons:** No type safety on field names; a typo silently never matches. No validation that the field exists on the specified event type. Exact match only; can't express "any completed Dalton commission" without glob support.

**Complexity:** Low. One loop over `Object.entries(fields)` in `matches()`.

**Verdict:** The right foundation. This is the minimum extension that covers the most ground. The triggered commissions spec already proposes this shape.

### 3. Generic Fields with Glob Patterns

Same as #2, but field values are glob patterns matched via micromatch instead of exact comparison.

```yaml
match:
  type: commission_status
  fields:
    status: completed
    commissionId: "commission-Dalton-*"
```

**Config syntax:** Identical to #2. The difference is semantic: values are patterns, not literals. Exact strings still work (a literal string with no glob characters matches itself).

```typescript
// Same type as #2, but matching uses micromatch.isMatch()
```

**Matching logic:** For each key in `fields`, coerce the event value to string, then `micromatch.isMatch(eventValue, pattern)`.

**Pros:** Backward compatible with exact match (patterns without wildcards match literally). Reuses micromatch, which is already a dependency for `canUseToolRules` (`daemon/lib/agent-sdk/sdk-runner.ts:292`). Enables worker-scoping by commissionId pattern (`commission-Dalton-*`) even without worker name on events.

**Cons:** Glob semantics can surprise. `*` doesn't match `/` in micromatch by default (path separator behavior). A user writing `commissionId: "*Dalton*"` gets different behavior than they might expect if the ID contains path-like segments. For event field values (which are plain strings, not paths) this is rarely an issue, but the discrepancy with "normal" glob expectations deserves documentation.

Also: glob patterns aren't validated at config parse time. You can't reject `commissionId: "[invalid"` without actually running micromatch. A `try/catch` wrapper or pre-validation step would be needed.

**Complexity:** Low-medium. Replace string comparison with `micromatch.isMatch()`. One import, one function call change.

**Verdict:** High value, low cost. This is the natural second step after #2. The existing micromatch dependency and the `canUseToolRules` precedent make this the path of least surprise for the codebase.

### 4. Negation

Match everything except certain values. "Notify me on all commission_status events except when status is pending."

```yaml
match:
  type: commission_status
  fields:
    status: "!pending"
```

**Option A: Prefix syntax.** A `!` prefix on the value means negation. `"!pending"` matches anything that isn't `"pending"`.

**Option B: Explicit `not` wrapper.**

```yaml
fields:
  status: { not: "pending" }
```

**Pros:** Fills a real gap. "Notify on failure" is "notify on commission_status where status is not pending, dispatched, or in_progress." Without negation, you need one rule per status value you care about.

**Cons:** Prefix syntax is fragile; what if a real value starts with `!`? (Unlikely for event fields, but possible.) The `not` wrapper changes the type from `Record<string, string>` to `Record<string, string | { not: string }>`. Micromatch already supports negation patterns (`!pattern`), so if we use approach #3, negation comes for free.

**Complexity:** Free if using micromatch (approach #3), since micromatch natively handles `!pattern`. Low otherwise.

**Verdict:** Don't implement as a separate feature. Get it for free through micromatch pattern support in approach #3.

### 5. Field-Existence Checks

Match events that carry (or don't carry) a specific field, regardless of value.

```yaml
match:
  type: commission_status
  fields:
    projectName: "*"    # has projectName
    reason: null         # does NOT have reason
```

**Pros:** Useful for routing. "Only match commission events that have a projectName" avoids rules firing for commissions without project context.

**Cons:** Conflates "field exists" with "field matches pattern." A `"*"` glob matches any non-empty string, which is close but not identical to "field exists" (what about empty strings?). The `null` syntax to mean "field is absent" is non-obvious.

**Complexity:** Free with micromatch (`"*"` matches any string). Absence checking requires a small addition: if the rule value is `null` or a sentinel, invert the existence check.

**Verdict:** Existence-via-wildcard (`"*"` or `"?*"`) works naturally with approach #3. Absence checking is niche enough to defer.

### 6. Compound Rules (AND/OR)

Compose multiple match conditions with boolean logic.

```yaml
# OR: match any of these
match:
  type: commission_status
  any:
    - fields: { status: completed }
    - fields: { status: failed }

# AND is implicit (all fields in a single match must hold)
```

**Alternative syntax (array of match objects):**

```yaml
match:
  - type: commission_status
    fields: { status: completed }
  - type: commission_status
    fields: { status: failed }
```

**Pros:** OR is genuinely useful. "Notify on completed or failed" is a common pattern. Without OR, you need two separate rules pointing at the same channel.

**Cons:** Significant schema complexity. Recursive match definitions. Harder to validate, harder to explain, harder to debug. The config becomes a query language.

**Complexity:** Medium-high. The `matches()` function needs recursive evaluation. Config schema needs union types.

**Verdict:** Don't build this. Two rules pointing at the same channel/handler is the right answer for OR. It's more verbose but vastly simpler. Micromatch brace expansion (`{completed,failed}`) covers the most common OR case within a single field value, so approach #3 handles the 90% case already.

### 7. Condition Expressions

Arbitrary predicate strings evaluated against the event.

```yaml
match:
  type: commission_status
  condition: "status === 'completed' && commissionId.startsWith('commission-Dalton')"
```

**Pros:** Maximum power. Any filtering logic expressible.

**Cons:** Security (eval or sandboxed execution), debugging (no tooling for expression errors), testing (can't validate at parse time), learning curve (users must know the expression syntax). This is a scripting language embedded in config.

**Complexity:** High. Requires an expression evaluator or sandboxed JS execution.

**Verdict:** Don't build this. The complexity is disproportionate to the need. Glob patterns on fields (approach #3) cover the practical use cases without becoming a query language.

## Consumer Needs Analysis

### Notifications

Current notification rules in `config.yaml`:

```yaml
notifications:
  - match:
        type: commission_result
      channel: desktop
  - match:
        type: commission_status
        projectName: guild-hall
      channel: ops-webhook
```

**What users would actually want:**

| Scenario | Current Match | What's Missing |
|----------|--------------|----------------|
| "Notify when any commission completes" | `type: commission_status` | Status filter (`status: completed`) |
| "Notify when a commission fails for project X" | `type: commission_status, projectName: X` | Status filter (`status: failed`) |
| "Notify when a Dalton commission completes" | Can't express | Status filter + worker/commissionId pattern |
| "Notify on all commission events except progress" | Needs separate rule per type | Negation on type, or scope to specific types |
| "Notify when a scheduled commission spawns for project X" | `type: schedule_spawned, projectName: X` | Already expressible |

The gap: **status filtering** is the single most common unmet need. Every notification scenario involving commission completion or failure requires matching on `status`, which the router can't do today.

Worker-scoping via commissionId pattern is secondary but valuable. Negation is nice-to-have.

### Triggered Commissions

From the triggered commissions spec and brainstorm:

| Scenario | Required Match | What's Missing |
|----------|---------------|----------------|
| "Review after any implementation completes" | `type: commission_status`, `status: completed` | Status filter, plus some way to identify implementation vs review commissions |
| "Fix after a review completes with findings" | `type: commission_result` | No status on result events, no way to identify review commissions |
| "Review after scheduled work completes" | `type: commission_status`, `status: completed` + source from schedule | Status filter + provenance awareness |
| "Escalate when a commission fails" | `type: commission_status`, `status: failed` | Status filter |

The pattern is consistent: **status on commission events** is the universal requirement. Worker identification is the secondary gap, addressed either by event enrichment (adding worker to commission events) or commissionId patterns.

The triggered commissions brainstorm's "Event Data Gap" section is the definitive analysis here. The events were designed for notification ("tell someone what happened"), not reaction ("do something about it"). Making them serve both requires either richer events or smarter consumers. The brainstorm concluded that smarter consumers (triggered commissions read the source artifact) is viable for v1, and event enrichment is the follow-up.

### What Both Consumers Share

Both notifications and triggered commissions need:

1. **Payload field matching** (at minimum `status` on `commission_status`)
2. **Pattern matching on string fields** (commissionId patterns for worker-scoping)
3. **The same `EventMatchRule` shape** (the router is the shared matching layer)

Neither needs:
- Compound rules (two rules accomplish OR)
- Expression evaluation
- Field-absence checks (niche)

## Recommended Direction

### Phase 1: Generic Fields with Exact Match

Add `fields?: Record<string, string>` to `EventMatchRule`. This is what the triggered commissions spec already proposes (REQ-TRIG-4/5), and it's the minimum extension that unlocks the primary use case.

```yaml
notifications:
  - match:
      type: commission_status
      fields:
        status: completed
    channel: desktop
```

The matching logic is a loop over `Object.entries(rule.fields)` comparing against `String(event[key])`. Missing fields on the event cause skip (consistent with `projectName` behavior).

**Why this first:** It solves the #1 unmet need (status filtering) with minimal complexity. The types, schema, and matching function each gain one small addition. No new dependencies. Backward compatible (existing rules without `fields` work unchanged).

**Config validation:** The `fields` keys are not validated against event type schemas. A rule with `fields: { nonexistent: "foo" }` is valid config but never matches. This is the same behavior as `projectName` on events that don't carry it. We could add event-type-aware validation later, but it's not required for correctness (silent skip is safe).

**Scope:** Both notifications and triggers benefit. This change is to `EventMatchRule` in the router, so both consumers get it automatically.

### Phase 2: Glob Patterns via Micromatch

Upgrade `fields` value comparison from exact string to `micromatch.isMatch()`. This is a one-line change in the matching function. Exact strings continue to work (no glob characters means literal match).

```yaml
notifications:
  - match:
      type: commission_status
      fields:
        status: "{completed,failed}"
        commissionId: "commission-Dalton-*"
    channel: desktop
```

**Why second, not first:** Exact match is sufficient for the highest-priority scenarios (status filtering). Glob adds power for worker-scoping by commissionId pattern, but that's secondary. Shipping exact match first validates the `fields` extension works before adding pattern complexity.

**Implementation note:** micromatch is already imported in `daemon/lib/agent-sdk/sdk-runner.ts`. Adding it to `daemon/services/event-router.ts` is a one-line import. Use `micromatch.isMatch(value, pattern)` without `{ dot: true }` since event field values aren't file paths.

**Brace expansion** (`{completed,failed}`) gives us OR within a single field value, eliminating the main reason users would want compound rules.

**Negation** (`!pending`) comes free. Micromatch handles `!` prefix patterns natively.

### Defer: Everything Else

| Approach | Why Defer |
|----------|-----------|
| Named field extensions (#1) | Generic `fields` is strictly more flexible. No reason to hardcode specific fields. |
| Compound rules (#6) | Two rules accomplish OR. Brace expansion in glob covers single-field OR. |
| Condition expressions (#7) | Disproportionate complexity. No use case that globs can't handle. |
| Field-absence checks (#5) | Niche. Revisit if a concrete consumer need surfaces. |

### Parallel Track: Event Enrichment

The matching system is only as useful as the data it matches against. The biggest gap isn't matching capability; it's **what the events carry**. Two enrichments would dramatically increase matching power:

1. **Worker name on commission events.** Add optional `workerName: string` to `commission_status` and `commission_result`. Emit sites: `daemon/services/commission/lifecycle.ts` and `daemon/services/commission/toolbox.ts`. This enables `fields: { workerName: "guild-hall-developer" }` without commissionId pattern hacks.

2. **`projectName` on `commission_result`.** Currently absent. Adding it enables project-scoped result notifications without cross-referencing commission state.

These are additive changes to `SystemEvent` variants and their emit sites. No router changes needed. The generic `fields` matching automatically picks up any new event fields.

Event enrichment and matching extensions are independent work streams. Either is valuable alone; together they're transformative.

## The `projectName` Question

`projectName` currently gets special treatment in `EventMatchRule`: it's a named field with dedicated matching logic. With the `fields` approach, it could be expressed as `fields: { projectName: "guild-hall" }` instead.

Should `projectName` migrate into `fields`, or should it stay as a dedicated field?

**Keep it separate.** `projectName` is the primary scoping dimension across all of Guild Hall. It has special semantics (events that don't carry it are silently skipped, not rejected). Promoting it to `fields` would require the `fields` loop to replicate this skip behavior for all fields (which it already does per the triggered commissions spec), but the config readability argument is stronger: `projectName: guild-hall` at the top level of the match is clearer than `fields: { projectName: guild-hall }` nested one level deeper.

The two approaches are functionally equivalent. Keep `projectName` as a named field for config ergonomics, and let `fields` handle everything else.

## Implementation Sketch

For Phase 1 (generic fields, exact match), the changes are:

**`daemon/services/event-router.ts`:** Extend `EventMatchRule` and `matches()`:

```typescript
export interface EventMatchRule {
  type: SystemEventType;
  projectName?: string;
  fields?: Record<string, string>;  // new
}

function matches(rule: EventMatchRule, event: SystemEvent): boolean {
  if (rule.type !== event.type) return false;

  if (rule.projectName !== undefined) {
    if (!("projectName" in event) || (event as Record<string, unknown>).projectName !== rule.projectName) {
      return false;
    }
  }

  // New: check arbitrary fields
  if (rule.fields) {
    const eventRecord = event as Record<string, unknown>;
    for (const [key, expected] of Object.entries(rule.fields)) {
      if (!(key in eventRecord)) return false;
      if (String(eventRecord[key]) !== expected) return false;
    }
  }

  return true;
}
```

**`lib/types.ts`:** Add `fields` to `NotificationRule.match`:

```typescript
export interface NotificationRule {
  match: { type: SystemEventType; projectName?: string; fields?: Record<string, string> };
  channel: string;
}
```

**`lib/config.ts`:** Extend the notification match schema with an optional `fields` record of string values.

**No changes to:** `daemon/services/notification-service.ts`, `daemon/lib/event-bus.ts`, or any emit sites. The notification service already passes `rule.match` through to `router.subscribe()`. The new `fields` field flows through untouched.

For Phase 2 (glob patterns), the only change is in `matches()`:

```typescript
import micromatch from "micromatch";

// Replace: if (String(eventRecord[key]) !== expected) return false;
// With:    if (!micromatch.isMatch(String(eventRecord[key]), expected)) return false;
```

One import, one line change.
