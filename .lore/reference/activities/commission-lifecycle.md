---
title: Commission lifecycle
date: 2026-04-28
status: current
tags: [commissions, lifecycle, state-machine, architecture]
modules: [commission-orchestrator, commission-lifecycle, commission-record, workspace, sdk-runner]
related:
  - .lore/reference/activities/commissions.md
  - .lore/reference/architecture/daemon-infrastructure.md
---

# Diagram: Commission Lifecycle

## Context

Commissions are the primary unit of delegated work in Guild Hall. A commission moves through eight states across five layers (record, lifecycle, workspace, sdk-runner, orchestrator). This diagram answers: what happens from the moment a commission is created until it reaches a terminal state, and which layer owns each transition?

## State Machine

The eight states and their valid transitions. Terminal states are `completed` and `abandoned`.

```mermaid
stateDiagram-v2
    [*] --> pending: create

    pending --> dispatched: dispatch (capacity available)
    pending --> blocked: dependency missing
    pending --> cancelled: user cancels
    pending --> abandoned: user abandons

    blocked --> pending: dependency satisfied
    blocked --> cancelled: user cancels
    blocked --> abandoned: user abandons

    dispatched --> in_progress: workspace ready, session started
    dispatched --> failed: workspace prep error
    dispatched --> cancelled: user cancels

    in_progress --> completed: result submitted
    in_progress --> failed: error / timeout / no result
    in_progress --> cancelled: user cancels

    completed --> failed: merge conflict (finalize edge case)
    completed --> [*]

    failed --> pending: redispatch
    failed --> abandoned: user abandons

    cancelled --> pending: redispatch
    cancelled --> abandoned: user abandons

    abandoned --> [*]
```

The `completed -> failed` edge exists because `lifecycle.executionCompleted` runs before `workspace.finalize`. If the squash-merge then conflicts on non-`.lore/` files, the commission is already in `completed` and must transition forward to `failed`. This is the only edge that leaves a "terminal" state.

### State Ownership

| State | Who triggers the transition |
|-------|---------------------------|
| pending | Orchestrator L5 (create, redispatch, dependency satisfied) |
| blocked | Orchestrator L5 (dependency check) |
| dispatched | Orchestrator L5 (dispatch call) |
| in_progress | Orchestrator L5 (after workspace.prepare succeeds) |
| completed | Lifecycle L2 (executionCompleted signal from orchestrator) |
| failed | Lifecycle L2 (executionFailed; from session error, no result, finalize merge conflict, or recovery) |
| cancelled | Lifecycle L2 (cancel call from routes or manager) |
| abandoned | Lifecycle L2 (abandon call from routes) |

## Dispatch-to-Completion Flow

The sequence from when a user dispatches a commission through successful completion. This is the "happy path" showing the orchestrator coordinating across all four lower layers.

```mermaid
sequenceDiagram
    participant User
    participant Routes as Routes (HTTP)
    participant Orch as Orchestrator (L5)
    participant Life as Lifecycle (L2)
    participant Work as Workspace (L3)
    participant SDK as SDK Runner (L4)
    participant EB as EventBus

    User->>Routes: POST /commissions/{id}/dispatch
    Routes->>Orch: dispatchCommission(id)
    Orch->>Orch: check capacity + dependencies
    Orch->>Orch: gitOps.commitAll (pending artifact)
    Orch->>Life: dispatch(id)
    Life->>Life: validate: pending -> dispatched
    Life->>EB: commission_status: dispatched

    Orch->>Work: prepare(project, id, checkoutScope)
    Work->>Work: create activity branch from claude
    Work->>Work: create worktree + sparse checkout
    Work-->>Orch: { worktreeDir, branchName }

    Orch->>Orch: write state file (status=dispatched)
    Orch->>Life: executionStarted(id, activityArtifactPath)
    Life->>Life: validate: dispatched -> in_progress
    Life->>EB: commission_status: in_progress
    Orch-->>Routes: { status: accepted }
    Routes-->>User: 202 Accepted

    Note over Orch,SDK: Fire-and-forget runCommissionSession

    Orch->>SDK: prepareSdkSession(worker, tools, memories)
    SDK->>SDK: resolve tools, activate worker
    Orch->>SDK: drainSdkSession(runSdkSession(...))

    loop Worker executing
        SDK->>EB: tool events (progress, result)
        EB->>Orch: commission tool event
        Orch->>Life: progressReported / resultSubmitted
        Life->>Life: append timeline, update progress
    end

    SDK->>EB: submit_result event
    EB->>Orch: commission_result
    Orch->>Orch: resultSubmitted = true
    SDK-->>Orch: session ends

    Orch->>Life: executionCompleted(id)
    Life->>Life: validate: in_progress -> completed
    Life->>EB: commission_status: completed

    Orch->>Orch: delete state file
    Orch->>Orch: append decisions section to artifact body

    Orch->>Work: finalize(activityBranch, integrationPath, ...)
    Work->>Work: commit uncommitted work
    Work->>Work: squash-merge into claude (under project lock)
    Work->>Work: delete activity branch + worktree
    Work-->>Orch: { merged: true }

    Orch->>EB: commission_status: completed (final)
    Orch->>Orch: enqueue auto-dispatch
    Orch->>Orch: checkDependencyTransitions(project)
```

