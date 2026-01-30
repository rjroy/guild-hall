# Spec: Guild Hall UX (v1)

**Status**: ready

## Overview

A web frontend for conversing with a manager agent that can delegate work to child agents. v1 is minimal: a conversation UI with session persistence. No async agent spawning (Layer 2 deferred), no sophisticated orchestration prompts (Layer 3 deferred). Essentially "nice UI for Claude Code with a basic manager prompt."

## Entry Points

| Entry | From | Behavior |
|-------|------|----------|
| Open app | Browser (LAN) | Show recent sessions list |
| Select session | Sessions list | Resume conversation via WebSocket |
| New session | Sessions list | Create session, open conversation |

## Requirements

- REQ-1: Web frontend accessible from LAN (mobile-friendly, responsive)
- REQ-2: Real-time bidirectional communication via WebSocket
- REQ-3: Session persistence to `.lore/sessions/`
- REQ-4: Resume previous sessions (SDK `resume` option)
- REQ-5: Stream agent responses to UI as they arrive
- REQ-6: Manager agent uses Claude Code tools including Task for delegation
- REQ-7: Basic manager system prompt (delegate via Task, minimal guidance)

## Architecture

```
┌─────────────────┐     WebSocket      ┌─────────────────┐
│  React Frontend │◄──────────────────►│   Hono Backend  │
│  (conversation) │                    │  (session mgmt) │
└─────────────────┘                    └────────┬────────┘
                                                │
                                                │ Agent SDK query()
                                                ▼
                                       ┌─────────────────┐
                                       │  Manager Agent  │
                                       │  (Claude Code)  │
                                       └────────┬────────┘
                                                │
                                                │ Task tool
                                                ▼
                                       ┌─────────────────┐
                                       │  Child Agents   │
                                       │  (as needed)    │
                                       └─────────────────┘
```

## Components

### Backend (Hono + bun)

**REST endpoints:**
- `GET /api/sessions` - list recent sessions
- `POST /api/sessions` - create new session
- `DELETE /api/sessions/:id` - delete session

**WebSocket endpoint:**
- `WS /api/sessions/:id/ws` - conversation stream

**WebSocket protocol:**
```typescript
// Client → Server
type ClientMessage =
  | { type: 'user_message'; content: string }
  | { type: 'interrupt' }
  | { type: 'ping' }

// Server → Client
type ServerMessage =
  | { type: 'response_start'; messageId: string }
  | { type: 'response_chunk'; messageId: string; content: string }
  | { type: 'response_end'; messageId: string }
  | { type: 'tool_start'; toolName: string; toolUseId: string }
  | { type: 'tool_input'; toolUseId: string; input: unknown }
  | { type: 'tool_end'; toolUseId: string; output: unknown }
  | { type: 'session_ready'; sessionId: string; messages?: ConversationMessage[] }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong' }
```

**SDK to WebSocket message mapping:**

The backend translates SDK events to WebSocket messages as follows:

| SDK Event | Condition | WebSocket Message |
|-----------|-----------|-------------------|
| (query start) | - | `response_start` |
| `stream_event` | `content_block_start` + `tool_use` | `tool_start` |
| `stream_event` | `content_block_delta` + `text_delta` | `response_chunk` |
| `stream_event` | `content_block_stop` (tool block) | `tool_input` |
| `stream_event` | `content_block_delta` + `input_json_delta` | (accumulate, emit on stop) |
| `user` | contains `tool_result` | `tool_end` |
| `result` | contains `tool_result` | `tool_end` |
| `result` | success | `response_end` |
| `result` | error subtype | `error` |
| `stream_event` | error type | `error` |

The `messageId` in response messages is generated per-turn (not from SDK) to correlate chunks with their response.

**Interrupt handling:**

When client sends `{ type: 'interrupt' }`:
1. Backend calls `activeQuery.interrupt()` on the SDK Query object
2. SDK stops generation
3. Backend sends `response_end` to close the current response

**Agent SDK integration:**
- Use `query()` with `includePartialMessages: true` for streaming
- Use `resume` option to continue existing sessions
- Use `systemPrompt` with basic manager instructions
- Use `tools: { type: 'preset', preset: 'claude_code' }` for full toolset
- Use `settingSources: ['project']` to load project CLAUDE.md

**Session resumption flow:**

When a client connects to `/api/sessions/:id/ws`:

1. Backend loads session metadata from `.lore/sessions/{id}.json`
2. If session doesn't exist, return `error` message and close
3. Backend calls SDK `query()` with `resume: sdk_session_id`
4. Backend sends `session_ready` with existing messages from metadata
5. Client reconstructs conversation UI from messages array
6. Subsequent `user_message` events continue the conversation

The `sdk_session_id` is the session ID returned by the SDK on first query. Our `id` is a UUID we generate. They're stored together in session metadata so we can resume SDK state.

**Reconnection strategy:**

Session log is the source of truth. All messages are persisted to `.lore/sessions/{id}.json` as they occur, even if the WebSocket disconnects.

When connection drops:
1. Frontend shows "Disconnected" indicator
2. Frontend attempts reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s)
3. On reconnect, client sends `{ type: 'user_message', content: '' }` or re-selects session
4. Backend sends `session_ready` with full message history
5. Frontend diffs against local state and updates UI
6. If reconnect fails after N attempts, show error toast with manual retry button

The backend does NOT buffer messages during disconnect. The session file is authoritative; clients catch up by re-fetching on reconnect.

**SDK options configuration:**

