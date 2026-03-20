---
title: "Commission: Brainstorm: Triggered commissions (event-driven dispatch)"
date: 2026-03-20
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "## Brainstorm Task: Triggered Commissions\n\nWrite a companion brainstorm to `.lore/brainstorm/standing-delegation.md` at `.lore/brainstorm/triggered-commissions.md`.\n\nRead the standing delegation brainstorm first. The user likes the concept but wants to reframe it around a more concrete mechanism: **commissions triggered by events**.\n\n### The Core Reframe\n\nThe important concept is: a commission that is triggered based on an event. This is a parallel creation path alongside scheduled commissions (cron-triggered) and manual commissions (user-triggered). The third path: event-triggered.\n\n### Questions to Explore\n\n**1. What do triggers look like?**\n\nThe event router is already implemented (`daemon/services/event-router/`). Read it. What events does it currently support? The question is whether this is about expanding the event router to support more event types, or about adding a new subscription type that dispatches commissions instead of notifications.\n\nThink about the trigger definition shape. Something with regex and event IDs? Pattern matching on event payloads? How specific or general should triggers be? Look at how scheduled commissions are defined in config and artifacts — the triggered commission definition should feel like a natural sibling.\n\n**2. The interrupt problem.**\n\nConsider this scenario: A plan has 4 phases, each as a Dalton commission with dependencies (Phase 2 depends on Phase 1, etc.). The user also wants: \"when Dalton finishes, have Thorne review\" and \"when Thorne's review completes, have Sable integrate the feedback.\"\n\nThis creates a problem. The Thorne review and Sable fix commissions need to interleave with Dalton's phase sequence. Phase 1 completes → Thorne reviews Phase 1 → Sable fixes Phase 1 findings → Phase 2 starts. But Phase 2 was already defined with a dependency on Phase 1, not on Sable's fix.\n\nHow does the triggered commission interact with existing dependency chains? Is this an interrupt that inserts into the chain? Does it create a parallel track? How do we define \"Thorne reviews after each Dalton phase\" without creating a separate trigger for each phase? What are the implications for the commission graph?\n\n**3. Infinite loop prevention.**\n\nIf \"Dalton completes → trigger Thorne review\" and \"Thorne completes → trigger Sable fix\" and somehow \"Sable completes → trigger Dalton rework\"... we have a loop. How do we prevent this? Options to consider:\n- Depth limits (triggered commissions can't trigger more than N levels deep)\n- Cycle detection on the trigger graph\n- A \"triggered by\" field that tracks provenance and refuses to re-trigger the same source\n- Manual approval gates after N automatic dispatches\n\n**4. Relationship to scheduled commissions.**\n\nScheduled commissions already exist as a parallel creation path. Triggered commissions would be a third path. How similar should they be in structure? Do they share artifact format? Do they share the scheduler infrastructure or need their own?\n\n**5. The approval question.**\n\nStanding delegation proposes `approval: auto` vs `approval: confirm`. For triggered commissions, is this per-trigger or per-event? If a review trigger fires 4 times (once per phase), does the user approve each one or approve the trigger definition once?\n\n### What to Reference\n\n- `.lore/brainstorm/standing-delegation.md` — the parent concept\n- `daemon/services/event-router/` — the existing event router implementation\n- `daemon/services/scheduler/` — the existing scheduled commission system\n- `daemon/services/commission/orchestrator.ts` — dependency handling\n- `.lore/specs/infrastructure/event-router.md` — event router spec\n- `.lore/specs/commissions/` — commission specs\n\n### Output\n\nWrite to `.lore/brainstorm/triggered-commissions.md`. This is a brainstorm, not a spec. Explore the design space, identify the hard problems, and propose directions. Link it back to standing-delegation.md as a companion piece."
dependencies: []
linked_artifacts:
  - .lore/brainstorm/triggered-commissions.md

activity_timeline:
  - timestamp: 2026-03-20T21:14:39.100Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T21:14:39.102Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-20T21:14:39.147Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-20T21:14:47.224Z
    event: progress_report
    reason: "Reading standing delegation brainstorm, event router implementation, scheduler, and commission specs to gather context."
  - timestamp: 2026-03-20T21:15:26.417Z
    event: progress_report
    reason: "All source materials read. Now drafting the triggered commissions brainstorm document."
  - timestamp: 2026-03-20T21:18:30.179Z
    event: result_submitted
    reason: "Wrote `.lore/brainstorm/triggered-commissions.md` as a companion to the standing delegation brainstorm. The document covers all five requested questions:\n\n1. **Trigger shape**: Recommends extending the event router's match object with pattern matching (micromatch globs on string fields), inline commission templates with `{{fieldName}}` variable substitution, and config.yaml as the definition location.\n\n2. **The interrupt problem**: Analyzes three models (parallel track, dependency injection, explicit interleave). Concludes that triggers and dependencies solve different problems: triggers are for reactions (\"when X happens, also do Y\"), dependencies are for sequencing (\"B waits for A\"). Trying to make triggers modify dependency chains conflates the two. The interleave sequence is better solved at plan time.\n\n3. **Infinite loop prevention**: Recommends provenance chain with depth limit (default 3) as primary mechanism, source commission exclusion as secondary guard. The provenance chain also creates an audit trail.\n\n4. **Relationship to scheduled commissions**: Triggers are stateless rules (closer to notification rules) while schedules are stateful artifacts. Triggers belong on the event router, not the scheduler. Recommends extending the event router with a `dispatch` action type alongside `shell` and `webhook`.\n\n5. **Approval question**: Per-trigger-rule, not per-event. `auto` dispatches immediately, `confirm` creates in pending and notifies. Notes the trust escalation pattern as a future polish feature.\n\nAlso identifies the key implementation gap: commission events are too thin for precise trigger matching (no worker name, no tags). The document proposes three approaches and recommends leaning on the triggered worker's intelligence to discover context from its prompt rather than enriching all events upfront."
  - timestamp: 2026-03-20T21:18:46.966Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All source materials read. Now drafting the triggered commissions brainstorm document."
projectName: guild-hall
---
Wrote `.lore/brainstorm/triggered-commissions.md` as a companion to the standing delegation brainstorm. The document covers all five requested questions:

1. **Trigger shape**: Recommends extending the event router's match object with pattern matching (micromatch globs on string fields), inline commission templates with `{{fieldName}}` variable substitution, and config.yaml as the definition location.

2. **The interrupt problem**: Analyzes three models (parallel track, dependency injection, explicit interleave). Concludes that triggers and dependencies solve different problems: triggers are for reactions ("when X happens, also do Y"), dependencies are for sequencing ("B waits for A"). Trying to make triggers modify dependency chains conflates the two. The interleave sequence is better solved at plan time.

3. **Infinite loop prevention**: Recommends provenance chain with depth limit (default 3) as primary mechanism, source commission exclusion as secondary guard. The provenance chain also creates an audit trail.

4. **Relationship to scheduled commissions**: Triggers are stateless rules (closer to notification rules) while schedules are stateful artifacts. Triggers belong on the event router, not the scheduler. Recommends extending the event router with a `dispatch` action type alongside `shell` and `webhook`.

5. **Approval question**: Per-trigger-rule, not per-event. `auto` dispatches immediately, `confirm` creates in pending and notifies. Notes the trust escalation pattern as a future polish feature.

Also identifies the key implementation gap: commission events are too thin for precise trigger matching (no worker name, no tags). The document proposes three approaches and recommends leaning on the triggered worker's intelligence to discover context from its prompt rather than enriching all events upfront.
