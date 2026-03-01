---
title: "Implementation notes: activity-state-machine"
date: 2026-03-01
status: complete
tags: [implementation, notes]
source: .lore/plans/activity-state-machine.md
modules: [commission-session, meeting-session, commission-state-machine, activity-state-machine]
---

# Implementation Notes: Activity State Machine

## Progress
- [x] Phase 1: Build the ActivityMachine class
- [x] Phase 2: Build commission handlers and graph configuration
- [x] Phase 3: Wire commission session to use the machine
- [x] Phase 4: Build meeting handlers and graph configuration
- [x] Phase 5: Wire meeting session to use the machine
- [x] Phase 6: Wire crash recovery through the machine
- [x] Phase 7: Production wiring and integration
- [x] Phase 8: Validate against spec

## Summary

Replaced scattered commission and meeting lifecycle management with a generic `ActivityMachine<TStatus, TId, TEntry>` class. 8 phases over a single session. Created 4 new files (~1,770 lines of production code, ~170 tests), rewrote 3 existing files (net reduction ~400 lines), deleted 1 file. Final test count: 1697/1697 pass.

Core deliverables: generic state machine with enter/exit handlers and cleanup hooks (`activity-state-machine.ts`), commission handlers and graph (`commission-handlers.ts`), meeting handlers and graph (`meeting-handlers.ts`), full rewiring of both session files and crash recovery. 6 divergences from spec documented below, all justified by implementation reality.

## Log

### Phase 1: Build the ActivityMachine class
- Dispatched: Build `daemon/lib/activity-state-machine.ts` (~467 lines) and `tests/daemon/lib/activity-state-machine.test.ts` (44 tests)
- Result: All types, class, and tests created per design doc
- Review: Code reviewer found critical bug -- `writeStatusAndTimeline` throw permanently deadlocked the per-entry lock. Fixed by wrapping artifact write in try/catch that releases lock before re-throwing. Added test for this scenario. Also noted `registerActive()` and `getState()` not in design doc (plan explicitly added these, documentation gap only).
- Tests: 44/44 pass, full suite 1595/1595 pass

### Phase 2: Build commission handlers and graph configuration
- Dispatched: Create `daemon/services/commission-handlers.ts` (~350 lines) with stub handlers, graph, config. Added "abandoned" to `CommissionStatus`. Created `tests/daemon/services/commission-handlers.test.ts` (65 tests)
- Result: Graph, config constants, handler stubs, and fully-implemented enter-abandoned handler. ActiveCommissionEntry type with optional worktreeDir/branchName/abortController.
- Review: No critical issues. Tightened test mock to use real `SystemEvent` type instead of loose custom type. Legacy commission-state-machine.ts comment gap noted but moot (file deleted in Phase 3).
- Tests: 65/65 pass, full suite 1660/1660 pass

### Phase 3: Wire commission session to use the machine
- Dispatched: Major rewrite of `commission-session.ts` (net -426 lines). Implemented all handler stubs in `commission-handlers.ts`. Deleted `commission-state-machine.ts` and its tests.
- Result: All transitions route through `machine.transition()`. `activeCommissions` Map replaced by machine. Handlers fully implemented with git ops, event emission, squash-merge, re-entrant completed->failed.
- Review (code-reviewer): Found `dispatched -> cancelled` graph edge missing. Also noted `checkDependencyTransitions` bypasses machine for pending/blocked (intentional design, documented in comments), and `trackedEntries` not cleaned after abandoned (minor).
- Review (silent-failure-hunter): Found 16 findings across 4 severity levels. 8 fixed:
  - CRITICAL: Added `dispatched -> cancelled` edge to graph
  - CRITICAL: Distinguished `finalizeActivity` exceptions from merge conflicts in enter-completed
  - HIGH: Handle `dispatched -> in_progress` skip by transitioning to failed
  - HIGH: Wrapped `preserveAndCleanupWorktree` in try/catch in enter-failed and enter-cancelled
  - HIGH: Await meeting escalation instead of fire-and-forget
  - MEDIUM: Removed redundant mkdir in enter-dispatched
  - MEDIUM: Replaced "unknown" fallback with thrown error in resolveBasePath
  - MEDIUM: Changed cleanup hook error logging to console.error
- Pre-existing patterns noted but not changed: `deleteStateFile` empty catch, `handleError` abort/shutdown path, `scanPendingCommissions` empty catches, `syncStatusToIntegration` best-effort, `void triggerCompaction`, `checkDependencyTransitions` empty catches
- Tests: full suite 1640/1640 pass

### Phase 4: Build meeting handlers and graph configuration
- Dispatched: Create `daemon/services/meeting-handlers.ts` (~601 lines) with handlers, graph, config. Created `tests/daemon/services/meeting-handlers.test.ts` (59 tests)
- Result: Transition graph (requested->open/declined, open->closed), handler implementations with Phase 3 lessons applied (distinct exception handling, awaited escalation, try/catch on cleanup ops). Enter-declined fully implemented. Enter-open distinguishes accept vs inject via sourceState.
- Review: Fixed test assertion missing parentheses (`.toBeDefined` -> `.toBeDefined()`). Added logging to transcript removal catch blocks. Removed unused `readArtifactAgenda` from deps interface.
- Tests: 59/59 pass, full suite 1699/1699 pass

