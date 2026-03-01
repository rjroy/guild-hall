---
title: Activity state machine with enter/exit handlers
date: 2026-03-01
status: draft
tags: [architecture, refactor, state-machine, commission, meeting, lifecycle]
modules: [commission-session, meeting-session, commission-state-machine]
related:
  - .lore/specs/guild-hall-commissions.md
  - .lore/specs/guild-hall-meetings.md
  - .lore/diagrams/commission-session-internals.md
  - .lore/retros/in-process-commissions.md
  - .lore/retros/dispatch-hardening.md
  - .lore/retros/phase-5-git-integration-data-loss.md
req-prefix: ASM
---

# Spec: Activity State Machine

## Overview

Replace the current commission and meeting lifecycle implementations with a shared state machine pattern that drives operations through enter and exit handlers. Today, status transitions are value updates (write the new status to the artifact) while the actual lifecycle work (worktree creation, SDK session launch, squash-merge, cleanup) is scattered across handler functions in commission-session.ts (~1700 lines) and meeting-session.ts (~1300 lines). The state machine should own the side effects of transitions: entering a state triggers its setup, exiting a state triggers its teardown.

This is tech debt recovery, not just code movement. Behavioral inconsistencies have accumulated: the state machine is bypassed for redispatch (failed->pending) and merge-conflict failure (completed->failed), race conditions are handled by convention rather than mechanism, and cleanup logic is duplicated across paths with subtle differences. The refactor should fix these inconsistencies, not preserve them.

Both commissions and meetings are "activities": they have a status lifecycle, an activity worktree, an activity branch, and artifact-based state. The shared pattern should capture this structural similarity while allowing each activity type to define its own states, transitions, and handler behavior.

## Entry Points

- Commission CRUD operations call into the state machine to create, dispatch, cancel, and redispatch commissions (from commission-session.ts)
- Meeting operations call into the state machine to open, close, decline, and defer meetings (from meeting-session.ts)
- Dependency auto-transitions trigger state changes on commissions (from checkDependencyTransitions)
- Auto-dispatch triggers state changes when capacity opens (from tryAutoDispatch)
- Crash recovery triggers state changes on startup (from recoverCommissions, recoverMeetings)

## Requirements

### Shared State Machine Pattern

- REQ-ASM-1: An activity state machine is parameterized by its status type (CommissionStatus, MeetingStatus) and its active entry type (ActiveCommission, ActiveMeeting). The machine owns a Map of active entries, the transition graph, and the enter/exit handler registry.

- REQ-ASM-2: Each state can have an **enter handler** (called when the state is entered) and an **exit handler** (called when the state is left). Handlers are async. A transition from state A to state B runs: exit(A), update artifact status and append timeline entry, enter(B). If no handler is registered for a state, that phase is a no-op. The framework owns the artifact status write and timeline append; handlers do not write status themselves.

- REQ-ASM-3: Enter and exit handlers receive a context object containing the activity entry, the activity ID, the source state, the target state, a transition reason string, and any transition-specific data. The context type is defined per activity type, not shared generically. Commission handlers get commission-specific context (worktreeDir, branchName, projectPath, resultSubmitted, etc.). Meeting handlers get meeting-specific context.

- REQ-ASM-4: The state machine validates transitions against its graph before executing handlers. Invalid transitions throw, same as today. The graph is the source of truth for what transitions are allowed.

- REQ-ASM-5: The state machine owns the active entries Map. Adding entries (on dispatch/open), removing entries (on cleanup states), and querying entries (for capacity checks, artifact routing) all go through the machine's interface. External code does not directly read or mutate the Map. An activity is "active" (in the Map) from the moment it enters a running state (dispatched/in_progress for commissions, open for meetings) until it enters a cleanup state. Pending, blocked, and requested activities are not in the active Map.

- REQ-ASM-6: **Cleanup states** are states that remove the activity from the active Map. For commissions: completed, failed, cancelled. For meetings: closed, declined. These states may have outgoing transitions (e.g., failed -> pending for redispatch), but the activity is removed from the active Map on entry regardless. A subsequent transition like redispatch re-introduces the activity to the Map when it re-enters a running state, not when it returns to pending. This replaces the current pattern of manual `activeCommissions.delete()` calls scattered across cleanup functions.

### Handler Error Policy

- REQ-ASM-7: If an exit handler throws, the transition aborts. The activity remains in its current state. The error propagates to the caller. The artifact status is not updated (the framework writes status after exit, before enter).

- REQ-ASM-8: If an enter handler throws, the activity is in the target state (the artifact status was already written). The error propagates to the caller. For cleanup states, the activity is still removed from the active Map even if the enter handler throws partially through its work. This prevents orphaned entries in the Map when cleanup is incomplete. The handler should be structured so that Map removal and essential state-file writes happen before optional operations (merge, escalation).

