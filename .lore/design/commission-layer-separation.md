---
title: Commission layer separation interfaces and mechanisms
date: 2026-03-01
status: draft
tags: [architecture, state-machine, commission, boundaries, interfaces, refactor]
modules: [commission-session, commission-handlers, commission-toolbox, activity-state-machine]
related:
  - .lore/specs/commission-layer-separation.md
  - .lore/_archive/design/activity-state-machine.md
  - .lore/reference/commissions.md
  - .lore/brainstorm/commission-layer-separation.md
---

# Design: Commission Layer Separation

## Problem

The [commission layer separation spec](.lore/specs/commission-layer-separation.md) defines five layers and the contracts between them, but defers five technical decisions to design:

1. **Signal contract mechanism** (REQ-CLS-15): method calls, typed events, or EventBus facade?
2. **Lifecycle state machine structure** (REQ-CLS-10): does the replacement keep enter/exit handlers?
3. **Artifact path routing**: Layer 2 writes through Layer 1, but to which worktree?
4. **Toolbox redesign**: currently writes artifacts directly, hard boundary forbids this.
5. **Module boundaries**: what import graph enforces the layers?

These decisions are coupled. The signal mechanism determines how the toolbox communicates. The lifecycle structure determines whether the orchestrator drives transitions explicitly or reacts to handler events. The artifact path routing determines what the lifecycle needs to know about execution state.

See [Spec: commission-layer-separation](.lore/specs/commission-layer-separation.md) for requirements.

## Constraints

- The ActivityMachine's per-entry promise chain is sound engineering for serializing concurrent transitions. The replacement needs equivalent concurrency safety.
- Bun's single-threaded event loop means "concurrent" transitions are interleaved at await points. Synchronous state checks within a single tick are atomic.
- The existing EventBus (Set-based synchronous pub/sub, 10 SystemEvent types) serves SSE streaming to the browser. This external contract is frozen.
- Commission toolbox tools are MCP server tools created via the Agent SDK's `createSdkMcpServer`. The MCP server factory pattern stays (same as base-toolbox, meeting-toolbox).
- The `trackedEntries` Map that parallels the ActivityMachine's stateTracker exists because the machine doesn't expose `getEntry()`. The new lifecycle should eliminate this parallel data structure.
- The auto-dispatch "queue" is readdir + sort, not a data structure. This pattern is simple and correct. No reason to change it.
- The ActivityMachine class (`daemon/lib/activity-state-machine.ts`) continues to exist and serve meetings. This refactor builds a new `CommissionLifecycle` alongside it. Commission-specific code stops using the ActivityMachine; meeting code is untouched. The ActivityMachine is not modified or deleted as part of this work. A future refactor (`[STUB: meeting-layer-separation]`) will address the meeting side independently, potentially replacing the ActivityMachine entirely once commissions no longer depend on it.
- Commission-capacity.ts is already pure functions with injected state. It can serve the new orchestrator with minimal changes.

## Approaches Considered

### Decision 1: Lifecycle State Machine Structure

The most consequential decision. It determines whether the other four decisions are simple or complex.

#### Option A: Handler-based lifecycle (carry forward ActivityMachine pattern)

Keep enter/exit handlers on the lifecycle. Enter-dispatched does git setup. Enter-in-progress launches the session. Enter-completed does squash-merge. Exit-in_progress aborts the session. The lifecycle is the locus of both state validation and side-effect execution. The orchestrator registers handlers and reacts to cleanup hooks.

**Pros:**
- Familiar pattern (current ActivityMachine works this way)
- All behavior for a transition is visible in one handler
- The machine's two-phase lock enables re-entrant transitions (enter-completed triggering completed->failed)

**Cons:**
- Handlers reach across all five proposed layers (enter-dispatched touches Layer 3, enter-in_progress touches Layer 4)
- Re-entrant transitions require the two-phase lock (release before enter handler), which is the most complex part of the machine
- Handler deps interface is 22 injections wide (CommissionHandlerDeps), coupling the lifecycle to every service in the daemon
- The ActivityMachine's `ArtifactOps` callback and `resolveBasePath` pattern require the lifecycle to know about worktree paths (active vs integration), which conflicts with the spec's requirement that Layers 3/4 own workspace knowledge. Building on the ActivityMachine inherits this coupling.
- This is exactly the structure the brainstorm identified as the problem: "the entanglement was distributed, not resolved"

