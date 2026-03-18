---
title: "Commission: Fix: Message box resizes jarringly after agent response"
date: 2026-03-18
status: dispatched
type: one-shot
tags: [commission]
worker: Sable
workerDisplayTitle: "Guild Breaker"
prompt: "Investigate and fix a UI bug in the meeting chat message box.\n\n**Observed behavior:**\n1. On meeting entry, the message box (textarea) is one line tall. Normal.\n2. As you type, it expands. Normal.\n3. After sending a message, the textarea enters a disabled/read-only state while waiting. Normal.\n4. When the agent responds, the textarea becomes editable again but is unexpectedly large (tall). It stays large until you start typing, then snaps back to one line. This is jarring.\n\n**Expected behavior:**\nAfter the agent responds and the textarea becomes editable again, it should be one line tall (same as initial state), ready for the next message.\n\n**Where to look:**\n- The meeting chat components in `web/components/` (look for the textarea, message input, or chat input component used in meetings)\n- The textarea likely has auto-resize logic that isn't resetting its height when transitioning from disabled back to enabled\n- Check if there's a `rows` or `style.height` being set dynamically that isn't cleared when the input is re-enabled\n\nThis is a CSS/React state bug, not a daemon issue. The fix should be small."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T02:34:49.751Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T02:34:49.752Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
