---
title: "Commission: Build: System prompt optimization Phase 2 - Activation split"
date: 2026-03-30
status: blocked
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 2 of the system prompt optimization plan at `.lore/plans/infrastructure/system-prompt-optimization.md`.\n\n**Read Thorne's Phase 1 review first.** Check the linked artifacts on the review commission. Address ALL findings before starting Phase 2 work.\n\n**Scope: Phase 2 (Steps 1-9), all atomic in a single commit.**\n\nRequirements: REQ-SPO-6 through REQ-SPO-25 from `.lore/specs/infrastructure/system-prompt-optimization.md`.\n\n**What to do (follow the plan's Phase 2 steps in order):**\n\n1. **Step 1 - Memory injector:** Export `MEMORY_GUIDANCE` constant from `daemon/services/memory-injector.ts`. Change `loadMemories` to return scope content WITHOUT guidance prefix. Update tests in `tests/daemon/memory-injection.test.ts`.\n\n2. **Step 2 - Type changes:** Add `sessionContext: string` to `ActivationResult` in `lib/types.ts`. Add `memoryGuidance?: string` to `ActivationContext`. Add `sessionContext` to `SessionPrepResult` in `sdk-runner.ts`.\n\n3. **Step 3 - Refactor worker activation:** Split `buildSystemPrompt()` in `packages/shared/worker-activation.ts` into `buildSystemPrompt` (soul + identity + posture + memory guidance) and `buildSessionContext` (memory content + activity context). The plan identifies an import boundary issue: pass `MEMORY_GUIDANCE` through `ActivationContext.memoryGuidance` rather than importing from daemon. Update all tests in `tests/packages/worker-activation.test.ts`.\n\n4. **Step 4 - Refactor activateManager:** Same split in `daemon/services/manager/worker.ts`. Model guidance stays in system prompt. Manager context moves to session context. Update tests in `tests/daemon/services/manager/worker.test.ts`.\n\n5. **Step 5 - Update prepareSdkSession:** Thread `sessionContext` through `SessionPrepResult`. Populate `ActivationContext.memoryGuidance` from the exported constant. Sub-agent map uses `systemPrompt` only, ignores `sessionContext`. Update tests in `tests/daemon/services/sdk-runner.test.ts`.\n\n6. **Step 6 - Commission orchestrator:** Change `runCommissionSession` to pass `sessionContext` (not raw `prompt`) to `runSdkSession`. This eliminates task duplication. Add test verifying the correct prompt is passed.\n\n7. **Step 7 - Meeting orchestrator:** Three paths with different handling:\n   - New session: `sessionContext + \"\\n\\n\" + MEETING_GREETING_PROMPT`\n   - Resume: user message only, no sessionContext\n   - Renewal: sessionContext alone (transcript already encoded in it)\n   The plan recommends extracting prompt composition into a pure function for testability. Add tests for all three paths.\n\n8. **Step 8 - Posture scan:** Grep confirmed no posture files reference `Injected Memory`. Update headings in code only.\n\n9. **Step 9 - Validate:** Run full test suite. Typecheck. Lint. Verify every REQ-SPO requirement is addressed.\n\n**Critical: All Phase 2 changes must be in a single commit.** The type changes propagate everywhere; an intermediate state won't compile."
dependencies:
  - commission-Thorne-20260330-030628
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-30T10:06:56.899Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-30T10:09:57.963Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
