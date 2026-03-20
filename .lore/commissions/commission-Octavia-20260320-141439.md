---
title: "Commission: Brainstorm: Triggered commissions (event-driven dispatch)"
date: 2026-03-20
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "## Brainstorm Task: Triggered Commissions\n\nWrite a companion brainstorm to `.lore/brainstorm/standing-delegation.md` at `.lore/brainstorm/triggered-commissions.md`.\n\nRead the standing delegation brainstorm first. The user likes the concept but wants to reframe it around a more concrete mechanism: **commissions triggered by events**.\n\n### The Core Reframe\n\nThe important concept is: a commission that is triggered based on an event. This is a parallel creation path alongside scheduled commissions (cron-triggered) and manual commissions (user-triggered). The third path: event-triggered.\n\n### Questions to Explore\n\n**1. What do triggers look like?**\n\nThe event router is already implemented (`daemon/services/event-router/`). Read it. What events does it currently support? The question is whether this is about expanding the event router to support more event types, or about adding a new subscription type that dispatches commissions instead of notifications.\n\nThink about the trigger definition shape. Something with regex and event IDs? Pattern matching on event payloads? How specific or general should triggers be? Look at how scheduled commissions are defined in config and artifacts — the triggered commission definition should feel like a natural sibling.\n\n**2. The interrupt problem.**\n\nConsider this scenario: A plan has 4 phases, each as a Dalton commission with dependencies (Phase 2 depends on Phase 1, etc.). The user also wants: \"when Dalton finishes, have Thorne review\" and \"when Thorne's review completes, have Sable integrate the feedback.\"\n\nThis creates a problem. The Thorne review and Sable fix commissions need to interleave with Dalton's phase sequence. Phase 1 completes → Thorne reviews Phase 1 → Sable fixes Phase 1 findings → Phase 2 starts. But Phase 2 was already defined with a dependency on Phase 1, not on Sable's fix.\n\nHow does the triggered commission interact with existing dependency chains? Is this an interrupt that inserts into the chain? Does it create a parallel track? How do we define \"Thorne reviews after each Dalton phase\" without creating a separate trigger for each phase? What are the implications for the commission graph?\n\n**3. Infinite loop prevention.**\n\nIf \"Dalton completes → trigger Thorne review\" and \"Thorne completes → trigger Sable fix\" and somehow \"Sable completes → trigger Dalton rework\"... we have a loop. How do we prevent this? Options to consider:\n- Depth limits (triggered commissions can't trigger more than N levels deep)\n- Cycle detection on the trigger graph\n- A \"triggered by\" field that tracks provenance and refuses to re-trigger the same source\n- Manual approval gates after N automatic dispatches\n\n**4. Relationship to scheduled commissions.**\n\nScheduled commissions already exist as a parallel creation path. Triggered commissions would be a third path. How similar should they be in structure? Do they share artifact format? Do they share the scheduler infrastructure or need their own?\n\n**5. The approval question.**\n\nStanding delegation proposes `approval: auto` vs `approval: confirm`. For triggered commissions, is this per-trigger or per-event? If a review trigger fires 4 times (once per phase), does the user approve each one or approve the trigger definition once?\n\n### What to Reference\n\n- `.lore/brainstorm/standing-delegation.md` — the parent concept\n- `daemon/services/event-router/` — the existing event router implementation\n- `daemon/services/scheduler/` — the existing scheduled commission system\n- `daemon/services/commission/orchestrator.ts` — dependency handling\n- `.lore/specs/infrastructure/event-router.md` — event router spec\n- `.lore/specs/commissions/` — commission specs\n\n### Output\n\nWrite to `.lore/brainstorm/triggered-commissions.md`. This is a brainstorm, not a spec. Explore the design space, identify the hard problems, and propose directions. Link it back to standing-delegation.md as a companion piece."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-20T21:14:39.100Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T21:14:39.102Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