### Phase 5: Wire meeting session to use the machine
- Dispatched: Rewrite of `meeting-session.ts`. Replaced `activeMeetings` Map, `VALID_TRANSITIONS`, `validateTransition()` with machine methods. Handlers in `meeting-handlers.ts` fully implemented.
- Result: All meeting lifecycle (create, accept, close, decline) routes through machine. SDK session started after machine transition (not inside handlers) to support async generator streaming. Cap enforcement uses entry status inside `withProjectLock` to prevent TOCTOU races.
- Design decisions: Artifact written before `machine.inject()` for direct creation. SDK session started after machine transition, not inside handlers. Cap enforcement uses entry status, not `machine.has()`.
- Review (code-reviewer): Found `closeMeeting` reads notes from deleted worktree (critical), `trackedEntries` never cleaned (important).
- Review (silent-failure-hunter): 11 findings. 5 fixed:
  - CRITICAL: `closeMeeting` now reads from integration worktree (worktree is always removed by `finalizeActivity`)
  - CRITICAL: `trackedEntries` cleanup added to `closeMeeting` and `declineMeeting`
  - HIGH: `closeMeeting` catch block now logs errors instead of swallowing
  - MEDIUM: Failed transition now cleans up orphaned entries in `acceptMeetingRequest` and `createMeeting`
  - MEDIUM: Transition return values checked in `closeMeeting` and `declineMeeting`
- Updated integration.test.ts and notes-generator.test.ts mocks to simulate squash-merge behavior (copy .lore/ to integration path)
- Pre-existing patterns noted: bare catch blocks (10 locations), `deleteStateFile` empty catch, `void triggerCompaction`, recovery close bypasses machine (per plan REQ-ASM-31)
- Tests: full suite 1699/1699 pass

### Phase 6: Wire crash recovery through the machine
- Dispatched: Rewrote `commission-recovery.ts` to use `machine.register()` + `machine.transition()` instead of manual recovery side effects. Meeting recovery was already correctly wired.
- Result: Commission recovery now registers entries at stored status, transitions to failed via machine. Enter-failed handler handles all side effects (commit partial, worktree cleanup, sync, state file). Orphaned worktrees get synthetic entries. `recoverDeadCommission` helper removed entirely. Recovery now returns actual count of recovered commissions.
- Meeting recovery: Already using `machine.registerActive()` for worktree-present, direct artifact update for worktree-missing. No changes needed.
- Tests: Updated commission-recovery.test.ts and crash-recovery.test.ts. Full suite 1697/1697 pass (2 fewer tests from recovery test consolidation).

### Phase 7: Production wiring and integration
- Dispatched: DI assembly verification of `daemon/app.ts`, both session factories, and handler deps.
- Result: All wiring verified clean. Commission machine (17 handler deps), meeting machine (all handler deps), circular dependency (lazy `meetingSessionRef`), cleanup hooks, recovery integration all confirmed.
- One issue fixed: Meeting session had forward reference to `machine` in `artifactOps` closure. Introduced `let machineRef` with null guard matching commission session pattern.
- Typecheck: clean. Lint: clean. Tests: 1697/1697 pass.

### Phase 8: Validate against spec
- Dispatched: Full spec validation of all 31 requirements (REQ-ASM-1 through REQ-ASM-31) and 8 success criteria against implemented code.
- Result: 25/31 requirements fully met, 4 partially met, 2 not met as described.
- Partially met (behavioral outcome preserved, structural boundary differs):
  - REQ-ASM-3: `trackedEntries` Map exists alongside machine (not purely encapsulated)
  - REQ-ASM-14: SDK session launched after machine transition, not inside enter handler
  - REQ-ASM-17: `trackedEntries` cleaned in session code, not via machine lifecycle
  - REQ-ASM-28: Recovery count from state file scan, not from machine method
- Not met as described:
  - REQ-ASM-19: `checkDependencyTransitions` moves blocked->pending without machine (commissions never tracked until dispatched)
  - REQ-ASM-20: `checkDependencyTransitions` moves pending->blocked without machine (same reason)
- All 8 success criteria met or substantially met.

## Divergence

- **Abandoned state extension**: Added terminal "abandoned" state to commission graph beyond spec, with transitions from pending/blocked/failed/cancelled. Required for orphaned commission cleanup. (approved, Phase 2)
- **dispatched->cancelled edge**: Spec graph omitted this edge. Required because `cancelCommission` already allowed dispatched state. (approved, Phase 3)
- **SDK session launch location**: Spec placed SDK session start inside enter-open handler. Moved outside because async generator streaming requires yield after machine transition, not inside handler. (approved, Phase 5)
- **Dependency transition bypass**: `checkDependencyTransitions` (blocked<->pending) bypasses machine entirely. These commissions are never tracked in the machine because they haven't been dispatched. Machine only governs dispatched-and-later lifecycle. (approved, Phase 3)
- **Escalation location**: Guild Master escalation on merge conflict fires from commission session code after enter-completed handler, not inside the handler. Matches the SDK session launch pattern. (approved, Phase 3)
- **Meeting SDK streaming**: SDK session started after `machine.inject()` returns, not inside enter-open handler, to support async generator yield for SSE streaming. (approved, Phase 5)
