---
title: "Commission: Worker-to-Worker Communication: Edge Cases (Step 7)"
date: 2026-03-07
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Step 7 from the plan at `.lore/plans/worker-communication.md` for the worker-to-worker communication feature.\n\nRead the full plan first. Then read the spec at `.lore/specs/worker-communication.md` for requirement details.\n\n**Context:** Steps 1-6 are complete and reviewed. The foundation (types, lifecycle, toolboxes, mail record ops), orchestrator (sleep flow, mail reader activation, wake flow), and three rounds of defect fixes are all in place. The mail orchestrator was extracted to `daemon/services/mail/orchestrator.ts`.\n\n**What you're building:**\n\n**Step 7: Cancel/Abandon + Crash Recovery**\n\n**7a. Cancel/abandon sleeping commissions (REQ-MAIL-22):**\nExtend the existing cancel/abandon flow to handle sleeping commissions. Branch on the mail file's status field:\n\n- **Mail status `sent`** (reader not yet started): Dequeue if queued behind concurrency cap. Transition to cancelled/abandoned. Preserve branch, clean up worktree.\n- **Mail status `open`** (reader is active): Abort the mail reader's session, wait for drain, commit partial work with `--no-verify`, set `pendingMail.readerActive: false`, transition to cancelled/abandoned, preserve branch, clean up worktree.\n- **Mail status `replied`** (reader completed): Cancel/suppress pending wake transition. Transition to cancelled/abandoned. Preserve branch, clean up worktree.\n\n**7b. Crash recovery for sleeping commissions (REQ-MAIL-23):**\nExtend the startup recovery scan in the orchestrator. When a state file has `status: \"sleeping\"`:\n\n- **Worktree missing**: Transition to `failed` with reason \"Worktree lost during sleep.\" Preserve branch.\n- **Mail status `replied`**: Wake the commission normally (resume with reply). Clean case.\n- **Mail status `open`**: Commit partial work with `--no-verify`, reset mail status to `sent`, re-activate mail reader.\n- **Mail status `sent`**: Activate the mail reader.\n\n**Key considerations:**\n- Sleeping commissions are NOT in the `executions` Map (removed during sleep transition). The cancel flow needs to handle this.\n- The mail orchestrator tracks active readers. Cancel needs to coordinate with it.\n- State file writes are not atomic (O7 from checkpoint 2). Recovery should handle parse failures gracefully.\n- The `abandoned` state is terminal (cannot be redispatched).\n\n**Tests are mandatory.** The plan lists specific test cases for Step 7. Write them all.\n\n**Validate:** `bun run typecheck` passes. All existing tests pass. All new tests pass."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-07T15:49:15.242Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-07T15:49:15.243Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
