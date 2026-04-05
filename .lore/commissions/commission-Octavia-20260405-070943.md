---
title: "Commission: Spec: Meeting Error Persistence"
date: 2026-04-05
status: completed
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a small spec for the issue described in `.lore/issues/meeting-errors-should-be-logged.md`.\n\nThe issue: When the Agent SDK returns an error during a meeting, it shows up via SSE in real-time but is not persisted. When the user reopens the meeting, the error is gone. The user needs to know that an error occurred and what it was, so they can decide on recovery.\n\nThis is a focused spec. Keep it tight. Investigate the current meeting session infrastructure to understand:\n- How meeting messages/events are currently persisted (transcript, state files, etc.)\n- Where SDK errors surface during a meeting session\n- What the SSE event stream looks like for errors\n\nThen write a spec that covers:\n- What gets persisted (the error event, with enough context to understand what happened)\n- Where it gets persisted (existing meeting state/transcript infrastructure, not a new system)\n- How it surfaces on meeting reopen (visible in the meeting view alongside normal messages)\n\nPlace the spec at `.lore/specs/meetings/meeting-error-persistence.md`. Use standard spec format with YAML frontmatter. Keep the requirement count small since this is a small feature."
dependencies: []
linked_artifacts:
  - .lore/specs/meetings/meeting-error-persistence.md

activity_timeline:
  - timestamp: 2026-04-05T14:09:43.131Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-05T14:09:43.134Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-05T14:09:43.183Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-05T14:09:49.696Z
    event: progress_report
    reason: "Starting investigation of meeting session infrastructure: persistence, error handling, and SSE events."
  - timestamp: 2026-04-05T14:12:20.387Z
    event: progress_report
    reason: "Investigation complete. I have a clear picture of the gap: errors flow through SSE to the browser but are never written to the transcript file. The transcript supports User, Assistant, and Context Compacted sections. I'll now write the spec following the established format from meeting-context-compaction.md."
  - timestamp: 2026-04-05T14:13:19.937Z
    event: result_submitted
    reason: "Wrote spec for meeting error persistence at `.lore/specs/meetings/meeting-error-persistence.md`.\n\nInvestigation confirmed the gap: errors flow through SSE to the browser via `iterateSession` but are never written to the transcript file. The transcript supports User, Assistant, and Context Compacted sections. Error is the missing fourth type.\n\nThe spec defines 9 requirements (REQ-MEP-1 through REQ-MEP-9) across four concerns:\n- **Transcript write**: New `appendErrorSafe` function, called inline during `iterateSession` error handling (not post-loop) to preserve chronological order.\n- **Transcript parse**: Both parsers (daemon-side and lib-side) extended to recognize `## Error (timestamp)` headings, producing `role: \"system\"` messages with an `Error:` content prefix.\n- **Truncation**: Heading pattern extended so error sections aren't split during transcript truncation.\n- **UI display**: Persisted errors render inline with error styling at their chronological position, not in the sticky error banner.\n\nScope exclusions: no recovery actions, no artifact frontmatter fields, no deduplication. This is visibility only."
  - timestamp: 2026-04-05T14:13:28.579Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Investigation complete. I have a clear picture of the gap: errors flow through SSE to the browser but are never written to the transcript file. The transcript supports User, Assistant, and Context Compacted sections. I'll now write the spec following the established format from meeting-context-compaction.md."
projectName: guild-hall
---
Wrote spec for meeting error persistence at `.lore/specs/meetings/meeting-error-persistence.md`.

Investigation confirmed the gap: errors flow through SSE to the browser via `iterateSession` but are never written to the transcript file. The transcript supports User, Assistant, and Context Compacted sections. Error is the missing fourth type.

The spec defines 9 requirements (REQ-MEP-1 through REQ-MEP-9) across four concerns:
- **Transcript write**: New `appendErrorSafe` function, called inline during `iterateSession` error handling (not post-loop) to preserve chronological order.
- **Transcript parse**: Both parsers (daemon-side and lib-side) extended to recognize `## Error (timestamp)` headings, producing `role: "system"` messages with an `Error:` content prefix.
- **Truncation**: Heading pattern extended so error sections aren't split during transcript truncation.
- **UI display**: Persisted errors render inline with error styling at their chronological position, not in the sticky error banner.

Scope exclusions: no recovery actions, no artifact frontmatter fields, no deduplication. This is visibility only.
