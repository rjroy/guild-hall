---
title: Guild Hall Phase I - Frontend Session Shell
date: 2026-02-11
status: draft
tags: [phase-1, frontend, sessions, mcp, dashboard, agent-sdk, plugin-system]
modules: [guild-hall]
related:
  - .lore/brainstorm/guild-hall-phase-1.md
  - .lore/research/agent-native-applications.md
  - .lore/research/claude-agent-sdk.md
  - .lore/research/typescript-plugin-systems.md
  - .lore/notes/phase-1-research-summary.md
req-prefix: GH1
---

# Spec: Guild Hall Phase I - Frontend Session Shell

## Overview

Guild Hall Phase I is a self-hosted web application that manages Claude Agent SDK sessions and presents MCP tools through a dashboard interface. Users see a roster of available tools ("guild members"), create and resume agent sessions, stream agent activity in real time, and invoke tools directly without an agent. Guild members are filesystem-discovered plugins that each provide an MCP server.

This resolves the four open architectural questions from the brainstorm: Next.js (App Router), TypeScript Agent SDK, SSE for streaming, file-based session storage with SDK session ID mapping.

## Entry Points

- **Dashboard load**: User navigates to localhost. Sees the Roster and the Board.
- **Session creation**: User creates a new session from the Board, selects guild members, enters the Workshop.
- **Session resume**: User clicks a session card on the Board. Enters the Workshop with prior context intact.
- **Direct tool use**: User selects a tool from the Roster, provides inputs, receives results. No session required.

## Requirements

### Architecture

- REQ-GH1-1: The application is a Next.js app with API routes serving as the backend. Single TypeScript codebase for frontend and backend.
- REQ-GH1-2: The backend manages agent sessions via the Claude Agent SDK (TypeScript). Each user message triggers a `query()` call; the agent runs, completes, and stops. There is no persistent agent process between queries.
- REQ-GH1-3: While a query is executing, agent activity streams from backend to frontend via SSE. The SSE connection is open for the duration of a query, not permanently.
- REQ-GH1-4: The application runs on localhost only. No authentication.
- REQ-GH1-5: Guild members are MCP-only plugins discovered by scanning a designated directory at startup. Each guild member is a directory containing a manifest file.

### The Roster

- REQ-GH1-6: The Roster displays all discovered guild members with name, description, connection status (connected, disconnected, error), and tool count.
- REQ-GH1-7: Expanding a guild member in the Roster reveals its individual tools with their names and descriptions.
- REQ-GH1-8: Users can invoke any tool directly from the Roster by selecting it, providing inputs via a form, and receiving the result. This is the user-directed mode of the hybrid model.
- REQ-GH1-9: The Roster is visible from both the dashboard (alongside the Board) and within the Workshop.

### The Board

- REQ-GH1-10: The Board displays session cards for all known sessions, sorted by most recent activity.
- REQ-GH1-11: Each session card shows: session name, status, configured guild members, last activity timestamp, and message count.
- REQ-GH1-12: Clicking a session card navigates to that session's Workshop view.
- REQ-GH1-13: The Board provides a control to create a new session. The user provides a name and selects which guild members to include.

### The Workshop

- REQ-GH1-14: The Workshop displays the full conversation history for the active session: user messages, assistant messages, tool calls, and tool results.
- REQ-GH1-15: Agent activity streams in real time. Tool calls, tool results, and assistant text appear as they happen, not after completion.
- REQ-GH1-16: The Workshop provides a message input for sending prompts to the agent.
- REQ-GH1-17: The Workshop provides a stop control that interrupts the agent mid-execution.
- REQ-GH1-18: The Workshop shows which guild members are configured for this session.

### Session Lifecycle

- REQ-GH1-19: Sessions are stored as directories on the filesystem. Each directory contains session metadata, message history, a context file, and an artifacts directory for files created during the session.
- REQ-GH1-20: Creating a session creates its directory, starts the MCP servers for the selected guild members, initializes an Agent SDK session, and records the SDK session ID in metadata.
- REQ-GH1-21: Sending a message to an existing session calls `query()` with the stored SDK session ID, resuming the conversation. MCP servers are restarted if they're not already running.
- REQ-GH1-22: When a stored SDK session ID is no longer valid, the session is marked expired. The user can start a fresh SDK session from the same directory, preserving the context file and message history for the new session.
- REQ-GH1-23: Session statuses: idle (no query running, ready for new messages), running (a query is currently executing), completed (user explicitly ended the session), expired (SDK session ID no longer valid), error (unrecoverable failure).

### Session Context

