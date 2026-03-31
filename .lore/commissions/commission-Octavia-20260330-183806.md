---
title: "Commission: Plan: Collapsible metadata sidebar"
date: 2026-03-31
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write an implementation plan for the issue at `.lore/issues/collapse-metadata-sidebar.md`.\n\nThe issue: On Artifacts and in Meetings, the metadata sidebar should be collapsible.\n\nRead the current implementation of both views to understand how the sidebar is structured today:\n- The artifact detail view (look in `web/app/` for artifact-related pages)\n- The meeting view (look in `web/app/` for meeting-related pages)\n- Any shared sidebar or metadata components\n\nProduce a plan at `.lore/plans/collapse-metadata-sidebar.md` that covers:\n1. What components need to change\n2. How the collapse interaction should work (toggle button, state persistence, animation if appropriate)\n3. Whether a shared collapsible sidebar component makes sense or if each view handles it independently\n4. CSS considerations (the project uses CSS Modules, not Tailwind)\n5. Any edge cases (mobile, narrow viewports, keyboard accessibility)\n\nKeep it practical. This is a UI polish feature, not an architecture change."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-31T01:38:06.922Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-31T01:38:06.924Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
