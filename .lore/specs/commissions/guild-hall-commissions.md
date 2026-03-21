---
title: Guild Hall Commissions
date: 2026-02-20
status: implemented
tags: [architecture, commissions, dispatch, process-lifecycle, async, crash-recovery]
modules: [guild-hall-core]
related:
  - .lore/brainstorm/agentic-work-ux.md
  - .lore/specs/infrastructure/guild-hall-system.md
  - .lore/specs/workers/guild-hall-workers.md
  - .lore/retros/worker-dispatch.md
  - .lore/retros/dispatch-hardening.md
  - .lore/research/claude-agent-sdk.md
req-prefix: COM
---

# Spec: Guild Hall Commissions

## Overview

Commissions are the async interaction mode in Guild Hall: the user or manager describes an outcome, a worker goes away and produces it. This spec defines the commission artifact, dispatch mechanics, process lifecycle, status transitions, the commission toolbox, concurrent limits, crash recovery, and the activity timeline.

A commission is the counterpart to a meeting. Meetings are synchronous (you talk to a worker in real time). Commissions are asynchronous (you describe the work, the worker runs autonomously, you review the deliverable).

The term "commission" replaces "task" from the brainstorm to avoid collision with lore-development's plan-decomposition tasks. The system spec uses "task" in its generic references to async work units; those refer to commissions.

Depends on: [Spec: Guild Hall System](guild-hall-system.md) for primitives, storage, activity branches, per-activity worktrees. [Spec: Guild Hall Workers](guild-hall-workers.md) for worker activation, toolbox resolution, resource bounds. Fulfills stubs: REQ-WKR-10 (commission toolbox).

## Entry Points

- User creates a commission through the UI and dispatches it (from [Spec: guild-hall-views](guild-hall-views.md))
- Manager worker creates and dispatches commissions programmatically (from REQ-WKR-25)
- Guild Hall checks commission dependencies and auto-transitions blocked/ready states (from artifact references, REQ-SYS-14)
- Guild Hall starts up and scans for orphaned commissions (from crash recovery)

## Requirements

### Commission Artifact

- REQ-COM-1: A commission is an artifact (REQ-SYS-2) that lives in the project's `.lore/commissions/` directory. Commission artifacts use the standard lore frontmatter schema with additional commission-specific fields. The commission-id is derived from the artifact filename (e.g., `research-oauth-patterns.md` has commission-id `research-oauth-patterns`). This ID is used in branch naming, worktree paths, and state file references.

- REQ-COM-2: Commission-specific fields beyond standard frontmatter:
  - **Worker**: which worker package handles this commission
  - **Prompt**: the agentic prompt (instructions for the worker describing the desired outcome)
  - **Status**: current commission state (see Status Transitions)
  - **Dependencies**: artifact paths this commission requires as inputs
  - **Linked artifacts**: artifacts this commission has produced (populated during and after execution)
  - **Resource overrides**: optional maxTurns and maxBudgetUsd that override the worker package defaults (REQ-WKR-19)

- REQ-COM-3: The agentic prompt is the primary input to the worker. It describes the desired outcome, not the steps to achieve it. The worker's posture and expertise shape how it approaches the prompt. Prompts should include verification criteria when possible: how the worker can self-assess whether it achieved the desired outcome. Completion is not just making an attempt; it's validating the result is correct.

- REQ-COM-3a: When a worker cannot verify its own output (no verification criteria provided, or criteria require judgment beyond its context), it should state its interpretation and proceed. Commissions are designed to be self-sufficient. Self-verification behavior is encoded in worker posture, not enforced by the system.

- REQ-COM-4: Commission creation follows the parity principle (REQ-SYS-39): the user creates commissions through the UI, the manager creates them programmatically, both produce the same artifact file.

### Status Transitions

