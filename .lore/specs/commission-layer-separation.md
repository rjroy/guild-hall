---
title: Commission layer separation
date: 2026-03-01
status: draft
tags: [architecture, commissions, refactor, object-design, boundaries, state-machine]
modules: [commission-session, commission-handlers, commission-recovery, activity-state-machine]
related:
  - .lore/brainstorm/commission-layer-separation.md
  - .lore/_archive/specs/guild-hall-commissions.md
  - .lore/_archive/specs/activity-state-machine.md
  - .lore/_archive/design/activity-state-machine.md
  - .lore/reference/commissions.md
  - .lore/_archive/retros/in-process-commissions.md
  - .lore/_archive/retros/phase-5-git-integration-data-loss.md
  - .lore/_archive/issues/commission-meeting-state-ownership.md
req-prefix: CLS
---

# Spec: Commission Layer Separation

## Overview

Decompose the commission system into five layers with explicit boundaries. The current implementation (8 files, ~3,500 lines) is feature-complete and passes 1,529 tests, but five distinct concerns (record, lifecycle, git operations, SDK session, orchestration) are woven through the same entry/exit handlers, sharing the same `ActiveCommissionEntry` struct, and coordinating through side effects that cross all five concerns. This refactor separates those concerns into layers that can be changed, tested, and understood independently.

The critical architectural change: the executor (workspace provisioning and session running) cannot write to the commission record. The executor signals. The commission writes itself. This hard boundary is what prevents the layers from re-entangling over time.

This refactor also replaces the shared ActivityMachine for commissions with a commission-specific lifecycle layer. The ActivityMachine bakes in assumptions about artifact operations callbacks and entry types that conflict with strict layer separation. Meetings continue using the existing ActivityMachine until a separate migration (out of scope for this spec) applies the same pattern.

## Entry Points

- REST routes call Layer 2 to create, dispatch, cancel, and redispatch commissions (from commission routes)
- Manager worker creates and dispatches commissions programmatically through Layer 2 (from manager toolbox)
- Layer 5 listens to Layer 2 events and coordinates Layer 3 and 4 in response (internal)
- Crash recovery scans state on daemon startup and reconciles through Layer 2 and 5 (from daemon startup)

## Requirements

### Layer Definitions

- REQ-CLS-1: The commission system is decomposed into five layers. Each layer has a single responsibility. No layer reaches into another's internals.

  | Layer | Responsibility |
  |-------|---------------|
  | 1. Record | Commission artifact as pure data. Read/write for YAML frontmatter fields. No behavior. |
  | 2. Lifecycle | State machine, transition validation, signal reception, artifact writes, event emission. |
  | 3. Execution Environment | Workspace provisioning. Git branch, worktree, sparse checkout, squash-merge, cleanup. |
  | 4. Session Runner | Worker activation, SDK session, tool resolution, memory injection, session callbacks. |
  | 5. Orchestrator | Coordination. Capacity, queue, auto-dispatch, crash recovery, event routing. |

- REQ-CLS-2: Layers 1 and 2 together form the commission's public interface. This is what REST routes, manager tools, and the UI interact with. Layers 3, 4, and 5 are internal machinery that external consumers do not see.

### Layer 1: Commission Record

- REQ-CLS-3: Layer 1 provides read and write operations for commission artifact data. It handles YAML frontmatter parsing, field access, and serialization. It does not validate state transitions, enforce invariants, or emit events.

- REQ-CLS-4: All commission artifact writes go through Layer 1. No other layer directly reads or writes commission artifact files. This includes status updates, timeline appends, result summary writes, and linked artifact updates.

- REQ-CLS-5: Layer 1 preserves raw frontmatter bytes when updating artifacts, replacing only the fields that changed. This prevents the YAML reformatting problem documented in the project's retros (gray-matter `stringify()` reformats YAML, causing noisy git diffs).

### Layer 2: Commission Lifecycle

- REQ-CLS-6: Layer 2 owns the commission state machine. Eight states: pending, blocked, dispatched, in_progress, completed, failed, cancelled, abandoned. The `abandoned` state (added post-REQ-COM-5, present in the current implementation) represents permanent manual rejection with no re-dispatch possible, distinct from `cancelled` which allows re-dispatch. Active commissions (dispatched, in_progress) must be cancelled before they can be abandoned. The transition graph matches the current implementation:

  - pending -> dispatched, blocked, cancelled, abandoned
  - blocked -> pending, cancelled, abandoned
  - dispatched -> in_progress, failed, cancelled
  - in_progress -> completed, failed, cancelled
  - completed -> failed (merge conflict after successful completion)
  - failed -> pending, abandoned
  - cancelled -> pending, abandoned
  - abandoned -> (terminal)

- REQ-CLS-7: Layer 2 validates every transition against the graph before executing it. Invalid transitions are rejected with a descriptive error. The state machine is the single entry point for all commission state changes (carrying forward REQ-ASM-28).

