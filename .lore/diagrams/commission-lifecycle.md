---
title: Commission session lifecycle
date: 2026-02-28
status: current
tags: [commissions, lifecycle, state-machine, agent-sdk, process-management]
modules: [daemon, commission-session, commission-toolbox, query-runner, manager-toolbox]
related:
  - .lore/specs/guild-hall-commissions.md
  - .lore/diagrams/system-architecture.md
  - .lore/diagrams/meeting-lifecycle.md
---

# Diagram: Commission Session Lifecycle

## Context

Commissions are autonomous work units dispatched to workers. Unlike meetings (interactive, multi-turn), commissions run to completion without user input. They have a state machine with dependency tracking, capacity management, and crash recovery. This diagram covers creation, dispatch, execution, and the state machine.

## State Machine

```mermaid
stateDiagram-v2
    [*] --> pending: Create commission

    pending --> dispatched: Dispatch (deps satisfied, capacity available)
    pending --> blocked: Dispatch (deps not satisfied)
    pending --> cancelled: User cancels

    blocked --> pending: Dependency completed (auto-transition)
    blocked --> cancelled: User cancels

    dispatched --> in_progress: Worker process starts
    dispatched --> failed: Process failed to start

    in_progress --> completed: Worker submits result + clean exit
    in_progress --> failed: Crash / timeout / exit without result
    in_progress --> cancelled: User cancels (graceful kill)

    completed --> [*]
    failed --> [*]
    cancelled --> [*]

    note right of failed: Branch preserved for inspection.<br/>Partial results kept.<br/>Can be re-dispatched.
    note right of completed: Squash-merged to claude/main.<br/>Worktree removed.
```

## Dispatch and Execution Flow

```mermaid
sequenceDiagram
    participant U as User / Guild Master
    participant API as Next.js API
    participant D as Daemon Routes
    participant CS as CommissionSession
    participant TR as Toolbox Resolver
    participant QR as Query Runner
    participant SDK as Claude Agent SDK
    participant EB as EventBus
    participant FS as Filesystem

    Note over U,FS: === Commission Creation ===

    U->>API: POST /api/commissions {project, worker, prompt, deps}
    API->>D: POST /commissions (Unix socket)
    D->>CS: createCommission(project, worker, prompt, deps)
    CS->>FS: Write commission artifact (.lore/commissions/<id>/)
    CS-->>D: {commissionId, status: pending}
    D-->>U: 201 Created

    Note over U,FS: === Dispatch ===

    U->>API: POST /api/commissions/<id>/dispatch
    API->>D: POST /commissions/<id>/dispatch
    D->>CS: dispatchCommission(commissionId)

    alt Dependencies not satisfied
        CS->>CS: Transition: pending -> blocked
        CS->>EB: emit(commission_status: blocked)
        CS-->>D: {status: blocked}
    else At capacity (too many concurrent)
        CS->>EB: emit(commission_queued)
        CS-->>D: {status: queued}
    else Ready to dispatch
        CS->>CS: Transition: pending -> dispatched
        CS->>FS: Create activity branch (claude/commission/<id>)
        CS->>FS: Create worktree

        CS->>TR: resolveToolSet(worker, packages, context)
        TR-->>CS: {mcpServers, allowedTools}

        CS->>CS: Transition: dispatched -> in_progress
        CS->>FS: Write state file (PID, worktree, branch)

        CS->>QR: query(prompt, options) [background]
        QR->>SDK: query(systemPrompt + prompt, {tools, cwd})
        CS-->>D: 202 Accepted
        D-->>U: {status: dispatched}
    end

    Note over U,FS: === Worker Execution (background) ===

    loop Worker runs autonomously
        SDK->>SDK: Execute tools, write files

        opt Worker reports progress
            SDK-->>QR: tool_use: report_progress
            QR-->>CS: progress update
            CS->>FS: Update commission timeline
            CS->>EB: emit(commission_progress)
            EB-->>U: SSE: progress update
        end

        opt Worker logs a question
            SDK-->>QR: tool_use: log_question
            QR-->>CS: question logged
            CS->>EB: emit(commission_question)
            EB-->>U: SSE: question notification
        end
    end

    alt Worker submits result (success)
        SDK-->>QR: tool_use: submit_result
        QR-->>CS: result submitted
        SDK-->>QR: turn_end (clean exit)

        CS->>CS: Transition: in_progress -> completed
        CS->>FS: Write result to commission artifact
        CS->>FS: Squash-merge activity branch into claude/main
        CS->>FS: Remove worktree
        CS->>FS: Remove state file
        CS->>EB: emit(commission_result)
        EB-->>U: SSE: commission completed

        CS->>CS: Check queued commissions, dispatch next
    else Worker crashes or times out
        SDK-->>QR: error / process exit / heartbeat stale

        CS->>CS: Transition: in_progress -> failed
        CS->>FS: Commit partial work to activity branch
        CS->>FS: Remove worktree (keep branch)
        CS->>FS: Remove state file
        CS->>EB: emit(commission_status: failed)
        EB-->>U: SSE: commission failed
    end

    Note over U,FS: === Re-dispatch (after failure) ===

    U->>API: POST /api/commissions/<id>/redispatch
    API->>D: POST /commissions/<id>/redispatch
    D->>CS: redispatchCommission(id)
    CS->>CS: Fresh branch, fresh worktree, timeline carries history
```

