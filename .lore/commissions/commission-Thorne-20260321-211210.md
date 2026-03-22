---
title: "Commission: Review: Artifact smart views implementation"
date: 2026-03-22
status: dispatched
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the artifact smart views implementation against the spec and plan.\n\n**Spec:** `.lore/specs/ui/artifact-smart-views.md`\n**Plan:** `.lore/plans/ui/artifact-smart-views.md`\n\n**Changed files:**\n- `lib/types.ts` — `approved` moved from Group 1 to Group 0 in `ARTIFACT_STATUS_GROUP`\n- `lib/artifact-smart-view.ts` — new file, filter logic and path metadata functions\n- `tests/lib/artifact-smart-view.test.ts` — new file, unit tests for filter logic\n- `tests/lib/types.test.ts` — updated gem mapping assertions\n- `web/components/project/ArtifactList.tsx` — sub-tabs, smart view UI\n- `web/components/project/ArtifactList.module.css` — new styles\n- `.lore/specs/ui/artifact-sorting.md` — REQ-SORT-4 table update\n\n**Review focus:**\n1. Filter correctness: do the three predicates match the spec (REQ-SMARTVIEW-6, -7, -8)?\n2. Gem mapping: `approved` is now Group 0 / pending (REQ-SMARTVIEW-17, -18)\n3. Exclusions: meetings/ and commissions/ excluded from all views (REQ-SMARTVIEW-4)\n4. Badge counts computed from full list, not filtered subset (REQ-SMARTVIEW-5)\n5. Tree view completely preserved as sub-tab (REQ-SMARTVIEW-1, -2)\n6. State is ephemeral, no URL or localStorage persistence (REQ-SMARTVIEW-3, -9)\n7. Type/domain labels derived correctly from path segments (REQ-SMARTVIEW-12, -13)\n8. Smart view is default landing (REQ-SMARTVIEW-1)\n9. Sorting uses `compareArtifactsByStatusAndTitle` (REQ-SMARTVIEW-16)\n10. Test coverage adequate for the filter logic"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-22T04:12:10.349Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T04:12:10.352Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
