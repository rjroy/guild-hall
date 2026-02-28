---
title: Phase 7 - Hardening
date: 2026-02-23
status: executed
tags: [plan, hardening, crash-recovery, memory, concurrent-limits, dependency-transitions]
modules: [guild-hall-core, guild-hall-ui]
related:
  - .lore/plans/foundation/implementation-phases.md
  - .lore/specs/guild-hall-system.md
  - .lore/specs/guild-hall-workers.md
  - .lore/specs/guild-hall-commissions.md
  - .lore/specs/guild-hall-meetings.md
  - .lore/specs/guild-hall-views.md
  - .lore/design/process-architecture.md
  - .lore/retros/dispatch-hardening.md
  - .lore/retros/mcp-pid-files.md
  - .lore/retros/phase-5-git-integration-data-loss.md
---

# Plan: Phase 7 - Hardening

## Spec Reference

**Specs**: All five specs contribute requirements to this phase.

Requirements addressed:
- REQ-SYS-15: Workspace scoping (primitive relationships per-workspace) --> Step 11
- REQ-SYS-19/20/21: Memory model access rules (three scopes, worker-private, plain text) --> Steps 4, 5
- REQ-WKR-22: Memory injection from three scopes into worker system prompts --> Step 5
- REQ-WKR-23: Memory compaction when size exceeds limit --> Step 6
- REQ-COM-7: Dependency auto-transitions (blocked <-> pending on artifact existence) --> Step 3
- REQ-COM-21/22/23: Concurrent limits (per-project, global) with FIFO queuing --> Step 2
- REQ-COM-27/28/29: Crash recovery (startup scan, orphan detection, partial result preservation) --> Step 1
- REQ-MTG-28: Concurrent meeting cap enforcement --> Already implemented (meeting-session.ts lines 641-650)
- REQ-MTG-29: No auto-close or idle timeout in V1 --> No work required (infrastructure supports it)
- REQ-MTG-30: State isolation (same worker in meeting + commission simultaneously) --> Step 10
- REQ-VIEW-7/8: Daemon connectivity (offline indicator, disabled actions, auto-clear on reconnect) --> Step 9
- REQ-VIEW-10: Cross-project aggregation on Dashboard --> Already implemented (app/page.tsx)

Deferred items from prior phases:
- Manager `sync_project` tool (from ideas 2026-02-23) --> Step 8
- TOCTOU file locking on concurrent meeting accept (from Phase 3 plan) --> Step 7
- Squash-merge conflict handling between concurrent commissions (from Phase 5 plan) --> Step 7

## Codebase Context

**Commission state machine**: Fully defined in `daemon/services/commission-session.ts` (lines 51-59) with `blocked <-> pending` transitions. `validateTransition()` and `transitionCommission()` enforce the machine. The transitions are valid but never triggered by automation.

**Commission dispatch**: `daemon/routes/commissions.ts` dispatch endpoint calls `dispatchCommission()` immediately with no capacity check. Returns `{ status: "accepted" }`. No queuing.

**Active commission tracking**: In-memory `Map` in `commission-session.ts` (line 212). Lost on daemon restart. State files exist at `~/.guild-hall/state/commissions/{id}.json` but aren't scanned on startup.

**Meeting recovery**: `recoverMeetings()` exists in `daemon/app.ts` and is called on startup. Reads state files, reattaches sessions. The pattern is directly applicable to commission recovery.

**Memory system**: `daemon/services/base-toolbox.ts` provides `read_memory`, `write_memory`, `record_decision`. Three scopes resolved by path. `validateContainedPath()` prevents traversal. No access control (any worker reads/writes any scope). No size tracking or compaction.

**Memory compaction archive** (originally `.lore/_abandoned/phase-1/tasks/worker-dispatch/011-worker-memory-system.md`, deleted during archive migration): Complete design: `compactMemories()` via separate SDK invocation with `maxTurns: 1`, concurrent guard via `compactionInProgress` flag, snapshot-based cleanup.

**Daemon connectivity**: `components/ui/DaemonStatus.tsx` polls `/api/daemon/health` every 5 seconds, shows offline indicator. No action button disabling.

**Per-project mutex**: `daemon/lib/project-lock.ts` provides `withProjectLock()` for serializing concurrent git operations. Used by Phase 6 for PR creation.

