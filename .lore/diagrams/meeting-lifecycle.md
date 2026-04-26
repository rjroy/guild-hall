---
title: Meeting lifecycle
date: 2026-03-03
status: current
tags: [meetings, lifecycle, state-machine, architecture, streaming]
modules: [meeting-orchestrator, meeting-registry, workspace, sdk-runner]
related:
  - .lore/specs/meetings/guild-hall-meetings.md
  - .lore/specs/infrastructure/guild-hall-system.md
  - .lore/diagrams/commission-lifecycle.md
---

# Diagram: Meeting Lifecycle

## Context

Meetings are synchronous, multi-turn interactions between a user and a worker. Unlike commissions (fire-and-forget), meetings stream responses in real time and persist conversation state across SDK sessions. This diagram answers: how does a meeting move from creation to close, what happens during each turn, and how does crash recovery restore state?

## State Machine

Four states. Two entry paths (user-initiated skips `requested`). Two terminal states.

```mermaid
stateDiagram-v2
    [*] --> requested: worker requests

    requested --> open: user accepts
    requested --> declined: user declines
    requested --> requested: user defers (updates deferred_until)

    [*] --> open: user creates directly

    open --> closed: user closes

    declined --> [*]
    closed --> [*]
```

### State Ownership

| State | Who triggers the transition |
|-------|---------------------------|
| requested | Worker or Guild Master creates meeting artifact |
| open | User (createMeeting or acceptMeetingRequest) |
| closed | User (closeMeeting) |
| declined | User (declineMeeting) |

## Create and Accept Flow

Two paths into `open`. User-created meetings skip the request phase entirely; accepted meetings read an existing artifact.

```mermaid
sequenceDiagram
    participant User
    participant Routes as Routes (HTTP)
    participant Orch as Orchestrator
    participant Reg as Registry
    participant Work as Workspace
    participant SDK as SDK Runner
    participant EB as EventBus

    alt User creates meeting
        User->>Routes: POST /meetings
        Routes->>Orch: createMeeting(project, worker, prompt)
    else User accepts request
        User->>Routes: POST /meetings/:id/accept
        Routes->>Orch: acceptMeetingRequest(id, project)
        Orch->>Orch: read existing artifact, verify status=requested
    end

    rect rgb(240, 240, 255)
        Note over Orch,Reg: Under project lock
        Orch->>Reg: countForProject(project)
        Reg-->>Orch: count (must be < cap)
        Orch->>Orch: write/update meeting artifact (status: open)
        Orch->>Reg: register(meetingId)
    end

    Note over Orch,Work: Lock released

    Orch->>Work: prepare(project, meetingId)
    Work->>Work: create activity branch from claude
    Work->>Work: create worktree (sparse or full)
    Work-->>Orch: { worktreeDir, branchName }

    Orch->>Orch: write artifact to activity worktree
    Orch->>Orch: create transcript file
    Orch->>Orch: write state file

    Orch->>SDK: prepareSdkSession(worker, tools, memory)
    Orch->>SDK: runSdkSession(prompt) [streaming]
    SDK-->>Orch: init message (captures sdkSessionId)

    loop Streaming response
        SDK->>EB: text_delta, tool_use, tool_result
        EB->>User: SSE events
    end

    SDK-->>Orch: turn complete
    Orch->>Orch: append assistant turn to transcript
    Orch->>Orch: update state file with sdkSessionId
    Orch->>EB: meeting_started
    Orch-->>Routes: SSE stream (session + response events)
    Routes-->>User: streamed response
```

## Multi-Turn Conversation

Each user message is a new HTTP request. The SDK session is resumed when possible, renewed when expired.

```mermaid
sequenceDiagram
    participant User
    participant Routes as Routes (HTTP)
    participant Orch as Orchestrator
    participant Reg as Registry
    participant SDK as SDK Runner
    participant EB as EventBus

    User->>Routes: POST /meetings/:id/message
    Routes->>Orch: sendMessage(meetingId, message)
    Orch->>Reg: get(meetingId)
    Reg-->>Orch: ActiveMeetingEntry

    Orch->>Orch: append user turn to transcript

    alt sdkSessionId exists
        Orch->>SDK: prepareSdkSession(resume: sdkSessionId)
    else sdkSessionId is null (after restart)
        Orch->>SDK: prepareSdkSession(context: transcript)
    end

    Orch->>SDK: runSdkSession(message) [streaming]

    loop Streaming response
        SDK->>EB: text_delta, tool_use, tool_result
        EB->>User: SSE events
    end

    alt Session expired mid-turn
        SDK-->>Orch: session expiry error
        Note over Orch,SDK: Session renewal
        Orch->>Orch: read + truncate transcript
        Orch->>SDK: startSession(previousContext: transcript)
        SDK-->>Orch: new sdkSessionId
        Orch->>Orch: log renewal in meeting artifact
    end

    SDK-->>Orch: turn complete
    Orch->>Orch: append assistant turn to transcript
    Orch->>Orch: update state file
    Orch-->>Routes: SSE stream
    Routes-->>User: streamed response
```

## Close Meeting

User-initiated close. Notes generation, artifact update, workspace merge, cleanup.

