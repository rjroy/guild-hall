---
title: "Commission: Implement: Artifact Sorting Across Views"
date: 2026-03-06
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the artifact sorting plan at `.lore/plans/artifact-sorting.md`. The spec is at `.lore/specs/artifact-sorting.md`.\n\nRead both documents fully before starting. The plan has 8 steps across 5 phases with clear file targets, REQ IDs, and test strategy per step. Follow the plan's ordering exactly — phases are dependency-ordered.\n\nKey points:\n- Phase 1 (Steps 1-2): Replace the three-bucket status model in `lib/artifacts.ts` with the five-group model. Add a recency comparator. Update `recentArtifacts()`.\n- Phase 2 (Step 3): Update `sortTreeLevel()` in `lib/artifact-grouping.ts` for status-then-title leaf sorting with directories first.\n- Phase 3 (Steps 4-5): Extract inline meeting sorts from page components into `lib/meetings.ts`.\n- Phase 4 (Step 6): Remove duplicate `sortCommissions()` from `DependencyMap.tsx`, import from `lib/commissions.ts`.\n- Phase 5 (Steps 7-8): Verify linked artifact no-op and run full test suite.\n\nWrite tests alongside each step as specified in the plan. Run `bun test` after each phase to catch regressions early. The plan includes a delegation guide for review points — follow it."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-06T22:08:06.180Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-06T22:08:06.181Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
