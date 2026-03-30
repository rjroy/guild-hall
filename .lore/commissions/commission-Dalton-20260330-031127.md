---
title: "Commission: Fix: System prompt optimization Phase 2 review findings"
date: 2026-03-30
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Read Thorne's Phase 2 review findings. The review commission is `commission-Thorne-20260330-030708`. Check its linked artifacts for the review report.\n\nAddress ALL findings from the review. Every item Thorne flagged gets fixed, no exceptions. This includes test gaps, missed requirements, naming issues, edge cases, documentation inconsistencies, and anything else surfaced.\n\n**Context:**\n- Spec: `.lore/specs/infrastructure/system-prompt-optimization.md`\n- Plan: `.lore/plans/infrastructure/system-prompt-optimization.md`\n\nRun the full test suite after all fixes. Typecheck, lint, and build must all pass."
dependencies:
  - commission-Thorne-20260330-030708
linked_artifacts:
  - packages/shared/worker-activation.ts

  - daemon/services/manager/worker.ts
  - daemon/lib/agent-sdk/sdk-runner.ts
  - daemon/services/meeting/session-loop.ts
  - tests/packages/worker-activation.test.ts
  - tests/daemon/services/manager/worker.test.ts
  - tests/daemon/services/sdk-runner.test.ts
  - tests/daemon/services/meeting/session-loop.test.ts
  - tests/daemon/services/commission/orchestrator.test.ts
  - daemon/services/manager/worker.ts
  - daemon/lib/agent-sdk/sdk-runner.ts
  - daemon/services/meeting/session-loop.ts
  - tests/packages/worker-activation.test.ts
  - tests/daemon/services/manager/worker.test.ts
  - tests/daemon/services/sdk-runner.test.ts
  - tests/daemon/services/meeting/session-loop.test.ts
  - tests/daemon/services/commission/orchestrator.test.ts
activity_timeline:
  - timestamp: 2026-03-30T10:11:27.734Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-30T10:11:30.196Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-30T10:30:55.964Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-30T10:30:55.967Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-30T10:30:56.012Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-30T10:31:02.252Z
    event: progress_report
    reason: "Reading Thorne's Phase 2 review findings and gathering context."
  - timestamp: 2026-03-30T10:31:45.165Z
    event: progress_report
    reason: "All 6 findings understood. Starting fixes: WARN-1 (duplicate heading), WARN-2 (sub-agent memory guidance), WARN-3 (missing orchestrator tests), INFO-1/2/3 (test gaps)."
  - timestamp: 2026-03-30T10:34:44.463Z
    event: progress_report
    reason: "All 6 findings addressed in code. Running targeted tests to verify before full suite."
  - timestamp: 2026-03-30T10:36:03.622Z
    event: result_submitted
    reason: "# Phase 2 Review Fixes Complete\n\nAll 6 findings from Thorne's review addressed:\n\n## WARN-1: Duplicate heading (fixed)\nRenamed `# Injected Memory` → `# Memory` in system prompt sections of both `worker-activation.ts` and `manager/worker.ts`. Session context keeps `# Injected Memory`. The model now sees distinct headings for guidance vs content.\n\n## WARN-2: Sub-agent memory guidance (fixed)\nAdded `memoryGuidance: MEMORY_GUIDANCE` to sub-agent `ActivationContext` in `sdk-runner.ts:371`, matching REQ-SPO-24 literally. Updated existing test assertion from `toBeUndefined()` to verify the guidance is present.\n\n## WARN-3: Missing orchestrator tests (fixed)\n- Extracted `composeMeetingPrompt()` as an exported pure function from `session-loop.ts` for testability, replacing inline logic.\n- Created `tests/daemon/services/meeting/session-loop.test.ts` with 5 tests covering: new session with context, new session without context, renewal with context, renewal fallback, and resume path.\n- Added `lastPrompt` capture to the commission orchestrator test mock and a test verifying `sessionContext` is passed as the prompt to `runSdkSession`.\n\n## INFO-1: Manager session context ordering (fixed)\nAdded ordering assertion test verifying memory < meeting < commission < manager in `sessionContext`.\n\n## INFO-2: Manager exclusion assertions (fixed)\nAdded test verifying meeting and commission context are absent from `systemPrompt` in the manager test.\n\n## INFO-3: Commission dependencies test (fixed)\nAdded test with non-empty dependencies verifying they appear in `sessionContext`.\n\n## Verification\n- 3497 tests pass, 0 failures\n- Typecheck clean\n- Lint clean\n- Build clean"
  - timestamp: 2026-03-30T10:36:06.608Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All 6 findings addressed in code. Running targeted tests to verify before full suite."
projectName: guild-hall
---
# Phase 2 Review Fixes Complete

All 6 findings from Thorne's review addressed:

## WARN-1: Duplicate heading (fixed)
Renamed `# Injected Memory` → `# Memory` in system prompt sections of both `worker-activation.ts` and `manager/worker.ts`. Session context keeps `# Injected Memory`. The model now sees distinct headings for guidance vs content.

## WARN-2: Sub-agent memory guidance (fixed)
Added `memoryGuidance: MEMORY_GUIDANCE` to sub-agent `ActivationContext` in `sdk-runner.ts:371`, matching REQ-SPO-24 literally. Updated existing test assertion from `toBeUndefined()` to verify the guidance is present.

## WARN-3: Missing orchestrator tests (fixed)
- Extracted `composeMeetingPrompt()` as an exported pure function from `session-loop.ts` for testability, replacing inline logic.
- Created `tests/daemon/services/meeting/session-loop.test.ts` with 5 tests covering: new session with context, new session without context, renewal with context, renewal fallback, and resume path.
- Added `lastPrompt` capture to the commission orchestrator test mock and a test verifying `sessionContext` is passed as the prompt to `runSdkSession`.

## INFO-1: Manager session context ordering (fixed)
Added ordering assertion test verifying memory < meeting < commission < manager in `sessionContext`.

## INFO-2: Manager exclusion assertions (fixed)
Added test verifying meeting and commission context are absent from `systemPrompt` in the manager test.

## INFO-3: Commission dependencies test (fixed)
Added test with non-empty dependencies verifying they appear in `sessionContext`.

## Verification
- 3497 tests pass, 0 failures
- Typecheck clean
- Lint clean
- Build clean
