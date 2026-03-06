---
title: "Commission: Spec: Artifact Sorting by Status, Date, and Title"
date: 2026-03-06
status: completed
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "A previous attempt to implement artifact sorting failed because the requirements weren't grounded in the actual codebase. Your job is to fix that.\n\n**What to do:**\n\n1. **Excavate the current state.** Read the code that fetches, lists, and displays artifacts in the UI. Understand:\n   - Where artifacts are loaded (server components, lib functions, etc.)\n   - What data is available at each point (frontmatter fields, file metadata, parsed types)\n   - How artifacts are currently ordered (if at all)\n   - Which views display artifact lists (dashboard, project pages, artifact browsers, commission/meeting views)\n   - What Zod schemas or types define artifact shape\n\n2. **Identify the sorting surfaces.** Not every list of artifacts needs the same sort. Some are timelines (chronological makes sense), some are browsing views (status grouping makes sense). Document each surface and what sort order would serve its purpose.\n\n3. **Write a spec** that covers:\n   - What fields are available for sorting (status, date, title, type, etc.)\n   - What the default sort should be for each view/surface\n   - Whether sorting should be user-configurable or fixed per view\n   - Edge cases: missing dates, missing status, mixed artifact types in one list\n   - Requirements with REQ IDs following existing project conventions\n\nGround every requirement in what the code says, not assumptions. Reference file paths and line numbers where relevant. If a previous sorting attempt exists in the codebase, note what it did and what it got wrong."
dependencies: []
linked_artifacts:
  - .lore/specs/artifact-sorting.md

activity_timeline:
  - timestamp: 2026-03-06T21:43:32.358Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-06T21:43:32.360Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-06T21:43:32.394Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-06T21:43:41.811Z
    event: progress_report
    reason: "Starting excavation of artifact loading, display, and sorting across the codebase. Will read memory first, then systematically trace the code paths."
  - timestamp: 2026-03-06T21:45:19.957Z
    event: progress_report
    reason: "Excavation phase mostly complete. Have read all artifact loading code (lib/artifacts.ts, lib/commissions.ts, lib/meetings.ts), all UI surfaces (dashboard, project tabs, commission view, meeting view), and found the previous sorting implementation in lib/artifacts.ts. Now checking Zod schemas and documenting findings before writing the spec."
  - timestamp: 2026-03-06T21:45:56.229Z
    event: progress_report
    reason: "Excavation complete. All sorting surfaces identified: 7 distinct locations with sorting behavior across dashboard, project tabs, commission list, meeting list, meeting requests, dependency map, and artifact tree. Previous sorting attempt found in lib/artifacts.ts (compareArtifacts). Now writing the spec."
  - timestamp: 2026-03-06T21:48:29.703Z
    event: result_submitted
    reason: "Wrote artifact sorting spec at `.lore/specs/artifact-sorting.md` (status: draft, REQ prefix: SORT, 16 requirements).\n\n**Excavation findings:**\n- 7 distinct sorting surfaces identified across dashboard, project tabs, commission views, and meeting views\n- Previous sorting attempt in `lib/artifacts.ts:76-117` (commit `95e423d`) used a three-bucket status model (`draft`/`open`/`closed`) that doesn't match real artifact statuses. 90%+ of actual statuses (`implemented`, `active`, `approved`, etc.) fell through to the default priority, making status sorting ineffective.\n- Commission sorting (`lib/commissions.ts:254-267`) works correctly with its four-group model.\n- Meeting sorts are correct but inline in page components instead of exported from `lib/meetings.ts`.\n- A duplicate `sortCommissions()` exists in `DependencyMap.tsx` with different logic than the one in `lib/commissions.ts`.\n\n**Key spec decisions:**\n1. Dashboard \"Recent Scrolls\" should sort by `lastModified` (filesystem mtime), not frontmatter date or status. REQ-VIEW-12 says \"recently created or modified artifacts,\" but the current sort uses creation date.\n2. Artifact tree leaves sort by status group then title (no date). Status groups expanded from 3 to 5 buckets aligned with `statusToGem()` vocabulary.\n3. Commission and meeting sort logic is preserved as-is, but extracted from inline page code and deduplicated.\n4. No user-configurable sorting in V1. Each surface has one fixed sort.\n5. All sort functions must be pure, exported, and tested from `lib/` modules.\n\nExit points and implementation targets are documented in the spec."
  - timestamp: 2026-03-06T21:48:36.756Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Excavation complete. All sorting surfaces identified: 7 distinct locations with sorting behavior across dashboard, project tabs, commission list, meeting list, meeting requests, dependency map, and artifact tree. Previous sorting attempt found in lib/artifacts.ts (compareArtifacts). Now writing the spec."
projectName: guild-hall
---
Wrote artifact sorting spec at `.lore/specs/artifact-sorting.md` (status: draft, REQ prefix: SORT, 16 requirements).

**Excavation findings:**
- 7 distinct sorting surfaces identified across dashboard, project tabs, commission views, and meeting views
- Previous sorting attempt in `lib/artifacts.ts:76-117` (commit `95e423d`) used a three-bucket status model (`draft`/`open`/`closed`) that doesn't match real artifact statuses. 90%+ of actual statuses (`implemented`, `active`, `approved`, etc.) fell through to the default priority, making status sorting ineffective.
- Commission sorting (`lib/commissions.ts:254-267`) works correctly with its four-group model.
- Meeting sorts are correct but inline in page components instead of exported from `lib/meetings.ts`.
- A duplicate `sortCommissions()` exists in `DependencyMap.tsx` with different logic than the one in `lib/commissions.ts`.

**Key spec decisions:**
1. Dashboard "Recent Scrolls" should sort by `lastModified` (filesystem mtime), not frontmatter date or status. REQ-VIEW-12 says "recently created or modified artifacts," but the current sort uses creation date.
2. Artifact tree leaves sort by status group then title (no date). Status groups expanded from 3 to 5 buckets aligned with `statusToGem()` vocabulary.
3. Commission and meeting sort logic is preserved as-is, but extracted from inline page code and deduplicated.
4. No user-configurable sorting in V1. Each surface has one fixed sort.
5. All sort functions must be pure, exported, and tested from `lib/` modules.

Exit points and implementation targets are documented in the spec.
