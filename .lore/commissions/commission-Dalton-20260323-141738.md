---
title: "Commission: Fix: Include root-level .lore artifacts in smart views"
date: 2026-03-23
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Problem\n\nRoot-level `.lore/` files like `vision.md` are excluded from all smart views. The `isSmartViewCandidate` function in `lib/artifact-smart-view.ts` (line 72-76) rejects any artifact where `artifactTypeSegment()` returns null (i.e., files not inside a subdirectory).\n\n```typescript\nfunction isSmartViewCandidate(artifact: Artifact): boolean {\n  const segment = artifactTypeSegment(artifact.relativePath);\n  if (segment === null) return false;\n  return !EXCLUDED_DIRECTORIES.has(segment);\n}\n```\n\n`vision.md` has `relativePath: \"vision.md\"`, so `artifactTypeSegment` returns null and it's filtered out.\n\n## Fix\n\nAllow root-level files through `isSmartViewCandidate`. A null segment means no subdirectory, which also means it's not in an excluded directory. The fix:\n\n```typescript\nfunction isSmartViewCandidate(artifact: Artifact): boolean {\n  const segment = artifactTypeSegment(artifact.relativePath);\n  if (segment === null) return true;  // Root-level files are candidates\n  return !EXCLUDED_DIRECTORIES.has(segment);\n}\n```\n\nAlso check that the smart view filter predicates handle root-level files correctly:\n- `isWhatsNext`: Uses `statusToPriority` only, no path check. Should work.\n- `isNeedsDiscussion`: Calls `isGenerativeInvestigation` which requires a non-null segment. Root files won't match. Correct behavior.\n- `isReadyToAdvance`: Calls `isWorkItem` which requires a non-null segment. Root files won't match unless approved. Actually, it checks `isWorkItem` which checks the segment. Root files won't be work items. That means root files only appear in \"What's Next\" if they have matching status. That seems right for vision.md (status: \"active\" or \"draft\" would be group 0).\n\n## Also\n\n- `artifactTypeLabel` returns null for root-level files. Consider whether root-level files need a type label (e.g., \"Document\" or just leave null, which the UI should already handle gracefully).\n- Update tests in `tests/lib/artifact-smart-view.test.ts` to cover root-level file inclusion.\n\n## Files\n- `lib/artifact-smart-view.ts`\n- `tests/lib/artifact-smart-view.test.ts`"
dependencies: []
linked_artifacts:
  - lib/artifact-smart-view.ts

  - tests/lib/artifact-smart-view.test.ts
  - tests/lib/artifact-smart-view.test.ts
activity_timeline:
  - timestamp: 2026-03-23T21:17:38.632Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-23T21:17:38.634Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-23T21:17:38.679Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-23T21:17:50.996Z
    event: progress_report
    reason: "Read source and test files. Applying the fix to isSmartViewCandidate and updating tests."
  - timestamp: 2026-03-23T21:19:03.290Z
    event: result_submitted
    reason: "Fixed root-level `.lore/` files being excluded from smart views.\n\n**Source change** (`lib/artifact-smart-view.ts`): Changed `isSmartViewCandidate` to return `true` when `artifactTypeSegment` returns null (root-level files). A null segment means no subdirectory, so it can't be in an excluded directory.\n\n**Test update** (`tests/lib/artifact-smart-view.test.ts`): Updated the \"root-level files\" test to assert they ARE candidates. Root-level files with Group 0 statuses (draft, approved, etc.) now appear in \"What's Next\". They correctly don't appear in \"Needs Discussion\" or \"Ready to Advance\" because those predicates require specific path segments.\n\n**UI handling**: `artifactTypeLabel` still returns null for root-level files, but the UI already guards with `{typeLabel && ...}`, so no UI changes needed.\n\nAll 3268 tests pass, typecheck clean."
  - timestamp: 2026-03-23T21:19:08.070Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Read source and test files. Applying the fix to isSmartViewCandidate and updating tests."
projectName: guild-hall
---
Fixed root-level `.lore/` files being excluded from smart views.

**Source change** (`lib/artifact-smart-view.ts`): Changed `isSmartViewCandidate` to return `true` when `artifactTypeSegment` returns null (root-level files). A null segment means no subdirectory, so it can't be in an excluded directory.

**Test update** (`tests/lib/artifact-smart-view.test.ts`): Updated the "root-level files" test to assert they ARE candidates. Root-level files with Group 0 statuses (draft, approved, etc.) now appear in "What's Next". They correctly don't appear in "Needs Discussion" or "Ready to Advance" because those predicates require specific path segments.

**UI handling**: `artifactTypeLabel` still returns null for root-level files, but the UI already guards with `{typeLabel && ...}`, so no UI changes needed.

All 3268 tests pass, typecheck clean.
