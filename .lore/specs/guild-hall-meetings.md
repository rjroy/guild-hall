---
title: Guild Hall Meetings
date: 2026-02-20
status: draft
tags: [architecture, meetings, session-lifecycle, streaming, sync-interaction, toolbox]
modules: [guild-hall-core]
related:
  - .lore/brainstorm/agentic-work-ux.md
  - .lore/specs/guild-hall-system.md
  - .lore/specs/guild-hall-workers.md
  - .lore/specs/guild-hall-commissions.md
  - .lore/design/process-architecture.md
  - .lore/retros/sse-streaming-bug-fix.md
  - .lore/retros/guild-hall-phase-1.md
  - .lore/research/claude-agent-sdk.md
req-prefix: MTG
---

# Spec: Guild Hall Meetings

## Overview

Meetings are the synchronous interaction mode in Guild Hall: the user and a worker talk in real time, centered on producing artifacts. This spec defines the meeting artifact, session lifecycle, meeting toolbox, real-time streaming, meeting notes, artifact production, worker-initiated meeting requests, git integration, and concurrent limits.

A meeting is the counterpart to a commission. Commissions are asynchronous (you describe the work, the worker runs autonomously, you review the deliverable). Meetings are synchronous (you talk to a worker, collaborate on artifacts, leave with something).

Depends on: [Spec: Guild Hall System](guild-hall-system.md) for primitives, storage, activity branches, per-activity worktrees, meeting cap. [Spec: Guild Hall Workers](guild-hall-workers.md) for worker activation, toolbox resolution, session persistence, streaming. Fulfills stubs: REQ-WKR-11 (meeting toolbox), REQ-SYS-9 (meeting lifecycle), REQ-SYS-29a (meeting worktree lifecycle).

## Entry Points

- User starts a meeting with a worker through the UI (from [STUB: views])
- Worker or manager requests a meeting by creating a meeting request artifact (from REQ-WKR-25, REQ-SYS-8)
- User resumes an existing open meeting (from [STUB: views])
- Guild Hall starts up and discovers open meetings with persisted session IDs (from daemon startup)

## Requirements

### Meeting Artifact

- REQ-MTG-1: A meeting is represented by an artifact in the project's `.lore/meetings/` directory. Meeting artifacts use the standard lore frontmatter schema with additional meeting-specific fields.

- REQ-MTG-2: Meeting-specific fields beyond standard frontmatter:
  - **Worker**: which worker package participates in this meeting
  - **Agenda**: why the meeting was called (text description) and referenced artifacts (paths to findings, commissions, or work products that prompted it)
  - **Status**: current meeting state (see Status Transitions)
  - **Session ID**: SDK session identifier for multi-turn persistence (populated after first turn)
  - **Linked artifacts**: artifacts discussed, reviewed, or produced during the meeting (populated during execution)
  - **Meeting log**: chronological log of lifecycle events (status transitions with timestamps and reasons, session renewals, progress summaries from summarize_progress). Append-only during the meeting's life.
  - **Notes summary**: generated summary of the meeting (populated on close)

- REQ-MTG-3: Meeting creation follows the parity principle (REQ-SYS-39): the user creates meetings through the UI, the manager creates meeting requests programmatically, both produce the same meeting artifact file. User-created meetings start as open (REQ-MTG-6); manager-created meetings start as requested.

### Status Transitions

- REQ-MTG-4: Meetings have four states:
  - **requested**: Worker or manager has requested a meeting. Awaiting user response.
  - **open**: Meeting is active. User can send messages and receive responses.
  - **closed**: Meeting explicitly closed by user. Artifacts preserved, transcript cleaned up.
  - **declined**: User declined the meeting request. Referenced artifacts remain available.

- REQ-MTG-5: Valid transitions:
  - requested -> open (user accepts the meeting request)
  - requested -> declined (user declines)
  - open -> closed (user explicitly closes the meeting)

- REQ-MTG-6: User-created meetings skip the requested state and begin as open. The user chose the worker and provided the initial prompt; no acceptance step is needed.

