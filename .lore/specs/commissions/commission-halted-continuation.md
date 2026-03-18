---
title: Commission Halted State and Continuation
date: 2026-03-16
status: implemented
tags: [commissions, lifecycle, halted, continuation, maxTurns, recovery]
modules: [commission-orchestrator, commission-lifecycle, sdk-runner]
related:
  - .lore/specs/commissions/guild-hall-commissions.md
  - .lore/specs/workers/worker-communication.md
  - .lore/specs/commissions/commission-status-tool.md
  - .lore/issues/commission-maxturns-no-recovery.md
  - .lore/brainstorm/commission-maxturns-recovery.md
req-prefix: COM
---

# Spec: Commission Halted State and Continuation

## Overview

When a commission hits `maxTurns` without submitting a result, the system currently treats it identically to any other failure: generic message, worktree deleted, no recovery path. The user loses visibility into partial work and has no way to resume from where the agent stopped.

This spec introduces `halted` as a new commission lifecycle state for commissions that ran out of turns with meaningful work in progress. Unlike `failed`, a halted commission preserves its worktree, branch, and session ID. The user can continue the work (resume the session in the same worktree), save the partial work (merge it without the agent finishing), or cancel and abandon it.

The sleeping/wake infrastructure (REQ-MAIL-1 through REQ-MAIL-3) establishes the pattern: drain the session, preserve the worktree, save state to a file, resume later with a new SDK session. This spec follows that pattern but diverges in trigger (resource limit, not mail) and wake semantics (user-initiated, not mail-reply-initiated).

Extends: [Spec: Guild Hall Commissions](guild-hall-commissions.md) (REQ-COM-5, REQ-COM-6, REQ-COM-14, REQ-COM-27, REQ-COM-29, REQ-COM-30). References: [Spec: Worker-to-Worker Communication](../workers/worker-communication.md) (REQ-MAIL-1, REQ-MAIL-3).

## Entry Points

- A commission session ends because `drainSdkSession` reaches `maxTurns` without `submit_result` having been called
- User or Guild Master triggers `continue` on a halted commission
- User or Guild Master triggers `save` on a halted commission
- User or Guild Master cancels a halted commission (existing flow)
- Daemon restarts with halted commissions in state files

## Requirements

### Halted State

- REQ-COM-33: `halted` is a new commission status. It means: the SDK session reached `maxTurns` without submitting a result, the worktree and branch are preserved, and the session ID is saved for resume. The commission is waiting for user action: continue, save, or cancel. This is a resource-limit state, not a failure state. The UI should show halted commissions distinctly from both in-progress and failed commissions.

- REQ-COM-34: Amends REQ-COM-5. Commissions now have ten states total: the original eight (REQ-COM-5), plus `sleeping` (REQ-MAIL-1), plus `halted` (this spec):
  - **pending**, **blocked**, **dispatched**, **in_progress**, **completed**, **failed**, **cancelled**, **abandoned** (unchanged)
  - **sleeping** (from REQ-MAIL-1, unchanged)
  - **halted**: Session reached maxTurns. Worktree preserved. Awaiting user action.

- REQ-COM-35: Amends REQ-COM-6. New valid transitions involving `halted`:
  - in_progress -> halted (maxTurns reached without result submission)
  - halted -> in_progress (continue action, see REQ-COM-39)
  - halted -> completed (save action, see REQ-COM-42)
  - halted -> cancelled (cancel action, existing cancel flow)
  - halted -> abandoned (abandon action, existing abandon flow)
  - halted -> failed (daemon restart recovery when worktree is missing, see REQ-COM-46)

  Note: `halted -> failed` only occurs when the worktree is missing on daemon restart. Halted commissions with intact worktrees stay halted across restarts (REQ-COM-46).

  Halted commissions cannot be redispatched. Redispatch (REQ-COM-30) creates a fresh branch and worktree, which is incompatible with the halted state's purpose of preserving in-place work. If the user wants a fresh start, they cancel and redispatch from cancelled.

- REQ-COM-36: Amends REQ-COM-14. When a session ends due to maxTurns without a submitted result, the commission transitions to `halted` instead of `failed`. The transition condition is: `outcome.reason === "maxTurns"` and `resultSubmitted === false`. All other failure modes (SDK errors, budget exhaustion, completion without result for non-maxTurns reasons) continue to transition to `failed` as before.

### Halted State Persistence

