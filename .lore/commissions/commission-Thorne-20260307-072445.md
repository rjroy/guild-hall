---
title: "Commission: Review Checkpoint 2: Worker-to-Worker Communication Orchestrator"
date: 2026-03-07
status: completed
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review Checkpoint 2 for the worker-to-worker communication feature. Dalton completed Steps 5-6 (Orchestrator) in commission `commission-Dalton-20260307-064635`.\n\n**What was built (Steps 5-6):**\n\n**Step 5: Sleep Flow** — Commission orchestrator detects `commission_mail_sent` event during session, aborts the session, commits pending changes with `--no-verify`, saves session ID, transitions `in_progress -> sleeping`, writes state file, triggers mail reader activation. Sleeping commissions removed from `executions` map.\n\n**Step 6: Mail Reader + Wake Flow** — Mail reader concurrency management (configurable cap, queue with auto-dequeue), reader activation (fresh SDK session with `contextType: \"mail\"` in commission's worktree), reader completion handling (four outcomes: reply received, no reply, error, maxTurns exhaustion), commission resume with saved session ID. Multiple sleep/wake cycles supported.\n\n**Review against:**\n- `.lore/plans/worker-communication.md` — Steps 5-6\n- `.lore/specs/worker-communication.md` — REQ-MAIL-3, REQ-MAIL-4, REQ-MAIL-7, REQ-MAIL-8, REQ-MAIL-11, REQ-MAIL-14, REQ-MAIL-15, REQ-MAIL-19, REQ-MAIL-20, REQ-MAIL-25, REQ-MAIL-26, REQ-MAIL-27\n- `.lore/specs/commission-layer-separation.md` — REQ-CLS-16 (layer boundaries)\n- `CLAUDE.md` — Five concerns boundary\n\n**Focus areas (from plan's Review Checkpoint 2):**\n1. **Race conditions** — Between reader completion and commission cancellation, between mail events and session abort\n2. **EventBus subscription lifecycle** — Does it subscribe and unsubscribe correctly?\n3. **Session resume correctness** — Is the saved session ID properly threaded through sleep/wake?\n4. **State file consistency** — Are all writes atomic? Can a crash leave inconsistent state?\n5. **Abort guard ordering** — Does the `mailSent` check happen before the existing abort guard in `handleSessionCompletion`?\n6. **Error handling** — Do all four wake outcomes (reply, no-reply, error, maxTurns) preserve the commission's ability to continue?\n7. **Concurrency cap** — Does the mail reader queue work correctly? Does dequeue fire when slots open?\n\n**Also check:**\n- Whether the orchestrator extraction happened (plan open question #2) and if so, whether the boundary is clean\n- Whether the DI seam for `mailOrchestrator` (if extracted) is wired in production code (`createProductionApp`)\n\n**Files to review:**\n- `daemon/services/commission/orchestrator.ts` (major changes)\n- `daemon/services/commission/capacity.ts` (if changed)\n- `daemon/services/mail/orchestrator.ts` (if created)\n- All new test files for Steps 5-6\n\nSubmit findings via the commission result. Categorize as defects, gaps, or observations."
dependencies: []
linked_artifacts:
  - daemon/services/mail/orchestrator.ts

  - daemon/services/commission/orchestrator.ts
  - daemon/services/commission/capacity.ts
  - tests/daemon/services/mail/orchestrator.test.ts
  - tests/daemon/services/commission/orchestrator.test.ts
  - daemon/services/commission/orchestrator.ts
  - daemon/services/commission/capacity.ts
  - tests/daemon/services/mail/orchestrator.test.ts
  - tests/daemon/services/commission/orchestrator.test.ts
