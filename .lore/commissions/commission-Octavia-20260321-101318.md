---
title: "Commission: Brainstorm: Event Router advanced matching (glob, field filters, rule extensions)"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Brainstorm what an advanced matching extension to the Event Router would look like. The current router matches on `type` (exact) and `projectName` (exact, optional). Multiple specs and brainstorms have floated richer filtering ideas. Gather those scattered ideas and centralize them here.\n\n**Read first (gather the scattered ideas):**\n- The implemented Event Router spec: `.lore/specs/infrastructure/event-router.md` (especially the exit points table and non-goals mentioning \"finer matching on status, commissionId, glob patterns\")\n- The triggered commissions spec (draft): `.lore/specs/commissions/triggered-commissions.md` (likely has matching/filtering requirements)\n- The triggered commissions brainstorm: `.lore/brainstorm/triggered-commissions.md`\n- The event router brainstorm: `.lore/brainstorm/event-router.md`\n- The notification service implementation: `daemon/services/notification-service.ts`\n- The router implementation: `daemon/services/event-router.ts` (to understand the current `EventMatchRule` shape)\n- The EventBus types: `daemon/lib/event-bus.ts` (to understand what fields `SystemEvent` variants carry)\n\n**What to explore:**\n\nThe current `EventMatchRule` is `{ type, projectName? }`. What would a richer matching system look like?\n\nConsider:\n- Glob/pattern matching on string fields (e.g., `commissionId: \"commission-Dalton-*\"`, `workerName: \"Thorne\"`)\n- Status filters (e.g., match `commission_status` only when `status === \"completed\"`)\n- Field-existence checks (match events that carry `projectName` vs. those that don't)\n- Negation (match everything except type X)\n- Compound rules (AND/OR composition)\n- How micromatch or minimatch (already in the project for canUseToolRules) could be reused\n- What the config.yaml syntax would look like for each approach\n- Where the complexity/power tradeoff sits: what's the simplest extension that covers 90% of real use cases?\n\n**Also consider the consumers:**\n- Notifications: \"notify me when a commission completes for project X\" (needs status filter)\n- Triggered commissions: \"when a review completes, auto-dispatch a fix commission\" (needs status + worker/title matching)\n- What filtering do these consumers actually need that they can't express today?\n\n**Output:**\n\nWrite to `.lore/brainstorm/event-router-advanced-matching.md`. Structure as:\n- Current state (what the router matches on today)\n- Scattered ideas (what's been proposed where, with references)\n- Pattern catalog (each matching approach with syntax, pros, cons, complexity)\n- Consumer needs analysis (what notifications and triggered commissions actually require)\n- Recommended direction (what to add first, what to defer)"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T17:13:18.979Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T17:13:18.981Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
