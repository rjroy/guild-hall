---
title: "Commission: Fix: Worker Portrait Not Displayed During Meetings"
date: 2026-03-06
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix the bug where worker portraits show initials instead of the actual portrait image during meetings. The issue is fully documented at `.lore/issues/meeting-portrait-not-displayed.md` — read it before starting.\n\n**Root cause:** The portrait data path breaks at the meeting boundary. Worker packages declare `portraitPath`, the daemon maps it to `portraitUrl` in the API response, and `WorkerPicker` renders it correctly. But when a meeting artifact is created, `writeMeetingArtifact()` in `daemon/services/meeting/record.ts` writes `worker` and `workerDisplayTitle` to frontmatter but not the portrait URL. The meeting page never resolves it either.\n\n**Fix direction (Option 1 from the issue):** Store `workerPortraitUrl` in meeting artifact frontmatter at creation time. This is consistent with how `worker` and `workerDisplayTitle` already work.\n\n**What needs to change:**\n1. `daemon/services/meeting/record.ts` — `writeMeetingArtifact()` should include `workerPortraitUrl` in frontmatter\n2. The same gap exists in `propose_followup` in `daemon/services/meeting/toolbox.ts` — fix there too\n3. `web/app/projects/[name]/meetings/[id]/page.tsx` — read `workerPortraitUrl` from frontmatter and pass it through\n4. `MeetingHeader` and `MeetingView` / `MessageBubble` / `StreamingMessage` — ensure the portrait URL flows to `WorkerPortrait`\n\n**Constraints:**\n- The portrait URL must be available wherever the worker identity is resolved to create the meeting artifact. Trace how `portraitUrl` is available in the daemon's worker data.\n- Tests alongside implementation. Write tests that verify the portrait URL is written to frontmatter and read back correctly.\n- Run `bun test` before declaring complete."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-06T06:17:31.259Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-06T06:17:31.260Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