- REQ-COM-37: When entering `halted`, the system persists the following to the commission state file (`~/.guild-hall/state/commissions/<commission-id>.json`):
  - `commissionId`: the commission identifier
  - `projectName`: the project this commission belongs to
  - `workerName`: the assigned worker
  - `status`: `"halted"`
  - `worktreeDir`: absolute path to the preserved worktree
  - `branchName`: the commission branch name
  - `sessionId`: the SDK session ID for resume
  - `haltedAt`: ISO timestamp of when the halt occurred
  - `turnsUsed`: the number of turns consumed before halting
  - `lastProgress`: the most recent `current_progress` value (if any)

  This follows the same state file pattern as sleeping commissions (REQ-MAIL-3) with different fields appropriate to the halted context. The `sessionId` is required for session resume; the `turnsUsed` and `lastProgress` fields support diagnostic display.

- REQ-COM-38: Unlike `failed` (which commits partial work and deletes the worktree per REQ-COM-14a), `halted` keeps the worktree alive. Uncommitted changes are committed to the commission branch before entering the halted state (same commit behavior as the sleep path), but the worktree is not removed. The branch, worktree, and all artifacts remain in place for inspection or continuation.

  There is no TTL or automatic cleanup on halted worktrees. The user manages their own worktrees. If they want to discard, they cancel and abandon.

### Continue Action

- REQ-COM-39: `continue` resumes a halted commission. This is not a redispatch (fresh branch) or a retry (start over). It resumes the exact commission on the same worktree, same branch, with the same worker. The transition is `halted -> in_progress`.

- REQ-COM-40: When `continue` is triggered, the daemon:
  1. Reads the halted state file to recover `worktreeDir`, `branchName`, `sessionId`, `workerName`, and `lastProgress`.
  2. Verifies the worktree still exists on disk. If missing (manual deletion, filesystem failure), transitions to `failed` with reason "Worktree not found for halted commission."
  3. Transitions `halted -> in_progress` via the lifecycle state machine.
  4. Writes an updated state file with `status: "in_progress"`.
  5. Prepares and launches a new SDK session in the existing worktree, using the saved `sessionId` to resume the conversation.
  6. The session receives a continuation prompt (REQ-COM-41) instead of the original commission prompt.

  This mirrors the wake flow from the mail orchestrator (`wakeCommission` at mail/orchestrator.ts:501-564): read state, transition, update state file, launch resumed session. The difference is the trigger: user action instead of mail reply.

- REQ-COM-41: The continuation prompt provides the agent with context about why it stopped and what to do next. It includes:
  1. The reason for halting: "This commission was halted because it reached the turn limit ({turnsUsed} turns used)."
  2. The last progress report (if any): "Your last progress update was: {lastProgress}"
  3. Instruction to continue: "Continue working on the commission from where you left off. Your worktree contains all the work you've done so far. Review what remains and complete the task. When finished, call submit_result with your summary."

  This follows the precedent of REQ-MAIL-19 (wake-up prompt structure) but adapted for the halted context. The agent doesn't need to understand the mail system or sleeping semantics; it just needs to know it ran out of turns and should pick up where it stopped.

- REQ-COM-40a: A continued commission gets a fresh turn budget. The `maxTurns` for the resumed session uses the same value as the original dispatch (from `resource_overrides` or worker package defaults). Turn counts do not accumulate across continuations. Each continuation is an independent session with its own budget.

  The total turns consumed across all sessions (original + continuations) is tracked in the activity timeline but is not used for enforcement. If the user wants to increase the budget for a continuation, they update `resource_overrides` on the commission artifact before continuing.

### Save Action

- REQ-COM-42: `save` merges partial work from a halted commission into the integration branch without the agent completing its task. The user or Guild Master decides the work done so far is valuable enough to keep. The transition is `halted -> completed`.

- REQ-COM-43: When `save` is triggered, the daemon:
  1. Reads the halted state file to recover `worktreeDir`, `branchName`, and `projectName`.
  2. Verifies the worktree still exists. If missing, transitions to `failed` with reason "Worktree not found for save."
  3. Commits any uncommitted changes in the worktree (safety net, though REQ-COM-38 should have already committed on halt entry).
  4. Updates the commission artifact's `result_summary` field per REQ-COM-44.
  5. Runs the same squash-merge flow as successful completion (REQ-COM-31): merge the commission branch to `claude`, handle conflicts via escalation.
  6. If the merge succeeds: transitions to `completed`, cleans up the worktree, deletes the branch, removes the state file.
  7. If the merge fails (conflict): transitions to `failed` with the conflict reason, escalates to Guild Master (same as REQ-COM-31).

- REQ-COM-44: A saved commission's result is recorded as partial. The `result_summary` field is set to a system-generated message: "Partial work saved (commission was halted at {turnsUsed} turns). Last progress: {lastProgress}". The `save` action accepts an optional `reason` string that, if provided, replaces the system-generated message. This lets the Guild Master or user add context about why the partial work was worth keeping.

  The timeline entry for the save event records `event: "status_completed"` with `reason: "Saved partial work"` and `partial: true`. Downstream consumers (briefings, status tool) can distinguish a fully completed commission from a saved-partial one by checking for the `partial` field in the completion timeline entry.

