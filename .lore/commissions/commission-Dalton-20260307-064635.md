---
title: "Commission: Worker-to-Worker Communication: Orchestrator (Steps 5-6)"
date: 2026-03-07
status: completed
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Steps 5-6 from the plan at `.lore/plans/worker-communication.md` for the worker-to-worker communication feature.\n\nRead the full plan first. Then read the spec at `.lore/specs/worker-communication.md` for requirement details.\n\n**Context:** Steps 1-4 (Foundation) are complete and reviewed. The types, lifecycle state machine, mail record ops, mail toolbox, and commission toolbox extension (send_mail) are all in place. Two fixes from review checkpoint 1 have been applied (D1: typed deps fields on GuildHallToolboxDeps, D2: robust writeReply regex).\n\n**What you're building:**\n\n**Step 5: Sleep Flow (Orchestrator)** — Detect `mailSent` after session drain and route to the sleep path. Subscribe to `commission_mail_sent` events, abort session, commit pending changes with `--no-verify`, save session ID, transition to sleeping, trigger mail reader activation. Critical: the abort guard ordering in `handleSessionCompletion` must check `mailSent` before the existing abort guard, or the commission vanishes silently.\n\n**Step 6: Mail Reader + Wake Flow (Orchestrator)** — Mail reader concurrency management, reader activation (fresh session in commission's worktree with mail context type), reader completion handling, wake-up prompt construction (four outcomes: reply received, maxTurns exhausted, no reply, error), commission resume with saved session ID. Build Step 5 first and verify before building Step 6. Within Step 6, build activation (6b) first, then completion/wake (6c).\n\n**Key considerations from the plan:**\n- The orchestrator is already 1626 lines. The plan's open question #2 suggests considering extraction to `daemon/services/mail/orchestrator.ts`. Make this decision before building.\n- Follow the `resultSubmitted` EventBus subscription pattern for both `mailSent` and `replyReceived` tracking.\n- Sleeping commissions don't count against the commission cap (removed from `executions` in Step 5).\n- Mail reader concurrency is tracked separately with a configurable cap (default 5).\n- Multiple sleep/wake cycles work naturally: `mailSent` flag is session-scoped, mail sequence increments.\n\n**Tests are mandatory for every step.** The plan lists specific test cases. Write them.\n\n**Validate:** `bun run typecheck` passes. All existing tests pass. All new tests pass.\n\n**Do not implement Steps 7-8.** Those are separate commissions."
dependencies: []
linked_artifacts:
  - daemon/services/mail/orchestrator.ts

  - daemon/services/commission/orchestrator.ts
  - daemon/services/commission/capacity.ts
  - tests/daemon/services/mail/orchestrator.test.ts
  - tests/daemon/services/commission/capacity.test.ts
  - daemon/services/commission/orchestrator.ts
  - daemon/services/commission/capacity.ts
  - tests/daemon/services/mail/orchestrator.test.ts
  - tests/daemon/services/commission/capacity.test.ts