- REQ-CLS-8: Layer 2 writes commission artifact updates through Layer 1 as part of transition execution. Every transition records a timeline entry with timestamp and reason. Status, timeline, and any transition-specific fields (result summary, linked artifacts) are updated atomically through Layer 1.

- REQ-CLS-9: Layer 2 emits events when state changes occur. Events carry enough information for subscribers to react (commission ID, project name, old status, new status, reason). Layer 5 treats transitions to completed, failed, cancelled, or abandoned as cleanup events that trigger queue and dependency scans (REQ-CLS-29). The event mechanism is what connects Layer 2 to Layer 5 and to external consumers (SSE subscribers).

- REQ-CLS-10: Layer 2 replaces the ActivityMachine for commissions. It is commission-specific, not a generic shared abstraction. It does not share code or types with the meeting lifecycle. Meeting migration to a similar pattern is a separate effort.

- REQ-CLS-11: Layer 2 handles concurrent transition safety. When two transitions race for the same commission, exactly one executes and the other is rejected or returns a skip indication (carrying forward REQ-ASM-9).

### Signal Contract

- REQ-CLS-12: Layer 2 exposes a signal interface for receiving execution updates. Signals are the mechanism by which the executor (Layers 3 and 4, coordinated by Layer 5) communicates with the commission lifecycle without writing to the artifact directly.

- REQ-CLS-13: The signal contract defines these signals:

  | Signal | Semantics |
  |--------|-----------|
  | progressReported(summary) | Updates current progress, appends timeline entry. Valid in: in_progress. Also resets the heartbeat timer (REQ-CLS-31a). |
  | resultSubmitted(summary, artifacts) | Records result summary and linked artifacts, appends timeline entry. Valid in: in_progress. Can only be called once per execution. |
  | questionLogged(question) | Appends question to timeline. Valid in: in_progress. |
  | executionStarted() | Appends timeline entry noting execution began. Triggers dispatched -> in_progress transition. |
  | executionFailed(reason) | Triggers transition to failed with the given reason. |
  | executionCompleted() | Triggers transition to completed. Layer 5 only sends this signal when a result was submitted (REQ-CLS-25). Layer 2 does not independently verify result submission; it trusts the orchestrator's routing. |

- REQ-CLS-14: Signals validate against current state before taking effect. A progressReported signal on a commission that is not in_progress is rejected. A resultSubmitted signal after a result was already submitted is rejected. The lifecycle layer decides what's valid; the executor just sends signals.

- REQ-CLS-15: The spec defines what signals exist and their semantics. Whether they are implemented as method calls, typed events, or an event bus facade is a design decision, not a spec concern.

### The Hard Boundary

- REQ-CLS-16: Layers 3 and 4 (execution environment and session runner) never read or write commission artifact files. They do not know artifact paths, do not parse frontmatter, do not append timeline entries. All execution state that needs to reach the commission record flows through the signal contract (REQ-CLS-12).

- REQ-CLS-17: Layer 5 (orchestrator) mediates between the execution layers and the lifecycle layer. When Layer 4 reports progress, Layer 5 translates that into a signal to Layer 2. When Layer 2 emits a "dispatched" event, Layer 5 tells Layer 3 to prepare a workspace. The orchestrator is the only layer that knows about all others.

- REQ-CLS-18: The `ActiveCommissionEntry` struct that currently holds both commission identity (commissionId, projectName, workerName) and execution state (worktreeDir, branchName, abortController) is split. Commission identity belongs to Layer 2. Execution state belongs to Layer 5 (which passes relevant pieces to Layer 3 and 4). No single struct spans the boundary.

### Layer 3: Execution Environment

- REQ-CLS-19: Layer 3 provisions and tears down workspaces. It creates git branches, creates worktrees, configures sparse checkout, squash-merges branches, preserves uncommitted work, and removes worktrees. It is commission-agnostic: it receives workspace configuration (project path, branch name, worktree path, checkout scope) and returns workspace paths and operation results.

- REQ-CLS-20: Layer 3 enforces `cleanGitEnv()` on all git subprocess invocations. Git subprocesses spawned during hook execution inherit GIT_DIR, GIT_WORK_TREE, and GIT_INDEX_FILE from the parent. Layer 3 strips these variables so operations target the intended repository (carrying forward the lesson from phase 5 retro).

- REQ-CLS-21: Layer 3 does not know about commissions, state machines, or signals. Its interface is: "prepare a workspace with these parameters" and "finalize/teardown this workspace." The caller (Layer 5) decides when to invoke these operations based on lifecycle events.

### Layer 4: Session Runner

