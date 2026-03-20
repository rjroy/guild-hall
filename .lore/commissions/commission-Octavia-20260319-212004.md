---
title: "Commission: Specify: Meetings list no preview"
date: 2026-03-20
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Create a spec for the meetings list preview text feature described in `.lore/issues/meetings-list-no-preview.md`.\n\nRead the issue thoroughly, then examine the current meeting list UI components and meeting metadata/state files to understand what data is available. Check how meeting rename works (the `rename_meeting` tool exists and meetings can have custom titles).\n\nWrite the spec to `.lore/specs/meetings/meetings-list-preview.md` following the project's spec format (see other specs in `.lore/specs/` for examples). The spec should define requirements for displaying distinguishing information in meeting list entries: renamed titles, agenda/topic, first message preview as fallback.\n\nKeep scope tight to the UI display problem. Don't redesign meeting metadata or the meeting system."
dependencies: []
linked_artifacts:
  - .lore/specs/meetings/meetings-list-preview.md

activity_timeline:
  - timestamp: 2026-03-20T04:20:04.925Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T04:20:04.927Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-20T04:20:04.969Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-20T04:20:13.015Z
    event: progress_report
    reason: "Reading the issue file and gathering context on meeting list UI, metadata, and existing specs."
  - timestamp: 2026-03-20T04:21:48.177Z
    event: progress_report
    reason: "Context gathered. Writing the spec now. Key findings: agenda field exists in frontmatter but isn't displayed in MeetingList; titles can be renamed via rename_meeting tool; closed meetings have notes in artifact body; transcripts are ephemeral (deleted on close)."
  - timestamp: 2026-03-20T04:23:18.462Z
    event: result_submitted
    reason: "Created spec at `.lore/specs/meetings/meetings-list-preview.md` (12 requirements, REQ-MLP-1 through REQ-MLP-12).\n\nThe spec defines a UI-only enhancement to the MeetingList component that adds a preview line to each meeting entry. Preview content follows a priority cascade: agenda field first, notes excerpt for closed meetings as fallback, no placeholder when both are absent. The spec is scoped tightly to the display problem: no new metadata fields, no daemon changes, no transcript fetching. All data sources already exist on the Artifact object passed to the component.\n\nKey decisions:\n- Agenda is the primary preview source because it exists for every meeting (user prompt or request reason) and is the best description of intent.\n- Notes excerpt skips markdown headings to avoid showing \"Meeting Notes\" as the preview.\n- CSS truncation (not string slicing) preserves full text in the DOM for accessibility.\n- The component stays on the Artifact type, not MeetingMeta, preserving the existing page-to-component contract."
  - timestamp: 2026-03-20T04:23:25.265Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Context gathered. Writing the spec now. Key findings: agenda field exists in frontmatter but isn't displayed in MeetingList; titles can be renamed via rename_meeting tool; closed meetings have notes in artifact body; transcripts are ephemeral (deleted on close)."
projectName: guild-hall
---
Created spec at `.lore/specs/meetings/meetings-list-preview.md` (12 requirements, REQ-MLP-1 through REQ-MLP-12).

The spec defines a UI-only enhancement to the MeetingList component that adds a preview line to each meeting entry. Preview content follows a priority cascade: agenda field first, notes excerpt for closed meetings as fallback, no placeholder when both are absent. The spec is scoped tightly to the display problem: no new metadata fields, no daemon changes, no transcript fetching. All data sources already exist on the Artifact object passed to the component.

Key decisions:
- Agenda is the primary preview source because it exists for every meeting (user prompt or request reason) and is the best description of intent.
- Notes excerpt skips markdown headings to avoid showing "Meeting Notes" as the preview.
- CSS truncation (not string slicing) preserves full text in the DOM for accessibility.
- The component stays on the Artifact type, not MeetingMeta, preserving the existing page-to-component contract.
