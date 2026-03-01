---
title: Activity state machine TypeScript interfaces and cleanup hook contract
date: 2026-03-01
status: draft
tags: [architecture, state-machine, typescript, interfaces, cleanup-hooks]
modules: [commission-session, meeting-session, commission-state-machine]
related:
  - .lore/specs/activity-state-machine.md
  - .lore/design/process-architecture.md
  - .lore/diagrams/commission-session-internals.md
  - .lore/retros/in-process-commissions.md
---

# Design: Activity State Machine Interfaces

## Problem

The [activity state machine spec](../specs/activity-state-machine.md) defines a shared state machine pattern for commissions and meetings but leaves two things unresolved: the TypeScript interface shape (how the machine is parameterized, what methods it exposes, what handlers receive) and the onCleanup hook's data contract (what context hook consumers get, how the enter handler communicates merge results back to the machine).

These two questions are coupled. The handler signature determines what an enter handler can return, and what it returns determines what the cleanup hook receives.

## Constraints

- The machine is instantiated twice: once for commissions, once for meetings. Different status types, different entry types, different handlers.
- The existing codebase uses factory functions (`createCommissionSession`, `createMeetingSession`) with closed-over state. The machine should work within this pattern: each session factory creates its own machine instance.
- Handlers need commission-specific or meeting-specific context (REQ-ASM-3). The shared part is transition metadata; the per-activity part is the entry type.
- Re-entrant transitions must work: enter-completed triggers completed -> failed (REQ-ASM-11). The machine cannot deadlock or skip the inner transition.
- The onCleanup hook fires after the enter handler finishes (REQ-ASM-29). Two consumers register: the queue engine (auto-dispatch on any cleanup) and the dependency engine (dependency scan only after successful merge).
- Bun's single-threaded event loop means "concurrent" transitions are interleaved at await points, not truly parallel. Synchronous state checks are atomic within a tick.

## Approaches Considered

### Option 1: Generic class

A `class ActivityMachine<TStatus, TId, TEntry>` with methods for transition, inject, get, and registration. Each session factory instantiates one.

**Pros:**
- Natural fit for stateful object with methods
- Generic parameters express the parameterization from REQ-ASM-1 directly
- Easier to test in isolation (construct, call methods, assert)

**Cons:**
- The rest of the codebase uses factory functions, not classes
- Class instances need careful handling if passed as deps (binding, this)

### Option 2: Generic factory function

A `createActivityMachine<TStatus, TId, TEntry>(config)` that returns an interface. State closed over, same pattern as existing session factories.

**Pros:**
- Matches existing codebase conventions (createCommissionSession, createMeetingSession)
- No `this` binding issues
- Closed-over state is natural in TypeScript

**Cons:**
- Harder to type the return interface separately from the implementation
- Testing requires going through the public interface (no access to internals)

### Option 3: Thin wrapper with injected behavior

A minimal state machine core (transition graph validation, state tracking) with all behavior injected as callbacks. The session factory passes its existing functions as handlers.

**Pros:**
- Smallest change surface: existing code stays in existing files, machine is just coordination
- Easy to adopt incrementally

**Cons:**
- The spec wants the machine to own the active entries Map (REQ-ASM-5). A thin wrapper that delegates everything back to the session factory doesn't consolidate ownership.
- Doesn't fix the structural problem: cleanup paths would still be scattered across handler functions, just called from a different place

## Decision

**Option 1: generic class.** The state machine is a distinct component with its own lifecycle, state, and invariants. A class makes ownership explicit: the machine owns the active Map, the state tracker, the handler registry, and the cleanup hooks. Session factories instantiate and configure it, then delegate lifecycle operations to it.

The class vs factory tension is real but minor. The machine is internal infrastructure, not a DI-injected service. It's created once per session factory and never passed around. `this` binding isn't a concern because callers use `machine.transition(...)`, not destructured methods.

## Interface/Contract

### Type Parameters

```typescript
// TStatus: the union of status strings (CommissionStatus | MeetingStatus)
// TId: the branded ID type (CommissionId | MeetingId)
// TEntry: the active entry type (ActiveCommission | ActiveMeeting)
```

### Transition Context

The context object passed to enter and exit handlers. Contains transition metadata plus the activity entry. The entry gives handlers access to activity-specific fields (worktreeDir, branchName, abortController, etc.) without the context type needing to know about them.

```typescript
type TransitionContext<TId, TStatus, TEntry> = {
  id: TId;
  entry: TEntry;
  sourceState: TStatus | null;  // null for initial state injection
  targetState: TStatus;
  reason: string;
};
```

`sourceState` is null only for initial state injection (direct meeting creation, REQ-ASM-25). All graph transitions have a non-null source.

