# Guild Hall

A self-hosted web application that manages Claude Agent SDK sessions and exposes MCP tools through a dashboard interface.

Guild Hall gives you a roster of MCP-powered tools ("guild members"), lets you create agent sessions that combine them, and streams agent activity in real time. You can also invoke any tool directly without starting a session.

## Status

Pre-implementation. Phase I spec is complete.

## Concepts

**Guild Members** are filesystem-discovered plugins. Each one is a directory with a manifest file and an MCP server. Drop a valid guild member into the discovery directory and it appears in the Roster.

**Three zones** organize the interface:

- **Roster**: All discovered guild members, their connection status, and their tools. Expand a member to see individual tools. Invoke any tool directly from here, no session required.
- **Board**: Session cards sorted by recent activity. Create new sessions, select which guild members to include, and resume existing sessions.
- **Workshop**: The active session view. Full conversation history (messages, tool calls, tool results), real-time streaming, message input, and stop control.

## Architecture

- **Next.js** (App Router) with API routes as the backend. Single TypeScript codebase.
- **Claude Agent SDK** (TypeScript) manages agent sessions. Each user message triggers a `query()` call; the agent runs to completion and stops. No persistent agent process between queries.
- **SSE** streams agent activity from backend to frontend during query execution.
- **File-based session storage**. Each session is a directory containing metadata, message history, a context file, and an artifacts directory.
- **MCP-only plugins**. Guild members provide MCP servers discovered by scanning a directory at startup.

## Session Lifecycle

Sessions move through these statuses: **idle** (ready for messages), **running** (query executing), **completed** (user ended the session), **expired** (SDK session no longer valid), **error** (unrecoverable failure).

Each session directory includes a **context file** that captures distilled state: goals, decisions, progress, and relevant resources. The agent reads it at the start of each query and updates it as work progresses. When a session expires, the context file provides continuity for a fresh SDK session without replaying the full message history.

The context file is plain text, readable and editable outside the application. The user and agent share it as a working document.

## Requirements

- Node.js
- Bun
- Claude Agent SDK (TypeScript, v0.2.39+)
- Anthropic API key

## License

MIT
