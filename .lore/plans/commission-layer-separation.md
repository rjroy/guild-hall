---
title: Commission layer separation implementation plan
date: 2026-03-01
status: draft
tags: [architecture, commissions, refactor, boundaries, state-machine, phased-migration]
modules: [commission-session, commission-handlers, commission-recovery, activity-state-machine, commission-toolbox, commission-artifact-helpers]
related:
  - .lore/specs/commission-layer-separation.md
  - .lore/design/commission-layer-separation.md
  - .lore/brainstorm/commission-layer-separation.md
  - .lore/reference/commissions.md
  - .lore/_archive/retros/in-process-commissions.md
  - .lore/_archive/retros/phase-5-git-integration-data-loss.md
  - .lore/_archive/retros/phase-4-commissions.md
  - .lore/_archive/issues/commission-meeting-state-ownership.md
---

# Plan: Commission Layer Separation

## Spec Reference

**Spec**: `.lore/specs/commission-layer-separation.md`
**Design**: `.lore/design/commission-layer-separation.md`

Requirements addressed:

- REQ-CLS-1: Five layers with single responsibilities -> Steps 1-5
- REQ-CLS-2: Layers 1+2 are the public interface -> Step 5 (import graph verification)
- REQ-CLS-3, CLS-4, CLS-5: Layer 1 record ops -> Step 1
- REQ-CLS-6 through CLS-11: Layer 2 lifecycle -> Step 2
- REQ-CLS-12 through CLS-14: Signal semantics and validation -> Steps 2, 4
- REQ-CLS-15: Signal mechanism (design chose direct method calls) -> Step 2
- REQ-CLS-16: Hard boundary (executor never touches artifacts) -> Steps 3, 4, 7
- REQ-CLS-17: Orchestrator mediates all cross-layer communication -> Step 5
- REQ-CLS-18: ActiveCommissionEntry struct split -> Steps 2, 5, 7
- REQ-CLS-19 through CLS-21: Layer 3 workspace -> Step 3
- REQ-CLS-22 through CLS-25: Layer 4 session runner -> Step 4
- REQ-CLS-26 through CLS-30b: Layer 5 orchestrator -> Step 5
- REQ-CLS-31 through CLS-33: Behavioral preservation, timeline format, state files -> Steps 1, 5, 6
- REQ-CLS-31a: Heartbeat monitoring -> Step 5
- REQ-CLS-34: Phased migration -> All steps (each produces working code)
- REQ-CLS-35: All 1,529 tests pass throughout -> Steps 1-7 (verified at each step)
- REQ-CLS-36: Meeting lifecycle untouched -> All steps (ActivityMachine not modified)

## Codebase Context

The current commission system is ~3,500 lines of production code across 9 files, with ~6,300 lines of test code across 10 test files.

**Files being replaced:**

| File | Lines | Fate |
|------|-------|------|
| `daemon/services/commission-session.ts` | 1,486 | Replaced by `commission/orchestrator.ts` |
| `daemon/services/commission-handlers.ts` | 651 | Replaced by `commission/lifecycle.ts` |
| `daemon/services/commission-artifact-helpers.ts` | 254 | Replaced by `commission/record.ts` |
| `daemon/services/commission-recovery.ts` | 268 | Absorbed into `commission/orchestrator.ts` |
| `daemon/services/commission-sdk-logging.ts` | 70 | Moved to `session-runner.ts` or kept as utility |

**Files staying (modified):**

| File | Change |
|------|--------|
| `daemon/services/commission-toolbox.ts` | Callbacks replace direct artifact writes |
| `daemon/services/commission-capacity.ts` | No change (already pure functions) |
| `daemon/lib/activity-state-machine.ts` | No change (meetings continue using it) |
| `daemon/routes/commissions.ts` | No change (calls `CommissionSessionForRoutes`) |
| `daemon/services/manager-toolbox.ts` | Remove `appendTimelineEntry` import, route writes through `CommissionSessionForRoutes` |
| `lib/commissions.ts` | No change (read-only path for Next.js) |

