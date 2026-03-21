---
title: "Triggered Commissions"
date: 2026-03-20
status: open
author: Octavia
tags: [brainstorm, commissions, event-router, automation, dependencies]
parent: standing-delegation.md
---

# Triggered Commissions

Companion to [Standing Delegation](standing-delegation.md). That brainstorm named the concept; this one works through the mechanics.

## The Reframe

Guild Hall has two commission creation paths today:

1. **Manual**: User or Guild Master dispatches a commission.
2. **Scheduled**: Cron expression fires, scheduler spawns a one-shot commission.

The third path: **event-triggered**. When a system event occurs and matches a rule, the system instantiates and dispatches a commission. Same lifecycle as any other commission once it exists. The difference is what causes it to exist.

This is the concrete mechanism behind standing delegation's "whenever X happens, do Y." The event router already watches the EventBus and dispatches to channels. Triggered commissions are a new action type on that same router: instead of running a shell command or posting a webhook, dispatch a commission.

## What Exists Today

### The Event Router

`daemon/services/event-router.ts` subscribes to the EventBus and evaluates notification rules against events. Each rule has a `match` object (exact-match on `type`, optional `projectName`) and a `channel` reference. When a rule matches, it dispatches to the channel (shell or webhook).

The router is stateless, fire-and-forget, and synchronous in its matching. Channel dispatch is async but untracked (failures are logged and dropped). The router has no concept of "actions" beyond channel dispatch.

### The EventBus

`daemon/lib/event-bus.ts` defines 13 `SystemEvent` variants:

| Event Type | Key Fields | Relevant? |
|------------|-----------|-----------|
| `commission_status` | commissionId, status, oldStatus, projectName? | Yes: triggers on completion, failure, halted |
| `commission_result` | commissionId, summary, artifacts? | Yes: triggers on results with specific content |
| `commission_progress` | commissionId, summary | Marginal: too noisy for triggers |
| `commission_artifact` | commissionId, artifactPath | Maybe: trigger when specific artifact types appear |
| `schedule_spawned` | scheduleId, spawnedId, projectName, runNumber | Yes: trigger review after scheduled work |
| `meeting_ended` | meetingId | Maybe: trigger follow-up commissions |
| `commission_mail_sent` | commissionId, targetWorker, mailSequence | No: internal plumbing |
| `mail_reply_received` | contextId, commissionId | No: internal plumbing |
| `commission_queued` | commissionId, reason | No: capacity management |
| `commission_dequeued` | commissionId, reason | No: capacity management |
| `commission_manager_note` | commissionId, content | No: internal annotation |
| `meeting_started` | meetingId, worker | No: too early to act on |
| `toolbox_replicate` | action, tool, model, files, cost, projectName | No: domain-specific |

The high-value trigger sources are `commission_status` (especially transitions to `completed` or `failed`) and `commission_result` (when you want to react to what a commission produced, not just that it finished). `schedule_spawned` matters for chaining review after scheduled work.

### The Scheduler

`daemon/services/scheduler/index.ts` handles scheduled commissions. It ticks every 60 seconds, scans for active schedules, evaluates cron expressions, spawns one-shot commissions. Overlap prevention, stuck-run escalation, catch-up on restart.

The scheduler reads schedule artifacts from `.lore/commissions/` (type: scheduled, status: active). It spawns commissions through `commissionSession.createCommission()` and `commissionSession.dispatchCommission()`.

### Commission Dependencies

`daemon/services/commission/orchestrator.ts` (around line 1030) handles dependency transitions. Commissions with `depends_on` start in `blocked` status. When all dependencies reach `completed` or `abandoned`, the commission transitions to `pending` and becomes eligible for dispatch. This is polled during `checkDependencyTransitions()`, not event-driven.

## Question 1: What Do Triggers Look Like?

### The Shape

A trigger definition needs three things:

