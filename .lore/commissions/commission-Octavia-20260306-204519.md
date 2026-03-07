---
title: "Commission: Spec Revisions: Worker-to-Worker Communication"
date: 2026-03-07
status: completed
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Revise the spec at `.lore/specs/worker-communication.md` based on review findings from `.lore/commissions/commission-Thorne-20260306-202023.md` and the following decisions from the user.\n\n**Fix these items:**\n\n**D1. Git commits out of tool handlers.** Remove git commits from the `send_mail` and `reply` tool handler steps (REQ-MAIL-14 steps 2c and 8c). Tools write files, the orchestrator handles git. Follow the same pattern as `submit_result`.\n\n**D2. Formalize `abandoned` state.** The `abandoned` state is used in this spec but not documented in the commissions spec. Add a note in this spec acknowledging that `abandoned` exists in implementation and is used here, and add an exit point to the commissions spec (`.lore/specs/guild-hall-commissions.md`) to formalize it.\n\n**G1. Commit before reader starts.** When a commission sleeps, commit the commission's work before the mail reader starts. Use `--no-verify` for this commit (it's an intermediate checkpoint, not a deliverable). This avoids the reader working on uncommitted files. Update the spec to reflect this.\n\n**G3. Sleep timeout should preserve reader's partial work.** Align the timeout path with the cancel path: abort reader, wait for drain, commit partial work. Don't just abort and transition to failed.\n\n**G4. Distinguish reader resource exhaustion.** When a mail reader exhausts maxTurns without calling `reply`, the wake-up prompt should distinguish \"ran out of turns\" from \"chose not to reply.\" These are different failure modes.\n\n**G5. Mail artifact states for cancellation.** Add states to the mail artifact: `sent` (created, reader not yet started), `open` (reader is active), `replied` (reader completed with reply). When a sleeping commission is cancelled:\n- If mail is `sent`: clean up, no reader to worry about.\n- If mail is `open`: wait for the reader to finish or abort it, then cancel.\n- If mail is `replied`: wake already pending, cancel proceeds normally.\nThis replaces the need for a \"circuit breaker\" on sleep cycles. The commission can already be cancelled while sleeping. The mail states give the orchestrator enough information to do cleanup properly.\n\n**G7. Mail reader concurrency cap.** Add a configurable cap for concurrent mail reader sessions, separate from the commission cap.\n\n**Do NOT address:**\n- G2 (SDK resume after abort) — verified working, not a concern.\n- G6 (exit point to views spec) — dismissed, not relevant.\n\n**Remove the timeout system.** The `sleepTimeoutHours` configuration and periodic timeout checking infrastructure add complexity without clear value. A sleeping commission holds a worktree and branch but costs nothing in compute. If a commission needs to be cleaned up, the user can cancel it. Remove REQ-MAIL-21 and any references to automatic sleep timeout. If there's a compelling reason to keep it, note it as a future consideration rather than a requirement.\n\n**Terminology note:** Make sure the spec is clear that \"sleeping\" refers to the commission's lifecycle state (session drained, worktree held, waiting for mail reply), not a process-level sleep. If this is already clear, no action needed. If there's any ambiguity, tighten the language.\n\nRead the current spec first, then apply revisions. Preserve existing structure and requirement IDs where possible."
dependencies: []
linked_artifacts:
  - .lore/specs/worker-communication.md

  - .lore/specs/guild-hall-commissions.md
  - .lore/specs/guild-hall-commissions.md