### Race Safety

- REQ-ASM-9: If a transition is attempted from a state that has already been exited by a concurrent transition, the attempt is a no-op and returns a result indicating the transition was skipped. No handlers are invoked. This is the testable contract: given two concurrent `transition(id, "in_progress", "completed")` and `transition(id, "in_progress", "cancelled")` calls, exactly one executes its handlers and the other returns "skipped." The machine enforces this by tracking the current state per entry and rejecting transitions where the `from` state no longer matches.

### Commission Transition Graph

- REQ-ASM-10: The commission transition graph. All transitions are first-class edges validated by the machine. No bypasses.

  - pending -> dispatched, blocked, cancelled
  - blocked -> pending, cancelled
  - dispatched -> in_progress, failed
  - in_progress -> completed, failed, cancelled
  - completed -> failed (merge conflict after successful completion)
  - failed -> pending (redispatch)
  - cancelled -> pending (redispatch)

  Cleanup states: completed, failed, cancelled. These remove the activity from the active Map on entry (REQ-ASM-6). Redispatch (failed/cancelled -> pending) re-introduces the activity later when it transitions through dispatched into in_progress.

- REQ-ASM-11: The `completed -> failed` transition fires when squash-merge fails due to non-.lore/ conflicts. The enter-completed handler attempts the merge; on conflict, it triggers `transition(id, "completed", "failed", "Squash-merge conflict on non-.lore/ files")`. This replaces the current bypass that directly writes the status outside the state machine.

- REQ-ASM-12: The `failed -> pending` and `cancelled -> pending` transitions are the redispatch mechanism. The activity is not in the active Map at this point (it was removed when entering failed/cancelled). The enter-pending handler (from redispatch) increments the attempt counter based on timeline entries. The subsequent dispatch call uses this attempt number for branch naming.

### Commission Handlers

- REQ-ASM-13: **Enter dispatched**: Create activity branch from claude, create worktree, write state file, configure sparse checkout if needed. This replaces the setup portion of `dispatchCommission()`.

- REQ-ASM-14: **Enter in_progress**: Add to active Map, emit commission_status event, fire-and-forget SDK session. This replaces the session-launch portion of `dispatchCommission()`.

- REQ-ASM-15: **Exit in_progress**: The exit handler receives the target state. For cancellation (target = cancelled), abort the SDK session via AbortController. For completion or failure, no exit action needed (the SDK session has already finished or errored). This replaces `cancelCommission()`'s abort logic.

- REQ-ASM-16: **Enter completed**: Update result summary if submitted. Squash-merge activity branch to claude. Sync status to integration worktree. Clean up worktree (remove) and state file (delete). Fire the post-cleanup hook (REQ-ASM-29). If squash-merge fails due to non-.lore/ conflicts, trigger `transition(id, "completed", "failed", ...)` from within the handler (REQ-ASM-11). This replaces `handleCompletion()`'s success path.

- REQ-ASM-17: **Enter failed**: Emit commission_status event. Sync status to integration worktree. Preserve-and-cleanup worktree: commit any uncommitted changes to the activity branch, remove worktree, keep branch. Write state file. Fire the post-cleanup hook (REQ-ASM-29). If entering from completed (context.sourceState === "completed"), escalate to Guild Master meeting request with the conflicting branch name and commission ID. This replaces `terminateActiveCommission()` + `cleanupAfterTermination()`.

- REQ-ASM-18: **Enter cancelled**: Emit commission_status event. Sync status to integration worktree. Preserve-and-cleanup worktree: commit any uncommitted changes, remove worktree, keep branch. Write state file. Fire the post-cleanup hook (REQ-ASM-29). This replaces the cancelled path through `terminateActiveCommission()`.

- REQ-ASM-19: **Enter pending (from blocked)**: Dependency satisfaction. Fire the post-cleanup hook (REQ-ASM-29) to trigger auto-dispatch. This replaces the blocked -> pending path in `checkDependencyTransitions()`.

- REQ-ASM-20: **Enter blocked (from pending)**: Dependency missing. Emit commission_status event. No other action. This replaces the pending -> blocked path in `checkDependencyTransitions()`.

- REQ-ASM-21: **Enter pending (from failed/cancelled)**: Redispatch reset. No active Map changes (the activity was removed when entering failed/cancelled). The attempt counter is derived from terminal timeline entries at dispatch time, not stored as mutable state.

### Commission Session Logic

