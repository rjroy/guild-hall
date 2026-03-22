---
title: "Commission: Consolidate duplicate meeting buttons on project view"
date: 2026-03-22
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "There are two buttons on the project view that both initiate meetings, but they need to be consolidated into one.\n\n**Current state:**\n- \"Start Audience\" button in the project header — has the correct behavior\n- \"Request Meeting\" button on the Meetings tab — has the correct location\n\n**What to do:**\n1. Remove the \"Start Audience\" button from the project header\n2. Make the \"Request Meeting\" button on the Meetings tab use the same behavior that \"Start Audience\" currently has\n3. Keep the label as whatever makes sense in context (probably \"Request Meeting\" or \"Start Audience\" — match the existing meeting terminology)\n\nSee `.lore/issues/duplicate-behavior.webp` for the screenshot showing both buttons.\n\nLook at the project view components in `web/` to find both buttons, understand their respective implementations, then consolidate."
dependencies: []
linked_artifacts:
  - web/components/project/ProjectHeader.tsx

  - web/components/meeting/CreateMeetingButton.tsx
  - web/components/ui/WorkerPicker.tsx
  - web/components/meeting/CreateMeetingButton.tsx
  - web/components/ui/WorkerPicker.tsx
activity_timeline:
  - timestamp: 2026-03-22T14:55:13.125Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T14:55:13.131Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-22T14:55:13.179Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-22T14:55:20.317Z
    event: progress_report
    reason: "Starting: finding both meeting buttons in web UI components."
  - timestamp: 2026-03-22T14:56:09.127Z
    event: progress_report
    reason: "Implementing: removing StartAudienceButton from header, adding WorkerPicker support for initialArtifact/defaultOpen, rewiring CreateMeetingButton to use WorkerPicker."
  - timestamp: 2026-03-22T14:59:32.835Z
    event: result_submitted
    reason: "Consolidated duplicate meeting buttons into one.\n\n**Removed:**\n- `StartAudienceButton` from project header (component + CSS deleted)\n- Orphaned `.audienceButton` styles from `ProjectHeader.module.css`\n- Inline meeting creation form from `CreateMeetingButton` (manual worker name input, prompt textarea, SSE handling)\n\n**Changed:**\n- `CreateMeetingButton` now opens the `WorkerPicker` modal (same behavior the header button had: fetches worker roster, shows portraits, handles first-turn SSE consumption)\n- `WorkerPicker` gained `initialPrompt` prop to support the artifact context flow (`?tab=meetings&newMeeting=true&artifact=...` from MetadataSidebar)\n- Button label is \"Request Audience\" to match the guild terminology\n- `CreateMeetingButton.module.css` trimmed to button-only styles\n\n**Files modified:** `ProjectHeader.tsx`, `ProjectHeader.module.css`, `CreateMeetingButton.tsx`, `CreateMeetingButton.module.css`, `WorkerPicker.tsx`, `CreateCommissionButton.module.css` (comment), `worker-picker.test.tsx`\n**Files deleted:** `StartAudienceButton.tsx`, `StartAudienceButton.module.css`\n\nAll 3369 tests pass, typecheck clean."
  - timestamp: 2026-03-22T14:59:39.674Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Implementing: removing StartAudienceButton from header, adding WorkerPicker support for initialArtifact/defaultOpen, rewiring CreateMeetingButton to use WorkerPicker."
projectName: guild-hall
---
Consolidated duplicate meeting buttons into one.

**Removed:**
- `StartAudienceButton` from project header (component + CSS deleted)
- Orphaned `.audienceButton` styles from `ProjectHeader.module.css`
- Inline meeting creation form from `CreateMeetingButton` (manual worker name input, prompt textarea, SSE handling)

**Changed:**
- `CreateMeetingButton` now opens the `WorkerPicker` modal (same behavior the header button had: fetches worker roster, shows portraits, handles first-turn SSE consumption)
- `WorkerPicker` gained `initialPrompt` prop to support the artifact context flow (`?tab=meetings&newMeeting=true&artifact=...` from MetadataSidebar)
- Button label is "Request Audience" to match the guild terminology
- `CreateMeetingButton.module.css` trimmed to button-only styles

**Files modified:** `ProjectHeader.tsx`, `ProjectHeader.module.css`, `CreateMeetingButton.tsx`, `CreateMeetingButton.module.css`, `WorkerPicker.tsx`, `CreateCommissionButton.module.css` (comment), `worker-picker.test.tsx`
**Files deleted:** `StartAudienceButton.tsx`, `StartAudienceButton.module.css`

All 3369 tests pass, typecheck clean.
