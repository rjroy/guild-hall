---
title: Implementation notes: phase-7-hardening
date: 2026-02-23
status: active
tags: [implementation, notes]
source: .lore/plans/phase-7-hardening.md
modules: [guild-hall-core, guild-hall-ui]
---

# Implementation Notes: Phase 7 Hardening

## Progress
- [x] Phase 1: Commission Crash Recovery (task 001)
- [x] Phase 2: Commission Concurrent Limits and FIFO Queue (task 002)
- [ ] Phase 3: Queued Commission UI (task 003)
- [ ] Phase 4: Dependency Auto-Transitions (task 004)
- [ ] Phase 5: Memory Access Control (task 005)
- [ ] Phase 6: Memory Injection (task 006)
- [ ] Phase 7: Memory Compaction (task 007)
- [ ] Phase 8: Concurrency Hardening (task 008)
- [ ] Phase 9: Manager sync_project Tool (task 009)
- [ ] Phase 10: Daemon Connectivity Graceful Degradation (task 010)
- [ ] Phase 11: State Isolation Proof (task 011)
- [ ] Phase 12: Workspace Scoping Verification (task 012)
- [ ] Phase 13: Validate Against Specs (task 013)

## Research Context

Prior work surfaced these critical warnings for Phase 7:
- Always use `cleanGitEnv()` for any git subprocess (Phase 5 retro: cost a full day of lost work)
- Production wiring is not optional: new modules must be wired into session creation paths, not just tested with mocks (worker-dispatch retro)
- Resource budgets need real-workload validation: `maxTurns: 1`, `maxBudgetUsd: 0.05` for compaction (dispatch-hardening retro)
- Race conditions in auto-dispatch: serialize check-and-dispatch with locks (SSE streaming bug retro)
- Log the success path in all state transitions (Phase 4 retro)
- Per-entity PID checks, not global boot cleanup (mcp-pid-files retro)
- Test under realistic conditions after full phase (Phase 1, Phase 4 retros)

## Log

### Phase 1: Commission Crash Recovery
- Dispatched: Add `recoverCommissions()` to commission-session.ts following recoverMeetings() DI pattern. Three cases: dead PID (fail + preserve branch), live PID (reattach monitoring), orphaned worktree (commit + fail).
- Result: Implemented two-phase recovery. Phase 1 scans state files (dead/live PID handling). Phase 2 scans for orphaned worktrees. Added `isProcessAlive` DI seam to `CommissionSessionDeps`. Wired into `createProductionApp()` after meeting recovery.
- Tests: 24 new tests, 1321 total pass. Covers all three recovery cases, terminal state skipping, corrupt files, error resilience.
- Review: No issues. All git ops go through GitOps (cleanGitEnv applied). Logging on all paths. DI pattern matches recoverMeetings().

### Phase 2: Commission Concurrent Limits and FIFO Queue
- Dispatched: Add config fields (commissionCap, maxConcurrentCommissions), capacity checks in dispatch, auto-dispatch on completion/failure/cancellation, FIFO ordering across all projects.
- Result: Added capacity helpers (isAtCapacity, countActiveForProject), scanPendingCommissions() for FIFO ordering by creation date, tryAutoDispatch() with promise-chain serialization to prevent race conditions. Dispatch returns `{ status: "queued" }` when at limit. Added commission_queued/commission_dequeued SystemEvent types. Post-merge syncStatusToIntegration added as safety net for auto-dispatch scanner.
- Tests: 14 new tests, 1335 total pass. Covers per-project caps, global caps, FIFO ordering, auto-dispatch on all terminal states, cross-project ordering, limit changes.
- Review: No issues. Race condition handled via autoDispatchChain promise serialization. All requirements met (COM-21, COM-22, COM-23).
