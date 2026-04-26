---
title: Meeting infrastructure convergence
date: 2026-03-02
status: implemented
tags: [architecture, meetings, refactor, infrastructure, convergence, state-machine]
modules: [meeting-orchestrator, meeting-record, active-session-registry, workspace, sdk-runner]
related:
  - .lore/brainstorm/meeting-infrastructure-convergence.md
  - .lore/specs/meetings/guild-hall-meetings.md
  - .lore/specs/commissions/commission-layer-separation.md
  - .lore/retros/in-process-commissions.md
  - .lore/retros/phase-5-git-integration-data-loss.md
req-prefix: MIC
---

# Spec: Meeting Infrastructure Convergence

## Overview

The commission and meeting systems implement the same infrastructure (artifact I/O, workspace provisioning, merge conflict escalation) independently. After the commission layer separation, commissions have clean implementations of these operations. Meetings still use the older pattern: an ActivityMachine with enter/exit handlers that mix state transitions with git operations, artifact writes, and session management.

This spec converges meeting infrastructure onto what commissions already built, and simplifies the meeting lifecycle to match what it actually does. Meetings don't need a state machine. Their runtime lifecycle is "active or not": a session is open or it isn't. The ActivityMachine's 11-step transition execution, re-entrant transition detection, per-entry locking, and handler orchestration is disproportionate to that problem.

The refactor extracts shared record utilities, migrates meetings to workspace.ts, replaces the ActivityMachine with an active session registry, and removes the ActivityMachine once nothing uses it.

## Entry Points

- All existing meeting entry points are unchanged (from [Spec: guild-hall-meetings](.lore/specs/meetings/guild-hall-meetings.md))
- Commission record operations continue working (commissions are not modified)

## Requirements

### Shared Record Utilities

- REQ-MIC-1: Common YAML frontmatter operations used by both commissions and meetings are extracted into shared utilities. These operations include: reading a field value by name, replacing a field value by name (preserving surrounding content), and appending a timestamped log entry before a named marker field. Both commission and meeting record layers use these utilities instead of duplicating regex logic.

- REQ-MIC-2: The shared utilities operate on raw file content strings and field names. They are domain-agnostic: they receive content strings and field name strings as parameters. They understand YAML field syntax but have no knowledge of commission states, meeting states, or what any specific field represents. The domain-specific record layers call these utilities with the right field names for their artifact format.

- REQ-MIC-3: Commission record operations (CommissionRecordOps) continue to work as they do today. The extraction is additive: commission record.ts delegates to shared utilities for the operations that overlap, but its interface and behavior do not change.

- REQ-MIC-4: Meeting record operations are restructured to use the shared utilities. The meeting-specific operations (path resolution from projectPath + meetingId, meeting_log append location, notes_summary writes, linked_artifacts manipulation) remain meeting-specific. The underlying regex mechanics are shared.

### Meeting Workspace Convergence

- REQ-MIC-5: Meetings use workspace.ts for workspace provisioning instead of inlining git operations. The meeting open flow calls workspace.prepare() with the appropriate configuration (project path, branch name, worktree path, checkout scope). The meeting close flow calls workspace.finalize() for the squash-merge. The decline flow does not interact with workspace.ts (no resources are provisioned).

- REQ-MIC-6: Merge conflict escalation to Guild Master is shared between commissions and meetings. A single escalation function creates a Guild Master meeting request with conflict details (activity ID, branch name, project name). Both the commission orchestrator and the meeting orchestrator call this function when workspace.finalize() returns a non-merged result. The escalation logic is not duplicated across orchestrators.

### Active Session Registry

- REQ-MIC-7: The ActivityMachine is replaced for meetings with an active session registry. The registry tracks open meetings with their runtime state. It is not a state machine: it does not validate transitions, run handlers, or manage a transition graph. It is a typed Map with lifecycle operations.

- REQ-MIC-8: The registry provides these operations:
  - Register an open meeting (add to registry with runtime state)
  - Deregister a meeting (remove from registry on close)
  - Look up an active meeting by ID
  - Check whether a meeting is active
  - Count active meetings (for cap enforcement)
  - List active meetings for a project (for cap enforcement and recovery)

- REQ-MIC-9: The registry provides a concurrent close guard. If a close operation is already in progress for a meeting, a second close attempt is rejected. This replaces the per-entry promise-chain locking from the ActivityMachine. The guard prevents the race between a user-initiated close and an error-triggered close from executing cleanup twice (carrying forward the lesson from the in-process commission migration retro).

- REQ-MIC-10: Cap enforcement uses the registry's count. The orchestrator checks the registry's per-project active count before opening a new meeting. This replaces the current pattern of checking a parallel `trackedEntries` Map alongside the ActivityMachine.

### Meeting Orchestrator

