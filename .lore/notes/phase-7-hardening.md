---
title: Implementation notes: phase-7-hardening
date: 2026-02-23
status: complete
tags: [implementation, notes]
source: .lore/plans/phase-7-hardening.md
modules: [guild-hall-core, guild-hall-ui]
---

# Implementation Notes: Phase 7 Hardening

## Progress
- [x] Phase 1: Commission Crash Recovery (task 001)
- [x] Phase 2: Commission Concurrent Limits and FIFO Queue (task 002)
- [x] Phase 3: Queued Commission UI (task 003)
- [x] Phase 4: Dependency Auto-Transitions (task 004)
- [x] Phase 5: Memory Access Control (task 005)
- [x] Phase 6: Memory Injection (task 006)
- [x] Phase 7: Memory Compaction (task 007)
- [x] Phase 8: Concurrency Hardening (task 008)
- [x] Phase 9: Manager sync_project Tool (task 009)
- [x] Phase 10: Daemon Connectivity Graceful Degradation (task 010)
- [x] Phase 11: State Isolation Proof (task 011)
- [x] Phase 12: Workspace Scoping Verification (task 012)
- [x] Phase 13: Validate Against Specs (task 013)

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

### Phase 3: Queued Commission UI
- Dispatched: Update CommissionHeader (amber gem), CommissionActions (queued indicator), CommissionView (SSE events) for queued state.
- Result: Added "queued" to PENDING_STATUSES for amber gem mapping. Dispatch/redispatch handlers read response body and call onStatusChange("queued"). New CSS classes for queued indicator. CommissionView handles commission_queued/commission_dequeued SSE events. isLive includes "queued" to keep SSE connection open.
- Tests: 28 new tests, 1363 total pass. Covers gem mapping, button visibility logic, SSE event handling, type contracts.
- Review: No issues. REQ-VIEW-27 met. CSS Modules with design tokens, no Tailwind. No queue position numbers.

### Phase 4: Dependency Auto-Transitions
- Dispatched: Implement checkDependencyTransitions() for blocked<->pending auto-transitions based on artifact existence. Wire trigger points after squash-merge, artifact edit, and failure/cancellation.
- Result: Added readCommissionDependencies() helper in commission-artifact-helpers.ts. checkDependencyTransitions() scans integration worktree, checks file existence via DI seam (fileExists). Triggers FIFO auto-dispatch after unblocking. Six trigger points: commission exit, failure, cancellation, meeting close, artifact edit API, and new POST /commissions/check-dependencies endpoint.
- Tests: 15 new tests, 1378 total pass. Covers blocked->pending, pending->blocked, no-deps case, FIFO dispatch trigger, active commissions skipped.
- Review: No issues. REQ-COM-7 met. All filesystem reads, no git operations needed. Logging on success and error paths.

### Phase 5: Memory Access Control
- Dispatched: Add workerName/projectName to BaseToolboxDeps, propagate through toolbox-resolver, enforce worker scope ownership, remove workerName from tool input schema.
- Result: BaseToolboxDeps now requires workerName and projectName. resolveToolSet() resolves identity from context with fallbacks (worker.identity.name, path.basename). Worker scope always uses deps.workerName. Project scope uses deps.projectName (eliminated "unknown" fallback). Tool descriptions updated. Production wiring in meeting-session.ts and commission-worker.ts.
- Tests: 15 new tests, 1393 total pass. Covers worker isolation, project scope resolution, global scope, toolbox resolver propagation with fallbacks.
- Review: Flagged missing isolation tests in base-toolbox.test.ts, but the dedicated memory-access-control.test.ts already covers this thoroughly (worker A can't read B's memory, different workers have isolated scopes). No action needed.

### Phase 6: Memory Injection
- Dispatched: Create memory-injector.ts with loadMemories(), wire into meeting-session, commission-worker, and manager-context. Add memoryLimit config field.
- Result: loadMemories() reads three scopes (global, project, worker), sorts by mtime, soft-cap truncation, returns needsCompaction flag. Wired into all three activation paths. memoryLimit added to ProjectConfig (default 8000). Non-fatal error handling (log and continue without memory).
- Tests: 19 new tests, 1412 total pass. Covers empty dirs, single/all scopes, mtime sorting, under/over limit, soft cap, budget allocation.
- Review: Found commission worker not passing memoryLimit from project config. Fixed by adding memoryLimit to CommissionWorkerConfigSchema and passing through dispatch config. Budget accounting overhead in first scope noted as acceptable soft cap.

