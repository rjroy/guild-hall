---
title: "Plan: Activity state machine with enter/exit handlers"
date: 2026-03-01
status: draft
tags: [architecture, refactor, state-machine, commission, meeting, lifecycle]
modules: [commission-session, meeting-session, commission-state-machine, activity-state-machine]
related:
  - .lore/specs/activity-state-machine.md
  - .lore/design/activity-state-machine.md
  - .lore/diagrams/commission-session-internals.md
  - .lore/retros/in-process-commissions.md
  - .lore/retros/dispatch-hardening.md
  - .lore/retros/phase-5-git-integration-data-loss.md
  - .lore/retros/worker-dispatch.md
  - .lore/plans/abandoned-commission-state.md
---

# Plan: Activity State Machine

## Spec Reference

**Spec**: `.lore/specs/activity-state-machine.md`
**Design**: `.lore/design/activity-state-machine.md`

Requirements addressed:

- REQ-ASM-1: Machine parameterized by status, ID, entry types -> Step 1
- REQ-ASM-2: Enter/exit handler execution with artifact write between -> Step 1
- REQ-ASM-3: Per-activity context types -> Steps 2, 4
- REQ-ASM-4: Transition validation against graph -> Step 1
- REQ-ASM-5: Machine owns active entries Map -> Step 1
- REQ-ASM-6: Cleanup states remove from active Map -> Step 1
- REQ-ASM-7: Exit handler error aborts transition -> Step 1
- REQ-ASM-8: Enter handler error in cleanup: Map removal still happens -> Step 1
- REQ-ASM-9: Concurrent transitions: one executes, other skipped -> Step 1
- REQ-ASM-10: Commission transition graph (extended with abandoned) -> Step 2
- REQ-ASM-11: Completed -> failed re-entrant transition on merge conflict -> Steps 1, 2
- REQ-ASM-12: Redispatch mechanism (failed/cancelled -> pending) -> Step 2
- REQ-ASM-13: Enter dispatched handler -> Step 2
- REQ-ASM-14: Enter in_progress handler -> Step 2
- REQ-ASM-15: Exit in_progress handler -> Step 2
- REQ-ASM-16: Enter completed handler -> Step 2
- REQ-ASM-17: Enter failed handler -> Step 2
- REQ-ASM-18: Enter cancelled handler -> Step 2
- REQ-ASM-19: Enter pending from blocked -> Step 2
- REQ-ASM-20: Enter blocked from pending -> Step 2
- REQ-ASM-21: Enter pending from failed/cancelled -> Step 2
- REQ-ASM-22: resultSubmitted determines transition target -> Step 3
- REQ-ASM-23: Meeting transition graph -> Step 4
- REQ-ASM-24: Enter open from requested -> Step 4
- REQ-ASM-25: Enter open (initial injection) -> Step 4
- REQ-ASM-26: Enter closed -> Step 4
- REQ-ASM-27: Enter declined -> Step 4
- REQ-ASM-28: Single entry point for all state changes -> Steps 3, 5
- REQ-ASM-29: Post-cleanup hooks -> Steps 1, 3
- REQ-ASM-30: Artifact path resolver -> Steps 1, 3, 5
- REQ-ASM-31: Crash recovery through machine -> Step 6

## Codebase Context

**Preparatory refactoring is complete.** Five commits on this branch extracted modules from commission-session.ts: `commission-state-machine.ts` (stateless validator, 70 lines), `commission-recovery.ts` (279 lines), `commission-capacity.ts` (57 lines), `commission-sdk-logging.ts` (70 lines). `finalizeActivity()` was extracted to `daemon/lib/git.ts` as a shared squash-merge helper. Termination helpers (`terminateActiveCommission`, `cleanupAfterTermination`) were unified.

**Current file sizes:** commission-session.ts (1,623 lines), meeting-session.ts (1,293 lines). Both exceed the ~800 line heuristic. The state machine extraction will reduce them significantly by moving lifecycle handler logic out.

**Current state machine:** `commission-state-machine.ts` is a stateless validator (graph validation + artifact write). It treats completed, failed, cancelled as terminal (no outgoing edges). The spec adds three edges: completed -> failed (merge conflict), failed -> pending (redispatch), cancelled -> pending (redispatch). The abandoned state plan adds four more inbound edges to abandoned.

