---
title: "Commission: Review: Artifact Sorting by Status, Date, Title"
date: 2026-03-06
status: completed
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the recent changes implementing artifact sorting by status, date, and title. The commission was \"Implement: Artifact Sorting by Status, Date, Title.\"\n\n**Requirements:**\n- Artifacts should sort by: status (Draft > Open > Closed), then date (newest first), then title (alphabetical)\n- Missing frontmatter fields should sort after items with values\n- Sort logic should be shared if multiple views list artifacts\n\n**Review checklist:**\n1. Read the changed files (check recent commits on this branch for the diff)\n2. Verify the sort logic is correct (status priority, date descending, title ascending)\n3. Check edge cases: missing status, missing date, unknown status values\n4. Verify tests exist and cover the sort behavior\n5. Check that existing tests still pass (run `bun test` for affected test files)\n6. Flag any code quality issues per project standards (CSS Modules, no Tailwind, DI patterns)\n\nUse `git log --oneline -10` and `git diff` against recent commits to identify the changed files. Report findings with file paths and line numbers."
dependencies: []
linked_artifacts:
  - lib/artifacts.ts

  - tests/lib/artifacts.test.ts
  - tests/lib/artifacts.test.ts
activity_timeline:
  - timestamp: 2026-03-06T20:39:31.962Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-06T20:39:31.963Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-06T20:39:31.997Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-06T20:39:39.929Z
    event: progress_report
    reason: "Starting review. Identifying changed files from recent commits."
  - timestamp: 2026-03-06T20:40:01.881Z
    event: progress_report
    reason: "Diff reviewed. Reading full source files for context and checking for additional consumers of sort logic."
  - timestamp: 2026-03-06T20:40:33.648Z
    event: progress_report
    reason: "All tests pass (36 unit, 77 integration). Now analyzing the implementation for correctness and edge cases."
  - timestamp: 2026-03-06T20:41:09.018Z
    event: result_submitted
    reason: "## Review: Artifact Sorting by Status, Date, Title\n\n**Commit reviewed:** `1a22365` (Commission: commission-Dalton-20260306-113007)\n**Files changed:** `lib/artifacts.ts`, `tests/lib/artifacts.test.ts`\n\n### Verdict: Implementation is correct and well-tested.\n\nAll requirements are satisfied. The sort logic works, edge cases are covered, tests pass, and the code follows project conventions. Two documentation issues worth fixing.\n\n---\n\n### Requirement Coverage\n\n| Requirement | Status | Evidence |\n|-------------|--------|----------|\n| Sort by status: Draft > Open > Closed | Satisfied | `STATUS_PRIORITY` map at `lib/artifacts.ts:76-80`, tested at line 381-387 |\n| Sort by date: newest first | Satisfied | `bDate.localeCompare(aDate)` at `lib/artifacts.ts:103`, tested at line 416-421 |\n| Sort by title: alphabetical | Satisfied | `aTitle.localeCompare(bTitle)` at `lib/artifacts.ts:113`, tested at line 433-438 |\n| Missing fields sort after present | Satisfied | Null checks at `lib/artifacts.ts:100-101, 110-111`, tested at lines 424-431 and 441-448 |\n| Shared sort logic | Satisfied | `compareArtifacts` exported, used by `scanArtifacts` (line 173) which feeds both `recentArtifacts` and all `scanArtifacts` call sites |\n\n### Sort Logic Analysis\n\nThe `compareArtifacts` function (`lib/artifacts.ts:92-117`) is clean and correct:\n\n1. **Status priority** uses a lookup table with case-insensitive matching (`toLowerCase()` at line 84). Unknown/empty statuses get priority 3, sorting after closed (2). This is the right behavior.\n\n2. **Date descending** uses `bDate.localeCompare(aDate)` (line 103). This works because dates are stored as ISO-format strings (`YYYY-MM-DD`), which sort lexicographically. Empty strings are falsy in JavaScript, so the `if (aDate && !bDate)` guard correctly handles missing dates.\n\n3. **Title ascending** uses `aTitle.localeCompare(bTitle)` (line 113). Same empty-string guard pattern as dates. Correct.\n\n### Edge Cases Covered\n\n- Case-insensitive status matching (test at line 390)\n- Unrecognized status values like \"implemented\" (test at line 399)\n- Empty status (test at line 408)\n- Missing date (test at line 424)\n- Missing title (test at line 441)\n- All fields missing, no crash (test at line 469)\n- Full three-key sort with five items (test at line 450)\n\n### Tests\n\n36 unit tests pass. 77 integration tests pass. Test coverage for the new `compareArtifacts` function is thorough: 12 new tests covering each sort key individually, combinations, and edge cases. The existing `scanArtifacts` and `recentArtifacts` tests were updated to verify sorting behavior instead of the old `lastModified` order.\n\n### Findings\n\n**F1: Stale JSDoc on `scanArtifacts`** (minor)\n`lib/artifacts.ts:123` — JSDoc says \"sorted by lastModified descending\" but the function now sorts by `compareArtifacts`. The comment describes the old behavior.\n\n**F2: Stale JSDoc on `recentArtifacts`** (minor)\n`lib/artifacts.ts:248` — JSDoc says \"Returns the top N most recently modified artifacts.\" The function now returns the top N by status/date/title sort order, not by modification time. The function name `recentArtifacts` is also slightly misleading now, though renaming it would touch call sites and is a judgment call.\n\nNo code quality issues. No Tailwind usage, no `mock.module()`, DI patterns not applicable here. The implementation is in `lib/` (shared code), which is the correct location per the architecture. The `compareArtifacts` function is exported so any future view can reuse it without reimplementing the sort."
  - timestamp: 2026-03-06T20:41:12.282Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
  - timestamp: 2026-03-06T20:41:12.509Z
    event: status_completed
    reason: "Execution completed"