- REQ-MTG-7: Every status transition is recorded in the meeting log with a timestamp and reason.

### Meeting Creation

- REQ-MTG-8: Opening a meeting (whether user-created or accepted from a request) involves:
  1. Verify the per-project concurrent meeting cap is not exceeded (REQ-SYS-8a)
  2. Create or update the meeting artifact in `.lore/meetings/` (status: open)
  3. Create an activity branch from `claude` (naming: `claude/meeting/<meeting-id>`)
  4. Create a worktree under `~/.guild-hall/worktrees/<project>/meeting-<meeting-id>/`
  5. Activate the worker (load package, call activation function with resolved tools and meeting context per REQ-WKR-4a). Meeting context adds meeting-specific data to the standard activation context: meeting ID, agenda text, referenced artifact paths, and the indication that this is a meeting (not a commission).
  6. Create an SDK session via `query()` with the worker's system prompt and the initial prompt. For user-created meetings, the initial prompt is the user's message. For accepted meeting requests, the agenda from the request artifact serves as the initial context; the worker opens the conversation by presenting its findings from the referenced artifacts. The user may provide an additional message on acceptance, appended to the agenda context.
  7. Capture and persist the session_id from the first SDK response

- REQ-MTG-9: If the concurrent meeting cap is reached, the user must close an existing meeting before opening a new one. The system rejects the creation with a clear message identifying the cap and the open meetings.

### Session Lifecycle

- REQ-MTG-10: Meeting sessions are Agent SDK sessions. The first turn creates the session; every subsequent turn resumes it via `options.resume` with the persisted session_id. This is the fundamental multi-turn mechanism, not a recovery feature. Whether the daemon restarted between turns or not, the resumption path is identical.

- REQ-MTG-11: The session_id is persisted in the meeting artifact so it survives daemon restarts. When the user sends a follow-up message, the system reads the session_id from the artifact and passes it via `options.resume`.

- REQ-MTG-12: If an SDK session has expired (too old to resume), the meeting starts a fresh session. The worker's posture, memory, and a summary of prior conversation (from the transcript) are injected into the new session's context. The session renewal is recorded in the meeting log with the old and new session IDs.

- REQ-MTG-13: Meeting sessions persist across multiple sittings (REQ-WKR-20). The user can leave and return days later. Between sittings, the meeting remains open, the session_id is persisted, and the activity branch and worktree are preserved.

### Real-Time Streaming

- REQ-MTG-14: Meeting responses stream incrementally to the user in real time (REQ-WKR-21). Each user message initiates a new turn, and the worker's response streams as incremental events until the turn completes.

- REQ-MTG-15: The event types visible to the UI are:
  - **text_delta**: incremental text content
  - **tool_use**: worker is using a tool (name, input). Informational for UI rendering.
  - **tool_result**: tool completed (name, output summary). Informational.
  - **turn_end**: the worker's response is complete
  - **error**: something went wrong (reason string)

  SDK-internal event types do not surface through the meeting interface.

### Meeting Toolbox

- REQ-MTG-16: The meeting toolbox is a system toolbox injected when a worker participates in a meeting (fulfilling REQ-WKR-11). Workers do not declare it; the meeting system provides it automatically alongside the base toolbox.

- REQ-MTG-17: Meeting toolbox tools:
  - **link_artifact**: Associate an artifact with this meeting. Adds the artifact path to the meeting's linked artifacts list. Used when the meeting discusses, reviews, or produces an artifact.
  - **propose_followup**: Flag that the current topic needs continuation beyond this sitting, optionally with a reason and referenced artifacts. Creates a new meeting request artifact for the same worker with the continuation context.
  - **summarize_progress**: Snapshot the meeting's progress so far. Appends a summary to the meeting's notes. Useful for long meetings spanning multiple sittings to capture intermediate state.

- REQ-MTG-18: The meeting toolbox complements the base toolbox. Workers in meetings have full access to artifact tools, memory tools, and decision recording (REQ-WKR-9) alongside the meeting toolbox and their declared domain toolboxes. The complete tool set follows the resolution order in REQ-WKR-12.