- REQ-ASM-22: The `resultSubmitted` flag determines the transition target when the SDK session ends. If `runCommissionSession` returns true (result submitted), transition in_progress -> completed. If false, transition in_progress -> failed with reason "Session completed without submitting result." If the session throws a non-abort error but `resultSubmitted` is true, transition in_progress -> completed (preserving the submitted result per dispatch-hardening retro). This decision logic lives outside the state machine, in the session runner that calls `transition()`.

### Meeting Transition Graph

- REQ-ASM-23: The meeting transition graph:
  - (initial) -> open (direct creation, no prior state)
  - requested -> open, declined
  - open -> closed

  Cleanup states: closed, declined.

  Direct meeting creation (createMeeting) is an initial state injection: the artifact is created with status "open" and the enter-open handler runs. There is no prior state in the graph. Meeting requests (createMeetingRequest) create artifacts with status "requested" and no handler runs; the transition happens later when the user accepts or declines.

### Meeting Handlers

- REQ-ASM-24: **Enter open (from requested)**: Accept meeting request. Read artifact from integration worktree. Create activity branch from claude and worktree. Configure sparse checkout if the worker requests it. Write state file. Create transcript and record initial user turn. Add to active Map. Start SDK session (yields events to caller). This replaces `acceptMeetingRequest()`.

- REQ-ASM-25: **Enter open (initial)**: Direct creation. Create artifact with status "open" in the activity worktree. Otherwise identical to REQ-ASM-24: create branch, worktree, state file, transcript, add to Map, start SDK session. This replaces `createMeeting()`.

- REQ-ASM-26: **Enter closed**: Abort any active SDK generation via AbortController. Generate meeting notes from transcript. Write notes to artifact. Squash-merge activity branch to claude. If merge succeeds, delete state file and fire the post-cleanup hook (REQ-ASM-29). If merge fails (non-.lore/ conflicts), preserve branch, escalate to Guild Master meeting request. Remove transcript if notes generation succeeded (preserve for manual review if it failed). Remove from active Map. This replaces `closeMeeting()`.

- REQ-ASM-27: **Enter declined**: No worktree or branch involved (the artifact lives on the integration worktree). This replaces `declineMeeting()`. The framework handles the artifact status write and timeline append (REQ-ASM-2).

### Single Entry Point

- REQ-ASM-28: The state machine's transition method is the single entry point for all state changes. No code outside the machine directly updates artifact status or the active entries Map. This eliminates the class of bugs where status updates happen in multiple places with inconsistent side effects. The only exception is initial state injection for direct meeting creation (REQ-ASM-25), which creates the artifact at the target state without a prior state.

### Post-Cleanup Hooks

- REQ-ASM-29: The state machine accepts registered callbacks that fire after a cleanup state's enter handler completes. Two hooks:
  - **onCleanup(activityId, projectName, status)**: Fires after any cleanup state is entered (completed, failed, cancelled, closed). The queue engine registers this to trigger auto-dispatch scanning. The dependency engine registers this to check if blocked commissions should unblock after a successful merge.
  - The hook fires after the enter handler finishes, not during it. This means the merge has either succeeded or failed, and the caller knows which. The hook receives enough context to decide whether to scan dependencies (only after successful merge) or scan the dispatch queue (after any cleanup).

  This replaces the current pattern of embedding `enqueueAutoDispatch()` and `checkDependencyTransitions()` calls inside cleanup functions. The hooks are external observers, not state machine internals.

### Artifact Path Routing

- REQ-ASM-30: The state machine provides an artifact path resolver that returns the correct base path (activity worktree or integration worktree) based on whether the activity is in the active Map. Activities in the Map have their artifacts in the activity worktree. Activities not in the Map (pending, blocked, completed, failed, cancelled, requested, declined) have their artifacts in the integration worktree. This replaces `resolveArtifactBasePath()` in commission-session.ts.

### Crash Recovery

- REQ-ASM-31: On daemon startup, recovery scans machine-local state files and checks whether activity worktrees still exist. Recovery does not use the state machine's transition method for the initial classification, because the activity was never in the current process's active Map. Instead:
  - **Commission with state file, worktree exists**: The commission was in_progress when the daemon died. Transition to failed with reason "process lost on restart." The enter-failed handler runs normally (commit partial results, remove worktree, keep branch, sync to integration, fire post-cleanup hook).
  - **Commission with state file, worktree missing**: Transition to failed with reason "state lost." Sync status to integration worktree directly (no activity worktree to clean up). Fire post-cleanup hook.
  - **Meeting with state file, worktree exists**: Re-add to active Map as "open." The meeting can accept new `sendMessage` calls. No transition fires.
  - **Meeting with state file, worktree missing**: Update artifact status to "closed" on integration worktree with reason "Worktree lost during daemon restart." Update state file. No transition fires.

  Recovery feeds into the existing hooks: failed commissions fire onCleanup, which triggers auto-dispatch for any queued commissions. This preserves the current recovery behavior (REQ-COM-27 through REQ-COM-29) while routing through the state machine's cleanup path where possible.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Commission routes | HTTP API calls create/dispatch/cancel/redispatch | [Spec: guild-hall-commissions](guild-hall-commissions.md) |
