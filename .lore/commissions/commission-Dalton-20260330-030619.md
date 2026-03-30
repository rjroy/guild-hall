---
title: "Commission: Build: System prompt optimization Phase 1 - Remove sub-agent memory injection"
date: 2026-03-30
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 1 of the system prompt optimization plan at `.lore/plans/infrastructure/system-prompt-optimization.md`.\n\n**Scope: Phase 1 only (Step 1 + Phase 1 Tests)**\n\nRequirements: REQ-SPO-1 through REQ-SPO-5 from `.lore/specs/infrastructure/system-prompt-optimization.md`.\n\n**What to do:**\n1. Read the plan's Phase 1 section thoroughly. It specifies exact code changes and test updates.\n2. In `daemon/lib/agent-sdk/sdk-runner.ts`, remove the `Promise.allSettled` memory loading block for sub-agents (lines 364-371). Set `injectedMemory: \"\"` directly on sub-agent `ActivationContext` instead of using loaded memory.\n3. Simplify the sub-agent loop: no `memoryResults` array, no memory failure check. Keep the `try/catch` around activation.\n4. Update tests in `tests/daemon/services/sdk-runner.test.ts`:\n   - Reverse the test at line 1261 that verifies sub-agents receive memory content. It should now verify they DON'T.\n   - Update the failing-sub-agent test at line 1217 to use activation failure instead of memory failure.\n   - Add new tests: `loadMemories` called exactly once (for calling worker), sub-agent context has empty memory but retains soul/identity/posture/model.\n5. Run the full test suite. All tests must pass.\n\n**Do not touch Phase 2.** Do not change `ActivationResult`, `buildSystemPrompt`, or any orchestrator code."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-30T10:06:19.913Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-30T10:07:12.538Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