**PID patterns**: `daemon/lib/socket.ts` (lines 50-83) handles stale socket detection via PID checking. The mcp-pid-files retro established per-entity PID checking as the correct recovery pattern.

**Config schema**: `lib/config.ts` ProjectConfig has `meetingCap` but no commission-related limit fields.

## Implementation Steps

### Step 1: Commission Crash Recovery

**Files**: `daemon/services/commission-session.ts`, `daemon/app.ts`
**Addresses**: REQ-COM-27, REQ-COM-28, REQ-COM-29
**Expertise**: none needed

On daemon startup, scan `~/.guild-hall/state/commissions/` for active commission state files. For each file where status is `dispatched` or `in_progress`:

1. Read the PID from the state file
2. Check if the process is alive (process.kill(pid, 0) in try/catch)
3. **Dead process**: Transition commission to `failed` with reason "process lost on restart." Commit any uncommitted changes in the activity worktree to preserve partial results (REQ-COM-14a). Clean up the worktree but preserve the branch.
4. **Live process**: Reattach monitoring. Add to the `activeCommissions` Map, start heartbeat tracking. If status was `dispatched`, transition to `in_progress`.
5. **Orphaned worktree** (worktree exists under `~/.guild-hall/worktrees/` but no state file): Scan for commission worktrees that have no corresponding state file. Commit uncommitted work, transition to `failed` with reason "state lost."

Create `recoverCommissions(deps)` function following the same DI pattern as `recoverMeetings()`. Call it in `createProductionApp()` during startup, after socket setup but before accepting requests.

All git operations must use `cleanGitEnv()` (Phase 5 retro lesson). Add logging on both happy and error paths (Phase 4 retro lesson: happy-path logging matters).

### Step 2: Commission Concurrent Limits and FIFO Queue

**Files**: `lib/config.ts`, `daemon/services/commission-session.ts`, `daemon/routes/commissions.ts`, `daemon/services/event-bus.ts`
**Addresses**: REQ-COM-21, REQ-COM-22, REQ-COM-23
**Expertise**: none needed

Add config schema fields:
- `ProjectConfig`: `commissionCap?: number` (per-project limit, default 3)
- `AppConfig`: `maxConcurrentCommissions?: number` (global limit, default 10)

Modify the dispatch path:
1. Before spawning a worker process, check running commission count against both per-project and global limits
2. If either limit is reached, return `{ status: "queued" }` instead of `{ status: "accepted" }`. The commission stays `pending`.
3. On commission completion/failure/cancellation, check for pending commissions that can now dispatch. Select the oldest by creation date (FIFO from file timestamps or frontmatter date).
4. Auto-dispatch fires the same dispatch sequence: create branch, worktree, spawn process.

The "queue" is not a data structure. It's the set of `pending` commissions sorted by creation date. On capacity open, scan commission artifacts and merge all pending commissions across all projects into a single sorted list by creation date (single FIFO queue per REQ-COM-22). The oldest pending commission that also fits within its project's per-project limit gets dispatched next. This means cross-project ordering is by age, not by round-robin. The process-architecture.md design confirms this: "the dispatch queue is trivial (readdir + sort by creation date + counter)."

Add `SystemEvent` types: `commission_queued` (when dispatch is deferred) and `commission_dequeued` (when auto-dispatched from queue). Emit through EventBus so the UI can update.

Reducing limits does not cancel running commissions. Increasing limits immediately auto-dispatches pending commissions up to new capacity.

**UI for queued commissions** (REQ-VIEW-27): When the dispatch endpoint returns `{ status: "queued" }`, the Commission view needs to handle this:
- `CommissionHeader.tsx`: Show amber gem for queued state (pending commission that was submitted for dispatch but capacity-limited)
- `CommissionActions.tsx`: DISPATCH button changes to "Queued" indicator after submission
- `CommissionView.tsx`: Handle `commission_queued` and `commission_dequeued` SSE events to update status in real time
- Queue position: Show "Queued" status text without a numeric position. Position changes too frequently as other commissions complete, and the FIFO ordering makes position a misleading metric (blocked commissions are skipped). A simple "Queued, waiting for capacity" message is sufficient.

### Step 3: Dependency Auto-Transitions