```typescript
const options: Partial<Options> = {
  cwd: projectPath,                    // Working directory for the project
  systemPrompt: {
    type: 'preset',
    preset: 'claude_code',             // Required to use CLAUDE.md
    append: MANAGER_SYSTEM_PROMPT,     // Our manager instructions (see below)
  },
  tools: { type: 'preset', preset: 'claude_code' },
  settingSources: ['project'],         // Load .claude/settings.json and CLAUDE.md
  includePartialMessages: true,        // Enable streaming
  permissionMode: 'acceptEdits',       // Auto-accept file edits in project
};
```

Note: `settingSources: ['project']` loads CLAUDE.md, but only when combined with the `claude_code` system prompt preset. The preset knows how to interpret CLAUDE.md content.

### Frontend (React)

**Views:**
- Sessions list (recent sessions, new session button)
- Conversation view (message thread, input, status indicators)

**State:**
- Current session ID
- Message history (for display, actual history in SDK)
- Connection status (connected/disconnected/reconnecting)
- Agent status (idle/thinking/tool_use)

**Tool display:**

Tools appear inline in the conversation as expandable cards (pattern from memory-loop):

- Collapsed: tool icon + tool name + brief summary (file path, command preview, etc.)
- Loading spinner during `tool_start` until `tool_end`
- Tap/click expands to show full input/output as formatted JSON
- All tools displayed the same way (Task is just another tool in v1)

The enhanced Task tool (Layer 2) will need special handling later, but v1 treats it uniformly.

**Mobile considerations:**
- Touch-friendly input
- Readable on small screens
- No hover-dependent interactions

**Reconnection UI:**
- Toast/banner shows "Disconnected - Reconnecting..."
- Exponential backoff with visual countdown
- After max retries, show error with manual "Retry" button
- On successful reconnect, briefly show "Reconnected" then fade

### Session Storage

Sessions stored in `.lore/sessions/` (gitignored - not version controlled):

```
.lore/sessions/
└── {session_id}.json    # Session data with messages
```

**{session_id}.json:**
```json
{
  "id": "abc123",
  "sdk_session_id": "sdk-xyz789",
  "created": "2026-01-30T10:00:00Z",
  "updated": "2026-01-30T11:30:00Z",
  "title": "First message preview...",
  "messages": [
    {
      "id": "msg-1",
      "role": "user",
      "content": "Help me plan the authentication system",
      "timestamp": "2026-01-30T10:00:00Z"
    },
    {
      "id": "msg-2",
      "role": "assistant",
      "content": "I'll help you plan...",
      "timestamp": "2026-01-30T10:00:05Z",
      "toolInvocations": [
        { "toolUseId": "tool-1", "toolName": "Read", "input": {...}, "output": {...} }
      ]
    }
  ]
}
```

**Two IDs explained:**
- `id`: UUID generated by Guild Hall for URL routing (`/api/sessions/:id`)
- `sdk_session_id`: Session ID from Agent SDK, used with `resume` option

These are separate because the SDK generates its own session ID on first `query()`. We need both: ours for routing, theirs for resuming.

**Session list:**

No separate index file. `GET /api/sessions` reads all `.json` files in `.lore/sessions/`, extracts metadata, and returns sorted by `updated` desc, limit 20.

**Title generation:**

First 50 characters of first user message, truncated at word boundary, newlines replaced with spaces.

### Manager System Prompt (v1)

Minimal for now:

```
You are a manager agent. You coordinate work by delegating to specialized agents via the Task tool.

When given work:
1. Break it into delegatable pieces
2. Use Task tool to spawn agents for each piece
3. Synthesize results
4. Report back to the user

Use .lore/ for persistent artifacts:
- .lore/research/ - external context, documentation
- .lore/specs/ - requirements and feature definitions
- .lore/brainstorm/ - exploratory notes and ideas
- .lore/plans/ - implementation approaches

All work must complete synchronously. Do not start work that requires the user to wait for async completion.
```

This will be expanded in Layer 3 (deferred).

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Close browser | User navigates away | Session persists, resumable |
| Backend shutdown | Server stops | Sessions preserved in `.lore/sessions/` |
| Layer 2 integration | Future | [STUB: communicative-task-tool] |
| Layer 3 prompt | Future | [STUB: manager-orchestration-prompt] |

## Success Criteria

- [ ] Can start new conversation from browser
- [ ] Can send message and see streamed response (text appears incrementally)
- [ ] Can see tool use as expandable cards (tool name + spinner while running)
- [ ] Can expand tool cards to see input/output JSON
- [ ] Can resume previous session after closing browser (messages restored)
- [ ] Can list and select from recent sessions (sorted by last activity)
- [ ] Works on mobile (touch-friendly, readable on small screens)
- [ ] Agent can use Task tool to spawn child agents (appears as tool card)
- [ ] Sessions persist across backend restarts
- [ ] Reconnection works after brief network interruption (with backoff)

## Constraints

- LAN-only: Server binds to `0.0.0.0` for local network access (no authentication in v1)
- Single project: Guild Hall is run from within a project directory, uses that project's `.lore/`
- Synchronous Task tool only (Layer 2 async deferred)
- No notifications (user polls by returning to UI)
- `.lore/sessions/` must be in `.gitignore` (sessions contain conversation history, not code)

## Tech Stack

- **Runtime**: bun
- **Backend**: Hono
- **Frontend**: React
- **Agent**: @anthropic-ai/claude-agent-sdk
- **WebSocket**: Hono's built-in WebSocket support

## Context

- Brainstorm: `.lore/brainstorm/simplified-architecture-2026-01-30.md`
- Agent SDK reference: `.lore/research/claude-agent-sdk-typescript.md`
