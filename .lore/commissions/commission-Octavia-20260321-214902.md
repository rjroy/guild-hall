---
title: "Commission: Brainstorm: Triggered commission creation UX"
date: 2026-03-22
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "## Task\n\nBrainstorm how the \"create triggered commission\" UX should work in the web UI. Write your findings to `.lore/brainstorm/triggered-commission-creation-ux.md`.\n\n## Context\n\nThe web UI already has a commission creation form that supports two commission types: **one-shot** and **scheduled**. These are presented as two tabs on the same form. The user wants to explore whether triggered commissions can be added as a third tab on that same form, keeping the UX consistent.\n\n### What you need to understand\n\n1. **Read the existing creation form** to understand the current tab structure and fields:\n   - Look in `web/components/commission/` for the creation form component\n   - Understand what fields are shared vs. tab-specific between one-shot and scheduled\n\n2. **Read the triggered commission spec** to understand what fields a triggered commission needs:\n   - `.lore/specs/commissions/triggered-commissions.md`\n   - Key fields: match rule (event type, optional project filter, optional field patterns), approval mode (auto/confirm), prompt (with template variables), worker, title, dependencies\n\n3. **Read the triggered commission types** to understand the data model:\n   - Look in `daemon/types.ts` or `lib/types.ts` for triggered commission types\n   - Look at the `create_triggered_commission` tool in `daemon/services/manager/toolbox.ts` for the creation parameters\n\n4. **Read the existing daemon routes** for commission creation to understand what API endpoints exist:\n   - `daemon/routes/commissions.ts` for existing creation routes\n   - Check if there's already a route for creating triggered commissions\n\n### Questions to explore\n\n- Can triggered commissions fit naturally as a third tab alongside one-shot and scheduled? What fields are shared, what's unique?\n- How should the match rule be presented? Event type is required, project filter and field patterns are optional. What's the right UX for field patterns (key-value pairs with glob support)?\n- How should template variables in the prompt be communicated? (e.g., `{{event.type}}`, `{{event.fields.pr_number}}`)\n- Should approval mode (auto vs. confirm) be a toggle, radio buttons, or dropdown?\n- What's the right level of complexity for v1? Should we hide advanced options (field patterns, template variables) behind an expandable section?\n- How does the \"test this trigger\" flow work, if at all?\n\n### Output format\n\nWrite a brainstorm artifact covering the options you explored, tradeoffs, and a recommended approach. Include rough wireframe descriptions (text-based) if helpful."
dependencies: []
linked_artifacts:
  - .lore/brainstorm/triggered-commission-creation-ux.md

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-22T04:49:02.824Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T04:49:02.825Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-22T04:49:02.867Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-22T04:49:09.537Z
    event: progress_report
    reason: "Starting the brainstorm. Reading the existing commission creation form, triggered commission spec, and relevant types in parallel."
  - timestamp: 2026-03-22T04:50:29.821Z
    event: progress_report
    reason: "Read the existing form, spec, types, and routes. Have a clear picture of what exists and what the form needs. Writing the brainstorm document now."
  - timestamp: 2026-03-22T04:52:08.382Z
    event: result_submitted
    reason: "Brainstorm written to `.lore/brainstorm/triggered-commission-creation-ux.md`. Key findings:\n\n1. **Third tab fits naturally.** The form's existing pattern (type toggle, conditional section, shared fields) maps cleanly. Trigger adds one more conditional branch — no architectural changes to the form needed.\n\n2. **No backend work required.** The daemon route already handles `type: \"triggered\"` with `match`, `approval`, and `maxDepth`. Only frontend work is needed, with one open question: whether the Next.js proxy passes these fields through.\n\n3. **Recommended approach:** Flat trigger section (all options visible) with event-type-aware field hints. Field patterns as dynamic key-value rows (not textarea/JSON). Approval as radio buttons. maxDepth buried in the existing Resource Overrides expander. Template variable hints below Prompt/Title fields, updating based on selected event type.\n\n4. **Key design choices resolved:** Field patterns need structured input (rows with Add/Remove), not a textarea. Approval radio buttons > checkbox. Match summary line above submit button provides lightweight \"test\" feedback without needing a backend round-trip.\n\n5. **V1 scope:** No test-trigger flow (spec-approved non-goal). No autocomplete on field keys (nice-to-have). No click-to-insert for template variables (nice-to-have)."
  - timestamp: 2026-03-22T04:52:21.620Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Read the existing form, spec, types, and routes. Have a clear picture of what exists and what the form needs. Writing the brainstorm document now."
projectName: guild-hall
---
Brainstorm written to `.lore/brainstorm/triggered-commission-creation-ux.md`. Key findings:

1. **Third tab fits naturally.** The form's existing pattern (type toggle, conditional section, shared fields) maps cleanly. Trigger adds one more conditional branch — no architectural changes to the form needed.

2. **No backend work required.** The daemon route already handles `type: "triggered"` with `match`, `approval`, and `maxDepth`. Only frontend work is needed, with one open question: whether the Next.js proxy passes these fields through.

3. **Recommended approach:** Flat trigger section (all options visible) with event-type-aware field hints. Field patterns as dynamic key-value rows (not textarea/JSON). Approval as radio buttons. maxDepth buried in the existing Resource Overrides expander. Template variable hints below Prompt/Title fields, updating based on selected event type.

4. **Key design choices resolved:** Field patterns need structured input (rows with Add/Remove), not a textarea. Approval radio buttons > checkbox. Match summary line above submit button provides lightweight "test" feedback without needing a backend round-trip.

5. **V1 scope:** No test-trigger flow (spec-approved non-goal). No autocomplete on field keys (nice-to-have). No click-to-insert for template variables (nice-to-have).
