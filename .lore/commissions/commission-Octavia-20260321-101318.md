---
title: "Commission: Brainstorm: Event Router advanced matching (glob, field filters, rule extensions)"
date: 2026-03-21
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Brainstorm what an advanced matching extension to the Event Router would look like. The current router matches on `type` (exact) and `projectName` (exact, optional). Multiple specs and brainstorms have floated richer filtering ideas. Gather those scattered ideas and centralize them here.\n\n**Read first (gather the scattered ideas):**\n- The implemented Event Router spec: `.lore/specs/infrastructure/event-router.md` (especially the exit points table and non-goals mentioning \"finer matching on status, commissionId, glob patterns\")\n- The triggered commissions spec (draft): `.lore/specs/commissions/triggered-commissions.md` (likely has matching/filtering requirements)\n- The triggered commissions brainstorm: `.lore/brainstorm/triggered-commissions.md`\n- The event router brainstorm: `.lore/brainstorm/event-router.md`\n- The notification service implementation: `daemon/services/notification-service.ts`\n- The router implementation: `daemon/services/event-router.ts` (to understand the current `EventMatchRule` shape)\n- The EventBus types: `daemon/lib/event-bus.ts` (to understand what fields `SystemEvent` variants carry)\n\n**What to explore:**\n\nThe current `EventMatchRule` is `{ type, projectName? }`. What would a richer matching system look like?\n\nConsider:\n- Glob/pattern matching on string fields (e.g., `commissionId: \"commission-Dalton-*\"`, `workerName: \"Thorne\"`)\n- Status filters (e.g., match `commission_status` only when `status === \"completed\"`)\n- Field-existence checks (match events that carry `projectName` vs. those that don't)\n- Negation (match everything except type X)\n- Compound rules (AND/OR composition)\n- How micromatch or minimatch (already in the project for canUseToolRules) could be reused\n- What the config.yaml syntax would look like for each approach\n- Where the complexity/power tradeoff sits: what's the simplest extension that covers 90% of real use cases?\n\n**Also consider the consumers:**\n- Notifications: \"notify me when a commission completes for project X\" (needs status filter)\n- Triggered commissions: \"when a review completes, auto-dispatch a fix commission\" (needs status + worker/title matching)\n- What filtering do these consumers actually need that they can't express today?\n\n**Output:**\n\nWrite to `.lore/brainstorm/event-router-advanced-matching.md`. Structure as:\n- Current state (what the router matches on today)\n- Scattered ideas (what's been proposed where, with references)\n- Pattern catalog (each matching approach with syntax, pros, cons, complexity)\n- Consumer needs analysis (what notifications and triggered commissions actually require)\n- Recommended direction (what to add first, what to defer)"
dependencies: []
linked_artifacts:
  - .lore/brainstorm/event-router-advanced-matching.md

activity_timeline:
  - timestamp: 2026-03-21T17:13:18.979Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T17:13:18.981Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-21T17:13:19.027Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-21T17:13:26.697Z
    event: progress_report
    reason: "Reading source material: specs, brainstorms, and implementations for the event router and its consumers."
  - timestamp: 2026-03-21T17:14:09.359Z
    event: progress_report
    reason: "Finished reading all source material. Writing the brainstorm document now."
  - timestamp: 2026-03-21T17:16:40.220Z
    event: result_submitted
    reason: "Wrote `.lore/brainstorm/event-router-advanced-matching.md`. The brainstorm gathers scattered matching proposals from the event router spec (exit points), triggered commissions spec (draft `fields` object), and triggered commissions brainstorm (three options analysis + event data gap). It catalogs seven matching approaches from simple to complex, analyzes what notifications and triggered commissions actually need, and recommends a two-phase direction: (1) generic `fields?: Record<string, string>` with exact match (solves the #1 gap: status filtering), then (2) upgrade to micromatch glob patterns (adds worker-scoping via commissionId patterns, negation, and brace-expansion OR). Everything else (compound rules, condition expressions, field-absence checks) is deferred. A parallel event enrichment track (worker name and projectName on more events) is identified as the highest-leverage complement to matching improvements."
  - timestamp: 2026-03-21T17:16:48.110Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Finished reading all source material. Writing the brainstorm document now."
projectName: guild-hall
---
Wrote `.lore/brainstorm/event-router-advanced-matching.md`. The brainstorm gathers scattered matching proposals from the event router spec (exit points), triggered commissions spec (draft `fields` object), and triggered commissions brainstorm (three options analysis + event data gap). It catalogs seven matching approaches from simple to complex, analyzes what notifications and triggered commissions actually need, and recommends a two-phase direction: (1) generic `fields?: Record<string, string>` with exact match (solves the #1 gap: status filtering), then (2) upgrade to micromatch glob patterns (adds worker-scoping via commissionId patterns, negation, and brace-expansion OR). Everything else (compound rules, condition expressions, field-absence checks) is deferred. A parallel event enrichment track (worker name and projectName on more events) is identified as the highest-leverage complement to matching improvements.
