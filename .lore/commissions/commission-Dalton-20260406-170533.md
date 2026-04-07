---
title: "Commission: HTML mockup preview: Phase 5 fix review findings"
date: 2026-04-07
status: completed
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Read Thorne's review of the HTML mockup preview implementation. The review commission is `commission-Thorne-20260406-170527`. Check the commission log and any notes for findings.\n\nAddress ALL findings from the review. Do not skip any, regardless of severity.\n\nThe spec is at `.lore/specs/ui/html-mockup-preview.md`. The plan is at `.lore/plans/ui/html-mockup-preview.md`.\n\nRun `bun test`, `bun run typecheck`, and `bun run lint` after fixes."
dependencies:
  - commission-Thorne-20260406-170527
linked_artifacts:
  - web/components/project/ArtifactList.tsx

  - web/app/projects/[name]/artifacts/[...path]/page.tsx
  - web/app/projects/[name]/artifacts/[...path]/page.tsx
activity_timeline:
  - timestamp: 2026-04-07T00:05:33.796Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-07T00:11:12.068Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-04-07T00:18:21.295Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-04-07T00:18:21.300Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-07T00:18:21.349Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-07T00:18:27.641Z
    event: progress_report
    reason: "Reading Thorne's review commission to gather findings."
  - timestamp: 2026-04-07T00:19:16.499Z
    event: progress_report
    reason: "Fixing two defects: (1) double-encoding bug in ArtifactList.tsx preview URL, (2) missing notFound() for nonexistent mockup files in detail view."
  - timestamp: 2026-04-07T00:30:44.546Z
    event: result_submitted
    reason: "Fixed both defects from Thorne's review:\n\n1. **Double-encoding bug** (`ArtifactList.tsx:97`): Removed redundant `encodeURIComponent()` around `encodedProjectName`, which was already encoded at line 219. Project names with special characters (e.g., \"my project\") now produce correct preview URLs.\n\n2. **Missing 404 handling** (`page.tsx:63-69`): Added `notFound()` guard when `mockupArtifact` is undefined after the list fetch. This matches the image branch pattern and satisfies REQ-MKP-18. Also removed unnecessary optional chaining on `mockupArtifact.lastModified` since the guard narrows the type.\n\nObservations #3 (performance, deferred per plan) and #4 (SmartView/TagView icons, consistent with existing patterns) require no action.\n\nTypecheck, lint, and full test suite (3538 pass, 0 fail) all clean."
  - timestamp: 2026-04-07T00:30:48.501Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Fixing two defects: (1) double-encoding bug in ArtifactList.tsx preview URL, (2) missing notFound() for nonexistent mockup files in detail view."
projectName: guild-hall
---
Fixed both defects from Thorne's review:

1. **Double-encoding bug** (`ArtifactList.tsx:97`): Removed redundant `encodeURIComponent()` around `encodedProjectName`, which was already encoded at line 219. Project names with special characters (e.g., "my project") now produce correct preview URLs.

2. **Missing 404 handling** (`page.tsx:63-69`): Added `notFound()` guard when `mockupArtifact` is undefined after the list fetch. This matches the image branch pattern and satisfies REQ-MKP-18. Also removed unnecessary optional chaining on `mockupArtifact.lastModified` since the guard narrows the type.

Observations #3 (performance, deferred per plan) and #4 (SmartView/TagView icons, consistent with existing patterns) require no action.

Typecheck, lint, and full test suite (3538 pass, 0 fail) all clean.
