---
title: Artifact Request Meeting
date: 2026-03-14
status: implemented
tags: [ui, meetings, artifacts, sidebar]
modules: [guild-hall-ui]
related:
  - .lore/specs/meetings/guild-hall-meetings.md
  - .lore/specs/ui/guild-hall-views.md
req-prefix: ARM
---

# Spec: Artifact Request Meeting

## Overview

The artifact detail sidebar has a "Create Commission from Artifact" link that navigates to the project page with query params pre-filling the commission form. This spec adds a parallel "Request Meeting" link so users can discuss an artifact interactively when a commission is not the right tool.

Both actions appear together in a dedicated **Actions** section at the bottom of the sidebar, below "Associated Commissions." Neither is nested inside the commissions section.

## Approach: Navigation vs. Direct Daemon Call

Two patterns are possible for "Request Meeting":

1. **Navigation** (recommended): Link to `/projects/<name>?tab=meetings&newMeeting=true&artifact=<path>`. The project page opens the meetings tab with a form pre-filled from the query params. Worker selection happens in the form. `MetadataSidebar` stays a server component.

2. **Direct daemon call**: Post to `POST /meeting/request/meeting/create` from the sidebar, requiring a client component, inline worker selection UI, and a worker list fetch. More moving parts for the same outcome.

The navigation approach is the right choice here. It is consistent with the commission pattern, keeps `MetadataSidebar` a server component, and gives worker selection the form context it needs. The meetings tab is the natural home for both the form and the resulting list.

## Requirements

### Sidebar Actions Section

- REQ-ARM-1: `MetadataSidebar` renders an **Actions** section below the "Associated Commissions" section when `artifactPath` is provided. The section contains two links: "Create Commission from Artifact" and "Request Meeting." These are peer actions. Neither is nested inside the other.

- REQ-ARM-2: The "Create Commission from Artifact" link moves from the "Associated Commissions" section into the Actions section. Its behavior is unchanged: it navigates to `?tab=commissions&newCommission=true&dep=<artifactPath>`. The "Associated Commissions" section continues to list commissions linked to the artifact but no longer contains the creation link.

- REQ-ARM-3: A `requestMeetingHref(projectName: string, artifactPath: string): string` function is added alongside `createCommissionHref` in `MetadataSidebar.tsx`. It returns `/projects/<encodedName>?tab=meetings&newMeeting=true&artifact=<encodedPath>`. Both functions follow the same encoding pattern.

- REQ-ARM-4: When `artifactPath` is not provided, the Actions section is not rendered. This matches the existing behavior of the commission link (`{artifactPath && ...}`).

### Project Page Query Params

- REQ-ARM-5: The project page `searchParams` type is extended with `newMeeting?: string` and `artifact?: string`. These are read alongside the existing `newCommission` and `dep` params.

- REQ-ARM-6: When `tab === "meetings"` and `newMeeting === "true"`, the meetings tab renders a `CreateMeetingButton` component in the same position as `CreateCommissionButton` is rendered on the commissions tab. The `artifact` query param, if present, is passed as `initialArtifact` to the component.

### CreateMeetingButton

- REQ-ARM-7: `CreateMeetingButton` is a client component parallel to `CreateCommissionButton`. It renders as a "Request Meeting" button that toggles inline to a form. Props: `projectName: string`, `defaultOpen?: boolean`, `initialArtifact?: string`.

- REQ-ARM-8: The form collects:
  - **Worker**: required. A select or text input for the worker name. No default; the user must choose.
  - **Prompt**: required. The user's opening message to the worker. When `initialArtifact` is provided, the prompt field is pre-populated with the artifact path as context (e.g., `Discussing artifact: <artifactPath>\n\n`) so the worker knows what to discuss. The user can edit this.
  - **Artifact** (display-only): when `initialArtifact` is provided, the artifact path is shown as context so the user understands why the prompt is pre-filled.

- REQ-ARM-9: On submit, the form posts to `POST /meeting/request/meeting/create` with `{ projectName, workerName, prompt }`. The `prompt` value includes the artifact path from `initialArtifact` (as described in REQ-ARM-8). On success (first SSE `turn_end` event or meeting_id confirmed), the form closes and navigates to the live meeting view. On error, the form shows the error message.

- REQ-ARM-10: On cancel, the form collapses back to the "Request Meeting" button without navigation.

### Artifact Reference in the Meeting

- REQ-ARM-11: The artifact path is included in the initial prompt (REQ-ARM-8) so the worker has it as context from the first turn. This does not require changes to the `createMeeting` API, which accepts `prompt` as a free-text field.

- REQ-ARM-12: The `initialArtifact` value is the `.lore/`-relative artifact path (e.g., `specs/infrastructure/my-spec.md`), the same path format used by the commission `dep` param and stored in `linked_artifacts` frontmatter fields.

### Worker Selection

- REQ-ARM-13: Worker selection is the user's responsibility. The form does not auto-select a worker or pre-fill the worker field. The user types or selects a worker name.

- REQ-ARM-14: If the worker name does not match an installed package, the daemon returns an error; the form displays it. No client-side validation of worker names is required.

## Success Criteria

- [ ] "Create Commission from Artifact" and "Request Meeting" appear as peer links in a dedicated Actions section, not nested inside "Associated Commissions"
- [ ] `requestMeetingHref()` builds the correct URL with encoded project name and artifact path
- [ ] Project page reads `newMeeting` and `artifact` query params and renders `CreateMeetingButton` on the meetings tab when `newMeeting=true`
- [ ] `CreateMeetingButton` toggles inline; form contains worker, prompt (pre-filled when `initialArtifact` provided), and artifact context display
- [ ] Submitting the form posts to the daemon's meeting create endpoint with prompt that includes the artifact path
- [ ] On success, user is navigated to the live meeting view
- [ ] On error, the error is shown in the form
- [ ] Actions section is not rendered when `artifactPath` is absent
- [ ] `MetadataSidebar` remains a server component

## Constraints

- `MetadataSidebar` is a server component. No client-side state or fetch belongs in it. The navigation link is a plain `<Link>`; the form lives in `CreateMeetingButton`.
- Worker names must be provided by the user. There is no worker discovery API to populate a dropdown in this version.
- This spec does not change the `createMeeting` daemon API. The artifact reference travels in the prompt text.
- The `CreateMeetingButton` component follows the pattern of `CreateCommissionButton` but does not need to be functionally identical; the meeting form is simpler (no dependencies field, no graph update).

## Context

- `web/components/artifact/MetadataSidebar.tsx`: Current sidebar. `createCommissionHref()` is the template for `requestMeetingHref()`. The commission link at line 141-148 moves to the Actions section.
- `web/components/commission/CreateCommissionButton.tsx`: Structural template for `CreateMeetingButton`. Same toggle pattern, different form fields.
- `web/app/projects/[name]/page.tsx`: Lines 19 and 62-67 show how commission query params are consumed. Meeting params follow the same pattern on the meetings tab (line 78-80).
- `daemon/routes/meetings.ts:77-111`: `POST /meeting/request/meeting/create` accepts `{ projectName, workerName, prompt }` and streams SSE. This is the target endpoint for REQ-ARM-9.
- [Spec: Guild Hall Meetings](../meetings/guild-hall-meetings.md): REQ-MTG-6 defines that user-created meetings start as open and skip the requested state. REQ-MTG-8 defines the meeting creation flow. REQ-MTG-2 defines the meeting artifact fields including agenda and referenced artifacts.
