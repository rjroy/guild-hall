---
title: "Commission: Front-page meetings Phase 1: Backend (view=open endpoint + sortActiveMeetings)"
date: 2026-04-03
status: failed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 1 of the front-page active meetings plan at `.lore/plans/ui/front-page-meetings.md`.\n\n## What to build\n\n**REQs covered:** REQ-FPM-06, REQ-SORT-12 from `.lore/specs/front-page-meetings.md`\n\n### Step 1a: Add `sortActiveMeetings` to `lib/meetings.ts`\n\nAdd after `sortMeetingRequests`. Sorts `MeetingMeta[]` by `date` descending (most recently started first). Export it.\n\n```ts\nexport function sortActiveMeetings(meetings: MeetingMeta[]): MeetingMeta[] {\n  return [...meetings].sort((a, b) => b.date.localeCompare(a.date));\n}\n```\n\n### Step 1b: Add `view=open` branch to `daemon/routes/meetings.ts`\n\nIn the `GET /meeting/request/meeting/list` handler, after the `view === \"artifacts\"` block (around line 327), add a new branch. The pattern mirrors the `view=artifacts` branch exactly:\n\n1. Resolve integration worktree meetings path\n2. Call `getActiveMeetingWorktrees(deps.guildHallHome, projectName)` to find active worktree paths\n3. Enumerate `.md` files from both integration and worktree meeting directories\n4. Deduplicate by filename (integration wins)\n5. Read each file with `readMeetingMeta(filePath, projectName)` \n6. Filter to `status === \"open\"`\n7. Sort with `sortActiveMeetings`\n8. Return `{ meetings: sorted }`\n\nAdd `sortActiveMeetings` to the import from `@/lib/meetings`.\n\nRead the existing `view=artifacts` branch carefully and follow its patterns for worktree scanning, error handling (try/catch around readdir), and deduplication.\n\n### Step 1c: Update the operation definition\n\nIn the `operations` array, update the `meeting.request.meeting.list` entry: add `{ name: \"view\", required: false, in: \"query\" as const }` to its parameters array and update the description to mention the `view=open` variant.\n\n## Testing\n\nNew test file or extend existing. Use the same fixture setup as `meetings-read.test.ts` (fs.mkdtemp, write .md files with varying status values).\n\nRequired tests:\n1. `GET ...?projectName=X&view=open` with no meetings → `{ meetings: [] }`\n2. Mix of `status: open`, `status: requested`, `status: closed` → returns only open ones\n3. Multiple open meetings → sorted by date descending\n4. Missing meetings directory → `{ meetings: [] }` (no 500)\n5. `sortActiveMeetings` unit tests: empty array, single item, multiple items sorted correctly\n\nTest dedup: a file that appears in both integration and worktree should return the integration copy only.\n\n## Verify\n\n`bun run typecheck && bun test` (run relevant test files)"
dependencies: []
linked_artifacts: []

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-04-03T17:15:34.625Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-03T17:15:34.627Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-03T17:15:36.952Z
    event: status_failed
    reason: "Session error: Claude Code returned an error result: You've hit your limit · resets 12pm (America/Los_Angeles)"
current_progress: ""
projectName: guild-hall
---
