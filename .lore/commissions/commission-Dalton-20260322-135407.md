---
title: "Commission: Detail view layout Phase 3: Artifact viewport lock and structural change"
date: 2026-03-22
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 3 of the detail view layout pattern. Plan: `.lore/plans/ui/detail-view-layout-pattern.md`. Spec: `.lore/specs/ui/detail-view-layout-pattern.md`.\n\n**Step 1:** Restructure `web/app/projects/[name]/artifacts/[...path]/page.tsx`. Move ArtifactProvenance and meetingBanner out of `.main` into the top-level column. Add a new `.artifactBody` wrapper around `.main` and `.sidebar`. Apply to both document and image artifact branches.\n\n**Step 2:** Update `page.module.css`. Change `.artifactView` from row layout with min-height to column layout with `height: 100dvh; overflow: hidden`. Add `.artifactBody` as the row flex container with `flex: 1; min-height: 0`. Add `overflow-y: auto` to `.main` and `.sidebar`. Update 768px media query to target `.artifactBody` instead of `.artifactView`. Remove `margin-bottom` from `.meetingBanner` (parent gap handles spacing), add `flex-shrink: 0`.\n\nAddresses REQ-DVL-20 through REQ-DVL-23, REQ-DVL-30, REQ-DVL-31, REQ-DVL-32. Read the plan for full restructure details and verification criteria."
dependencies:
  - commission-Dalton-20260322-135358
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-22T20:54:07.583Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T20:54:53.124Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-22T21:01:06.162Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-22T21:01:06.165Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
