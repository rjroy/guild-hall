---
title: "Commission: Worker-to-Worker Communication: Edge Cases (Step 7)"
date: 2026-03-07
status: completed
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Step 7 from the plan at `.lore/plans/worker-communication.md` for the worker-to-worker communication feature.\n\nRead the full plan first. Then read the spec at `.lore/specs/worker-communication.md` for requirement details.\n\n**Context:** Steps 1-6 are complete and reviewed. The foundation (types, lifecycle, toolboxes, mail record ops), orchestrator (sleep flow, mail reader activation, wake flow), and three rounds of defect fixes are all in place. The mail orchestrator was extracted to `daemon/services/mail/orchestrator.ts`.\n\n**What you're building:**\n\n**Step 7: Cancel/Abandon + Crash Recovery**\n\n**7a. Cancel/abandon sleeping commissions (REQ-MAIL-22):**\nExtend the existing cancel/abandon flow to handle sleeping commissions. Branch on the mail file's status field:\n\n- **Mail status `sent`** (reader not yet started): Dequeue if queued behind concurrency cap. Transition to cancelled/abandoned. Preserve branch, clean up worktree.\n- **Mail status `open`** (reader is active): Abort the mail reader's session, wait for drain, commit partial work with `--no-verify`, set `pendingMail.readerActive: false`, transition to cancelled/abandoned, preserve branch, clean up worktree.\n- **Mail status `replied`** (reader completed): Cancel/suppress pending wake transition. Transition to cancelled/abandoned. Preserve branch, clean up worktree.\n\n**7b. Crash recovery for sleeping commissions (REQ-MAIL-23):**\nExtend the startup recovery scan in the orchestrator. When a state file has `status: \"sleeping\"`:\n\n- **Worktree missing**: Transition to `failed` with reason \"Worktree lost during sleep.\" Preserve branch.\n- **Mail status `replied`**: Wake the commission normally (resume with reply). Clean case.\n- **Mail status `open`**: Commit partial work with `--no-verify`, reset mail status to `sent`, re-activate mail reader.\n- **Mail status `sent`**: Activate the mail reader.\n\n**Key considerations:**\n- Sleeping commissions are NOT in the `executions` Map (removed during sleep transition). The cancel flow needs to handle this.\n- The mail orchestrator tracks active readers. Cancel needs to coordinate with it.\n- State file writes are not atomic (O7 from checkpoint 2). Recovery should handle parse failures gracefully.\n- The `abandoned` state is terminal (cannot be redispatched).\n\n**Tests are mandatory.** The plan lists specific test cases for Step 7. Write them all.\n\n**Validate:** `bun run typecheck` passes. All existing tests pass. All new tests pass."
dependencies: []
linked_artifacts:
  - daemon/services/commission/orchestrator.ts

  - daemon/services/mail/orchestrator.ts
  - tests/daemon/services/mail/orchestrator.test.ts
  - daemon/services/mail/orchestrator.ts
  - tests/daemon/services/mail/orchestrator.test.ts