activity_timeline:
  - timestamp: 2026-03-07T14:46:35.922Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-07T14:46:35.923Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-07T14:46:35.960Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-07T14:46:44.189Z
    event: progress_report
    reason: "Starting commission. Reading plan and spec files first."
  - timestamp: 2026-03-07T14:47:43.348Z
    event: progress_report
    reason: "Finished reading all source files. Deciding on extraction approach (open question #2) then implementing Step 5."
  - timestamp: 2026-03-07T14:52:16.283Z
    event: progress_report
    reason: "Resuming after context compaction. Mail orchestrator module and capacity function are created. Now wiring the mail orchestrator into the commission orchestrator for Step 5 (sleep flow)."
  - timestamp: 2026-03-07T14:57:31.064Z
    event: progress_report
    reason: "Step 5 and 6 implementation complete. Commission orchestrator wired to mail orchestrator. Typecheck passes, all 1916 existing tests pass. Now writing tests for the sleep flow and mail reader/wake flow."
  - timestamp: 2026-03-07T15:09:18.686Z
    event: progress_report
    reason: "Resuming after context compaction. 5 test failures remain. Reading current state of test file and mail record parser to fix them."
  - timestamp: 2026-03-07T15:22:06.460Z
    event: result_submitted
    reason: "Steps 5-6 implemented and validated. All pre-commit checks pass (typecheck, lint, 1936 tests, 0 failures).\n\n**Step 5 (Sleep Flow):**\n- Commission orchestrator detects `commission_mail_sent` event during session, aborts the session, and routes to `mailOrchestrator.handleSleep()`\n- Sleep path: commits pending changes, validates session ID (fails commission if null), transitions `in_progress` -> `sleeping`, writes state file with session ID, triggers mail reader activation\n- Sleeping commissions removed from `executions` map (don't count against commission cap)\n- `mailOrchestrator` injected via DI seam on `CommissionOrchestratorDeps`\n- Closure-mutated variable narrowing handled with `flags` object pattern\n\n**Step 6 (Mail Reader + Wake Flow):**\n- Extracted to `daemon/services/mail/orchestrator.ts` (per Open Question #2 in plan)\n- 6a: Mail reader concurrency via `isMailReaderAtCapacity()` with configurable cap (default 5), queue with auto-dequeue\n- 6b: Reader activation with fresh SDK session, `contextType: \"mail\"`, in commission's worktree, prompt built from mail file content\n- 6c: Reader completion builds wake prompt (4 outcomes: reply received, no reply, error, maxTurns). Commission resumes with saved session ID. Multiple sleep/wake cycles supported.\n- `onResumeCompleted` callback delegates finalize/cleanup back to commission orchestrator without circular deps\n\n**Tests (20 new):**\n- 7 sleep flow tests (event detection, lifecycle transition, state file, commit, session ID validation, cap exclusion)\n- 5 mail reader capacity tests\n- 4 reader activation/concurrency tests  \n- 4 wake flow tests (reply received, no reply, error, auto-dispatch)"
  - timestamp: 2026-03-07T15:22:11.449Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
  - timestamp: 2026-03-07T15:22:11.658Z
    event: status_completed
    reason: "Execution completed"
current_progress: "Resuming after context compaction. 5 test failures remain. Reading current state of test file and mail record parser to fix them."
projectName: guild-hall
---
Steps 5-6 implemented and validated. All pre-commit checks pass (typecheck, lint, 1936 tests, 0 failures).

**Step 5 (Sleep Flow):**
- Commission orchestrator detects `commission_mail_sent` event during session, aborts the session, and routes to `mailOrchestrator.handleSleep()`
- Sleep path: commits pending changes, validates session ID (fails commission if null), transitions `in_progress` -> `sleeping`, writes state file with session ID, triggers mail reader activation
- Sleeping commissions removed from `executions` map (don't count against commission cap)
- `mailOrchestrator` injected via DI seam on `CommissionOrchestratorDeps`
- Closure-mutated variable narrowing handled with `flags` object pattern

**Step 6 (Mail Reader + Wake Flow):**
- Extracted to `daemon/services/mail/orchestrator.ts` (per Open Question #2 in plan)
- 6a: Mail reader concurrency via `isMailReaderAtCapacity()` with configurable cap (default 5), queue with auto-dequeue
- 6b: Reader activation with fresh SDK session, `contextType: "mail"`, in commission's worktree, prompt built from mail file content
- 6c: Reader completion builds wake prompt (4 outcomes: reply received, no reply, error, maxTurns). Commission resumes with saved session ID. Multiple sleep/wake cycles supported.
- `onResumeCompleted` callback delegates finalize/cleanup back to commission orchestrator without circular deps

**Tests (20 new):**
- 7 sleep flow tests (event detection, lifecycle transition, state file, commit, session ID validation, cap exclusion)
- 5 mail reader capacity tests
- 4 reader activation/concurrency tests  
- 4 wake flow tests (reply received, no reply, error, auto-dispatch)
