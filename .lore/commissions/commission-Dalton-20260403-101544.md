---
title: "Commission: Front-page meetings Phase 2: Components (ActiveMeetings + ActiveMeetingCard)"
date: 2026-04-03
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 2 of the front-page active meetings plan at `.lore/plans/ui/front-page-meetings.md`.\n\n## What to build\n\n**REQs covered:** REQ-FPM-02, REQ-FPM-03, REQ-FPM-05, REQ-FPM-08, REQ-FPM-09 from `.lore/specs/front-page-meetings.md`\n\n### `web/components/dashboard/ActiveMeetings.tsx`\n\nNew server component. Mirrors `PendingAudiences.tsx` exactly in structure:\n- Props: `meetings: MeetingMeta[]`, `workerPortraits: Record<string, string>`\n- Wraps content in `<Panel title=\"Active Audiences\" variant=\"parchment\">`\n- Maps meetings to `ActiveMeetingCard` instances\n- Shows `<EmptyState message=\"No active meetings.\" />` when empty\n- No `\"use client\"` directive\n\n### `web/components/dashboard/ActiveMeetingCard.tsx`\n\nNew server component. The entire card is a `<Link>` from `next/link`:\n- Props: `meeting: MeetingMeta`, `portraitUrl?: string`\n- Link href: `/projects/${encodeURIComponent(meeting.projectName)}/meetings/${encodeURIComponent(meeting.meetingId)}`\n- Displays: worker portrait (use `WorkerPortrait` component), worker display title, meeting title, project name, meeting date\n- Green \"live\" indicator: small filled circle. Check `web/app/globals.css` for the right `--status-green` or equivalent token name\n- No action buttons (REQ-FPM-02)\n- Slightly muted card styling compared to `MeetingRequestCard` (less visual weight)\n- No `\"use client\"` directive\n\n### `web/components/dashboard/ActiveMeetingCard.module.css`\n\nNew CSS module. Key rules:\n- `.card`: flex row, gap, padding, border-radius, cursor pointer. Muted background. Hover lift effect.\n- `.liveIndicator`: small filled circle (8px, border-radius 50%, green background using CSS token)\n- `.content`: flex column\n- `.workerTitle`, `.meetingTitle`, `.meta`: typography hierarchy, meta is smaller/muted\n\n**All colors must use `var(--color-*)` tokens from `globals.css`. No hex or rgb literals.**\n\nRead `PendingAudiences.tsx` and `MeetingRequestCard.tsx` for patterns. Read `globals.css` for available tokens.\n\n## Testing\n\nNew file: `tests/components/active-meeting-card.test.ts`\n\nRequired tests:\n1. `ActiveMeetings` with empty array renders `EmptyState` with \"No active meetings.\"\n2. `ActiveMeetings` with one meeting renders one `ActiveMeetingCard`\n3. `ActiveMeetingCard` renders a link with correct href\n4. `ActiveMeetingCard` displays `workerDisplayTitle` when present, falls back to `worker`\n\n## Verify\n\n`bun run typecheck && bun run lint && bun test tests/components/active-meeting-card.test.ts`"
dependencies: []
linked_artifacts: []

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-04-03T17:15:44.537Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-03T17:15:44.538Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
