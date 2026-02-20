---
title: Implement HTTP MCP factory with port collision retry
date: 2026-02-14
status: complete
tags: [task]
source: .lore/plans/mcp-http-transport.md
related: [.lore/specs/phase-1/mcp-http-transport.md]
sequence: 4
modules: [http-mcp-factory]
---

# Task: Implement HTTP MCP Factory

## What

Create `createHttpMCPFactory(deps)` in `lib/http-mcp-factory.ts` that spawns HTTP MCP server processes and returns `MCPServerFactory` interface.

Dependencies: `{ portRegistry: PortRegistry }`

Spawn flow with port collision retry:
1. Allocate port from registry
2. Substitute `${PORT}` in args with allocated port number
3. Spawn process with `cwd=config.pluginDir`, capture stderr
4. Wait 100ms for quick port collision detection
5. If exit code 2 (EADDRINUSE): mark port dead, retry with next port (max 10 attempts)
6. Create JSON-RPC client, call `initialize()` with 5s timeout
7. On initialize failure: kill process, release port (unless EADDRINUSE), throw error
8. On initialize success: return `{ process, handle, port }`

Handle implementation:
- `stop()`: kills process, releases port
- `listTools()`: delegates to JSON-RPC client
- `invokeTool(name, input)`: delegates to JSON-RPC client

Stderr handling:
- Capture in 10KB buffer (keep last 5KB if exceeded)
- Log to console with `[MCP stderr]` prefix
- Include in error messages on spawn failure

Port collision detection:
- Exit code 2 triggers `markDead()` and retry
- Non-collision errors release port and fail immediately
- Retry limit: 10 attempts

Error scenarios:
- Initialize timeout (5s): kills process, releases port, throws
- Initialize error: kills process, releases port (unless exit code 2), throws
- Retry limit exceeded: throws descriptive error

## Validation

Unit tests in `tests/lib/http-mcp-factory.test.ts`:
- Spawn succeeds with valid config
- `${PORT}` substitution in args works
- Working directory set to `config.pluginDir`
- Initialize handshake called on spawn
- Spawn fails if initialize times out (5s)
- Port collision retry: exit code 2 triggers `markDead()` and retry
- Port collision retry: succeeds on second attempt after first port fails
- Port released on spawn failure (non-collision errors)
- Port marked dead on EADDRINUSE (exit code 2)
- Retry limit exceeded throws error
- `stop()` kills process and releases port
- Stderr captured and logged with size limit

## Why

From `.lore/specs/phase-1/mcp-http-transport.md`:
- REQ-MCP-HTTP-6: "If a port is unavailable (EADDRINUSE), Guild Hall MUST try the next port in sequence"
- REQ-MCP-HTTP-9: "Guild Hall MUST substitute `${PORT}` in manifest `args` with the allocated port number"
- REQ-MCP-HTTP-11: "MCP server processes MUST be spawned with current working directory set to `pluginDir`"
- REQ-MCP-HTTP-12: "After spawning, Guild Hall MUST verify the server is ready by completing the JSON-RPC initialize handshake"
- REQ-MCP-HTTP-13: "The initialize handshake consists of 3 steps"
- REQ-MCP-HTTP-14: "If the initialize handshake fails or times out (5 seconds), guild member status MUST be set to \"error\" with descriptive error message, and the server process MUST be terminated"
- REQ-MCP-HTTP-18: "Guild Hall MUST capture stderr from MCP server processes and log it to console for debugging"
- REQ-MCP-HTTP-20: "The initialize handshake MUST have a timeout of 5 seconds. On timeout, the HTTP request is aborted, guild member status is set to \"error\", and the server process is terminated"
- REQ-MCP-HTTP-30: "MCP servers MUST bind to 127.0.0.1 (localhost only, not 0.0.0.0)"

The factory returns `{ process, handle, port }` so MCPManager can attach exit listeners for crash detection.

## Files

- `lib/http-mcp-factory.ts` (create)
- `tests/lib/http-mcp-factory.test.ts` (create)
