---
title: "Commission: Implement: Worker sub-agents Phase 2 (description generation)"
date: 2026-03-21
status: blocked
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 2 of the worker sub-agents plan at `.lore/plans/infrastructure/worker-sub-agents.md`.\n\n**Read the plan AND the spec** (`.lore/specs/infrastructure/worker-sub-agents.md`) before starting.\n\n**Phase 2: Description Generation** (Steps 6-7)\n\n1. Create `packages/shared/sub-agent-description.ts` with `buildSubAgentDescription(identity, posture)` pure function (REQ-SUBAG-17, REQ-SUBAG-18, REQ-SUBAG-19, REQ-SUBAG-20)\n2. Implement lookup table keyed by worker name with invocation guidance for all current workers (Thorne, Octavia, Dalton, Celeste, Edmund, Verity, Sable, Sienna)\n3. Fallback for unknown workers uses identity.description as invocation guidance\n4. Tests in `tests/packages/shared/sub-agent-description.test.ts`: known worker uses table entry, unknown worker uses fallback, description format is correct, function is pure\n\nRun `bun run typecheck && bun test` after implementation. Commit when all pass."
dependencies:
  - commission-Dalton-20260320-205959
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T04:00:08.500Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T04:00:08.501Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