activity_timeline:
  - timestamp: 2026-03-07T15:24:45.371Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-07T15:24:45.372Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-07T15:24:45.406Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-07T15:24:55.270Z
    event: progress_report
    reason: "Starting Review Checkpoint 2. Reading specs, plans, and implementation files for Steps 5-6 (Sleep/Wake flow, Mail Reader)."
  - timestamp: 2026-03-07T15:25:15.423Z
    event: progress_report
    reason: "Read all primary source files: orchestrator.ts (1713 lines), mail/orchestrator.ts (711 lines), capacity.ts (69 lines), mail/types.ts, mail/record.ts, app.ts. Now scanning for test files and checking additional dependencies."
  - timestamp: 2026-03-07T15:25:43.858Z
    event: progress_report
    reason: "Read all test files. Now checking additional details: the cancel flow for sleeping commissions, recovery handling, and the `onResumeCompleted` callback wiring. Preparing to analyze findings."
  - timestamp: 2026-03-07T15:26:17.703Z
    event: progress_report
    reason: "All source files read and analyzed. Now compiling the complete findings report, categorized by severity."
  - timestamp: 2026-03-07T15:28:41.684Z
    event: progress_report
    reason: "Analysis complete. Writing final findings report and submitting result."
  - timestamp: 2026-03-07T15:31:35.091Z
    event: result_submitted
    reason: "## Review Checkpoint 2: Steps 5-6 (Sleep Flow + Mail Reader + Wake Flow)\n\nReviewed `daemon/services/mail/orchestrator.ts` (711 lines), `daemon/services/commission/orchestrator.ts` (1713 lines), `daemon/services/commission/capacity.ts` (69 lines), `daemon/services/mail/types.ts`, `daemon/services/mail/record.ts`, `daemon/app.ts`, and both test files (~3400 lines of tests combined). Checked against the plan (Steps 5-6), the spec (12 REQ-MAIL requirements), REQ-CLS-16, and CLAUDE.md's Five Concerns boundary.\n\n---\n\n### DEFECTS\n\n**D1. maxTurns exhaustion and normal completion produce identical wake prompts.**\nFile: `daemon/services/mail/orchestrator.ts:400-408`\n\nThe `handleReaderCompletion` function has two branches for non-reply outcomes that emit the same text:\n\n```\n} else if (outcome.aborted) {\n  wakePrompt = buildNoReplyWakePrompt(readerWorkerName, \"completed without sending a reply\");\n} else {\n  wakePrompt = buildNoReplyWakePrompt(readerWorkerName, \"completed without sending a reply\");\n}\n```\n\nREQ-MAIL-19 specifies four distinct wake prompt outcomes: reply received, no reply, error, and \"ran out of turns.\" The sending worker cannot distinguish a deliberate decision not to reply from a reader that ran out of budget. The `aborted` branch comment acknowledges this ambiguity (\"maxTurns exhaustion presents as aborted in some SDK versions\") but treats it identically. The fix is to pass a distinct reason string for the aborted case (e.g., \"was stopped before completing\" or \"may have run out of turns\").\n\n**D2. Duplicate EventBus subscriptions for `commission_mail_sent` in `resumeCommissionSession`.**\nFile: `daemon/services/mail/orchestrator.ts:514-533` and `573-577`\n\nThe resume function subscribes to `commission_mail_sent` twice:\n1. Lines 514-533: A broad subscription that sets `flags.mailSent` and captures event data, alongside handlers for `commission_result` and `commission_progress`.\n2. Lines 573-577: A second, narrower subscription that calls `abortController.abort()`.\n\nThe main `runCommissionSession` in `orchestrator.ts` handles both flag-setting and aborting in a single subscription. The resume path splits this into two independent handlers for the same event. Correctness depends on both handlers firing and on the flag-setting handler running before the abort handler (so the mailSent flag is set when the abort completes). EventBus uses a Set, so insertion order is preserved in practice, but this is a fragile implicit dependency. If someone reorders the subscriptions or the EventBus implementation changes, the abort could fire before the flag is set, and the sleep path would not trigger.\n\nThe fix: merge both into one subscription, matching the pattern in `runCommissionSession`.\n\n**D3. Double read of mail file in `handleReaderCompletion`.**\nFile: `daemon/services/mail/orchestrator.ts:396` and `414`\n\nWhen a reply is received, `readMailFile` is called twice with the same path: once to build the wake prompt (line 396) and again to build the timeline event (line 414). The second read is inside a try/catch for timeline appending, but the data needed (reply summary) was already available from the first read. This is a wasted I/O call. Store the result of the first read and reuse it.\n\n---\n\n### GAPS\n\n**G1. Recovery skips sleeping commissions.**\nFile: `daemon/services/commission/orchestrator.ts:817`\n\nRecovery only handles `dispatched` and `in_progress` states. A commission in `sleeping` state with a pending mail reader will not be recovered after a daemon restart. The plan explicitly defers this to Step 7. Noting it here for traceability: if the daemon crashes while a reader is active, that commission is orphaned until Step 7 is implemented.\n\n**G2. Cancel flow does not handle sleeping commissions with active readers.**\nFile: `daemon/services/commission/orchestrator.ts:1453-1529`\n\nThe cancel flow looks up the commission in the `executions` Map, but sleeping commissions are removed from `executions` during the sleep transition. A cancel request for a sleeping commission will hit the \"not running\" path. The active reader session (if any) will continue running unaware. Also deferred to Step 7.\n\n**G3. No test for multiple sleep/wake cycles.**\nThe plan's Step 6 test matrix includes \"Multiple sleep/wake cycles.\" The test file covers a single cycle thoroughly but does not exercise a second send-mail-sleep-wake round trip. REQ-MAIL-4 (\"Multiple cycles: send, sleep, wake, resume, send again\") has no dedicated test. The code paths for a second cycle exist in `resumeCommissionSession` (which mirrors the sleep detection from `runCommissionSession`), but there is no test proving they work end-to-end.\n\n---\n\n### OBSERVATIONS\n\n**O1. Orchestrator extraction happened cleanly.**\nPlan open question #2 asked whether mail orchestration should be extracted to a separate file. It was extracted to `daemon/services/mail/orchestrator.ts` with a one-way dependency (mail orchestrator receives deps from commission orchestrator, never imports from it). The boundary is clean. The mail orchestrator handles sleep, reader activation, reader completion, and wake. The commission orchestrator detects the mail event, aborts the session, and hands off to the mail orchestrator.\n\n**O2. DI seam uses fallback construction, not explicit production wiring.**\n`daemon/services/commission/orchestrator.ts:331-363` constructs the mail orchestrator via `deps.mailOrchestrator ?? createMailOrchestrator(...)`. `daemon/app.ts` does not pass `mailOrchestrator` in deps, so the fallback always runs. This works, but it means the mail orchestrator's dependency graph is invisible in `createProductionApp`. If the mail orchestrator later needs deps that differ from what the commission orchestrator can provide, this seam will need to become explicit. Not a defect today, but worth watching.\n\n**O3. `onResumeCompleted` uses dummy values for `attempt` and `checkoutScope`.**\nFile: `daemon/services/commission/orchestrator.ts:347-358`\n\nThe callback reconstructs an `ExecutionContext` with `attempt: 0` and `checkoutScope: \"full\"`. These values don't reflect reality (the commission may be on attempt 3 with sparse checkout). The `handleSessionCompletion` function uses `ctx.attempt` for retry logic and `ctx.checkoutScope` for cleanup decisions. If a resumed commission fails and the retry path fires, `attempt: 0` means it will retry from scratch rather than incrementing. Check whether retry-after-resume is a supported path; if not, document the constraint.\n\n**O4. Abort guard ordering is correct.**\nFile: `daemon/services/commission/orchestrator.ts:1363-1451`\n\nThe `runCommissionSession` function checks `flags.mailSent` immediately after `drainSdkSession` returns and before calling `handleSessionCompletion`. If mail was sent during the session, it routes to the sleep path and returns early. The regular completion path never fires. This is the correct ordering.\n\n**O5. EventBus subscriptions are properly cleaned up.**\nBoth `runCommissionSession` and `resumeCommissionSession` unsubscribe from the EventBus in `finally` blocks. The reader session in `runMailReaderSession` also unsubscribes its `mail_reply_received` listener in a `finally` block. No subscription leaks observed.\n\n**O6. Concurrency cap works correctly.**\n`capacity.ts:isMailReaderAtCapacity` is a pure function checking `activeReaderCount >= cap`. The mail orchestrator tracks active reader count internally and queues activations when at capacity. The `finally` block in `runMailReaderSession` decrements the count and dequeues the next reader. Tests verify the 6th reader queues at cap=5 and activates when a slot opens.\n\n**O7. State file writes are not atomic.**\n`writeStateFile` (used in the sleep flow) writes a JSON file via `fs.writeFile`. This is not an atomic write (write-to-temp-then-rename). A crash mid-write could leave a truncated state file. The recovery code in Step 7 would need to handle parse failures gracefully. Low probability but worth noting for the recovery implementation.\n\n---\n\n### REQUIREMENT COVERAGE\n\n| Requirement | Status | Evidence |\n|-------------|--------|----------|\n| REQ-MAIL-3 (sleeping mechanics) | Satisfied | `handleSleep` commits, transitions, writes state, triggers reader |\n| REQ-MAIL-4 (multiple cycles) | Partially satisfied | Code path exists in `resumeCommissionSession`; no test coverage (G3) |\n| REQ-MAIL-7 (reader is a commission) | Satisfied | Reader uses `prepareSdkSession` with full commission prep |\n| REQ-MAIL-8 (reader activation) | Satisfied | `runMailReaderSession` creates fresh SDK session |\n| REQ-MAIL-11 (reader sees only mail) | Satisfied | `contextType: \"mail\"` passed to session prep |\n| REQ-MAIL-14 (full flow) | Satisfied | Sleep → activate → reader runs → wake → resume path complete |\n| REQ-MAIL-15 (shared worktree) | Satisfied | Reader runs in same worktreeDir as sleeping commission |\n| REQ-MAIL-19 (wake prompt content) | Partially satisfied | Reply, no-reply, and error prompts present; maxTurns not distinct (D1) |\n| REQ-MAIL-20 (concurrency caps) | Satisfied | Cap checked, queue with auto-dequeue on slot open |\n| REQ-MAIL-25 (activation prompt) | Satisfied | `buildReaderPrompt` includes mail message, commission title, instructions |\n| REQ-MAIL-26 (context ID format) | Satisfied | Uses `commissionId` as contextId |\n| REQ-MAIL-27 (timeline events) | Satisfied | Timeline entries for sleep, reader activation, reply received |\n| REQ-CLS-16 (layer boundaries) | Satisfied | Mail orchestrator receives lifecycle/record ops via injection, never imports Layer 3 directly |"
  - timestamp: 2026-03-07T15:31:39.626Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Analysis complete. Writing final findings report and submitting result."
