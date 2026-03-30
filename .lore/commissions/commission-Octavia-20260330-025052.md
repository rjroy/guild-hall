---
title: "Commission: Plan: System prompt optimization implementation"
date: 2026-03-30
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Prepare an implementation plan for `.lore/specs/infrastructure/system-prompt-optimization.md`. Write the plan to `.lore/plans/infrastructure/system-prompt-optimization.md`.\n\nThe spec has 25 requirements (REQ-SPO-1 through REQ-SPO-25) covering two changes:\n1. Remove memory injection from sub-agent activation\n2. Split ActivationResult into stable system prompt + session-specific first user message\n\n**Key code to read before planning:**\n- `packages/shared/worker-activation.ts` — current `buildSystemPrompt()` and `activateWorkerWithSharedPattern()`\n- `daemon/lib/agent-sdk/sdk-runner.ts` — `prepareSdkSession()`, sub-agent map (lines 354-417), SDK query (line 484+)\n- `daemon/services/manager/worker.ts` — `activateManager()`, `buildModelGuidance()`\n- `lib/types.ts` — `ActivationResult`, `ActivationContext`, `SessionPrepResult`\n- `daemon/services/memory-injector.ts` — `loadMemories`, `MEMORY_GUIDANCE`\n- `daemon/services/commission/orchestrator.ts` — how commissions pass task prompt and call `runSdkSession`\n- `daemon/services/meeting/orchestrator.ts` — `acceptMeetingRequest`, `sendMessage` (resume), session renewal\n- `daemon/services/meeting/session-loop.ts` — `startSession`, `MEETING_GREETING_PROMPT`\n- All test files for the above modules\n\n**Planning requirements:**\n1. Read every referenced source file to understand current behavior.\n2. Break work into phases with clear deliverables. Consider that the sub-agent change (Decision 1) is independent and lower risk than the activation split (Decision 2). They could be separate phases.\n3. Map each REQ to a specific phase.\n4. The meeting orchestrator has three paths (new, resume, renewal) that each need different handling per REQ-SPO-21/22/23. Make sure the plan accounts for all three.\n5. Include test strategy per phase. Existing test updates are as important as new tests.\n6. Call out any spec gaps or ambiguities discovered while reading the code.\n7. Grep for `Injected Memory` across posture files as the spec's migration section mentions.\n\nSet plan status to `draft`."
dependencies: []
linked_artifacts:
  - .lore/plans/infrastructure/system-prompt-optimization.md

resource_overrides:
  model: opus

activity_timeline:
  - timestamp: 2026-03-30T09:50:52.330Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-30T09:50:52.331Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-30T09:50:52.379Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-30T09:50:59.353Z
    event: progress_report
    reason: "Starting plan preparation. Reading the spec and all referenced source files to understand current behavior before drafting."
  - timestamp: 2026-03-30T09:52:05.232Z
    event: progress_report
    reason: "All source files and tests read. Now checking existing plan conventions and writing the implementation plan."
  - timestamp: 2026-03-30T09:58:18.033Z
    event: progress_report
    reason: "Plan drafted and saved to .lore/plans/infrastructure/system-prompt-optimization.md. Running fresh-eyes review via plan-reviewer agent."
  - timestamp: 2026-03-30T10:03:54.139Z
    event: result_submitted
    reason: "Wrote implementation plan for system-prompt-optimization spec (25 REQs) to `.lore/plans/infrastructure/system-prompt-optimization.md`.\n\n**Two phases:**\n- **Phase 1** (5 REQs): Remove memory injection from sub-agent activation. Low risk, independent. Deletes `Promise.allSettled` memory loading from `prepareSdkSession` sub-agent map.\n- **Phase 2** (20 REQs, 9 steps): Split `ActivationResult` into stable system prompt + session-specific `sessionContext`. Covers type changes, `buildSystemPrompt`/`buildSessionContext` split, `MEMORY_GUIDANCE` DI via `ActivationContext.memoryGuidance`, `prepareSdkSession` pipeline update, meeting orchestrator (all three paths: new/resume/renewal), commission orchestrator, manager activation, and migration cleanup.\n\n**Key decisions captured:**\n- Package boundary resolved via `ActivationContext.memoryGuidance` DI field (daemon populates, packages/shared reads)\n- Renewal path uses `sessionContext` alone (not `sessionContext + prompt`) to avoid transcript doubling\n- `loadMemories` returns scope content without `MEMORY_GUIDANCE` prefix; guidance exported separately\n- Commission orchestrator gets explicit test coverage (spec requirement, not just indirect verification)\n\n**Spec gaps documented:** meetingContext.agenda naming confusion, loadMemories empty-memory behavior after guidance extraction, heading structure for sessionContext, commission prompt composition ambiguity.\n\nPlan status: `draft`."
  - timestamp: 2026-03-30T10:03:57.820Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Plan drafted and saved to .lore/plans/infrastructure/system-prompt-optimization.md. Running fresh-eyes review via plan-reviewer agent."
projectName: guild-hall
---
Wrote implementation plan for system-prompt-optimization spec (25 REQs) to `.lore/plans/infrastructure/system-prompt-optimization.md`.

**Two phases:**
- **Phase 1** (5 REQs): Remove memory injection from sub-agent activation. Low risk, independent. Deletes `Promise.allSettled` memory loading from `prepareSdkSession` sub-agent map.
- **Phase 2** (20 REQs, 9 steps): Split `ActivationResult` into stable system prompt + session-specific `sessionContext`. Covers type changes, `buildSystemPrompt`/`buildSessionContext` split, `MEMORY_GUIDANCE` DI via `ActivationContext.memoryGuidance`, `prepareSdkSession` pipeline update, meeting orchestrator (all three paths: new/resume/renewal), commission orchestrator, manager activation, and migration cleanup.

**Key decisions captured:**
- Package boundary resolved via `ActivationContext.memoryGuidance` DI field (daemon populates, packages/shared reads)
- Renewal path uses `sessionContext` alone (not `sessionContext + prompt`) to avoid transcript doubling
- `loadMemories` returns scope content without `MEMORY_GUIDANCE` prefix; guidance exported separately
- Commission orchestrator gets explicit test coverage (spec requirement, not just indirect verification)

**Spec gaps documented:** meetingContext.agenda naming confusion, loadMemories empty-memory behavior after guidance extraction, heading structure for sessionContext, commission prompt composition ambiguity.

Plan status: `draft`.