## Dependency Auto-Transition

```mermaid
sequenceDiagram
    participant CS as CommissionSession
    participant EB as EventBus
    participant FS as Filesystem

    Note over CS,FS: Commission B depends on Commission A

    CS->>CS: Commission A completes
    CS->>EB: emit(commission_result: A)

    CS->>CS: Check: any blocked commissions depend on A?
    CS->>CS: Commission B found, all deps now satisfied
    CS->>CS: Transition B: blocked -> pending
    CS->>CS: Auto-dispatch B (if capacity available)
    CS->>FS: Create worktree for B
    CS->>EB: emit(commission_status: B dispatched)
```

## Manager Creates Commission (Guild Master Flow)

```mermaid
sequenceDiagram
    participant U as User
    participant MS as MeetingSession
    participant GM as Guild Master (in meeting)
    participant MT as Manager Toolbox
    participant CS as CommissionSession
    participant EB as EventBus

    U->>MS: "Break this feature into tasks and dispatch them"
    MS->>GM: User prompt delivered

    GM->>MT: tool: create_commission {worker: Developer, prompt: "..."}
    MT->>CS: createCommission(project, developer, prompt)
    CS-->>MT: {commissionId, status: pending}
    MT->>CS: dispatchCommission(commissionId)
    CS->>EB: emit(commission_status: dispatched)
    MT-->>GM: Commission dispatched

    GM->>MT: tool: create_commission {worker: Test Engineer, prompt: "...", deps: [prev_id]}
    MT->>CS: createCommission(project, test-engineer, prompt, deps)
    CS-->>MT: {commissionId, status: pending}
    MT->>CS: dispatchCommission(commissionId)
    CS->>CS: Deps not satisfied -> blocked
    CS->>EB: emit(commission_status: blocked)
    MT-->>GM: Commission blocked (waiting on dependency)

    GM-->>U: "Created 2 commissions. Developer is working, Test Engineer will start when Developer finishes."
```

## Reading the Diagrams

**Commissions are fire-and-forget.** Unlike meetings, the user doesn't send follow-up messages. The worker runs autonomously and reports progress via the commission toolbox (report_progress, log_question, submit_result). The user watches via SSE events.

**The state machine has two interesting paths.** The happy path (pending -> dispatched -> in_progress -> completed) is straightforward. The interesting path is dependency blocking: a commission can be dispatched but transition to `blocked` if its dependencies aren't complete. When a dependency completes, the blocked commission auto-transitions to `pending` and auto-dispatches.

**The Guild Master is the orchestrator.** In a meeting, the Guild Master uses the manager toolbox to create and dispatch commissions, chain them with dependencies, and report back to the user. This is the primary way complex work gets decomposed: user describes what they want, Guild Master breaks it into commissions across workers.

**Capacity management is FIFO.** When the concurrent commission limit is reached, new dispatches queue up. When a slot opens (commission completes or fails), the next queued commission dispatches automatically.

## Key Insights

- Commissions run as background SDK sessions (non-blocking to the HTTP request that dispatched them). The daemon returns 202 Accepted immediately.
- Failed commissions keep their activity branch for inspection. The timeline artifact records what happened. Re-dispatch creates a fresh branch and worktree but carries the timeline history forward.
- The manager toolbox is the bridge between meetings and commissions. It's only available to the Guild Master, enforcing the coordination model.
- Progress reports double as heartbeats. If no report_progress call arrives within the staleness threshold (180s), the commission is considered stale/failed.

## Not Shown

- Specific tools available to workers during execution
- Memory injection and worker activation details (see system architecture diagram)
- Sparse checkout configuration per worker
- PR creation flow (manager toolbox's create_pr tool)
- User adding notes to in-progress commissions

## Related

- [Commission Spec](.lore/specs/guild-hall-commissions.md): full requirements and REQ IDs
- [System Architecture](.lore/diagrams/system-architecture.md): where commissions fit in the overall system
- [Meeting Lifecycle](.lore/diagrams/meeting-lifecycle.md): the interactive session type