1. **Match**: Which events activate it. (What happened?)
2. **Commission template**: What to create when it fires. (What do you want done?)
3. **Controls**: Approval, depth limits, provenance. (How much autonomy?)

The match should feel like a natural extension of the event router's existing `match` object, but with more power. The current router only matches on `type` and `projectName` (exact strings). Triggers need to match on status values, worker names, and possibly artifact content.

### Option A: Extended Match Object

Add optional fields to the match object for common event fields:

```yaml
triggers:
  - match:
      type: commission_status
      status: completed
      worker: guild-hall-developer   # new: match on worker
    commission:
      worker: guild-hall-reviewer
      prompt: "Review the work from commission {{commissionId}}. Check artifacts at {{artifacts}}."
      title: "Review: {{commissionId}}"
    approval: auto
```

Pros: Simple, declarative, no expression language to learn. Cons: Limited to fields we explicitly support. Adding new matchable fields requires schema changes.

### Option B: Condition Expression

The standing delegation brainstorm proposed a JavaScript-like condition string:

```yaml
condition: "worker === 'Thorne' && artifacts.some(a => a.includes('review'))"
```

This is powerful but dangerous. Evaluating arbitrary expressions in a config file is a security concern (even if the user controls the config). It's also fragile: a typo in the condition silently never matches.

### Option C: Pattern Matching (Recommended Direction)

A middle ground. The match object supports exact-match fields (like today) plus glob patterns for string fields:

```yaml
triggers:
  - match:
      type: commission_result
      commissionId: "commission-guild-hall-developer-*"
    commission:
      worker: guild-hall-reviewer
      prompt: "Review {{commissionId}}"
    approval: auto
```

Pattern matching on `commissionId` with globs gives you worker-scoping ("any Dalton commission") without a full expression language. The `*` uses micromatch, which is already a dependency.

The event router spec explicitly listed "finer rule matching" as an exit point (matching on status, commissionId, other fields). Triggered commissions are the use case that justifies that exit point.

### Template Variables

Regardless of match approach, the commission template needs access to event data. The `prompt`, `title`, and `dependencies` fields should support `{{fieldName}}` substitution from the matched event's payload.

Available for `commission_status`: `commissionId`, `status`, `oldStatus`, `projectName`, `reason`.
Available for `commission_result`: `commissionId`, `summary`, `artifacts`.

This is simple string interpolation, not a template engine. `{{commissionId}}` becomes the literal value from the event. No loops, no conditionals, no nested access.

### Where Triggers Live

Two options:

**In config.yaml** (alongside notifications): Natural sibling to the existing `notifications` array. Changes require daemon restart (same limitation as notification rules today). Good for standing rules that rarely change.

**In .lore/ artifacts** (like scheduled commissions): More visible, version-controlled with the project, can be created/modified by the Guild Master. But adds complexity: the trigger evaluator needs to scan artifacts, not just read config.

Recommendation: **config.yaml first**, with an exit point to artifact-based triggers later. The config approach is simpler and matches the event router's existing pattern. Scheduled commissions started as artifacts because they carry mutable state (runs_completed, last_run). Triggers are stateless rules, so config is a better fit.

## Question 2: The Interrupt Problem

This is the hardest problem in the brainstorm. Consider:

```
Plan: 4 Dalton phases, each a commission with dependencies.
  Phase 1 → Phase 2 → Phase 3 → Phase 4

User also wants:
  "After each Dalton phase, have Thorne review."
  "After Thorne's review, have Sable fix findings."
```

The desired execution order:
```
Phase 1 → Thorne Review 1 → Sable Fix 1 → Phase 2 → Thorne Review 2 → ...
```

But the dependency graph was defined as:
```
Phase 2 depends_on Phase 1
Phase 3 depends_on Phase 2
Phase 4 depends_on Phase 3
```

Phase 2's dependency on Phase 1 is satisfied the moment Phase 1 completes. The triggered review and fix need to complete before Phase 2 starts, but Phase 2 doesn't know they exist.

