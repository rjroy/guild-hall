---
title: "Commission: Consolidate duplicate meeting buttons on project view"
date: 2026-03-22
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "There are two buttons on the project view that both initiate meetings, but they need to be consolidated into one.\n\n**Current state:**\n- \"Start Audience\" button in the project header — has the correct behavior\n- \"Request Meeting\" button on the Meetings tab — has the correct location\n\n**What to do:**\n1. Remove the \"Start Audience\" button from the project header\n2. Make the \"Request Meeting\" button on the Meetings tab use the same behavior that \"Start Audience\" currently has\n3. Keep the label as whatever makes sense in context (probably \"Request Meeting\" or \"Start Audience\" — match the existing meeting terminology)\n\nSee `.lore/issues/duplicate-behavior.webp` for the screenshot showing both buttons.\n\nLook at the project view components in `web/` to find both buttons, understand their respective implementations, then consolidate."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-22T14:55:13.125Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T14:55:13.131Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