#### Option B: Handler-free lifecycle (orchestrator drives side effects)

The lifecycle validates transitions, writes artifacts (via Layer 1), emits events, and tracks state. Nothing else. No enter handlers, no exit handlers, no side effects. The orchestrator calls the lifecycle to change state, then performs the side effects itself in sequence.

Re-entrant transitions are eliminated. The current enter-completed handler attempts a merge and, on failure, triggers completed->failed re-entrantly. In Option B, the orchestrator calls `lifecycle.executionCompleted()`, then calls `workspace.finalize()`, then if the merge fails, calls `lifecycle.executionFailed()`. Two sequential lifecycle calls. No re-entrance, no two-phase lock.

**Pros:**
- The lifecycle becomes a pure state machine: validate, write, emit. Testable with zero infrastructure mocks.
- No 22-injection handler deps. The lifecycle depends on Layer 1 (record) and an event emitter. Two deps.
- The orchestrator's flow is linear and readable. Every step is an explicit call, not a callback.
- Per-entry concurrency reduces to: lock, check state, write, unlock. No handler execution under lock.
- Eliminates the `trackedEntries` parallel Map (the lifecycle exposes its tracked state directly).

**Cons:**
- Behavior for a transition is split between the lifecycle (state change) and the orchestrator (side effects). Reading "what happens when a commission completes" requires looking at both.
- The orchestrator becomes the largest module (it was already, but this makes it explicit).

#### Decision

**Option B: handler-free lifecycle.** The five-layer separation requires that Layers 3 and 4 are commission-agnostic. Handlers that call into git operations and SDK sessions from inside the lifecycle are the opposite of commission-agnostic. Removing handlers from the lifecycle is the architectural precondition for clean layer boundaries.

The readability concern (split between lifecycle and orchestrator) is addressed by the orchestrator's explicit sequencing. The trade-off: the orchestrator must handle state-dependent cleanup paths (active vs non-active commissions) by checking its own `activeExecutions` map, since `lifecycle.cancel()` returns the same `TransitionResult` regardless of whether the commission was executing. This is orchestrator logic, not lifecycle logic. A dispatch flow reads top-to-bottom:

```
validate -> transition to dispatched -> prepare workspace -> transition to in_progress -> start session
```

Compare to the current model where this same sequence is distributed across enter-dispatched, enter-in_progress, and the dispatch function's post-transition logic.

### Decision 2: Signal Contract Mechanism

REQ-CLS-15 defers this to design. Three options.

#### Option A: Direct method calls on the lifecycle

The lifecycle exposes typed methods: `progressReported(id, summary)`, `resultSubmitted(id, summary, artifacts)`, etc. The orchestrator calls them. Compile-time type safety. No intermediate event types.

#### Option B: Typed EventBus facade

Signals are EventBus events with new types (e.g., `commission_signal_progress`). The lifecycle subscribes to the EventBus and processes signal events for its tracked commissions.

#### Option C: Separate SignalReceiver interface

A `CommissionSignalReceiver` interface with the signal methods. The lifecycle implements it. The orchestrator receives it from the lifecycle and passes it around.

#### Decision

**Option A: direct method calls.** The lifecycle is a dependency of the orchestrator. The orchestrator already holds a reference to it. Method calls are the simplest mechanism and give the best type safety. Option B adds unnecessary indirection through the EventBus. Option C adds an interface layer over what is already a direct call.

The lifecycle exposes named methods for each signal and transition trigger. Callers don't need to know the from-state (the lifecycle tracks it). Each method validates, writes, and emits internally.

### Decision 3: Artifact Path Routing

Layer 2 writes artifacts through Layer 1. The artifact lives in different worktrees depending on state: integration worktree for pending/blocked/terminal states, activity worktree for dispatched/in_progress. Layer 2 shouldn't know about worktrees (that's Layer 3).

#### Option A: Orchestrator provides the path

The lifecycle tracks a `currentArtifactPath` per commission. The orchestrator sets it: integration worktree path at creation, activity worktree path when execution starts, back to integration after cleanup. The lifecycle passes this path to Layer 1 for all writes.

