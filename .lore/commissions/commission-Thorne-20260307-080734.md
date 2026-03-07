---
title: "Commission: Review Checkpoint 3: Cancel/Abandon + Crash Recovery"
date: 2026-03-07
status: completed
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review Checkpoint 3 for the worker-to-worker communication feature. Dalton completed Step 7 (Cancel/Abandon + Crash Recovery) in commission `commission-Dalton-20260307-074915`.\n\n**What was built (Step 7):**\n\n**7a. Cancel/abandon sleeping commissions (REQ-MAIL-22):**\nExtended cancel/abandon flow to handle sleeping commissions, branching on mail status:\n- Mail `sent`: dequeue reader if queued, cancel/abandon cleanly\n- Mail `open`: abort reader, wait for drain, commit partial work, cancel/abandon\n- Mail `replied`: suppress pending wake, cancel/abandon\n\n**7b. Crash recovery for sleeping commissions (REQ-MAIL-23):**\nExtended startup recovery scan for sleeping state files:\n- Worktree missing: transition to failed\n- Mail `replied`: wake commission normally\n- Mail `open`: commit partial, reset to sent, re-activate reader\n- Mail `sent`: activate reader\n\n**Review against:**\n- `.lore/plans/worker-communication.md` — Step 7\n- `.lore/specs/worker-communication.md` — REQ-MAIL-22, REQ-MAIL-23\n- Previous review findings: O7 from Checkpoint 2 noted state file writes aren't atomic, recovery should handle parse failures gracefully\n\n**Focus areas (from plan's Review Checkpoint 3):**\n1. State file consistency across all cancel/recovery paths\n2. Race conditions between cancel and wake (mail status `replied` while cancel is in progress)\n3. Recovery completeness (all mail status values handled)\n4. Terminal state guards (abandoned is terminal, cancelled is not)\n5. Reader abort + drain + commit sequence in cancel path\n6. Parse failure handling for corrupt state files (O7 follow-up)\n\nSubmit findings via commission result. Categorize as defects, gaps, or observations."
dependencies: []
linked_artifacts:
  - daemon/services/commission/orchestrator.ts

  - daemon/services/mail/orchestrator.ts
  - daemon/services/mail/types.ts
  - daemon/services/commission/lifecycle.ts
  - tests/daemon/services/mail/orchestrator.test.ts
  - tests/daemon/services/commission/lifecycle.test.ts
  - daemon/services/mail/orchestrator.ts
  - daemon/services/mail/types.ts
  - daemon/services/commission/lifecycle.ts
  - tests/daemon/services/mail/orchestrator.test.ts
  - tests/daemon/services/commission/lifecycle.test.ts
