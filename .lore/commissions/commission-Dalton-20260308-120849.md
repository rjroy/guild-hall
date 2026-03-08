---
title: "Commission: Mobile return key should not send in meetings"
date: 2026-03-08
status: completed
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "On mobile devices, the return/enter key on the on-screen keyboard currently sends the message in the Meeting chat interface. It should instead insert a newline (like shift+enter on desktop). This is necessary because mobile keyboards have no shift+enter equivalent.\n\nFind the chat input component (likely in `web/components/` around the meeting/chat area), detect mobile context, and change the enter key behavior so it inserts a newline instead of submitting. Desktop behavior (enter to send, shift+enter for newline) should stay unchanged."
dependencies: []
linked_artifacts:
  - web/components/meeting/MessageInput.tsx

  - tests/components/meeting-view.test.tsx
  - tests/components/meeting-view.test.tsx
activity_timeline:
  - timestamp: 2026-03-08T19:08:49.587Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-08T19:08:49.588Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-08T19:08:49.622Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-08T19:08:57.559Z
    event: progress_report
    reason: "Starting work. Finding the chat input component to understand current enter key behavior."
  - timestamp: 2026-03-08T19:12:49.370Z
    event: result_submitted
    reason: "Fixed enter key behavior on mobile devices in the Meeting chat interface.\n\n**Problem:** The return/enter key on mobile on-screen keyboards sent the message immediately. Mobile keyboards have no shift+enter equivalent, so users couldn't insert newlines.\n\n**Fix:** Added touch device detection in `MessageInput.tsx` using `ontouchstart` and `navigator.maxTouchPoints`. On touch devices, the enter key now inserts a newline (default textarea behavior) instead of triggering send. Desktop behavior is unchanged (enter sends, shift+enter inserts newline).\n\n**Implementation:** Used a `useRef` with lazy initialization to detect touch capability once, avoiding the lint issue with `setState` in effects. The check runs on first render and is cached for the session.\n\n**Tests:** Added 5 tests validating the key handler decision logic (desktop enter sends, desktop shift+enter doesn't, mobile enter doesn't, mobile shift+enter doesn't, non-enter keys don't). Full suite: 2008 pass, 0 fail."
  - timestamp: 2026-03-08T19:12:56.145Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Starting work. Finding the chat input component to understand current enter key behavior."
projectName: guild-hall
---
Fixed enter key behavior on mobile devices in the Meeting chat interface.

**Problem:** The return/enter key on mobile on-screen keyboards sent the message immediately. Mobile keyboards have no shift+enter equivalent, so users couldn't insert newlines.

**Fix:** Added touch device detection in `MessageInput.tsx` using `ontouchstart` and `navigator.maxTouchPoints`. On touch devices, the enter key now inserts a newline (default textarea behavior) instead of triggering send. Desktop behavior is unchanged (enter sends, shift+enter inserts newline).

**Implementation:** Used a `useRef` with lazy initialization to detect touch capability once, avoiding the lint issue with `setState` in effects. The check runs on first render and is cached for the session.

**Tests:** Added 5 tests validating the key handler decision logic (desktop enter sends, desktop shift+enter doesn't, mobile enter doesn't, mobile shift+enter doesn't, non-enter keys don't). Full suite: 2008 pass, 0 fail.