**New files:**

| File | Layer | Lines (est.) |
|------|-------|-------------|
| `daemon/services/commission/record.ts` | 1 | ~150 |
| `daemon/services/commission/lifecycle.ts` | 2 | ~300 |
| `daemon/services/workspace.ts` | 3 | ~200 |
| `daemon/services/session-runner.ts` | 4 | ~250 |
| `daemon/services/commission/orchestrator.ts` | 5 | ~600 |

**Import graph (target state):**

```
commission/record.ts       -> (nothing from other layers)
commission/lifecycle.ts    -> commission/record.ts
workspace.ts               -> daemon/lib/git.ts (no commission types)
session-runner.ts          -> lib/types.ts, toolbox-resolver.ts, memory-injector.ts (no commission types)
commission/orchestrator.ts -> all four layers + daemon/types.ts, lib/paths.ts, commission-capacity.ts
```

Layers 3 and 4 live outside `commission/` because they don't import commission types. The directory structure enforces the import boundary.

**Patterns preserved:**

- `CommissionSessionForRoutes` interface (routes, manager toolbox unchanged)
- EventBus SSE streaming (same `SystemEvent` types)
- Machine-local state files for crash recovery
- Auto-dispatch via readdir + sort
- Commission artifact YAML format
- `cleanGitEnv()` on all git subprocesses

## Implementation Steps

Each step produces working code with passing tests. The new layers are built alongside existing code (no old code is modified until Step 6). Existing tests pass at every step because the old code is untouched until the swap.

### Step 1: Layer 1 - Commission Record

**Files**: `daemon/services/commission/record.ts`, `tests/daemon/services/commission/record.test.ts`
**Addresses**: REQ-CLS-3, REQ-CLS-4, REQ-CLS-5

Implement the `CommissionRecordOps` interface from the design:

- `readStatus(artifactPath)` - parse YAML frontmatter, return status field
- `writeStatus(artifactPath, status)` - replace status field in raw frontmatter bytes
- `appendTimeline(artifactPath, event, reason, extra?)` - append to timeline array
- `readDependencies(artifactPath)` - parse and return dependencies array
- `updateProgress(artifactPath, summary)` - replace current_progress field
- `updateResult(artifactPath, summary, artifacts?)` - replace result_summary and linked_artifacts fields

All methods take a full artifact path (the caller resolves which worktree). Raw frontmatter preservation: regex replacement of individual fields instead of gray-matter `stringify()`, preventing the YAML reformatting problem documented in retros.

This is new code written against the interface contract. The existing `commission-artifact-helpers.ts` is reference for what the YAML fields look like and what the timeline entry format is, but the code is written fresh.

**Tests**: Filesystem-only. Create temp commission artifacts, call record ops, verify file contents. No state machine, no git, no events. Verify:
- Each method reads/writes the correct YAML field
- `writeStatus` preserves all other frontmatter fields byte-for-byte
- `appendTimeline` adds to existing timeline without reformatting prior entries
- Operations on nonexistent files throw descriptive errors

### Step 2: Layer 2 - Commission Lifecycle

**Files**: `daemon/services/commission/lifecycle.ts`, `tests/daemon/services/commission/lifecycle.test.ts`
**Addresses**: REQ-CLS-6, REQ-CLS-7, REQ-CLS-8, REQ-CLS-9, REQ-CLS-10, REQ-CLS-11, REQ-CLS-12, REQ-CLS-13, REQ-CLS-14, REQ-CLS-15

Implement the `CommissionLifecycle` class from the design. Two dependencies: `CommissionRecordOps` (Layer 1) and `emitEvent: (event: SystemEvent) => void`.

**State machine (REQ-CLS-6):**

```
pending     -> dispatched, blocked, cancelled, abandoned
blocked     -> pending, cancelled, abandoned
dispatched  -> in_progress, failed, cancelled
in_progress -> completed, failed, cancelled
completed   -> failed
failed      -> pending, abandoned
cancelled   -> pending, abandoned
abandoned   -> (terminal)
```