## Failure and Recovery

What happens when things go wrong. Most failure paths converge on the same preservation strategy; the merge-conflict path branches off because the worktree was already removed by `finalize`.

```mermaid
flowchart TD
    subgraph Failure Triggers
        A[Session error / SDK crash]
        B[No submit_result before session end]
        C[Workspace.prepare error]
        D[Daemon crash + restart]
        E[Merge conflict on non-.lore/ files]
    end

    A --> F[lifecycle.executionFailed]
    B --> F
    C --> F
    D --> R[recoverCommissions scan]
    E --> ESC[escalateMergeConflict]

    ESC --> MR[createMeetingRequest: Guild Master]
    ESC --> F

    R --> R1[Scan ~/.guild-hall/state/commissions/*.json]
    R --> R2[Scan worktrees/&lt;project&gt;/commission-*]
    R1 --> F
    R2 --> F

    F --> P[preserveAndCleanup]
    P --> P1[Commit uncommitted work]
    P --> P2[Remove worktree]
    P --> P3[Keep activity branch]

    P1 --> SY[syncStatusToIntegration: failed]
    P2 --> SY
    P3 --> SY

    SY --> WS[writeStateFile: failed]

    WS --> Q{User decision}
    Q -->|Redispatch| RD[lifecycle.redispatch -&gt; pending; new attempt suffix]
    Q -->|Abandon| AB[Terminal state; checkDependencyTransitions]
    Q -->|Inspect branch| IN[Manual recovery on preserved branch]
```

The merge-conflict path is unique: `workspace.finalize` already removed the worktree before returning a conflict result, so `failAndCleanup` skips `preserveAndCleanup` (controlled by the `preserveWorktree: false` option). The branch is preserved by `finalize`'s own conflict-abort path, and `escalateMergeConflict` opens a Guild Master meeting so a human can resolve.

## Git Isolation

Three locations involved in a commission's git lifecycle, and when each is written.

```mermaid
flowchart LR
    subgraph Integration Worktree
        IW["~/.guild-hall/projects/{project}/claude/"]
        IW_A[".lore/work/commissions/{id}.md"]
    end

    subgraph Activity Worktree
        AW["~/.guild-hall/worktrees/{project}/commission-{id}/"]
        AW_F["Worker's file changes"]
        AW_A[".lore/work/commissions/{id}.md"]
    end

    subgraph Machine State
        MS["~/.guild-hall/state/commissions/{id}.json"]
    end

    C[Create] -->|write artifact| IW_A
    D[Dispatch] -->|create branch + worktree| AW
    D -->|write state file| MS
    E[Execute] -->|worker writes here| AW_F
    E -->|progress updates| AW_A
    M[Merge] -->|squash into claude| IW
    M -->|delete| AW
    M -->|delete| MS
    F[Fail] -->|sync status| IW_A
    F -->|remove worktree, keep branch| AW
```

## Layer Boundaries

How the five concerns map to commission operations. Each layer has a hard boundary: it only touches its own domain.

```mermaid
flowchart TB
    subgraph "Layer 5: Orchestrator (commission-specific)"
        O[orchestrator.ts]
        O_cap[Capacity check]
        O_auto[Auto-dispatch FIFO]
        O_crash[recoverCommissions]
        O_dep[checkDependencyTransitions]
        O_esc[Merge conflict escalation]
    end

    subgraph "Layer 4: SDK Runner (lib/agent-sdk)"
        S[sdk-runner.ts]
        S_prep[prepareSdkSession]
        S_run[runSdkSession]
        S_drain[drainSdkSession]
    end

    subgraph "Layer 3: Workspace (services/workspace.ts, shared)"
        W[workspace.ts]
        W_br[Branch + worktree]
        W_mg[Squash-merge under project lock]
        W_pres[preserveAndCleanup]
    end

    subgraph "Layer 2: Lifecycle (commission-specific)"
        L[lifecycle.ts]
        L_sm[State machine validation]
        L_lock[Per-entry promise lock]
        L_ev[Deferred event emission]
    end

    subgraph "Layer 1: Record (commission-specific)"
        R[record.ts]
        R_fm[YAML field replacement]
        R_tl[Timeline append]
        R_body[Result body via spliceBody]
    end

    O --> L
    O --> W
    O --> S
    O --> R
    L --> R
    W -.->|never| R
    S -.->|never| R
    S -.->|never| W
```

