---
title: "Commission: Spec: Triggered commissions (event-driven dispatch)"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a requirements spec for triggered commissions: event-driven commission dispatch through the event router.\n\n**Source brainstorm:** `.lore/brainstorm/triggered-commissions.md`. Use it as your starting point but the spec is authoritative.\n\n**Scope: v1 (near-term) from the brainstorm's \"Directions\" section.** Medium-term and long-term items are out of scope for this spec. Specifically:\n\n**In scope:**\n- `triggers` array in config.yaml alongside existing `channels` and `notifications`\n- Trigger rules using the same `match` object as notification rules (type + optional projectName), extended with optional field matching on event payload (e.g., `status: completed`)\n- Commission creation and dispatch when a trigger matches, using inline template fields (worker, prompt, title, optional dependencies)\n- Template variable expansion: `{{fieldName}}` substitution from matched event payload into prompt, title, and dependencies\n- Provenance tracking: `triggered_by` in commission frontmatter (source commission ID, trigger rule name, depth)\n- Depth limit (configurable, default 3) to prevent runaway chains. At max depth, commission created in pending with approval: confirm\n- `approval: auto | confirm` per trigger rule\n- Architecture: extend the event router to handle trigger dispatch (Option 3 from the brainstorm: add a `dispatch` action type alongside shell and webhook). The router already loops over rules and dispatches; this adds a third action type\n- Loop prevention: provenance chain with depth limit (Strategy 1) + source exclusion (Strategy 3) from the brainstorm\n- No overlap prevention for v1 (triggers are reactions to specific events, not recurring cadence)\n\n**Out of scope (explicit non-goals for this spec):**\n- Artifact-based trigger definitions (triggers live in config.yaml only)\n- Glob/pattern matching beyond what the event router already supports\n- Event enrichment (adding worker name, tags to events)\n- Trust escalation (auto-promote from confirm to auto)\n- Trigger history/analytics\n- Workflow definitions\n- Cross-project triggers\n- Reusable commission templates\n- Dry-run validation\n\n**Key design decisions from the brainstorm:**\n- Triggers are stateless rules, not stateful artifacts like scheduled commissions\n- Triggers are reactions (\"when X happens, also do Y\"), not sequencing tools. The interrupt problem is solved by explicit dependency chains at plan time, not by runtime graph modification\n- No overlap prevention in v1. If an event matches three times, three commissions are created.\n\n**Reference files:**\n- `.lore/brainstorm/triggered-commissions.md` — the brainstorm\n- `daemon/services/event-router.ts` — existing router to extend\n- `daemon/lib/event-bus.ts` — SystemEvent types\n- `.lore/specs/infrastructure/event-router.md` — event router spec\n- `lib/config.ts` — config schema (where triggers array would be added)\n\n**If anything needs a design pass before planning**, flag it in the spec. The brainstorm identified that event data is thin (commission_status doesn't carry worker name). If this blocks v1 trigger usefulness, name the gap and propose whether v1 proceeds without it or whether minimal event enrichment is a prerequisite."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T04:10:27.297Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T04:10:27.298Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