current_progress: "All tests pass (36 unit, 77 integration). Now analyzing the implementation for correctness and edge cases."
projectName: guild-hall
---
## Review: Artifact Sorting by Status, Date, Title

**Commit reviewed:** `1a22365` (Commission: commission-Dalton-20260306-113007)
**Files changed:** `lib/artifacts.ts`, `tests/lib/artifacts.test.ts`

### Verdict: Implementation is correct and well-tested.

All requirements are satisfied. The sort logic works, edge cases are covered, tests pass, and the code follows project conventions. Two documentation issues worth fixing.

---

### Requirement Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Sort by status: Draft > Open > Closed | Satisfied | `STATUS_PRIORITY` map at `lib/artifacts.ts:76-80`, tested at line 381-387 |
| Sort by date: newest first | Satisfied | `bDate.localeCompare(aDate)` at `lib/artifacts.ts:103`, tested at line 416-421 |
| Sort by title: alphabetical | Satisfied | `aTitle.localeCompare(bTitle)` at `lib/artifacts.ts:113`, tested at line 433-438 |
| Missing fields sort after present | Satisfied | Null checks at `lib/artifacts.ts:100-101, 110-111`, tested at lines 424-431 and 441-448 |
| Shared sort logic | Satisfied | `compareArtifacts` exported, used by `scanArtifacts` (line 173) which feeds both `recentArtifacts` and all `scanArtifacts` call sites |

### Sort Logic Analysis

The `compareArtifacts` function (`lib/artifacts.ts:92-117`) is clean and correct:

1. **Status priority** uses a lookup table with case-insensitive matching (`toLowerCase()` at line 84). Unknown/empty statuses get priority 3, sorting after closed (2). This is the right behavior.

2. **Date descending** uses `bDate.localeCompare(aDate)` (line 103). This works because dates are stored as ISO-format strings (`YYYY-MM-DD`), which sort lexicographically. Empty strings are falsy in JavaScript, so the `if (aDate && !bDate)` guard correctly handles missing dates.

3. **Title ascending** uses `aTitle.localeCompare(bTitle)` (line 113). Same empty-string guard pattern as dates. Correct.

### Edge Cases Covered

- Case-insensitive status matching (test at line 390)
- Unrecognized status values like "implemented" (test at line 399)
- Empty status (test at line 408)
- Missing date (test at line 424)
- Missing title (test at line 441)
- All fields missing, no crash (test at line 469)
- Full three-key sort with five items (test at line 450)

### Tests

36 unit tests pass. 77 integration tests pass. Test coverage for the new `compareArtifacts` function is thorough: 12 new tests covering each sort key individually, combinations, and edge cases. The existing `scanArtifacts` and `recentArtifacts` tests were updated to verify sorting behavior instead of the old `lastModified` order.

### Findings

**F1: Stale JSDoc on `scanArtifacts`** (minor)
`lib/artifacts.ts:123` — JSDoc says "sorted by lastModified descending" but the function now sorts by `compareArtifacts`. The comment describes the old behavior.

**F2: Stale JSDoc on `recentArtifacts`** (minor)
`lib/artifacts.ts:248` — JSDoc says "Returns the top N most recently modified artifacts." The function now returns the top N by status/date/title sort order, not by modification time. The function name `recentArtifacts` is also slightly misleading now, though renaming it would touch call sites and is a judgment call.

No code quality issues. No Tailwind usage, no `mock.module()`, DI patterns not applicable here. The implementation is in `lib/` (shared code), which is the correct location per the architecture. The `compareArtifacts` function is exported so any future view can reuse it without reimplementing the sort.