Workspace was extracted from the commission tree into `apps/daemon/services/workspace.ts` because the meeting orchestrator uses the same primitives. It has no commission types in scope. The orchestrator is the only module that imports all four lower layers (record's `addUserNote` writes go directly through Layer 1 because they're not state transitions).

## Reading the Diagram

The state machine (first diagram) is the contract. All other flows are implementations of transitions in that state machine.

The dispatch-to-completion sequence shows the "normal" case. The orchestrator is the only module that talks to all layers; layers never cross-reference each other. Workspace and SDK Runner are not commission-specific — `services/workspace.ts` is shared with the meeting orchestrator, and `lib/agent-sdk/sdk-runner.ts` runs any SDK session.

The failure flowchart shows that almost all failure paths converge: commit partial work, remove the worktree, keep the branch, sync status to integration, write the failed state file. The merge-conflict path is the exception — `workspace.finalize` already removed the worktree, so the orchestrator skips `preserveAndCleanup` and instead opens a Guild Master meeting via `escalateMergeConflict`.

## Key Insights

- **Dispatched is transient.** The gap between `dispatched` and `in_progress` is just `workspace.prepare` (branch + worktree creation, optional sparse checkout). If that fails, the commission goes directly to `failed` without ever running the SDK.
- **Completed is mostly terminal — but not always.** `lifecycle.executionCompleted` runs *before* the squash-merge, so a non-`.lore/` merge conflict transitions an already-completed commission to `failed`. This is the only edge that leaves a "terminal" state, and it exists by design: the commission really did finish its work; the failure is in integration, not execution.
- **Result submission is the fork.** The session ending with `resultSubmitted = true` goes to `completed`; without it, `failed` with reason "Session completed without submitting result". A worker that finishes its prompt but never calls `submit_result` did not finish the commission.
- **Merge conflict is a failure plus an escalation.** When a squash-merge has non-`.lore/` conflicts, the commission fails *and* `escalateMergeConflict` writes a Guild Master meeting request. The activity branch is preserved for the human resolver. Auto-resolution is reserved for `.lore/` files only.
- **Decisions persist on success only.** Just before `workspace.finalize`, the orchestrator reads `decisions.jsonl` (written by `record_decision` during the session) and appends a markdown section to the artifact body. Failure paths leave the JSONL in `state/` but do not append.
- **Crash recovery is pessimistic.** On restart, every interrupted commission (active state files + orphaned worktrees) becomes `failed`. No attempt to resume. The user can redispatch, which creates a fresh branch (with `-attempt-N` suffix from `getDispatchAttempt`) while preserving the old one.
- **SDK manages timeouts.** The SDK handles its own timeouts for hung API calls. The commission system does not independently kill sessions based on inactivity.

## Not Shown

- **Dependency auto-transition details.** When an artifact is created or removed, the orchestrator scans all blocked/pending commissions. The scan logic and matching rules aren't visualized here.
- **Capacity queuing internals.** When at capacity, commissions stay pending and auto-dispatch fires when capacity opens. The FIFO ordering and queue management aren't shown.
- **Manager worker's programmatic commission creation.** The Guild Master can create and dispatch commissions through the same interface as routes, but the coordination logic (batching, sequencing) lives in the manager worker's posture.
- **EventBus subscription lifecycle.** How SSE clients subscribe, receive events, and reconnect.
- **Toolbox resolution.** How base, context, system, and domain toolboxes compose for a commission. This deserves its own diagram.

## Related

- `.lore/reference/activities/commissions.md` for the prose tour of the same machinery (transition graph, capacity rules, recovery, dependency satisfaction)
- `.lore/reference/architecture/daemon-infrastructure.md` for daemon-app wiring and lazy refs (e.g. `createMeetingRequestFn`)
- `apps/daemon/services/commission/orchestrator.ts` for Layer 5 (~1750 lines, all six flows)
- `apps/daemon/services/commission/lifecycle.ts` for Layer 2 (state machine + transition graph)
- `apps/daemon/services/commission/record.ts` for Layer 1 (YAML field replacement)
- `apps/daemon/services/workspace.ts` for Layer 3 (git branch/worktree/squash-merge, shared with meetings)
- `apps/daemon/lib/agent-sdk/sdk-runner.ts` for Layer 4 (`prepareSdkSession` / `runSdkSession` / `drainSdkSession`)
- `apps/daemon/lib/escalation.ts` for `escalateMergeConflict`