activity_timeline:
  - timestamp: 2026-03-07T16:07:34.461Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-07T16:07:34.462Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-07T16:07:34.499Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-07T16:07:42.154Z
    event: progress_report
    reason: "Starting Checkpoint 3 review. Reading spec, plan, and previous review findings before examining implementation."
  - timestamp: 2026-03-07T16:09:09.849Z
    event: progress_report
    reason: "Read spec, plan, and previous findings. Now reading actual implementation code for detailed inspection."
  - timestamp: 2026-03-07T16:13:26.378Z
    event: progress_report
    reason: "Completed full code review of cancel/abandon, crash recovery, race conditions, terminal state guards, parse failure handling, and test coverage. Compiling findings for submission."
  - timestamp: 2026-03-07T16:14:30.468Z
    event: result_submitted
    reason: "## Checkpoint 3 Review: Step 7 (Cancel/Abandon + Crash Recovery)\n\nReviewed against REQ-MAIL-22, REQ-MAIL-23, and the plan's Step 7 specification. Examined `daemon/services/commission/orchestrator.ts` (cancel/abandon/recovery paths), `daemon/services/mail/orchestrator.ts` (cancelReaderForCommission, recoverSleepingCommission, wakeCommission, resumeCommissionSession), `daemon/services/commission/lifecycle.ts` (transition table), `daemon/services/mail/types.ts`, and all Step 7 test cases.\n\n---\n\n### Defects\n\n**D1: Resumed commission sessions are invisible to the cancel path.**\nAfter waking, `wakeCommission` fires `void resumeCommissionSession(...)` (fire-and-forget) at `mail/orchestrator.ts:510`. The resumed SDK session is never registered in the `executions` map. When `cancelCommission` is called during this window, it checks `executions.has(commissionId)` at `orchestrator.ts:1620`, finds nothing, falls through to the lifecycle-only cancel path at line 1655, transitions the lifecycle to cancelled, but cannot abort the running SDK session. The session continues to consume resources until it naturally completes or encounters filesystem errors.\n\nThis affects the `replied` mail status cancel path (REQ-MAIL-22). If the reader completed and the wake already fired `resumeCommissionSession` before cancel arrives, the cancel transitions the lifecycle but the resumed session keeps running. If `cancelSleepingCommission` then removes the worktree via `preserveAndCleanup` at line 718, the resumed session runs against a deleted worktree.\n\nImpact: resource waste (the session runs to completion), potential filesystem errors in the resumed session, and the commission appears cancelled while an SDK session is still active.\n\nFix: `resumeCommissionSession` should register itself in the `executions` map (with its AbortController) before starting the SDK session, and remove itself on completion. This gives the cancel path a way to find and abort it. Alternatively, `wakeCommission` could check the lifecycle status after transitioning and before firing the resume, catching cases where a concurrent cancel already transitioned the commission.\n\n**D2: `cancelSleepingCommission` with `targetState: \"abandoned\"` does not call `checkDependencyTransitions`.**\nThe normal `abandonCommission` path at `orchestrator.ts:1718-1728` calls `checkDependencyTransitions(projectName)` to unblock dependent commissions after abandoning. The sleeping commission abandon path (via `cancelSleepingCommission` at line 1714) returns without calling it. If other commissions depend on the abandoned sleeping commission, they remain blocked indefinitely.\n\nEvidence: Compare `abandonCommission` at line 1725 (`await checkDependencyTransitions(projectName)`) with `cancelSleepingCommission` at lines 672-743 (no such call).\n\nFix: Add `checkDependencyTransitions(resolvedProjectName)` after the cleanup in `cancelSleepingCommission` when `targetState === \"abandoned\"`, matching the existing abandon path. `orchestrator.ts:742`.\n\n---\n\n### Gaps\n\n**G1: No test for cancel during an active reader session (mail status `open`).**\nThe test suite covers: cancel when reader is queued (`cancelReaderForCommission dequeues a queued reader`, line 2119), cancel with no reader (`returns false when no reader found`, line 2176), cancel with missing worktree (line 1846), and the lifecycle transitions (sleeping -> cancelled, sleeping -> abandoned). Missing: a test where the reader is actively running an SDK session and gets aborted, verifying the full abort -> drain -> commit -> cancel sequence end-to-end. This is the most complex cancel path (REQ-MAIL-22, mail status `open`) and it's the one most likely to have concurrency issues.\n\n**G2: `SleepingCommissionState` cast at recovery has no shape validation (O7 follow-up).**\nAt `orchestrator.ts:899`: `const sleepingState = state as unknown as SleepingCommissionState`. The JSON.parse catch at line 884-893 handles corrupt JSON (the test at line 2057 confirms this). But if the JSON parses successfully with missing fields (e.g., a truncated write that produced `{\"commissionId\": \"abc\"}` without `pendingMail` or `sessionId`), the cast succeeds and downstream code throws when accessing `sleepingState.pendingMail.mailFilePath`. The error would be caught by the outer try/catch at line 953-973 and the commission would transition to failed, so the system doesn't crash. But the error message would be \"Cannot read properties of undefined\" rather than \"State file missing required fields,\" making debugging harder.\n\nThe same pattern exists in `mail/orchestrator.ts:168-175` (`readStateFile` uses `JSON.parse(raw) as SleepingCommissionState`) and line 760 (`readMailFile`). This was flagged as O7 in Checkpoint 2. The implementation added a corrupt-JSON test, which addresses the parse failure case. The missing-fields case remains unvalidated.\n\nRecommendation: Add a guard after the cast that checks for required fields (`pendingMail`, `sessionId`, `worktreeDir`). If missing, log and skip (same as the corrupt JSON path). This doesn't need to be Zod-level validation; a simple truthy check is sufficient.\n\n**G3: Recovery hardcodes `mailSequence: 1` for all mail statuses.**\nAt `mail/orchestrator.ts:779, 808, 821`: the `PendingReaderActivation` built during recovery always sets `mailSequence: 1`. If the commission was on its third mail exchange when the daemon crashed, the recovered reader gets context ID `mail-<cid>-001` instead of `mail-<cid>-003`. The `PendingMail` type in `mail/types.ts:12-16` does not include `mailSequence`, so there's no way to reconstruct it from the state file. This affects event correlation (the context ID won't match what EventBus consumers expect) and is a minor data integrity gap.\n\nFix: Add `mailSequence: number` to the `PendingMail` type and populate it during the sleep flow. Recovery can then use the stored value.\n\n---\n\n### Observations\n\n**O1: Recovery fallback for unreadable mail files defaults to \"sent\".**\nAt `mail/orchestrator.ts:762-766`, when the mail file can't be read, the recovery defaults to `mailStatus = \"sent\"` and re-activates the reader. If the file is truly deleted or corrupt, the reader will fail when trying to read its content, which triggers the error wake path, which wakes the commission with an error message. The commission can then decide what to do. This is a reasonable best-effort approach. Flagging it because an alternative (transition to failed immediately when the mail file is unreadable) would be more explicit about the failure mode.\n\n**O2: `cancelSleepingCommission` warn-and-continue on lifecycle transition failure.**\nAt `orchestrator.ts:681-691`, if `lifecycle.cancel()` or `lifecycle.abandon()` throws, the function logs a warning and continues with cleanup. This is intentional (the commission might have been woken concurrently, so the lifecycle state changed). But it means cleanup proceeds even when the lifecycle transition failed, which could lead to cleaning up a commission that's now in_progress (woken by a concurrent reader completion). The lifecycle guard (D1) is the root issue; this pattern is a symptom.\n\n**O3: State file write ordering between reader finally block and cancel.**\nWhen `cancelSleepingCommission` aborts the reader and waits for completion, the reader's finally block (`mail/orchestrator.ts:382-384`) writes `readerActive: false` to the state file. Then `cancelSleepingCommission` overwrites the state file with the terminal state (`orchestrator.ts:734-739`). The reader's write is immediately overwritten. This is correct but generates unnecessary I/O. No action needed; noting for completeness.\n\n---\n\n### Spec Requirement Coverage\n\n| Requirement | Status | Evidence |\n|---|---|---|\n| REQ-MAIL-22: Cancel/abandon sleeping by mail status | Partially satisfied | Cancel/abandon flow branches on sleeping status and delegates to `cancelSleepingCommission`. Mail reader cancel/dequeue works. D1 (resumed session not abortable) and D2 (missing dependency transitions on abandon) are gaps. |\n| REQ-MAIL-23: Crash recovery for sleeping commissions | Satisfied with caveats | All four recovery paths implemented (worktree missing, replied, open, sent). G2 (no shape validation on state file) and G3 (hardcoded mailSequence) are minor gaps. |\n| O7 follow-up (parse failures) | Partially addressed | Corrupt JSON is caught and skipped (test at line 2057 confirms). Missing-fields case is not validated (G2). |\n\n### Previous Checkpoint 2 Findings Status\n\n| Finding | Status |\n|---|---|\n| D1 (maxTurns vs normal completion prompts) | Not in scope for Step 7 |\n| D2 (duplicate EventBus subscriptions) | Not in scope for Step 7 |\n| D3 (double mail file read) | Not in scope for Step 7 |\n| G1 (recovery skips sleeping) | Addressed by Step 7b |\n| G2 (cancel doesn't handle sleeping) | Addressed by Step 7a, with D1/D2 findings |\n| G3 (no multi-sleep test) | Not addressed in Step 7; still missing |\n| O7 (non-atomic state files) | Partially addressed; see G2 |"
  - timestamp: 2026-03-07T16:14:47.082Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
  - timestamp: 2026-03-07T16:14:47.302Z
    event: status_completed
    reason: "Execution completed"