**Registration methods:**
- `create(id, projectName, artifactPath, initialStatus)` - write initial status + timeline, track in state map
- `register(id, projectName, status, artifactPath)` - populate state tracker only (recovery)
- `forget(id)` - remove from state tracker (post-cleanup)

**Transition triggers** (named methods, no from-state required from caller):
- `dispatch(id)`, `cancel(id, reason)`, `abandon(id)`, `redispatch(id)`, `block(id)`, `unblock(id)`
- `executionStarted(id, artifactPath)` - also updates the write path (design decision 3)
- `executionCompleted(id)`, `executionFailed(id, reason)`

**In-progress signals:**
- `progressReported(id, summary)` - validates in_progress, updates progress via Layer 1
- `resultSubmitted(id, summary, artifacts?)` - validates in_progress + not already submitted, updates result via Layer 1
- `questionLogged(id, question)` - validates in_progress, appends timeline via Layer 1

**Queries:** `getStatus(id)`, `getProjectName(id)`, `getArtifactPath(id)`, `isTracked(id)`, `activeCount`, `setArtifactPath(id, path)`

**Concurrency:** Per-entry promise chain. Lock protects validate-write-update. Event emission after lock release (subscribers see event after artifact is updated).

**Internal state:** `TrackedCommission` per the design (commissionId, projectName, status, artifactPath, resultSignalReceived, lock). No worktreeDir, branchName, or abortController (those belong to Layer 5).

**Tests**: Mocked `CommissionRecordOps` (verify correct calls to Layer 1). Spy `emitEvent`. Test:
- Every valid transition in the graph executes and emits the correct event
- Every invalid transition is rejected with a descriptive error
- Signals validate against current state (progressReported on a pending commission is rejected)
- `resultSubmitted` rejects duplicates (resultSignalReceived flag)
- `executionStarted` updates the artifact path
- Concurrent transitions on the same commission: one executes, the other is skipped with a descriptive reason string in `TransitionResult` (REQ-CLS-7)
- `create` writes initial status and timeline via Layer 1
- `register` populates state without writing
- `forget` removes from tracker

### Step 3: Layer 3 - Workspace Operations

**Files**: `daemon/services/workspace.ts`, `tests/daemon/services/workspace.test.ts`
**Addresses**: REQ-CLS-19, REQ-CLS-20, REQ-CLS-21

Implement the `WorkspaceOps` interface from the design. Commission-agnostic: receives workspace configuration, returns workspace paths and operation results. No commission types in scope.

**Methods:**
- `prepare(config: WorkspaceConfig)` - create branch from baseBranch, create worktree, configure sparse checkout if specified. Returns `{ worktreeDir }`.
- `finalize(config)` - squash-merge activityBranch into baseBranch. Returns `FinalizeResult` (merged or preserved with reason). On merge conflict in non-.lore/ files: preserve branch, return `{ merged: false, preserved: true, reason }`.
- `preserveAndCleanup(config)` - commit uncommitted work, remove worktree, keep branch for recovery.
- `removeWorktree(worktreeDir)` - remove worktree only.

Calls into `daemon/lib/git.ts` for low-level primitives (createBranch, createWorktree, configureSparseCheckout, etc.). All subprocess invocations use `cleanGitEnv()` (REQ-CLS-20).

This is new code. The current workspace logic is scattered across `commission-handlers.ts` (enter-dispatched, enter-completed, exit-in_progress) interleaved with state transitions. The new module owns the git sequencing as a coherent unit.

**Tests**: Mocked git operations via DI. The current `daemon/lib/git.ts` exports functions, not an interface. Step 3 introduces a `GitOps`-style interface or accepts git operation functions as constructor parameters for testability. No commission types in scope. Verify:
- `prepare` calls createBranch, createWorktree, and configureSparseCheckout in correct order
- `finalize` calls squash-merge and returns correct result for success and conflict cases
- `preserveAndCleanup` commits, removes worktree, and preserves branch
- `cleanGitEnv()` is enforced (Layer 3 isolation test: no commission types imported)
- Error paths: prepare failure propagates, finalize conflict returns structured result