- REQ-COM-5: Commissions have eight states:
  - **pending**: Created, dependencies satisfied, not yet dispatched.
  - **blocked**: Created, but one or more dependency artifacts don't exist yet.
  - **dispatched**: Dispatch initiated. Worktree, branch, and worker process being set up. Short-lived transitional state.
  - **in_progress**: Worker process is running.
  - **completed**: Worker submitted results successfully.
  - **failed**: Worker process crashed, exhausted resources, or was marked failed by crash recovery.
  - **cancelled**: User or manager explicitly cancelled the commission.
  - **abandoned**: User or manager permanently discarded the commission. Terminal: cannot be redispatched. Unlike `cancelled`, abandonment signals the work is no longer worth pursuing.

- REQ-COM-6: Valid transitions:
  - pending -> dispatched (user or manager dispatches)
  - pending -> blocked (dependency artifact removed)
  - pending -> cancelled
  - pending -> abandoned
  - blocked -> pending (all dependency artifacts now exist)
  - blocked -> cancelled
  - blocked -> abandoned
  - dispatched -> in_progress (worker process starts)
  - dispatched -> failed (activation failed, process failed to start)
  - dispatched -> cancelled (user or manager cancels during workspace preparation)
  - in_progress -> completed (worker calls submit_result, then exits cleanly)
  - in_progress -> failed (session error, budget exhaustion, daemon restart)
  - in_progress -> cancelled (user or manager cancels)
  - failed -> pending (redispatch, see REQ-COM-30)
  - failed -> abandoned
  - cancelled -> pending (redispatch, see REQ-COM-30)
  - cancelled -> abandoned

- REQ-COM-7: Dependency checking runs when artifacts are created or removed in the workspace. When all of a blocked commission's dependency artifacts exist, it auto-transitions to pending. When a pending commission loses a dependency artifact, it auto-transitions to blocked. This is existence checking ("does the file exist?"), not content validation.

- REQ-COM-8: Every status transition is recorded in the activity timeline with a timestamp and reason.

### Dispatch

- REQ-COM-9: Dispatching a commission involves:
  1. Verify commission is pending and all dependencies are satisfied
  2. Transition to dispatched
  3. Create an activity branch from `claude` (naming: `claude/commission/<commission-id>`)
  4. Create a worktree under `~/.guild-hall/worktrees/<project>/commission-<commission-id>/`
  5. Activate the worker (load package, call activation function with resolved tools and commission context). If activation fails (missing toolbox, invalid package), transition to failed with reason.
  6. Configure and launch an async SDK session within the daemon process. The session is controlled via an AbortController for cancellation.
  7. Write session state (session identifier, worktree path, start time) to machine-local state (REQ-SYS-26b). Transition to in_progress once the session is running.

  > **History (2026-03):** Steps 6-7 originally specified spawning a separate OS process (Bun.spawn) and recording the PID. Rewritten to match the in-process async session model that was built. Sessions run within the daemon process, not as child processes.

- REQ-COM-10: Each commission runs as an async session within the daemon, in its own worktree, and on its own branch. Session isolation through AbortController and separate worktrees provides containment: one commission failing does not affect others or the integration branch. Multiple commissions for the same project run concurrently without interfering with each other.

  > **History (2026-03):** Originally specified OS process isolation (separate Bun.spawn per commission). Rewritten to match the in-process async model. Containment is achieved through AbortController-based session management and per-commission worktrees rather than process boundaries.

- REQ-COM-11: The worker session receives the commission's agentic prompt as its primary input. The worker's system prompt (posture + injected memory, per Worker spec) shapes how it approaches the work.

### Process Lifecycle

- REQ-COM-12: The commission system monitors each running session: session identifier, start time, last heartbeat timestamp, and commission ID. Session identifiers and heartbeat timestamps are machine-local state stored in `~/.guild-hall/state/commissions/<commission-id>.json` (REQ-SYS-26b), not in the commission artifact. The commission artifact in the activity worktree holds the activity timeline and linked artifacts (REQ-SYS-26c). Liveness detection uses session callbacks (progress reports reset the heartbeat timer) rather than OS-level process checking.

  > **History (2026-03):** Originally specified PID-based monitoring with OS process liveness checks. Rewritten to match the in-process session model. Heartbeat mechanism is unchanged (progress reports reset the timer), but liveness detection uses session callbacks instead of PID checking.

