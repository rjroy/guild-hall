---
title: "Commission: Plan: Commission list filtering"
date: 2026-03-14
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write an implementation plan for `.lore/specs/ui/commission-list-filtering.md`.\n\nRead the spec first, then read the existing code it references to understand the starting point. Also read the resolved brainstorm at `.lore/brainstorm/commission-list-filtering.md` for additional context on design decisions.\n\nThe plan should cover what to change, in what order, and how to verify each step.\n\n**Reference files to read:**\n- `.lore/specs/ui/commission-list-filtering.md` — the spec (source of truth)\n- `.lore/brainstorm/commission-list-filtering.md` — resolved brainstorm with design rationale\n- `web/components/commission/CommissionList.tsx` — current component to modify\n- `lib/commissions.ts` — STATUS_GROUP map\n- `.lore/plans/` — existing plans for format reference\n\nPlace the plan at `.lore/plans/ui/commission-list-filtering.md`."
dependencies:
  - commission-Octavia-20260314-154908
linked_artifacts: []

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-14T23:42:20.147Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-14T23:42:20.149Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