#### Option B: Lifecycle asks the orchestrator via callback

The lifecycle holds a path-resolver callback. When it needs to write, it calls the resolver. The orchestrator provides the resolver at configuration time.

#### Option C: Layer 1 resolves the path internally

Layer 1 knows both worktree paths and checks which one exists on disk (the current `resolveWritePath` pattern).

#### Decision

**Option A: orchestrator provides the path.** This is the cleanest separation. The lifecycle stores a string path, not a concept of worktrees. When the orchestrator signals `executionStarted`, it also updates the write path. When cleanup completes and the orchestrator syncs to integration, it updates the path again.

Option B is equivalent but adds a callback where a simple value assignment works. Option C re-introduces filesystem probing into the write path, which is both slower and fragile (race conditions between worktree creation and first write).

The `executionStarted` signal carries the new artifact path as a parameter. This is a design addition: the spec defines `executionStarted()` with no parameters, but the spec also says signal mechanism is a design decision. The path is operational metadata, not commission identity.

## Implementation Principle: New Code, Not Extraction

Each layer is a new implementation written against its interface contract. The existing code is reference material (what behaviors exist, what YAML fields are written, what git commands are called), not source material to copy into new files.

The distinction matters because extraction preserves the assumptions baked into the old code. The current `commission-artifact-helpers.ts` assumes it resolves paths internally. The current handlers assume they run inside a state machine lock. The current session code assumes it can reach into the event bus and artifact files. Moving this code preserves those assumptions even when the new boundaries make them wrong.

New implementation means: read the interface, understand the contract, write code that satisfies it, write tests that verify it. Consult the old code when you need to know "what does the YAML frontmatter look like" or "what git commands create a sparse checkout," but don't lift functions wholesale. The tests for each layer should be independent of the other layers (Layer 1 tests don't need a state machine, Layer 2 tests don't need git, Layer 3 tests don't need commissions).

The existing 1,529 tests validate behavioral preservation (REQ-CLS-33). They run against the orchestrator's `CommissionSessionForRoutes` interface, which is unchanged. New per-layer unit tests verify the contracts in isolation. Both must pass.

## Interface/Contract

### Layer 1: Commission Record

```typescript
// Pure read/write for commission artifact files.
// No validation, no events, no state tracking.

interface CommissionRecordOps {
  readStatus(artifactPath: string): Promise<CommissionStatus | null>;
  writeStatus(artifactPath: string, status: CommissionStatus): Promise<void>;
  appendTimeline(artifactPath: string, event: string, reason: string, extra?: Record<string, string>): Promise<void>;
  readDependencies(artifactPath: string): Promise<string[]>;
  updateProgress(artifactPath: string, summary: string): Promise<void>;
  updateResult(artifactPath: string, summary: string, artifacts?: string[]): Promise<void>;
}
```

All methods take `artifactPath` (full path to the `.md` file), not project/commission ID pairs. The caller resolves the path; Layer 1 just reads and writes.

This is a new module built against this interface, not extracted from `commission-artifact-helpers.ts`. The existing helpers mix path resolution, ID formatting, and frontmatter manipulation. The new `record.ts` takes a path and operates on it. The raw frontmatter preservation technique (regex replacement instead of gray-matter stringify) is the same, but the code that implements these operations is written fresh to satisfy the interface contract. The old helpers are reference for what the YAML looks like, not source code to copy.

### Layer 2: Commission Lifecycle

