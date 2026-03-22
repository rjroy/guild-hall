---
title: "Commission: Detail view layout Phase 2: Commission condensing header"
date: 2026-03-22
status: pending
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 2 of the detail view layout pattern. Plan: `.lore/plans/ui/detail-view-layout-pattern.md`. Spec: `.lore/specs/ui/detail-view-layout-pattern.md`.\n\n**Step 1:** Convert `CommissionHeader.tsx` to a client component with condensed state. Add `\"use client\"`, useState with matchMedia initializer (condensed at <=960px), useEffect SSR safety. Expanded state preserves current layout. Condensed state renders single row: GemIndicator(sm) + truncated title + status badge + worker + model + toggle chevron. Breadcrumb hidden in condensed.\n\n**Step 2:** Add condensing CSS to `CommissionHeader.module.css`. Add max-height transition (250ms ease), `.headerCondensed` with 56px max-height and simplified border (border-image: none, 1px solid). Add condensedRow, condensedTitle, condensedStatus/Worker/Model, toggleButton styles.\n\nAddresses REQ-DVL-5 through REQ-DVL-10. Read the plan for full implementation details including the toggle button positioning decision and CSS values."
dependencies:
  - commission-Dalton-20260322-135347
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-22T20:53:58.271Z
    event: created
    reason: "Commission created"
current_progress: ""
projectName: guild-hall
---