projectName: guild-hall
---
## Review Checkpoint 2: Steps 5-6 (Sleep Flow + Mail Reader + Wake Flow)

Reviewed `daemon/services/mail/orchestrator.ts` (711 lines), `daemon/services/commission/orchestrator.ts` (1713 lines), `daemon/services/commission/capacity.ts` (69 lines), `daemon/services/mail/types.ts`, `daemon/services/mail/record.ts`, `daemon/app.ts`, and both test files (~3400 lines of tests combined). Checked against the plan (Steps 5-6), the spec (12 REQ-MAIL requirements), REQ-CLS-16, and CLAUDE.md's Five Concerns boundary.

---

### DEFECTS

**D1. maxTurns exhaustion and normal completion produce identical wake prompts.**
File: `daemon/services/mail/orchestrator.ts:400-408`

The `handleReaderCompletion` function has two branches for non-reply outcomes that emit the same text:

```
} else if (outcome.aborted) {
  wakePrompt = buildNoReplyWakePrompt(readerWorkerName, "completed without sending a reply");
} else {
  wakePrompt = buildNoReplyWakePrompt(readerWorkerName, "completed without sending a reply");
}
```

REQ-MAIL-19 specifies four distinct wake prompt outcomes: reply received, no reply, error, and "ran out of turns." The sending worker cannot distinguish a deliberate decision not to reply from a reader that ran out of budget. The `aborted` branch comment acknowledges this ambiguity ("maxTurns exhaustion presents as aborted in some SDK versions") but treats it identically. The fix is to pass a distinct reason string for the aborted case (e.g., "was stopped before completing" or "may have run out of turns").