### Step 4: Layer 4 - Session Runner + Toolbox Callbacks

**Files**: `daemon/services/session-runner.ts`, `tests/daemon/services/session-runner.test.ts`, `daemon/services/commission-toolbox.ts` (modified)
**Addresses**: REQ-CLS-22, REQ-CLS-23, REQ-CLS-24, REQ-CLS-25

**Session Runner**: Implement the `SessionRunner` interface. Receives a `SessionSpec` (workspace path, prompt, worker metadata, packages, config, abort signal, callbacks). Returns a `SessionResult` (resultSubmitted boolean, error string, aborted boolean).

Behavioral sequence:
1. Resolve tools (base toolbox + context toolbox + system toolboxes + domain toolboxes)
2. Load worker memories via memory injector
3. Activate worker (build system prompt)
4. Run SDK session with resolved tools and prompt
5. Handle follow-up rounds if applicable
6. Return result

The session runner does not know about commissions, state machines, git, or artifacts (REQ-CLS-23). It runs an SDK session in a directory with a prompt and reports what happened.

**Terminal state guard** (REQ-CLS-24): When cancellation (via AbortController) and natural session completion race, exactly one outcome is reported. The session runner tracks a `settled` flag. The first resolution (completion or abort) sets it. The second path is a no-op.

**Toolbox modification**: Create a new factory function `createCommissionToolboxWithCallbacks(callbacks: CommissionToolCallbacks)` alongside the existing `createCommissionToolbox`. The new factory receives `onProgress`, `onResult`, `onQuestion` callbacks instead of EventBus + artifact write deps.

- `report_progress` tool calls `callbacks.onProgress(summary)`
- `submit_result` tool calls `callbacks.onResult(summary, artifacts)` (one-shot guard stays in toolbox)
- `log_question` tool calls `callbacks.onQuestion(question)`

The old factory stays for the transition period. Removed in Step 7.

**Tests**: Mocked SDK session, mocked toolbox. No commission types in scope. Verify:
- Session runner calls resolve tools, load memories, activate worker, run session in correct order
- Callbacks are invoked when tools are called
- `resultSubmitted` is true in SessionResult when onResult was called
- Terminal state guard: abort after completion is no-op, completion after abort is no-op
- Abort signal cancels the SDK session

### Step 5: Layer 5 - Orchestrator

**Files**: `daemon/services/commission/orchestrator.ts`, `tests/daemon/services/commission/orchestrator.test.ts`
**Addresses**: REQ-CLS-17, REQ-CLS-26, REQ-CLS-27, REQ-CLS-28, REQ-CLS-29, REQ-CLS-30, REQ-CLS-30a, REQ-CLS-30b, REQ-CLS-31a

The orchestrator is the only module that imports from all layers. It implements `CommissionSessionForRoutes` so routes and manager toolbox continue to work unchanged.

**Dependencies**: `CommissionLifecycle` (Layer 2), `WorkspaceOps` (Layer 3), `SessionRunner` (Layer 4), `CommissionRecordOps` (Layer 1, for addUserNote), plus capacity functions, EventBus, config, path utilities.

**Tracked execution state per running commission:**

