---
title: "Commission: Meeting Layer Separation: Phase 1 - Relocate MeetingSessionForRoutes interface"
date: 2026-03-20
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 1 of the Meeting Layer Separation plan at `.lore/plans/infrastructure/meeting-layer-separation.md`.\n\nRead the plan thoroughly. Phase 1 covers Steps 1.1 through 1.5: define `MeetingSessionForRoutes` interface in the orchestrator, annotate the factory return type, remove the duplicate from routes, update consumer imports, and add missing mock stubs in tests.\n\nThis is a type-only change. Zero runtime behavior should change.\n\nAfter completing all steps, run:\n```bash\nbun run typecheck\nbun run lint\nbun test\n```\n\nAll must pass. Commit the Phase 1 changes as a single commit."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-20T04:31:33.654Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T04:32:20.613Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
