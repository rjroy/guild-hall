---
title: "Commission: Fix: Message box resizes jarringly after agent response"
date: 2026-03-18
status: completed
type: one-shot
tags: [commission]
worker: Sable
workerDisplayTitle: "Guild Breaker"
prompt: "Investigate and fix a UI bug in the meeting chat message box.\n\n**Observed behavior:**\n1. On meeting entry, the message box (textarea) is one line tall. Normal.\n2. As you type, it expands. Normal.\n3. After sending a message, the textarea enters a disabled/read-only state while waiting. Normal.\n4. When the agent responds, the textarea becomes editable again but is unexpectedly large (tall). It stays large until you start typing, then snaps back to one line. This is jarring.\n\n**Expected behavior:**\nAfter the agent responds and the textarea becomes editable again, it should be one line tall (same as initial state), ready for the next message.\n\n**Where to look:**\n- The meeting chat components in `web/components/` (look for the textarea, message input, or chat input component used in meetings)\n- The textarea likely has auto-resize logic that isn't resetting its height when transitioning from disabled back to enabled\n- Check if there's a `rows` or `style.height` being set dynamically that isn't cleared when the input is re-enabled\n\nThis is a CSS/React state bug, not a daemon issue. The fix should be small."
dependencies: []
linked_artifacts:
  - web/components/meeting/MessageInput.tsx

activity_timeline:
  - timestamp: 2026-03-18T02:34:49.751Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T02:34:49.752Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-18T02:34:49.792Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-18T02:35:12.301Z
    event: progress_report
    reason: "Found the bug in web/components/meeting/MessageInput.tsx. The `adjustHeight` function sets inline `style.height` on the textarea, but only runs during `handleInput` (user typing). When the parent clears `value` after sending, or when `isStreaming` flips back to false, nothing resets the inline height. Adding a useEffect to reset height when value or isStreaming changes."
  - timestamp: 2026-03-18T02:35:50.722Z
    event: result_submitted
    reason: "Fixed the textarea height reset bug in `web/components/meeting/MessageInput.tsx`.\n\n**Root cause:** `adjustHeight()` (which sets inline `style.height`) only ran inside `handleInput` during user typing. When value was cleared after sending or when `isStreaming` flipped back to `false`, nothing recalculated the height, leaving the textarea stuck at its previous expanded size.\n\n**Fix:** Added `useEffect(() => adjustHeight(), [value, isStreaming, adjustHeight])` so height recalculates whenever value changes externally (cleared after send) or streaming state transitions. When value is empty, `scrollHeight` collapses to one line.\n\n81 related tests pass, typecheck clean."
  - timestamp: 2026-03-18T02:35:52.591Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Found the bug in web/components/meeting/MessageInput.tsx. The `adjustHeight` function sets inline `style.height` on the textarea, but only runs during `handleInput` (user typing). When the parent clears `value` after sending, or when `isStreaming` flips back to false, nothing resets the inline height. Adding a useEffect to reset height when value or isStreaming changes."
projectName: guild-hall
---
Fixed the textarea height reset bug in `web/components/meeting/MessageInput.tsx`.

**Root cause:** `adjustHeight()` (which sets inline `style.height`) only ran inside `handleInput` during user typing. When value was cleared after sending or when `isStreaming` flipped back to `false`, nothing recalculated the height, leaving the textarea stuck at its previous expanded size.

**Fix:** Added `useEffect(() => adjustHeight(), [value, isStreaming, adjustHeight])` so height recalculates whenever value changes externally (cleared after send) or streaming state transitions. When value is empty, `scrollHeight` collapses to one line.

81 related tests pass, typecheck clean.