- REQ-CLS-22: Layer 4 activates workers, configures SDK sessions, resolves tools, injects memory, and runs the session to completion. It receives a workspace path and a work specification (prompt, worker metadata, resource limits, tool configuration). It reports back through a narrow callback interface: progress happened, result ready, question asked, session ended.

- REQ-CLS-23: Layer 4 does not know about commissions, state machines, git, or artifacts. It runs an SDK session in a directory with a prompt and reports what happened. The caller (Layer 5) maps these callbacks to lifecycle signals.

- REQ-CLS-24: Layer 4 implements the terminal state guard pattern. When cancellation (via AbortController) and natural session completion race, exactly one outcome is reported. The second path is a no-op. This carries forward the lesson from the in-process commission migration retro.

- REQ-CLS-25: Layer 4 owns the `resultSubmitted` flag. When the worker calls submit_result through the commission toolbox, Layer 4 records that a result was submitted and includes this in its completion callback. The orchestrator uses this to determine whether to signal executionCompleted or executionFailed to Layer 2.

### Layer 5: Orchestrator

- REQ-CLS-26: Layer 5 wires everything together. It subscribes to Layer 2 events and coordinates Layer 3 and 4 in response. It is the only layer that imports from all other layers. But it does not do the work of any of them; it sequences and coordinates.

- REQ-CLS-27: Layer 5 owns capacity management. Concurrent commission limits (per-project and global) are checked before telling Layer 3 to prepare a workspace. When dispatch would exceed a limit, the commission stays pending. When capacity opens (after a cleanup event from Layer 2), Layer 5 dispatches queued commissions in FIFO order.

- REQ-CLS-28: Layer 5 owns crash recovery. On daemon startup, it scans machine-local state files, checks worktree existence, and reconciles state through Layer 2 signals (executionFailed) and Layer 3 operations (worktree cleanup). Recovery always transitions interrupted commissions to failed, consistent with current behavior (REQ-COM-27 through REQ-COM-29).

- REQ-CLS-29: Layer 5 owns auto-dispatch and dependency checking. After a commission reaches a cleanup state (completed, failed, cancelled, abandoned), Layer 5 triggers dependency scans (do any blocked commissions now have their dependencies satisfied?) and dispatch queue scans (is there capacity for pending commissions?). This replaces the post-cleanup hook pattern from the ActivityMachine spec.

- REQ-CLS-30: Layer 5 translates Layer 4 session callbacks into Layer 2 signals. When the session runner reports progress, Layer 5 calls progressReported on the lifecycle. When the session ends, Layer 5 evaluates the outcome (result submitted? error? abort?) and sends the appropriate signal (executionCompleted or executionFailed).

- REQ-CLS-30a: Layer 5 owns merge conflict escalation. When Layer 3 reports a squash-merge failure due to non-.lore/ conflicts, Layer 5 creates a Guild Master meeting request with the commission ID and conflicting branch name, then sends executionFailed to Layer 2 with a descriptive reason.

- REQ-CLS-30b: Layer 5 owns terminal-state artifact visibility. After a commission reaches a terminal state and the activity worktree is cleaned up, Layer 5 ensures the commission artifact on the integration worktree reflects the final status. This replaces the current `syncStatusToIntegration` pattern.

### Heartbeat and Liveness

- REQ-CLS-31a: Layer 5 owns heartbeat monitoring for in-flight commissions. Each progressReported signal resets a per-commission timer. If no signal arrives within the staleness threshold (configurable, default 180 seconds per REQ-COM-13), Layer 5 sends executionFailed("process unresponsive") to Layer 2. The heartbeat timer is started when executionStarted is signaled and cleared when the commission leaves in_progress.

### Behavioral Preservation

- REQ-CLS-31: All commission behaviors defined in the original commission spec (REQ-COM-1 through REQ-COM-32) are preserved, as extended by the ActivityMachine spec (REQ-ASM-10 through REQ-ASM-21) and the abandoned state addition. The transition graph in REQ-CLS-6 supersedes REQ-COM-6 to include `abandoned` and `completed -> failed`. The layer separation changes where logic lives, not what the system does. External API contracts (REST routes, SSE events, artifact format) do not change.

- REQ-CLS-32: The activity timeline format and content are preserved. Timeline entries from before the refactor remain readable. New entries follow the same schema.

- REQ-CLS-33: Machine-local state files for crash recovery are preserved. The format and location (~/.guild-hall/state/commissions/) do not change.

### Migration Constraints

- REQ-CLS-34: The refactor is phased, not a big-bang rewrite. Each phase produces working code with passing tests. The new layers are built alongside the current code, then the current code is replaced incrementally.

- REQ-CLS-35: All 1,529 existing tests continue to pass throughout the migration. Tests that verify external behavior are unchanged. Tests that verify internal implementation details may be rewritten to test the new layer boundaries.

