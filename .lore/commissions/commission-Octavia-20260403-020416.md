---
title: "Commission: Spec: Front page meetings panel expansion"
date: 2026-04-03
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec for expanding the dashboard's meeting area to show open/active meetings alongside pending meeting requests.\n\n## Context\n\nThe dashboard (`web/app/page.tsx`) currently has a \"Pending Audiences\" panel (`web/components/dashboard/PendingAudiences.tsx`) that shows meeting *requests* (proposed meetings waiting to be accepted). The user wants to also surface open/active meetings in the same area, so they don't have to navigate into each project to find them.\n\nThe dashboard already fetches meeting data for all projects via `/meeting/request/meeting/list`. The project-level meeting list is at `web/components/project/MeetingList.tsx` for reference on how meetings are displayed elsewhere.\n\n## Questions the spec should answer\n\n1. **What meeting states belong on the dashboard?** Pending requests are already there. What about active (in-progress) meetings? Recently completed? Just active?\n\n2. **Panel structure.** Same panel with sections? Separate sibling panels? Tabs within the audiences area? Consider that pending requests need action buttons (Open/Defer/Ignore) while active meetings just need a link to navigate into them.\n\n3. **Visual distinction.** How should active meetings look different from pending requests? The existing `MeetingRequestCard` has action buttons; active meetings would need different UI (maybe just a link with worker portrait, project name, and meeting title/age).\n\n4. **Filtering.** The dashboard has a project selector that already filters pending audiences. The new meeting display should respect the same filter.\n\n5. **Data fetching.** What daemon endpoints provide the needed data? Is the existing `/meeting/request/meeting/list` sufficient or does the dashboard need additional data about active meeting sessions?\n\n6. **Empty states.** What shows when there are no active meetings? When there are no pending requests but there are active meetings? When both are empty?\n\n## References\n\n- Issue: `.lore/issues/front-page-meetings.md`\n- Dashboard page: `web/app/page.tsx`\n- Current panel: `web/components/dashboard/PendingAudiences.tsx`\n- Meeting request card: `web/components/dashboard/MeetingRequestCard.tsx`\n- Project meeting list: `web/components/project/MeetingList.tsx`\n- Meeting types: `lib/meetings.ts`\n\nOutput to `.lore/specs/front-page-meetings.md`."
dependencies: []
linked_artifacts: []

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
current_progress: ""
projectName: guild-hall
---
