---
title: "Commission: Build: System prompt optimization Phase 1 - Remove sub-agent memory injection"
date: 2026-03-30
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 1 of the system prompt optimization plan at `.lore/plans/infrastructure/system-prompt-optimization.md`.\n\n**Scope: Phase 1 only (Step 1 + Phase 1 Tests)**\n\nRequirements: REQ-SPO-1 through REQ-SPO-5 from `.lore/specs/infrastructure/system-prompt-optimization.md`.\n\n**What to do:**\n1. Read the plan's Phase 1 section thoroughly. It specifies exact code changes and test updates.\n2. In `daemon/lib/agent-sdk/sdk-runner.ts`, remove the `Promise.allSettled` memory loading block for sub-agents (lines 364-371). Set `injectedMemory: \"\"` directly on sub-agent `ActivationContext` instead of using loaded memory.\n3. Simplify the sub-agent loop: no `memoryResults` array, no memory failure check. Keep the `try/catch` around activation.\n4. Update tests in `tests/daemon/services/sdk-runner.test.ts`:\n   - Reverse the test at line 1261 that verifies sub-agents receive memory content. It should now verify they DON'T.\n   - Update the failing-sub-agent test at line 1217 to use activation failure instead of memory failure.\n   - Add new tests: `loadMemories` called exactly once (for calling worker), sub-agent context has empty memory but retains soul/identity/posture/model.\n5. Run the full test suite. All tests must pass.\n\n**Do not touch Phase 2.** Do not change `ActivationResult`, `buildSystemPrompt`, or any orchestrator code."
dependencies: []
linked_artifacts:
  - daemon/lib/agent-sdk/sdk-runner.ts

  - tests/daemon/services/sdk-runner.test.ts
  - tests/daemon/services/sdk-runner.test.ts
activity_timeline:
  - timestamp: 2026-03-30T10:06:19.913Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-30T10:07:12.538Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-30T10:07:12.586Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-30T10:07:37.742Z
    event: progress_report
    reason: "Read the plan and source files. Starting implementation of Phase 1: removing sub-agent memory loading from sdk-runner.ts."
  - timestamp: 2026-03-30T10:09:54.297Z
    event: result_submitted
    reason: "Phase 1 implemented. All 3480 tests pass, 0 failures.\n\n**Changes:**\n\n1. **`daemon/lib/agent-sdk/sdk-runner.ts`**: Removed the `Promise.allSettled` memory loading block for sub-agents (was lines 364-371). The sub-agent loop now iterates `otherWorkerPackages` directly with `for...of`, constructing each `ActivationContext` with `injectedMemory: \"\"`. No `memoryResults` array, no memory failure check. The `try/catch` around activation remains for graceful degradation.\n\n2. **`tests/daemon/services/sdk-runner.test.ts`**: \n   - Reversed \"agent with memory content has prompt containing memory\" → now \"sub-agent receives empty memory regardless of loadMemories (REQ-SPO-1, REQ-SPO-2)\" verifying `injectedMemory` is `\"\"`.\n   - Updated \"failing sub-agent is excluded\" to use activation failure instead of memory failure.\n   - Updated \"all sub-agents fail gracefully\" to use activation failure instead of memory failure.\n   - Added \"loadMemories called exactly once for calling worker, not for sub-agents (REQ-SPO-1)\" verifying only one `loadMemories` call.\n   - Added \"sub-agent context has empty memory but retains soul, identity, posture, model (REQ-SPO-3)\" verifying all non-memory fields are preserved.\n\n**Requirements addressed:** REQ-SPO-1 (no sub-agent memory loading), REQ-SPO-2 (empty injectedMemory), REQ-SPO-3 (soul/identity/posture/model retained), REQ-SPO-4 (buildSubAgentDescription unaffected, no changes needed), REQ-SPO-5 (clarification only, no code change)."
  - timestamp: 2026-03-30T10:09:57.662Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Read the plan and source files. Starting implementation of Phase 1: removing sub-agent memory loading from sdk-runner.ts."
projectName: guild-hall
---
Phase 1 implemented. All 3480 tests pass, 0 failures.

**Changes:**

1. **`daemon/lib/agent-sdk/sdk-runner.ts`**: Removed the `Promise.allSettled` memory loading block for sub-agents (was lines 364-371). The sub-agent loop now iterates `otherWorkerPackages` directly with `for...of`, constructing each `ActivationContext` with `injectedMemory: ""`. No `memoryResults` array, no memory failure check. The `try/catch` around activation remains for graceful degradation.

2. **`tests/daemon/services/sdk-runner.test.ts`**: 
   - Reversed "agent with memory content has prompt containing memory" → now "sub-agent receives empty memory regardless of loadMemories (REQ-SPO-1, REQ-SPO-2)" verifying `injectedMemory` is `""`.
   - Updated "failing sub-agent is excluded" to use activation failure instead of memory failure.
   - Updated "all sub-agents fail gracefully" to use activation failure instead of memory failure.
   - Added "loadMemories called exactly once for calling worker, not for sub-agents (REQ-SPO-1)" verifying only one `loadMemories` call.
   - Added "sub-agent context has empty memory but retains soul, identity, posture, model (REQ-SPO-3)" verifying all non-memory fields are preserved.

**Requirements addressed:** REQ-SPO-1 (no sub-agent memory loading), REQ-SPO-2 (empty injectedMemory), REQ-SPO-3 (soul/identity/posture/model retained), REQ-SPO-4 (buildSubAgentDescription unaffected, no changes needed), REQ-SPO-5 (clarification only, no code change).