### Sub-question: Is This Actually an Interrupt?

The word "interrupt" implies breaking into an existing sequence. But that's not quite right. The dependency chain says "Phase 2 starts when Phase 1 completes." A trigger says "when Phase 1 completes, also start a review." These are parallel, not sequential, unless we add a mechanism to make the review block Phase 2.

Three models for how triggers interact with dependency chains:

### Model A: Parallel Track (Simplest)

Triggered commissions run alongside the dependency chain, not inside it. Phase 1 completes, Phase 2 starts, AND Thorne's review starts. The review is independent.

```
Phase 1 → Phase 2 → Phase 3 → Phase 4
    ↓         ↓         ↓
  Review 1  Review 2  Review 3 (parallel, non-blocking)
    ↓         ↓         ↓
  Fix 1     Fix 2     Fix 3
```

This is useful for audit trails and quality tracking but doesn't enforce "fix before next phase." It's also what you get if triggers just create commissions without modifying the dependency graph.

### Model B: Dependency Injection

When a trigger fires, the triggered commission is injected as a new dependency on the next phase. Phase 1 completes → trigger creates Review 1 → Review 1 is added as a dependency on Phase 2. Phase 2 now depends on both Phase 1 (already satisfied) and Review 1 (in progress).

```
Phase 1 → [Review 1 → Fix 1] → Phase 2 → [Review 2 → Fix 2] → Phase 3 → ...
```

This gets the desired sequencing but requires the trigger system to know about the dependency graph and modify it after creation. That's a significant escalation in complexity. Questions:

- How does the trigger know which commission is "next" in the chain? It would need to traverse the dependency graph from the completing commission to find dependents.
- What if the next phase has already transitioned to `pending` by the time the trigger fires? (The dependency checker runs on a polling loop.)
- What if there are multiple downstream dependents?

This feels like it's trying to make triggers do the job of a workflow engine. The complexity is a signal.

### Model C: Explicit Interleave (Recommended Direction)

Don't use triggers for this. Instead, define the full sequence upfront:

```
Phase 1 → Review 1 → Fix 1 → Phase 2 → Review 2 → Fix 2 → Phase 3 → ...
```

The user (or Guild Master) creates all commissions at plan time with explicit dependencies. This is more verbose but completely predictable. The dependency system already handles it.

Triggers are still useful here, but for a different purpose: "after any Dalton commission completes with status: failed, dispatch a diagnostic commission." That's a reactive rule, not a sequencing tool.

### The Key Insight

Triggers and dependencies solve different problems:

- **Dependencies** are for sequencing: "B must wait for A."
- **Triggers** are for reactions: "when X happens, also do Y."

Trying to make triggers modify dependency chains conflates the two. The interrupt problem is better solved by better planning tools (generating the full interleaved sequence from a compact definition like "Phase 1-4 with review+fix after each") than by runtime graph modification.

That said, there's a useful middle ground: a triggered commission can be created with its own `depends_on` list. If the trigger definition says `depends_on: ["{{commissionId}}"]`, the review commission is created with a dependency on the commission that triggered it. It won't start until that commission completes (which it already has, so it starts immediately). More importantly, other commissions can be defined to depend on the review. The dependency graph is still static after all commissions exist; the trigger just automates creating some of them.

### The "After Each Dalton Phase" Problem

How do you define "Thorne reviews after each Dalton phase" without separate triggers per phase?

With pattern matching (Option C from Question 1):

```yaml
triggers:
  - match:
      type: commission_status
      status: completed
      commissionId: "commission-guild-hall-developer-*"
    commission:
      worker: guild-hall-reviewer
      prompt: "Review {{commissionId}}"
      depends_on: ["{{commissionId}}"]
    approval: auto
```

This fires for any Dalton commission that completes, not just phases of one specific plan. That might be too broad. You'd want scoping, perhaps by `projectName` or by a tag/label system on commissions that triggers can filter on.

