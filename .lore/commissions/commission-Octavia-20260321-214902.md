---
title: "Commission: Brainstorm: Triggered commission creation UX"
date: 2026-03-22
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "## Task\n\nBrainstorm how the \"create triggered commission\" UX should work in the web UI. Write your findings to `.lore/brainstorm/triggered-commission-creation-ux.md`.\n\n## Context\n\nThe web UI already has a commission creation form that supports two commission types: **one-shot** and **scheduled**. These are presented as two tabs on the same form. The user wants to explore whether triggered commissions can be added as a third tab on that same form, keeping the UX consistent.\n\n### What you need to understand\n\n1. **Read the existing creation form** to understand the current tab structure and fields:\n   - Look in `web/components/commission/` for the creation form component\n   - Understand what fields are shared vs. tab-specific between one-shot and scheduled\n\n2. **Read the triggered commission spec** to understand what fields a triggered commission needs:\n   - `.lore/specs/commissions/triggered-commissions.md`\n   - Key fields: match rule (event type, optional project filter, optional field patterns), approval mode (auto/confirm), prompt (with template variables), worker, title, dependencies\n\n3. **Read the triggered commission types** to understand the data model:\n   - Look in `daemon/types.ts` or `lib/types.ts` for triggered commission types\n   - Look at the `create_triggered_commission` tool in `daemon/services/manager/toolbox.ts` for the creation parameters\n\n4. **Read the existing daemon routes** for commission creation to understand what API endpoints exist:\n   - `daemon/routes/commissions.ts` for existing creation routes\n   - Check if there's already a route for creating triggered commissions\n\n### Questions to explore\n\n- Can triggered commissions fit naturally as a third tab alongside one-shot and scheduled? What fields are shared, what's unique?\n- How should the match rule be presented? Event type is required, project filter and field patterns are optional. What's the right UX for field patterns (key-value pairs with glob support)?\n- How should template variables in the prompt be communicated? (e.g., `{{event.type}}`, `{{event.fields.pr_number}}`)\n- Should approval mode (auto vs. confirm) be a toggle, radio buttons, or dropdown?\n- What's the right level of complexity for v1? Should we hide advanced options (field patterns, template variables) behind an expandable section?\n- How does the \"test this trigger\" flow work, if at all?\n\n### Output format\n\nWrite a brainstorm artifact covering the options you explored, tradeoffs, and a recommended approach. Include rough wireframe descriptions (text-based) if helpful."
dependencies: []
linked_artifacts: []

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
current_progress: ""
projectName: guild-hall
---
