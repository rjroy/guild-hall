---
title: Commissions
date: 2026-04-27
status: current
tags: [commissions, lifecycle, orchestrator, dispatch, dependencies]
modules: [daemon-services, daemon-routes]
---

# Commissions

## Five-layer architecture (REQ-CLS-26)

The commission system is split into five layers with strict downward imports:

1. **`record.ts`** — pure YAML I/O on artifact frontmatter. Regex-based field replacement, no gray-matter `stringify()`. No commission domain types; takes file paths and strings.
2. **`lifecycle.ts`** — state machine. Owns the transition graph, validates transitions, holds the in-memory tracker, emits SystemEvents. Imports only Layer 1.
3. **`workspace.ts`** (in `services/`) — git branch/worktree/merge primitives. Shared with the meeting orchestrator. Imports only `apps/daemon/lib/git.ts` and the project lock.
4. **`sdk-runner.ts`** (in `lib/agent-sdk/`) — `prepareSdkSession`, `runSdkSession`, `drainSdkSession`. SDK-shaped, not commission-aware.
5. **`orchestrator.ts`** — the only module that imports from all four. About 1750 lines because the orchestration logic across six flows (dispatch, completion, cancel, recovery, dependency, update) is what it does. Splitting further pushes wiring into a new layer with no domain benefit.

The shape rule for every layer below 5: it does not know that a higher layer exists. `lifecycle.ts` writes timeline + status via `record.ts` but does NOT call `workspace.ts` or any session code; `workspace.ts` knows nothing about state transitions.

## The transition graph

```
pending     → dispatched, blocked, cancelled, abandoned
blocked     → pending, cancelled, abandoned
dispatched  → in_progress, failed, cancelled
in_progress → completed, failed, cancelled
completed   → failed         (finalize edge cases only)
failed      → pending, abandoned   (pending = redispatch)
cancelled   → pending, abandoned   (pending = redispatch)
abandoned   → (terminal)
```

`abandoned` is terminal. Returning to `pending` only happens via redispatch from `failed`/`cancelled`.

## Per-entry promise-chain lock with deferred event emission

Each tracked commission has a `lock: Promise<void>`. Every transition appends to the chain (`prev.then(() => fn())`); two transitions on the same commission are serialized, transitions on different commissions run concurrently. The lock release is in `finally` so a thrown transition still unblocks queued ones.

Events are built inside the locked section as a `deferredEvent` field on the result, then emitted *after* `releaseLock`. Subscribers see consistent on-disk + in-memory state, and they can call back into the lifecycle without risking re-entry deadlock.

## Tool-emitted events don't double-fire lifecycle events

The commission toolbox emits `commission_progress` / `commission_result` to the EventBus directly when its tools fire. The orchestrator's session-time subscriber routes those events into `lifecycle.progressReported` / `lifecycle.resultSubmitted`, which write durability — but those lifecycle methods do **not** re-emit. Re-emission would loop back through the subscriber. The bus emission is owned by the toolbox; durability is owned by the lifecycle.

## YAML field replacement is regex, not gray-matter `stringify`

`record.ts` does field-targeted replacement: `^status: \S+$` matched and replaced, timeline entries appended to the existing block, etc. Reformatting the whole frontmatter via gray-matter produces noisy diffs (re-quoting, key reordering). gray-matter is used only for *read* parsing where structural access is needed.

`writeStatusAndTimeline` combines status update + timeline append in one read/write cycle. A crash between the two (separate writes) would leave drift between status field and the most recent timeline event.

## `result_summary` lives in the markdown body, not frontmatter

`updateResult` writes the result text into the body via `spliceBody`, and writes `linked_artifacts` into frontmatter. The migration tool `migrate-content-to-body` exists to move pre-redesign artifacts that still have `result_summary` in YAML.

## Capacity is global + per-project

`isAtCapacity` is a pure function over `(projectName, activeMap, config)`. Defaults: `maxConcurrentCommissions: 10` globally, `commissionCap: 3` per project. The "active" set is `dispatched | in_progress` — pending and blocked don't count. Caps exist primarily to prevent the daemon's event loop from being saturated; commissions are fire-and-forget promises inside the same process, not separate workers.

## Auto-dispatch is FIFO and chain-serialized

A single `autoDispatchChain: Promise<void>` queues `tryAutoDispatch` calls. Every completion / cancellation / recovery / unblock enqueues. The chain catches errors so one failure doesn't block subsequent runs.

`scanPendingCommissions` uses regex on raw bytes (`^status: \S+$` and the first `activity_timeline` timestamp) — full gray-matter parse would be too expensive across hundreds of artifacts at startup. Sort key is the first timeline timestamp; missing timestamp → `9999-12-31` so unparseable artifacts sort last.

## Dependency satisfaction is `completed | abandoned`

Both terminal states satisfy a dependency. Abandonment is "we won't do this" — it doesn't block downstream work that referenced the abandoned commission as input. A `failed` dependency keeps downstream `blocked` (the failure can be redispatched to recover).

## Dependency transitions are bidirectional

`checkDependencyTransitions(projectName)` walks every commission in the project (dual-layout) and applies:

