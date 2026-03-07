---
title: "Commission: Spec Revisions: Worker-to-Worker Communication"
date: 2026-03-07
status: dispatched
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Revise the spec at `.lore/specs/worker-communication.md` based on review findings from `.lore/commissions/commission-Thorne-20260306-202023.md` and the following decisions from the user.\n\n**Fix these items:**\n\n**D1. Git commits out of tool handlers.** Remove git commits from the `send_mail` and `reply` tool handler steps (REQ-MAIL-14 steps 2c and 8c). Tools write files, the orchestrator handles git. Follow the same pattern as `submit_result`.\n\n**D2. Formalize `abandoned` state.** The `abandoned` state is used in this spec but not documented in the commissions spec. Add a note in this spec acknowledging that `abandoned` exists in implementation and is used here, and add an exit point to the commissions spec (`.lore/specs/guild-hall-commissions.md`) to formalize it.\n\n**G1. Commit before reader starts.** When a commission sleeps, commit the commission's work before the mail reader starts. Use `--no-verify` for this commit (it's an intermediate checkpoint, not a deliverable). This avoids the reader working on uncommitted files. Update the spec to reflect this.\n\n**G3. Sleep timeout should preserve reader's partial work.** Align the timeout path with the cancel path: abort reader, wait for drain, commit partial work. Don't just abort and transition to failed.\n\n**G4. Distinguish reader resource exhaustion.** When a mail reader exhausts maxTurns without calling `reply`, the wake-up prompt should distinguish \"ran out of turns\" from \"chose not to reply.\" These are different failure modes.\n\n**G5. Mail artifact states for cancellation.** Add states to the mail artifact: `sent` (created, reader not yet started), `open` (reader is active), `replied` (reader completed with reply). When a sleeping commission is cancelled:\n- If mail is `sent`: clean up, no reader to worry about.\n- If mail is `open`: wait for the reader to finish or abort it, then cancel.\n- If mail is `replied`: wake already pending, cancel proceeds normally.\nThis replaces the need for a \"circuit breaker\" on sleep cycles. The commission can already be cancelled while sleeping. The mail states give the orchestrator enough information to do cleanup properly.\n\n**G7. Mail reader concurrency cap.** Add a configurable cap for concurrent mail reader sessions, separate from the commission cap.\n\n**Do NOT address:**\n- G2 (SDK resume after abort) — verified working, not a concern.\n- G6 (exit point to views spec) — dismissed, not relevant.\n\n**Remove the timeout system.** The `sleepTimeoutHours` configuration and periodic timeout checking infrastructure add complexity without clear value. A sleeping commission holds a worktree and branch but costs nothing in compute. If a commission needs to be cleaned up, the user can cancel it. Remove REQ-MAIL-21 and any references to automatic sleep timeout. If there's a compelling reason to keep it, note it as a future consideration rather than a requirement.\n\n**Terminology note:** Make sure the spec is clear that \"sleeping\" refers to the commission's lifecycle state (session drained, worktree held, waiting for mail reply), not a process-level sleep. If this is already clear, no action needed. If there's any ambiguity, tighten the language.\n\nRead the current spec first, then apply revisions. Preserve existing structure and requirement IDs where possible."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-07T04:45:19.661Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-07T04:45:19.662Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
