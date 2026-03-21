---
title: "Commission: Fix: Keep meeting input enabled during streaming"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix the meeting chat input so users can type while the assistant is responding.\n\n**File:** `web/components/meeting/MessageInput.tsx`\n\n**What to change:**\n\n1. **Line 80:** Remove `isStreaming` from the textarea's `disabled` prop. It should be `disabled={!isOnline}` only. The user should be able to type in the textarea while streaming.\n\n2. **Line 55-59 (handleKeyDown):** Enter already guards against sending while streaming (`!isStreaming` check on line 57). This is correct. But make sure that when streaming, Enter inserts a newline instead of doing nothing. Currently it calls `e.preventDefault()` unconditionally on line 56 (before the send guard), which means during streaming Enter does nothing at all. During streaming, Enter should insert a newline (don't call `e.preventDefault()`).\n\n3. **Line 63-66 (handleSend):** The send button is replaced by Stop during streaming, so no change needed there.\n\n**Behavior after fix:**\n- While streaming: textarea is enabled, user can type, Enter inserts a newline (since the send button is Stop, not Send)\n- While not streaming: textarea is enabled, Enter sends the message (current behavior preserved)\n- While offline: textarea is disabled (current behavior preserved)\n\n**Test:** Write or update tests for the MessageInput component verifying:\n- Textarea is not disabled during streaming\n- Enter inserts newline during streaming (does not call preventDefault)\n- Enter sends message when not streaming (calls preventDefault, calls onSend)\n- Textarea is disabled when offline\n\nRun `bun test` to confirm all tests pass."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T15:58:21.853Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T15:58:21.854Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
