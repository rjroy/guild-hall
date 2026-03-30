---
title: "Commission: Plan: System prompt optimization implementation"
date: 2026-03-30
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Prepare an implementation plan for `.lore/specs/infrastructure/system-prompt-optimization.md`. Write the plan to `.lore/plans/infrastructure/system-prompt-optimization.md`.\n\nThe spec has 25 requirements (REQ-SPO-1 through REQ-SPO-25) covering two changes:\n1. Remove memory injection from sub-agent activation\n2. Split ActivationResult into stable system prompt + session-specific first user message\n\n**Key code to read before planning:**\n- `packages/shared/worker-activation.ts` — current `buildSystemPrompt()` and `activateWorkerWithSharedPattern()`\n- `daemon/lib/agent-sdk/sdk-runner.ts` — `prepareSdkSession()`, sub-agent map (lines 354-417), SDK query (line 484+)\n- `daemon/services/manager/worker.ts` — `activateManager()`, `buildModelGuidance()`\n- `lib/types.ts` — `ActivationResult`, `ActivationContext`, `SessionPrepResult`\n- `daemon/services/memory-injector.ts` — `loadMemories`, `MEMORY_GUIDANCE`\n- `daemon/services/commission/orchestrator.ts` — how commissions pass task prompt and call `runSdkSession`\n- `daemon/services/meeting/orchestrator.ts` — `acceptMeetingRequest`, `sendMessage` (resume), session renewal\n- `daemon/services/meeting/session-loop.ts` — `startSession`, `MEETING_GREETING_PROMPT`\n- All test files for the above modules\n\n**Planning requirements:**\n1. Read every referenced source file to understand current behavior.\n2. Break work into phases with clear deliverables. Consider that the sub-agent change (Decision 1) is independent and lower risk than the activation split (Decision 2). They could be separate phases.\n3. Map each REQ to a specific phase.\n4. The meeting orchestrator has three paths (new, resume, renewal) that each need different handling per REQ-SPO-21/22/23. Make sure the plan accounts for all three.\n5. Include test strategy per phase. Existing test updates are as important as new tests.\n6. Call out any spec gaps or ambiguities discovered while reading the code.\n7. Grep for `Injected Memory` across posture files as the spec's migration section mentions.\n\nSet plan status to `draft`."
dependencies: []
linked_artifacts: []

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
current_progress: ""
projectName: guild-hall
---
