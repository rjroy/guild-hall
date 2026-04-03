---
title: "Commission: Front-page meetings Phase 2: Components (ActiveMeetings + ActiveMeetingCard)"
date: 2026-04-03
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 2 of the front-page active meetings plan at `.lore/plans/ui/front-page-meetings.md`. Read the plan for full context and code examples.\n\n## What to build\n\n**REQs covered:** REQ-FPM-02, REQ-FPM-03, REQ-FPM-05, REQ-FPM-08, REQ-FPM-09 from `.lore/specs/front-page-meetings.md`\n\n### `web/components/dashboard/ActiveMeetings.tsx`\n\nNew server component. Mirrors `PendingAudiences.tsx` exactly in structure:\n- Props: `meetings: MeetingMeta[]`, `workerPortraits: Record<string, string>`\n- Wraps content in `<Panel title=\"Active Audiences\" variant=\"parchment\">`\n- Maps meetings to `ActiveMeetingCard` instances\n- Shows `<EmptyState message=\"No active meetings.\" />` when empty\n- No `\"use client\"` directive\n\n### `web/components/dashboard/ActiveMeetingCard.tsx`\n\nNew server component. The entire card is a `<Link>` from `next/link`:\n- Props: `meeting: MeetingMeta`, `portraitUrl?: string`\n- Link href: `/projects/${encodeURIComponent(meeting.projectName)}/meetings/${encodeURIComponent(meeting.meetingId)}`\n- Displays: worker portrait (use `WorkerPortrait` component if it exists, otherwise a simple img), worker display title, meeting title, project name, meeting date\n- Green \"live\" indicator: small filled circle. Check `web/app/globals.css` for the right status color token\n- No action buttons\n- Slightly muted card styling compared to `MeetingRequestCard`\n- No `\"use client\"` directive\n\n### `web/components/dashboard/ActiveMeetingCard.module.css`\n\nNew CSS module. Read `MeetingRequestCard` for the visual baseline, then make the active card slightly muted.\n\n**All colors must use `var(--color-*)` tokens from `globals.css`. No hex or rgb literals.**\n\n## Testing\n\nRequired tests:\n1. `ActiveMeetings` with empty array renders empty state\n2. `ActiveMeetings` with meetings renders cards\n3. `ActiveMeetingCard` renders a link with correct href\n4. `ActiveMeetingCard` displays worker title correctly\n\n## Verify\n\n`bun run typecheck && bun run lint && bun test`"
dependencies: []
linked_artifacts: []

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-04-03T19:09:47.019Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-03T19:09:47.020Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
