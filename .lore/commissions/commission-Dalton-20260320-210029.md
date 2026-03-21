---
title: "Commission: Implement: Worker sub-agents Phase 3 (options extension)"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 3 of the worker sub-agents plan at `.lore/plans/infrastructure/worker-sub-agents.md`.\n\n**Read the plan AND the spec** (`.lore/specs/infrastructure/worker-sub-agents.md`) before starting.\n\n**Phase 3: SdkQueryOptions Extension and Passthrough** (Steps 8-10)\n\n1. Add `agents` property to `SdkQueryOptions` in `sdk-runner.ts` with inline type matching AgentDefinition shape (REQ-SUBAG-21)\n2. Verify `runSdkSession` passthrough works (the spread already handles it) (REQ-SUBAG-22)\n3. Test: agents in options passes through to queryFn\n\nRun `bun run typecheck && bun test` after implementation. Commit when all pass."
dependencies:
  - commission-Dalton-20260320-210021
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T04:00:29.810Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T04:00:29.811Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-21T04:10:35.498Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-21T04:10:35.500Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
