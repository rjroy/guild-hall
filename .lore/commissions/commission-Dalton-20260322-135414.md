---
title: "Commission: Detail view layout Phase 4: Artifact condensing provenance bar"
date: 2026-03-22
status: blocked
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 4 of the detail view layout pattern. Plan: `.lore/plans/ui/detail-view-layout-pattern.md`. Spec: `.lore/specs/ui/detail-view-layout-pattern.md`.\n\n**Step 1:** Convert `ArtifactProvenance.tsx` to client component with condensed state. Same pattern as CommissionHeader (Phase 2): `\"use client\"`, matchMedia initializer, useEffect SSR safety. Condensed state shows single row: ArtifactBreadcrumb + CopyPathButton + toggle chevron. sourceRow hidden.\n\n**Step 2:** Add condensing CSS to `ArtifactProvenance.module.css`. Add max-height (150px) with transition (250ms ease). `.provenanceCondensed` with 48px max-height, border-image: none, simple border, preserve background-color. Add condensedRow, condensedTrailing, toggleButton styles. Remove margin-bottom from `.provenance` (parent gap handles spacing).\n\nAddresses REQ-DVL-24 through REQ-DVL-29. Read the plan for full details including child component boundary notes and CSS values."
dependencies:
  - commission-Dalton-20260322-135407
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-22T20:54:14.691Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T20:54:53.125Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