- `blocked` + all deps satisfied → unblock (becomes `pending`).
- `pending` + any dep not satisfied → block.

Reads happen in parallel; transitions happen sequentially because lifecycle locks need serialization. After any unblock, `enqueueAutoDispatch` runs. This function is called after every commission completion and after `abandon` (which can free downstream).

## Dual-layout artifact reads (REQ-LDR-6/11/22)

Every scan checks both `.lore/work/commissions/` (canonical) and `.lore/commissions/` (legacy flat), deduping on commission ID. New writes always go to the canonical path. The legacy path is read-only — it exists only because projects mid-migration may have artifacts in either place.

## Recovery is two-pronged

`recoverCommissions()` runs at startup before the server begins serving. It scans:

1. **State files** (`~/.guild-hall/state/commissions/*.json`). Active statuses (`dispatched`, `in_progress`) → register at the stored status, transition to `failed` with reason "Recovery: process lost on restart", run `preserveAndCleanup` if a worktree exists, `syncStatusToIntegration`. Legacy statuses are tolerated: `sleeping` → fail with mail-system-removed reason; `halted` → silently skip.
2. **Orphaned activity worktrees** (`~/.guild-hall/worktrees/<project>/commission-*`). Anything not in the state-file set → register as `in_progress`, fail, preserve, sync. The worktree's branch is preserved; the worktree directory is removed.

Active commissions are dead after a daemon restart by definition (the SDK session was in-memory). The recovery flow is "transition to failed and clean up", never "resume".

## Result submission is the success criterion

After `drainSdkSession` returns, the orchestrator checks `resultSubmitted` (set true by the EventBus subscriber when `commission_result` fires). If not set, the session is treated as a failure with reason "Session completed without submitting result" — even when the SDK session ended cleanly. A worker that finished its prompt but never called `submit_result` did not finish the commission.

## Self-reference for the manager toolbox

The orchestrator passes itself as `services.commissionSession` when dispatching to the Guild Master worker (`workerPkg.name === managerPackageName`). The reference is held in `selfRef.current` and populated immediately after construction in the return statement. Without it, the manager toolbox couldn't call `create_commission` / `dispatch_commission` from inside a manager session.

## Merge-conflict escalation creates a Guild Master meeting request

When `workspace.finalize` returns `merged: false` (non-`.lore/` conflicts), the orchestrator calls `escalateMergeConflict`, which calls `createMeetingRequestFn` to write a Guild Master meeting request artifact. The activity branch is preserved for manual resolution. This is a deliberate "ask a human" path — auto-resolving non-`.lore/` conflicts is unsafe.

`createMeetingRequestFn` is the daemon-app-level lazy ref described in the daemon-infrastructure doc — that's why it is wired through orchestrator deps rather than imported.

## Commit pending artifact before `workspace.prepare`

During dispatch, the pending commission artifact is committed to the integration worktree (`gitOps.commitAll`) before forking the activity branch. Otherwise the activity worktree wouldn't see the artifact at all. A commit failure here logs a warning but lets dispatch continue — the artifact may have already been committed, or a concurrent operation is mid-flight; failing the dispatch over a redundant commit would be worse.

## Decisions persistence on success

Just before squash-merge, `decisions.jsonl` (written by the `record_decision` tool during the session) is read, formatted as a markdown section, and appended to the artifact body. After the activity worktree is removed, decisions live with the artifact in integration. On failure paths, decisions are not appended; the JSONL file remains in `state/` but is no longer referenced.

## `updateCommission` is pending-only

Once a commission moves past `pending` (dispatched / in_progress / etc.), updates throw. `updateCommission` modifies prompt / dependencies / `resource_overrides` via regex YAML replacement to preserve formatting. Editing during execution would create racy state with the active worker.

## `addUserNote` falls back to integration worktree

If the activity worktree is gone (already cleaned up by completion / cancel), notes still land in the integration worktree's artifact. The fallback catches both raw `ENOENT` and the wrapped "artifact not found" error message that `record.ts` produces.

`commission_manager_note` events fire after the write succeeds, regardless of which worktree took the note.

## `abandon` requires no active execution

A commission with an active execution context cannot be abandoned — it must be cancelled first (which aborts the SDK session). The check is `executions.has(commissionId)`. After abandon, `checkDependencyTransitions` runs because abandonment can unblock downstream commissions.

## `redispatch` counts attempts from the timeline

`getDispatchAttempt` counts `status_failed` and `status_cancelled` events in `activity_timeline`. The next attempt number is appended to the activity branch name (`commissionBranchName(id, attempt)`) when `attempt > 1`, so multiple retries don't collide on the same branch.

## `syncStatusToIntegration` is the cleanup-side bridge

The activity worktree's artifact gets status updates from `lifecycle.transition`. When the activity worktree is removed (success: squash-merge handles it; failure: `preserveAndCleanup`), the integration worktree must still reflect the terminal status — otherwise the artifact looks frozen at `in_progress`. `syncStatusToIntegration` reads the integration-worktree copy and writes status + timeline directly via `recordOps`.

The state file write at the end of `failAndCleanup` is for external observability; the integration-worktree artifact is the source of truth.