### Meeting Notes and Transcripts

- REQ-MTG-19: Raw meeting transcripts are stored in `~/.guild-hall/meetings/<meeting-id>.md` while the meeting is open. Transcripts are a chronological append of user and assistant turns in markdown, preserving enough structure for session renewal summaries and meeting notes generation. Transcripts are ephemeral (REQ-SYS-30): available during the meeting for context and session renewal, cleaned up after the meeting closes.

- REQ-MTG-20: On meeting close, the system generates meeting notes: a summary of the conversation, decisions made (from the base toolbox's decision recording), and artifacts produced. Notes are written to the meeting artifact's notes_summary field.

- REQ-MTG-21: Meeting notes are the bridge between ephemeral conversation and durable artifacts. You navigate to an artifact and see that a meeting produced it (REQ-SYS-13). The meeting artifact links back to the artifacts, providing context for how and why they were created.

### Meeting Requests

- REQ-MTG-22: Workers and the manager can request meetings by creating meeting request artifacts in `.lore/meetings/`. A request includes: the requesting worker, reason for the meeting, referenced artifacts (findings, completed commissions, blocked work), and proposed agenda.

- REQ-MTG-23: Meeting requests follow the parity principle: a worker creates a meeting request artifact using the base toolbox's artifact tools. The system recognizes it as a meeting request by its location in `.lore/meetings/` and its frontmatter (status: requested). No special request-creation API is needed.

- REQ-MTG-24: The user can accept (transition to open, creating branch/worktree/session), decline (mark as declined), or defer (leave as requested for later). Deferring is the default: requests sit until acted upon. Declining does not discard the referenced artifacts; the findings that prompted the request remain available.

### Git Integration

- REQ-MTG-25: Meeting git operations follow the system spec's activity branch model (REQ-SYS-22, REQ-SYS-29a):
  - Branch: `claude/meeting/<meeting-id>`
  - Worktree: `~/.guild-hall/worktrees/<project>/meeting-<meeting-id>/`
  - Close: squash-merge to `claude`, clean up worktree and transcript
  - Decline: no branch or worktree created (meeting never opened)

- REQ-MTG-26: Worktree checkout scope follows the assigned worker's declaration (REQ-SYS-29): sparse for artifact-only workers, full for workers needing the codebase.

- REQ-MTG-27: Artifacts produced during a meeting are committed to the meeting branch. On close, the squash-merge brings all produced artifacts into `claude` as a single commit.

### Concurrent Limits

- REQ-MTG-28: Per-project concurrent meeting cap (default: 5, configurable in config.yaml per REQ-SYS-8a). Only open meetings count toward the cap. Requested and declined meetings do not.

- REQ-MTG-29: Meetings are closed only on explicit user action. No auto-close, no idle timeout in V1. The infrastructure supports idle timeout (per process architecture design) but it is not specified for this version.

### State Isolation

- REQ-MTG-30: The same worker can be active in a meeting and executing a commission simultaneously (REQ-SYS-10). State isolation is the meeting system's responsibility: each context has its own SDK session, worktree, branch, and tool instances. Memory writes from either context follow the memory model's access rules (REQ-SYS-20) and are visible to the other context on subsequent reads.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Meeting UI | Need to present meetings in the frontend | [STUB: views] |

## Success Criteria

- [ ] Meeting artifacts are created in `.lore/meetings/` with required fields
- [ ] Status transitions follow the defined state machine; invalid transitions are rejected
- [ ] Meeting creation verifies concurrent cap, creates branch/worktree, activates worker, creates SDK session
- [ ] Session persistence across turns via `options.resume` with persisted session_id
- [ ] Expired sessions gracefully start fresh with prior context summary
- [ ] Meeting toolbox (link_artifact, propose_followup, summarize_progress) is injected into worker sessions
- [ ] Real-time streaming delivers incremental events to the UI
- [ ] Meeting notes on close contain: conversation summary, decisions from decision recording, and list of produced artifacts. Transcript file removed from `~/.guild-hall/meetings/`
- [ ] Meeting requests created by workers as artifacts; user can accept/decline/defer
- [ ] Git integration: activity branch, worktree, squash-merge on close
- [ ] Concurrent meeting cap enforced per project
- [ ] State isolation: same worker in meeting + commission has independent sessions, worktrees, branches

## AI Validation

**Defaults:**
- Unit tests with mocked Agent SDK `query()`, filesystem, git operations, and time
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Session lifecycle test: create session (first turn), send follow-up (resume), simulate daemon restart (resume again), verify the same `options.resume` mechanism handles both
- Session expiry test: simulate expired session, verify graceful fallback with prior context injected from transcript
- Meeting toolbox test: link_artifact updates meeting metadata correctly, propose_followup creates new request artifact, summarize_progress appends to notes
- Concurrent cap test: create meetings up to and beyond cap, verify rejection with clear message
- Git integration test: verify branch/worktree creation on open, squash-merge on close, no branch creation on decline
- State isolation test: same worker in meeting + commission simultaneously, verify independent SDK sessions, worktrees, and branches
- Meeting request lifecycle test: worker creates request artifact, user accepts/declines, verify state transitions and that declined meetings preserve referenced artifacts
- Meeting close test: verify notes generated, transcript cleaned up, branch squash-merged, worktree removed

## Constraints

- No database. All meeting state is files.
- Meeting sessions run in-process in the daemon (not separate OS processes like commissions). Meetings don't fork.
- Workers don't manage their own lifecycle (REQ-SYS-9). The meeting system manages everything outside the SDK session boundary.
- Agent SDK session details (model, tool configuration, streaming internals) belong to the Worker spec. This spec covers the session boundary.
- No idle timeout in V1. Meetings stay open until explicitly closed.
- Meeting notes generation (summary from transcript) may involve a separate SDK invocation for quality, but this is an implementation detail.
- No worker-to-worker communication. Meeting coordination flows through the manager or shared artifacts/memory.

## Context

- [Brainstorm: Agentic Work UX](.lore/brainstorm/agentic-work-ux.md): Lines 73-91 define the meeting primitive. Lines 249-251 resolve lifecycle rules (explicit close, per-project cap). Lines 340-353 scope this spec.
- [Spec: Guild Hall System](guild-hall-system.md): Foundation. Activity branches (REQ-SYS-22), per-activity worktrees (REQ-SYS-29a), meeting cap (REQ-SYS-8a), meeting-produces-artifacts (REQ-SYS-13), ephemeral transcripts (REQ-SYS-30).
- [Spec: Guild Hall Workers](guild-hall-workers.md): Worker activation (REQ-WKR-4a), meeting toolbox stub (REQ-WKR-11), session persistence (REQ-WKR-20), streaming (REQ-WKR-21), manager meeting initiation (REQ-WKR-25).
- [Spec: Guild Hall Commissions](guild-hall-commissions.md): Sibling spec. Same activity lifecycle pattern (branch, worktree, squash-merge). Commission toolbox (REQ-COM-17-20) is the structural template for the meeting toolbox.
- [Design: Process Architecture](.lore/design/process-architecture.md): Daemon hosts meeting sessions in-process. Meeting endpoints (POST /meetings, POST /meetings/:session_id/messages, DELETE). SSE streaming for real-time response delivery. Session recovery = normal multi-turn resumption.
- [Retro: SSE Streaming Bug Fix](.lore/retros/sse-streaming-bug-fix.md): Two ID namespaces (Guild Hall session ID vs SDK session ID) caused event bus key mismatch. The boundary where IDs meet is highest-risk code. Tests must verify correctness (external consumer's ID), not just consistency.
- [Retro: Guild Hall Phase 1](.lore/retros/guild-hall-phase-1.md): SSE integration tests that mock the EventSource layer verify internal consistency, not actual browser behavior. Navigation between views is an implicit requirement.
- [Research: Claude Agent SDK](.lore/research/claude-agent-sdk.md): Session persistence via `options.resume`, streaming via `includePartialMessages: true`, in-process MCP servers for custom tools.
