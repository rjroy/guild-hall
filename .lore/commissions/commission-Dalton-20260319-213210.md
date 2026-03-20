---
title: "Commission: Meeting Layer Separation: Phase 3 - Extract session loop"
date: 2026-03-20
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 3 of the Meeting Layer Separation plan at `.lore/plans/infrastructure/meeting-layer-separation.md`.\n\nRead the plan thoroughly. Phase 3 covers Steps 3.1 through 3.5: define `SessionLoopDeps`, extract `iterateSession`, extract `startSession`, wire the orchestrator to the extracted functions, and verify no circular dependencies.\n\nBefore starting, read the Phase 2 review findings at `.lore/commissions/` (the most recent Thorne review commission). If the review identified issues, address them first.\n\nThis is the highest-risk phase. The closure-to-parameter conversion must be exact. Pay special attention to:\n- All eight closure-captured variables from REQ-MTGL-12 are correctly threaded\n- Generator yield and return types match exactly\n- No circular dependency between session-loop.ts and orchestrator.ts\n- `MEETING_GREETING_PROMPT` moves to session-loop.ts with re-export from orchestrator\n- No `as any` or `as unknown` casts introduced\n\nAfter completing all steps, run:\n```bash\nbun run typecheck\nbun run lint\nbun test\n```\n\nAll must pass. Zero test file modifications should be needed (REQ-MTGL-16). If tests fail, the extraction changed behavior and must be corrected. Commit the Phase 3 changes as a single commit."
dependencies:
  - commission-Thorne-20260319-213159
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-20T04:32:10.043Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T04:37:33.832Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-20T04:54:46.613Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-20T04:54:46.614Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