This is where the current event system's limitations show. The events carry `commissionId` and `status` but not tags, worker names, or plan associations. Enriching events (or looking up commission metadata when evaluating triggers) would help, but adds coupling.

## Question 3: Infinite Loop Prevention

If triggers can create commissions, and commission completion emits events, and events can fire triggers, then loops are possible.

```
Dalton completes → triggers Thorne review
Thorne completes → triggers Sable fix
Sable completes → triggers Dalton rework
Dalton rework completes → triggers Thorne review → ...
```

### Prevention Strategies

**Strategy 1: Provenance Chain with Depth Limit**

Every triggered commission carries a `triggered_by` field in its frontmatter:

```yaml
triggered_by:
  source_commission: commission-dalton-20260320
  trigger_rule: review-after-dalton
  depth: 1
```

Depth increments each time a triggered commission triggers another. A configurable maximum depth (default: 3) prevents runaway chains. At max depth, the trigger fires but creates the commission in `pending` with `approval: confirm`, forcing human review.

**Strategy 2: Cycle Detection on the Trigger Graph**

At config parse time, build a graph of which trigger rules can activate which other trigger rules (based on the worker of the created commission and the match patterns). Detect cycles statically and reject the config.

This is incomplete because triggers match on event patterns, not specific commissions. A trigger that matches "any completed commission" potentially cycles with any other trigger. Static analysis would be too conservative (rejecting valid configurations) or too permissive (missing runtime cycles).

**Strategy 3: Source Commission Exclusion**

Triggered commissions carry their trigger rule ID. A trigger rule will not fire on events from commissions that were themselves created by the same rule. This prevents direct self-loops but not indirect cycles (A → B → C → A).

**Strategy 4: Cooldown Period**

A trigger rule can fire at most once per N minutes for the same match pattern. This is a blunt instrument but effective as a safety net.

### Recommended Combination

Use **Strategy 1 (provenance + depth limit)** as the primary mechanism and **Strategy 3 (source exclusion)** as a secondary guard. The depth limit is the backstop that prevents runaway chains regardless of trigger topology. Source exclusion prevents the most common accidental loop (a review trigger firing on its own review commissions).

The provenance chain has a side benefit: it creates an audit trail. You can trace why a commission exists back through its trigger chain to the original manual or scheduled commission that started it all.

## Question 4: Relationship to Scheduled Commissions

### Structural Comparison

| Aspect | Scheduled | Triggered |
|--------|-----------|-----------|
| What causes dispatch | Cron expression fires | Event matches a rule |
| Where defined | `.lore/commissions/` artifact | `config.yaml` (initially) |
| State | Mutable (runs_completed, last_run) | Stateless (rules are pure) |
| Commission template | In the artifact (worker, prompt) | In the trigger definition |
| Overlap prevention | Yes (last_spawned_id check) | TBD (see below) |
| Lifecycle | active/paused/completed/failed | Rules are always active if present |

### Key Differences

Scheduled commissions are **stateful artifacts**. They track how many times they've run, when they last ran, what they last spawned. They have their own lifecycle (active, paused, completed, failed).

Triggered commissions are **stateless rules**. They fire when conditions are met. They don't track history (unless we add that, but it's not intrinsic to the concept). They're closer to notification rules than to scheduled commissions.

This means triggers don't share the scheduler infrastructure. The scheduler polls artifacts on a timer. Triggers subscribe to the EventBus, same as the event router. In fact, triggered commissions are an extension of the event router, not the scheduler.

### Architecture Direction

The cleanest implementation path: extend `createEventRouter` (or create a sibling `createTriggerRouter`) that subscribes to the same EventBus, evaluates trigger rules, and calls `commissionSession.createCommission()` + `commissionSession.dispatchCommission()` when a rule matches.

