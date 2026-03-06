---
title: "Commission: Implement: Artifact Sorting by Status, Date, Title"
date: 2026-03-06
status: completed
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement sorting for artifact lists in the web UI. When artifacts are displayed (any view that lists .lore/ artifacts), they should be sorted by three keys in priority order:\n\n1. **Status** (highest priority): Draft > Open > Closed. Draft artifacts surface first, closed sink to the bottom.\n2. **Date** (secondary): Newer before older (descending).\n3. **Title** (tertiary): Alphabetical tiebreaker.\n\nThis is a UI concern. Find where artifacts are read and listed in the web app (`web/` directory), understand how they're currently ordered, and add the sorting logic. The status values come from frontmatter in the artifact markdown files.\n\nKey guidelines:\n- Keep the sorting logic simple and localized. A compare function, not an abstraction.\n- If multiple views list artifacts, apply the sort consistently (ideally one shared sort function).\n- Write tests for the sort logic.\n- If some artifacts lack a status or date field, they should sort after items that have values (don't crash on missing frontmatter fields)."
dependencies: []
linked_artifacts:
  - lib/artifacts.ts

  - tests/lib/artifacts.test.ts
  - tests/lib/artifacts.test.ts
activity_timeline:
  - timestamp: 2026-03-06T19:30:07.663Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-06T19:30:07.663Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-06T19:30:07.696Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-06T19:30:15.801Z
    event: progress_report
    reason: "Starting: exploring web/ directory to find where artifacts are listed and understand current ordering."
  - timestamp: 2026-03-06T19:34:47.327Z
    event: result_submitted
    reason: "Implemented artifact list sorting in the web UI. Added a `compareArtifacts` function to `lib/artifacts.ts` that sorts by three keys in priority order:\n\n1. **Status** (draft=0, open=1, closed=2, other/missing=3)\n2. **Date** descending (newer first; missing dates sort last)\n3. **Title** alphabetical (missing titles sort last)\n\nStatus comparison is case-insensitive. The function replaces the previous `lastModified`-only sort in `scanArtifacts`, which feeds all artifact list views (project artifacts tab, dashboard recent artifacts).\n\n10 unit tests cover: status ordering, case insensitivity, unrecognized/empty status handling, date ordering, missing date/title handling, full three-key sort, and crash safety with empty fields. Updated 2 existing tests to match the new sort contract. Full suite passes (1792 tests, 0 failures)."
  - timestamp: 2026-03-06T19:34:54.787Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Starting: exploring web/ directory to find where artifacts are listed and understand current ordering."
projectName: guild-hall
---
Implemented artifact list sorting in the web UI. Added a `compareArtifacts` function to `lib/artifacts.ts` that sorts by three keys in priority order:

1. **Status** (draft=0, open=1, closed=2, other/missing=3)
2. **Date** descending (newer first; missing dates sort last)
3. **Title** alphabetical (missing titles sort last)

Status comparison is case-insensitive. The function replaces the previous `lastModified`-only sort in `scanArtifacts`, which feeds all artifact list views (project artifacts tab, dashboard recent artifacts).

10 unit tests cover: status ordering, case insensitivity, unrecognized/empty status handling, date ordering, missing date/title handling, full three-key sort, and crash safety with empty fields. Updated 2 existing tests to match the new sort contract. Full suite passes (1792 tests, 0 failures).
