---
title: "Commission: Spec: Request Meeting from Artifact sidebar"
date: 2026-03-14
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec for adding a \"Request Meeting\" button to the artifact detail sidebar, alongside the existing \"Create Commission from Artifact\" link.\n\n**Context:**\n- The artifact detail page has a `MetadataSidebar` component (`web/components/artifact/MetadataSidebar.tsx`) that shows metadata and an \"Associated Commissions\" section.\n- Inside that section, there's already a \"Create Commission from Artifact\" link that navigates to the project page with query params to pre-fill the commission form (`?tab=commissions&newCommission=true&dep=<artifactPath>`).\n- We want a parallel \"Request Meeting\" action so users can discuss an artifact interactively when a commission isn't the right tool.\n\n**What the spec should cover:**\n1. Where the button appears in the sidebar (it's a peer action to \"Create Commission,\" not nested inside commissions).\n2. What clicking it does. The existing commission pattern navigates to the project page with query params. The meeting equivalent could follow the same pattern, or it could hit the daemon's meeting initiation endpoint directly. Evaluate both and recommend one.\n3. How the artifact is referenced in the meeting (e.g., as a linked artifact, agenda context, or both).\n4. Worker selection: does the user pick a worker before or after clicking?\n5. Requirements with REQ IDs following the project's existing pattern.\n\n**Reference files to read:**\n- `web/components/artifact/MetadataSidebar.tsx` — current sidebar with commission link\n- `web/components/commission/CreateCommissionButton.tsx` — the commission form toggle pattern\n- `web/app/projects/[name]/page.tsx` — how the commission query params are consumed\n- `.lore/specs/meetings/` — existing meeting specs for REQ ID namespace\n\nKeep the spec focused and concise. This is a small feature, not an architectural change."
dependencies: []
linked_artifacts:
  - .lore/specs/ui/artifact-request-meeting.md

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-14T22:33:21.033Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-14T22:33:21.036Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-14T22:33:21.071Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-14T22:33:27.502Z
    event: progress_report
    reason: "Reading reference files before drafting the spec."
  - timestamp: 2026-03-14T22:35:57.170Z
    event: progress_report
    reason: "Read all reference files. Now drafting the spec. Key findings: the commission link is a server-side Link inside the \"Associated Commissions\" section; createMeeting API takes {projectName, workerName, prompt}; the navigation pattern is the right approach (sidebar stays server component, worker selection deferred to form). REQ prefix: ARM."
  - timestamp: 2026-03-14T22:36:48.936Z
    event: result_submitted
    reason: "Spec written at .lore/specs/ui/artifact-request-meeting.md (REQ-ARM-1 through REQ-ARM-14).\n\nKey decisions captured in the spec:\n\n**Approach**: Navigation, not direct daemon call. MetadataSidebar is already a server component; adding a client fetch for worker selection would break that. The navigation approach is consistent with the commission pattern and lets worker selection live in a proper form context.\n\n**Placement**: New \"Actions\" section below \"Associated Commissions.\" The \"Create Commission from Artifact\" link moves there too, so both peer actions live together rather than commission creation being buried inside the commissions section.\n\n**Artifact reference**: Embedded in the pre-filled prompt text. The `createMeeting` API takes a free-text `prompt` field; no API change needed. Format: \"Discussing artifact: specs/my-spec.md\\n\\n\" prepended to the user's message.\n\n**Worker selection**: Deferred to the form. No default, no auto-selection, no dropdown (no discovery API). User types the worker name; daemon returns an error if it doesn't match an installed package.\n\n**New components needed**: `requestMeetingHref()` function in MetadataSidebar.tsx, `CreateMeetingButton` client component (parallel to CreateCommissionButton), and query param handling in the project page for `newMeeting` and `artifact`."
  - timestamp: 2026-03-14T22:36:55.606Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Read all reference files. Now drafting the spec. Key findings: the commission link is a server-side Link inside the \"Associated Commissions\" section; createMeeting API takes {projectName, workerName, prompt}; the navigation pattern is the right approach (sidebar stays server component, worker selection deferred to form). REQ prefix: ARM."
projectName: guild-hall
---
Spec written at .lore/specs/ui/artifact-request-meeting.md (REQ-ARM-1 through REQ-ARM-14).

Key decisions captured in the spec:

**Approach**: Navigation, not direct daemon call. MetadataSidebar is already a server component; adding a client fetch for worker selection would break that. The navigation approach is consistent with the commission pattern and lets worker selection live in a proper form context.

**Placement**: New "Actions" section below "Associated Commissions." The "Create Commission from Artifact" link moves there too, so both peer actions live together rather than commission creation being buried inside the commissions section.

**Artifact reference**: Embedded in the pre-filled prompt text. The `createMeeting` API takes a free-text `prompt` field; no API change needed. Format: "Discussing artifact: specs/my-spec.md\n\n" prepended to the user's message.

**Worker selection**: Deferred to the form. No default, no auto-selection, no dropdown (no discovery API). User types the worker name; daemon returns an error if it doesn't match an installed package.

**New components needed**: `requestMeetingHref()` function in MetadataSidebar.tsx, `CreateMeetingButton` client component (parallel to CreateCommissionButton), and query param handling in the project page for `newMeeting` and `artifact`.
