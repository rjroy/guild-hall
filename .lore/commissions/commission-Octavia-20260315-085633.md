---
title: "Commission: Plan: Dashboard selection model"
date: 2026-03-15
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Run the prep-plan skill to create an implementation plan for `.lore/specs/ui/dashboard-selection-model.md`.\n\nRead the spec first, then read the current dashboard implementation (`web/app/page.tsx`, `web/components/dashboard/`) and the daemon briefing service (`daemon/services/briefing/`, `daemon/routes/briefing.ts`) to understand what needs to change.\n\nThe plan should go in `.lore/plans/ui/dashboard-selection-model.md`.\n"
dependencies: []
linked_artifacts: []

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-15T15:56:33.100Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-15T15:56:33.102Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
