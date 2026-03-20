---
title: "Commission: Specify: Meetings list no preview"
date: 2026-03-20
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Create a spec for the meetings list preview text feature described in `.lore/issues/meetings-list-no-preview.md`.\n\nRead the issue thoroughly, then examine the current meeting list UI components and meeting metadata/state files to understand what data is available. Check how meeting rename works (the `rename_meeting` tool exists and meetings can have custom titles).\n\nWrite the spec to `.lore/specs/meetings/meetings-list-preview.md` following the project's spec format (see other specs in `.lore/specs/` for examples). The spec should define requirements for displaying distinguishing information in meeting list entries: renamed titles, agenda/topic, first message preview as fallback.\n\nKeep scope tight to the UI display problem. Don't redesign meeting metadata or the meeting system."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-20T04:20:04.925Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T04:20:04.927Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