| Meeting routes | HTTP API calls create/send/close/accept/decline | [Spec: guild-hall-meetings](guild-hall-meetings.md) |
| EventBus | State transitions emit SSE events | Event subscribers |

## Success Criteria

- [ ] Commission and meeting lifecycle operations are driven by state transitions with enter/exit handlers
- [ ] The state machine owns the active entries Map; no external code directly mutates it
- [ ] All valid transitions are modeled as edges in the graph, including completed->failed and failed/cancelled->pending
- [ ] Concurrent transitions to the same activity: exactly one executes, the other is a no-op
- [ ] Auto-dispatch and dependency transitions are triggered by post-cleanup hooks, not embedded in handlers
- [ ] Handler errors propagate to callers; cleanup state enter handlers still remove from Map even on partial failure
- [ ] Crash recovery routes through the state machine's cleanup path, firing post-cleanup hooks
- [ ] All behaviors described in REQ-COM-5 through REQ-COM-32 are preserved
- [ ] All meeting lifecycle behaviors are preserved

## AI Validation

**Defaults:**
- Unit tests with mocked filesystem, git operations, and SDK sessions
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- State machine transition test: every edge in both graphs succeeds; every non-edge is rejected with descriptive error
- Enter/exit handler test: each handler's side effects are verified (worktree created, artifact updated, branch merged, Map entry added/removed, etc.)
- Race condition test: simulate concurrent `transition(id, "in_progress", "completed")` and `transition(id, "in_progress", "cancelled")`, verify exactly one executes handlers and the other returns "skipped"
- Handler error test: enter handler throws mid-execution, verify activity is removed from Map (cleanup state) and error propagates to caller
- Merge conflict escalation test: enter-completed triggers squash-merge failure, verify completed -> failed transition fires, Guild Master meeting request created with branch name and commission ID
- Redispatch test: failed -> pending -> dispatched -> in_progress sequence, verify attempt counter increments, new branch name has suffix
- Post-cleanup hook test: cleanup state entry fires onCleanup callback with activityId, projectName, and status
- Auto-dispatch via hook test: onCleanup triggers queue scan, pending commissions dispatch if capacity allows
- Dependency via hook test: onCleanup after successful merge triggers dependency check, blocked commissions unblock
- Meeting lifecycle test: requested -> open -> closed with notes generation, transcript cleanup, merge, and post-cleanup hook
- Direct meeting creation test: initial -> open with artifact creation, branch, worktree, SDK session
- Recovery test: simulate daemon restart with stale state files, verify commissions transition to failed through state machine, meetings re-add to Map or close based on worktree presence

## Constraints

- This is tech debt recovery. External API contracts (routes, events, artifact format) must not change. Internal behavior that was wrong (bypassing the state machine, inconsistent cleanup paths) should be fixed, not preserved.
- Build the new system alongside the current code, then reconcile. Do not attempt an in-place refactor of the existing 3000+ lines.
- The meeting's `sendMessage` and `interruptTurn` operations are not state transitions. They happen within the "open" state. The state machine does not own intra-state operations.
- The `deferred_until` field on meeting requests is an artifact mutation within the "requested" state, not a state transition.
- `createMeetingRequest` writes a "requested" artifact to the integration worktree without firing a transition. The transition happens later when the user accepts (requested -> open) or declines (requested -> declined).

## Context

- [Spec: Guild Hall Commissions](guild-hall-commissions.md): Defines the seven commission states, ten transitions, and lifecycle requirements. REQ-COM-5 through REQ-COM-16 are the behavioral requirements this refactor must preserve.
- [Spec: Guild Hall Meetings](guild-hall-meetings.md): Defines meeting states and lifecycle.
- [Diagram: Commission Session Internals](../diagrams/commission-session-internals.md): Maps state dependencies and identifies module boundaries. The "session lifecycle" cluster is what the state machine replaces.
- [Retro: In-Process Commission Migration](../retros/in-process-commissions.md): Race conditions between cancel and completion, terminal state guard pattern.
- [Retro: Dispatch Hardening](../retros/dispatch-hardening.md): Error handlers must preserve tool-submitted results. `resultSubmitted` check before classifying as failed.
- [Retro: Phase 5 Git Integration](../retros/phase-5-git-integration-data-loss.md): The completed -> failed bypass on merge conflict needs first-class modeling.
