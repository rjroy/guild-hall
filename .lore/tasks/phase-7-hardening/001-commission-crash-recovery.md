---
title: Commission Crash Recovery
date: 2026-02-23
status: complete
tags: [task]
source: .lore/plans/phase-7-hardening.md
related: [.lore/specs/guild-hall-commissions.md]
sequence: 1
modules: [guild-hall-core]
---

# Task: Commission Crash Recovery

## What

On daemon startup, scan `~/.guild-hall/state/commissions/` for active commission state files and recover each one based on process liveness.

Create `recoverCommissions(deps)` in `daemon/services/commission-session.ts` following the same DI pattern as `recoverMeetings()` in `daemon/services/meeting-session.ts`. The function handles three cases:

1. **State file exists, process dead** (PID from state file, `process.kill(pid, 0)` throws): Transition to `failed` with reason "process lost on restart." Before cleaning up the worktree, commit any uncommitted changes in the activity worktree to preserve partial results (REQ-COM-14a). Clean up the worktree but preserve the branch.

2. **State file exists, process alive** (PID check succeeds): Reattach monitoring. Add to the `activeCommissions` Map, start heartbeat tracking. If status was `dispatched`, transition to `in_progress`.

3. **Orphaned worktree** (worktree exists under `~/.guild-hall/worktrees/` with commission naming pattern but no corresponding state file): Commit uncommitted work, transition to `failed` with reason "state lost."

Call `recoverCommissions(deps)` in `createProductionApp()` in `daemon/app.ts` during startup, after socket setup but before accepting requests. Follow the same placement pattern as `recoverMeetings()`.

All git operations must use `cleanGitEnv()` (Phase 5 retro). Add logging on both happy and error paths (Phase 4 retro: happy-path logging matters). Log each recovered commission with its ID, PID, and recovery action taken. Log when no commissions need recovery.

## Validation

- Daemon startup with no state files: logs "no commissions to recover" and continues normally.
- State file with dead PID: commission transitions to `failed`, reason includes "process lost on restart", uncommitted worktree changes are committed before cleanup, branch is preserved, worktree is removed.
- State file with live PID: commission is added to `activeCommissions` Map, heartbeat tracking starts, commission status `dispatched` transitions to `in_progress`.
- Orphaned worktree (no state file): uncommitted work committed, commission transitions to `failed` with reason "state lost", branch preserved.
- All git subprocess calls use `cleanGitEnv()`.
- Unit tests with mocked filesystem, process checks, and git operations covering all three recovery cases plus the "nothing to recover" path.

## Why

From `.lore/specs/guild-hall-commissions.md`:
- REQ-COM-27: "On startup, Guild Hall scans machine-local state files [...] For each active commission, it checks whether the worker process (by PID from state) is still alive."
- REQ-COM-28: "During operation, the heartbeat mechanism detects unresponsive worker processes."
- REQ-COM-29: "Failed commissions preserve all state per REQ-COM-14a: the commission branch (not merged, not deleted), all committed artifacts, progress reports, questions, decisions, and the full activity timeline."

From `.lore/retros/mcp-pid-files.md`: Per-entity PID checking (alive? reconnect or respawn) subsumes boot cleanup and handles every recovery scenario.

## Files

- `daemon/services/commission-session.ts` (modify: add `recoverCommissions()`)
- `daemon/app.ts` (modify: call `recoverCommissions()` in startup)
- `tests/daemon/commission-crash-recovery.test.ts` (create)