```typescript
class CommissionLifecycle {
  constructor(config: {
    record: CommissionRecordOps;           // Layer 1
    emitEvent: (event: SystemEvent) => void; // for SSE emission
  });

  // -- Registration --

  // Create a new commission at "pending" (or "blocked" if dependencies unmet).
  // Writes initial artifact status and timeline entry.
  create(id: CommissionId, projectName: string, artifactPath: string, initialStatus: "pending" | "blocked"): Promise<void>;

  // Register a commission from recovery. Populates state tracker only, no writes.
  register(id: CommissionId, projectName: string, status: CommissionStatus, artifactPath: string): void;

  // Remove from state tracker. Used after orchestrator cleanup.
  forget(id: CommissionId): void;

  // -- Transition triggers --
  // Each validates current state, writes artifact (status + timeline), emits event.
  // Returns TransitionResult indicating success or skip.

  dispatch(id: CommissionId): Promise<TransitionResult>;
  cancel(id: CommissionId, reason: string): Promise<TransitionResult>;
  abandon(id: CommissionId): Promise<TransitionResult>;
  redispatch(id: CommissionId): Promise<TransitionResult>;
  block(id: CommissionId): Promise<TransitionResult>;
  unblock(id: CommissionId): Promise<TransitionResult>;

  // -- Execution signals --
  // Called by the orchestrator to relay execution events.

  executionStarted(id: CommissionId, artifactPath: string): Promise<TransitionResult>;
  executionCompleted(id: CommissionId): Promise<TransitionResult>;
  executionFailed(id: CommissionId, reason: string): Promise<TransitionResult>;

  // -- In-progress signals --
  // Validate current state is in_progress, write to artifact, emit event.

  progressReported(id: CommissionId, summary: string): Promise<void>;
  resultSubmitted(id: CommissionId, summary: string, artifacts?: string[]): Promise<void>;
  questionLogged(id: CommissionId, question: string): Promise<void>;

  // -- Queries --

  getStatus(id: CommissionId): CommissionStatus | undefined;
  getProjectName(id: CommissionId): string | undefined;
  getArtifactPath(id: CommissionId): string | undefined;
  isTracked(id: CommissionId): boolean;
  get activeCount(): number;

  // Update the artifact write path (called by orchestrator when worktree changes).
  setArtifactPath(id: CommissionId, path: string): void;
}

type TransitionResult =
  | { outcome: "executed"; status: CommissionStatus }
  | { outcome: "skipped"; reason: string };
```

**Internal state per commission:**

```typescript
// What the lifecycle tracks. Not exported.
type TrackedCommission = {
  commissionId: CommissionId;
  projectName: string;
  status: CommissionStatus;
  artifactPath: string;           // current write target (set by orchestrator)
  resultSignalReceived: boolean;  // for duplicate signal rejection
  lock: Promise<void>;            // per-entry serialization
};
```

**Concurrency mechanism:** Per-entry promise chain, same principle as the ActivityMachine. But simpler: the lock protects validate-write-emit, then releases. No two-phase, no handler execution under lock.

```
acquire lock -> validate from-state -> write artifact via Layer 1 -> update tracked state -> release lock -> emit event
```

Event emission happens after lock release. This means subscribers see the event after the artifact is updated, which is the correct ordering (read-after-event returns the new state).

**Named methods vs generic transition:** Named methods encode valid from-states internally. `dispatch()` validates that the commission is pending. `cancel()` validates pending, blocked, dispatched, or in_progress. Callers don't specify from-state. The lifecycle looks it up.

A private `doTransition(id, expectedFrom, to, reason)` handles the lock-validate-write-emit sequence. Named methods look up the current state, determine the valid from-states for their operation, and delegate.

### Layer 3: Workspace Operations

```typescript
// Commission-agnostic workspace provisioning.
// No commission types in scope.

interface WorkspaceConfig {
  projectPath: string;
  baseBranch: string;
  activityBranch: string;
  worktreeDir: string;
  checkoutScope: "full" | "sparse";
}

interface WorkspaceOps {
  // Create branch from baseBranch, create worktree, configure checkout scope.
  prepare(config: WorkspaceConfig): Promise<{ worktreeDir: string }>;

  // Squash-merge activityBranch into baseBranch. Returns merge result.
  finalize(config: { activityBranch: string; baseBranch: string; projectPath: string; activityId: string }): Promise<FinalizeResult>;

  // Commit uncommitted work, remove worktree, preserve branch.
  preserveAndCleanup(config: { worktreeDir: string; branchName: string; commitMessage: string; projectPath?: string }): Promise<void>;

  // Remove worktree only (branch already handled by finalize).
  removeWorktree(worktreeDir: string): Promise<void>;
}

type FinalizeResult =
  | { merged: true }
  | { merged: false; preserved: true; reason: string };
```