Each activity type defines a concrete alias so handlers import their own context type rather than the generic form (REQ-ASM-3):

```typescript
// In commission-session.ts or a shared types file
type CommissionTransitionContext = TransitionContext<CommissionId, CommissionStatus, ActiveCommission>;

// In meeting-session.ts or a shared types file
type MeetingTransitionContext = TransitionContext<MeetingId, MeetingStatus, ActiveMeeting>;
```

### Enter Handler Result

Enter handlers optionally return metadata that the machine forwards to cleanup hooks. This is how the enter-completed handler communicates merge success without the machine knowing about git internals.

```typescript
type EnterHandlerResult = {
  mergeSucceeded?: boolean;
} | void;
```

### Handler Types

```typescript
type ExitHandler<TId, TStatus, TEntry> =
  (ctx: TransitionContext<TId, TStatus, TEntry>) => Promise<void>;

type EnterHandler<TId, TStatus, TEntry> =
  (ctx: TransitionContext<TId, TStatus, TEntry>) => Promise<EnterHandlerResult>;
```

### Cleanup Hook Contract

The payload delivered to registered cleanup callbacks after a cleanup state's enter handler completes.

```typescript
type CleanupEvent = {
  activityType: "commission" | "meeting";
  activityId: string;    // unbranded, hook consumers don't need the brand
  projectName: string;
  status: string;        // the cleanup state that was entered
  mergeSucceeded: boolean;
};

type CleanupHook = (event: CleanupEvent) => Promise<void>;
```