activity_timeline:
  - timestamp: 2026-03-07T04:45:19.661Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-07T04:45:19.662Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-07T04:45:19.698Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-07T04:45:26.631Z
    event: progress_report
    reason: "Starting spec revision. Reading the current worker-communication spec, the review findings, and the commissions spec."
  - timestamp: 2026-03-07T04:50:40.760Z
    event: progress_report
    reason: "All three documents read. Planning revisions: D1 (git commits out of tools), D2 (formalize abandoned), G1 (commit before reader), G4 (resource exhaustion distinction), G5 (mail artifact states), G7 (reader concurrency cap), timeout removal. Starting edits with the commissions spec first (smaller changes), then the worker-communication spec."
  - timestamp: 2026-03-07T04:55:06.179Z
    event: progress_report
    reason: "All edits applied to both specs. Running a final review pass to verify consistency, check for stale references, and ensure nothing was missed."
  - timestamp: 2026-03-07T04:56:28.722Z
    event: result_submitted
    reason: "Revised both specs per review findings and user decisions. Two files modified:\n\n**`.lore/specs/worker-communication.md`** (primary target):\n\n- **D1**: Removed git commits from `send_mail` (step 2c) and `reply` (step 8c) tool handlers. Tools write files, orchestrator commits during sleep transition and session completion. Follows the `submit_result` pattern.\n- **D2**: Added note at REQ-MAIL-2 acknowledging `abandoned` exists in implementation and is formalized in the commissions spec.\n- **G1**: REQ-MAIL-3 step 4 and REQ-MAIL-14 step 5 now commit the commission's pending changes with `--no-verify` before the mail reader starts.\n- **G4**: REQ-MAIL-14 step 10 and REQ-MAIL-19 now distinguish three no-reply outcomes: `maxTurns` exhaustion (\"ran out of turns\"), normal completion without replying, and session error. Each gets a distinct wake-up prompt.\n- **G5**: REQ-MAIL-18 defines three mail artifact states (`sent`, `open`, `replied`). REQ-MAIL-14 sets status to `sent` on creation (step 2b), `open` when reader starts (step 7b), `replied` when reader calls reply (step 9a). REQ-MAIL-22 rewrites the cancel/abandon flow to branch on mail status.\n- **G7**: REQ-MAIL-20 adds `maxConcurrentMailReaders` config (default: 5), separate from commission cap. Reader activations queue FIFO when at capacity.\n- **Timeout removal**: REQ-MAIL-5 and REQ-MAIL-21 removed entirely. `sleeping -> failed` trigger narrowed to \"worktree lost during daemon restart recovery.\" `sleepStartedAt` kept in state file for observability.\n- **REQ-MAIL-23**: Recovery rewritten to branch on mail file status (`replied` -> wake, `open` -> commit partial + re-activate reader, `sent` -> activate reader, worktree missing -> failed).\n- **REQ-MAIL-12**: Updated to reference REQ-MAIL-19 for wake-up prompt variants instead of hardcoding one message.\n- Success criteria and AI validation tests updated to match (timeout test removed, 5 new tests added for mail states, cancel-by-state, concurrency, resource exhaustion, commit-before-reader).\n- Terminology already clear: \"sleeping\" consistently described as commission lifecycle state throughout.\n\n**`.lore/specs/guild-hall-commissions.md`** (D2 formalization):\n\n- REQ-COM-5: Added `abandoned` as eighth state with definition.\n- REQ-COM-6: Added `pending -> abandoned`, `blocked -> abandoned`, `failed -> abandoned`, `cancelled -> abandoned` transitions. Also added `failed -> pending` and `cancelled -> pending` (redispatch) which existed in implementation but were missing from the spec.\n- Exit Points: Added row for sleeping commissions / mail pointing to worker-communication spec.\n- Constraints: Updated \"one session per commission\" and \"no worker-to-worker communication\" to acknowledge the mail system extension with cross-references."
  - timestamp: 2026-03-07T04:56:37.388Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All edits applied to both specs. Running a final review pass to verify consistency, check for stale references, and ensure nothing was missed."
projectName: guild-hall
---
Revised both specs per review findings and user decisions. Two files modified:

**`.lore/specs/worker-communication.md`** (primary target):

- **D1**: Removed git commits from `send_mail` (step 2c) and `reply` (step 8c) tool handlers. Tools write files, orchestrator commits during sleep transition and session completion. Follows the `submit_result` pattern.
- **D2**: Added note at REQ-MAIL-2 acknowledging `abandoned` exists in implementation and is formalized in the commissions spec.
- **G1**: REQ-MAIL-3 step 4 and REQ-MAIL-14 step 5 now commit the commission's pending changes with `--no-verify` before the mail reader starts.
- **G4**: REQ-MAIL-14 step 10 and REQ-MAIL-19 now distinguish three no-reply outcomes: `maxTurns` exhaustion ("ran out of turns"), normal completion without replying, and session error. Each gets a distinct wake-up prompt.
- **G5**: REQ-MAIL-18 defines three mail artifact states (`sent`, `open`, `replied`). REQ-MAIL-14 sets status to `sent` on creation (step 2b), `open` when reader starts (step 7b), `replied` when reader calls reply (step 9a). REQ-MAIL-22 rewrites the cancel/abandon flow to branch on mail status.
- **G7**: REQ-MAIL-20 adds `maxConcurrentMailReaders` config (default: 5), separate from commission cap. Reader activations queue FIFO when at capacity.
- **Timeout removal**: REQ-MAIL-5 and REQ-MAIL-21 removed entirely. `sleeping -> failed` trigger narrowed to "worktree lost during daemon restart recovery." `sleepStartedAt` kept in state file for observability.
- **REQ-MAIL-23**: Recovery rewritten to branch on mail file status (`replied` -> wake, `open` -> commit partial + re-activate reader, `sent` -> activate reader, worktree missing -> failed).
- **REQ-MAIL-12**: Updated to reference REQ-MAIL-19 for wake-up prompt variants instead of hardcoding one message.
- Success criteria and AI validation tests updated to match (timeout test removed, 5 new tests added for mail states, cancel-by-state, concurrency, resource exhaustion, commit-before-reader).
- Terminology already clear: "sleeping" consistently described as commission lifecycle state throughout.

**`.lore/specs/guild-hall-commissions.md`** (D2 formalization):

- REQ-COM-5: Added `abandoned` as eighth state with definition.
- REQ-COM-6: Added `pending -> abandoned`, `blocked -> abandoned`, `failed -> abandoned`, `cancelled -> abandoned` transitions. Also added `failed -> pending` and `cancelled -> pending` (redispatch) which existed in implementation but were missing from the spec.
- Exit Points: Added row for sleeping commissions / mail pointing to worker-communication spec.
- Constraints: Updated "one session per commission" and "no worker-to-worker communication" to acknowledge the mail system extension with cross-references.