This is a new module implementing workspace provisioning as a standalone concern. The current git operations are scattered across `daemon/lib/git.ts` (low-level primitives), `commission-handlers.ts` (the enter-dispatched/completed/failed handlers that interleave git with state transitions), and `commission-session.ts` (worktree path calculation). The new `workspace.ts` is written against the `WorkspaceOps` interface, calling into `daemon/lib/git.ts` for low-level git primitives (createBranch, createWorktree, etc.) but owning the sequencing and error handling as a coherent unit. The implementations call `cleanGitEnv()` on all subprocess invocations (REQ-CLS-20).

The key difference from extraction: the current handlers mix workspace preparation with state transitions (enter-dispatched creates the branch AND transitions the state). The new module knows nothing about state. It prepares, finalizes, or cleans up workspaces. The calling sequence is the orchestrator's responsibility.

### Layer 4: Session Runner

```typescript
// Commission-agnostic SDK session execution.
// No commission types, no git, no artifacts.

interface SessionSpec {
  workspacePath: string;
  prompt: string;
  worker: WorkerMetadata;
  packages: DiscoveredPackage[];
  packagesDir: string;
  config: AppConfig;
  guildHallHome: string;
  projectName: string;
  resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number };
  abortSignal: AbortSignal;
  callbacks: SessionCallbacks;
}

interface SessionCallbacks {
  onProgress: (summary: string) => Promise<void>;
  onResult: (summary: string, artifacts?: string[]) => Promise<void>;
  onQuestion: (question: string) => Promise<void>;
}

interface SessionResult {
  resultSubmitted: boolean;
  error?: string;
  aborted?: boolean;
}

interface SessionRunner {
  run(spec: SessionSpec): Promise<SessionResult>;
}
```

The session runner is a new module that owns the full lifecycle of an SDK session, from tool resolution through session completion. Its behavioral sequence (resolve tools, load memories, activate worker, run session, handle follow-up) describes what the runner does, not what it inherits. The current `commission-session.ts` interleaves these steps with state machine transitions, capacity checks, event subscriptions, and execution context management. The new runner receives a `SessionSpec` and returns a `SessionResult`. Everything in between is its implementation.

**Callbacks replace the current "both sides write" pattern.** Today, the commission toolbox writes artifacts directly and emits EventBus events. The session subscribes to those events to track in-memory state. In the new model:

- The toolbox calls `callbacks.onResult(summary, artifacts)` instead of writing artifacts + emitting events
- The orchestrator creates these callbacks, routing them to the lifecycle's signal methods
- The lifecycle writes the artifact and emits the event

This closes the loop: tool call -> callback -> orchestrator -> lifecycle -> Layer 1 write + event emission.

**Commission toolbox changes:** The toolbox factory receives callbacks instead of EventBus + write deps:

```typescript
// New commission toolbox deps (replaces CommissionToolboxDeps)
type CommissionToolCallbacks = {
  onProgress: (summary: string) => Promise<void>;
  onResult: (summary: string, artifacts?: string[]) => Promise<void>;
  onQuestion: (question: string) => Promise<void>;
};
```

The `resultSubmitted` one-shot guard stays in the toolbox (preventing the SDK model from calling submit_result twice within a single MCP session). The lifecycle's `resultSignalReceived` flag is a second guard at the signal level (preventing duplicate signals if two toolbox instances somehow both call it). Defense in depth.

### Layer 5: Orchestrator

The orchestrator is a new module that replaces `commission-session.ts`. The current file is 1,487 lines because it is simultaneously the state machine driver, the git workflow, the SDK session manager, the capacity checker, the recovery system, and the route handler. The new orchestrator does one thing: coordinate the four layers. Its implementation is written against the layer interfaces, not extracted from the existing file. The current file is reference for the behavioral sequences (what order things happen in), but the code is new.

The orchestrator is the only module that imports from all layers. It creates the lifecycle, workspace ops, and session runner, then coordinates their interactions.

**Tracked execution state per running commission:**

```typescript
// What the orchestrator tracks for running commissions. Not exported.
type ExecutionContext = {
  commissionId: CommissionId;
  projectName: string;
  workerName: string;
  worktreeDir: string;
  branchName: string;
  abortController: AbortController;
  attempt: number;
  checkoutScope: "full" | "sparse";
  heartbeatTimer: ReturnType<typeof setTimeout> | null;
};
```

This is the execution half of the old `ActiveCommissionEntry`, owned by the orchestrator. The lifecycle owns identity (commissionId, projectName, status). The orchestrator correlates them by commissionId.

