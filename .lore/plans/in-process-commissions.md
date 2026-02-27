---
title: Migrate commission workers from subprocesses to in-process async sessions
date: 2026-02-26
status: executed
tags: [architecture, commissions, refactor, daemon, sdk-session]
modules: [commission-session, commission-toolbox, commission-worker, daemon-routes]
related: [.lore/specs/guild-hall-commissions.md, .lore/design/process-architecture.md, .lore/retros/phase-4-commissions.md, .lore/retros/dispatch-hardening.md]
---

# Plan: In-Process Commission Sessions

## Goal

Replace the subprocess-based commission worker architecture with in-process async sessions matching the meeting session pattern. Commission SDK sessions are network-bound async work, not CPU-bound tasks, so process isolation adds complexity without benefit. The subprocess model created an observability gap that makes heartbeat monitoring structurally broken: workers can run for hours doing real work (reading files, writing code, running tests) without calling the three IPC tools that refresh the heartbeat, causing false kills.

**What changes:** Commissions run as async functions on the daemon's event loop instead of spawned OS processes. The daemon observes SDK events directly. IPC (HTTP callbacks from worker to daemon) is replaced by in-process function calls.

**What stays the same:** Commission lifecycle states, artifact format, git worktree strategy, capacity limits, FIFO auto-dispatch, EventBus, SSE streaming to browser, frontend components. The commission spec (REQ-COM-*) requirements are preserved except REQ-COM-10 (one OS process per commission), which this plan intentionally replaces.

## Codebase Context

The meeting session pattern (`daemon/services/meeting-session.ts`) is the reference implementation. Meetings create SDK sessions in-process, translate events via `translateSdkMessage()`, stream them as `AsyncGenerator<GuildHallEvent>`, and manage lifecycle (create, send message, close, interrupt) without subprocesses.

Commission workers (`daemon/commission-worker.ts`) replicate most of this logic in a separate process: discover packages, resolve tools, activate worker, run SDK session, consume messages. The daemon can't see any of this activity, so it relies on the worker voluntarily calling `report_progress`, `submit_result`, or `log_question` to prove liveness.

The commission toolbox (`daemon/services/commission-toolbox.ts`) creates MCP server tools that write to files for durability and POST to the daemon socket for real-time notification. The HTTP callback layer (`notifyDaemon()`) and daemon IPC routes (`/commissions/:id/progress`, `/result`, `/question`) exist solely to bridge the process boundary.

## Implementation Steps

### Step 1: Refactor commission toolbox from IPC to callbacks

**Files**: `daemon/services/commission-toolbox.ts`

Remove the `daemonSocketPath` dependency and `notifyDaemon()` HTTP helper. Replace with callback functions that the daemon passes in when creating the toolbox.

`CommissionToolboxDeps` changes:
- Remove: `daemonSocketPath`
- Add: `onProgress(summary)`, `onResult(summary, artifacts?)`, `onQuestion(question)`

The three tool handler factories (`makeReportProgressHandler`, `makeSubmitResultHandler`, `makeLogQuestionHandler`) keep their file write logic unchanged but call the injected callbacks instead of `notifyDaemon()`. The callbacks are synchronous fire-and-forget from the tool's perspective (the daemon handles EventBus emission and state updates internally).

This step is independently testable: existing toolbox tests replace socket mocks with callback spies.

### Step 2: Create in-process commission runner

**Files**: `daemon/services/commission-session.ts` (new function)

Extract the SDK session logic from `commission-worker.ts` into a new async function within commission-session.ts. This function:

1. Resolves tools via `resolveToolSet()` with commission context (passing callback functions from Step 1 instead of socket path)
2. Loads memories via `loadMemories()`
3. Activates the worker (dynamic import or built-in manager)
4. Builds SDK query options (reuse `buildQueryOptions()` logic from commission-worker.ts)
5. Runs the SDK session: `for await (const msg of query({ prompt, options }))`
6. On each SDK message: updates `lastActivity` timestamp on the ActiveCommission, logs the message
7. After session completes: checks `wasResultSubmitted()`, runs follow-up session if needed (same logic as commission-worker.ts lines 369-398)
8. Returns whether a result was submitted