### Phase 7: Memory Compaction
- Dispatched: Create memory-compaction.ts with fire-and-forget compaction. Concurrent guard per worker+project pair, snapshot isolation, SDK invocation with maxTurns: 1.
- Result: triggerCompaction() with concurrent guard (Map keyed by worker::project), snapshot isolation (only snapshot files processed/deleted), _compacted.md written per scope, fire-and-forget from callers. Wired into meeting-session and commission-worker.
- Tests: 21 new tests, 1433 total pass. Covers basic flow, concurrent guard, snapshot isolation, error handling, prior summary preservation.
- Review: Found two issues. (1) Prior _compacted.md content was lost on second compaction cycle (critical). Fixed by reading prior summary and including in SDK prompt. (2) SDK tools not explicitly disabled. Fixed by adding mcpServers: {}, allowedTools: []. Partial-state-on-failure documented as known limitation.

### Phase 8: Concurrency Hardening
- Dispatched: Wrap createMeeting/acceptMeetingRequest in withProjectLock (TOCTOU fix). Add squash-merge conflict detection and resolution in commission close path.
- Result: Meeting creation/acceptance serialized via withProjectLock. New GitOps methods: squashMergeNoCommit, listConflictedFiles, resolveConflictsTheirs, abortMerge. resolveSquashMerge() handles .lore/ conflicts (auto-resolve with --theirs) and non-.lore/ conflicts (fail with "merge conflict"). Applied same conflict-aware pattern to meeting close.
- Tests: 8 new tests, 1441 total pass. Covers concurrent cap enforcement, .lore/ auto-resolution, non-.lore/ failure, mixed conflicts, clean merge.
- Review: Found three issues, all fixed. (1) closeMeeting() still used old squashMerge(), now conflict-aware. (2) completed->failed transition bypassed state machine via try/catch, now uses direct update with comment. (3) Added --theirs semantics comment for squash-merge context.

### Phase 9: Manager sync_project Tool
- Dispatched: Add sync_project as sixth manager-exclusive tool. Reuse syncProject() from cli/rebase.ts.
- Result: Tool validates project exists via DI-injected getProjectConfig, delegates to syncProject() which already handles locking and cleanGitEnv(). describeSyncResult() translates all five SyncResult variants into human-readable summaries. No extraction needed since cli/rebase.ts was already DI-ready.
- Tests: 8 new tests, 1449 total pass. Covers all SyncResult variants (reset, noop, skip, rebase, error), unregistered project, DI injection.
- Review: No issues. All 10 checklist items pass.

### Phase 10: Daemon Connectivity Graceful Degradation
- Dispatched: Create DaemonContext with isOnline state, convert DaemonStatus to provider, disable action buttons when offline.
- Result: DaemonContext.tsx exports useDaemonStatus() hook. DaemonStatus.tsx converted to context provider wrapping children. App layout wrapped. All daemon-dependent buttons disabled when offline with "Daemon offline" tooltip: CommissionActions, MessageInput, MeetingView close, MeetingRequestCard actions.
- Tests: 36 new tests, 1485 total pass. Covers context exports, state contracts, button disabling logic, tooltip consistency.
- Review: Found 4 additional components missing offline disabling (CommissionNotes, CommissionPrompt, CommissionForm, StartAudienceButton). All fixed. StartAudienceButton migrated from one-shot health check to DaemonContext for auto-reconnect sync.

### Phase 11: State Isolation Proof
- Dispatched: Write five integration tests proving same-worker meeting+commission isolation.
- Result: All five tests pass. Session isolation (distinct SDK session IDs), worktree isolation (different directories/branches), tool isolation (meeting tools vs commission tools, no cross-contamination), memory visibility (worker-scope write in commission readable from meeting), independent lifecycle (close meeting, commission continues; complete commission, meeting unaffected).
- Tests: 5 new tests, 1490 total pass. Test-only task, no production code changes.

### Phase 12: Workspace Scoping Verification
- Dispatched: Write four verification test groups confirming workspace scoping holds.
- Result: Seven tests across four groups. Commission scoping (scanCommissions isolated per project), memory scoping (project and worker scope paths isolated), dependency scoping (integrationWorktreePath per project), manager cross-workspace awareness (context per project, workers global).
- Tests: 7 new tests, 1497 total pass. Test-only task, no production code changes.

### Phase 13: Validate Against Specs
- Dispatched: Read all five specs and validate all 19 Phase 7 requirements against implementation.
- Result: All 19 requirements MET. COM-7 (dependency transitions), COM-21/22/23 (capacity limits and FIFO), COM-27/28/29 (crash recovery), SYS-19/20/21 (memory scoping), WKR-22 (memory injection), WKR-23 (compaction), MTG-28 (concurrent cap), MTG-29 (no auto-close), MTG-30 (state isolation), VIEW-7/8 (offline degradation), VIEW-10 (cross-project aggregation), VIEW-27 (queued UI). No gaps found.
- Review: Read-only validation task, no code changes.
