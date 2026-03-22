---
title: "Commission: Detail view layout Phase 1: Commission viewport lock"
date: 2026-03-22
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 1 of the detail view layout pattern. Plan: `.lore/plans/ui/detail-view-layout-pattern.md`. Spec: `.lore/specs/ui/detail-view-layout-pattern.md`.\n\nTwo CSS changes:\n\n**Step 1:** `web/app/projects/[name]/commissions/[id]/page.module.css` — Change `.commissionView` from `min-height: 100vh` to `height: 100vh; height: 100dvh; overflow: hidden`.\n\n**Step 2:** `web/components/commission/CommissionView.module.css` — Add `overflow-y: auto` to `.main` and `.sidebar`. Update the 768px stacked breakpoint: both get `flex: 1; min-height: 200px; overflow-y: auto`.\n\nAddresses REQ-DVL-1, REQ-DVL-2, REQ-DVL-3, REQ-DVL-4, REQ-DVL-11. Read the plan for full details and verification criteria."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-22T20:53:47.099Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T20:53:47.100Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
