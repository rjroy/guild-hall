---
title: "Commission: Link closed meetings to their artifact view"
date: 2026-02-27
status: pending
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
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-02-27T04:13:59.923Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-02-27T04:13:59.959Z
    event: manager_dispatched
    reason: "Guild Master dispatched commission \"Link closed meetings to their artifact view\""
current_progress: ""
result_summary: ""
projectName: guild-hall
---
