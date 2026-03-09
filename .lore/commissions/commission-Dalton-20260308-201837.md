---
title: "Commission: Implement Portrait Display-Time Resolution"
date: 2026-03-09
status: failed
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the plan at `.lore/plans/portrait-display-time-resolution.md`. Follow the steps in order. The plan removes `workerPortraitUrl` from meeting artifact creation and resolves portraits at display time from worker packages instead.\n\nKey steps:\n1. Add `resolveWorkerPortraits()` helper in `lib/packages.ts`\n2. Remove `workerPortraitUrl` from artifact creation (`daemon/services/meeting/record.ts`, `daemon/services/meeting/orchestrator.ts`)\n3. Remove from meeting toolbox (`daemon/services/meeting/toolbox.ts`)\n4. Remove from toolbox resolver and SDK runner (`daemon/services/toolbox-resolver.ts`, `daemon/lib/agent-sdk/sdk-runner.ts`)\n5. Update meeting page to resolve portrait at display time (`web/app/projects/[name]/meetings/[id]/page.tsx`)\n6. Update dashboard to show portrait on meeting requests (`web/app/page.tsx`, `web/components/dashboard/PendingAudiences.tsx`, `web/components/dashboard/MeetingRequestCard.tsx`)\n7. Update tests (remove old assertions, add new tests for `resolveWorkerPortraits()`)\n8. Validate against spec with a fresh-context sub-agent\n\nRelated issues: `.lore/issues/meeting-portrait-not-displayed.md`, `.lore/issues/worker-display-title-hardcoded-to-name.md`\n\nRun tests before declaring complete. All existing tests must pass plus the new ones."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-09T03:18:37.344Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T03:18:37.345Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-09T03:21:38.635Z
    event: status_failed
    reason: "Session error: Claude Code process exited with code 1"
current_progress: ""
projectName: guild-hall
---