- REQ-MIC-11: The meeting orchestrator (currently meeting-session.ts) drives meeting lifecycle as explicit sequential steps instead of routing through ActivityMachine enter/exit handlers. The open flow: verify cap, provision workspace, write artifact, register in registry, create transcript, start SDK session, emit event. If any step after registration fails, the orchestrator deregisters the meeting, cleans up provisioned resources, and propagates the error. A failed open does not leave a zombie entry consuming a cap slot. The close flow: abort SDK session, generate notes, write notes, finalize workspace, handle merge result (escalate if non-merged), deregister, delete state file, emit event. State file is always deleted on close regardless of merge result; a non-merged result is a clean close with escalation, not a crash. The decline flow: write artifact status, emit event.

- REQ-MIC-11a: "Cleans up provisioned resources" in REQ-MIC-11 includes both the activity worktree and the activity branch. When cleanup runs after a failed open and no commits were made on the branch beyond the branch point, the branch must be deleted. An orphaned empty branch blocks retry attempts (branch creation fails on name collision) and has no work worth preserving. Branch deletion is skipped only when the branch contains commits beyond the base, indicating work that may need manual recovery.

- REQ-MIC-11b: Operational errors during meeting lifecycle transitions (open, close, accept, decline) must be logged to the daemon's standard error output in addition to being surfaced through the SSE stream. SSE streams are transient and not recoverable after disconnection. If a lifecycle operation fails, the daemon's own logs must contain the error with enough context to diagnose the failure without requiring the client to have been connected at the time.

- REQ-MIC-12: Artifact status writes and meeting log appends happen as explicit steps in the orchestrator flows, through the meeting record operations (REQ-MIC-4). They are no longer routed through an ArtifactOps callback on the state machine.

- REQ-MIC-13: The meeting orchestrator's public interface (the methods that routes call) does not change. createMeeting, acceptMeetingRequest, sendMessage, closeMeeting, declineMeeting, deferMeeting, and recoverMeetings continue to exist with the same signatures and return types.

### Recovery

- REQ-MIC-14: Meeting crash recovery scans machine-local state files and re-registers open meetings in the active session registry. State files exist only for meetings that reached open status. Requested, declined, and closed meetings have no state files; recovery only encounters open meetings. Recovery does not re-run open setup (the worktree already exists). This preserves the current behavior where registerActive() skips handler execution (REQ-ASM recovery semantics).

- REQ-MIC-15: If a state file references a worktree that no longer exists, recovery closes the meeting (writes artifact status, emits event, deletes state file). This preserves the current stale-worktree recovery behavior.

### ActivityMachine Removal

- REQ-MIC-16: After meetings migrate to the active session registry, the ActivityMachine class and its associated types (TransitionContext, EnterHandler, ExitHandler, ArtifactOps, ActivityMachineConfig, TransitionResult, CleanupHook, CleanupEvent, EnterHandlerResult) are removed. No other system uses them.

- REQ-MIC-17: The meeting-handlers.ts file is removed. Its logic (enter-open, enter-closed, enter-declined, exit-open, ArtifactOps configuration) is absorbed into the meeting orchestrator as explicit steps per REQ-MIC-11.

- REQ-MIC-18: The activity-state-machine spec and design documents are moved to the archive. REQ-ASM-23 through REQ-ASM-27 (meeting transition graph and handler definitions) are superseded by REQ-MIC-11 through REQ-MIC-15. The meeting handler semantics described in those ASM requirements are absorbed into the orchestrator as explicit sequential steps. The activity-state-machine documents become historical context, not active implementation targets.

### Behavioral Preservation

- REQ-MIC-19: All meeting behaviors defined in the meetings spec (REQ-MTG-1 through REQ-MTG-30) are preserved. The refactor changes where logic lives, not what the system does. External API contracts (REST routes, SSE events, artifact format, state file format) do not change.

- REQ-MIC-20: All existing meeting tests continue to pass. Tests that verify external behavior are unchanged. Tests that verify ActivityMachine internals (handler invocation, transition graph validation) are rewritten to test the new orchestrator flows and registry operations.

- REQ-MIC-21: Commission behavior is unaffected. Commission record operations, lifecycle, workspace usage, and orchestration are not modified by this refactor. The shared record utility extraction (REQ-MIC-1) is additive; commissions delegate to shared utilities but their interfaces and behavior are identical.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Meeting decomposition | Sharp edges remain after convergence, meetings need further structural separation | [STUB: meeting-layer-decomposition] |

## Success Criteria