### Artifact Changes

- REQ-COM-45: Amends REQ-COM-2. New commission artifact field:
  - **halt_count**: number of times this commission has been halted and continued. Starts at 0. Incremented on each `in_progress -> halted` transition. This field persists across continuations and is visible in the commission detail view. It answers "how many continuation cycles has this commission gone through?"

- REQ-COM-45a: New timeline events for halted commissions:
  - `status_halted`: Recorded on `in_progress -> halted`. Extra fields: `turnsUsed` (string), `lastProgress` (string, may be empty). Reason: "Turn limit reached ({N} turns used)".
  - `status_in_progress` (existing event name): Recorded on `halted -> in_progress` via continue. Reason: "Continued from halted state".
  - `status_completed` (existing event name): Recorded on `halted -> completed` via save. Extra field: `partial: "true"`. Reason includes the save context.

  These follow the same `event`/`reason`/extra-fields pattern established by REQ-COM-24 and REQ-MAIL-14.

### Crash Recovery

- REQ-COM-46: Amends REQ-COM-27. On daemon startup, halted commissions are recovered from their state files:
  - State file has `status: "halted"`, worktree exists: register the commission as `halted` in the lifecycle. No action needed; the commission waits for user action. This is different from `in_progress` recovery (which fails the commission) because halted commissions have no active session to lose.
  - State file has `status: "halted"`, worktree missing: transition to `failed` with reason "Worktree lost during restart." The branch is preserved (if it still exists). This is the only scenario where a halted commission transitions to failed without user action.

### Concurrent Limits

- REQ-COM-47: Halted commissions do NOT count against the concurrent commission cap (REQ-COM-21). Like sleeping commissions (REQ-MAIL-20), a halted commission has no active SDK session and no entry in the orchestrator's `executions` map. When a halted commission is continued (REQ-COM-39), it re-enters the executions map and counts against the cap. If the cap is full when `continue` is triggered, the continuation is rejected with a capacity error (not queued, because halted commissions are user-initiated and the user should know immediately). The commission remains `halted`; the rejection does not change its status.

### Guild Master Visibility

- REQ-COM-48: Amends REQ-CST-4 and REQ-CST-8. The `check_commission_status` tool handles halted commissions:
  - Single commission mode: `status` returns `"halted"`. Additionally includes `turnsUsed` (from state file or timeline) and `lastProgress`. These fields give the Guild Master enough context to recommend an action: continue if progress was advancing, cancel if the agent was stuck.
  - List mode: halted commissions appear in the **active** status group (alongside dispatched, in_progress, sleeping). They are sorted after in_progress commissions but before sleeping ones within the active group. The summary counts include halted in the `active` count.

- REQ-COM-49: The Guild Master can trigger `continue`, `save`, and `cancel` on halted commissions through the manager toolbox. Two new tools are added:
  - `continue_commission(commissionId: string)`: Triggers the continue action (REQ-COM-39). Returns success or a capacity error.
  - `save_commission(commissionId: string, reason?: string)`: Triggers the save action (REQ-COM-42). The optional `reason` flows into the result summary (REQ-COM-44).

  These follow the same factory pattern as existing manager tools (`makeContinueCommissionHandler(deps)`, `makeSaveCommissionHandler(deps)`). Both actions are also exposed through the commission orchestrator's public interface (`CommissionSessionForRoutes`) so that daemon routes can serve user-initiated requests from the UI using the same commission action route pattern as dispatch and cancel.

### Divergence from Sleeping

- REQ-COM-50: The halted state shares infrastructure patterns with sleeping (REQ-MAIL-1 through REQ-MAIL-3) but diverges in these ways:

  | Dimension | Sleeping | Halted |
  |-----------|----------|--------|
  | **Trigger** | Agent calls `send_mail` | `maxTurns` reached without result |
  | **Who decides when to resume** | System (mail reply arrives) | User or Guild Master |
  | **State file shape** | Includes `pendingMail` with reader info | Includes `turnsUsed` and `lastProgress` |
  | **Wake prompt source** | Mail reply content (REQ-MAIL-19) | Continuation context (REQ-COM-41) |
  | **Concurrent sessions** | Mail reader runs in the worktree while commission sleeps | No concurrent sessions; worktree is idle |
  | **Crash recovery** | Re-activates mail reader or wakes if reply exists | Stays halted; waits for user action |
  | **Auto-resume possible** | Yes (mail reply is the trigger) | No (user must explicitly continue) |

  The implementation should reuse the state file I/O, worktree preservation, and session resume patterns from the mail orchestrator. The orchestration logic (when to halt, how to continue, how to save) is commission-orchestrator responsibility, not mail-orchestrator responsibility.