**Dispatch flow (the complete sequence):**

```
1. REST route calls orchestrator.dispatch(commissionId)
2. Orchestrator reads artifact to get prompt, worker, deps, resource overrides
3. If artifact read fails (malformed, deleted): return error, commission stays pending
4. Orchestrator checks capacity via isAtCapacity()
5. If at capacity: emit queued event, return { status: "queued" }
6. Orchestrator calls lifecycle.dispatch(commissionId)
     -> validates pending, writes dispatched status + timeline, emits commission_status event
7. Orchestrator calls workspace.prepare(config)
     -> creates branch, worktree, configures checkout
     -> if prepare throws: lifecycle.executionFailed(id, reason) [dispatched->failed], return error
8. Orchestrator calls lifecycle.executionStarted(commissionId, activityWorktreePath)
     -> validates dispatched -> in_progress, writes status + timeline, updates artifact path, emits event
     -> if skipped (cancel arrived between steps 6-8): workspace.removeWorktree(), return
9. Orchestrator creates AbortController, ExecutionContext, starts heartbeat timer
10. Orchestrator fires-and-forgets: sessionRunner.run(spec).then(onSessionEnd).catch(onSessionError)
11. Returns { status: "accepted" }
```

Artifact validation (step 2-3) happens before any state change. If the artifact is unreadable, the commission stays in its current state and the orchestrator returns an error to the caller. No rollback needed because no transition has fired yet.

**Session completion flow:**

```
1. Session runner returns SessionResult
2. Orchestrator clears heartbeat timer
3. If result.aborted: skip (cancel flow already handled it)
4. If result.resultSubmitted:
     a. lifecycle.executionCompleted(commissionId)
     b. workspace.finalize(config)
     c. If merge failed: lifecycle.executionFailed(commissionId, reason), create Guild Master meeting request
     d. workspace cleanup (remove worktree if finalize didn't already)
5. If !result.resultSubmitted:
     a. lifecycle.executionFailed(commissionId, "Session completed without submitting result")
     b. workspace.preserveAndCleanup(config)
6. lifecycle.setArtifactPath(commissionId, integrationWorktreePath) — revert write target
7. Sync terminal status to integration worktree artifact (REQ-CLS-30b)
8. Delete execution context, remove from activeExecutions map
9. lifecycle.forget(commissionId) — remove from state tracker
10. scanAutoDispatch()
11. If merge succeeded: checkDependencyTransitions(projectName)
```

**Cancel flow:**

```
1. REST route calls orchestrator.cancel(commissionId, reason)
2. Orchestrator calls lifecycle.cancel(commissionId, reason)
     -> validates from-state, writes cancelled status + timeline, emits event
3. If commission was in activeExecutions:
     a. Abort the AbortController (session runner will terminate)
     b. Clear heartbeat timer
     c. workspace.preserveAndCleanup(config)
     d. lifecycle.setArtifactPath, sync to integration, cleanup context
     e. lifecycle.forget(commissionId)
4. If commission was pending/blocked (not in activeExecutions):
     a. lifecycle.setArtifactPath stays at integration worktree (already there)
     b. lifecycle.forget(commissionId)
5. scanAutoDispatch()
```

**Heartbeat mechanism:**

Per-commission `setTimeout`. Created when `executionStarted` is called (step 8 of dispatch flow). Reset on each `progressReported` callback from the session runner. Cleared when the commission leaves in_progress (any terminal transition or cancel).

```typescript
function startHeartbeat(commissionId: CommissionId): void {
  const timer = setTimeout(async () => {
    await lifecycle.executionFailed(commissionId, "process unresponsive");
    // The session completion handler will see the commission is already failed
    // and skip its normal flow.
    abortExecution(commissionId);
  }, HEARTBEAT_THRESHOLD_MS);
  activeExecutions.get(commissionId)!.heartbeatTimer = timer;
}

function resetHeartbeat(commissionId: CommissionId): void {
  const ctx = activeExecutions.get(commissionId);
  if (ctx?.heartbeatTimer) clearTimeout(ctx.heartbeatTimer);
  startHeartbeat(commissionId);
}
```

