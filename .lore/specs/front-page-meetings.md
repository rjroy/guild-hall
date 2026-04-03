---
title: Front-page active meetings
date: 2026-04-03
status: approved
tags: [ux, ui, dashboard, meetings]
modules: [web/app/page, web/components/dashboard/PendingAudiences, web/components/dashboard/ActiveMeetingCard, daemon/routes/meetings, lib/meetings]
related:
  - .lore/issues/front-page-meetings.md
  - .lore/specs/ui/dashboard-selection-model.md
  - .lore/specs/meetings/guild-hall-meetings.md
req-prefix: FPM
---

# Spec: Front-Page Active Meetings

## Overview

The dashboard's right column currently shows only pending meeting requests ("Pending Audiences"). This spec adds a second panel above it that surfaces active (open-status) meetings across all projects, so the manager doesn't have to navigate into each project to find in-progress conversations.

Active meetings and pending requests have fundamentally different affordances: pending requests demand a decision (Open/Defer/Ignore), while active meetings just need navigation. Keeping them in separate panels makes that distinction clear and avoids cramming two interaction models into one scrolling list.

## Entry Points

- User opens the dashboard (all-projects mode): sees all active meetings across projects
- User clicks a project in the sidebar (single-project mode): active meetings panel filters to that project, same as pending audiences does today

## Requirements

### REQ-FPM-01: Active meetings panel placement

A new `ActiveMeetings` panel renders in the `audiences` grid area, above the existing `PendingAudiences` panel. The `audiences` grid area becomes a flex column: `ActiveMeetings` on top, `PendingAudiences` below.

No CSS grid restructuring is required. The `.audiences` container in `page.module.css` adds `display: flex; flex-direction: column; gap: var(--space-md)` so the two panels stack vertically.

### REQ-FPM-02: Active meeting card content

Each active meeting renders as a compact, fully-clickable card (an `<a>` or Next.js `<Link>`) with:

- Worker portrait (from the existing `workerPortraits` record, same lookup by `worker` field)
- Worker display title (e.g., "Guild Warden")
- Project name (essential in all-projects mode)
- Meeting title (from `MeetingMeta.title`, e.g., "Audience with Thorne")
- Meeting date (from `MeetingMeta.date`)
- No action buttons

The card navigates to `/projects/<projectName>/meetings/<meetingId>` on click. The entire card surface is the link target (not a small "Resume" button).

### REQ-FPM-03: Visual distinction from pending requests

Active meeting cards must be visually distinct from `MeetingRequestCard` instances. The recommended treatment:

