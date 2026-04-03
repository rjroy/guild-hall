---
title: "Commission: Spec: Front page meetings panel expansion"
date: 2026-04-03
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec for expanding the dashboard's meeting area to show open/active meetings alongside pending meeting requests.\n\n## Context\n\nThe dashboard (`web/app/page.tsx`) currently has a \"Pending Audiences\" panel (`web/components/dashboard/PendingAudiences.tsx`) that shows meeting *requests* (proposed meetings waiting to be accepted). The user wants to also surface open/active meetings in the same area, so they don't have to navigate into each project to find them.\n\nThe dashboard already fetches meeting data for all projects via `/meeting/request/meeting/list`. The project-level meeting list is at `web/components/project/MeetingList.tsx` for reference on how meetings are displayed elsewhere.\n\n## Questions the spec should answer\n\n1. **What meeting states belong on the dashboard?** Pending requests are already there. What about active (in-progress) meetings? Recently completed? Just active?\n\n2. **Panel structure.** Same panel with sections? Separate sibling panels? Tabs within the audiences area? Consider that pending requests need action buttons (Open/Defer/Ignore) while active meetings just need a link to navigate into them.\n\n3. **Visual distinction.** How should active meetings look different from pending requests? The existing `MeetingRequestCard` has action buttons; active meetings would need different UI (maybe just a link with worker portrait, project name, and meeting title/age).\n\n4. **Filtering.** The dashboard has a project selector that already filters pending audiences. The new meeting display should respect the same filter.\n\n5. **Data fetching.** What daemon endpoints provide the needed data? Is the existing `/meeting/request/meeting/list` sufficient or does the dashboard need additional data about active meeting sessions?\n\n6. **Empty states.** What shows when there are no active meetings? When there are no pending requests but there are active meetings? When both are empty?\n\n## References\n\n- Issue: `.lore/issues/front-page-meetings.md`\n- Dashboard page: `web/app/page.tsx`\n- Current panel: `web/components/dashboard/PendingAudiences.tsx`\n- Meeting request card: `web/components/dashboard/MeetingRequestCard.tsx`\n- Project meeting list: `web/components/project/MeetingList.tsx`\n- Meeting types: `lib/meetings.ts`\n\nOutput to `.lore/specs/front-page-meetings.md`."
dependencies: []
linked_artifacts:
  - .lore/specs/front-page-meetings.md

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-04-03T09:04:16.997Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-03T09:04:16.999Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-03T09:04:17.051Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-03T09:04:23.074Z
    event: progress_report
    reason: "Reading relevant source files to understand current dashboard structure, meeting types, and existing patterns before drafting the spec."
  - timestamp: 2026-04-03T09:04:37.500Z
    event: progress_report
    reason: "Reading daemon meeting endpoints and state model to understand what data is available for active meetings."
  - timestamp: 2026-04-03T09:06:07.316Z
    event: progress_report
    reason: "Context gathered. Writing the spec for front-page-meetings.md now."
  - timestamp: 2026-04-03T09:07:08.426Z
    event: result_submitted
    reason: "Spec written to `.lore/specs/front-page-meetings.md`.\n\nKey decisions made:\n\n**Panel structure**: Two separate panels stacked vertically in the `audiences` column — `ActiveMeetings` above, `PendingAudiences` below. The `.audiences` div gets `display: flex; flex-direction: column` and that's the only CSS change. No tabs, no merged sections. Pending requests and active meetings have different affordances and belong apart.\n\n**What belongs on the dashboard**: Only `status: open` (active, in-session meetings). Closed and declined meetings stay on the project page. Pending requests are already there.\n\n**Active meeting card**: Worker portrait + project name + meeting title + date + green \"live\" indicator. The entire card is a navigation link to `/projects/<name>/meetings/<id>`. No action buttons.\n\n**Data fetching**: New `?view=open` parameter on the existing `GET /meeting/request/meeting/list` endpoint. Returns `MeetingMeta[]` filtered to open status, scanning both integration and active worktrees via the existing `getActiveMeetingWorktrees` infrastructure. Same return shape as the default view — no new types.\n\n**Sorting**: New `sortActiveMeetings` helper in `lib/meetings.ts`, sorts by date descending (most recent first). Tagged REQ-SORT-12.\n\n**Project filter**: Same pattern as `allRequests` in `page.tsx` — filter by `projectName` before passing to the component.\n\n**Out of scope**: Real-time updates, recently closed meetings, meeting count badges."
  - timestamp: 2026-04-03T09:07:15.859Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Context gathered. Writing the spec for front-page-meetings.md now."
projectName: guild-hall
---
Spec written to `.lore/specs/front-page-meetings.md`.

Key decisions made:

**Panel structure**: Two separate panels stacked vertically in the `audiences` column — `ActiveMeetings` above, `PendingAudiences` below. The `.audiences` div gets `display: flex; flex-direction: column` and that's the only CSS change. No tabs, no merged sections. Pending requests and active meetings have different affordances and belong apart.

**What belongs on the dashboard**: Only `status: open` (active, in-session meetings). Closed and declined meetings stay on the project page. Pending requests are already there.

**Active meeting card**: Worker portrait + project name + meeting title + date + green "live" indicator. The entire card is a navigation link to `/projects/<name>/meetings/<id>`. No action buttons.

**Data fetching**: New `?view=open` parameter on the existing `GET /meeting/request/meeting/list` endpoint. Returns `MeetingMeta[]` filtered to open status, scanning both integration and active worktrees via the existing `getActiveMeetingWorktrees` infrastructure. Same return shape as the default view — no new types.

**Sorting**: New `sortActiveMeetings` helper in `lib/meetings.ts`, sorts by date descending (most recent first). Tagged REQ-SORT-12.

**Project filter**: Same pattern as `allRequests` in `page.tsx` — filter by `projectName` before passing to the component.

**Out of scope**: Real-time updates, recently closed meetings, meeting count badges.
