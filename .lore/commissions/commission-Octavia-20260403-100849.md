---
title: "Commission: Plan: Front-page active meetings"
date: 2026-04-03
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Create an implementation plan for the front-page active meetings spec at `.lore/specs/front-page-meetings.md`.\n\nThis is a relatively small feature (9 requirements, 7 affected files, no removals), but it touches the daemon endpoint, shared library, and multiple web components. The plan should break it into phases that can be implemented as separate commissions.\n\n## Planning requirements\n\nConsider these natural boundaries:\n- **Backend**: the `view=open` endpoint variant in `daemon/routes/meetings.ts` and the `sortActiveMeetings` helper in `lib/meetings.ts`\n- **Frontend components**: `ActiveMeetings.tsx`, `ActiveMeetingCard.tsx`, and its CSS module\n- **Dashboard integration**: `page.tsx` data fetching, `page.module.css` layout change, wiring the new components\n\nSome of these may combine into a single phase given the small scope. Use your judgment on whether this is 2-3 phases or can be done in one.\n\n## For each phase, specify:\n\n- **Phase name and number**\n- **Requirements covered** (REQ-FPM-XX list)\n- **Dependencies** (which phases must be complete first)\n- **Files created or modified**\n- **Testing strategy**\n- **Risk notes**\n- **Recommended worker and model**\n\n## Also include:\n\n- Whether a Thorne review is warranted (probably not for this size, but call it)\n- Estimated commission count\n\nRead the full spec carefully. Cross-reference the affected files list against the actual codebase to verify paths and understand the existing patterns (especially `daemon/routes/meetings.ts` for the `view=open` branch pattern, and `page.tsx` for the fetch pattern).\n\nOutput to `.lore/plans/front-page-meetings.md`."
dependencies: []
linked_artifacts: []

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-04-03T17:08:49.016Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-03T17:08:49.017Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