**Files**: `daemon/services/commission-session.ts`, `daemon/services/commission-artifact-helpers.ts`
**Addresses**: REQ-COM-7
**Expertise**: none needed

Implement `checkDependencyTransitions(projectName, deps)`:
1. Scan all commission artifacts for the project (from integration worktree)
2. For each `blocked` commission: check if all dependency artifact paths exist in the integration worktree. If yes, transition to `pending`.
3. For each `pending` commission: check if any dependency artifact was removed. If yes, transition to `blocked`.
4. Emit `commission_status` events for each transition.
5. After transitioning `blocked -> pending`, trigger the FIFO auto-dispatch check from Step 2 (the newly-pending commission might be dispatchable).

Trigger points: Call `checkDependencyTransitions()` after:
- Squash-merge completes (commission close, meeting close): artifacts appeared on `claude` branch
- Artifact write via the editing API (`PUT /api/artifacts`)
- Commission failure/cancellation (if it was supposed to produce artifacts that other commissions depend on, nothing changes, but if cleanup removes artifacts it does)

This is existence checking only ("does the file exist at this path?"), not content validation. Use `fs.existsSync` or equivalent against the integration worktree path for each dependency.

### Step 4: Memory Access Control

**Files**: `daemon/services/base-toolbox.ts`, `daemon/services/toolbox-resolver.ts`
**Addresses**: REQ-SYS-19, REQ-SYS-20, REQ-SYS-21
**Expertise**: none needed

**Prerequisite plumbing**: `BaseToolboxDeps` currently has three fields: `contextId`, `contextType`, `guildHallHome`. The `ToolboxResolverContext` has `workerName` and `projectPath` but does not pass them to `createBaseToolbox()`. Before enforcing access control:

1. Add `workerName: string` and `projectName: string` to `BaseToolboxDeps`
2. In `toolbox-resolver.ts` `resolveToolSet()`, pass `context.workerName` and extract project name from `context.projectPath` when calling `createBaseToolbox()`
3. Propagate `workerName` and `projectName` into the `makeReadMemoryHandler` and `makeWriteMemoryHandler` factories

Then enforce ownership:

4. For `scope: "worker"`: The tool currently accepts an arbitrary worker name in the path. Change this so the tool always uses the current worker's name from `deps.workerName`. `read_memory({ scope: "worker" })` reads from `~/.guild-hall/memory/workers/{currentWorkerName}/`. A worker cannot specify a different worker name.
5. For `scope: "project"`: Use `deps.projectName` to resolve the project memory path. Currently falls back to `"unknown"` (line 50). Fix this so project scope always targets the correct project.
6. For `scope: "global"`: No change. Any worker can read/write global memory.
7. Remove the `workerName` parameter from the worker scope tool input schema. The scope is implicit from the activation context.

This is a behavioral change to existing tools. Update the tool descriptions so workers understand the access model. Add tests that verify a worker cannot read another worker's memory.

### Step 5: Memory Injection

**Files**: `daemon/services/memory-injector.ts` (new), `daemon/services/meeting-session.ts`, `daemon/services/commission-session.ts`, `daemon/services/manager-context.ts`, `lib/config.ts`
**Addresses**: REQ-WKR-22
**Expertise**: none needed

Create `loadMemories(workerName, projectName, deps)`:
1. Read all files from three scopes:
   - `~/.guild-hall/memory/global/` (all files)
   - `~/.guild-hall/memory/projects/{projectName}/` (all files)
   - `~/.guild-hall/memory/workers/{workerName}/` (all files)
2. Sort entries: recent files first (by mtime)
3. Assemble into a markdown block: `## Memories\n### Global\n...\n### Project: {name}\n...\n### Worker: {name}\n...`
4. Check total character count against the size limit (default 8000, from config)
5. If under limit, return the full block
6. If over limit, truncate older entries to fit, then flag for compaction (Step 6)

Call `loadMemories()` during worker activation in both `meeting-session.ts` (meeting creation/accept) and `commission-session.ts` (dispatch). Inject the result into the system prompt alongside the worker's posture.

For the manager, `buildManagerContext()` in `manager-context.ts` already assembles context with an 8000 char truncation. Memory injection for the manager uses the same `loadMemories()` function, with the manager's worker name.

Add `memoryLimit` to `ProjectConfig` schema (optional, default 8000).