## Success Criteria

- [ ] `halted` is a valid commission status with correct transitions in the state machine
- [ ] maxTurns without result submission transitions to `halted`, not `failed`
- [ ] Halted commissions preserve worktree, branch, session ID, and diagnostic info in state file
- [ ] `continue` resumes the session in the same worktree with a continuation prompt
- [ ] Continued sessions get a fresh turn budget
- [ ] `save` merges partial work to the integration branch and marks completion as partial
- [ ] Cancel and abandon work on halted commissions using existing flows
- [ ] Halted commissions do not count against the concurrent commission cap
- [ ] `check_commission_status` shows halted commissions with diagnostic fields
- [ ] Daemon restart recovers halted commissions correctly (stays halted if worktree exists, fails if missing)
- [ ] Activity timeline records halt, continuation, and save events with appropriate metadata
- [ ] `halt_count` tracks the number of halt/continue cycles

## AI Validation

**Defaults:**
- Unit tests with mocked filesystem, git operations, and session management
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- State machine test: verify `halted` transitions (in_progress -> halted, halted -> in_progress, halted -> completed, halted -> cancelled, halted -> abandoned, halted -> failed). Verify invalid transitions are rejected (halted -> pending, halted -> dispatched).
- Halt entry test: simulate maxTurns outcome, verify worktree preserved (not deleted), state file written with all required fields, timeline event recorded.
- Continue test: trigger continue on halted commission, verify worktree reused, session launched with continuation prompt, state file updated to in_progress.
- Continue with missing worktree test: delete the worktree manually, trigger continue, verify transition to failed.
- Save test: trigger save on halted commission, verify squash-merge to claude, completion marked as partial, worktree cleaned up.
- Save with conflict test: trigger save when merge would conflict, verify escalation and failure path.
- Capacity test: halt a commission, verify it doesn't count against cap. Continue it, verify it re-enters the cap.
- Recovery test: simulate daemon restart with halted state file and existing worktree, verify commission stays halted. Simulate with missing worktree, verify transition to failed.
- Multi-continuation test: halt, continue, halt again, continue again. Verify `halt_count` increments, timeline records all transitions, turn budgets are independent.
- Abandon test: abandon a halted commission, verify transition to abandoned, branch preserved, worktree cleaned up.
- Status tool test: verify `check_commission_status` returns halted status with `turnsUsed` and `lastProgress` fields.
- Status tool list mode test: verify halted commissions appear in the active group, sorted after in_progress and before sleeping.

## Constraints

- `continue` and `save` are commission orchestrator actions exposed through `CommissionSessionForRoutes`. User-initiated calls from the UI flow through existing commission action routes (the same route pattern used for dispatch and cancel). The manager toolbox calls these actions directly through the orchestrator interface. No new route structure is needed; the existing `POST /commission/run/*` pattern extends to cover `continue` and `save`.
- The `halted` state must not break the existing cancel, abandon, or dependency-check flows. All existing code that switches on `CommissionStatus` must handle the new state.
- Session resume depends on the Claude Agent SDK supporting conversation continuation via session ID. The sleeping/wake flow already uses this capability (mail/orchestrator.ts:560, passing `sessionId` to `prepareSdkSession`). If the SDK changes this behavior, both sleeping and halted resume paths break together.
- The `save` action reuses the existing squash-merge and conflict escalation infrastructure. No new git operations are introduced.

## Context

- [Spec: Guild Hall Commissions](guild-hall-commissions.md): Parent spec. REQ-COM-5 (states), REQ-COM-6 (transitions), REQ-COM-14 (session end), REQ-COM-27 (crash recovery), REQ-COM-30 (redispatch).
- [Spec: Worker-to-Worker Communication](../workers/worker-communication.md): Sleeping state precedent. REQ-MAIL-1 (sleeping state), REQ-MAIL-3 (sleeping persistence), REQ-MAIL-19 (wake prompt), REQ-MAIL-20 (sleeping doesn't count against cap).
- [Spec: Commission Status Tool](commission-status-tool.md): REQ-CST-4 (single commission fields), REQ-CST-8 (list mode grouping).
- [Issue: Commission maxTurns no recovery](../../issues/commission-maxturns-no-recovery.md): The problem this spec addresses.
- [Brainstorm: Commission maxTurns recovery](../../brainstorm/commission-maxturns-recovery.md): Explored options. Ideas 9 (sleeping analogy) and 10 (what the user needs) informed this spec directly.
