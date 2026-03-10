---
title: "Commission: Spec: Meeting rename capability"
date: 2026-03-10
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec for adding a \"rename meeting\" capability to the meeting system.\n\n**Context:** Meetings are the interactive sessions between users and workers. Each meeting has a title derived from its artifact filename (e.g., `audience-Guild-Master-20260309-224036-1.md`). Currently there's no way for the worker running a meeting to rename it during the session.\n\n**What to spec:**\nA meeting tool that allows the worker (the AI running the meeting session) to rename the meeting. This would update the meeting artifact's title field and potentially the display name shown in the UI.\n\n**Key questions to address:**\n- What exactly gets renamed? (the `title` frontmatter field? the filename? both?)\n- Should there be constraints on naming (length, characters)?\n- How does this interact with the UI (Dashboard meeting list, meeting view header)?\n- Should rename history be tracked in the meeting log timeline?\n- Does this need any user confirmation or is the worker authorized to rename freely?\n\n**Reference material:**\n- Meeting spec: `.lore/specs/guild-hall-meetings.md`\n- Meeting artifact structure: check existing meeting files in `.lore/meetings/`\n- Meeting tools: look at `daemon/services/meeting/` for current meeting toolbox\n- System spec: `.lore/specs/guild-hall-system.md`\n\nOutput the spec to `.lore/specs/meeting-rename.md` following the project's spec conventions."
dependencies: []
linked_artifacts: []

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-10T07:59:14.678Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T07:59:14.680Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
