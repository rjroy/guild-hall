---
title: "Commission: Implement artifact smart views"
date: 2026-03-22
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the artifact smart views feature following the plan at `.lore/plans/ui/artifact-smart-views.md`.\n\nThe plan has 7 steps:\n1. Gem mapping correction (`approved` → Group 0 in `lib/types.ts`, update tests)\n2. Update artifact-sorting spec (move `approved` in REQ-SORT-4 table)\n3. Extract smart view filter logic (`lib/artifact-smart-view.ts`, new file)\n4. Unit tests for filter logic (`tests/lib/artifact-smart-view.test.ts`, new file)\n5. Smart view UI in `ArtifactList` (sub-tabs, filter buttons, smart view items)\n6. Run full test suite and typecheck\n7. Code review via sub-agent\n\nFollow the plan exactly. The code patterns, file paths, and test cases are all specified. Pay attention to:\n- The hooks constraint in Step 5 (useState must be before any early returns)\n- The existing tree view must be completely preserved as a sub-tab\n- CSS follows existing conventions (CSS Modules, project design tokens, no Tailwind)\n- `capitalize` is imported from `lib/artifact-grouping.ts`\n\nRun `bun run typecheck` and `bun test` before finishing."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-22T03:54:19.961Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T03:54:19.963Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
