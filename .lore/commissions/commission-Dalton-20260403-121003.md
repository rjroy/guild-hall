---
title: "Commission: Front-page meetings Phase 3: Dashboard integration (page.tsx + page.module.css)"
date: 2026-04-03
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 3 of the front-page active meetings plan at `.lore/plans/ui/front-page-meetings.md`. Read the plan for full context and code examples.\n\n**Dependencies:** Phase 1 (commission-Dalton-20260403-120935) added the `view=open` endpoint. Phase 2 (commission-Dalton-20260403-120947) added the `ActiveMeetings` and `ActiveMeetingCard` components. Both must be complete before this phase. Read their output to verify what was built.\n\n## What to build\n\n**REQs covered:** REQ-FPM-01, REQ-FPM-04, REQ-FPM-07 from `.lore/specs/front-page-meetings.md`\n\n### Step 3a: Add `activeMeetingResults` fetch to `web/app/page.tsx`\n\nThe current `Promise.all` fetches commissions, meeting-requests, and workers in parallel. Add a fourth parallel item for active meetings:\n\n```ts\nPromise.all(\n  config.projects.map(p =>\n    fetchDaemon<{ meetings: MeetingMeta[] }>(\n      `/meeting/request/meeting/list?projectName=${encodeURIComponent(p.name)}&view=open`\n    )\n  )\n)\n```\n\n### Step 3b: Assemble `allActiveMeetings`\n\nAfter the `allRequests` assembly, add the same pattern for active meetings:\n\n```ts\nconst allActiveMeetings: MeetingMeta[] = activeMeetingResults\n  .filter((r) => r.ok)\n  .flatMap((r) => (r as { ok: true; data: { meetings: MeetingMeta[] } }).data.meetings);\n```\n\n### Step 3c: Import and render `ActiveMeetings`\n\nImport `ActiveMeetings` from `@/web/components/dashboard/ActiveMeetings`.\n\nIn the `.audiences` div, add `ActiveMeetings` above `PendingAudiences`:\n\n```tsx\n<div className={styles.audiences}>\n  <ActiveMeetings\n    meetings={selectedProject\n      ? allActiveMeetings.filter((m) => m.projectName === selectedProject)\n      : allActiveMeetings}\n    workerPortraits={workerPortraits}\n  />\n  <PendingAudiences\n    requests={selectedProject ? allRequests.filter((r) => r.projectName === selectedProject) : allRequests}\n    workerPortraits={workerPortraits}\n  />\n</div>\n```\n\n### Step 3d: Update `.audiences` CSS in `web/app/page.module.css`\n\nAdd flex layout so the two panels stack:\n\n```css\n.audiences {\n  grid-area: audiences;\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n  gap: var(--space-md);\n}\n```\n\n## Verify\n\n`bun run typecheck && bun run lint && bun test && bun run build`"
dependencies:
  - commission-Dalton-20260403-120935
  - commission-Dalton-20260403-120947
linked_artifacts: []

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-04-03T19:10:03.085Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-03T19:10:03.087Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-04-03T19:13:16.741Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-04-03T19:13:16.745Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