**Active entries:** Commission session uses `Map<string, ActiveCommission>`, meeting session uses `Map<MeetingId, ActiveMeeting>`. Both Maps are closed over by their factory functions and manipulated in multiple places. The state machine consolidates ownership.

**DI pattern:** Both sessions use factory functions (`createCommissionSession(deps)`, `createMeetingSession(deps)`) that return an interface. The machine will be instantiated inside each factory, configured with handlers that close over the factory's deps.

**Key retro lessons applied in this plan:**
- DI factories need explicit production wiring in `daemon/app.ts` (worker-dispatch retro)
- `cleanGitEnv()` required for all git subprocess paths (phase 5 retro)
- Fresh-eyes review catches wiring gaps (in-process commissions retro)
- Happy-path logging alongside error logging (phase 4 retro)

**Abandoned state inclusion (by decision, not spec).** The `abandoned` terminal state is not in the spec (REQ-ASM-10 doesn't include it). It is included here by explicit decision to avoid a follow-up PR for something the machine makes trivial to add. The graph edges, enter handler, and `CommissionStatus` type update are in scope. The route, UI, and toolbox changes from the draft plan at `.lore/plans/abandoned-commission-state.md` remain separate work. The state machine graph accommodates abandoned without being externally triggerable until those changes land.

## Implementation Steps

### Step 1: Build the ActivityMachine class

**Files**: `daemon/lib/activity-state-machine.ts` (new), `tests/daemon/lib/activity-state-machine.test.ts` (new)
**Addresses**: REQ-ASM-1, REQ-ASM-2, REQ-ASM-4, REQ-ASM-5, REQ-ASM-6, REQ-ASM-7, REQ-ASM-8, REQ-ASM-9, REQ-ASM-11, REQ-ASM-28, REQ-ASM-29, REQ-ASM-30

Build the generic `ActivityMachine<TStatus, TId, TEntry>` class per the design doc's interface specification. This is the core framework with no commission- or meeting-specific logic. All types defined in the design doc (`TransitionContext`, `EnterHandlerResult`, `CleanupEvent`, `CleanupHook`, `ArtifactOps`, `ActivityMachineConfig`, `TransitionResult`) go in this file.

Key behaviors:
- **Transition execution order**: validate graph edge, acquire per-entry lock, run exit handler, write artifact status + timeline (via `ArtifactOps`), update state tracker, release lock, remove from active Map if cleanup state, add to active Map if active state, run enter handler, fire cleanup hooks if cleanup state.
- **Re-entrant transitions**: The two-phase approach from the design doc. Phase 1 (lock held): exit handler + artifact write + state tracker update. Phase 2 (lock released): enter handler runs, can call `transition()` re-entrantly. After enter returns, check if state tracker still shows the target state; if a re-entrant transition changed it, skip cleanup hooks for the original target. When a re-entrant transition changes the final state, the outer `transition()` still returns `{ outcome: "executed", finalState: <tracker state> }`, not "skipped." The "skipped" outcome is reserved for the concurrent-stale-from-state case only.
- **Concurrent transition safety**: Per-entry lock prevents concurrent transitions through Phase 1. State tracker check in `transition()` rejects stale `from` states. Returns `{ outcome: "skipped", reason: "..." }` when the entry's current state doesn't match the expected `from`.
- **Cleanup state Map removal**: Remove from active Map BEFORE calling enter handler (REQ-ASM-8). Idempotent, so re-entrant cleanup-to-cleanup transitions don't break.
- **Cleanup hooks**: Fire sequentially (await each) after the enter handler completes for cleanup states. Skip if a re-entrant transition already fired hooks for the final state. Hook receives `CleanupEvent` with `mergeSucceeded` defaulting to false if the handler didn't return one or threw.
- **inject()**: Creates entry at target state without prior graph validation. Runs enter handler with `sourceState: null`. Adds to active Map if target is in `activeStates`. Throws if ID already tracked.
- **register()**: Adds entry to state tracker at given state. No handler execution, no Map manipulation. For initial commission/meeting registration at non-active states (pending, requested).
- **registerActive()**: Adds entry to state tracker AND active Map at the given state. No handler execution. For recovery of open meetings where the worktree already exists and the enter handler must NOT re-run. Throws if not an activeState. This method exists because `inject()` runs the enter handler (inappropriate for recovery) and `register()` doesn't add to the active Map (insufficient for active-state recovery).
- **forget()**: Removes entry from state tracker and active Map. No-op if not tracked.
- **resolveArtifactPath()**: Delegates to `artifactOps.resolveBasePath()` passing whether entry is in active Map. Throws if not tracked.

Implementation note on the per-entry lock: Bun is single-threaded, so "concurrent" transitions are interleaved at await points. The lock is a per-entry promise chain (similar to the existing `autoDispatchChain` pattern in commission-session.ts). Acquiring the lock means chaining onto the promise; releasing means resolving it.

**Tests** (this step carries the heaviest test load since it defines the machine's contract):
- Every valid edge in a sample graph succeeds; every non-edge rejects with descriptive error
- Exit handler runs before artifact write; enter handler runs after
- Exit handler throw aborts transition, artifact unchanged, error propagates
- Enter handler throw in non-cleanup state: error propagates, state is updated (REQ-ASM-8 inverse)
- Enter handler throw in cleanup state: entry removed from active Map, error propagates, cleanup hooks still fire with `mergeSucceeded: false`
- Concurrent `transition(id, A, B)` and `transition(id, A, C)`: exactly one executes, other returns `{ outcome: "skipped" }`
- Re-entrant transition from enter handler: inner transition executes, outer returns `finalState` matching inner target, hooks fire once for final state
- `inject()` creates entry, runs enter handler, adds to active Map
- `inject()` throws if ID already tracked
- `register()` populates state tracker without Map or handler effects
- `registerActive()` populates state tracker AND active Map, throws if state not in activeStates
- `forget()` removes from tracker and Map
- `resolveArtifactPath()` returns correct path based on Map membership
- Cleanup hooks fire in registration order after cleanup state entry
- Cleanup hooks do not fire for non-cleanup states
- `activeCount` reflects Map additions and removals through transitions

### Step 2: Build commission handlers and graph configuration

**Files**: `daemon/services/commission-handlers.ts` (new), `daemon/types.ts` (modify: add "abandoned" to `CommissionStatus` union), `tests/daemon/services/commission-handlers.test.ts` (new)
**Addresses**: REQ-ASM-3, REQ-ASM-10, REQ-ASM-11, REQ-ASM-12, REQ-ASM-13, REQ-ASM-14, REQ-ASM-15, REQ-ASM-16, REQ-ASM-17, REQ-ASM-18, REQ-ASM-19, REQ-ASM-20, REQ-ASM-21

Define `CommissionTransitionContext` as the concrete alias for `TransitionContext<CommissionId, CommissionStatus, ActiveCommission>`.

Create a factory function `createCommissionHandlers(deps)` that takes commission-specific dependencies (eventBus, gitOps, activateFn, fileExists, createMeetingRequestFn, withProjectLock) and returns the handler map (`{ enter, exit }`) and the machine configuration object. The handlers close over deps.

**Commission transition graph** (REQ-ASM-10 extended with abandoned):

```
pending     -> dispatched, blocked, cancelled, abandoned
blocked     -> pending, cancelled, abandoned
dispatched  -> in_progress, failed
in_progress -> completed, failed, cancelled
completed   -> failed
failed      -> pending, abandoned
cancelled   -> pending, abandoned
abandoned   -> (terminal, no outgoing edges)
```

`activeStates`: `["dispatched", "in_progress"]`
`cleanupStates`: `["completed", "failed", "cancelled", "abandoned"]`

**Handler implementations** (extracted from commission-session.ts lifecycle functions):

- **Enter dispatched** (REQ-ASM-13): Create activity branch from claude, create worktree, write state file, configure sparse checkout. Set `entry.worktreeDir` and `entry.branchName` on the context entry. All git operations must use `cleanGitEnv()`.

- **Enter in_progress** (REQ-ASM-14): Set `entry.abortController`, `entry.startTime`, `entry.lastActivity`. Emit `commission_status` event. Invoke the session runner via a fire-and-forget pattern (`void runCommissionSession(...).then(...)`) where the `.then()` calls `machine.transition()` based on `resultSubmitted` (see Step 3, REQ-ASM-22). The handler returns after emitting the event; it does not await the SDK session.

- **Exit in_progress** (REQ-ASM-15): If `ctx.targetState === "cancelled"`, abort the SDK session via `entry.abortController.abort()`. No action for other targets (session already finished or errored).

- **Enter completed** (REQ-ASM-16): Update result summary if `entry.resultSubmitted`. Call `finalizeActivity()` to squash-merge activity branch to claude. On success: sync status to integration worktree, delete state file, return `{ mergeSucceeded: true }`. On merge conflict (non-.lore/ files): trigger `machine.transition(id, "completed", "failed", "Squash-merge conflict...")` re-entrantly (REQ-ASM-11). The re-entrant call is safe because the machine releases the lock before running the enter handler.

- **Enter failed** (REQ-ASM-17): Emit `commission_status` event. Check `ctx.sourceState`: if coming from "completed" (merge conflict path), the worktree is already gone (finalizeActivity cleaned it up), so only sync status to integration worktree, write state file, and escalate to Guild Master meeting request with branch name and commission ID. If coming from other states, check whether the worktree still exists (via `fileExists(entry.worktreeDir)`). If it exists: commit any uncommitted changes to activity branch, remove worktree (keep branch), sync status, write state file. If it doesn't exist (recovery with missing worktree, or race condition): skip worktree commit and removal, only sync status and write state file. This no-worktree guard is needed for Step 6's recovery path where the daemon crashed and the worktree was lost.

- **Enter cancelled** (REQ-ASM-18): Emit `commission_status` event. Sync status to integration worktree. Commit uncommitted changes, remove worktree (keep branch). Write state file.

- **Enter pending from blocked** (REQ-ASM-19): Dependency satisfied. No event emission needed (the cleanup hook fires, which triggers auto-dispatch).

- **Enter blocked from pending** (REQ-ASM-20): Emit `commission_status` event. No other action.

- **Enter pending from failed/cancelled** (REQ-ASM-21): Redispatch reset. No active Map changes. Attempt counter derived from terminal timeline entries at dispatch time.

- **Enter abandoned**: Emit `commission_status` event. Sync status to integration worktree. Write state file. No git operations (the commission is not active, no worktree exists). Abandoned has no outgoing edges, so the state tracker can evict these entries (call `machine.forget(id)` after the transition completes).

The `ActiveCommission` type needs adjustment: `worktreeDir`, `branchName`, and `abortController` become optional since they're set by handlers during dispatched/in_progress entry, not at commission creation time.

**Tests** (mocked filesystem, git operations, SDK sessions):
- Enter dispatched: worktree created, state file written, entry fields populated
- Enter in_progress: event emitted, abort controller set
- Exit in_progress for cancellation: abort called
- Exit in_progress for completion: no abort
- Enter completed (success path): merge called, status synced, state file deleted, returns `{ mergeSucceeded: true }`
- Enter completed (conflict path): re-entrant transition to failed triggered
- Enter failed from in_progress (worktree exists): worktree committed and removed, branch preserved, state file written
- Enter failed from in_progress (worktree missing): no worktree operations, only sync status and state file
- Enter failed from completed: no worktree operations, Guild Master escalation created
- Enter cancelled: worktree committed and removed, branch preserved
- Enter pending from blocked: no side effects beyond what machine handles
- Enter blocked: event emitted
- Enter abandoned: event emitted, status synced, no git operations

### Step 3: Wire commission session to use the machine

**Files**: `daemon/services/commission-session.ts` (modify), `daemon/services/commission-state-machine.ts` (delete), `tests/daemon/services/commission-state-machine.test.ts` (delete or convert)
**Addresses**: REQ-ASM-22, REQ-ASM-28, REQ-ASM-29
**Expertise**: careful audit of all Map access sites and transition call sites

Replace the commission session's internal lifecycle management with the ActivityMachine. This is the reconciliation step where old code paths are removed and the machine takes over.

Changes to `createCommissionSession()`:
1. Instantiate `ActivityMachine<CommissionStatus, CommissionId, ActiveCommission>` with the configuration from Step 2.
2. Replace `activeCommissions` Map with machine methods: `machine.get()`, `machine.has()`, `machine.activeCount`.
3. Replace all `transitionCommission()` calls with `machine.transition()`. The `from` state comes from the entry's current status (tracked by the machine).
4. Replace `dispatchCommission()` lifecycle logic: register the entry with the machine at "pending" when creating a commission, then transition pending -> dispatched -> in_progress. The enter handlers from Step 2 handle the setup.
5. Replace `handleCompletion()` and `handleError()` with the session runner pattern from REQ-ASM-22: check `resultSubmitted`, call `machine.transition(id, "in_progress", "completed/failed", reason)`. The enter handlers from Step 2 handle the side effects.
6. Replace `cancelCommission()` with `machine.transition(id, "in_progress", "cancelled", reason)`. The exit-in_progress handler aborts the SDK session.
7. Replace `terminateActiveCommission()` and `cleanupAfterTermination()`: these are now enter-failed and enter-cancelled handlers from Step 2.
8. Replace `resolveArtifactBasePath()` with `machine.resolveArtifactPath()`.
9. Register cleanup hooks: `machine.onCleanup(async (event) => { ... })`. The hook body calls `enqueueAutoDispatch()` for any cleanup, and calls `checkDependencyTransitions()` only when `event.mergeSucceeded`. This replaces the embedded calls to these functions inside `cleanupAfterTermination()`.
10. Wire the `ArtifactOps` callback to delegate to the existing `updateCommissionStatus()` and `appendTimelineEntry()` helpers.

Before deleting, grep for `transitionCommission` and `isTerminalStatus` usage outside commission-session.ts to confirm no external callers depend on these exports. Then delete `daemon/services/commission-state-machine.ts`. Its `VALID_TRANSITIONS` constant is replaced by the machine's graph configuration. Its `isTerminalStatus()` is replaced by checking the graph (states with no outgoing edges). Its `transitionCommission()` is replaced by `machine.transition()`. Delete or convert its test file to cover the new machine's commission-specific behavior.

The session runner (fire-and-forget SDK session management, resultSubmitted logic) stays in commission-session.ts. This is the "decision logic lives outside the state machine" from REQ-ASM-22.

**Tests**:
- Commission creation registers entry with machine at "pending"
- Dispatch flows through pending -> dispatched -> in_progress transitions
- Session completion routes to completed or failed based on resultSubmitted
- Cancel routes through machine transition with exit handler abort
- Redispatch flows through failed/cancelled -> pending -> dispatched -> in_progress
- Cleanup hooks trigger auto-dispatch scanning
- Cleanup hooks trigger dependency checking only after successful merge
- All public API methods on the commission session interface still work correctly
- Capacity checks use machine.activeCount

### Step 4: Build meeting handlers and graph configuration

**Files**: `daemon/services/meeting-handlers.ts` (new), `tests/daemon/services/meeting-handlers.test.ts` (new)
**Addresses**: REQ-ASM-3, REQ-ASM-23, REQ-ASM-24, REQ-ASM-25, REQ-ASM-26, REQ-ASM-27

Define `MeetingTransitionContext` as the concrete alias for `TransitionContext<MeetingId, MeetingStatus, ActiveMeeting>`.

Create a factory function `createMeetingHandlers(deps)` that returns the handler map and machine configuration.

**Meeting transition graph** (REQ-ASM-23):

```
requested -> open, declined
open      -> closed
```

`activeStates`: `["open"]`
`cleanupStates`: `["closed", "declined"]`

Initial state injection (direct meeting creation) uses `machine.inject()` at "open".

**Handler implementations** (extracted from meeting-session.ts):

- **Enter open from requested** (REQ-ASM-24): Accept meeting request. Read artifact from integration worktree. Create activity branch from claude and worktree. Configure sparse checkout. Write state file. Create transcript, record initial user turn. Add to active Map (handled by machine since "open" is in activeStates). Start SDK session. The SDK session is interactive (yields events to caller), so the handler returns the session setup but doesn't await the full session.

- **Enter open (initial/inject)** (REQ-ASM-25): Direct creation. Create artifact with status "open" in the activity worktree. Otherwise identical to REQ-ASM-24: create branch, worktree, state file, transcript, start SDK session.

- **Enter closed** (REQ-ASM-26): Abort any active SDK generation via AbortController. Generate meeting notes from transcript. Write notes to artifact. Call `finalizeActivity()` to squash-merge. On success: delete state file, return `{ mergeSucceeded: true }`. On conflict: preserve branch, escalate to Guild Master meeting request. Remove transcript if notes succeeded (preserve for manual review if failed). Machine handles Map removal.

- **Enter declined** (REQ-ASM-27): No worktree or branch involved. Machine handles artifact status write and timeline append.

Note: the enter-open handler needs to distinguish between "from requested" and "initial inject" using `ctx.sourceState` (null for inject, "requested" for accept). When `sourceState === null`, the handler creates the artifact itself in the activity worktree. The caller passes an entry with enough data to create the artifact (title, worker, prompt, etc.) but does not write the artifact before calling `inject()`. When `sourceState === "requested"`, the artifact already exists on the integration worktree and the handler reads it from there.

**Tests** (mocked filesystem, git operations, SDK sessions):
- Enter open from requested: artifact read from integration, worktree created, transcript started, state file written
- Enter open from inject: artifact created, worktree created, transcript started
- Enter closed: notes generated, merge attempted, transcript handled, state file deleted on success
- Enter closed with merge conflict: branch preserved, escalation created, transcript preserved
- Enter declined: no worktree operations, status written by machine

### Step 5: Wire meeting session to use the machine

**Files**: `daemon/services/meeting-session.ts` (modify)
**Addresses**: REQ-ASM-28
**Expertise**: careful audit of all Map access sites, meeting lifecycle entry points

Replace the meeting session's internal lifecycle management with the ActivityMachine.

Changes to `createMeetingSession()`:
1. Instantiate `ActivityMachine<MeetingStatus, MeetingId, ActiveMeeting>` with the configuration from Step 4.
2. Replace `activeMeetings` Map with machine methods.
3. Replace `createMeeting()`: call `machine.inject(id, entry, "open", reason)`. The enter-open handler from Step 4 handles all setup.
4. Replace `acceptMeetingRequest()`: call `machine.transition(id, "requested", "open", reason)`. Register the meeting request entry with the machine first.
5. Replace `closeMeeting()`: call `machine.transition(id, "open", "closed", reason)`. The enter-closed handler handles notes, merge, cleanup.
6. Replace `declineMeeting()`: call `machine.transition(id, "requested", "declined", reason)`. Register the meeting request entry first.
7. Remove the inline `VALID_TRANSITIONS` and `validateTransition()` from meeting-session.ts.
8. Wire `ArtifactOps` to delegate to `updateArtifactStatus()` and `appendMeetingLog()`.
9. Register cleanup hooks: `machine.onCleanup(async (event) => { ... })`. Meeting cleanup does NOT trigger `enqueueAutoDispatch()` (meetings don't consume commission dispatch capacity). Meeting cleanup DOES trigger `checkDependencyTransitions()` when `event.mergeSucceeded`, because a closed meeting may have merged artifacts that satisfy commission dependencies. The `CleanupEvent.activityType` field ("meeting") lets hook consumers that receive both commission and meeting events distinguish them if needed.
10. Replace artifact path routing with `machine.resolveArtifactPath()`.

Meeting-specific session operations (`sendMessage`, `interruptTurn`, `deferMeeting`) are NOT state transitions. They remain in meeting-session.ts and interact with the active entry via `machine.get(id)`. `deferMeeting` mutates the artifact's `deferred_until` field within the "requested" state, not a transition.

**Tests**:
- Direct meeting creation flows through inject at "open"
- Meeting request acceptance flows through requested -> open transition
- Meeting close flows through open -> closed transition
- Meeting decline flows through requested -> declined transition
- sendMessage and interruptTurn work on active meetings via machine.get()
- deferMeeting works on tracked meetings without transition

### Step 6: Wire crash recovery through the machine

**Files**: `daemon/services/commission-recovery.ts` (modify), `daemon/services/meeting-session.ts` (recovery section, modify)
**Addresses**: REQ-ASM-31

Update recovery to use the machine's `register()` for state population and `transition()` for recovery actions.

**Commission recovery** (modify `recoverCommissions` in commission-recovery.ts):
1. Scan state files from `~/.guild-hall/state/commissions/*.json`
2. For each recovered commission, call `machine.register(id, entry, recoveredStatus)` to populate the state tracker
3. Commission with state file + worktree exists: call `machine.transition(id, "in_progress", "failed", "process lost on restart")`. The enter-failed handler runs normally (commit partial, remove worktree, keep branch, sync, fire hook).
4. Commission with state file + worktree missing: call `machine.transition(id, "in_progress", "failed", "state lost")`. The enter-failed handler handles the no-worktree path (sync status directly, no worktree ops).

**Meeting recovery** (modify recovery in meeting-session.ts):
1. Scan state files from `~/.guild-hall/state/meetings/*.json`
2. Meeting with state file + worktree exists: call `machine.registerActive(id, entry, "open")`. This adds the entry to both the state tracker and the active Map without running the enter handler. The meeting can then accept new `sendMessage` calls.
3. Meeting with state file + worktree missing: no machine involvement. Update artifact status to "closed" on integration worktree directly, update state file. The meeting was never registered with the machine (daemon just restarted), so no transition needed.

**Tests**:
- Commission recovery with worktree: registers and transitions to failed, enter-failed handler runs
- Commission recovery without worktree: registers and transitions to failed, no worktree ops
- Meeting recovery with worktree: registers at open, entry in active Map, accepts sendMessage
- Meeting recovery without worktree: closes without machine, artifact updated directly
- Recovery fires cleanup hooks, enabling auto-dispatch for queued commissions

### Step 7: Production wiring and integration

**Files**: `daemon/app.ts` (modify), `daemon/types.ts` (modify if needed)
**Addresses**: Production DI wiring (retro lesson)
**Expertise**: DI assembly audit

Wire the machines into the production app assembly in `createProductionApp()`. This step exists explicitly because every retro flags DI wiring gaps as the primary risk.

1. Commission machine: created inside `createCommissionSession()` with deps from the session factory's parameters. No changes to `daemon/app.ts` needed for the machine itself, since it's internal to the session factory. But verify that cleanup hook consumers (auto-dispatch, dependency checking) are properly wired.
2. Meeting machine: same, internal to `createMeetingSession()`.
3. The lazy `meetingSessionRef` pattern for circular dependency (commission needs to create meeting requests on merge conflict, meeting session needs commission session for dependency checking) must be preserved. Verify that the enter-failed handler's `createMeetingRequestFn` callback still resolves correctly.
4. Verify that `daemon/app.ts` passes all required deps to both session factories.
5. Smoke test: start daemon, create commission, dispatch, complete (or fail), verify auto-dispatch fires.

**Tests**:
- Production app starts without errors
- Both machines are configured with all handlers
- Cleanup hooks are registered
- Circular dependency between commission and meeting sessions resolves correctly

### Step 8: Validate against spec

Launch a sub-agent that reads the spec at `.lore/specs/activity-state-machine.md`, reviews the implementation, and flags any requirements not met. This step is not optional.

Validation checklist (from spec's AI Validation section):
- State machine transition test: every edge in both graphs succeeds; every non-edge rejected
- Enter/exit handler test: each handler's side effects verified
- Race condition test: concurrent transitions, exactly one executes
- Handler error test: enter handler throws, cleanup state still removes from Map
- Merge conflict escalation test: completed -> failed re-entrant, Guild Master meeting created
- Redispatch test: failed -> pending -> dispatched -> in_progress, attempt counter increments
- Post-cleanup hook test: cleanup entry fires hooks with correct event payload
- Auto-dispatch via hook test: hook triggers queue scan, pending commissions dispatch
- Dependency via hook test: hook after successful merge triggers dependency check
- Meeting lifecycle test: requested -> open -> closed with notes, merge, cleanup
- Direct meeting creation test: inject at open with artifact creation
- Recovery test: stale state files, commissions transition to failed, meetings re-add or close
- Abandoned test: transitions from pending/blocked/failed/cancelled to abandoned succeed, no git operations, event emitted

## Delegation Guide

Steps requiring specialized expertise:

- **Step 1** (ActivityMachine class): Core framework, heavily tested. This is the foundation. Fresh-eyes review after implementation is critical since the re-entrant transition and concurrent transition logic is subtle. Use `plan-reviewer` agent during implementation.
- **Step 3** (Commission reconciliation): Highest risk step. Every Map access and transition call in 1,600 lines must be audited and replaced. Use `pr-review-toolkit:silent-failure-hunter` after this step to catch any error paths that got silently dropped during the migration.
- **Step 5** (Meeting reconciliation): Same risk profile as Step 3 but smaller file. Same agent recommendation.
- **Step 7** (Production wiring): Use `pr-review-toolkit:code-reviewer` to verify DI assembly completeness.

Consult `.lore/lore-agents.md` for available domain-specific agents.

## Open Questions

None. All questions raised during review have been resolved in this document. The `register()` vs active Map question is resolved by adding `registerActive()` to the machine's public API (Step 1).
