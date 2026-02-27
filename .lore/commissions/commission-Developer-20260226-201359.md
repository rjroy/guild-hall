---
title: "Commission: Link closed meetings to their artifact view"
date: 2026-02-27
status: completed
tags: [commission]
worker: Developer
workerDisplayTitle: "Guild Developer"
prompt: "Make closed meetings in the MeetingList component clickable, linking them to their meeting artifact view.

**Current behavior**: Closed meetings appear in the meeting list but are not clickable (inert entries).

**Desired behavior**: Closed meetings link to the artifact view of the meeting notes file (e.g., `/projects/<name>/artifacts/meetings/<meetingId>`). The artifact view already knows how to render `.lore/` markdown files with frontmatter.

**Implementation**:

1. Read `components/project/MeetingList.tsx` to understand the current rendering for closed vs open meetings.
2. Read `lib/meetings.ts` to understand how meeting metadata is structured and where the artifact path comes from.
3. Read `lib/paths.ts` to understand path construction patterns.
4. For closed meetings, construct the artifact view URL from the meeting ID and make the list entry a link to that URL. The artifact path for a meeting is in the meetings directory under `.lore/` (check how meeting artifacts are stored).
5. Add tests verifying that closed meetings render as links to the correct artifact path, while open/requested meetings retain their current behavior.
6. Run `bun test` and `bun run typecheck` to validate."
dependencies: []
linked_artifacts:
  - components/project/MeetingList.tsx

  - components/project/MeetingList.module.css
  - tests/components/meeting-list.test.ts
  - components/project/MeetingList.module.css
  - tests/components/meeting-list.test.ts
activity_timeline:
  - timestamp: 2026-02-27T04:13:59.923Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-02-27T04:13:59.958Z
    event: status_dispatched
    reason: "Commission dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-02-27T04:13:59.959Z
    event: status_in_progress
    reason: "Worker process started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-02-27T04:14:05.865Z
    event: progress_report
    reason: "Starting work: reading MeetingList.tsx, lib/meetings.ts, and lib/paths.ts to understand current rendering and path patterns."
  - timestamp: 2026-02-27T04:16:49.146Z
    event: progress_report
    reason: "Implementation complete. All changes verified: typecheck clean, 1591/1591 tests pass (14 new). Committing changes."
  - timestamp: 2026-02-27T04:17:22.140Z
    event: result_submitted
    reason: "Made closed meetings clickable in the MeetingList component. Closed meetings now link to their artifact view at `/projects/<name>/artifacts/meetings/<meetingId>.md`, where the existing artifact renderer displays the notes markdown with frontmatter.\n\nChanges:\n- `components/project/MeetingList.tsx`: Added a \"closed\" branch that renders a `<Link>` to the artifact view. Extracted `meetingHref()` as a testable pure function that returns the correct URL for open (live view) and closed (artifact view) meetings, or null for non-linkable statuses. Refactored open meeting branch to use the same function.\n- `components/project/MeetingList.module.css`: Added `.closedLink` class with `opacity: 0.6` to maintain visual distinction from open meetings while being clickable.\n- `tests/components/meeting-list.test.ts`: 14 new tests covering `meetingStatusToGem` (6 tests) and `meetingHref` (8 tests) including status normalization, special character encoding, and null returns for non-linkable statuses.\n\nVerification: typecheck clean, 1591 tests pass (0 failures), all pre-commit hooks pass."
  - timestamp: 2026-02-27T04:17:32.619Z
    event: status_completed
    reason: "Worker completed successfully"
    from: "in_progress"
    to: "completed"
current_progress: "Implementation complete. All changes verified: typecheck clean, 1591/1591 tests pass (14 new). Committing changes."
result_summary: "Made closed meetings clickable in the MeetingList component. Closed meetings now link to their artifact view at `/projects/<name>/artifacts/meetings/<meetingId>.md`, where the existing artifact renderer displays the notes markdown with frontmatter.\n\nChanges:\n- `components/project/MeetingList.tsx`: Added a \"closed\" branch that renders a `<Link>` to the artifact view. Extracted `meetingHref()` as a testable pure function that returns the correct URL for open (live view) and closed (artifact view) meetings, or null for non-linkable statuses. Refactored open meeting branch to use the same function.\n- `components/project/MeetingList.module.css`: Added `.closedLink` class with `opacity: 0.6` to maintain visual distinction from open meetings while being clickable.\n- `tests/components/meeting-list.test.ts`: 14 new tests covering `meetingStatusToGem` (6 tests) and `meetingHref` (8 tests) including status normalization, special character encoding, and null returns for non-linkable statuses.\n\nVerification: typecheck clean, 1591 tests pass (0 failures), all pre-commit hooks pass."
projectName: guild-hall
---