**Race handling:** The lifecycle's per-entry lock and state validation handle all races. If cancel and completion arrive simultaneously, the first one to acquire the lock wins and transitions the state. The second finds the state has changed and gets a "skipped" result. The orchestrator checks the result and skips side effects on skip.

### Module Structure

```
daemon/services/commission/
  record.ts           # Layer 1: CommissionRecordOps
  lifecycle.ts         # Layer 2: CommissionLifecycle
  orchestrator.ts      # Layer 5: creates and coordinates all layers

daemon/services/
  workspace.ts         # Layer 3: WorkspaceOps (commission-agnostic)
  session-runner.ts    # Layer 4: SessionRunner (commission-agnostic)
```

**Import rules:**
- `commission/record.ts` imports nothing from other layers
- `commission/lifecycle.ts` imports from `commission/record.ts` only
- `workspace.ts` imports from `daemon/lib/git.ts` only (no commission types)
- `session-runner.ts` imports from `lib/types.ts`, `daemon/services/toolbox-resolver.ts`, `daemon/services/memory-injector.ts` (no commission types)
- `commission/orchestrator.ts` imports from all four layers plus `daemon/types.ts`, `lib/paths.ts`, `commission-capacity.ts`, etc.

Layers 3 and 4 live outside the `commission/` directory because they don't import commission types (REQ-CLS-21, REQ-CLS-23). This directory structure literally enforces the import boundary.

