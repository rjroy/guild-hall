---
title: "Commission: Spec: Meeting Error Persistence"
date: 2026-04-05
status: dispatched
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a small spec for the issue described in `.lore/issues/meeting-errors-should-be-logged.md`.\n\nThe issue: When the Agent SDK returns an error during a meeting, it shows up via SSE in real-time but is not persisted. When the user reopens the meeting, the error is gone. The user needs to know that an error occurred and what it was, so they can decide on recovery.\n\nThis is a focused spec. Keep it tight. Investigate the current meeting session infrastructure to understand:\n- How meeting messages/events are currently persisted (transcript, state files, etc.)\n- Where SDK errors surface during a meeting session\n- What the SSE event stream looks like for errors\n\nThen write a spec that covers:\n- What gets persisted (the error event, with enough context to understand what happened)\n- Where it gets persisted (existing meeting state/transcript infrastructure, not a new system)\n- How it surfaces on meeting reopen (visible in the meeting view alongside normal messages)\n\nPlace the spec at `.lore/specs/meetings/meeting-error-persistence.md`. Use standard spec format with YAML frontmatter. Keep the requirement count small since this is a small feature."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-04-05T14:09:43.131Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-05T14:09:43.134Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