**D2. Duplicate EventBus subscriptions for `commission_mail_sent` in `resumeCommissionSession`.**
File: `daemon/services/mail/orchestrator.ts:514-533` and `573-577`

The resume function subscribes to `commission_mail_sent` twice:
1. Lines 514-533: A broad subscription that sets `flags.mailSent` and captures event data, alongside handlers for `commission_result` and `commission_progress`.
2. Lines 573-577: A second, narrower subscription that calls `abortController.abort()`.

The main `runCommissionSession` in `orchestrator.ts` handles both flag-setting and aborting in a single subscription. The resume path splits this into two independent handlers for the same event. Correctness depends on both handlers firing and on the flag-setting handler running before the abort handler (so the mailSent flag is set when the abort completes). EventBus uses a Set, so insertion order is preserved in practice, but this is a fragile implicit dependency. If someone reorders the subscriptions or the EventBus implementation changes, the abort could fire before the flag is set, and the sleep path would not trigger.

The fix: merge both into one subscription, matching the pattern in `runCommissionSession`.

**D3. Double read of mail file in `handleReaderCompletion`.**
File: `daemon/services/mail/orchestrator.ts:396` and `414`

When a reply is received, `readMailFile` is called twice with the same path: once to build the wake prompt (line 396) and again to build the timeline event (line 414). The second read is inside a try/catch for timeline appending, but the data needed (reply summary) was already available from the first read. This is a wasted I/O call. Store the result of the first read and reuse it.

