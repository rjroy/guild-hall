---
title: Commission layer separation
date: 2026-03-01
status: open
tags: [commission, architecture, refactor, object-design, boundaries]
modules: [daemon-services, commission-session, commission-handlers, activity-state-machine]
related:
  - .lore/reference/commissions.md
  - .lore/design/process-architecture.md
---

# Brainstorm: Commission Layer Separation

## Context

The commission system is feature-complete (1529 tests pass) and the implementation works. But the implementation is overly entangled. Five distinct concerns (record, lifecycle, git operations, SDK session, orchestration) are woven through the same entry/exit handlers, sharing the same `ActiveCommissionEntry` struct, reading from and writing to the same artifact file, and coordinating through side effects that ripple across all five concerns.

Recent refactors moved code into separate files (`commission-handlers.ts`, `commission-capacity.ts`, `commission-recovery.ts`, etc.) but didn't change the boundaries. The entanglement was distributed, not resolved. The `ActiveCommissionEntry` struct holds both commission identity (ID, project, worker) and execution state (worktreeDir, branchName, abortController). The enter-dispatched handler creates git branches. State machine handlers import git operations. The commission concept and the commission execution are the same object.

This matters because every change requires touching everything. Change the git workflow? Six to eight touch points across three files, mixed in with state transitions and event emission. Change how SDK sessions work? interleaved with worker lifecycle and observation. Expose commissions as manager tools? The manager sees the same interface as HTTP routes, no room for a higher-level abstraction.

## Ideas Explored

### The Five Layers

Commission should be decomposed into five distinct layers, each with a single responsibility:

**Layer 1: Commission Record**
The artifact as pure data. Schema for what a commission looks like on disk. Read/write operations for the YAML frontmatter fields. No behavior, no validation of transitions. Just "here's how to read and write a commission file." This is what `lib/commissions.ts` and `commission-artifact-helpers.ts` partially do today, but mixed with concerns they shouldn't own.

**Layer 2: Commission Lifecycle**
The state machine and transition validation. Owns the graph (pending, blocked, dispatched, in_progress, completed, failed, cancelled, abandoned). Owns the signal interface (see below). When a signal arrives, it validates against current state, updates the record through Layer 1, and emits events. This is the public API for everyone: REST routes, manager tools, the executor.

**Layer 3: Execution Environment**
Workspace provisioning. Today: git worktree creation, sparse checkout, branch management, squash-merge, conflict detection. Tomorrow: maybe containers, maybe temp dirs. Knows nothing about commissions. It gets told "prepare a workspace for this project with these options" and "finalize this workspace" or "tear down this workspace." Returns workspace paths and status.

**Layer 4: Session Runner**
Worker activation, SDK session, tool resolution, memory injection. Takes a workspace path and a work specification (prompt, worker, resource limits). Runs the session. Calls back through a narrow interface: "progress happened," "result ready," "question asked," "session ended." Doesn't know about state machines or git.

**Layer 5: Orchestrator**
Wires everything together. Listens to Layer 2 events ("commission dispatched") and coordinates Layer 3 and 4 in response. Owns capacity limits, queue management, auto-dispatch, crash recovery, SSE event emission. This is the only layer that knows about all the others. But it doesn't do the work of any of them; it sequences and coordinates.

### The Hard Boundary: Commission State vs Commission Execution

The critical architectural decision: **the executor cannot write to the commission record.** The executor signals. The commission writes itself. Always.

When a worker calls `report_progress("halfway done")`, the toolbox handler doesn't open the artifact and splice in a timeline entry. It emits a signal. The commission receives it and updates its own record. The commission is the only thing that touches its artifact.

This means the commission needs a signal interface:

- `progressReported(summary)` - updates current_progress, appends timeline
- `resultSubmitted(summary, artifacts)` - sets result_summary, linked_artifacts, appends timeline
- `questionLogged(question)` - appends timeline
- `executionStarted(workspaceInfo)` - appends timeline (no workspace details stored on commission)
- `executionFailed(reason)` - triggers state transition to failed
- `executionCompleted()` - triggers state transition to completed