- REQ-GH1-30: Each session directory contains a context file that captures the distilled state of the work: what the session is trying to accomplish, what has been decided, what is in progress, and what resources matter.
- REQ-GH1-31: The agent reads the context file at the start of each query. It serves as orientation, not a substitute for conversation history.
- REQ-GH1-32: The agent updates the context file as work progresses, adding decisions, removing stale information, and reflecting the current state. Updates happen during normal query execution, not as a separate step.
- REQ-GH1-33: When a session expires and the user starts a fresh SDK session, the context file provides continuity. The new session reads it to recover the distilled understanding that would otherwise require reconstructing from the raw message history.
- REQ-GH1-34: The context file is a plain text file readable and editable by the user outside the application. The user and the agent share it as a working document.

### Plugin Manifest

- REQ-GH1-24: Each guild member provides a manifest declaring: identity (name, display name, description, version), and MCP server configuration (how to start the server process).
- REQ-GH1-25: Phase I supports MCP-only guild members. No plugin-contributed UI components. The Roster renders a default card for every guild member.
- REQ-GH1-26: The backend validates manifests at startup. Invalid manifests produce a log entry and the guild member appears in the Roster with an error status.

### API Surface

- REQ-GH1-27: The backend exposes REST endpoints for: listing the roster, listing sessions, creating a session, reading session details, sending a message to a session, stopping a running session, completing a session, and invoking a tool directly.
- REQ-GH1-28: The backend exposes an SSE endpoint for subscribing to session events. Event types include: assistant text (streamed chunks), tool use (name and input), tool result, session status change, and error.
- REQ-GH1-29: Direct tool invocation accepts a guild member identifier, tool name, and tool input, and returns the tool result synchronously.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Plugin UI components | Guild members need custom Roster cards or Workshop panels | [STUB: plugin-ui-components] |
| Authentication | Server exposed beyond localhost | [STUB: authentication] |
| Cost tracking | Session costs need to be visible on the Board or in the Workshop | [STUB: cost-tracking] |
| Guild member dependencies | One guild member requires another's tools | [STUB: guild-member-dependencies] |
| Activity feed | Dashboard needs a cross-session stream of agent actions | [STUB: activity-feed] |
| Session forking | User wants to branch a session into parallel paths | [STUB: session-forking] |

## Success Criteria

- [ ] Dashboard loads and displays the Roster (guild members from filesystem) and the Board (sessions from filesystem)
- [ ] User creates a new session, selects guild members, and enters the Workshop
- [ ] User sends a message and sees the agent's response streamed in real time (text and tool activity interleaved)
- [ ] User stops the agent mid-execution and the stream terminates
- [ ] User leaves the Workshop, returns to the Board, resumes the session, and sees the complete message history from prior queries
- [ ] User invokes a tool directly from the Roster without entering a session
- [ ] A valid guild member added to the discovery directory appears in the Roster after restart
- [ ] An invalid guild member manifest produces an error-status card in the Roster, not a crash
- [ ] An expired SDK session is handled gracefully: user sees the status, can start fresh with context file and message history preserved
- [ ] The context file in a session directory reflects the current state of the work after multiple queries, and is readable as a standalone summary

## AI Validation

**Defaults** (apply unless overridden):
- Unit tests with mocked time/network/filesystem/LLM calls (including Agent SDK)
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

## Constraints

- Localhost only. No authentication, HTTPS, or multi-user support.
- TypeScript throughout. Next.js frontend, Agent SDK backend.
- SSE for streaming. Not WebSocket.
- File-based session storage. No database.
- MCP-only guild members. No plugin-contributed UI components in Phase I.
- Agent SDK TypeScript v0.2.39 or later.

## Context

- [Agent-Native Architecture](.lore/research/agent-native-applications.md): Parity (user and agent share the same tools), granularity (atomic MCP tools), composability (features as prompts over tools). These principles drive the hybrid model and the Roster's direct tool invocation.
- [Claude Agent SDK](.lore/research/claude-agent-sdk.md): TypeScript SDK provides hooks (SessionStart/End, PreToolUse/PostToolUse, Notification, PermissionRequest), session resume/fork, MCP integration via stdio/HTTP/in-process servers, and streaming message types.
- [Plugin Systems](.lore/research/typescript-plugin-systems.md): Guild Hall borrows directory-scan discovery (Claude Code, Grafana), manifest-based metadata (VS Code, Grafana), and the "MCP-only vs full" plugin tier distinction.
- [Phase I Brainstorm](.lore/brainstorm/guild-hall-phase-1.md): Settled the hybrid agent model, dashboard-first UI, file-based sessions, three-zone metaphor (Roster, Board, Workshop).
- [Research Summary](.lore/notes/phase-1-research-summary.md): Consolidation of findings and the four open questions resolved by this spec.