### Step 6: Memory Compaction

**Files**: `daemon/services/memory-compaction.ts` (new), `daemon/services/memory-injector.ts`
**Addresses**: REQ-WKR-23
**Expertise**: none needed

When `loadMemories()` detects the size exceeds the limit (Step 5), trigger compaction:

1. **Concurrent guard**: Track `compactionInProgress` per worker+project pair. If compaction is already running for this pair, skip (the ongoing compaction will handle it).
2. **Snapshot**: Record the list of memory files at the start of compaction. Only process files from this snapshot (files written during compaction are left alone).
3. **SDK invocation**: Create a one-shot SDK session (`maxTurns: 1`, no tools) with a prompt that asks it to summarize the memory entries into a condensed form. Input: the full text of all memory files from the snapshot. Output: a single summary.
4. **Write summary**: Write the summary to a `_compacted.md` file in each scope directory, replacing any prior compacted summary.
5. **Cleanup**: Remove only the files that were in the snapshot (not newer files written during compaction).
6. **Fire-and-forget**: Compaction runs asynchronously. The current activation uses truncated memories (recent entries prioritized). Compaction improves the next activation.

This follows the Phase 1 archive pattern exactly: concurrent guard, snapshot-based cleanup, fire-and-forget from the caller's perspective.

Resource budget for compaction: `maxTurns: 1`, `maxBudgetUsd: 0.05` (compaction is a single summarization turn). Validate this against real workloads before declaring production-ready (dispatch-hardening retro lesson).

### Step 7: Concurrency Hardening

**Files**: `daemon/services/meeting-session.ts`, `daemon/services/commission-session.ts`, `daemon/lib/project-lock.ts`
**Addresses**: Deferred from Phase 3 (TOCTOU file locking), deferred from Phase 5 (squash-merge conflicts)
**Expertise**: none needed

**Meeting accept TOCTOU fix**: The concurrent meeting cap check reads file state, then creates the meeting. Two concurrent accepts can both pass the check. Fix by wrapping meeting creation and acceptance in `withProjectLock()`. The lock already exists for git operations; extend its scope to cover meeting cap enforcement. Both `createMeeting()` and `acceptMeetingRequest()` need the lock.

**Squash-merge conflict handling**: When two concurrent commissions for the same project complete and both try to squash-merge back to `claude`, the second merge may conflict. The `withProjectLock()` already serializes git operations, so merges happen sequentially. The risk is that the second merge encounters a conflict on `.lore/` files that both commissions modified.