- REQ-CLS-36: Meeting lifecycle is not touched by this refactor. Meetings continue using the existing ActivityMachine until a separate migration applies the same layered pattern. The two systems coexist during the transition.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Meeting layer migration | Commission layers proven, ready to apply pattern to meetings | [STUB: meeting-layer-separation] |
| Commission UI | Frontend reads commission state through Layer 2's public interface | [Spec: guild-hall-views](.lore/_archive/specs/guild-hall-views.md) |

## Success Criteria

- [ ] Five layers exist with no cross-boundary violations (no layer reads/writes another layer's owned data directly)
- [ ] The executor (Layers 3+4) never reads or writes commission artifact files
- [ ] All commission artifact writes go through Layer 1, invoked only by Layer 2
- [ ] Layer 2 is commission-specific, not shared with meetings
- [ ] The signal contract is the only communication path from execution to lifecycle
- [ ] Layer 3 is commission-agnostic (workspace operations take configuration, not commission types)
- [ ] Layer 4 is commission-agnostic (session runner takes workspace path and work spec, not commission types)
- [ ] Layer 5 is the only layer that imports from all others
- [ ] ActiveCommissionEntry is split: identity in Layer 2, execution state in Layer 5
- [ ] All 1,529 existing tests pass
- [ ] External API contracts (routes, SSE events, artifact format) unchanged
- [ ] Crash recovery works through the new layers

## AI Validation

**Defaults:**
- Unit tests with mocked filesystem, git operations, and SDK sessions
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Boundary enforcement test: Layer 3 and 4 modules do not import from Layer 1 or 2. Layer 1 does not import from any other layer. Verify via import graph analysis.
- Signal contract test: each signal validates against current state (rejected when invalid), updates the record through Layer 1 (verified via Layer 1 mock), and emits the correct event.
- Layer 3 isolation test: workspace operations succeed with no commission types in scope. Pass generic configuration, receive generic results.
- Layer 4 isolation test: session runner completes with no commission types in scope. Pass workspace path and work spec, receive callbacks.
- Orchestrator wiring test: simulate a full dispatch-through-completion flow. Verify Layer 5 calls Layer 3, then Layer 4, translates callbacks to signals, and signals reach Layer 2.
- Race condition test: concurrent executionCompleted and cancellation signals for the same commission. Exactly one succeeds.
- Crash recovery test: simulate daemon restart with stale state, verify Layer 5 reconciles through Layer 2 signals and Layer 3 cleanup.
- ActiveCommissionEntry split test: the struct that Layer 2 stores does not contain worktreeDir, branchName, or abortController. The struct that Layer 5 tracks does not contain transition validation or artifact ops.
- Regression suite: all 1,529 existing tests pass without modification to their assertions (test implementation details may change, expected behaviors must not).

## Constraints

- No database. All commission state is files.
- External API contracts are frozen. Routes, SSE event shapes, and artifact format do not change.
- Meeting lifecycle is out of scope. The ActivityMachine continues serving meetings during and after this refactor.
- This spec defines what the layers do and the contracts between them. How to build them (file structure, TypeScript types, migration sequence) belongs in the design and plan.
- The signal contract defines semantics, not mechanism. Whether signals are method calls, typed events, or event bus subscriptions is a design decision.

## Context

- [Brainstorm: Commission Layer Separation](.lore/brainstorm/commission-layer-separation.md): The source brainstorm that explored this decomposition. The five-layer model and hard boundary concept originate here.
- [Spec: Guild Hall Commissions](.lore/_archive/specs/guild-hall-commissions.md): The original commission spec (REQ-COM-1 through REQ-COM-32). All behavioral requirements carry forward.
- [Spec: Activity State Machine](.lore/_archive/specs/activity-state-machine.md): The current shared state machine spec (REQ-ASM-1 through REQ-ASM-31). Layer 2 replaces this for commissions; meetings continue using it.
- [Design: Activity State Machine](.lore/_archive/design/activity-state-machine.md): The current implementation design. Documents ArtifactOps callbacks, TransitionContext, and the re-entrant transition pattern.
- [Reference: Commissions](.lore/reference/commissions.md): Current-state reference documenting routes, file roles, and data locations.
- [Retro: In-Process Commission Migration](.lore/_archive/retros/in-process-commissions.md): Terminal state guard pattern for cancel/completion races. DI wiring gaps caught by fresh-eyes review.
- [Retro: Phase 5 Git Integration](.lore/_archive/retros/phase-5-git-integration-data-loss.md): cleanGitEnv() requirement for all git subprocess invocations.
- [Issue: Commission/Meeting State Ownership](.lore/_archive/issues/commission-meeting-state-ownership.md): Documented the three-location artifact problem. The hard boundary (REQ-CLS-16) resolves this for commissions.
- [Retro: Phase 4 Commissions](.lore/_archive/retros/phase-4-commissions.md): "Spec validation catches capability, not assembly." Integration tests across layer boundaries are essential.