```mermaid
sequenceDiagram
    participant User
    participant Routes as Routes (HTTP)
    participant Orch as Orchestrator
    participant Reg as Registry
    participant Work as Workspace
    participant GM as Guild Master
    participant EB as EventBus

    User->>Routes: POST /meetings/:id/close
    Routes->>Orch: closeMeeting(meetingId)
    Orch->>Reg: acquireClose(meetingId)
    Reg-->>Orch: true (or false if already closing)

    Orch->>Orch: abort running SDK session
    Orch->>Orch: set status = closed

    Orch->>Orch: generateMeetingNotes(transcript, worker)
    Orch->>Orch: update artifact (status: closed, notes, log)

    Orch->>Work: finalize(project, meetingId)
    Work->>Work: commit activity worktree
    Work->>Work: squash-merge into claude branch

    alt Merge succeeds
        Work->>Work: delete worktree + activity branch
        Work-->>Orch: { merged: true }
        Orch->>Orch: delete state file
        Orch->>Reg: deregister(meetingId)
        Orch->>Orch: check blocked commissions
    else Merge conflict (non-.lore/ files)
        Work->>Work: delete worktree, keep branch
        Work-->>Orch: { merged: false, reason }
        Orch->>GM: escalate conflict
        Orch->>Orch: delete state file
        Orch->>Reg: deregister(meetingId)
    end

    Orch->>Orch: delete transcript (if notes succeeded)
    Orch->>EB: meeting_ended
    Orch-->>Routes: close result
    Routes-->>User: 200 OK
```

## Crash Recovery

On daemon restart, open meetings are re-registered with null session IDs. The next user message starts a fresh SDK session with transcript context.

```mermaid
flowchart TD
    Start[Daemon starts] --> Scan["Scan ~/.guild-hall/state/meetings/*.json"]
    Scan --> Each{For each state file}

    Each --> Check1{status == open?}
    Check1 -->|No| Skip[Skip file]

    Check1 -->|Yes| Check2{Project in config?}
    Check2 -->|No| Skip

    Check2 -->|Yes| Check3{Worktree exists?}
    Check3 -->|No| Stale[Close as stale, delete state file, emit meeting_ended]

    Check3 -->|Yes| Recover["Re-register with sdkSessionId: null"]
    Recover --> Ready["Awaiting next user message"]
    Ready --> Resume["sendMessage detects null session, starts fresh with transcript context"]
```

## Two ID Namespaces

One meeting can have multiple SDK sessions over its lifetime. These IDs must never be mixed.

```mermaid
flowchart LR
    subgraph Guild Hall
        MID["MeetingId<br/>(audience-worker-timestamp)"]
        ART["Meeting Artifact<br/>(.lore/meetings/)"]
        STATE["State File<br/>(~/.guild-hall/state/)"]
        TX["Transcript<br/>(~/.guild-hall/meetings/)"]
    end

    subgraph Claude Agent SDK
        SID1["SdkSessionId #1<br/>(conv_...)"]
        SID2["SdkSessionId #2<br/>(conv_... after renewal)"]
        SID3["SdkSessionId #3<br/>(conv_... after restart)"]
    end

    MID --> ART
    MID --> STATE
    MID --> TX
    STATE -->|current binding| SID1
    SID1 -.->|expired| SID2
    SID2 -.->|daemon restart| SID3
```

## Reading the Diagram

The state machine is small (four states, two terminal) because meetings are user-driven. The user opens, the user closes. Workers can request meetings, but only users can accept them.

The sequence diagrams show the three HTTP operations that drive the lifecycle: create/accept (opens), message (each turn), close (merges and cleans up). Each operation is a separate request/response with SSE streaming for real-time events.

The crash recovery flowchart shows the pessimistic approach: SDK sessions are inherently transient, so after a restart, all sessions are lost. The transcript file provides continuity by feeding prior conversation into a fresh session.

## Key Insights

- **No background execution.** Unlike commissions, meetings never run without the user watching. Every SDK call is triggered by a user action (create, accept, message). This makes the lifecycle simpler but adds the session persistence challenge.
- **Session renewal is transparent.** When an SDK session expires mid-turn, the orchestrator silently starts a fresh session with truncated transcript context. The user sees no interruption.
- **Concurrent close guard prevents double cleanup.** `acquireClose()` returns false if a close is already in progress, preventing the race between error-triggered and user-initiated closes from executing cleanup twice.
- **Transcript survives merge failures.** If notes generation fails, the transcript is preserved so the user can manually review the conversation. It's only deleted after successful notes generation.
- **Cap enforcement is atomic.** The count check and registration happen under a project lock, preventing two concurrent create/accept calls from both passing the cap check.

## Not Shown

- **Meeting toolbox details.** Workers have `link_artifact`, `propose_followup`, and `summarize_progress` tools. The tool resolution and composition aren't visualized here.
- **Notes generation internals.** How the transcript is summarized into meeting notes (decisions, artifacts produced, action items).
- **Decline and defer flows.** These are simple artifact updates with no workspace, git, or SDK involvement.
- **EventBus subscription lifecycle.** How SSE clients subscribe, receive events, and reconnect.
- **Worker activation and memory loading.** How the SDK session is configured with worker identity, posture, and memory context.
- **Integration worktree lock contention.** Multiple meetings for the same project share the integration worktree lock during merge.

## Related

- `.lore/specs/meetings/guild-hall-meetings.md` for requirements and REQ IDs
- `.lore/specs/infrastructure/guild-hall-system.md` for system-level architecture
- `.lore/diagrams/commission-lifecycle.md` for the commission equivalent
- `apps/daemon/services/meeting/orchestrator.ts` for the orchestration implementation
- `apps/daemon/services/meeting/registry.ts` for cap enforcement and close guard
- `apps/daemon/services/workspace.ts` for git isolation
- `apps/daemon/services/sdk-runner.ts` for the shared session infrastructure