The trigger router needs access to commission creation (which the event router doesn't have today). This means either:

1. **Extend EventRouterDeps** to include commission dispatch capabilities. Muddies the router's current simplicity.
2. **Create a separate TriggerRouter** with its own subscription and deps. Cleaner separation but two subscribers processing the same events.
3. **Add a `dispatch` action type** to the existing router alongside `shell` and `webhook`. The router already loops over rules and dispatches; adding a third dispatch type is incremental.

Option 3 is the most natural. The router becomes "when this event happens, do this action." Notify via shell, notify via webhook, or dispatch a commission. The action types are different, but the matching and routing logic is shared.

### Overlap Prevention for Triggers

Scheduled commissions prevent overlap by checking whether `last_spawned_id` is still active. Triggers need something similar, but the mechanism differs because triggers are stateless.

Options:
- **No prevention**: Each trigger match creates a new commission. If three Dalton commissions complete within a minute, three reviews are created. This might be correct (you want a review per completion).
- **Deduplication window**: A trigger rule won't fire if it already fired for the same `commissionId` within the last N minutes. Requires in-memory state on the trigger router.
- **Commission-level dedup**: Before creating the triggered commission, check if one with the same source trigger + source commission already exists. Requires reading commission artifacts.

For the initial version, no prevention seems right. Triggers are reactive ("when X happens, do Y"), and if X happens three times, Y should happen three times. Overlap prevention is a scheduled commission concern because schedules represent recurring cadence (you don't want two weekly maintenance runs overlapping). Triggers represent reactions to specific events.

## Question 5: The Approval Question

### Per-Trigger vs Per-Firing

The trigger definition specifies `approval: auto` or `approval: confirm`. This is per-trigger-rule, not per-event. If a review trigger fires 4 times (once per phase), the approval mode is the same for all four.

This matches scheduled commissions: the schedule's approval is implicit (always auto, because the user created the schedule as a standing order). Triggers make it explicit because the user might trust some reactions more than others.

### Approval Mechanics

For `approval: auto`: The triggered commission is created and immediately dispatched, same as a scheduled commission spawn. No human in the loop.

For `approval: confirm`: The triggered commission is created in `pending` status. The user is notified (through whatever notification channel they've configured, which is a nice synergy with the event router). The user reviews and manually dispatches or cancels.

There's a question about whether `approval: confirm` should batch notifications. If a review trigger fires 4 times in 10 minutes, should the user get 4 separate notifications or one summary? For now, 4 separate is simpler and more honest. Batching is an optimization for later.

### Trust Escalation

A useful pattern from the standing delegation brainstorm: start triggers at `approval: confirm` and let users promote to `approval: auto` after they've seen the trigger fire correctly several times. The system could track how many times a user has approved a specific trigger's commissions and suggest promotion after N consecutive approvals.

This is a polish feature, not a launch requirement. But it's worth noting because it aligns with the vision's "Autonomous Initiative" growth surface: earned autonomy, not assumed.

## Concrete Scenario Walkthrough

### Scenario: Implement-Review-Fix Cycle

The user defines two triggers:

```yaml
triggers:
  - name: review-after-implement
    match:
      type: commission_status
      status: completed
      # Would need: worker field on the event, or commissionId pattern
    commission:
      worker: guild-hall-reviewer
      prompt: "Review the implementation in {{commissionId}}. Read the commission artifact and all linked artifacts."
      title: "Review: {{commissionId}}"
    approval: auto
    max_depth: 2

  - name: fix-after-review
    match:
      type: commission_result
      # Would need: way to identify review commissions
    commission:
      worker: guild-hall-developer
      prompt: "Address the review findings from {{commissionId}}."
      title: "Fix: {{commissionId}}"
    approval: confirm  # user approves fixes before they run
    max_depth: 2
```

Problems visible in this walkthrough:

1. **Event data is too thin.** `commission_status` doesn't carry the worker name. You can't match "when a Dalton commission completes" without either enriching the event or looking up commission metadata. This is the biggest implementation gap.

2. **Distinguishing commission types by trigger rule.** The fix-after-review trigger needs to know the completing commission was a review, not an implementation. Without tags or labels on commissions (and therefore on events), the match is imprecise.

3. **Template variable scope is limited.** The prompt template can reference event fields, but the review prompt probably needs to reference the reviewed commission's artifacts, not just its ID. This might require the triggered commission to receive richer context than what the event carries.

### What This Reveals

The event system was designed for notifications (tell someone what happened), not for reactions (do something about what happened). Making it serve both purposes requires:

- Enriching events with more commission metadata (worker, tags, project)
- Or giving the trigger evaluator access to commission records for lookup
- Or accepting that triggers will be coarser-grained than ideal and relying on the triggered commission's own intelligence to figure out context from its prompt

The third option is actually viable. The triggered commission's prompt says "Review {{commissionId}}." The review worker reads that commission's artifact, discovers the worker, finds the linked artifacts, and proceeds. The trigger doesn't need to know all the details; it just needs to create the commission with enough context for the worker to take it from there.

## Open Questions

1. **Event enrichment vs. lookup.** Should trigger evaluation enrich events (add worker, tags to commission events at emit time) or look up commission metadata when a rule partially matches? Enrichment is simpler but makes events larger. Lookup adds coupling but keeps events lean.

2. **Trigger definition location.** Config.yaml is the right starting point. Should there be an exit path to `.lore/triggers/` artifacts that the Guild Master can create? Or is config.yaml sufficient because triggers are infrastructure, not project-specific?

3. **Cross-project triggers.** Can a trigger on project A's events dispatch a commission on project B? The event router already supports `projectName` matching. Cross-project triggers would need the commission template to specify the target project.

4. **Interaction with commission templates.** The standing delegation brainstorm references "commission templates" as a prerequisite. Triggered commissions define inline templates (worker, prompt, etc.). Should there be a reusable template system that both triggers and manual creation can reference? Or is inline sufficient?

5. **Testing.** How do you test a trigger rule? You'd need to emit a synthetic event and verify the trigger creates the right commission. The DI pattern on the event router makes this testable, but the user experience of "did I define my trigger correctly?" needs a dry-run mode or validation tool.

## Directions

### Near-term (v1)

- Add `triggers` as a third array in config.yaml alongside `channels` and `notifications`.
- Trigger rules use the same `match` object as notification rules (type + optional projectName).
- When a trigger matches, create and dispatch a commission using inline template fields (worker, prompt, title).
- Provenance tracking: triggered commissions carry `triggered_by` in frontmatter (source commission, trigger rule name, depth).
- Depth limit (default 3) prevents runaway chains.
- `approval: auto | confirm` per trigger rule.
- Extend the event router to handle trigger dispatch (Option 3 from architecture discussion), or create a sibling TriggerRouter.

### Medium-term

- Enrich commission events with worker name and tags to enable finer-grained trigger matching.
- Add glob/pattern matching on string event fields (commissionId, worker) using micromatch.
- Template variable expansion in trigger commission definitions.
- Dry-run validation tool for trigger rules.

### Long-term

- Artifact-based trigger definitions (`.lore/triggers/`) that the Guild Master can create and modify.
- Trigger history and analytics (how often each rule fires, what it produces).
- Trust escalation (auto-promote triggers from confirm to auto after N successful firings).
- Workflow definitions that compose triggers + dependencies into repeatable patterns.

## Relationship to Standing Delegation

Standing delegation is the concept. Triggered commissions are the primary mechanism. The standing delegation brainstorm's `delegations` config block becomes the `triggers` block here, with more concrete semantics around matching, template instantiation, provenance, and loop prevention.

The approval model carries over directly: `auto` for trusted reactions, `confirm` for human-in-the-loop. The vision alignment analysis from standing delegation applies without modification.

What this brainstorm adds: the interrupt problem analysis, loop prevention strategies, the distinction between triggers and dependencies, and the gap analysis on event data richness.
