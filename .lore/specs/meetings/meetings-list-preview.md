---
title: Meetings List Preview Text
date: 2026-03-19
status: approved
tags: [ui, meetings, ux]
modules: [web/components/project]
related:
  - .lore/specs/meetings/guild-hall-meetings.md
  - .lore/specs/meetings/meeting-rename.md
  - .lore/specs/ui/guild-hall-views.md
  - .lore/issues/meetings-list-no-preview.md
req-prefix: MLP
---

# Spec: Meetings List Preview Text

## Overview

The Meetings tab on the Project page shows a flat list of meetings. Each entry displays a status gem, the title ("Audience with Guild Master"), the date, and the worker name. When most meetings are with the same worker, every entry looks identical. The user has to click into each one to find the conversation they're looking for.

Meeting artifacts already carry data that could distinguish entries: the `agenda` field (the user's original prompt or the meeting request's purpose), the `title` field (updatable via `rename_meeting`), and for closed meetings, the notes body. None of this shows up in the list.

This spec adds a preview line to each meeting list entry. The preview draws from data already present in the meeting artifact. No new metadata fields, no transcript fetching, no daemon changes. This is a UI-only read-path enhancement.

Depends on: [Spec: Guild Hall Meetings](guild-hall-meetings.md) for the meeting artifact structure (REQ-MTG-1, REQ-MTG-2). [Spec: Meeting Rename Tool](meeting-rename.md) for the renamed title behavior (REQ-MRN-1, REQ-MRN-16).

## Entry Points

- User views the Meetings tab on a Project page (`web/components/project/MeetingList.tsx`)

## Requirements

### Title Display

- REQ-MLP-1: When a meeting has been renamed (its `title` differs from the generated "Audience with [Worker]" pattern), the renamed title is the primary display name. This is the current behavior; `meetingTitle()` already reads `meeting.meta.title`. No change needed, but this requirement anchors the title as the first line of the entry.

- REQ-MLP-2: The worker name continues to appear in the metadata line below the title, regardless of whether the title has been renamed. A renamed title replaces the generic "Audience with X" label; it does not replace the worker attribution. The user needs both: what the meeting is about (title) and who they talked to (worker).

### Preview Line

- REQ-MLP-3: Each meeting list entry displays a preview line between the title and the metadata row (date + worker). The preview is a single line of text, truncated with an ellipsis if it exceeds the available width. It uses a muted text style to visually subordinate it to the title.

- REQ-MLP-4: The preview line content is resolved from the first available source in this priority order:

  1. **Agenda** (`meeting.meta.extras.agenda`): The user's original prompt or the meeting request's stated purpose. This is the most reliable signal for what the meeting is about, and it exists for every meeting (user-created meetings store the initial prompt; requested meetings store the request reason).
  2. **Notes excerpt** (`meeting.content`): For closed meetings, the first non-empty line of the markdown body (the generated notes summary). Stripped of markdown heading markers (`#`, `##`, etc.) and leading whitespace. This provides a post-hoc summary when the agenda is missing or empty.
  3. **No preview**: If neither source produces a non-empty string, the preview line is omitted entirely. No placeholder text like "No description" is shown; the entry falls back to the current layout (title + metadata only).

- REQ-MLP-5: The agenda value is displayed verbatim (not parsed as markdown). It is plain text in the frontmatter and should render as plain text in the list. Long agendas are truncated by CSS, not by string slicing; the full value is present in the DOM for accessibility.

- REQ-MLP-6: The notes excerpt is the first non-empty, non-heading line from `meeting.content`. "Non-empty" means the line has content after trimming whitespace. "Non-heading" means the line does not start with one or more `#` characters followed by a space. This skips the "Meeting Notes" heading that the notes generator typically produces as the first line.

### Data Source

- REQ-MLP-7: The preview line reads from the `Artifact` object already passed to the `MeetingList` component. The `agenda` field is available via `meeting.meta.extras.agenda`. The notes body is available via `meeting.content`. No additional API calls, no daemon endpoint changes, no new data fetching.

- REQ-MLP-8: The `MeetingList` component must not depend on the `MeetingMeta` type from `lib/meetings.ts`. It receives `Artifact[]` from the page component and reads meeting-specific fields from `meta.extras`. This preserves the existing contract between the page and the component.

### Visual Design

- REQ-MLP-9: The preview line renders below the title and above the metadata row (date + worker). It occupies a single line with `text-overflow: ellipsis` and `overflow: hidden` applied via CSS. White-space is collapsed to a single line (`white-space: nowrap`).