---

### GAPS

**G1. Recovery skips sleeping commissions.**
File: `daemon/services/commission/orchestrator.ts:817`

Recovery only handles `dispatched` and `in_progress` states. A commission in `sleeping` state with a pending mail reader will not be recovered after a daemon restart. The plan explicitly defers this to Step 7. Noting it here for traceability: if the daemon crashes while a reader is active, that commission is orphaned until Step 7 is implemented.

**G2. Cancel flow does not handle sleeping commissions with active readers.**
File: `daemon/services/commission/orchestrator.ts:1453-1529`

The cancel flow looks up the commission in the `executions` Map, but sleeping commissions are removed from `executions` during the sleep transition. A cancel request for a sleeping commission will hit the "not running" path. The active reader session (if any) will continue running unaware. Also deferred to Step 7.

**G3. No test for multiple sleep/wake cycles.**
The plan's Step 6 test matrix includes "Multiple sleep/wake cycles." The test file covers a single cycle thoroughly but does not exercise a second send-mail-sleep-wake round trip. REQ-MAIL-4 ("Multiple cycles: send, sleep, wake, resume, send again") has no dedicated test. The code paths for a second cycle exist in `resumeCommissionSession` (which mirrors the sleep detection from `runCommissionSession`), but there is no test proving they work end-to-end.

---

### OBSERVATIONS

**O1. Orchestrator extraction happened cleanly.**
Plan open question #2 asked whether mail orchestration should be extracted to a separate file. It was extracted to `daemon/services/mail/orchestrator.ts` with a one-way dependency (mail orchestrator receives deps from commission orchestrator, never imports from it). The boundary is clean. The mail orchestrator handles sleep, reader activation, reader completion, and wake. The commission orchestrator detects the mail event, aborts the session, and hands off to the mail orchestrator.

**O2. DI seam uses fallback construction, not explicit production wiring.**
`daemon/services/commission/orchestrator.ts:331-363` constructs the mail orchestrator via `deps.mailOrchestrator ?? createMailOrchestrator(...)`. `daemon/app.ts` does not pass `mailOrchestrator` in deps, so the fallback always runs. This works, but it means the mail orchestrator's dependency graph is invisible in `createProductionApp`. If the mail orchestrator later needs deps that differ from what the commission orchestrator can provide, this seam will need to become explicit. Not a defect today, but worth watching.

