---
title: "Commission: Review: Sub-agent description fix"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review Dalton's implementation of the sub-agent description fix.\n\n**Plan:** `.lore/plans/infrastructure/sub-agent-description-fix.md`\n**Spec:** `.lore/specs/infrastructure/worker-sub-agents.md` (REQ-SUBAG-32, REQ-SUBAG-33, revised REQ-SUBAG-18 through REQ-SUBAG-20)\n\n**Focus areas from the plan:**\n1. Verify no other call sites reference the old two-argument `buildSubAgentDescription(identity, posture)` signature\n2. Verify all eight workers have `guidance` values in their `package.json`\n3. Verify the fallback path still works for workers without guidance\n4. Verify the lookup table is fully removed from `sub-agent-description.ts`\n5. Verify tests cover both guidance-present and guidance-absent paths\n\nRun `bun run typecheck && bun test`."
dependencies:
  - commission-Dalton-20260321-020719
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T09:07:26.079Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T09:07:26.080Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-21T09:11:57.642Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-21T09:11:57.646Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