current_progress: "Completed full code review of cancel/abandon, crash recovery, race conditions, terminal state guards, parse failure handling, and test coverage. Compiling findings for submission."
projectName: guild-hall
---
## Checkpoint 3 Review: Step 7 (Cancel/Abandon + Crash Recovery)

Reviewed against REQ-MAIL-22, REQ-MAIL-23, and the plan's Step 7 specification. Examined `daemon/services/commission/orchestrator.ts` (cancel/abandon/recovery paths), `daemon/services/mail/orchestrator.ts` (cancelReaderForCommission, recoverSleepingCommission, wakeCommission, resumeCommissionSession), `daemon/services/commission/lifecycle.ts` (transition table), `daemon/services/mail/types.ts`, and all Step 7 test cases.

---

### Defects

**D1: Resumed commission sessions are invisible to the cancel path.**
After waking, `wakeCommission` fires `void resumeCommissionSession(...)` (fire-and-forget) at `mail/orchestrator.ts:510`. The resumed SDK session is never registered in the `executions` map. When `cancelCommission` is called during this window, it checks `executions.has(commissionId)` at `orchestrator.ts:1620`, finds nothing, falls through to the lifecycle-only cancel path at line 1655, transitions the lifecycle to cancelled, but cannot abort the running SDK session. The session continues to consume resources until it naturally completes or encounters filesystem errors.