- REQ-MLP-10: The preview text uses `font-size: 0.85rem` and `color: var(--color-text-muted)`. These values match the existing metadata text styling, keeping the preview visually subordinate to the title without introducing new design tokens.

- REQ-MLP-11: The preview line does not affect the height of entries that lack preview text. Entries with no preview render identically to the current layout: title, then metadata. The preview line is conditionally rendered, not hidden with `visibility: hidden` or given a fixed height.

### Consistency Across Statuses

- REQ-MLP-12: The preview line appears in all meeting entry variants: open, closed, requested, declined, and the fallback non-interactive state. The same `previewText()` extraction logic is used across all variants. The preview line is part of the `.info` block, which is shared by all four rendering branches in the current component.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Meeting artifact structure | Preview reads agenda and notes body | [Spec: Guild Hall Meetings](guild-hall-meetings.md) (REQ-MTG-2) |
| Title display | Renamed titles surface as primary label | [Spec: Meeting Rename](meeting-rename.md) (REQ-MRN-1, REQ-MRN-16) |

## Success Criteria

- [ ] Meeting list entries with an agenda show the agenda as preview text below the title
- [ ] Closed meetings without an agenda show the first non-heading line of notes as preview text
- [ ] Meetings with neither agenda nor notes show no preview line (no "No description" placeholder)
- [ ] Renamed meeting titles still display as the primary title (existing behavior preserved)
- [ ] Worker name still appears in the metadata row regardless of title or preview content
- [ ] Preview text is truncated with ellipsis when it exceeds the entry width
- [ ] Preview line does not add vertical space to entries that have no preview content
- [ ] All four meeting status variants (open, closed, requested, declined/other) render the preview line consistently
- [ ] No new daemon endpoints or API calls introduced
- [ ] No new data types or fields added to `Artifact` or `ArtifactMeta`

## AI Validation

**Defaults:**
- Unit tests with mocked data
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Preview extraction test: `previewText()` returns `agenda` when present, falls back to notes excerpt, returns `undefined` when both are absent
- Notes excerpt test: strips markdown heading lines (`# Meeting Notes`, `## Summary`), returns the first content line
- Empty-state test: meetings with empty `agenda` and empty `content` render without a preview element in the DOM
- CSS truncation test: preview text element has `text-overflow: ellipsis`, `overflow: hidden`, `white-space: nowrap` applied
- Consistency test: all four rendering branches (open, closed, requested, other) include the preview line in the `.info` block
- No-regression test: `meetingTitle()` behavior unchanged; still reads `meeting.meta.title` and falls back to filename

## Constraints

- **Read-only enhancement.** This spec adds display logic to the `MeetingList` component. It does not modify meeting artifacts, frontmatter schemas, daemon endpoints, or the meeting lifecycle. All data sources are fields that already exist on the `Artifact` object.
- **No transcript access.** Transcripts are ephemeral (deleted on meeting close) and stored outside the artifact. Fetching transcript content for preview would require new daemon infrastructure. Out of scope.
- **No content body for open meetings.** Open meeting artifacts have an empty markdown body (notes are written on close). For open meetings, the agenda is the only preview source. This is acceptable: the agenda is the user's original prompt, which is the best description of an in-progress meeting.
- **No markdown rendering in preview.** The preview line is plain text. Rendering markdown in a truncated single-line context would produce visual artifacts (partial links, orphaned formatting characters). Plain text with CSS truncation is the correct approach.

## Context

- `web/components/project/MeetingList.tsx`: The component this spec modifies. Currently renders title, status gem, date, and worker. The `meetingTitle()` helper reads `meeting.meta.title`. The `.info` CSS class wraps the title and metadata row.
- `web/components/project/MeetingList.module.css`: Existing styles. The preview line adds a new `.preview` class following the pattern of `.title` and `.meta`.
- `web/components/dashboard/MeetingRequestCard.tsx`: Already displays `request.agenda` as preview text (line 245-247). Confirms that agenda is a reliable, non-empty field for meetings created through the request flow.
- `lib/meetings.ts`: Defines `MeetingMeta` with typed `agenda` and `notes` fields. The `MeetingList` component does not use this type (it receives `Artifact[]`), but the field names confirm what's stored in frontmatter.
- `daemon/services/meeting/record.ts`: `writeMeetingArtifact()` writes `agenda` from the user's initial prompt. For user-created meetings, this is the message they typed to start the meeting. For accepted requests, it's the request's agenda text.
