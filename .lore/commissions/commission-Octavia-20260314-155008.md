---
title: "Commission: Plan: Request Meeting from Artifact sidebar"
date: 2026-03-14
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write an implementation plan for `.lore/specs/ui/artifact-request-meeting.md`.\n\nRead the spec first, then read the existing code it references to understand the starting point. The plan should cover what to change, in what order, and how to verify each step.\n\n**Reference files to read:**\n- `.lore/specs/ui/artifact-request-meeting.md` — the spec (source of truth)\n- `web/components/artifact/MetadataSidebar.tsx` — where the button goes\n- `web/components/commission/CreateCommissionButton.tsx` — existing pattern for similar action\n- `web/app/projects/[name]/page.tsx` — how commission query params are consumed (model for meeting equivalent)\n- `.lore/plans/` — existing plans for format reference\n\nPlace the plan at `.lore/plans/ui/artifact-request-meeting.md`."
dependencies:
  - commission-Octavia-20260314-153321
linked_artifacts:
  - .lore/plans/ui/artifact-request-meeting.md

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-14T22:50:08.376Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-14T22:50:08.378Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-14T22:50:08.414Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-14T22:50:15.050Z
    event: progress_report
    reason: "Reading spec and reference files before drafting the plan."
  - timestamp: 2026-03-14T22:53:30.047Z
    event: progress_report
    reason: "All reference code read. Writing the implementation plan now."
  - timestamp: 2026-03-14T22:54:58.930Z
    event: result_submitted
    reason: "Plan written at `.lore/plans/ui/artifact-request-meeting.md`. Four steps, each targeting a single file or pair of files:\n\n1. **MetadataSidebar**: Add `requestMeetingHref()`, move commission link into a new Actions section, rename CSS class to `.actionLink`.\n2. **CreateMeetingButton**: New client component with SSE parse loop — navigates to `/projects/<name>/meetings/<id>` on the first `session` event, shows error on `error` event, collapses on cancel. Form has worker text input and prompt textarea with pre-fill from `initialArtifact`.\n3. **Project page**: Extend `searchParams` type with `newMeeting` and `artifact`, import and render `CreateMeetingButton` on the meetings tab.\n4. **Tests**: New `requestMeetingHref` tests and Actions section visibility guard in `metadata-sidebar.test.ts`; module export contract test for `CreateMeetingButton`.\n\nKey decisions documented: navigate on `session` (not `turn_end`), self-contained form (no separate MeetingForm), worker as text input (no dropdown per REQ-ARM-13), CSS rename is contained to `MetadataSidebar`. Delegation guide calls out the SSE parse loop for post-Step-2 fresh-eyes review."
  - timestamp: 2026-03-14T22:55:08.985Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All reference code read. Writing the implementation plan now."
projectName: guild-hall
---
Plan written at `.lore/plans/ui/artifact-request-meeting.md`. Four steps, each targeting a single file or pair of files:

1. **MetadataSidebar**: Add `requestMeetingHref()`, move commission link into a new Actions section, rename CSS class to `.actionLink`.
2. **CreateMeetingButton**: New client component with SSE parse loop — navigates to `/projects/<name>/meetings/<id>` on the first `session` event, shows error on `error` event, collapses on cancel. Form has worker text input and prompt textarea with pre-fill from `initialArtifact`.
3. **Project page**: Extend `searchParams` type with `newMeeting` and `artifact`, import and render `CreateMeetingButton` on the meetings tab.
4. **Tests**: New `requestMeetingHref` tests and Actions section visibility guard in `metadata-sidebar.test.ts`; module export contract test for `CreateMeetingButton`.

Key decisions documented: navigate on `session` (not `turn_end`), self-contained form (no separate MeetingForm), worker as text input (no dropdown per REQ-ARM-13), CSS rename is contained to `MetadataSidebar`. Delegation guide calls out the SSE parse loop for post-Step-2 fresh-eyes review.
