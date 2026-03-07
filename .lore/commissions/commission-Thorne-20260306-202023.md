---
title: "Commission: Review: Worker-to-Worker Communication Spec"
date: 2026-03-07
status: completed
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the spec at `.lore/specs/worker-communication.md` for clarity, completeness, and architectural soundness.\n\n**Context:** This spec was written from the brainstorm at `.lore/brainstorm/worker-communication.md`. It covers sleeping commissions (new lifecycle state), mail (new context type), mail toolbox, the full send-mail-sleep-wake flow, `.lore/` storage layout, wake-up prompt content, and resource model.\n\n**Review against:**\n- `.lore/brainstorm/worker-communication.md` — Does the spec faithfully carry forward all decisions made in the brainstorm? Are any open questions left unresolved that should have been decided?\n- `.lore/specs/guild-hall-system.md` — Does the spec integrate cleanly with the existing system architecture?\n- `.lore/specs/guild-hall-commissions.md` — Do the new commission states (sleeping) and transitions fit the existing lifecycle without contradiction?\n- `.lore/specs/guild-hall-workers.md` — Does the mail context type and worker activation flow align with existing worker patterns?\n- `CLAUDE.md` — Does the spec respect the five concerns boundary (Session, Activity, Artifact, Toolbox, Worker)?\n\n**Look for:**\n- Gaps: scenarios not covered (error cases, edge cases, race conditions)\n- Contradictions with existing specs\n- Ambiguity that would leave an implementer guessing\n- Over-specification where flexibility would be better\n- Whether the spec is implementable as written\n\nWrite your findings to `.lore/reviews/worker-communication-spec-review.md`."
dependencies: []
linked_artifacts:
  - .lore/reviews/worker-communication-spec-review.md

activity_timeline:
  - timestamp: 2026-03-07T04:20:23.794Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-07T04:20:23.795Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-07T04:20:23.829Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-07T04:20:32.792Z
    event: progress_report
    reason: "Starting review. Reading the spec under review and all reference documents in parallel."
  - timestamp: 2026-03-07T04:22:26.889Z
    event: progress_report
    reason: "All reference documents read. Beginning cross-referencing analysis: checking brainstorm fidelity, commission lifecycle integration, worker spec alignment, and five-concerns boundary compliance."
  - timestamp: 2026-03-07T04:23:48.623Z
    event: progress_report
    reason: "Cross-referencing complete. Found significant findings in five categories: defects (boundary violations, unspecified state dependencies), gaps (unverified SDK assumptions, race conditions, missing error handling), ambiguity (config placement, event schemas), missing integrations (exit points, UI updates), and over-specification. Writing the review document now."
  - timestamp: 2026-03-07T04:26:29.774Z
    event: result_submitted
    reason: "Completed review of `.lore/specs/worker-communication.md` against the brainstorm and three existing specs. Could not write the review file to `.lore/reviews/worker-communication-spec-review.md` due to Write and Bash permissions being denied in the current permission mode.\n\n**Review summary: The spec is implementable with fixes to two defects and resolution of one blocking question.**\n\n## Defects (2)\n\n**D1. Git commits in tool handlers violate the five-concerns boundary.** REQ-MAIL-14 steps 2c and 8c put git commits inside the `send_mail` and `reply` tool handlers. The existing `submit_result` handler writes to the artifact file and signals via callback; the orchestrator handles git. The spec should follow the same pattern: tools write files, orchestrator commits during the sleep transition and session completion.\n\n**D2. `abandoned` state referenced but not formally specified.** REQ-MAIL-2 and REQ-MAIL-22 use `abandoned` as if it's a defined commission state. REQ-COM-5 lists seven states; `abandoned` is not among them. The implementation includes `abandoned` in `CommissionStatus` (daemon/types.ts:43) and the transition graph (lifecycle.ts:55), but no spec documents it. The commissions spec should be updated to formalize `abandoned` before this spec ships.\n\n## Gaps (7)\n\n**G1. Uncommitted commission work when the reader starts.** REQ-MAIL-3 says \"no commit of partial work\" on sleep. The reader enters a worktree with the commission's uncommitted changes and can modify the same files. No isolation mechanism specified. The spec should decide: commit before reader starts, stash and restore, or accept the risk and document it.\n\n**G2. SDK session resume after abort is unverified (BLOCKING).** The sleep/wake mechanism depends on resuming a session that was aborted via AbortController. The SDK docs document `resume` but don't confirm it works on aborted sessions. If it doesn't, the entire mechanism is non-functional. Needs a spike or SDK verification before implementation.\n\n**G3. Sleep timeout doesn't preserve reader's partial work.** REQ-MAIL-22 (cancel) specifies: abort reader, wait for drain, commit partial work. REQ-MAIL-21 (timeout) just aborts and transitions to failed. Should use the same preservation procedure.\n\n**G4. Reader resource exhaustion not classified as distinct outcome.** When the reader exhausts maxTurns without calling `reply`, it falls into the generic \"completed without replying\" path. The wake-up prompt should distinguish \"ran out of turns\" from \"chose not to reply.\"\n\n**G5. No circuit breaker for repeated sleep/wake cycles.** REQ-MAIL-4 says commissions can sleep multiple times with no limit. A flawed worker could loop indefinitely. Add a configurable max sleep count.\n\n**G6. No exit point to views spec.** REQ-MAIL-1 says the UI should show sleeping commissions distinctly, but the Exit Points section says \"None.\"\n\n**G7. No mail reader concurrency cap.** REQ-MAIL-20 says mail sessions are managed separately from the commission cap but defines no separate limit.\n\n## Ambiguity (4)\n\n**A1.** `sleepTimeoutHours` config location unspecified (global? per-project?).\n**A2.** EventBus event types (`commission_mail_sent`, `mail_reply_received`) referenced but payloads not defined.\n**A3.** Periodic timeout checking is new daemon infrastructure that doesn't exist yet. The spec assumes it does.\n**A4.** Reader's checkout scope declaration is silently ignored in mail context. Should be stated explicitly in REQ-MAIL-7.\n\n## Over-specification (1)\n\n**O1.** `files_modified` parameter on the `reply` tool adds complexity with no benefit over `git status` detection.\n\n## Brainstorm Fidelity\n\nAll six decisions carried forward. All four open questions resolved. Path changed from `.lore/mailbox/` to `.lore/mail/` (reasonable refinement). Faithful to the brainstorm.\n\n## Existing Spec Compatibility\n\nNo contradictions with workers or system specs. Two commissions spec constraints are superseded (\"no worker-to-worker communication\" and \"one session per commission\") and should be acknowledged. The `abandoned` state gap (D2) is the only cross-spec issue.\n\nThe full review text is in the commission conversation context and can be extracted to create the review file."
  - timestamp: 2026-03-07T04:26:35.699Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
  - timestamp: 2026-03-07T04:26:35.917Z
    event: status_completed
    reason: "Execution completed"
