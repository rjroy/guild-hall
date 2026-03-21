---
title: "Commission: Implement: Worker sub-agents Phase 4 (agent map construction)"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 4 of the worker sub-agents plan at `.lore/plans/infrastructure/worker-sub-agents.md`.\n\n**Read the plan AND the spec** (`.lore/specs/infrastructure/worker-sub-agents.md`) before starting. This is the core integration phase.\n\n**Phase 4: Agent Map Construction** (Steps 11-12)\n\n1. Build the agent map in `prepareSdkSession` between step 4 (activate worker) and step 5 (build options). For each non-calling worker package:\n   - Load memories concurrently via Promise.allSettled (REQ-SUBAG-9)\n   - Construct ActivationContext with identity, posture, soul, memory, but NO meetingContext/commissionContext (REQ-SUBAG-15, REQ-SUBAG-16)\n   - Call activateWorker to get system prompt (REQ-SUBAG-7)\n   - Build description via buildSubAgentDescription (REQ-SUBAG-17-20)\n   - Resolve model from subAgentModel, always set explicitly including \"inherit\" (REQ-SUBAG-10, REQ-SUBAG-11)\n   - No tools field on AgentDefinition (REQ-SUBAG-12)\n2. Exclude calling worker from map (REQ-SUBAG-6)\n3. Per-worker error handling: log warn, exclude worker, session continues (REQ-SUBAG-8, REQ-SUBAG-31)\n4. Info logging at start and end (REQ-SUBAG-30)\n5. Wire agents into options (REQ-SUBAG-21, REQ-SUBAG-22)\n6. Tests: 13 test cases as specified in Step 12 of the plan\n\nRun `bun run typecheck && bun test` after implementation. Commit when all pass."
dependencies:
  - commission-Dalton-20260320-210042
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T04:00:54.170Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T04:00:54.172Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-21T04:15:01.489Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-21T04:15:01.491Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
