---
title: MCP server PID file coordination
date: 2026-02-15
status: approved
tags: [mcp, process-management, turbopack, dev-mode, singleton]
modules: [mcp-manager, http-mcp-factory, server-context]
related:
  - .lore/specs/mcp-http-transport.md
  - .lore/specs/mcp-server-factory.md
  - .lore/brainstorm/mcp-transport-stdio-vs-http.md
  - .lore/retros/coverage-di-factories.md
req-prefix: MCPPID
---

# Spec: MCP Server PID File Coordination

## Overview

MCP servers are child processes that allocate ports and serve JSON-RPC over HTTP. Turbopack re-evaluates server-side modules per compilation in dev mode (route changes, file edits, HMR), creating new MCPManager instances that try to spawn duplicate servers. Instead of fighting the bundler's module system (globalThis hacks, CJS cache tricks), write PID files when servers spawn and check them before spawning. If a server is already running, reconnect to it. The filesystem becomes the coordination mechanism.

## Definitions

- **PID file**: A JSON file at `.mcp-servers/{member-name}.json` containing `{ pid, port }`. One per guild member.
- **Stale PID file**: A PID file where the recorded PID is not alive (`process.kill(pid, 0)` throws) OR the server doesn't respond to an initialize handshake on the recorded port within 2 seconds.
- **Graceful shutdown**: Cleanup triggered by the SIGTERM/SIGINT signal handler in `server-context.ts`.
- **Boot cleanup**: Cleanup that runs before `initializeRoster()` on every fresh module evaluation, handling cases where graceful shutdown didn't run (crash, kill -9, power loss).
- **Reconnected handle**: An MCPServerHandle created by connecting to an already-running server. Does not own the server process.

## Entry Points

- Backend initialization (`server-context.ts` module evaluation) triggers `MCPManager.initializeRoster()`
- Graceful shutdown (SIGTERM/SIGINT) triggers cleanup
- Fresh boot needs to clean up stale files from prior crashes

## Requirements

- REQ-MCPPID-1: When an MCP server is spawned, write a PID file to `.mcp-servers/{member-name}.json` containing `{ pid, port }`. Write to `.mcp-servers/.{member-name}.json.tmp` first, then rename to the final path. If `.mcp-servers/` doesn't exist, create it.
- REQ-MCPPID-2: Before spawning, check for an existing PID file. If the file exists AND the process is alive AND the server responds to a JSON-RPC initialize handshake (HTTP 200 with valid JSON-RPC result, 2-second timeout), skip spawning and create a reconnected handle instead. If the handshake times out, returns an HTTP error, or returns invalid JSON-RPC, treat the PID file as stale.
- REQ-MCPPID-3: If a PID file is stale, delete it and spawn fresh.
- REQ-MCPPID-4: On graceful shutdown (SIGTERM/SIGINT), kill all MCP server processes referenced by PID files in `.mcp-servers/`, then delete all PID files.
- REQ-MCPPID-5: On boot (before `initializeRoster`), scan `.mcp-servers/` for PID files. Kill any processes that are still alive, delete all files. Create the directory if it doesn't exist. This handles unclean exits where graceful shutdown didn't run.
- REQ-MCPPID-6: The MCPServerFactory interface gains a `connect` method: `connect(config: { port: number }): Promise<{ handle: MCPServerHandle }>`. Creates an MCPServerHandle by connecting to an existing server, without spawning a process. No ChildProcess is returned.
- REQ-MCPPID-7: A reconnected handle's `stop()` returns immediately without killing the server process. It logs a disconnect message. MCPManager tracks which handles are reconnected vs spawned so shutdown knows which processes to kill directly (spawned) vs which to skip (reconnected, handled via PID file cleanup).
- REQ-MCPPID-8: When reconnecting to an existing server via PID file, the port MUST be marked as allocated in the PortRegistry to prevent collision with new spawns. On reconnected handle `stop()`, the port is NOT released.
- REQ-MCPPID-9: The `.mcp-servers/` directory is gitignored. These are runtime artifacts.
- REQ-MCPPID-10: The `_singleton-cache.cjs` workaround and `createRequire` machinery are removed for MCP process coordination. The `_singleton-cache.cjs` file may be retained if needed for EventBus/AgentManager sharing (see "What This Does NOT Solve"), but MCP servers no longer depend on it.
- REQ-MCPPID-11: If a PID file appears between the existence check and the spawn attempt (race between concurrent module evaluations), the second evaluation detects the conflict via port collision retry logic (existing behavior) and falls back to reconnecting.

## Process Liveness Check

Checking whether a PID is alive: `process.kill(pid, 0)` sends signal 0 (no actual signal, just checks existence). Returns without error if the process exists, throws if it doesn't. Wrap in try/catch.

