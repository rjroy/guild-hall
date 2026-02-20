---
title: Add eager loading to MCPManager
date: 2026-02-14
status: complete
tags: [task]
source: .lore/plans/mcp-http-transport.md
related: [.lore/specs/phase-1/mcp-http-transport.md]
sequence: 5
modules: [mcp-manager, server-context, plugin-discovery]
---

# Task: Add Eager Loading to MCPManager

## What

Add roster initialization flow to `MCPManager` that eagerly starts all HTTP MCP servers, attaches crash detection listeners, and populates tool lists.

Changes to `lib/mcp-manager.ts`:
1. Add `private processes = new Map<string, ChildProcess>()` to track spawned processes
2. Add `async initializeRoster()` method that starts all HTTP transport plugins using `Promise.allSettled`
3. Add `private async spawnServer(name, member)` that:
   - Calls factory.spawn() with command/args/env/pluginDir
   - Unpacks `{ process, handle, port }` from factory return
   - Stores process in `processes` map
   - Attaches `process.on('exit')` listener for crash detection
   - Stores handle in `servers` map
   - Stores port in `member.port`
   - Calls `handle.listTools()` to fetch tools
   - Updates `member.status = "connected"`, `member.tools`, clears `member.error`
   - Emits `started` and `tools_updated` events
   - On error: sets `member.status = "error"`, `member.error`, emits `error` event

Crash detection:
- Exit listener updates `member.status = "error"` with exit code/signal
- Emits `error` event with guild member name and error message
- Removes process from tracking map

Changes to `lib/plugin-discovery.ts`:
- Store plugin directory path in `GuildMember.pluginDir` field during discovery
- Path: `path.join(baseDir, relativePath)`

Changes to `lib/server-context.ts`:
- Call `await mcpManagerInstance.initializeRoster()` after creating MCPManager (around line 70)
- Eager loading happens during backend startup, before any user requests

## Validation

Unit tests in `tests/lib/mcp-manager.test.ts`:
- `initializeRoster()` starts all HTTP plugins
- Failed server sets `status="error"`, doesn't block other servers
- Successful server sets `status="connected"`, tools populated
- Events emitted for each server (started, tools_updated, or error)
- Process exit listener attached and triggers on crash
- `member.port` populated with allocated port
- `pluginDir` passed correctly to factory
- Non-HTTP plugins skipped (future-proof for other transports)

Integration test:
- Verify eager loading on server startup
- Verify tools visible in roster immediately after init
- Verify crash detection updates status within 1 second

## Why

From `.lore/specs/phase-1/mcp-http-transport.md`:
- REQ-MCP-HTTP-10: "During roster initialization, Guild Hall MUST start all MCP servers (eager loading)"
- REQ-MCP-HTTP-16: "Guild Hall MUST detect server process exits via event listener (process.on('exit'))"
- REQ-MCP-HTTP-17: "When a server process crashes, guild member status MUST be set to \"error\" and the port MUST be deallocated"
- REQ-MCP-HTTP-36: "After successful health check, Guild Hall MUST call tools/list to retrieve available tools"
- REQ-MCP-HTTP-37: "Guild Hall MUST populate `member.tools` with the tool list for roster display"
- REQ-MCP-HTTP-38: "Tools MUST be immediately visible to agents"
- REQ-MCP-HTTP-39: "If tools/list fails, guild member status MUST be set to \"error\""

Eager loading eliminates the chicken-and-egg problem where tools are invisible until server starts, but server only starts when tools are needed. With eager loading, all servers start during roster init and tools are immediately available.

## Files

- `lib/mcp-manager.ts` (modify - add initializeRoster, spawnServer, process tracking)
- `lib/plugin-discovery.ts` (modify - add pluginDir to GuildMember)
- `lib/server-context.ts` (modify - call initializeRoster)
- `tests/lib/mcp-manager.test.ts` (modify - add eager loading tests)