The existing `commission-toolbox.ts` is modified in place: its handlers call injected callbacks instead of importing `commission-artifact-helpers` and `resolveWritePath`. It stays in `daemon/services/` (it's a toolbox, created by the toolbox resolver, consumed by Layer 4).

### EventBus Role

The EventBus is simplified to a single role: SSE streaming to the browser. It is no longer used for internal routing.

**Current (two roles):**
1. SSE streaming: lifecycle emits, browser subscribes
2. Internal routing: toolbox emits, session subscribes to track result submission

**New (one role):**
1. SSE streaming: lifecycle emits, browser subscribes

Internal routing is replaced by direct method calls and callbacks. The toolbox calls `callbacks.onResult()`. The orchestrator calls `lifecycle.resultSubmitted()`. No EventBus in the loop.

The lifecycle receives `emitEvent: (event: SystemEvent) => void` at construction. The orchestrator wires this to `eventBus.emit`. The lifecycle emits the same `SystemEvent` types as today (commission_status, commission_progress, commission_question, commission_result) so the SSE contract is unchanged.

### Public API Preservation

The orchestrator exposes the same `CommissionSessionForRoutes` interface as the current `createCommissionSession()`:

```typescript
interface CommissionSessionForRoutes {
  createCommission(...): Promise<{ commissionId: string }>;
  updateCommission(...): Promise<void>;
  dispatchCommission(...): Promise<{ status: "accepted" | "queued" }>;
  cancelCommission(...): Promise<void>;
  redispatchCommission(...): Promise<{ status: "accepted" | "queued" }>;
  addUserNote(...): Promise<void>;
  checkDependencyTransitions(...): Promise<void>;
  recoverCommissions(): Promise<number>;
  getActiveCommissions(): number;
  shutdown(): void;
}
```

Routes continue calling these methods unchanged. The orchestrator implements them using the layers. This is why no external API contracts change.

## Edge Cases

### Cancel during workspace preparation

The dispatch flow (steps 5-9) is not atomic. If a cancel arrives after `lifecycle.dispatch()` (step 5) but before `workspace.prepare()` returns (step 6):

- The cancel calls `lifecycle.cancel(commissionId, reason)`.
- Current state is "dispatched" (set in step 5). dispatched -> cancelled is valid.
- The lifecycle transitions to cancelled.
- The dispatch flow's step 6 returns with a prepared workspace, but step 7 (`lifecycle.executionStarted()`) fails because the commission is now "cancelled" (dispatched -> in_progress is no longer valid).
- The orchestrator checks the result, sees "skipped", and cleans up the workspace that was just prepared.

This is correct behavior. The workspace is cleaned up, and the commission is cancelled.

### Session completion after cancel

The session runner's promise resolves (or rejects) after the AbortController fires. By the time it resolves, the commission is already in "cancelled" state. The session completion handler calls `lifecycle.executionCompleted()` or `lifecycle.executionFailed()`, which checks state (cancelled), finds no valid transition, and returns "skipped". The handler sees "skipped" and skips side effects.

### Merge conflict escalation path

After `lifecycle.executionCompleted()` transitions to "completed", `workspace.finalize()` fails with a merge conflict. The orchestrator:

1. Calls `lifecycle.executionFailed(id, "Squash-merge conflict on non-.lore/ files")`
2. State is "completed", completed -> failed is valid, transition executes
3. Creates a Guild Master meeting request (REQ-CLS-30a)
4. Cleans up workspace (branch preserved by finalize, worktree removed)

The commission artifact shows: dispatched -> in_progress -> completed -> failed, with the failure reason documenting the merge conflict. This matches current behavior.

### Workspace preparation failure

`workspace.prepare()` can throw (git remote issues, disk full, naming conflicts). If it throws during the dispatch flow (step 7), the commission is in "dispatched" state with no worktree. The orchestrator catches the error and calls `lifecycle.executionFailed(commissionId, reason)`. dispatched -> failed is a valid transition (per REQ-CLS-6). The standard post-failure cleanup runs, minus worktree removal (nothing was created). The commission ends in "failed" state with a descriptive reason. This is identical to the current behavior where enter-dispatched catches git errors and transitions to failed.

### Heartbeat timeout

When the heartbeat timer fires, the orchestrator calls `lifecycle.executionFailed(commissionId, "process unresponsive")` then aborts the execution context. The session runner's promise resolves with `{ aborted: true }`. The session completion handler checks the commission state, finds it already "failed", and gets "skipped" from any lifecycle call. This is the same handler path as "session completion after cancel" above. The heartbeat and cancel paths collapse into the same completion handler behavior; no heartbeat-specific cleanup is needed.

### Recovery on daemon startup

The orchestrator's `recoverCommissions()` method:

1. Scans state files in `~/.guild-hall/state/commissions/`
2. For each active state file (status dispatched or in_progress):
   a. `lifecycle.register(id, projectName, status, integrationPath)` - populate state tracker
   b. `lifecycle.executionFailed(id, "Recovery: process lost on restart")` - transitions to failed, writes artifact
   c. Check if worktree exists: `workspace.preserveAndCleanup()` if so
   d. Sync terminal status to integration worktree
   e. `lifecycle.forget(id)` - remove from tracker
3. Scans for orphaned worktrees (worktree exists, no state file):
   a. Same sequence as above but with "Recovery: state lost" reason
4. `scanAutoDispatch()` once after all recoveries

Recovery no longer uses the machine's `register()` to build an `ActiveCommissionEntry` with execution fields. The lifecycle only tracks identity+status; execution state isn't needed because there's nothing executing.

### Dependency auto-transitions for non-tracked commissions

`checkDependencyTransitions()` scans all commissions in a project's integration worktree, not just tracked ones. When a blocked commission's dependencies are satisfied, the orchestrator:

1. `lifecycle.register(id, projectName, "blocked", integrationPath)` - temporarily track
2. `lifecycle.unblock(id)` - blocked -> pending, writes artifact, emits event
3. `lifecycle.forget(id)` - remove from tracker

This is a brief register-transition-forget cycle for commissions that aren't actively executing. The lifecycle handles it as any other transition: validate, write, emit.

### addUserNote during execution

User notes are written to the commission artifact via Layer 1, independent of the state machine. The orchestrator's `addUserNote()` method calls `record.appendTimeline(artifactPath, "user_note", content)` directly through Layer 1, using the lifecycle's current artifact path for the commission. This is a write operation that doesn't change state, so no transition is needed. The lifecycle's per-entry lock is not involved (notes don't affect state). If a transition and a note write race, the raw-frontmatter-preservation pattern (regex replacement) means they modify different parts of the file and don't conflict.

## Open Questions

**Dependency auto-transition trigger:** Currently, `checkDependencyTransitions` is called after successful merges (when new artifacts appear on the integration branch). In the new model, the orchestrator calls it after the post-completion flow. Should it also run on a timer or filesystem watcher for artifact changes outside the commission system? The current behavior only catches changes made by commissions. Manual artifact creation (user pushes to `claude`) doesn't trigger it. This is a pre-existing limitation, not introduced by this refactor. Noting it here for future consideration.
