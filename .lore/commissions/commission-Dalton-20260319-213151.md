---
title: "Commission: Meeting Layer Separation: Phase 2 - Remove re-exports"
date: 2026-03-20
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 2 of the Meeting Layer Separation plan at `.lore/plans/infrastructure/meeting-layer-separation.md`.\n\nRead the plan thoroughly. Phase 2 covers Steps 2.1 through 2.4: remove `ActiveMeetingEntry` re-export, remove `QueryOptions` re-export, migrate consumers to `SdkQueryOptions` from the canonical source, and remove the stale TODO comment.\n\nBefore starting, read the Phase 1 review findings at `.lore/commissions/` (the most recent Thorne review commission). If the review identified issues that affect Phase 2, address them first.\n\nThis is an import-path-only change. Zero runtime behavior should change.\n\nAfter completing all steps, run:\n```bash\nbun run typecheck\nbun run lint\nbun test\n```\n\nAll must pass. Commit the Phase 2 changes as a single commit."
dependencies:
  - commission-Thorne-20260319-213144
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-20T04:31:51.879Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T04:37:33.832Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-20T04:40:29.780Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-20T04:40:29.782Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
