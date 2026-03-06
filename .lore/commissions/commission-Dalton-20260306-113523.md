---
title: "Commission: Fix: Worker Portrait Not Displayed During Meetings"
date: 2026-03-06
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix the bug described in `.lore/issues/meeting-portrait-not-displayed.md`.\n\n**Use Option 1: Store `workerPortraitUrl` in meeting artifact frontmatter at creation time.**\n\nThe issue explains the full data path. The fix involves:\n\n1. **Where meetings are created:** Find where `writeMeetingArtifact()` is called (in `daemon/services/meeting/record.ts`) and ensure `workerPortraitUrl` is included in the frontmatter alongside `worker` and `workerDisplayTitle`. The portrait URL comes from the worker identity (which has `portraitUrl` from the package).\n\n2. **Where followup meetings are proposed:** The `propose_followup` tool in `daemon/services/meeting/toolbox.ts` also writes meeting artifacts without portrait data. Fix it the same way.\n\n3. **Where meetings are rendered:** The meeting page (`web/app/projects/[name]/meetings/[id]/page.tsx`) reads frontmatter and passes worker identity to components. It needs to read `workerPortraitUrl` from frontmatter and pass it through to `MeetingHeader`, `MeetingView`, `MessageBubble`, and `StreamingMessage` as needed.\n\n4. **Tests:** Write tests verifying that meeting artifacts include `workerPortraitUrl` in frontmatter, and that the portrait URL flows through to the rendering components.\n\nRead the issue thoroughly, then trace the actual code paths to understand what's missing before making changes. The issue has line-by-line analysis of the gap."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-06T19:35:23.041Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-06T19:35:23.042Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
