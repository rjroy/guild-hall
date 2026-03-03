---
title: Meetings
date: 2026-03-01
status: current
tags: [meetings, interactive-sessions, state-machine, lifecycle, sse]
modules: [daemon-services, daemon-routes, lib-meetings, web-meeting]
---

# Feature: Meetings

## What It Does

Meetings (called "audiences" in the UI) are interactive, synchronous sessions between a user and an AI worker. The user opens a meeting with a worker, chats in real time via SSE streaming, and the worker operates in an isolated git worktree. When the meeting closes, the daemon generates AI-summarized notes from the transcript, squash-merges any artifacts back to the `claude` branch, and cleans up. Workers can also propose follow-up meetings, creating new meeting request artifacts that appear on the dashboard.

## Capabilities

- **Create meeting**: Opens a direct meeting with a chosen worker. Writes the artifact with status "open" on the integration worktree, then injects into the machine to set up git infrastructure.
- **Accept meeting request**: Accepts a meeting request created by a worker (e.g., Guild Master merge conflict escalation, or a follow-up proposal). Transitions `requested -> open`.
- **Decline meeting request**: Declines a pending request. Transitions `requested -> declined` via the machine.
- **Defer meeting request**: Updates the `deferred_until` field on a requested meeting without changing status.
- **Send message**: Sends a follow-up message to an open meeting. Resumes the existing SDK session. If the session has expired, automatically renews with transcript context.
- **Interrupt**: Aborts the current SDK generation mid-turn via the AbortController.
- **Close meeting**: Transitions `open -> closed`. Generates notes from transcript, writes notes to artifact, squash-merges, and cleans up.
- **Live chat**: SSE streaming of SDK events (text deltas, tool use, tool results, turn end, errors) to the browser in real time.
- **Session resume**: If the browser is refreshed, the meeting page parses the stored transcript back into chat messages so the user sees conversation history.
- **Session renewal**: When an SDK session expires between turns, the daemon creates a fresh session with truncated transcript context injected as the prompt, preserving conversational continuity.

## State Machine

```
requested  -> open, declined
open       -> closed
closed     -> (terminal)
declined   -> (terminal)
```

**Active states**: `open` (consumes a meeting slot, has a worktree and SDK session).

**Cleanup states**: `closed`, `declined` (machine cleans up after enter handler completes).

**Capacity**: Per-project meeting cap (default 5, configurable via `meetingCap` in config). Enforced atomically under `withProjectLock` to prevent TOCTOU races between concurrent creates/accepts.

## Meeting Artifact

Each meeting is a markdown file at `{project}/.lore/meetings/{meetingId}.md` with YAML frontmatter. The ID format is `audience-{workerName}-{YYYYMMDD}-{HHMMSS}`.

Frontmatter fields:
- `title`, `status`, `worker`, `workerDisplayTitle`, `agenda`
- `date` (creation date)
- `deferred_until` (ISO timestamp or empty string)
- `linked_artifacts: []` (paths to artifacts associated during the meeting)
- `meeting_log:` (append-only list of timestamped events)
- `notes_summary:` (AI-generated summary written at close)

The artifact file is written using template literals (not gray-matter stringify) to avoid YAML reformatting noise, following the same pattern as commissions.

## Transcript System

Transcripts are stored at `~/.guild-hall/meetings/{meetingId}.md` during the meeting. They capture the full conversation in a markdown format:

```
## User (timestamp)
message content

## Assistant (timestamp)
response content
> Tool: tool_name
> result lines
```

The transcript serves three purposes:
1. **Notes generation**: Read at close time to generate AI-summarized meeting notes.
2. **Session resume**: Parsed by `parseTranscriptToMessages()` in `lib/meetings.ts` back into `ChatMessage` objects when the browser refreshes during an open meeting.
3. **Session renewal**: When the SDK session expires, the transcript is truncated and injected as context for the fresh session.

Transcripts are removed after close if notes generation succeeds. If notes generation fails, the transcript is preserved for manual review.

## Git Infrastructure

Each open meeting gets:
1. An activity branch forked from `claude` (e.g., `audience-Developer-20260301-120000`)
2. An activity worktree at `~/.guild-hall/worktrees/{project}/{meetingId}/`
3. Sparse checkout (`.lore/` only) applied to the worktree

On close:
- Notes generated from transcript
- Squash-merge into `claude` via `finalizeActivity()` under a project lock
- Success: state file deleted, worktree cleaned up, transcript removed
- Merge conflict (non-`.lore/` files): branch preserved, escalated to Guild Master via meeting request

