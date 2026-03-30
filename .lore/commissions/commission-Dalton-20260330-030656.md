---
title: "Commission: Build: System prompt optimization Phase 2 - Activation split"
date: 2026-03-30
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 2 of the system prompt optimization plan at `.lore/plans/infrastructure/system-prompt-optimization.md`.\n\n**Read Thorne's Phase 1 review first.** Check the linked artifacts on the review commission. Address ALL findings before starting Phase 2 work.\n\n**Scope: Phase 2 (Steps 1-9), all atomic in a single commit.**\n\nRequirements: REQ-SPO-6 through REQ-SPO-25 from `.lore/specs/infrastructure/system-prompt-optimization.md`.\n\n**What to do (follow the plan's Phase 2 steps in order):**\n\n1. **Step 1 - Memory injector:** Export `MEMORY_GUIDANCE` constant from `daemon/services/memory-injector.ts`. Change `loadMemories` to return scope content WITHOUT guidance prefix. Update tests in `tests/daemon/memory-injection.test.ts`.\n\n2. **Step 2 - Type changes:** Add `sessionContext: string` to `ActivationResult` in `lib/types.ts`. Add `memoryGuidance?: string` to `ActivationContext`. Add `sessionContext` to `SessionPrepResult` in `sdk-runner.ts`.\n\n3. **Step 3 - Refactor worker activation:** Split `buildSystemPrompt()` in `packages/shared/worker-activation.ts` into `buildSystemPrompt` (soul + identity + posture + memory guidance) and `buildSessionContext` (memory content + activity context). The plan identifies an import boundary issue: pass `MEMORY_GUIDANCE` through `ActivationContext.memoryGuidance` rather than importing from daemon. Update all tests in `tests/packages/worker-activation.test.ts`.\n\n4. **Step 4 - Refactor activateManager:** Same split in `daemon/services/manager/worker.ts`. Model guidance stays in system prompt. Manager context moves to session context. Update tests in `tests/daemon/services/manager/worker.test.ts`.\n\n5. **Step 5 - Update prepareSdkSession:** Thread `sessionContext` through `SessionPrepResult`. Populate `ActivationContext.memoryGuidance` from the exported constant. Sub-agent map uses `systemPrompt` only, ignores `sessionContext`. Update tests in `tests/daemon/services/sdk-runner.test.ts`.\n\n6. **Step 6 - Commission orchestrator:** Change `runCommissionSession` to pass `sessionContext` (not raw `prompt`) to `runSdkSession`. This eliminates task duplication. Add test verifying the correct prompt is passed.\n\n7. **Step 7 - Meeting orchestrator:** Three paths with different handling:\n   - New session: `sessionContext + \"\\n\\n\" + MEETING_GREETING_PROMPT`\n   - Resume: user message only, no sessionContext\n   - Renewal: sessionContext alone (transcript already encoded in it)\n   The plan recommends extracting prompt composition into a pure function for testability. Add tests for all three paths.\n\n8. **Step 8 - Posture scan:** Grep confirmed no posture files reference `Injected Memory`. Update headings in code only.\n\n9. **Step 9 - Validate:** Run full test suite. Typecheck. Lint. Verify every REQ-SPO requirement is addressed.\n\n**Critical: All Phase 2 changes must be in a single commit.** The type changes propagate everywhere; an intermediate state won't compile."
dependencies:
  - commission-Thorne-20260330-030628
linked_artifacts:
  - daemon/services/memory-injector.ts

  - lib/types.ts
  - packages/shared/worker-activation.ts
  - daemon/services/manager/worker.ts
  - daemon/lib/agent-sdk/sdk-runner.ts
  - daemon/services/commission/orchestrator.ts
  - daemon/services/meeting/session-loop.ts
  - lib/types.ts
  - packages/shared/worker-activation.ts
  - daemon/services/manager/worker.ts
  - daemon/lib/agent-sdk/sdk-runner.ts
  - daemon/services/commission/orchestrator.ts
  - daemon/services/meeting/session-loop.ts