The `wasResultSubmitted()` reference comes from `createCommissionToolbox()` (which returns `{ server, wasResultSubmitted }`), surfaced through `resolveToolSet()`. The runner uses this to decide whether to run the follow-up session.

Move `buildActivationContext()`, `buildQueryOptions()`, and `logSdkMessage()` from commission-worker.ts into this module (they'll be deleted with commission-worker.ts in Step 7).

The function takes an `AbortController` parameter and passes it to query options as `abortController` (matching the SDK's type signature and the meeting-session.ts pattern).

This step does not yet wire into dispatch. It's a standalone async function that can be unit tested with a mock `queryFn`.

### Step 3: Refactor dispatch to fire-and-forget

**Files**: `daemon/services/commission-session.ts`

Replace the `spawnFn(configPath)` call in `dispatchCommission()` with a fire-and-forget call to the runner from Step 2.

`ActiveCommission` type changes:
- Remove: `pid`, `lastHeartbeat`, `configPath`, `graceTimerId`
- Add: `abortController: AbortController`, `lastActivity: Date`

Also remove `reportProgress`, `reportResult`, and `reportQuestion` from the `CommissionSessionForRoutes` interface. These exist solely to serve the IPC routes. After the refactor, no production code calls them.

The dispatch flow becomes:
1. Create activity worktree and branch (unchanged)
2. Write commission artifact with `status_dispatched` (unchanged)
3. Write state file (remove `pid` and `configPath`; retain `worktreeDir` and `branchName` for recovery in Step 6)
4. Create AbortController
5. Register in `activeCommissions` Map
6. Call runner: `runCommissionSession(id, config, abortController.signal).then(handleCompletion).catch(handleError)` (not awaited)
7. Return immediately

The `handleCompletion` function replaces the current `handleExit()`. It receives the result flag from the runner and transitions the commission:
- Result submitted → completed (commit, squash-merge, cleanup)
- No result → failed ("session completed without submitting result")

Retain the `createMeetingRequestFn` DI seam for squash-merge conflict escalation (creates a Guild Master meeting request when non-.lore/ conflicts block the merge).

The `handleError` function replaces crash handling:
- AbortError → cancelled (user-initiated)
- Other error → failed (with error message)

The callbacks passed to the commission toolbox (Step 1) update `lastActivity` and emit EventBus events, which is what the IPC routes currently do in `reportProgress()`, `reportResult()`, `reportQuestion()`.

### Step 4: Remove heartbeat monitoring

**Files**: `daemon/services/commission-session.ts`

Delete `HEARTBEAT_INTERVAL_MS`, `STALENESS_THRESHOLD_MS`, `heartbeatInterval`, `checkHeartbeats()`, and the `isProcessAlive` DI seam.

The `lastActivity` field on ActiveCommission is retained for observability (dashboard could show "last active 2m ago") but is not used for liveness decisions. The SDK session manages its own timeouts. If the API hangs, the SDK's built-in timeout handles it. If the session exhausts turns or budget, it completes normally.

### Step 5: Refactor cancellation

**Files**: `daemon/services/commission-session.ts`

Replace signal-based cancellation (`SIGTERM` + `SIGKILL` with 30s grace) with `abortController.abort()`.

The `cancelCommission()` function becomes:
1. Look up commission in `activeCommissions`
2. Call `commission.abortController.abort()`
3. The runner's `for await` loop terminates when the signal fires
4. The `handleError` function catches the AbortError and transitions to cancelled
5. Commit partial work to activity worktree, preserve branch for inspection (unchanged)

Remove: `CANCEL_GRACE_MS`, `graceTimerId`, the `kill()` method, the SIGKILL fallback timer.

### Step 6: Simplify daemon restart recovery

**Files**: `daemon/services/commission-session.ts` (`recoverCommissions()`)

Current recovery scans state files, checks PIDs via `process.kill(pid, 0)`, and reattaches monitoring for live processes. With in-process sessions, daemon restart means all sessions are gone.

New recovery:
1. Scan state files in `~/.guild-hall/state/commissions/`
2. For any commission in `dispatched` or `in_progress` status: transition to failed with "daemon restarted, commission was in progress"
3. Sync the failure to the integration worktree
4. After recovery, run dependency evaluation and FIFO auto-dispatch (unchanged) so commissions blocked on the failed one can transition appropriately

No PID checks, no reattachment, no process liveness detection.

Retain orphaned worktree cleanup as a one-time migration safeguard: if a worktree exists with no state file, it's a leftover from the subprocess era. Clean it up during recovery, then this code path becomes dead and can be removed in a future pass.

### Step 7: Remove dead code

**Files**: Multiple deletions and edits

**Delete entirely:**
- `daemon/commission-worker.ts` (413 lines, subprocess entry point)
- `daemon/services/commission-worker-config.ts` (JSON config schema for subprocess bootstrapping)

**Remove from `daemon/routes/commissions.ts`:**
- `POST /commissions/:id/progress` (IPC endpoint)
- `POST /commissions/:id/result` (IPC endpoint)
- `POST /commissions/:id/question` (IPC endpoint)

**Remove from `daemon/services/commission-session.ts`:**
- `SpawnedCommission` interface
- `defaultSpawnFn()` and stdout/stderr capture logic
- `spawnFn` DI seam
- `isProcessAlive` DI seam
- Exit code classification logic (four-way: clean/crash x result/no-result)
- `CommissionWorkerConfig` file writing (JSON config for subprocess)

**Remove from `daemon/app.ts`:**
- IPC route registration (if wired separately from other commission routes)

**Update `daemon/services/toolbox-resolver.ts`:**
- Remove `daemonSocketPath` from `ToolboxResolverContext` interface
- Remove the `daemonSocketPath` presence guard (lines 91-96, throws if absent for commission contexts), which would break every commission dispatch after the refactor
- Update commission toolbox creation to pass callbacks instead of socket path

### Step 8: Update tests

**Files**: `tests/daemon/services/commission-session.test.ts`, `tests/daemon/services/commission-toolbox.test.ts`, `tests/daemon/routes/commissions.test.ts`, `tests/daemon/commission-worker.test.ts`

**Commission toolbox tests:** Replace socket/IPC mocks with callback spies. Verify tools call `onProgress`, `onResult`, `onQuestion` callbacks and still write to files.

**Commission session tests:** Replace `spawnFn` mock with a mock `queryFn` that yields controlled SDK messages. Test:
- Dispatch fires async runner and returns immediately
- Runner emits EventBus events via callbacks
- Completion with result → completed transition + squash-merge
- Completion without result → follow-up session → completed or failed
- Cancellation via AbortController → cancelled transition
- Capacity limits still enforced
- FIFO auto-dispatch still works
- Dependency transitions still work
- Recovery on startup fails in-progress commissions

**Delete:** `tests/daemon/commission-worker.test.ts` (subprocess entry point tests), `tests/daemon/commission-worker-config.test.ts` (config schema tests), IPC route tests from commission routes test file.

**Retain:** Tests for artifact helpers, state file management, git operations, and anything not tied to the subprocess model.

### Step 9: Validate

Run full test suite (`bun test`), typecheck (`bun run typecheck`), and lint (`bun run lint`).

Launch a fresh-context sub-agent to review the refactored commission-session.ts against this plan's Goal section. Verify:
- No subprocess infrastructure remains
- Commission toolbox uses callbacks, not HTTP
- Heartbeat monitoring is gone
- Cancellation uses AbortController
- Recovery fails in-progress commissions on restart
- EventBus events still fire for all commission state transitions
- Capacity limits and FIFO auto-dispatch still function

## Delegation Guide

No specialized expertise required beyond standard TypeScript and the existing codebase patterns. The meeting session code is the reference for every step. The refactoring is mechanical: move logic from subprocess to in-process, replace IPC with function calls, replace signals with AbortController.

## Open Questions

1. **SDK abort support**: Verify that the Claude Agent SDK's `query()` accepts an `AbortSignal` and terminates cleanly when aborted. If not, cancellation needs a different mechanism (e.g., a flag checked between messages in the `for await` loop, breaking out manually).

2. **Memory compaction**: The current worker fires compaction as fire-and-forget in the subprocess. Moving in-process means compaction's SDK call shares the daemon's event loop. This is fine (it's just another async call) but worth confirming it doesn't interfere with other sessions.

3. **Stdout/stderr capture**: The current subprocess pipes worker stdout/stderr to the daemon for logging. In-process, all logging goes to the daemon's stdout naturally. Confirm no log routing changes are needed.