- REQ-COM-13: The commission system tracks a `lastActivity` timestamp per session, updated whenever the session emits SDK events or the worker calls report_progress (REQ-COM-18). This timestamp is available for observability (e.g., "last active 2m ago" in the dashboard) but is not used for automated liveness decisions. The SDK manages its own timeouts for hung API calls; the commission system does not independently kill sessions based on inactivity.

- REQ-COM-14: When a session ends:
  - Normal completion with submitted result: transition to completed. Commit any pending changes on the integration worktree, then squash-merge the commission branch back to `claude` (see REQ-COM-31 for conflict handling). Clean up the worktree and remove the machine-local state file.
  - Normal completion without submitted result: transition to failed with reason "completed without submitting result."
  - Error with submitted result: transition to completed. The result was explicitly registered before the error. Record the error as an anomaly in the activity timeline. Squash-merge and clean up as normal.
  - Error without submitted result: transition to failed with error information. Preserve partial results.

  > **History (2026-03):** Originally framed as "process exit" with "clean exit" and "crash exit" categories. Rewritten for the in-process model where sessions end normally or with errors, not process exits.

- REQ-COM-14a: **Partial results** are: all artifacts written to the commission branch (committed or uncommitted), progress reports and questions in the activity timeline, decisions recorded via the base toolbox, and any memory writes the worker performed. Before cleaning up a worktree on failure or cancellation, the commission system commits any uncommitted changes to the commission branch. The branch preserves all work; the worktree is then safe to remove.

- REQ-COM-15: Cancellation signals the session runner to stop via AbortController. The session runner detects the abort and exits. Partial results are preserved per REQ-COM-14a. The commission branch is NOT merged; it remains available for inspection. The worktree is cleaned up after committing uncommitted work. Cancellation accepts an optional reason string (default: "Commission cancelled by user" for UI-initiated, "Commission cancelled by manager" for manager-initiated). The reason flows through to the activity timeline entry (REQ-COM-8), SSE status event, and integration worktree sync.

  > **History (2026-03):** Originally specified a two-phase termination (signal, then 30-second grace period, then forceful kill). Rewritten to match the AbortController model. In-process sessions respond to abort signals directly without needing a grace period or forceful termination.

- REQ-COM-16: On successful completion, the commission artifact is updated with final linked artifacts and completion timestamp.

### Commission Toolbox

- REQ-COM-17: The commission toolbox is a system toolbox injected when a worker executes a commission (fulfilling REQ-WKR-10). Workers do not declare it; the commission system provides it automatically alongside the base toolbox.

- REQ-COM-18: Commission toolbox tools:
  - **report_progress**: Update the commission's progress summary. Visible in the commission view and the manager's briefing.
  - **submit_result**: Declare the commission complete. Accepts a summary and an optional list of artifact paths produced. This is the explicit result channel. Tool calls are mechanisms; prompt instructions are hopes.

- REQ-COM-19: submit_result can only be called once per commission. Calling it registers the result; the completion transition happens when the session ends (normally or with error, per REQ-COM-14). If the worker continues after submit_result (cleanup, final memory writes), additional artifacts are still captured.

- REQ-COM-20: report_progress updates are append-only in the activity timeline and replace-latest in the commission's current progress field. The timeline preserves history; the commission shows the most recent.

### Concurrent Limits

- REQ-COM-21: Configurable concurrent commission limits:
  - **Per-project limit**: max running commissions per workspace (default: 3).
  - **Global limit**: max total running commissions across all workspaces (default: 10).

- REQ-COM-22: When dispatch would exceed a limit, the commission stays pending. The system dispatches it when capacity opens. Pending commissions dispatch in creation order (FIFO).

- REQ-COM-23: Limits are stored in config.yaml (per-project and global). Reducing limits does not cancel running commissions; dispatching pauses until the running count falls below the new limit. Increasing limits immediately dispatches pending commissions up to the new capacity in FIFO order.

