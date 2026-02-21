---
title: Implement port registry for HTTP MCP servers
date: 2026-02-14
status: complete
tags: [task]
source: .lore/_archive/phase-1/plans/mcp-http-transport.md
related: [.lore/_archive/phase-1/specs/mcp-http-transport.md]
sequence: 1
modules: [port-registry]
---

# Task: Implement Port Registry

## What

Create `PortRegistry` class in `lib/port-registry.ts` that tracks port number assignments for HTTP MCP servers. The registry manages allocation from the ephemeral range 50000-51000, handles port release on clean shutdown, and permanently marks ports that fail to bind (EADDRINUSE) as dead so they're never reallocated.

Registry operations:
- `allocate()`: Returns next available port from 50000-51000, throws if range exhausted
- `release(port)`: Frees port for reuse (called on clean shutdown)
- `markDead(port)`: Permanently reserves port that failed to bind

Implementation approach:
- Track used ports in `Set<number>` (in-memory only, no persistence)
- Sequential search starting at 50000 for next available port
- Dead ports stay in `usedPorts` forever (1000-port range makes exhaustion unlikely)
- Thread-safe (synchronous operations, no async races)

## Validation

Unit tests in `tests/lib/port-registry.test.ts`:
- Allocates starting at 50000
- Allocates sequentially (50000, 50001, 50002)
- Reuses released ports
- Throws error when range exhausted (allocate 1001 ports)
- Release non-allocated port is no-op (doesn't error)
- `markDead()` prevents port reallocation
- Dead port is skipped on next `allocate()`

## Why

From `.lore/_archive/phase-1/specs/mcp-http-transport.md`:
- REQ-MCP-HTTP-5: "Guild Hall MUST allocate ports from the ephemeral range 50000-51000"
- REQ-MCP-HTTP-6: "If a port is unavailable (EADDRINUSE), Guild Hall MUST try the next port in sequence"
- REQ-MCP-HTTP-7: "If all ports in the range are exhausted, server spawn MUST fail with descriptive error message"
- REQ-MCP-HTTP-10: "Port allocation MUST persist for the lifetime of the MCP server process"
- REQ-MCP-HTTP-11: "Ports MUST be deallocated when the MCP server process stops"

The registry only tracks port numbers; actual socket binding happens in MCP server processes. This separation allows the factory to retry with different ports when EADDRINUSE occurs.

## Files

- `lib/port-registry.ts` (create)
- `tests/lib/port-registry.test.ts` (create)