This affects the `replied` mail status cancel path (REQ-MAIL-22). If the reader completed and the wake already fired `resumeCommissionSession` before cancel arrives, the cancel transitions the lifecycle but the resumed session keeps running. If `cancelSleepingCommission` then removes the worktree via `preserveAndCleanup` at line 718, the resumed session runs against a deleted worktree.

Impact: resource waste (the session runs to completion), potential filesystem errors in the resumed session, and the commission appears cancelled while an SDK session is still active.

Fix: `resumeCommissionSession` should register itself in the `executions` map (with its AbortController) before starting the SDK session, and remove itself on completion. This gives the cancel path a way to find and abort it. Alternatively, `wakeCommission` could check the lifecycle status after transitioning and before firing the resume, catching cases where a concurrent cancel already transitioned the commission.

**D2: `cancelSleepingCommission` with `targetState: "abandoned"` does not call `checkDependencyTransitions`.**
The normal `abandonCommission` path at `orchestrator.ts:1718-1728` calls `checkDependencyTransitions(projectName)` to unblock dependent commissions after abandoning. The sleeping commission abandon path (via `cancelSleepingCommission` at line 1714) returns without calling it. If other commissions depend on the abandoned sleeping commission, they remain blocked indefinitely.

Evidence: Compare `abandonCommission` at line 1725 (`await checkDependencyTransitions(projectName)`) with `cancelSleepingCommission` at lines 672-743 (no such call).

Fix: Add `checkDependencyTransitions(resolvedProjectName)` after the cleanup in `cancelSleepingCommission` when `targetState === "abandoned"`, matching the existing abandon path. `orchestrator.ts:742`.

---

### Gaps

**G1: No test for cancel during an active reader session (mail status `open`).**
The test suite covers: cancel when reader is queued (`cancelReaderForCommission dequeues a queued reader`, line 2119), cancel with no reader (`returns false when no reader found`, line 2176), cancel with missing worktree (line 1846), and the lifecycle transitions (sleeping -> cancelled, sleeping -> abandoned). Missing: a test where the reader is actively running an SDK session and gets aborted, verifying the full abort -> drain -> commit -> cancel sequence end-to-end. This is the most complex cancel path (REQ-MAIL-22, mail status `open`) and it's the one most likely to have concurrency issues.

**G2: `SleepingCommissionState` cast at recovery has no shape validation (O7 follow-up).**
At `orchestrator.ts:899`: `const sleepingState = state as unknown as SleepingCommissionState`. The JSON.parse catch at line 884-893 handles corrupt JSON (the test at line 2057 confirms this). But if the JSON parses successfully with missing fields (e.g., a truncated write that produced `{"commissionId": "abc"}` without `pendingMail` or `sessionId`), the cast succeeds and downstream code throws when accessing `sleepingState.pendingMail.mailFilePath`. The error would be caught by the outer try/catch at line 953-973 and the commission would transition to failed, so the system doesn't crash. But the error message would be "Cannot read properties of undefined" rather than "State file missing required fields," making debugging harder.

