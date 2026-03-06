---
title: "Commission: Review: Artifact Sorting Across Views"
date: 2026-03-06
status: dispatched
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the implementation of Artifact Sorting Across Views.\n\n**Reference documents:**\n- Spec: `.lore/specs/artifact-sorting.md`\n- Plan: `.lore/plans/artifact-sorting.md`\n\n**What to review:**\n\nThe plan's delegation guide (at the bottom) identifies specific review focus areas. Use those as your checklist:\n\n1. **Status priority mapping completeness**: Every status recognized by `statusToGem()` in the codebase must map to a defined sort group in the new status priority model. No status should fall through to \"unknown\" (priority 4).\n2. **Tree sort correctness**: `sortTreeLevel()` in `lib/artifact-grouping.ts` should produce directory-before-leaf ordering with status-then-title for leaves.\n3. **No inline sorts remain**: All `.sort()` calls for artifacts, meetings, and commissions in page components should be replaced with imports from `lib/` modules.\n4. **No duplicate sort functions**: The `DependencyMap.tsx` local `sortCommissions` should be gone, replaced with an import from `lib/commissions.ts`.\n5. **Sort functions are pure and testable**: Exported from `lib/`, no side effects, independently testable.\n6. **No circular dependencies**: Check import paths between `lib/artifacts.ts`, `lib/artifact-grouping.ts`, `lib/meetings.ts`.\n7. **Test coverage**: New and updated tests cover the five-group status model, recency sort, tree sort, meeting sort extraction, and commission sort deduplication.\n\nRead the spec's REQ IDs and verify each one is satisfied by the implementation. Read the actual changed files, not just the test results. Flag anything that doesn't match the spec or plan."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-06T22:29:03.707Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-06T22:29:03.708Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