The executor calls these. The commission validates them (can't submit a result if not in_progress) and writes its own record. The executor never sees the artifact path, never parses frontmatter, never splices YAML.

Without this hard boundary, every "just this once" write from execution-land erodes the separation until you're back where you started.

### Layer 1+2 as Event-Driven Public Interface

Layers 1 and 2 together form the commission as a concept. The record and its lifecycle rules. This is what the manager cares about, what the REST API cares about, what the UI reads. It's the public interface of "commission."

These layers should be event-driven. When state changes, events are emitted. Manager tools subscribe to these events. The REST API triggers operations that produce events. The UI consumes events via SSE.

Layers 3, 4, and 5 are interconnected through well-defined interfaces (not events). The orchestrator explicitly calls into the execution environment and session runner at the right moments, making the flow readable and debuggable.

### Concrete Flow (Dispatch Through Completion)

```
User dispatches commission
  -> REST route calls Layer 2: commission.dispatch()
  -> Layer 2 validates transition, updates record, emits "dispatched" event
  -> Layer 5 hears "dispatched", checks capacity
  -> Layer 5 tells Layer 3: prepare workspace
  -> Layer 3 creates branch + worktree, returns workspace path
  -> Layer 2 records "execution started" on the commission
  -> Layer 5 tells Layer 4: run session in this workspace
  -> Layer 4 runs SDK session, calls progress/result callbacks
  -> Callbacks go through Layer 5 to Layer 2: commission.progressReported()
  -> Layer 2 updates record, emits "progress" event
  -> Session ends, Layer 4 signals completion
  -> Layer 5 tells Layer 2: commission.executionCompleted()
  -> Layer 2 validates, transitions to completed, emits "completed" event
  -> Layer 5 hears "completed", tells Layer 3: finalize workspace
  -> Layer 3 squash-merges, reports success/failure
  -> If merge failed, Layer 5 tells Layer 2: commission.executionFailed()
```

No layer reaches into another's internals. The commission never sees a worktree path. The executor never parses frontmatter. The session runner never checks capacity.

### What This Fixes

| Scenario | Current | With layers |
|----------|---------|-------------|
| Change git workflow | 6-8 touch points across 3 files, mixed with transitions and events | Change Layer 3 only |
| Change SDK session model | Interleaved with worker lifecycle and observation | Change Layer 4 only |
| Expose as manager tools | Manager uses same interface as HTTP routes | Manager gets Layer 2 commission objects |
| Add observability | Events scattered across handlers | Layer 2 emits state events, Layer 5 emits operational events |
| Test commission logic | Requires mocking git, fs, SDK | Test Layer 2 with zero infrastructure |
| Test execution | Requires full state machine | Test Layer 3/4 with fake commission signals |

### AI Implementation Anti-Pattern: Shotgun Changes

A recurring problem with AI-assisted implementation: changes are applied wherever they need to go without considering what this does to the architecture. The system works, but every change is scattered across files that should be independent. The cost compounds over time as each new feature or fix has to navigate the entanglement.

The fix is not more careful implementation; it's better object design. When the boundaries are right, even a careless change stays contained within its layer. When the boundaries are wrong (or missing), even careful changes create entanglement.

## Open Questions

- Should the state machine be simplified? "Dispatched" and "in_progress" are milliseconds apart. "Blocked" is really "pending with unmet preconditions." Fewer user-facing states, with internal machinery hidden, might be cleaner.
- Where does crash recovery live? It needs to know about both commission state (Layer 2) and execution environment (Layer 3). Probably Layer 5 (orchestrator), but it's worth thinking through.
- Does the ActivityMachine abstraction (shared with meetings) survive this refactor? Meetings have a similar but not identical lifecycle. The generic machine might still work if Layer 2 is built on top of it, but the current parameterization bakes in assumptions about artifact ops that may not hold.
- How does the dependency check system fit? It's currently a commission-session method that scans artifacts. With layers, it's either a Layer 2 concern (lifecycle knows about dependencies) or a Layer 5 concern (orchestrator checks preconditions before dispatch).

## Next Steps

This brainstorm should feed into a design document (`.lore/design/`) that specifies the interfaces between layers and the concrete types each layer owns. From there, a phased refactor plan that migrates the current implementation without breaking the 1529 existing tests.