current_progress: "Cross-referencing complete. Found significant findings in five categories: defects (boundary violations, unspecified state dependencies), gaps (unverified SDK assumptions, race conditions, missing error handling), ambiguity (config placement, event schemas), missing integrations (exit points, UI updates), and over-specification. Writing the review document now."
projectName: guild-hall
---
Completed review of `.lore/specs/worker-communication.md` against the brainstorm and three existing specs. Could not write the review file to `.lore/reviews/worker-communication-spec-review.md` due to Write and Bash permissions being denied in the current permission mode.

**Review summary: The spec is implementable with fixes to two defects and resolution of one blocking question.**

## Defects (2)

**D1. Git commits in tool handlers violate the five-concerns boundary.** REQ-MAIL-14 steps 2c and 8c put git commits inside the `send_mail` and `reply` tool handlers. The existing `submit_result` handler writes to the artifact file and signals via callback; the orchestrator handles git. The spec should follow the same pattern: tools write files, orchestrator commits during the sleep transition and session completion.

**D2. `abandoned` state referenced but not formally specified.** REQ-MAIL-2 and REQ-MAIL-22 use `abandoned` as if it's a defined commission state. REQ-COM-5 lists seven states; `abandoned` is not among them. The implementation includes `abandoned` in `CommissionStatus` (daemon/types.ts:43) and the transition graph (lifecycle.ts:55), but no spec documents it. The commissions spec should be updated to formalize `abandoned` before this spec ships.

## Gaps (7)

**G1. Uncommitted commission work when the reader starts.** REQ-MAIL-3 says "no commit of partial work" on sleep. The reader enters a worktree with the commission's uncommitted changes and can modify the same files. No isolation mechanism specified. The spec should decide: commit before reader starts, stash and restore, or accept the risk and document it.

**G2. SDK session resume after abort is unverified (BLOCKING).** The sleep/wake mechanism depends on resuming a session that was aborted via AbortController. The SDK docs document `resume` but don't confirm it works on aborted sessions. If it doesn't, the entire mechanism is non-functional. Needs a spike or SDK verification before implementation.

**G3. Sleep timeout doesn't preserve reader's partial work.** REQ-MAIL-22 (cancel) specifies: abort reader, wait for drain, commit partial work. REQ-MAIL-21 (timeout) just aborts and transitions to failed. Should use the same preservation procedure.

**G4. Reader resource exhaustion not classified as distinct outcome.** When the reader exhausts maxTurns without calling `reply`, it falls into the generic "completed without replying" path. The wake-up prompt should distinguish "ran out of turns" from "chose not to reply."

**G5. No circuit breaker for repeated sleep/wake cycles.** REQ-MAIL-4 says commissions can sleep multiple times with no limit. A flawed worker could loop indefinitely. Add a configurable max sleep count.

**G6. No exit point to views spec.** REQ-MAIL-1 says the UI should show sleeping commissions distinctly, but the Exit Points section says "None."

**G7. No mail reader concurrency cap.** REQ-MAIL-20 says mail sessions are managed separately from the commission cap but defines no separate limit.

## Ambiguity (4)

**A1.** `sleepTimeoutHours` config location unspecified (global? per-project?).
**A2.** EventBus event types (`commission_mail_sent`, `mail_reply_received`) referenced but payloads not defined.
**A3.** Periodic timeout checking is new daemon infrastructure that doesn't exist yet. The spec assumes it does.
**A4.** Reader's checkout scope declaration is silently ignored in mail context. Should be stated explicitly in REQ-MAIL-7.

## Over-specification (1)

**O1.** `files_modified` parameter on the `reply` tool adds complexity with no benefit over `git status` detection.

## Brainstorm Fidelity

All six decisions carried forward. All four open questions resolved. Path changed from `.lore/mailbox/` to `.lore/mail/` (reasonable refinement). Faithful to the brainstorm.

## Existing Spec Compatibility

No contradictions with workers or system specs. Two commissions spec constraints are superseded ("no worker-to-worker communication" and "one session per commission") and should be acknowledged. The `abandoned` state gap (D2) is the only cross-spec issue.

The full review text is in the commission conversation context and can be extracted to create the review file.
