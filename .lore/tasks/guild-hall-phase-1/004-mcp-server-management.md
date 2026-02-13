---
title: Implement MCP server lifecycle management
date: 2026-02-11
status: complete
tags: [task]
source: .lore/plans/guild-hall-phase-1.md
sequence: 4
modules: [guild-hall]
related:
  - .lore/specs/guild-hall-phase-1.md
  - .lore/plans/guild-hall-phase-1.md
---

# Task: Implement MCP server lifecycle management

## What

Create `lib/mcp-manager.ts` with reference-counted MCP server lifecycle management:

**Reference counting**: Track `Map<memberName, Set<sessionId>>` to know which sessions use which servers. A server starts when the first session needs it and stops when the last session releases it.

**Interface**:
- `startServersForSession(sessionId: string, memberNames: string[])`: Add sessionId to each member's reference set. Start any servers not already running. After start, query tool lists and update guild member tool count/descriptions.
- `releaseServersForSession(sessionId: string)`: Remove sessionId from all reference sets. Stop servers with empty reference sets.
- `getServerConfigs(memberNames: string[])`: Return MCP server configuration objects in the format the Agent SDK expects for a `query()` call.
- `isRunning(memberName: string): boolean`: Check if a server is currently running.
- `invokeTool(memberName: string, toolName: string, toolInput: object)`: Call a tool directly via MCP client, outside an Agent SDK session. If server isn't running, start it with a temporary reference that auto-releases after the call completes.
- `shutdown()`: Stop all servers, clean up all references.

**Status tracking**: Update guild member connection status (connected/disconnected/error) when servers start, stop, or fail. Emit events on status changes for consumers (roster API, SSE).

**Event emission**: Expose subscribe/unsubscribe for server lifecycle events (started, stopped, error, tools_updated).

The MCP manager takes the roster Map (from plugin discovery) as a constructor parameter.

## Validation

- Starting servers for a session with two guild members starts both servers, sets status to connected
- Starting servers for a second session with an overlapping guild member does not start a duplicate process
- Releasing one session keeps shared servers running; releasing the last session stops the server
- `getServerConfigs` returns the correct configuration shape for stdio servers
- `invokeTool` on a running server calls the tool and returns the result
- `invokeTool` on a stopped server starts it, calls the tool, returns the result, then releases the temporary reference
- Failed server start sets guild member status to `error` with error message
- `shutdown()` stops all running servers and clears all references
- Event emission notifies subscribers on status changes

## Why

REQ-GH1-5: "Guild members are MCP-only plugins discovered by scanning a designated directory at startup. Each guild member is a directory containing a manifest file." (server lifecycle follows from discovery)

REQ-GH1-20: "Creating a session... starts the MCP servers for the selected guild members."

REQ-GH1-21: "MCP servers are restarted if they're not already running."

REQ-GH1-29: "Direct tool invocation accepts a guild member identifier, tool name, and tool input, and returns the tool result synchronously."

## Files

- `lib/mcp-manager.ts` (create)
- `tests/lib/mcp-manager.test.ts` (create)