activity_timeline:
  - timestamp: 2026-03-07T15:49:15.242Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-07T15:49:15.243Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-07T15:49:15.277Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-07T15:49:22.906Z
    event: progress_report
    reason: "Starting Step 7: Cancel/Abandon + Crash Recovery. Reading plan, spec, and existing code."
  - timestamp: 2026-03-07T15:53:14.403Z
    event: progress_report
    reason: "Finished reading plan, spec, and all relevant source code. Starting implementation of Step 7a (cancel/abandon sleeping commissions) and 7b (crash recovery). Will modify mail orchestrator to add cancelReaderForCommission and recoverSleepingCommission, then update commission orchestrator's cancel/abandon/recovery flows."
  - timestamp: 2026-03-07T15:56:10.607Z
    event: progress_report
    reason: "Resuming after context compaction. Cancel/abandon and mail orchestrator changes are in place. Continuing with crash recovery in recoverCommissions() and then tests."
  - timestamp: 2026-03-07T15:58:06.029Z
    event: progress_report
    reason: "Implementation complete: 7a (cancel/abandon sleeping) and 7b (crash recovery for sleeping). Typecheck passes. Moving to tests."
  - timestamp: 2026-03-07T16:02:14.182Z
    event: result_submitted
    reason: "Step 7 (Cancel/Abandon + Crash Recovery) implemented and verified.\n\n**7a. Cancel/abandon sleeping commissions (REQ-MAIL-22):**\n- Extended `cancelCommission` and `abandonCommission` in the commission orchestrator to detect sleeping status and delegate to `cancelSleepingCommission`.\n- `cancelSleepingCommission`: transitions lifecycle first (blocking wake attempts), calls `mailOrchestrator.cancelReaderForCommission`, reads state file for worktree info, preserves branch + cleans worktree, syncs status to integration, forgets lifecycle.\n- Added `cancelReaderForCommission` to the mail orchestrator: dequeues if in reader queue, aborts + awaits completion if active reader exists.\n- Added `readerCompletions` Map and `startReaderSession` helper to track reader session promises for await-on-cancel.\n\n**7b. Crash recovery for sleeping commissions (REQ-MAIL-23):**\n- Extended `recoverCommissions()` to handle `status: \"sleeping\"` state files.\n- Worktree missing: transitions to `failed` with \"Worktree lost during sleep.\" Preserves branch.\n- Worktree exists: registers lifecycle, delegates to `mailOrchestrator.recoverSleepingCommission`.\n- `recoverSleepingCommission` in mail orchestrator: reads mail status. `replied` -> wakes commission. `open` -> commits partial work, resets mail to `sent`, re-activates reader. `sent` -> activates reader.\n- Parse failures on state files handled gracefully (logged and skipped).\n\n**Tests (11 new tests):**\n- Cancel sleeping commission: lifecycle cancel + cancelReaderForCommission + preserveAndCleanup\n- Abandon sleeping commission: terminal abandoned state\n- Cancel sleeping with missing worktree: skips preserveAndCleanup\n- Recovery with worktree missing: transitions to failed\n- Recovery with worktree exists: delegates to recoverSleepingCommission\n- Recovery with corrupt state file: skips gracefully\n- cancelReaderForCommission dequeues a queued reader\n- cancelReaderForCommission returns false when no reader found\n- Recovery mail replied: wakes commission\n- Recovery mail open: commits partial, resets to sent, re-activates\n- Recovery mail sent: activates reader\n\n**Validation:** `bun run typecheck` clean. 1947 tests pass (0 failures)."
  - timestamp: 2026-03-07T16:02:21.114Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
  - timestamp: 2026-03-07T16:02:21.338Z
    event: status_completed
    reason: "Execution completed"
current_progress: "Implementation complete: 7a (cancel/abandon sleeping) and 7b (crash recovery for sleeping). Typecheck passes. Moving to tests."
projectName: guild-hall
---
Step 7 (Cancel/Abandon + Crash Recovery) implemented and verified.

**7a. Cancel/abandon sleeping commissions (REQ-MAIL-22):**
- Extended `cancelCommission` and `abandonCommission` in the commission orchestrator to detect sleeping status and delegate to `cancelSleepingCommission`.
- `cancelSleepingCommission`: transitions lifecycle first (blocking wake attempts), calls `mailOrchestrator.cancelReaderForCommission`, reads state file for worktree info, preserves branch + cleans worktree, syncs status to integration, forgets lifecycle.
- Added `cancelReaderForCommission` to the mail orchestrator: dequeues if in reader queue, aborts + awaits completion if active reader exists.
- Added `readerCompletions` Map and `startReaderSession` helper to track reader session promises for await-on-cancel.

**7b. Crash recovery for sleeping commissions (REQ-MAIL-23):**
- Extended `recoverCommissions()` to handle `status: "sleeping"` state files.
- Worktree missing: transitions to `failed` with "Worktree lost during sleep." Preserves branch.
- Worktree exists: registers lifecycle, delegates to `mailOrchestrator.recoverSleepingCommission`.
- `recoverSleepingCommission` in mail orchestrator: reads mail status. `replied` -> wakes commission. `open` -> commits partial work, resets mail to `sent`, re-activates reader. `sent` -> activates reader.
- Parse failures on state files handled gracefully (logged and skipped).

**Tests (11 new tests):**
- Cancel sleeping commission: lifecycle cancel + cancelReaderForCommission + preserveAndCleanup
- Abandon sleeping commission: terminal abandoned state
- Cancel sleeping with missing worktree: skips preserveAndCleanup
- Recovery with worktree missing: transitions to failed
- Recovery with worktree exists: delegates to recoverSleepingCommission
- Recovery with corrupt state file: skips gracefully
- cancelReaderForCommission dequeues a queued reader
- cancelReaderForCommission returns false when no reader found
- Recovery mail replied: wakes commission
- Recovery mail open: commits partial, resets to sent, re-activates
- Recovery mail sent: activates reader

**Validation:** `bun run typecheck` clean. 1947 tests pass (0 failures).
