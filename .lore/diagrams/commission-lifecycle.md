---
title: Commission lifecycle
date: 2026-03-03
status: current
tags: [commission, lifecycle, state-machine, architecture]
modules: [commission-orchestrator, commission-lifecycle, commission-workspace, sdk-runner]
related:
  - .lore/specs/commissions.md
  - .lore/specs/system.md
---

# Diagram: Commission Lifecycle

## Context

Commissions are the primary unit of delegated work in Guild Hall. A commission moves through eight states across four layers (record, lifecycle, workspace, orchestrator) plus a shared SDK runner. This diagram answers: what happens from the moment a commission is created until it reaches a terminal state, and which layer owns each transition?

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

    in_progress --> completed: result submitted + merge success
    in_progress --> failed: error / timeout / no result / merge conflict
    in_progress --> cancelled: user cancels

    completed --> [*]

    failed --> pending: redispatch
    failed --> abandoned: user abandons

    cancelled --> pending: redispatch
    cancelled --> abandoned: user abandons

    abandoned --> [*]
```

### State Ownership

| State | Who triggers the transition |
|-------|---------------------------|
| pending | Orchestrator (create, redispatch, dependency satisfied) |
| blocked | Orchestrator (dependency check) |
| dispatched | Orchestrator (dispatch call) |
| in_progress | Orchestrator (after workspace.prepare succeeds) |
| completed | Lifecycle (executionCompleted signal) |
| failed | Lifecycle (executionFailed signal) |
| cancelled | Lifecycle (cancel call from routes or manager) |
| abandoned | Lifecycle (abandon call from routes) |

## Dispatch-to-Completion Flow

The sequence from when a user dispatches a commission through successful completion. This is the "happy path" showing all four layers and the SDK runner.

```mermaid
sequenceDiagram
    participant User
    participant Routes as Routes (HTTP)
    participant Orch as Orchestrator (L4)
    participant Life as Lifecycle (L2)
    participant Work as Workspace (L3)
    participant SDK as SDK Runner
    participant EB as EventBus

    User->>Routes: POST /commissions/{id}/dispatch
    Routes->>Orch: dispatchCommission(id)
    Orch->>Orch: check capacity
    Orch->>Life: dispatch(id)
    Life->>Life: validate: pending -> dispatched
    Life->>EB: commission_status: dispatched

    Orch->>Work: prepare(project, id)
    Work->>Work: create activity branch
    Work->>Work: create worktree + sparse checkout
    Work-->>Orch: { worktreeDir, branchName }

    Orch->>Orch: write state file
    Orch->>Life: executionStarted(id)
    Life->>Life: validate: dispatched -> in_progress
    Life->>EB: commission_status: in_progress
    Orch->>Orch: start heartbeat timer
    Orch-->>Routes: { status: accepted }
    Routes-->>User: 202 Accepted

    Note over Orch,SDK: Fire-and-forget session

    Orch->>SDK: prepareSdkSession(worker, tools, memories)
    SDK->>SDK: resolve tools, activate worker
    Orch->>SDK: runSdkSession(prompt, options)

    loop Worker executing
        SDK->>EB: tool events (progress, result, question)
        EB->>Orch: commission tool event
        Orch->>Life: progressReported / questionLogged
        Life->>Life: append timeline, update progress
        Orch->>Orch: reset heartbeat
    end

    SDK->>EB: submit_result event
    EB->>Orch: commission_result
    Orch->>Orch: resultSubmitted = true
    SDK-->>Orch: session ends

    Orch->>Life: executionCompleted(id)
    Life->>Life: validate: in_progress -> completed
    Life->>EB: commission_status: completed

    Orch->>Work: finalize(project, id)
    Work->>Work: commit uncommitted work
    Work->>Work: squash-merge into claude branch
    Work->>Work: delete activity branch + worktree
    Work-->>Orch: merge success

    Orch->>Orch: delete state file
    Orch->>Orch: sync status to integration
    Orch->>EB: commission_status: completed (final)
    Orch->>Orch: enqueue auto-dispatch
    Orch->>Orch: check dependency transitions
