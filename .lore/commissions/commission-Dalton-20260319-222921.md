---
title: "Commission: Implement: Meetings list preview text"
date: 2026-03-20
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the Meetings List Preview Text spec at `.lore/specs/meetings/meetings-list-preview.md`.\n\nRead the spec thoroughly. This is a UI-only change to `web/components/project/MeetingList.tsx` and its CSS module. No daemon changes, no new data types, no new API calls.\n\nKey implementation points:\n1. Create a `previewText()` helper that resolves preview from agenda first, then notes excerpt, then undefined\n2. The notes excerpt logic must skip empty lines and markdown heading lines (lines starting with `#` followed by space)\n3. Add a `.preview` CSS class with `text-overflow: ellipsis`, `overflow: hidden`, `white-space: nowrap`, muted color styling\n4. The preview line renders between title and metadata row in all four status variants (open, closed, requested, declined/other)\n5. Conditionally rendered — no DOM element when no preview text exists\n\nWrite tests covering:\n- `previewText()` priority (agenda > notes excerpt > undefined)\n- Notes excerpt heading stripping\n- Empty state (no preview element)\n- All four rendering branches include preview\n\nAfter implementation, run:\n```bash\nbun run typecheck\nbun run lint\nbun test\n```\n\nAll must pass. Commit when done."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-20T05:29:21.537Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T05:29:21.539Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