The same pattern exists in `mail/orchestrator.ts:168-175` (`readStateFile` uses `JSON.parse(raw) as SleepingCommissionState`) and line 760 (`readMailFile`). This was flagged as O7 in Checkpoint 2. The implementation added a corrupt-JSON test, which addresses the parse failure case. The missing-fields case remains unvalidated.

Recommendation: Add a guard after the cast that checks for required fields (`pendingMail`, `sessionId`, `worktreeDir`). If missing, log and skip (same as the corrupt JSON path). This doesn't need to be Zod-level validation; a simple truthy check is sufficient.

**G3: Recovery hardcodes `mailSequence: 1` for all mail statuses.**
At `mail/orchestrator.ts:779, 808, 821`: the `PendingReaderActivation` built during recovery always sets `mailSequence: 1`. If the commission was on its third mail exchange when the daemon crashed, the recovered reader gets context ID `mail-<cid>-001` instead of `mail-<cid>-003`. The `PendingMail` type in `mail/types.ts:12-16` does not include `mailSequence`, so there's no way to reconstruct it from the state file. This affects event correlation (the context ID won't match what EventBus consumers expect) and is a minor data integrity gap.

Fix: Add `mailSequence: number` to the `PendingMail` type and populate it during the sleep flow. Recovery can then use the stored value.

---

### Observations

**O1: Recovery fallback for unreadable mail files defaults to "sent".**
At `mail/orchestrator.ts:762-766`, when the mail file can't be read, the recovery defaults to `mailStatus = "sent"` and re-activates the reader. If the file is truly deleted or corrupt, the reader will fail when trying to read its content, which triggers the error wake path, which wakes the commission with an error message. The commission can then decide what to do. This is a reasonable best-effort approach. Flagging it because an alternative (transition to failed immediately when the mail file is unreadable) would be more explicit about the failure mode.

**O2: `cancelSleepingCommission` warn-and-continue on lifecycle transition failure.**
At `orchestrator.ts:681-691`, if `lifecycle.cancel()` or `lifecycle.abandon()` throws, the function logs a warning and continues with cleanup. This is intentional (the commission might have been woken concurrently, so the lifecycle state changed). But it means cleanup proceeds even when the lifecycle transition failed, which could lead to cleaning up a commission that's now in_progress (woken by a concurrent reader completion). The lifecycle guard (D1) is the root issue; this pattern is a symptom.

**O3: State file write ordering between reader finally block and cancel.**
When `cancelSleepingCommission` aborts the reader and waits for completion, the reader's finally block (`mail/orchestrator.ts:382-384`) writes `readerActive: false` to the state file. Then `cancelSleepingCommission` overwrites the state file with the terminal state (`orchestrator.ts:734-739`). The reader's write is immediately overwritten. This is correct but generates unnecessary I/O. No action needed; noting for completeness.

---

### Spec Requirement Coverage

| Requirement | Status | Evidence |
|---|---|---|
| REQ-MAIL-22: Cancel/abandon sleeping by mail status | Partially satisfied | Cancel/abandon flow branches on sleeping status and delegates to `cancelSleepingCommission`. Mail reader cancel/dequeue works. D1 (resumed session not abortable) and D2 (missing dependency transitions on abandon) are gaps. |
| REQ-MAIL-23: Crash recovery for sleeping commissions | Satisfied with caveats | All four recovery paths implemented (worktree missing, replied, open, sent). G2 (no shape validation on state file) and G3 (hardcoded mailSequence) are minor gaps. |
| O7 follow-up (parse failures) | Partially addressed | Corrupt JSON is caught and skipped (test at line 2057 confirms). Missing-fields case is not validated (G2). |

### Previous Checkpoint 2 Findings Status

| Finding | Status |
|---|---|
| D1 (maxTurns vs normal completion prompts) | Not in scope for Step 7 |
| D2 (duplicate EventBus subscriptions) | Not in scope for Step 7 |
| D3 (double mail file read) | Not in scope for Step 7 |
| G1 (recovery skips sleeping) | Addressed by Step 7b |
| G2 (cancel doesn't handle sleeping) | Addressed by Step 7a, with D1/D2 findings |
| G3 (no multi-sleep test) | Not addressed in Step 7; still missing |
| O7 (non-atomic state files) | Partially addressed; see G2 |
