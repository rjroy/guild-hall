---
title: "Commission: Spec: Triggered commissions (event-driven dispatch)"
date: 2026-03-21
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a requirements spec for triggered commissions: event-driven commission dispatch through the event router.\n\n**Source brainstorm:** `.lore/brainstorm/triggered-commissions.md`. Use it as your starting point but the spec is authoritative.\n\n**Scope: v1 (near-term) from the brainstorm's \"Directions\" section.** Medium-term and long-term items are out of scope for this spec. Specifically:\n\n**In scope:**\n- `triggers` array in config.yaml alongside existing `channels` and `notifications`\n- Trigger rules using the same `match` object as notification rules (type + optional projectName), extended with optional field matching on event payload (e.g., `status: completed`)\n- Commission creation and dispatch when a trigger matches, using inline template fields (worker, prompt, title, optional dependencies)\n- Template variable expansion: `{{fieldName}}` substitution from matched event payload into prompt, title, and dependencies\n- Provenance tracking: `triggered_by` in commission frontmatter (source commission ID, trigger rule name, depth)\n- Depth limit (configurable, default 3) to prevent runaway chains. At max depth, commission created in pending with approval: confirm\n- `approval: auto | confirm` per trigger rule\n- Architecture: extend the event router to handle trigger dispatch (Option 3 from the brainstorm: add a `dispatch` action type alongside shell and webhook). The router already loops over rules and dispatches; this adds a third action type\n- Loop prevention: provenance chain with depth limit (Strategy 1) + source exclusion (Strategy 3) from the brainstorm\n- No overlap prevention for v1 (triggers are reactions to specific events, not recurring cadence)\n\n**Out of scope (explicit non-goals for this spec):**\n- Artifact-based trigger definitions (triggers live in config.yaml only)\n- Glob/pattern matching beyond what the event router already supports\n- Event enrichment (adding worker name, tags to events)\n- Trust escalation (auto-promote from confirm to auto)\n- Trigger history/analytics\n- Workflow definitions\n- Cross-project triggers\n- Reusable commission templates\n- Dry-run validation\n\n**Key design decisions from the brainstorm:**\n- Triggers are stateless rules, not stateful artifacts like scheduled commissions\n- Triggers are reactions (\"when X happens, also do Y\"), not sequencing tools. The interrupt problem is solved by explicit dependency chains at plan time, not by runtime graph modification\n- No overlap prevention in v1. If an event matches three times, three commissions are created.\n\n**Reference files:**\n- `.lore/brainstorm/triggered-commissions.md` — the brainstorm\n- `daemon/services/event-router.ts` — existing router to extend\n- `daemon/lib/event-bus.ts` — SystemEvent types\n- `.lore/specs/infrastructure/event-router.md` — event router spec\n- `lib/config.ts` — config schema (where triggers array would be added)\n\n**If anything needs a design pass before planning**, flag it in the spec. The brainstorm identified that event data is thin (commission_status doesn't carry worker name). If this blocks v1 trigger usefulness, name the gap and propose whether v1 proceeds without it or whether minimal event enrichment is a prerequisite."
dependencies: []
linked_artifacts:
  - .lore/specs/commissions/triggered-commissions.md

activity_timeline:
  - timestamp: 2026-03-21T04:10:27.297Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T04:10:27.298Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-21T04:10:27.346Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-21T04:10:34.808Z
    event: progress_report
    reason: "Reading source materials: brainstorm, event router code, event bus types, config schema, and event router spec."
  - timestamp: 2026-03-21T04:11:33.852Z
    event: progress_report
    reason: "Source materials read. Writing the spec now. Key findings: createCommission takes projectName, title, workerName, prompt, dependencies, resourceOverrides, and options. commission_status events carry commissionId, status, oldStatus, projectName, reason. The event router matches on type + optional projectName. The options param has type and sourceSchedule, which gives a pattern for adding sourceTrigger."
  - timestamp: 2026-03-21T04:14:12.425Z
    event: progress_report
    reason: "Spec written. 37 requirements across config schema, matching, templates, approval, provenance, loop prevention, architecture, validation, types, and commission creation. Now running fresh-eyes review."
  - timestamp: 2026-03-21T04:18:08.592Z
    event: result_submitted
    reason: "Wrote the triggered commissions spec at `.lore/specs/commissions/triggered-commissions.md`.\n\n**37 requirements** across 9 sections: config schema (REQ-TRIG-1 through 3), match object (4-7), commission template (8-10), template variable expansion (11-13), approval model (14-17), provenance tracking (18-20), loop prevention (21-24), architecture (25-29), config validation (30-31), type definitions (32-34), and commission creation (35-37).\n\n**Key decisions:**\n- `match.fields` for exact-match payload filtering (no glob/pattern matching in v1)\n- `triggered_by.source_id` (not `source_commission`) to handle non-commission event sources cleanly\n- `sourceTrigger` as a structured object in `createCommission` options (parallel to `sourceSchedule`)\n- Depth always 1 for non-commission sources (no artifact read attempted)\n- Inertness guard explicitly updated: router subscribes when it has triggers even without channels/notifications\n- Event data gap flagged honestly: worker name absent from events, v1 proceeds with \"smart prompt\" approach\n\n**Fresh-eyes review** by spec-reviewer agent identified 4 issues, all addressed:\n1. `createCommission` options shape made explicit (REQ-TRIG-35)\n2. Non-commission source depth/naming resolved with `source_id` rename\n3. Inertness guard condition spelled out in REQ-TRIG-27\n4. Missing test coverage items added to success criteria and AI validation"
  - timestamp: 2026-03-21T04:18:12.572Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Spec written. 37 requirements across config schema, matching, templates, approval, provenance, loop prevention, architecture, validation, types, and commission creation. Now running fresh-eyes review."
projectName: guild-hall
---
Wrote the triggered commissions spec at `.lore/specs/commissions/triggered-commissions.md`.

**37 requirements** across 9 sections: config schema (REQ-TRIG-1 through 3), match object (4-7), commission template (8-10), template variable expansion (11-13), approval model (14-17), provenance tracking (18-20), loop prevention (21-24), architecture (25-29), config validation (30-31), type definitions (32-34), and commission creation (35-37).

**Key decisions:**
- `match.fields` for exact-match payload filtering (no glob/pattern matching in v1)
- `triggered_by.source_id` (not `source_commission`) to handle non-commission event sources cleanly
- `sourceTrigger` as a structured object in `createCommission` options (parallel to `sourceSchedule`)
- Depth always 1 for non-commission sources (no artifact read attempted)
- Inertness guard explicitly updated: router subscribes when it has triggers even without channels/notifications
- Event data gap flagged honestly: worker name absent from events, v1 proceeds with "smart prompt" approach

**Fresh-eyes review** by spec-reviewer agent identified 4 issues, all addressed:
1. `createCommission` options shape made explicit (REQ-TRIG-35)
2. Non-commission source depth/naming resolved with `source_id` rename
3. Inertness guard condition spelled out in REQ-TRIG-27
4. Missing test coverage items added to success criteria and AI validation
