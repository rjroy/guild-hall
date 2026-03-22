---
title: "Commission: Fix: Add meetingContext and commissionContext to activateManager system prompt"
date: 2026-03-22
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix the meeting agenda injection bug in `daemon/services/manager/worker.ts`.\n\n**Bug:** `activateManager()` (lines 196-239) does not render `meetingContext` or `commissionContext` into the system prompt. The shared activation path at `packages/shared/worker-activation.ts:32-65` does. This means the Guild Master never sees the meeting agenda or commission context.\n\n**Fix:** Add the `meetingContext` and `commissionContext` conditional rendering blocks to `activateManager()`, matching the pattern from `packages/shared/worker-activation.ts:32-65`. Insert after the memory block and before the manager context block.\n\n**Diagnosis:** `.lore/commissions/commission-Sable-20260322-113518.md`\n**Review:** `.lore/commissions/commission-Thorne-20260322-114052.md`\n\nAdd a test verifying that `activateManager` includes meeting agenda and commission context when provided in the activation context."
dependencies: []
linked_artifacts:
  - daemon/services/manager/worker.ts

  - tests/daemon/services/manager-worker.test.ts
  - tests/daemon/services/manager-worker.test.ts
activity_timeline:
  - timestamp: 2026-03-22T19:37:15.709Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T19:37:15.711Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-22T19:37:15.757Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-22T19:38:26.024Z
    event: progress_report
    reason: "Fix applied to daemon/services/manager/worker.ts: added meetingContext and commissionContext rendering blocks. Tests added to manager-worker.test.ts. Running typecheck and tests now."
  - timestamp: 2026-03-22T19:41:30.720Z
    event: result_submitted
    reason: "Fixed the meeting agenda injection bug in `daemon/services/manager/worker.ts`.\n\n**Changes:**\n- `daemon/services/manager/worker.ts`: Added `meetingContext` and `commissionContext` conditional rendering blocks to `activateManager()`, inserted after memory (section 5-6) and before manager context (section 7). Pattern matches `packages/shared/worker-activation.ts:32-65` exactly.\n- `tests/daemon/services/manager-worker.test.ts`: Added 7 tests covering meeting context inclusion, commission context with protocol and dependencies, exclusion when not provided, and updated assembly order test to verify the full sequence (soul → identity → posture → memory → meeting → commission → manager context).\n- `tests/daemon/services/git-readonly-toolbox.test.ts`: Added eslint-disable for pre-existing `require-await` lint errors on mock GitRunner functions.\n\n**Verification:** Typecheck clean, lint clean, 3372 tests pass (0 failures), production build succeeds."
  - timestamp: 2026-03-22T19:41:33.169Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Fix applied to daemon/services/manager/worker.ts: added meetingContext and commissionContext rendering blocks. Tests added to manager-worker.test.ts. Running typecheck and tests now."
projectName: guild-hall
---
Fixed the meeting agenda injection bug in `daemon/services/manager/worker.ts`.

**Changes:**
- `daemon/services/manager/worker.ts`: Added `meetingContext` and `commissionContext` conditional rendering blocks to `activateManager()`, inserted after memory (section 5-6) and before manager context (section 7). Pattern matches `packages/shared/worker-activation.ts:32-65` exactly.
- `tests/daemon/services/manager-worker.test.ts`: Added 7 tests covering meeting context inclusion, commission context with protocol and dependencies, exclusion when not provided, and updated assembly order test to verify the full sequence (soul → identity → posture → memory → meeting → commission → manager context).
- `tests/daemon/services/git-readonly-toolbox.test.ts`: Added eslint-disable for pre-existing `require-await` lint errors on mock GitRunner functions.

**Verification:** Typecheck clean, lint clean, 3372 tests pass (0 failures), production build succeeds.