### Activity Timeline

- REQ-COM-24: Each commission maintains an activity timeline: a chronological log of events. Events include:
  - Status transitions (from/to state, timestamp, reason)
  - Progress reports (from report_progress)
  - Decisions recorded (from base toolbox decision recording)
  - Artifacts produced (path, timestamp)
  - Session activity updates (last activity timestamp changes)

- REQ-COM-25: The timeline is append-only during execution and read-only after completion or failure.

- REQ-COM-26: The timeline answers: when did the worker start, what did it report, what questions did it raise, what artifacts did it produce, and why did it end?

### Crash Recovery

- REQ-COM-27: On startup, Guild Hall scans machine-local state files in `~/.guild-hall/state/commissions/` and commission artifacts in activity worktrees (REQ-SYS-26c). Sessions running within the daemon process do not survive a daemon restart, so all active commissions are treated as interrupted:
  - State file exists, worktree exists: transition to failed with reason "process lost on restart." Preserve partial results per REQ-COM-14a (commit uncommitted work, keep branch, clean up worktree).
  - State file exists, worktree missing: transition to failed with reason "state lost." The commission branch and its artifacts are preserved for manual or manager-assisted recovery.
  - Activity worktree exists but no state file (fresh install with pushed branches): transition to failed with reason "state lost." Preserve branch for recovery.

  > **History (2026-03):** Originally specified PID-based liveness checks on restart (check if process is alive, reattach if so). Rewritten because in-process sessions do not survive daemon restart. All active commissions are failed on startup; there is no reattach path.

- REQ-COM-28: During operation, session liveness is managed by the SDK's built-in timeout mechanisms. The `lastActivity` timestamp (REQ-COM-13) provides observability but does not trigger automated failure transitions. If the SDK session hangs beyond its configured timeout, the session ends with an error and follows the normal error path (REQ-COM-14).

- REQ-COM-29: Failed commissions preserve all state per REQ-COM-14a: the commission branch (not merged, not deleted), all committed artifacts, progress reports, questions, decisions, and the full activity timeline.

- REQ-COM-30: Re-dispatching a failed or cancelled commission creates a new branch and worktree. The previous branch remains for reference. The activity timeline is append-only across re-dispatches: a re-dispatch event is appended as a lifecycle marker, followed by events from the new execution. The full history of all attempts is preserved in a single timeline.

### Git Integration

- REQ-COM-31: Commission git operations follow the system spec's activity branch model (REQ-SYS-22, REQ-SYS-29a):
  - Branch: `claude/commission/<commission-id>`
  - Worktree: `~/.guild-hall/worktrees/<project>/commission-<commission-id>/`
  - Completion: commit any pending changes on the integration worktree (`claude`), then squash-merge the commission branch. `.lore/`-only conflicts are auto-resolved (activity branch wins). Non-`.lore/` conflicts abort the merge, transition the commission to failed, and create a Guild Master meeting request describing the conflict and affected files. On successful merge: clean up worktree, delete activity branch, remove machine-local state file. The commit-merge-cleanup sequence uses the shared `finalizeActivity()` function in `daemon/lib/git.ts` (same function used by meetings, see REQ-MTG-25).
  - Failure/cancellation: commit uncommitted work (REQ-COM-14a), clean up worktree, preserve branch

  Note: The system spec uses "task" where this spec uses "commission." REQ-SYS-22 shows `claude/task/<task-id>` as the naming convention; commissions use `claude/commission/<commission-id>` instead. The system spec's generic "task" references should be read as "commission" in this context.

- REQ-COM-32: Worktree checkout scope follows the assigned worker's declaration (REQ-SYS-29): sparse for artifact-only workers, full for workers needing the codebase.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Commission UI | Need to present commissions in the frontend | [Spec: guild-hall-views](guild-hall-views.md) |

## Success Criteria