```typescript
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

This is the execution half of the old `ActiveCommissionEntry`. The lifecycle owns identity (commissionId, projectName, status). The orchestrator correlates them by commissionId.

**Flows implemented (per design):**

1. **Dispatch flow** (10 steps): validate artifact -> check capacity -> lifecycle.dispatch -> workspace.prepare -> lifecycle.executionStarted -> create execution context + heartbeat -> fire-and-forget session runner -> return status.

2. **Session completion flow** (11 steps): clear heartbeat -> check aborted -> if result submitted: lifecycle.executionCompleted + workspace.finalize (handle merge conflict) -> if no result: lifecycle.executionFailed + workspace.preserveAndCleanup -> sync to integration -> cleanup context -> scanAutoDispatch + checkDependencyTransitions.

3. **Cancel flow** (5 steps): lifecycle.cancel -> if active: abort + clear heartbeat + preserveAndCleanup + sync + cleanup -> if pending/blocked: forget -> scanAutoDispatch.

4. **Recovery flow** (4 steps): scan state files -> register + executionFailed + cleanup for each -> scan orphaned worktrees -> scanAutoDispatch.

5. **Dependency flow**: scan integration worktree -> register blocked commissions with satisfied deps -> lifecycle.unblock -> forget.

6. **Update flow**: Validate status is pending via lifecycle.getStatus -> read and modify frontmatter fields (prompt, dependencies, resource overrides) via Layer 1 -> if dependencies changed, check if commission should be blocked or unblocked. This is a required method on `CommissionSessionForRoutes`.

The session completion flow (flow 2) is the `.then(onSessionEnd).catch(onSessionError)` callback wired in step 10 of the dispatch flow. It is not a separate entry point; it's the continuation of the fire-and-forget session runner promise.

**Heartbeat** (REQ-CLS-31a): Per-commission `setTimeout`. Created at `executionStarted`. Reset on each `progressReported` callback. Cleared on any terminal transition. Timeout fires `lifecycle.executionFailed("process unresponsive")` then aborts execution.

**Manager toolbox migration**: Two changes eliminate the manager toolbox's direct artifact write dependency:

1. **`manager_dispatched` timeline entry** (manager-toolbox.ts lines 117-137): Currently writes to the integration worktree after dispatch, which is fragile (the comment at line 119-120 acknowledges this). The dispatch flow's existing timeline entry written by `lifecycle.dispatch()` already records that the commission was dispatched. The Guild Master's attribution is included in the dispatch reason: `"Dispatched by Guild Master: {title}"`. The manager toolbox's separate `appendTimelineEntry` call is removed. **Note**: This is an intentional observable change to timeline output. The `manager_dispatched` event type disappears from new timelines. Pre-existing `manager_dispatched` entries in old artifacts remain readable (they're just strings in YAML). This does not violate REQ-CLS-32 (timeline format preserved) because the format is preserved; only the set of event types changes, and the spec does not freeze event types.

2. **`add_commission_note` tool** (manager-toolbox.ts lines 413-460): Currently calls `appendTimelineEntry` (line 431) directly then emits `commission_manager_note` (line 438) separately. Replaced with `commissionSession.addUserNote(cid, content)`. The orchestrator's `addUserNote` is extended to emit a `commission_manager_note` event after writing via Layer 1. The manager toolbox removes its import of `commission-artifact-helpers` (line 27), its import of `resolveCommissionBasePath` (line 36), and its direct EventBus emission for notes.

**addUserNote**: Writes via Layer 1 directly (not through lifecycle, since notes don't change state). Gets the current artifact path from the lifecycle's tracked state. Emits `commission_manager_note` event for SSE subscribers. The lifecycle's per-entry lock is not involved (notes modify different frontmatter fields than transitions, and raw-frontmatter-preservation means they don't conflict).

**Tests**: Integration tests across layer boundaries (per phase 4 retro lesson). Mock Layer 3 (git) and Layer 4 (SDK session) at their interfaces, but use real Layer 1 (filesystem) and real Layer 2 (lifecycle). Verify:

- **Orchestrator wiring test**: Simulate full dispatch-through-completion. Verify Layer 5 calls Layer 3, then Layer 4, translates callbacks to signals, signals reach Layer 2 and produce correct artifact writes.
- **Race condition test**: Concurrent executionCompleted and cancellation for the same commission. Exactly one succeeds.
- **Crash recovery test**: Simulate daemon restart with stale state files and orphaned worktrees. Verify Layer 5 reconciles through Layer 2 signals and Layer 3 cleanup.
- **Heartbeat test**: No progress signal within threshold triggers executionFailed and abort.
- **Merge conflict escalation**: workspace.finalize returns conflict, orchestrator calls executionFailed and creates meeting request.
- **Cancel during workspace preparation**: Cancel arrives between dispatch and executionStarted. Workspace cleaned up, commission cancelled.
- **Dependency auto-transitions**: Blocked commission becomes pending when dependency completes.
- **addUserNote during execution**: Note written to correct worktree (activity, not integration).

### Step 6: Production Wiring + Regression

**Files**: `daemon/app.ts`, `daemon/services/manager-toolbox.ts`
**Addresses**: REQ-CLS-31, REQ-CLS-32, REQ-CLS-33, REQ-CLS-35

This is the swap step. All new layers exist and have their own tests. Now wire them into production.

1. **Update `createProductionApp()`** in `daemon/app.ts`: Replace `createCommissionSession()` with the new orchestrator. The orchestrator's constructor receives Layer 1, Layer 2, Layer 3, Layer 4, EventBus, config, and path utilities. Wire real dependencies.

2. **Update `manager-toolbox.ts`**: Remove `import { appendTimelineEntry } from "@/daemon/services/commission-artifact-helpers"`. Remove the `manager_dispatched` timeline write (lines 117-137). Replace the `add_commission_note` tool's direct `appendTimelineEntry` + EventBus emission with `commissionSession.addUserNote(cid, content)`.

3. **Run the full test suite**: All 1,529 existing tests must pass. The existing tests target `CommissionSessionForRoutes`, which the new orchestrator implements. Tests that test external behavior (routes, SSE events, artifact format) should pass without modification. Tests that test internal implementation details (handler enter/exit, ActivityMachine transitions for commissions) are expected to break and are rewritten in this step to test the new layer boundaries instead.

4. **Fresh-eyes review**: Launch a sub-agent with no implementation context to review the production wiring in `daemon/app.ts`. This catches DI wiring gaps (per in-process migration retro lesson).

5. **Manual verification**: Start the daemon, create a commission, dispatch it, verify SSE events stream correctly, verify artifact updates, verify crash recovery.

**Test rewrite guidance**: Tests to rewrite are those that directly test commission-specific behavior through the old internal interfaces:
- `tests/daemon/services/commission-handlers.test.ts` - tests enter/exit handlers that no longer exist. Rewrite to test lifecycle transitions.
- `tests/daemon/commission-crash-recovery.test.ts` - imports `ActiveCommissionEntry` from `commission-handlers.ts` and `ActivityMachine` from `activity-state-machine.ts`. Rewrite to test recovery through the new orchestrator.
- `tests/daemon/services/commission-recovery.test.ts` - imports `recoverCommissions` from `commission-recovery.ts` (scheduled for deletion). Rewrite to test recovery through the new orchestrator.
- Any test that constructs `ActiveCommissionEntry` with execution fields (worktreeDir, branchName, abortController) alongside lifecycle fields.

Tests that should pass unchanged:
- `tests/daemon/commission-session.test.ts` - tests `CommissionSessionForRoutes` interface (the public API)
- `tests/daemon/commission-concurrent-limits.test.ts` - tests capacity functions
- `tests/daemon/commission-artifact-helpers.test.ts` - tests artifact I/O (same format preserved, covers REQ-CLS-32)
- `tests/daemon/commission-toolbox.test.ts` - tests toolbox behavior
- `tests/api/commissions.test.ts` - tests route handlers

**Behavioral preservation verification** (REQ-CLS-32, REQ-CLS-33):
- Confirm `tests/daemon/commission-artifact-helpers.test.ts` passes unchanged (timeline format preserved)
- Confirm state files are written to `~/.guild-hall/state/commissions/` with the same JSON schema (same fields, same location)
- Manual check: create a commission artifact with pre-existing timeline entries, run through the new layers, verify old entries are still readable

### Step 7: Cleanup + Boundary Verification

**Files**: Remove old files, verify import graph
**Addresses**: REQ-CLS-2, REQ-CLS-16, REQ-CLS-18

1. **Remove old commission code**:
   - `daemon/services/commission-session.ts` (replaced by orchestrator)
   - `daemon/services/commission-handlers.ts` (replaced by lifecycle)
   - `daemon/services/commission-artifact-helpers.ts` (replaced by record)
   - `daemon/services/commission-recovery.ts` (absorbed into orchestrator)
   - Old toolbox factory function in `commission-toolbox.ts` (keep new callback-based factory)

2. **Update imports**: Grep for all imports of removed files. Update to import from new layer modules. Verify no dangling references.

3. **Boundary enforcement test** (REQ-CLS-16): Static analysis of the import graph.
   - `commission/record.ts` imports nothing from other layers
   - `commission/lifecycle.ts` imports only from `commission/record.ts`
   - `workspace.ts` does not import any commission types
   - `session-runner.ts` does not import any commission types
   - `commission/orchestrator.ts` is the only file that imports from all layers

4. **ActiveCommissionEntry split test** (REQ-CLS-18): Verify by type inspection.
   - `TrackedCommission` (Layer 2) does not contain worktreeDir, branchName, or abortController
   - `ExecutionContext` (Layer 5) does not contain transition validation or artifact ops

5. **Run full test suite** one final time. All tests pass.

6. **Run linter and typecheck**: `bun run lint` and `bun run typecheck` pass clean.

### Step 8: Validate Against Spec

Launch a sub-agent that reads the spec at `.lore/specs/commission-layer-separation.md`, reviews the implementation across all new files, and flags any requirements not met. This step is not optional.

The agent checks:
- Every REQ-CLS requirement is addressed by implemented code
- The success criteria (spec section) are all satisfied
- The AI validation criteria (spec section) all have corresponding tests
- 90%+ test coverage on new code (spec AI Validation section requires this)
- External API contracts (routes, SSE events, artifact format) are unchanged
- Meeting lifecycle is untouched (ActivityMachine not modified)
- Pre-existing timeline entries are readable after migration (REQ-CLS-32)
- State files are written to `~/.guild-hall/state/commissions/` with unchanged format (REQ-CLS-33)

## Delegation Guide

Steps requiring specialized expertise:

- **Step 2 (Lifecycle)**: Use `pr-review-toolkit:type-design-analyzer` to review the `CommissionLifecycle` class, `TrackedCommission` type, and `TransitionResult` type. Verify encapsulation and invariant expression.
- **Step 5 (Orchestrator)**: Use `pr-review-toolkit:silent-failure-hunter` to review error handling in the dispatch, completion, cancel, and recovery flows. The orchestrator has many error paths that must not silently swallow failures.
- **Step 6 (Wiring)**: Use `pr-review-toolkit:code-reviewer` with fresh context to review the production wiring in `daemon/app.ts`. DI wiring gaps are the single most common failure mode in this codebase (documented in two retros).
- **Step 8 (Validation)**: Use `lore-development:fresh-lore` or a spec-review agent to validate requirement coverage.

Consult `.lore/lore-agents.md` for the full agent registry.

## Open Questions

1. **`commission-sdk-logging.ts` placement**: This 70-line utility formats SDK messages. It has no closure dependencies. It could stay as a standalone utility imported by the session runner, or be inlined into `session-runner.ts`. Low-stakes decision, resolve during Step 4.

2. **`addUserNote` event type**: The manager toolbox currently emits `commission_manager_note`. User notes from routes don't emit events. Should both emit the same event type? This is a minor SSE contract question. The current behavior (only manager notes trigger SSE) can be preserved by having the orchestrator check a flag, or unified by always emitting. Resolve during Step 5.

3. ~~**`updateCommission` in the new model**~~: Resolved. Promoted to required deliverable in Step 5 (flow 6: Update flow). The orchestrator validates status via Layer 2, then writes frontmatter via Layer 1.