```

## Failure and Recovery

What happens when things go wrong. Three failure paths converge on the same preservation strategy.

```mermaid
flowchart TD
    subgraph Failure Triggers
        A[Session error / SDK crash]
        B[Heartbeat timeout]
        C[Merge conflict]
        D[Daemon crash + restart]
    end

    A --> F[executionFailed]
    B --> F
    C --> F
    D --> R[Crash recovery scan]

    R --> R1[Scan state files]
    R --> R2[Scan orphaned worktrees]
    R1 --> F
    R2 --> F

    F --> P[preserveAndCleanup]
    P --> P1[Commit uncommitted work]
    P --> P2[Remove worktree]
    P --> P3[Keep activity branch]

    P1 --> S[Sync failed status to integration]
    P2 --> S
    P3 --> S

    S --> Q{User decision}
    Q -->|Redispatch| RD[New branch + attempt]
    Q -->|Abandon| AB[Terminal state]
    Q -->|Inspect branch| IN[Manual recovery]
```

## Git Isolation

Three locations involved in a commission's git lifecycle, and when each is written.

```mermaid
flowchart LR
    subgraph Integration Worktree
        IW["~/.guild-hall/projects/{project}/claude/"]
        IW_A[".lore/commissions/{id}.md"]
    end

    subgraph Activity Worktree
        AW["~/.guild-hall/worktrees/{project}/commission-{id}/"]
        AW_F["Worker's file changes"]
        AW_A[".lore/commissions/{id}.md"]
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
    subgraph "Layer 4: Orchestrator"
        O[Orchestrator]
        O_cap[Capacity management]
        O_auto[Auto-dispatch]
        O_crash[Crash recovery]
        O_dep[Dependency transitions]
    end

    subgraph "Layer 2: Lifecycle"
        L[Lifecycle]
        L_sm[State machine validation]
        L_tl[Timeline append]
        L_ev[Event emission]
    end

    subgraph "Layer 3: Workspace"
        W[Workspace]
        W_br[Branch creation]
        W_wt[Worktree management]
        W_mg[Squash-merge]
    end

    subgraph "Layer 1: Record"
        R[Record]
        R_fm[Frontmatter I/O]
        R_tl[Timeline serialization]
    end

    subgraph "Shared: SDK Runner"
        S[SDK Runner]
        S_prep[Prepare session]
        S_run[Run session]
        S_drain[Drain events]
    end

    O --> L
    O --> W
    O --> S
    L --> R
    W -.->|never| R
    S -.->|never| R
    S -.->|never| W
```

## Reading the Diagram

The state machine (first diagram) is the contract. All other flows are implementations of transitions in that state machine.

The dispatch-to-completion sequence shows the "normal" case. Every participant maps to a specific module in `daemon/services/commission/`. The orchestrator is the only module that talks to all layers; layers never cross-reference each other.

The failure flowchart shows that all failure paths converge: commit partial work, remove the worktree, keep the branch. This is deliberate. No work is ever silently lost.

## Key Insights

- **Dispatched is transient.** The gap between `dispatched` and `in_progress` is just workspace preparation (branch + worktree creation). If that fails, the commission goes directly to `failed` without ever running the SDK.
- **Result submission is the fork.** The session ending with `resultSubmitted = true` goes to `completed`; without it, `failed`. The worker must explicitly call `submit_result` for success.
- **Merge conflict is a failure, not a block.** When a squash-merge has non-`.lore/` conflicts, the commission fails and the Guild Master is asked to help. The branch is preserved for manual resolution.
- **Crash recovery is pessimistic.** On restart, every interrupted commission becomes `failed`. No attempt to resume. The user can redispatch, which creates a fresh branch (with attempt suffix) while preserving the old one.
- **Heartbeat prevents zombies.** A 3-minute timeout (reset on any tool call) catches sessions where the SDK hangs or the worker loops without producing output.

## Not Shown

- **Dependency auto-transition details.** When an artifact is created or removed, the orchestrator scans all blocked/pending commissions. The scan logic and matching rules aren't visualized here.
- **Capacity queuing internals.** When at capacity, commissions stay pending and auto-dispatch fires when capacity opens. The FIFO ordering and queue management aren't shown.
- **Manager worker's programmatic commission creation.** The Guild Master can create and dispatch commissions through the same interface as routes, but the coordination logic (batching, sequencing) lives in the manager worker's posture.
- **EventBus subscription lifecycle.** How SSE clients subscribe, receive events, and reconnect.
- **Toolbox resolution.** How base, context, system, and domain toolboxes compose for a commission. This deserves its own diagram.

## Related

- `.lore/specs/commissions.md` for requirements and REQ IDs
- `.lore/specs/system.md` for system-level architecture
- `daemon/services/commission/orchestrator.ts` for Layer 4 implementation
- `daemon/services/commission/lifecycle.ts` for the state machine
- `daemon/services/commission/workspace.ts` for git isolation
- `daemon/services/sdk-runner.ts` for the shared session infrastructure