Field rationale:
- `activityType`: Lets consumers distinguish commission cleanup (frees dispatch capacity) from meeting cleanup (doesn't). Cheap to include, useful for logging.
- `activityId`: Unbranded string. Hook consumers (`checkDependencyTransitions`, `enqueueAutoDispatch`) don't look up the entry by ID; they scan projects. The ID is for logging only.
- `projectName`: The dependency engine needs this to scope its scan. Extracted from the entry by the machine before invoking the hook.
- `status`: Which cleanup state was entered. Currently unused by consumers, but it's the natural context for "what happened."
- `mergeSucceeded`: The dependency engine only runs after a successful merge (that's when new artifacts appear on the integration branch). Sourced from `EnterHandlerResult.mergeSucceeded`, defaulting to false if the handler didn't return one or threw.

### Artifact Operations Callback

The machine owns the artifact status write and timeline append (REQ-ASM-2). Since artifact format differs between commissions and meetings, the machine takes a callback.

```typescript
type ArtifactOps<TId, TStatus> = {
  writeStatusAndTimeline: (
    id: TId,
    basePath: string,
    toStatus: TStatus,
    reason: string,
    metadata?: { from?: TStatus },
  ) => Promise<void>;
  resolveBasePath: (id: TId, isActive: boolean) => string;
};
```

`resolveBasePath` returns the activity worktree path for active entries and the integration worktree path for inactive entries. The machine calls this before writing, passing `isActive` based on whether the entry is in the active Map at the time of the write (which is after exit, before enter).

### Machine Configuration

```typescript
type ActivityMachineConfig<TStatus extends string, TId extends string, TEntry> = {
  activityType: "commission" | "meeting";
  transitions: Record<TStatus, TStatus[]>;
  cleanupStates: TStatus[];
  activeStates: TStatus[];
  handlers: {
    enter?: Partial<Record<TStatus, EnterHandler<TId, TStatus, TEntry>>>;
    exit?: Partial<Record<TStatus, ExitHandler<TId, TStatus, TEntry>>>;
  };
  artifactOps: ArtifactOps<TId, TStatus>;
  extractProjectName: (entry: TEntry) => string;
};
```

`cleanupStates` tells the machine which states remove the entry from the active Map on entry. `activeStates` tells it which states add the entry to the active Map on entry. These are disjoint sets. States in neither set (e.g., pending, blocked, requested) don't touch the Map. For commissions: `activeStates` is `["dispatched", "in_progress"]`, `cleanupStates` is `["completed", "failed", "cancelled"]`. For meetings: `activeStates` is `["open"]`, `cleanupStates` is `["closed", "declined"]`.

`extractProjectName` is a one-liner that the machine uses to populate `CleanupEvent.projectName` from the entry. Commission entries have `projectName` directly; meeting entries also have `projectName`. But the machine shouldn't assume field names on a generic `TEntry`.

### Machine Public API

```typescript
class ActivityMachine<TStatus extends string, TId extends string, TEntry> {
  constructor(config: ActivityMachineConfig<TStatus, TId, TEntry>);

  /** Execute a state transition with enter/exit handlers. */
  transition(
    id: TId,
    from: TStatus,
    to: TStatus,
    reason: string,
  ): Promise<TransitionResult<TStatus>>;

  /**
   * Inject an entry at a target state without a prior state.
   * Runs the enter handler with sourceState: null.
   * Adds to active Map if targetState is in activeStates.
   * Used for direct meeting creation (REQ-ASM-25).
   * Throws if the ID is already tracked.
   */
  inject(
    id: TId,
    entry: TEntry,
    targetState: TStatus,
    reason: string,
  ): Promise<void>;

  /**
   * Register an entry in the state tracker without adding to the active Map.
   * Used by recovery to populate state after restart. Throws if already tracked.
   */
  register(id: TId, entry: TEntry, currentState: TStatus): void;

  /** Remove an entry from the state tracker. No-op if not tracked. */
  forget(id: TId): void;

  /** Get an active entry by ID. Returns undefined if not active. */
  get(id: TId): TEntry | undefined;

  /** Check whether an entry is active (in the active Map). */
  has(id: TId): boolean;

  /** Check whether an entry is tracked (in the state tracker). */
  isTracked(id: TId): boolean;

  /** Number of active entries. */
  get activeCount(): number;

  /**
   * Register a callback that fires after any cleanup state's
   * enter handler completes.
   */
  onCleanup(hook: CleanupHook): void;

  /**
   * Resolve the artifact base path for an activity.
   * Delegates to artifactOps.resolveBasePath, passing whether
   * the entry is currently in the active Map.
   * Only valid for tracked entries (throws if not tracked).
   */
  resolveArtifactPath(id: TId): string;
}

type TransitionResult<TStatus> =
  | { outcome: "executed"; finalState: TStatus }
  | { outcome: "skipped"; reason: string };
```

`TransitionResult.finalState` is the state the entry ends up in after the full transition chain. If enter-completed triggers a re-entrant completed -> failed, the outer transition returns `{ outcome: "executed", finalState: "failed" }`. This lets callers know what actually happened without inspecting state afterward.

## Edge Cases

### Re-entrant transitions from enter handlers

The enter-completed handler may trigger `transition(id, "completed", "failed", ...)` (REQ-ASM-11). The machine handles this by splitting the transition into two phases:

**Phase 1 (guarded):** Validate `from` state, acquire per-entry transition lock, run exit handler, write artifact status, update state tracker. The lock prevents concurrent transitions during this phase.

**Phase 2 (unguarded):** Release the lock, run enter handler. The enter handler can call `transition()` re-entrantly. The inner transition acquires its own lock, runs its own exit + write + enter sequence.

After the enter handler returns, the machine checks whether the state tracker still shows `targetState`. If a re-entrant transition changed it, hooks for the original target are skipped (the inner transition already fired its hooks). The outer `transition()` returns the final state from the tracker.

### Cleanup hooks and re-entrant transitions

When enter-completed triggers completed -> failed:

1. Outer transition enters "completed" (cleanup state), removes entry from Map
2. Enter-completed runs, attempts merge, merge fails
3. Enter-completed calls `transition(id, "completed", "failed", ...)`
4. Inner transition enters "failed" (also cleanup state), Map removal is idempotent
5. Enter-failed runs, fires cleanup hooks for "failed" with `mergeSucceeded: false`
6. Inner transition returns
7. Outer transition sees state changed, skips cleanup hooks for "completed"
8. Outer transition returns `{ outcome: "executed", finalState: "failed" }`

Hooks fire exactly once, for the final state.

### Merge-conflict worktree state in the re-entrant path

When enter-completed triggers `completed -> failed`, the enter-failed handler receives a worktree. What state is git in?

**Contract:** `finalizeActivity` (the existing squash-merge helper) handles its own cleanup on failure. If a merge conflict occurs, `finalizeActivity` aborts the merge, preserves the branch, and removes the worktree. By the time it returns, git is in a clean state. The worktree is gone. The branch is preserved for manual resolution.

This means enter-failed receives a context where `entry.worktreeDir` points to a directory that no longer exists (it was removed by `finalizeActivity` during enter-completed). Enter-failed must not assume the worktree is present. Its job for this path (source state is "completed") is: emit event, sync status to integration worktree, write state file, and fire post-cleanup hook. No worktree operations needed because `finalizeActivity` already handled preservation.

For contrast, when enter-failed fires from `in_progress -> failed` (session error), the worktree does exist and enter-failed must commit partial work, remove the worktree, and preserve the branch. Enter-failed checks `ctx.sourceState` to distinguish these paths.

### Concurrent transitions during enter handler execution

After the per-entry lock is released and the enter handler is running (Phase 2), a concurrent transition for the same ID from a different call site (e.g., user cancels via HTTP while the commission is completing) could attempt to run. The state tracker check prevents incorrect concurrent transitions: the state tracker shows "completed" (or whatever the current target is), so a cancel attempt with `from: "in_progress"` fails validation. Only valid transitions from the current tracked state can proceed, and the transition graph constrains what those are (e.g., `completed -> failed` is valid, `completed -> cancelled` is not).

### Transition for entries not in the active Map

Redispatch (`failed -> pending`, `cancelled -> pending`) transitions entries that were removed from the active Map when entering the cleanup state. The machine's state tracker is separate from the active Map. The state tracker stores `{ state: TStatus, entry: TEntry }` pairs and retains them across cleanup. When an entry enters a cleanup state, it's removed from the active Map but its state tracker record persists. This means `transition(id, "failed", "pending", ...)` finds the entry in the tracker, validates the `from` state, and proceeds without the caller needing to re-register anything.

The `register()` method exists only for recovery (daemon restart). On restart, the machine's in-memory state tracker is empty. Recovery reads state files from disk and calls `register()` to populate the tracker before calling `transition()`.

```typescript
/**
 * Register an entry in the state tracker without adding to the active Map.
 * Used by recovery to populate the machine's in-memory state after restart.
 * Throws if an entry with this ID is already tracked.
 */
register(id: TId, entry: TEntry, currentState: TStatus): void;
```

**State tracker eviction**: entries are removed from the tracker when they reach a terminal state with no outgoing edges in the graph AND the transition that brought them there completes. For the commission graph, `completed`, `failed`, and `cancelled` all have outgoing edges (redispatch), so they persist. They're evicted when a subsequent transition moves them out (e.g., `failed -> pending` evicts the `failed` record and creates a `pending` one). In practice, entries that sit in `failed` or `cancelled` indefinitely (never redispatched) accumulate. This is bounded by the number of commissions ever created in a single daemon lifetime, which is acceptable. If it becomes a concern, the session factory can call `forget(id)` when it knows redispatch will never happen (e.g., after a configurable TTL).

```typescript
/** Remove an entry from the state tracker. No-op if not tracked. */
forget(id: TId): void;
```

### Initial state injection vs graph transition

`inject()` is for creating entries with no prior state (direct meeting creation). It does not validate against the transition graph because there is no `from` state. It runs the enter handler with `sourceState: null`, adds the entry to the active Map if `targetState` is in `activeStates`, removes from the Map if in `cleanupStates`, and updates the state tracker. Throws if the ID is already tracked (prevents duplicate injection).

`transition()` is for all graph-modeled transitions, including the first transition of an entry that was registered via `register()`.

### Enter handler failure in cleanup states

REQ-ASM-8: if the enter handler throws in a cleanup state, the entry is still removed from the active Map. The machine removes the entry from the Map before calling the enter handler, not after. This means the Map removal is unconditional for cleanup states.

If the enter handler throws, `mergeSucceeded` defaults to false in the cleanup hook event. The hook still fires (the entry did enter the cleanup state, even if the handler didn't finish cleanly). This ensures auto-dispatch still scans for capacity. The false default is conservative: if the merge was partially attempted before the throw, we don't trigger dependency scanning because we can't confirm new artifacts are available on the integration branch. The auto-dispatch consumer runs regardless (capacity was freed), and the dependency consumer skips (merge status unknown). This is the correct behavior: no false positives on dependency satisfaction.

## Open Questions

None. All questions raised during review have been resolved in this document.

## Implementation Notes

- **State tracker persistence across daemon restarts**: The state tracker is in-memory. On restart, recovery reads state files from disk and calls `register()` to populate the tracker before calling `transition()`.
- **Handler access to external services**: Enter handlers need access to git operations, event bus, SDK session runner, etc. These come from the session factory's deps, captured in handler closures when the machine is configured. The machine itself doesn't know about these services.
- **Testing**: The machine is tested through its public API. Internal state (lock acquisition, tracker updates) is verified by externally observable outcomes: transition results, handler invocations, hook firings. This is sufficient for a machine whose guarantees are defined in terms of observable behavior (REQ-ASM-9: "exactly one executes, the other returns skipped").
- **Auto-dispatch serialization**: The existing `autoDispatchChain` promise chain that prevents concurrent dispatch scans lives in the hook consumer (commission session factory), not in the state machine. When two cleanup hooks fire near-simultaneously, both invoke the registered callback, which chains through the existing serialization mechanism. The machine fires hooks sequentially (awaiting each), but the hook consumer's own serialization prevents double-dispatch.