Direct creation writes the artifact to the integration worktree first (so it's visible immediately), then the enter-open handler creates the branch/worktree from that state. Accepting a request inherits the artifact from the integration worktree (it was already committed to `claude`).

## Machine-Local State

State files at `~/.guild-hall/state/meetings/{meetingId}.json` track open meetings across daemon restarts. Fields: meetingId, projectName, workerName, packageName, sdkSessionId, worktreeDir, branchName, status.

**Crash recovery** on daemon startup (`recoverMeetings`):
- Reads state files for open meetings
- If worktree still exists: registers entry into the machine as active (no enter handler re-run). SDK session can be resumed via sendMessage.
- If worktree is missing: updates artifact to "closed" on integration worktree with "Worktree lost during daemon restart" log entry.
- Meetings for projects no longer in config are skipped.

## Entry Points

| Entry | Type | Handler |
|-------|------|---------|
| POST /meetings | Daemon | `daemon/routes/meetings.ts` -> `meetingSession.createMeeting()` |
| POST /meetings/:id/messages | Daemon | `daemon/routes/meetings.ts` -> `meetingSession.sendMessage()` |
| DELETE /meetings/:id | Daemon | `daemon/routes/meetings.ts` -> `meetingSession.closeMeeting()` |
| POST /meetings/:id/interrupt | Daemon | `daemon/routes/meetings.ts` -> `meetingSession.interruptTurn()` |
| POST /meetings/:id/accept | Daemon | `daemon/routes/meetings.ts` -> `meetingSession.acceptMeetingRequest()` |
| POST /meetings/:id/decline | Daemon | `daemon/routes/meetings.ts` -> `meetingSession.declineMeeting()` |
| POST /meetings/:id/defer | Daemon | `daemon/routes/meetings.ts` -> `meetingSession.deferMeeting()` |
| /projects/[name]/meetings/[id] | Page | `web/app/projects/[name]/meetings/[id]/page.tsx` |
| /api/meetings/* | Next.js API | Proxy routes to daemon (8 route files) |
| POST /api/meetings/[id]/quick-comment | Next.js API | Compound: creates commission from meeting request, then declines the meeting |

## Implementation

### Files Involved

| File | Role |
|------|------|
| `daemon/routes/meetings.ts` | Thin route layer, validates input, streams SSE responses. Defines `MeetingSessionForRoutes` interface. |
| `daemon/services/meeting-session.ts` | Orchestration core: CRUD, SDK session runner, session renewal, transcript context injection, crash recovery. Builds the ActivityMachine with meeting-specific handler deps. |
| `daemon/services/meeting/orchestrator.ts` | Meeting lifecycle flows: open, close, decline, defer. Sequential steps over injected dependencies. |
| `daemon/services/meeting/record.ts` | Meeting artifact record operations: create, update status, append log, linked artifacts. |
| `daemon/services/meeting/registry.ts` | Active meeting registry: lookup, counting, concurrent-close guard. |
| `daemon/services/meeting-toolbox.ts` | Meeting-context MCP tools (see Workers/Toolbox feature). |
| `daemon/services/transcript.ts` | Transcript CRUD: `createTranscript`, `appendUserTurn`, `appendAssistantTurn`, `readTranscript`, `removeTranscript`. |
| `daemon/services/notes-generator.ts` | AI-generated meeting notes from transcript + artifact context. |
| `daemon/services/query-runner.ts` | Shared SDK query execution and event translation. `runQueryAndTranslate` yields `GuildHallEvent` from `SDKMessage` stream. Handles session expiry detection. |
| `lib/meetings.ts` | Read-only scanning/parsing for Next.js: `MeetingMeta`, `scanMeetings`, `scanMeetingRequests`, `getActiveMeetingWorktrees`, `parseTranscriptToMessages`. |
| `lib/paths.ts` | Path resolution (meeting worktree, branch names). |
| `web/app/projects/[name]/meetings/[id]/page.tsx` | Server component: reads artifact, parses transcript for session resume, resolves linked artifact existence and hrefs. |
| `web/components/meeting/MeetingView.tsx` | Client wrapper: composes ChatInterface + ArtifactsPanel + close button. Manages close flow (DELETE, show notes). |
| `web/components/meeting/ChatInterface.tsx` | Core chat UI: SSE streaming, message parsing (`parseSSEBuffer`), stop button (abort + POST /interrupt), session resume from sessionStorage or transcript. |
| `web/components/meeting/MessageBubble.tsx` | Renders individual chat messages with markdown. |
| `web/components/meeting/StreamingMessage.tsx` | Renders the in-progress assistant message during streaming. |
| `web/components/meeting/MessageInput.tsx` | Chat input with submit handling. |
| `web/components/meeting/ToolUseIndicator.tsx` | Shows tool use status during streaming. |
| `web/components/meeting/ArtifactsPanel.tsx` | Sidebar panel listing linked artifacts. |
| `web/components/meeting/NotesDisplay.tsx` | Post-close view showing generated notes with link back to project. |
| `web/components/meeting/MeetingHeader.tsx` | Header showing worker name and meeting metadata. |
| `web/components/meeting/ErrorMessage.tsx` | Error display within the chat interface. |

### Data

- **Meeting artifacts**: `{project}/.lore/meetings/{meetingId}.md` (markdown + YAML frontmatter)
- **Transcripts**: `~/.guild-hall/meetings/{meetingId}.md` (markdown, ephemeral, removed after close)
- **State files**: `~/.guild-hall/state/meetings/{meetingId}.json` (machine-local, ephemeral)
- **Config**: `~/.guild-hall/config.yaml` (`meetingCap` per project)

### Dependencies

- Uses: [workers/toolbox](./workers-toolbox.md) (meeting toolbox provides `link_artifact`, `propose_followup`, `summarize_progress`)
- Uses: EventBus (SSE event delivery to browser)
- Uses: ActivityMachine (generic state machine shared with commissions)
- Uses: Git operations (worktree creation, sparse checkout, squash-merge, branch management)
- Uses: Claude Agent SDK (`query()` for sessions, session resume, session renewal)
- Uses: Memory system (`loadMemories`, `triggerCompaction` for worker memory injection)
- Used by: Dashboard (pending meeting requests, "audiences" section)
- Used by: Project View (meetings tab)
- Used by: [commissions](./commissions.md) (merge conflict escalation creates Guild Master meeting requests; meeting merges trigger commission dependency checks)

## Connected Features

| Feature | Relationship |
|---------|-------------|
| [commissions](./commissions.md) | Merge conflict escalation creates meeting requests. Meeting merges trigger `checkDependencyTransitions` for blocked commissions. |
| [workers-toolbox](./workers-toolbox.md) | Meeting toolbox provides context-specific tools during active sessions. |
| Dashboard | Shows pending meeting requests for accept/decline/defer. |
| Project View | Meetings tab lists all meetings for a project. |

## Implementation Status

| Layer | Status | Notes |
|-------|--------|-------|
| Backend API | Complete | All 7 daemon routes + crash recovery + session renewal |
| Frontend UI | Complete | Chat interface with SSE streaming, artifacts panel, close flow, session resume |
| Tests | Complete | Part of the 1529 tests passing across the project |

## Notes

- **Two creation paths**: `createMeeting` uses `machine.inject()` (direct entry at "open" state, sourceState=null). `acceptMeetingRequest` uses `machine.register()` + `machine.transition("requested" -> "open")`. The enter-open handler distinguishes these via `ctx.sourceState`.
- **TOCTOU prevention**: `trackedEntries` Map runs parallel to the machine's active set. Cap checks and registration happen atomically under `withProjectLock`. The `trackedEntries` lookup counts non-terminal entries, so an entry registered in the lock but not yet injected/transitioned into the machine still counts toward the cap.
- **Decline and defer operate outside the machine for different reasons**: Decline registers a temporary entry, transitions through the machine, then cleans up immediately. Defer only updates the artifact frontmatter without changing status, so it never enters the machine.
- **Session renewal**: When the SDK session expires between turns, `sendMessage` detects a "session_expired" outcome from `runQueryAndTranslate`, reads and truncates the transcript, and calls `startSession` with the transcript as the prompt. The transcript already contains the current user turn.
- **Notes generation failure handling**: If notes generation fails, the error reason is written to the artifact's `notes_summary` field instead, and the transcript is preserved (not removed) for manual review.
- **Merge conflict escalation**: Same pattern as commissions. Non-`.lore/` conflicts are escalated to the Guild Master via a `createMeetingRequest` callback. The branch is preserved for manual resolution.
- **quick-comment route**: The `POST /api/meetings/[id]/quick-comment` Next.js API route is a compound operation that creates a commission from a meeting request's agenda, then declines the meeting. This converts a synchronous meeting request into an async commission. Documented here for entry point completeness, but it bridges meetings and commissions.
