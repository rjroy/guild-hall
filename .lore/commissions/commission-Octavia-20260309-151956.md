---
title: "Commission: Plan: fix commission tab sorting and status gems"
date: 2026-03-09
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "The commission tab for a project has broken sorting since scheduled commissions were added. The specific symptom: everything shows a red gem (status indicator), regardless of actual status.\n\nInvestigate the current state and plan a fix.\n\n1. Read the commission list UI code. Start with:\n   - `web/app/projects/[name]/commissions/` (the commissions page)\n   - Any commission list/card components in `web/components/`\n   - Look for how status gems/indicators are determined and rendered\n\n2. Read the commission sorting logic:\n   - How are commissions ordered in the list?\n   - How does the sort handle scheduled commissions vs regular commissions?\n   - What statuses exist for each type?\n\n3. Read the commission and scheduled commission status types:\n   - `lib/types.ts` for commission status types\n   - `daemon/services/scheduler/` for scheduled commission statuses\n   - `daemon/services/commission/record.ts` for how commission records are read\n\n4. Identify:\n   - Why all gems are red (is the status mapping incomplete for new statuses?)\n   - What the correct gem color should be for each status\n   - Whether sorted order accounts for scheduled vs one-shot commissions\n   - Any missing status-to-gem mappings\n\n5. Write a plan to `.lore/plans/` that covers:\n   - The root cause of the red gem issue\n   - Correct status-to-gem mapping for all commission types\n   - Sort order that makes sense with scheduled commissions in the mix\n   - Component changes needed\n\nKeep it focused on the sorting and status display. Don't redesign the commission tab."
dependencies: []
linked_artifacts: []

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-09T22:19:56.809Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T22:19:56.810Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