- [ ] Commission artifacts are created in `.lore/commissions/` with required fields
- [ ] Status transitions follow the defined state machine; invalid transitions are rejected
- [ ] Dependency checking auto-transitions commissions between blocked and pending when artifacts appear or disappear
- [ ] Dispatch creates activity branch, worktree, and launches async session within the daemon
- [ ] Commission toolbox (report_progress, submit_result) is injected into worker sessions
- [ ] submit_result is the explicit result channel; clean exit without it is failure; crash after submit_result is still completion
- [ ] Concurrent limits enforced per-project and globally; excess commissions queue
- [ ] Activity timeline records all lifecycle events with timestamps
- [ ] Startup scan detects orphaned commissions, marks failed, preserves partial results
- [ ] Session activity timestamps provide observability into running commissions
- [ ] Failed commissions preserve branch, artifacts, and all recorded state
- [ ] Completed commissions squash-merge branch back to `claude`
- [ ] Re-dispatch creates fresh branch/worktree, preserves previous branch

## AI Validation

**Defaults:**
- Unit tests with mocked filesystem, git operations, and session management
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- State machine test: every valid transition succeeds; every invalid transition is rejected with clear error
- Dependency test: create commissions with dependencies, verify blocked/pending auto-transitions when artifacts appear/disappear
- Dispatch sequence test: dispatch a commission, verify worktree creation, branch creation, session launch, status progression through dispatched to in_progress
- Activation failure test: dispatch with missing toolbox or invalid worker package, verify clean transition to failed with descriptive reason
- Toolbox test: report_progress, submit_result write to correct locations and update commission state correctly
- Concurrent limit test: dispatch commissions up to and beyond limits, verify queuing and FIFO dispatch
- Crash recovery test: simulate daemon restart with active commissions, verify startup scan fails them, preserves partial results
- Cancellation test: cancel running commission via AbortController, verify session stops, branch preserved, worktree cleaned up
- Re-dispatch test: re-dispatch failed commission, verify new branch/worktree, previous branch preserved, timeline records new lifecycle
- Result preservation test: worker calls submit_result then crashes, verify result is preserved (not discarded by error handler)

## Constraints

- No database. All commission state is files.
- One worktree per commission, one branch per commission. One session at a time per commission.
- Workers don't manage their own lifecycle (REQ-SYS-9). The commission system manages everything outside the SDK session boundary.
- Agent SDK session details (model, tool configuration, streaming) belong to the Worker spec. This spec covers the session boundary.
- No direct worker-to-worker communication within a commission session. Commissions coordinate through artifact dependencies.
- Resource budget defaults need real-workload validation (lesson: 30 turns failed every real task, increased to 150).

## Context

- [Brainstorm: Agentic Work UX](.lore/brainstorm/agentic-work-ux.md): Lines 323-337 scope this spec. "Task" in the brainstorm = "commission" here. Renamed to avoid collision with lore-development's plan-decomposition tasks.
- [Spec: Guild Hall System](guild-hall-system.md): Foundation. Activity branches (REQ-SYS-22), per-activity worktrees (REQ-SYS-29a), artifact dependencies (REQ-SYS-14), parity principle (REQ-SYS-39).
- [Spec: Guild Hall Workers](guild-hall-workers.md): Worker activation (REQ-WKR-4a), commission toolbox stub (REQ-WKR-10), resource bounds (REQ-WKR-19), manager dispatch (REQ-WKR-25, REQ-WKR-27).
- Spec: Worker Dispatch (Phase 1) *(archived)*: Superseded. Internal tool patterns (status updates, decisions, questions, result submission) carry forward as commission and base toolbox tools.
- [Retro: Worker Dispatch](.lore/retros/worker-dispatch.md): submit_result tool is essential (prompt instructions are hopes, tool calls are mechanisms). Production wiring needs explicit planning.
- [Retro: Dispatch Hardening](.lore/retros/dispatch-hardening.md): Resource budgets need real-workload validation. Error handlers must preserve tool-submitted results.
- [Research: Claude Agent SDK](.lore/research/claude-agent-sdk.md): SDK provides query(), in-process tools, permission modes, resource bounds.