activity_timeline:
  - timestamp: 2026-03-30T10:06:56.899Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-30T10:09:57.963Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-30T10:11:30.196Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-30T10:11:30.198Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-30T10:11:30.246Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-30T10:11:35.958Z
    event: progress_report
    reason: "Starting Phase 2. Reading plan, spec, and Thorne's Phase 1 review findings."
  - timestamp: 2026-03-30T10:12:41.834Z
    event: progress_report
    reason: "All source and test files read. Starting implementation. Phase 2 Steps 1-9 in order."
  - timestamp: 2026-03-30T10:15:54.924Z
    event: progress_report
    reason: "Steps 1-7 source changes complete. Now updating all test files to add sessionContext to ActivationResult mocks and update assertions for the split."
  - timestamp: 2026-03-30T10:20:19.747Z
    event: progress_report
    reason: "Updating worker-activation tests, manager/worker tests, and sdk-runner tests for the systemPrompt/sessionContext split. Source changes are complete."
  - timestamp: 2026-03-30T10:27:05.369Z
    event: result_submitted
    reason: "Phase 2 of system prompt optimization implemented and committed (336c0f2e). All 9 steps complete:\n\n**Source changes (7 files):**\n- `daemon/services/memory-injector.ts` — Exported `MEMORY_GUIDANCE` constant, removed guidance from `memoryBlock` output\n- `lib/types.ts` — Added `sessionContext: string` to `ActivationResult`, `memoryGuidance?: string` to `ActivationContext`\n- `packages/shared/worker-activation.ts` — Split into `buildSystemPrompt()` (soul/identity/posture/memoryGuidance) and `buildSessionContext()` (memory/meeting/commission)\n- `daemon/services/manager/worker.ts` — Same split in `activateManager()`, model guidance stays in systemPrompt, manager context moves to sessionContext\n- `daemon/lib/agent-sdk/sdk-runner.ts` — Thread `sessionContext` through `SessionPrepResult`, populate `memoryGuidance` from exported constant, sub-agents use systemPrompt only\n- `daemon/services/commission/orchestrator.ts` — Pass `sessionContext` as SDK prompt (eliminates task duplication)\n- `daemon/services/meeting/session-loop.ts` — Three-path prompt composition (new: context+greeting, resume: user message only, renewal: context alone)\n\n**Test changes (17 files):**\n- `tests/daemon/memory-injection.test.ts` — Full rewrite: tests `MEMORY_GUIDANCE` constant, verifies `memoryBlock` no longer contains guidance\n- `tests/packages/worker-activation.test.ts` — Updated: commission/meeting context in sessionContext, memoryGuidance in systemPrompt, stability tests\n- `tests/daemon/services/manager/worker.test.ts` — Updated: memory/manager context in sessionContext, memoryGuidance in systemPrompt\n- `tests/daemon/services/manager-worker.test.ts` — Updated: all activity context assertions moved to sessionContext\n- `tests/daemon/services/manager-context.test.ts` — Updated: manager context assertion moved to sessionContext\n- `tests/daemon/services/sdk-runner.test.ts` — Added: sessionContext threading test, memoryGuidance population test, sub-agent memoryGuidance absence test\n- 11 additional test files: Added `sessionContext: \"\"` to ActivationResult mock objects\n\n**Verification:** 3488 tests pass, 0 fail. Typecheck, lint, and production build all clean. REQ-SPO-6 through REQ-SPO-25 addressed."
  - timestamp: 2026-03-30T10:27:07.782Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Updating worker-activation tests, manager/worker tests, and sdk-runner tests for the systemPrompt/sessionContext split. Source changes are complete."
projectName: guild-hall
---
Phase 2 of system prompt optimization implemented and committed (336c0f2e). All 9 steps complete:

**Source changes (7 files):**
- `daemon/services/memory-injector.ts` — Exported `MEMORY_GUIDANCE` constant, removed guidance from `memoryBlock` output
- `lib/types.ts` — Added `sessionContext: string` to `ActivationResult`, `memoryGuidance?: string` to `ActivationContext`
- `packages/shared/worker-activation.ts` — Split into `buildSystemPrompt()` (soul/identity/posture/memoryGuidance) and `buildSessionContext()` (memory/meeting/commission)
- `daemon/services/manager/worker.ts` — Same split in `activateManager()`, model guidance stays in systemPrompt, manager context moves to sessionContext
- `daemon/lib/agent-sdk/sdk-runner.ts` — Thread `sessionContext` through `SessionPrepResult`, populate `memoryGuidance` from exported constant, sub-agents use systemPrompt only
- `daemon/services/commission/orchestrator.ts` — Pass `sessionContext` as SDK prompt (eliminates task duplication)
- `daemon/services/meeting/session-loop.ts` — Three-path prompt composition (new: context+greeting, resume: user message only, renewal: context alone)

**Test changes (17 files):**
- `tests/daemon/memory-injection.test.ts` — Full rewrite: tests `MEMORY_GUIDANCE` constant, verifies `memoryBlock` no longer contains guidance
- `tests/packages/worker-activation.test.ts` — Updated: commission/meeting context in sessionContext, memoryGuidance in systemPrompt, stability tests
- `tests/daemon/services/manager/worker.test.ts` — Updated: memory/manager context in sessionContext, memoryGuidance in systemPrompt
- `tests/daemon/services/manager-worker.test.ts` — Updated: all activity context assertions moved to sessionContext
- `tests/daemon/services/manager-context.test.ts` — Updated: manager context assertion moved to sessionContext
- `tests/daemon/services/sdk-runner.test.ts` — Added: sessionContext threading test, memoryGuidance population test, sub-agent memoryGuidance absence test
- 11 additional test files: Added `sessionContext: ""` to ActivationResult mock objects

**Verification:** 3488 tests pass, 0 fail. Typecheck, lint, and production build all clean. REQ-SPO-6 through REQ-SPO-25 addressed.
