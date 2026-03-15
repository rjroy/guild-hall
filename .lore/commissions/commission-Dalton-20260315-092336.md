---
title: "Commission: Implement: Dashboard selection model - Phase 2 (data flow)"
date: 2026-03-15
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Steps 6-7 from `.lore/plans/ui/dashboard-selection-model.md`.\n\nThis phase covers:\n- Step 6: Fix Recent Scrolls all-projects fetch (merge artifacts across projects, add project labels, remove \"Select a project\" empty state)\n- Step 7: Filter Pending Audiences by selected project\n\nRead the full plan for detailed file lists and implementation notes. The spec is at `.lore/specs/ui/dashboard-selection-model.md`.\n\nKey constraints:\n- Add `ArtifactWithProject` type to `lib/types.ts`, not inline in components.\n- In all-projects mode: fetch artifacts from all projects, merge by `lastModified` descending, take top 10.\n- Show project labels on artifact rows only in all-projects mode.\n- Remove the \"Select a project to view recent artifacts\" empty state entirely.\n- Pending Audiences filter is one line in `page.tsx`. No changes to `PendingAudiences.tsx`.\n- Write the page-level merge unit test the plan specifies (Step 6).\n\nAfter implementation: run `bun test`, `bun run typecheck`, `bun run lint`. All must pass.\n"
dependencies:
  - commission-Dalton-20260315-092326
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-15T16:23:36.568Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-15T16:30:17.104Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
