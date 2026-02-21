---
title: Implement graceful shutdown for MCP servers
date: 2026-02-14
status: complete
tags: [task]
source: .lore/plans/phase-1/mcp-http-transport.md
related: [.lore/specs/phase-1/mcp-http-transport.md]
sequence: 10
modules: [mcp-manager, server-context]
---

# Task: Implement Graceful Shutdown

## What

Add graceful shutdown handling for systemd restarts and Ctrl-C that stops all MCP servers and deallocates ports.

Add `shutdown()` method to `MCPManager` in `lib/mcp-manager.ts`:
```typescript
async shutdown(): Promise<void> {
  const shutdownPromises = Array.from(this.servers.entries()).map(
    async ([name, handle]) => {
      try {
        await handle.stop();
        this.emit({ type: "stopped", memberName: name });
      } catch (err) {
        console.error(`Failed to stop MCP server ${name}:`, err);
      }
    }
  );

  await Promise.allSettled(shutdownPromises);
  this.servers.clear();
  this.processes.clear();
  this.references.clear();
}
```

Add signal handlers to `lib/server-context.ts` or app entry point:
```typescript
let shutdownInProgress = false;

async function gracefulShutdown(signal: string) {
  if (shutdownInProgress) return;
  shutdownInProgress = true;

  console.log(`Received ${signal}, shutting down gracefully...`);

  try {
    const mcpManager = await getMCPManager();
    await mcpManager.shutdown();
    console.log("All MCP servers stopped");
  } catch (err) {
    console.error("Error during shutdown:", err);
  }

  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
```

Implementation details:
- SIGTERM: systemd sends on `systemctl stop` or `systemctl restart`
- SIGINT: sent on Ctrl-C in `bun run dev`
- `shutdown()` calls `stop()` on all MCP server handles
- Each `stop()` kills process and releases port
- Uses `Promise.allSettled` to stop all servers even if some fail
- Emits `stopped` event for each server
- Clears all tracking maps
- Prevents duplicate shutdown via `shutdownInProgress` flag
- Exits with code 0 after successful cleanup

## Validation

Unit tests in `tests/lib/mcp-manager.test.ts`:
- `shutdown()` stops all running servers
- Port registry released for all servers
- `stopped` event emitted for each server
- Handles `stop()` failures gracefully (doesn't throw)
- Clears all maps (servers, processes, references)

Integration test:
- Spawn multiple servers
- Call `shutdown()`
- Verify all processes terminated
- Verify all ports released

Signal handler tests:
- SIGTERM triggers shutdown (if testable in Bun)
- SIGINT triggers shutdown (if testable in Bun)
- Duplicate signal handled (no double-shutdown)

## Why

From `.lore/specs/phase-1/mcp-http-transport.md`:
- REQ-MCP-HTTP-15: "Guild Hall MUST stop all MCP servers gracefully on roster unload"

Graceful shutdown ensures ports are properly deallocated and server processes are cleanly terminated when Guild Hall restarts or stops. Without this, orphaned processes may hold ports and prevent restart.

## Files

- `lib/mcp-manager.ts` (modify - add shutdown method)
- `lib/server-context.ts` (modify - add signal handlers)
- `tests/lib/mcp-manager.test.ts` (modify - add shutdown tests)
