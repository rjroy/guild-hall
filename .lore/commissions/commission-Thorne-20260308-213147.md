---
title: "Commission: Review: Implement Portrait Display-Time Resolution"
date: 2026-03-09
status: dispatched
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the completed work from commission `commission-Dalton-20260308-201837` (Implement Portrait Display-Time Resolution).\n\n**What changed:** Portrait URLs were removed from meeting artifact frontmatter and are now resolved at display time from worker package metadata. This touches the full stack: daemon services, SDK runner, toolbox resolver, Next.js server components, and dashboard.\n\n**Plan:** `.lore/plans/portrait-display-time-resolution.md`\n**Spec:** `.lore/specs/worker-identity-and-personality.md`\n**Related issues:** `.lore/issues/meeting-portrait-not-displayed.md`, `.lore/issues/worker-display-title-hardcoded-to-name.md`\n\n**Files changed (from commission artifact):**\n- `lib/packages.ts` — new `resolveWorkerPortraits()` helper\n- `daemon/services/meeting/record.ts` — removed `workerPortraitUrl` from `writeMeetingArtifact()`\n- `daemon/services/meeting/orchestrator.ts` — removed portrait args from three callers\n- `daemon/services/meeting/toolbox.ts` — removed portrait from `MeetingToolboxDeps` and followup template\n- `daemon/services/toolbox-resolver.ts` and `daemon/services/toolbox-types.ts` — removed `workerPortraitUrl` from context/deps\n- `daemon/lib/agent-sdk/sdk-runner.ts` — removed portrait from context passed to `resolveToolSet()`\n- `web/app/projects/[name]/meetings/[id]/page.tsx` — resolves portrait from packages instead of frontmatter\n- `web/app/page.tsx` — calls `resolveWorkerPortraits()` for dashboard\n- `web/components/dashboard/PendingAudiences.tsx` — accepts and threads `workerPortraits` prop\n- `web/components/dashboard/MeetingRequestCard.tsx` — renders `WorkerPortrait` component\n- Tests: `tests/lib/packages.test.ts`, `tests/daemon/services/meeting/record.test.ts`, `tests/daemon/meeting-toolbox.test.ts`, `tests/components/pending-audiences.test.tsx`\n\n**Review focus:**\n1. Verify all `workerPortraitUrl` references are removed from daemon code (no stale threading)\n2. Verify `resolveWorkerPortraits()` correctly maps worker names to portrait paths\n3. Check server/client component boundary: Maps don't serialize across it, should be converted to `Record<string, string>`\n4. Verify spec compliance against REQ-WID-10, REQ-VIEW-3, REQ-VIEW-28, REQ-VIEW-12 zone 5\n5. Check test coverage: old assertions removed, new tests for the helper and graceful degradation\n6. Look for any missed consumers of portrait data that still expect it from frontmatter"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-09T04:31:47.883Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T04:31:47.884Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
