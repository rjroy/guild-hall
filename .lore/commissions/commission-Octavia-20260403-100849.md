---
title: "Commission: Plan: Front-page active meetings"
date: 2026-04-03
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Create an implementation plan for the front-page active meetings spec at `.lore/specs/front-page-meetings.md`.\n\nThis is a relatively small feature (9 requirements, 7 affected files, no removals), but it touches the daemon endpoint, shared library, and multiple web components. The plan should break it into phases that can be implemented as separate commissions.\n\n## Planning requirements\n\nConsider these natural boundaries:\n- **Backend**: the `view=open` endpoint variant in `daemon/routes/meetings.ts` and the `sortActiveMeetings` helper in `lib/meetings.ts`\n- **Frontend components**: `ActiveMeetings.tsx`, `ActiveMeetingCard.tsx`, and its CSS module\n- **Dashboard integration**: `page.tsx` data fetching, `page.module.css` layout change, wiring the new components\n\nSome of these may combine into a single phase given the small scope. Use your judgment on whether this is 2-3 phases or can be done in one.\n\n## For each phase, specify:\n\n- **Phase name and number**\n- **Requirements covered** (REQ-FPM-XX list)\n- **Dependencies** (which phases must be complete first)\n- **Files created or modified**\n- **Testing strategy**\n- **Risk notes**\n- **Recommended worker and model**\n\n## Also include:\n\n- Whether a Thorne review is warranted (probably not for this size, but call it)\n- Estimated commission count\n\nRead the full spec carefully. Cross-reference the affected files list against the actual codebase to verify paths and understand the existing patterns (especially `daemon/routes/meetings.ts` for the `view=open` branch pattern, and `page.tsx` for the fetch pattern).\n\nOutput to `.lore/plans/front-page-meetings.md`."
dependencies: []
linked_artifacts:
  - .lore/plans/ui/front-page-meetings.md

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
  - timestamp: 2026-04-03T17:08:49.071Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-03T17:08:54.624Z
    event: progress_report
    reason: "Starting work: reading the spec and cross-referencing affected files in the codebase."
  - timestamp: 2026-04-03T17:10:26.823Z
    event: progress_report
    reason: "Code review complete. Writing the plan to .lore/plans/ui/front-page-meetings.md."
  - timestamp: 2026-04-03T17:12:17.000Z
    event: result_submitted
    reason: "Plan written to `.lore/plans/ui/front-page-meetings.md`.\n\n3 commissions, 2 of which can run in parallel:\n\n- **Phase 1 (backend)**: Add `sortActiveMeetings` to `lib/meetings.ts` and the `view=open` branch to `daemon/routes/meetings.ts`. Mirrors the existing `view=artifacts` branch shape. Includes operation definition update and tests for both the sort function and the endpoint.\n\n- **Phase 2 (components)**: Create `ActiveMeetings.tsx`, `ActiveMeetingCard.tsx`, and `ActiveMeetingCard.module.css`. Server components — no `\"use client\"`. `ActiveMeetingCard` is a `<Link>` wrapping the full card surface. Live indicator uses `--status-green` token from `globals.css`. Includes component render tests.\n\n- **Phase 3 (integration)**: Extend `page.tsx` to fetch `view=open` meetings in the existing `Promise.all`, assemble `allActiveMeetings`, apply project filter, and render `ActiveMeetings` above `PendingAudiences`. Add flex layout to `.audiences` in `page.module.css`. Depends on both Phase 1 and Phase 2.\n\nKey decisions documented: no Thorne review warranted at this scope; dedup strategy for worktree merging; deployment ordering constraint (Phase 1 must land before Phase 3 goes live)."
  - timestamp: 2026-04-03T17:12:23.835Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Code review complete. Writing the plan to .lore/plans/ui/front-page-meetings.md."
projectName: guild-hall
---
Plan written to `.lore/plans/ui/front-page-meetings.md`.

3 commissions, 2 of which can run in parallel:

- **Phase 1 (backend)**: Add `sortActiveMeetings` to `lib/meetings.ts` and the `view=open` branch to `daemon/routes/meetings.ts`. Mirrors the existing `view=artifacts` branch shape. Includes operation definition update and tests for both the sort function and the endpoint.

- **Phase 2 (components)**: Create `ActiveMeetings.tsx`, `ActiveMeetingCard.tsx`, and `ActiveMeetingCard.module.css`. Server components — no `"use client"`. `ActiveMeetingCard` is a `<Link>` wrapping the full card surface. Live indicator uses `--status-green` token from `globals.css`. Includes component render tests.

- **Phase 3 (integration)**: Extend `page.tsx` to fetch `view=open` meetings in the existing `Promise.all`, assemble `allActiveMeetings`, apply project filter, and render `ActiveMeetings` above `PendingAudiences`. Add flex layout to `.audiences` in `page.module.css`. Depends on both Phase 1 and Phase 2.

Key decisions documented: no Thorne review warranted at this scope; dedup strategy for worktree merging; deployment ordering constraint (Phase 1 must land before Phase 3 goes live).