- A green "live" indicator (small filled circle, `--status-green` or equivalent CSS token) on the card to signal the meeting is in progress
- No action button row
- Slightly muted card styling (less visual weight than a pending request, since the user doesn't need to act on it)

The specific visual details are implementation decisions. The constraint is that a user scanning the panel can immediately distinguish "this is running, click to join" from "this needs a decision."

### REQ-FPM-04: Project filter applies to active meetings

When a project is selected via `?project=<name>`, the `ActiveMeetings` panel receives only meetings matching that project. The filtering logic in `page.tsx` follows the same pattern used for `allRequests`:

```ts
activeMeetings={selectedProject
  ? allActiveMeetings.filter(m => m.projectName === selectedProject)
  : allActiveMeetings}
```

### REQ-FPM-05: Empty state for active meetings panel

When there are no active meetings (filtered or global), the panel shows an empty state message: "No active meetings." This uses the existing `EmptyState` component.

When there are no pending requests but there are active meetings, only the empty state in `PendingAudiences` shows; the `ActiveMeetings` panel shows its content normally.

### REQ-FPM-06: Data fetching — new `?view=open` endpoint variant

The daemon endpoint `GET /meeting/request/meeting/list` gains a new `view=open` query parameter. When `view=open` is set, the endpoint:

1. Resolves the integration worktree path for the project (same as today)
2. Calls `getActiveMeetingWorktrees(guildHallHome, projectName)` to find activity worktrees for open meetings
3. Scans both the integration path and all active worktree paths for meeting artifacts
4. Filters to `status === "open"` and maps to `MeetingMeta[]` using the existing `readMeetingMeta` / `parseMeetingData` path
5. Returns `{ meetings: MeetingMeta[] }` (same shape as the default view)

This mirrors the merge logic already in the `view=artifacts` branch of the same route handler (lines 308-326 of `daemon/routes/meetings.ts`), but outputs `MeetingMeta` instead of `Artifact`.

Sorting for active meetings: by `date` descending (most recently started first). The existing `sortMeetingRequests` function is not used here; a new `sortActiveMeetings` helper in `lib/meetings.ts` sorts by `date` descending. REQ-SORT-12.

### REQ-FPM-07: Dashboard fetching — parallel per-project calls

`page.tsx` adds a third parallel fetch alongside the existing commission and meeting-request fetches:

```ts
const [commissionResults, meetingResults, activeMeetingResults, workersResult] = await Promise.all([
  /* commissions - unchanged */,
  /* meeting requests - unchanged */,
  Promise.all(
    config.projects.map(p =>
      fetchDaemon<{ meetings: MeetingMeta[] }>(
        `/meeting/request/meeting/list?projectName=${encodeURIComponent(p.name)}&view=open`
      )
    )
  ),
  /* workers - unchanged */,
]);
```

The resulting `allActiveMeetings: MeetingMeta[]` is assembled and filtered exactly as `allRequests` is today.

### REQ-FPM-08: Component structure

New component: `web/components/dashboard/ActiveMeetings.tsx`
- Props: `meetings: MeetingMeta[]`, `workerPortraits: Record<string, string>`
- Server component (no `"use client"` needed; link navigation is static)
- Uses `Panel` with title "Active Audiences" and `variant="parchment"`
- Renders `ActiveMeetingCard` per meeting, or `EmptyState` when empty

New component: `web/components/dashboard/ActiveMeetingCard.tsx`
- Props: `meeting: MeetingMeta`, `portraitUrl?: string`
- Server component; the card is a `<Link>` with `href` built from `meeting.projectName` and `meeting.meetingId`
- Owns its own CSS module for styles

No changes to `PendingAudiences.tsx` or `MeetingRequestCard.tsx`.

### REQ-FPM-09: No new API route in web/

The link target `/projects/<name>/meetings/<id>` already exists. Active meeting cards use `next/link` directly. No new Next.js API route is needed.

## Data Model

Active meetings use the existing `MeetingMeta` type from `lib/meetings.ts`. No new types are introduced. The only addition is the `sortActiveMeetings` sort function in `lib/meetings.ts` (REQ-SORT-12).

## Out of Scope

- **Recently closed meetings**: This spec covers only `status: open`. Closed meetings remain accessible via the project's meeting list. A future issue could add a "Recent" section.
- **Real-time updates**: The dashboard is a server component that re-fetches on navigation. No polling or WebSocket updates for the active meetings list. If a meeting starts while the user is on the dashboard, a page refresh surfaces it.
- **Opening a new meeting from the dashboard**: Not in scope. The existing flow via a project page is sufficient.
- **Meeting count badge on the sidebar**: Tracked separately if desired.

## Affected Files

| File | Change |
|------|--------|
| `web/app/page.tsx` | Add `activeMeetingResults` fetch; assemble `allActiveMeetings`; pass to `ActiveMeetings` |
| `web/app/page.module.css` | Add flex layout to `.audiences` to stack the two panels |
| `web/components/dashboard/ActiveMeetings.tsx` | New component |
| `web/components/dashboard/ActiveMeetingCard.tsx` | New component |
| `web/components/dashboard/ActiveMeetingCard.module.css` | New CSS module |
| `daemon/routes/meetings.ts` | Add `view=open` branch to `GET /meeting/request/meeting/list`; update operation definition |
| `lib/meetings.ts` | Add `sortActiveMeetings` function |

## Success Criteria

1. The dashboard displays all active (open-status) meetings in a panel above Pending Audiences.
2. The active meetings panel respects the project filter (`?project=`) consistently with the pending audiences panel.
3. Each active meeting card navigates directly to the live meeting view.
4. Active meeting cards are visually distinct from pending request cards.
5. Both panels show appropriate empty states when their list is empty.
6. No regressions to the existing Pending Audiences behavior.
7. Tests exist for `sortActiveMeetings`, the `view=open` endpoint branch, and the `ActiveMeetings` component.