- [ ] Shared record utilities exist and are used by both commission record.ts and meeting record operations
- [ ] Meetings use workspace.prepare() for provisioning and workspace.finalize() for merge
- [ ] A single merge conflict escalation function is called by both commission and meeting orchestrators (no duplicate implementation)
- [ ] ActivityMachine is not used by meetings
- [ ] Active session registry tracks open meetings with concurrent close guard
- [ ] Meeting orchestrator drives lifecycle as explicit steps (no enter/exit handler routing)
- [ ] Meeting orchestrator's public interface is unchanged
- [ ] Crash recovery works through the registry
- [ ] ActivityMachine class and types are removed from the codebase
- [ ] meeting-handlers.ts is removed
- [ ] All meeting behaviors from REQ-MTG-1 through REQ-MTG-30 are preserved
- [ ] All existing tests pass
- [ ] Commission behavior is unaffected

## AI Validation

**Defaults:**
- Unit tests with mocked filesystem, git operations, and SDK sessions
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Shared utility test: verify replaceYamlField, readYamlField, and appendLogEntry work identically for commission and meeting artifact content. Test with real artifact samples from both systems.
- Workspace convergence test: meeting open creates workspace via workspace.prepare() (not inlined git calls). Meeting close finalizes via workspace.finalize(). Verify branch, worktree, and sparse checkout match current behavior.
- Registry test: register, deregister, lookup, cap count. Concurrent close guard rejects second close attempt. Verify no state machine semantics leak in (no transition validation, no handler execution).
- Recovery test: simulate daemon restart with state files. Registry re-populated. Stale worktree detected and meeting closed.
- Orchestrator flow test: trace a full create-message-close flow through the new orchestrator. Verify artifact writes, workspace calls, registry operations, and events match current behavior.
- Commission isolation test: run commission tests after the shared utility extraction. All pass with no modifications to commission code.
- Regression suite: all existing meeting and commission tests pass.
- Dead code test: no imports of ActivityMachine, TransitionContext, EnterHandler, ExitHandler, ArtifactOps, or ActivityMachineConfig remain in the codebase after migration. Verify `apps/daemon/lib/activity-state-machine.ts` and `apps/daemon/services/meeting-handlers.ts` do not exist.

## Constraints

- No database. All meeting state is files.
- External API contracts are frozen. Routes, SSE event shapes, artifact format, and state file format do not change.
- Commission code is not restructured. The only commission change is delegating common regex operations to shared utilities (additive, not breaking).
- The refactor is phased, not a big-bang rewrite. Each phase produces working code with passing tests.
- This spec defines what converges and what's removed. File structure, TypeScript interfaces, and migration sequence belong in the design and plan.

## Context

- [Brainstorm: Meeting Infrastructure Convergence](.lore/brainstorm/meeting-infrastructure-convergence.md): The source brainstorm. Identifies the "same things done differently" problem, proposes the active session registry, and rejects the five-layer pattern for meetings.
- [Spec: Guild Hall Meetings](.lore/specs/meetings/guild-hall-meetings.md): The meeting behavioral contract (REQ-MTG-1 through REQ-MTG-30). All requirements carry forward unchanged.
- [Spec: Commission Layer Separation](.lore/specs/commissions/commission-layer-separation.md): Commission's five-layer decomposition. Layer 3 (workspace.ts) is already commission-agnostic (REQ-CLS-19, CLS-21). Exit point `[STUB: meeting-layer-separation]` is what this spec addresses (as infrastructure convergence rather than layer mirroring).
- Spec: Activity State Machine (removed in PR #58/#60): The shared state machine spec retired by this convergence. Meeting handler semantics (REQ-ASM-23 through REQ-ASM-27) were absorbed into the orchestrator.
- Design: Activity State Machine (removed in PR #58/#60): Documented ArtifactOps callbacks, TransitionContext, and re-entrant transitions. Historical context for what was removed.
- Plan: Extract finalizeActivity (removed in PR #62): Unified the commit-merge-cleanup sequence. Meetings called finalizeActivity which delegates to workspace.finalize(). This convergence was a prerequisite.
- Plan: Extract query runner (removed in PR #62): Extracted SDK query execution from meeting-session.ts into query-runner.ts as an intermediate step. This separated meeting lifecycle from SDK execution, making the orchestrator restructuring tractable. query-runner.ts was subsequently replaced by the shared sdk-runner.ts in the unified SDK runner migration (also removed in PR #62).
- [Retro: In-Process Commission Migration](.lore/retros/in-process-commissions.md): Terminal state guard pattern for cancel/completion races. The concurrent close guard (REQ-MIC-9) carries this lesson forward.
- [Retro: Phase 5 Git Integration](.lore/retros/phase-5-git-integration-data-loss.md): cleanGitEnv() requirement. Meetings inherit this through workspace.ts (which uses GitOps that enforces it).
- [Issue: Capability-Oriented Module Organization](.lore/issues/capability-oriented-module-organization.md): Identifies that shared infrastructure is duplicated across consumer modules. This spec resolves that for record ops and workspace usage.
