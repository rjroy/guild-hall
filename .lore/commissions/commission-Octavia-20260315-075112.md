---
title: "Commission: Brainstorm: Dashboard card selection model"
date: 2026-03-15
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Run the brainstorm skill on the following topic.\n\n## Topic\n\nThe three dashboard cards (Briefing, Task Dependency Map, Recent Scrolls) have inconsistent behavior around project selection:\n\n- **Briefing** shows the first briefing in the list, or the selected project's briefing.\n- **Task Dependency Map** always shows all projects.\n- **Recent Scrolls** only shows the selected project (empty until one is selected).\n\nThe user's intent is:\n- When no project is selected, the dashboard should represent an **overall view across all projects**.\n- When a project is selected, it should show an **overview of that specific project**.\n\n## Questions to explore\n\n1. **Overall briefing**: When no project is selected, what does the briefing card show? Generating an \"all projects\" briefing is non-trivial. What are the options (aggregate, most-recent, summary, etc.) and their tradeoffs?\n\n2. **Selection state distinction**: How does the UI communicate the difference between \"no project selected\" (all-projects view) and \"project X selected\" (project-specific view)? This needs to be visually clear.\n\n3. **Deselection**: How does a user unselect a project and return to the all-projects view? There's currently no mechanism for this.\n\n4. **Per-card behavior**: For each of the three cards, define what \"all projects\" mode and \"selected project\" mode look like concretely.\n\n## Context\n\n- Read `.lore/issues/recent-scrolls-empty-state.md` for background on the empty state problem.\n- Read the dashboard page implementation in `web/app/page.tsx` and the dashboard components in `web/components/dashboard/` to understand current behavior.\n- The brainstorm artifact should go in `.lore/brainstorm/ui/dashboard-selection-model.md`.\n"
dependencies: []
linked_artifacts: []

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-15T14:51:12.124Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-15T14:51:12.125Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