Checking whether the server is responsive: attempt a JSON-RPC `initialize` call with a 2-second timeout. The response must be HTTP 200 with a valid JSON-RPC initialize result. This confirms not just that the process is alive, but that it's still serving MCP on the expected port. A PID can be reused by the OS for an unrelated process; the handshake catches that.

Both checks are needed. A process can be alive but hung, or a PID can belong to an unrelated process.

## Reconnected Handle Behavior

A reconnected handle wraps a JsonRpcClient pointing at the existing server's port. It supports:

- `listTools()`: works normally (JSON-RPC call)
- `invokeTool()`: works normally (JSON-RPC call)
- `stop()`: returns `Promise<void>` immediately without killing the process. Logs `[MCP:{name}] Disconnected (reconnected handle, process not owned)`.

The MCPManager does NOT get a ChildProcess reference for reconnected servers, so crash detection (`process.on("exit")`) is not available. This is acceptable because:

- In dev mode, MCP servers are generally stable (developer is actively working)
- If a server crashes, the next module re-evaluation will detect the dead PID and respawn
- Production doesn't have the Turbopack re-evaluation problem

## PID File Format

```json
{
  "pid": 12345,
  "port": 50000
}
```

One file per guild member: `.mcp-servers/{member-name}.json`

## Spawn Outcomes

| Outcome | Triggers When | Result |
|---------|---------------|--------|
| Server reconnected | PID file valid, server responsive | MCPManager has handle, no spawn needed |
| Server spawned | No PID file, or stale PID file | Normal spawn flow, PID file written |
| Shutdown complete | SIGTERM/SIGINT received | All processes killed, PID files deleted |
| Boot cleanup done | PID files found on startup | Old processes killed, fresh spawn follows |

## What This Does NOT Solve

This spec addresses MCP server process lifecycle only. Other server-side singletons (EventBus, AgentManager, SessionStore) still face the Turbopack re-evaluation problem. In practice:

- **SessionStore**: Stateless (reads/writes files). Multiple instances are fine.
- **AgentManager**: Holds in-flight query state. If the POST route and SSE route get different AgentManager instances, SSE events from an agent query won't reach the SSE connection. This is a [STUB: eventbus-sharing] concern, separate from MCP process management.
- **EventBus**: Same issue as AgentManager. Events emitted in one module scope aren't visible in another.

The EventBus/AgentManager sharing problem may warrant keeping `_singleton-cache.cjs` for those specific singletons, or it may need its own solution. That's out of scope here.

## Success Criteria

- [ ] MCP servers spawn once on first `initializeRoster()`, regardless of how many Turbopack re-evaluations occur
- [ ] Subsequent module evaluations reconnect to existing servers (logs show "Reconnected to existing server on port X")
- [ ] (Manual) `kill -9` the Next.js dev server, restart it: MCP servers are cleaned up and respawned without port conflicts
- [ ] (Manual) SIGTERM cleanly kills all MCP servers and removes PID files
- [ ] All existing tests continue to pass
- [ ] New tests verify PID file creation, reconnection, stale file cleanup, and boot cleanup

## AI Validation

**Defaults** (apply unless overridden):
- Unit tests with mocked filesystem for PID file reads/writes
- Unit tests with mocked `process.kill(pid, 0)` for liveness checks
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Unit test: spawn writes PID file, verify contents match `{ pid, port }`
- Unit test: PID file with alive PID and responsive server triggers reconnect (no spawn)
- Unit test: PID file with dead PID triggers delete + fresh spawn
- Unit test: boot cleanup kills alive processes and deletes all PID files
- Unit test: atomic write leaves no temp file on success; write failure before rename doesn't create final PID file
- Unit test: reconnected handle `stop()` does not kill process or release port

## Constraints

- PID files go in `.mcp-servers/` at project root (consistent with `sessions/` directory pattern)
- No new dependencies. `fs`, `path`, `process.kill` are all Node.js builtins.
- The DI factory pattern must be preserved. PID file I/O is injected for testability (no direct `fs` calls in MCPManager).
- Running two dev servers from the same project directory simultaneously is unsupported. Boot cleanup will kill the other server's MCP processes.

## Context

- Phase 1 brainstorm open question #1 asked whether Next.js was the right fit. The answer is "yes, but MCP process management needs to survive module re-evaluation." PID files are the minimal fix.
- The `_singleton-cache.cjs` approach (CJS module loaded via `createRequire` to bypass Turbopack's sandbox) was a workaround for the same problem at the module scope level. This spec replaces it with a filesystem-based mechanism that's more explicit and debuggable.
- The mcp-http-transport spec (REQ-MCP-HTTP-10) established eager loading. This spec preserves that: servers start eagerly, but subsequent evaluations discover and reconnect instead of respawning.