Handle this by:
1. Attempt the squash-merge
2. If merge conflicts are detected, check if all conflicted files are in `.lore/`
3. For `.lore/` conflicts: accept the incoming changes (the commission's version), since each commission produces distinct artifacts. If both modified the same artifact (rare), prefer the newer commit.
4. For non-`.lore/` conflicts: mark the commission as `failed` with reason "merge conflict" and preserve the branch for manual resolution.
5. Log the conflict resolution for auditability.

### Step 8: Manager sync_project Tool

**Files**: `daemon/services/manager-toolbox.ts`, `cli/rebase.ts`
**Addresses**: Deferred from ideas (2026-02-23)
**Expertise**: none needed

Add a sixth tool to the manager-exclusive toolbox: `sync_project`. This lets the user say "I merged the PR" in a meeting and the manager handles the sync without a daemon restart.

1. The tool accepts a `projectName` parameter
2. It calls the same logic as `guild-hall sync` CLI (`syncProject()` from `cli/rebase.ts`)
3. Returns a summary of what happened (PR detected, claude reset, or "no merged PR found")
4. Wrap in `withProjectLock()` to avoid concurrent git operations

This reuses existing code. The `syncProject()` function in `cli/rebase.ts` already does PR marker detection and tree comparison. Extract it into a shared module if it isn't already importable from the daemon.

### Step 9: Daemon Connectivity Graceful Degradation

**Files**: `components/ui/DaemonStatus.tsx`, `components/ui/DaemonContext.tsx` (new), various action components
**Addresses**: REQ-VIEW-7, REQ-VIEW-8
**Expertise**: none needed

Create a `DaemonContext` React context that provides `{ isOnline: boolean }` to the component tree. `DaemonStatus.tsx` already polls health every 5 seconds; make it the context provider.

1. Wrap the app layout with `DaemonContextProvider`
2. Each action button (Dispatch, Cancel, Re-dispatch, Send Message, Close Meeting, Accept/Decline/Defer meeting, Quick Comment) checks `isOnline` and disables when offline
3. Disabled buttons show a tooltip: "Daemon offline"
4. The offline indicator already exists and auto-clears on reconnect. The context state drives both the indicator and button disabling.
5. File-backed reads (server components) are unaffected since they don't go through the daemon

This is a presentational change. No backend work needed.

### Step 10: State Isolation Proof

**Files**: `tests/daemon/state-isolation.test.ts` (new)
**Addresses**: REQ-MTG-30, REQ-SYS-10
**Expertise**: none needed

Write integration tests proving the same worker can operate in a meeting and commission simultaneously with full isolation:

1. **Session isolation**: Create a meeting session and dispatch a commission for the same worker in the same project. Verify each has its own SDK session ID.
2. **Worktree isolation**: Verify the meeting worktree and commission worktree are different directories on different branches.
3. **Tool isolation**: Verify each context has its own toolbox instance (meeting tools in meeting, commission tools in commission, no cross-contamination).
4. **Memory visibility**: Worker writes to worker-scope memory in the commission context. The meeting context reads the same scope on its next turn and sees the write. This proves cross-context memory visibility through shared scopes.
5. **Independent lifecycle**: Close the meeting while the commission is still running. Verify the commission continues unaffected. Then complete the commission. Verify both contexts clean up independently.

These tests use the DI factory pattern with mocked SDK sessions and temp directories.

### Step 11: Workspace Scoping Verification

**Files**: `tests/lib/workspace-scoping.test.ts` (new)
**Addresses**: REQ-SYS-15
**Expertise**: none needed

Workspace scoping is already implicit in the per-project patterns throughout the codebase (commissions are per-project, meetings are per-project, artifacts are per-project). This step verifies the boundary holds:

1. Register two projects. Create a commission in project A. Verify it does not appear in project B's commission list.
2. Memory written to project A's scope is not visible when reading project B's scope.
3. Dependency checking for project A's commissions only looks at project A's artifacts.
4. The manager's context injection includes all projects (cross-workspace awareness flows through the manager, not through direct primitive relationships).

These are verification tests, not new features.

### Step 12: Validate Against Specs

Launch a sub-agent that reads all five specs, reviews the implementation, and flags any Phase 7 requirements not met. Check each REQ-ID against the implementation. This step is not optional.

Specific validation points:
- COM-7: blocked <-> pending transitions fire automatically on artifact existence changes
- COM-21/22/23: dispatch respects per-project (default 3) and global (default 10) limits; excess queues in FIFO
- COM-27/28/29: daemon startup detects dead/live/orphaned commissions and handles each correctly
- SYS-19/20/21: worker memory is private; global and project are shared; all plain text
- WKR-22: memories injected into system prompt on activation
- WKR-23: compaction triggers when over 8000 chars; separate SDK invocation; recent entries prioritized
- MTG-30: same worker in meeting + commission simultaneously with independent state
- VIEW-7/8: action buttons disabled when daemon offline; file-backed reads still work; auto-clear on reconnect

## Delegation Guide

Steps requiring specialized expertise:
- None of the steps require external domain expertise. All work is within the existing codebase patterns.

Steps suitable for parallel sub-agent execution:
- Steps 4-6 (memory system) are independent of Steps 1-3 (commission hardening) and can run concurrently
- Step 9 (UI) is independent of all backend steps
- Steps 10-11 (testing) depend on Steps 1-9 being complete

Consult `.lore/lore-agents.md` if it exists for available domain-specific agents.

## Open Questions

1. **Compaction SDK model**: Should compaction use the same model as the worker, or a cheaper/faster model? The Phase 1 archive used the default model. Haiku would be cheaper for summarization.
2. **Dependency scan frequency**: Should `checkDependencyTransitions()` run on a timer in addition to the explicit trigger points, as a safety net against missed triggers? The spec says "runs when artifacts are created or removed" which implies event-driven only.
3. **Memory file format**: The spec says "plain text or markdown" (REQ-SYS-21). Should `loadMemories()` handle both `.txt` and `.md` extensions? Currently `write_memory` creates `.md` files.
