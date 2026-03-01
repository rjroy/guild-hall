---
title: Meeting session lifecycle
date: 2026-02-28
status: current
tags: [meetings, lifecycle, sequence, agent-sdk, streaming]
modules: [daemon, meeting-session, meeting-toolbox, query-runner]
related:
  - .lore/specs/guild-hall-meetings.md
  - .lore/diagrams/system-architecture.md
  - .lore/diagrams/commission-lifecycle.md
---

# Diagram: Meeting Session Lifecycle

## Context

Meetings are interactive, multi-turn conversations between a user and a worker. They persist across daemon restarts via SDK session resumption. This diagram traces the full lifecycle: creation, conversation turns, and close.

## Diagram

```mermaid
sequenceDiagram
    participant U as User (Browser)
    participant API as Next.js API
    participant D as Daemon Routes
    participant MS as MeetingSession
    participant TR as Toolbox Resolver
    participant QR as Query Runner
    participant SDK as Claude Agent SDK
    participant EB as EventBus
    participant FS as Filesystem

    Note over U,FS: === Meeting Creation ===

    U->>API: POST /api/meetings {project, worker, prompt}
    API->>D: POST /meetings (Unix socket)
    D->>MS: createMeeting(project, worker, prompt)

    MS->>FS: Write meeting artifact (.lore/meetings/<id>.md)
    MS->>FS: Create activity branch (claude/meeting/<id>)
    MS->>FS: Create worktree

    MS->>TR: resolveToolSet(worker, packages, context)
    TR-->>MS: {mcpServers, allowedTools}

    MS->>QR: query(prompt, options)
    QR->>SDK: query(prompt, {systemPrompt, tools, cwd})

    loop SDK streaming response
        SDK-->>QR: SDKMessage (text_delta, tool_use, etc.)
        QR-->>MS: GuildHallEvent
        MS->>EB: emit(event)
        EB-->>D: broadcast
        D-->>API: SSE event
        API-->>U: SSE event (renders in UI)
    end

    SDK-->>QR: turn_end + session_id
    MS->>FS: Persist state file (session_id, worktree, branch)
    MS->>EB: emit(meeting_started)

    Note over U,FS: === Follow-up Turn ===

    U->>API: POST /api/meetings/<id>/messages {message}
    API->>D: POST /meetings/<id>/messages
    D->>MS: sendMessage(meetingId, message)

    MS->>QR: query(message, {resume: session_id})
    QR->>SDK: query(message, {resume: session_id})

    loop SDK streaming response
        SDK-->>QR: SDKMessage
        QR-->>MS: GuildHallEvent
        MS->>EB: emit(event)
        EB-->>D: broadcast
        D-->>API: SSE event
        API-->>U: SSE event
    end

    Note over U,FS: === Session Expiry (if SDK session too old) ===

    U->>API: POST /api/meetings/<id>/messages {message}
    API->>D: POST /meetings/<id>/messages
    D->>MS: sendMessage(meetingId, message)
    MS->>QR: query(message, {resume: session_id})
    QR->>SDK: query() -- session expired
    SDK-->>QR: error: session not found

    MS->>MS: Build context summary from prior conversation
    MS->>QR: query(summary + message, {new session})
    QR->>SDK: query(context + message, {fresh options})
    SDK-->>QR: new session_id
    MS->>FS: Update state file with new session_id

    Note over U,FS: === Meeting Close ===

    U->>API: DELETE /api/meetings/<id>
    API->>D: DELETE /meetings/<id>
    D->>MS: closeMeeting(meetingId)

    MS->>QR: Generate meeting notes (summary, decisions, artifacts)
    MS->>FS: Write notes to meeting artifact
    MS->>FS: Squash-merge activity branch into claude/main
    MS->>FS: Remove worktree
    MS->>FS: Remove state file
    MS->>EB: emit(meeting_ended)
    EB-->>U: SSE: meeting_ended
```

## State Transitions

```mermaid
stateDiagram-v2
    [*] --> requested: Manager proposes meeting
    [*] --> open: User creates meeting directly

    requested --> open: User accepts
    requested --> declined: User declines

    open --> closed: User closes meeting

    closed --> [*]
    declined --> [*]
```

## Reading the Diagram

**Two creation paths.** Users can create meetings directly (starts as `open`) or the Guild Master can propose a meeting via the manager toolbox (starts as `requested`, user must accept).

**SDK session persistence is the key mechanism.** Each meeting stores a `session_id` from the Claude Agent SDK. Follow-up messages use `resume: session_id` to continue the same conversation context. This persists across daemon restarts because the SDK stores session state server-side.

**Session expiry is handled gracefully.** If the SDK session is too old to resume, the meeting session builds a context summary from the prior conversation and starts a fresh SDK session, injecting the summary so the worker has continuity.

**Streaming is end-to-end.** SDK messages flow through the query runner, meeting session, EventBus, daemon routes, Next.js API proxy, and into the browser as SSE events. Every layer passes through without buffering.

## Key Insights

- Meeting artifacts (`.lore/meetings/<id>.md`) are the durable record. State files (`~/.guild-hall/state/meetings/<id>.json`) are machine-local recovery state only.
- The activity worktree gives the worker an isolated workspace. Any file changes during the meeting are committed to `claude/meeting/<id>` and squash-merged on close.
- Interruption (`POST /meetings/<id>/interrupt`) cancels the current SDK generation via AbortController but keeps the meeting open.
- Workers in meetings get the meeting toolbox automatically (link_artifact, propose_followup, summarize_progress) via the toolbox resolver's context-based auto-add.

## Not Shown

- Meeting request flow (manager proposes, user accepts/declines/defers)
- Quick-comment injection during active generation
- Specific tool calls the worker makes during the meeting
- Memory injection at activation time

## Related

- [Meeting Spec](.lore/specs/guild-hall-meetings.md): full requirements
- [System Architecture](.lore/diagrams/system-architecture.md): where meetings fit in the overall system
- [Commission Lifecycle](.lore/diagrams/commission-lifecycle.md): the other session type