**O3. `onResumeCompleted` uses dummy values for `attempt` and `checkoutScope`.**
File: `daemon/services/commission/orchestrator.ts:347-358`

The callback reconstructs an `ExecutionContext` with `attempt: 0` and `checkoutScope: "full"`. These values don't reflect reality (the commission may be on attempt 3 with sparse checkout). The `handleSessionCompletion` function uses `ctx.attempt` for retry logic and `ctx.checkoutScope` for cleanup decisions. If a resumed commission fails and the retry path fires, `attempt: 0` means it will retry from scratch rather than incrementing. Check whether retry-after-resume is a supported path; if not, document the constraint.

**O4. Abort guard ordering is correct.**
File: `daemon/services/commission/orchestrator.ts:1363-1451`

The `runCommissionSession` function checks `flags.mailSent` immediately after `drainSdkSession` returns and before calling `handleSessionCompletion`. If mail was sent during the session, it routes to the sleep path and returns early. The regular completion path never fires. This is the correct ordering.

**O5. EventBus subscriptions are properly cleaned up.**
Both `runCommissionSession` and `resumeCommissionSession` unsubscribe from the EventBus in `finally` blocks. The reader session in `runMailReaderSession` also unsubscribes its `mail_reply_received` listener in a `finally` block. No subscription leaks observed.

**O6. Concurrency cap works correctly.**
`capacity.ts:isMailReaderAtCapacity` is a pure function checking `activeReaderCount >= cap`. The mail orchestrator tracks active reader count internally and queues activations when at capacity. The `finally` block in `runMailReaderSession` decrements the count and dequeues the next reader. Tests verify the 6th reader queues at cap=5 and activates when a slot opens.

**O7. State file writes are not atomic.**
`writeStateFile` (used in the sleep flow) writes a JSON file via `fs.writeFile`. This is not an atomic write (write-to-temp-then-rename). A crash mid-write could leave a truncated state file. The recovery code in Step 7 would need to handle parse failures gracefully. Low probability but worth noting for the recovery implementation.

---

### REQUIREMENT COVERAGE

| Requirement | Status | Evidence |
|-------------|--------|----------|
| REQ-MAIL-3 (sleeping mechanics) | Satisfied | `handleSleep` commits, transitions, writes state, triggers reader |
| REQ-MAIL-4 (multiple cycles) | Partially satisfied | Code path exists in `resumeCommissionSession`; no test coverage (G3) |
| REQ-MAIL-7 (reader is a commission) | Satisfied | Reader uses `prepareSdkSession` with full commission prep |
| REQ-MAIL-8 (reader activation) | Satisfied | `runMailReaderSession` creates fresh SDK session |
| REQ-MAIL-11 (reader sees only mail) | Satisfied | `contextType: "mail"` passed to session prep |
| REQ-MAIL-14 (full flow) | Satisfied | Sleep → activate → reader runs → wake → resume path complete |
| REQ-MAIL-15 (shared worktree) | Satisfied | Reader runs in same worktreeDir as sleeping commission |
| REQ-MAIL-19 (wake prompt content) | Partially satisfied | Reply, no-reply, and error prompts present; maxTurns not distinct (D1) |
| REQ-MAIL-20 (concurrency caps) | Satisfied | Cap checked, queue with auto-dequeue on slot open |
| REQ-MAIL-25 (activation prompt) | Satisfied | `buildReaderPrompt` includes mail message, commission title, instructions |
| REQ-MAIL-26 (context ID format) | Satisfied | Uses `commissionId` as contextId |
| REQ-MAIL-27 (timeline events) | Satisfied | Timeline entries for sleep, reader activation, reply received |
| REQ-CLS-16 (layer boundaries) | Satisfied | Mail orchestrator receives lifecycle/record ops via injection, never imports Layer 3 directly |
