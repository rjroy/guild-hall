---
title: MCP Transport - Stdio vs HTTP/SSE
date: 2026-02-14
status: resolved
tags: [mcp, transport, architecture, http, sse, stdio]
modules: [mcp-manager, mcp-server-factory]
related:
  - .lore/specs/phase-1/mcp-server-factory.md
  - .lore/notes/phase-1/mcp-server-factory.md
  - .lore/research/claude-agent-sdk.md
---

# Brainstorm: MCP Transport - Stdio vs HTTP/SSE

## Context

During Phase 9 manual testing of MCPServerFactory implementation, we discovered a critical chicken-and-egg problem: MCP servers use deferred initialization (not started until first use), but tool lists aren't populated until the server starts, so agents can't request tools they don't know about.

While exploring tool caching solutions, a deeper architectural issue emerged: **Guild Hall and the Claude Agent SDK both start their own MCP server processes when using stdio transport**. This creates:

1. **Duplicate processes**: Two instances of the same MCP server running simultaneously
2. **Consistency risk**: The two servers could report different tools (if plugin updated between starts)
3. **Unknown lifecycle**: We don't know if `query()` spawns fresh servers per call (startup cost every message) or keeps them running (memory + cleanup concerns)

This brainstorm explores whether to continue with stdio transport (accepting duplicates) or switch to HTTP/SSE transport (Guild Hall controls lifecycle, Agent SDK just connects).

## Ideas Explored

### Scenario A: query() Spawns Fresh MCP Server Each Call

**What if** the Agent SDK spawns a new stdio MCP server for every `query()` call?

**Implications:**
- Startup time paid on every message (100ms+ per message = poor UX)
- Constant spawn/kill cycle wastes resources
- Guild Hall's stdio server + Agent SDK's stdio server = 2x processes per message
- Tool caching becomes critical (can't rely on agent "remembering" tools)

**Verdict**: If true, this makes stdio untenable for production use.

### Scenario B: query() Keeps MCP Server Running Between Calls

**What if** the Agent SDK keeps stdio MCP servers alive across multiple `query()` calls?

**Implications:**
- Persistent processes consume memory even when idle
- Cleanup timing unclear (on session expire? never?)
- Guild Hall stdio + Agent SDK stdio = 2 long-running servers
- Tool list divergence possible if plugin updates between calls

**Verdict**: Better than Scenario A, but still wastes resources and risks inconsistency.

### Scenario C: HTTP/SSE Transport (CHOSEN APPROACH)

**Decision**: Disallow stdio and force all MCP servers to be HTTP/SSE services.

**How it works:**
- Plugin manifest specifies `"transport": "http"` + `"command": "bun run server.ts --port ${PORT}"`
- Guild Hall starts the HTTP server as a subprocess, manages lifecycle
- Guild Hall allocates ports from 50000-51000 range
- Both Guild Hall and Agent SDK connect to `http://localhost:${PORT}`
- No duplicate processes, guaranteed consistency

**Design decisions made:**

1. **Eager loading**: Start all MCP servers on roster initialization (not lazy)
   - Simpler design (no on-demand spawning complexity)
   - Slower initial load (acceptable - server restarts weekly, not per-session)
   - Servers always running = agent always has fresh tools

2. **Port management**: Guild Hall allocates from 50000-51000 range
   - Plugins MUST accept `--port` argument
   - Guild Hall substitutes `${PORT}` in manifest args before spawning
   - PortAllocator tracks used ports, prevents conflicts

3. **Remove stdio entirely**: Not "HTTP alongside stdio", but "HTTP only"
   - No plugins exist yet, so no migration cost
   - Simpler codebase (one factory, not two)
   - Clear architecture (no "which transport should I use?" decisions)

4. **Security**: Localhost-only + port range restriction
   - All servers bind to 127.0.0.1 (no external access)
   - Port range 50000-51000 can be firewalled (Omarchy scripts)
   - Guild Hall controls all subprocesses (no rogue servers)

**Why the "cons" don't matter:**
- **Complexity**: HTTP support was always on the roadmap, just moving it earlier
- **Port management**: Solvable with PortAllocator + `${PORT}` substitution
- **Plugin author burden**: No plugins exist yet, so no migration pain
- **Security surface**: Localhost + port range + firewall mitigates risk
- **Migration cost**: There are no plugins to migrate

### Scenario D: Proxy Pattern (Rejected)

**What if** Guild Hall starts stdio MCP server and exposes it via HTTP internally?

**Rejected because:**
- Added complexity (build and maintain proxy layer)
- Extra latency (HTTP → proxy → stdio → proxy → HTTP)
- Harder debugging (tracing across proxy boundary)
- If we're going HTTP anyway, just go HTTP end-to-end

### Scenario E: Accept Duplicate Stdio (Rejected)

**What if** we just accept duplicate stdio processes and document the limitation?

**Rejected because:**
- Wastes resources (2x processes)
- Divergence risk (two servers could disagree)
- Startup cost (if Agent SDK spawns fresh each time)
- Cache staleness (Guild Hall's cache might not match agent's tools)
- No upside except "simpler short-term" (but we're building for production)

## Manifest Changes

**Before (stdio):**
```json
{
  "mcp": {
    "transport": "stdio",
    "command": "bun",
    "args": ["run", "server.ts"],
    "env": {}
  }
}
```

**After (HTTP):**
```json
{
  "mcp": {
    "transport": "http",
    "command": "bun",
    "args": ["run", "server.ts", "--port", "${PORT}"],
    "env": {}
  }
}
```

Guild Hall substitutes `${PORT}` with allocated port before spawning.

## MCPServerFactory Interface Changes

**Before (stdio-only):**
```typescript
interface MCPServerFactory {
  spawn(config: {
    command: string;
    args: string[];
    env?: Record<string, string>;
    pluginDir: string;
    onCrash?: (error: string) => void;
  }): Promise<MCPServerHandle>;
}
```

**After (HTTP-only):**
```typescript
interface MCPServerFactory {
  spawn(config: {
    command: string;
    args: string[];
    env?: Record<string, string>;
    pluginDir: string;
    port: number; // Allocated by Guild Hall
    onCrash?: (error: string) => void;
  }): Promise<MCPServerHandle>;
}
```

No `transport` field needed since stdio is removed entirely.

## Agent SDK Configuration Changes

**Before (stdio):**
```typescript
const response = await query({
  prompt: userMessage,
  mcp: {
    "example": {
      command: "bun",
      args: ["run", "guild-members/example/server.ts"],
    }
  }
});
```

**After (HTTP):**
```typescript
const response = await query({
  prompt: userMessage,
  mcp: {
    "example": {
      url: "http://localhost:50000"
    }
  }
});
```

**Key insight**: Agent SDK doesn't start the MCP server, just connects to it!

## Port Allocation Strategy

```typescript
class PortAllocator {
  private usedPorts = new Set<number>();
  private readonly minPort = 50000;
  private readonly maxPort = 51000;

  allocate(): number {
    for (let port = this.minPort; port <= this.maxPort; port++) {
      if (!this.usedPorts.has(port)) {
        this.usedPorts.add(port);
        return port;
      }
    }
    throw new Error("No ports available in range 50000-51000");
  }

  release(port: number): void {
    this.usedPorts.delete(port);
  }
}
```

MCPManager would own the PortAllocator and allocate ports when starting servers.

## Tool Caching Implications

With HTTP transport and eager loading, **tool caching becomes simpler**:

**New flow:**
1. On roster initialization, start all MCP HTTP servers (allocate ports, spawn processes)
2. Call `GET /tools` (or equivalent HTTP endpoint) to populate roster
3. Keep servers running for the session
4. Cache tools to disk for next startup (version-based invalidation)
5. Agent SDK connects to already-running servers (no startup delay)

**Trade-offs:**
- **Pro**: No lazy start complexity (servers always running)
- **Pro**: Fast roster load (HTTP requests, no process spawning)
- **Pro**: Agent sees fresh tools always (no stale cache risk)
- **Con**: All servers running all the time (memory footprint - acceptable for weekly restarts)
- **Con**: Slower initial startup (spawn all servers upfront - acceptable tradeoff)

## Open Questions

1. ~~**HTTP vs SSE**: Do we need streaming (SSE) or is plain HTTP enough?~~ → **RESOLVED: Plain HTTP to start, SSE later if needed**
   - Reasoning: Most operations (email search, get, send) are fast enough (< 5s)
   - JMAP protocol is request/response, not streaming
   - Agent can't act on partial results anyway
   - SSE could help UX for bulk operations (progress indication), but not essential for MVP
   - Hybrid approach: Plugins MUST support plain HTTP, MAY add SSE later for progress

2. **Does Agent SDK HTTP transport work?**: We assume it does based on research doc, but haven't validated
   - Not a blocker: if it doesn't work, we make it work
   - Approach: figure out how to make it work, not "validate it works first"

3. **What's the HTTP MCP protocol?**: How does the server expose tools over HTTP?
   - Need to research MCP spec or Agent SDK examples
   - Likely: `GET /tools` returns tool list, `POST /invoke` calls tools

4. **How do we handle server crashes?**: If HTTP server dies, what happens?
   - Same onCrash callback pattern as stdio
   - Could add health check endpoint (`GET /health`)
   - Auto-restart on crash (with backoff)

5. **What about tool list changes mid-session?**: If HTTP server is updated while running, do tools change?
   - Not relevant: server only restarts weekly
   - If plugin updates, server needs restart (handled by deployment process)

## Next Steps

1. ~~Decide eager vs lazy loading~~ → **Decided: Eager**
2. ~~Decide stdio vs HTTP~~ → **Decided: HTTP only**
3. **Decide HTTP vs SSE** → Discuss after saving brainstorm
4. **Update mcp-server-factory spec** → New spec for HTTP transport
5. **Implement HTTP factory** → `createHttpMCPFactory()`, remove stdio factory
6. **Update example plugin** → Implement HTTP server instead of stdio
7. **Update tool caching spec** → Simplify based on eager HTTP loading

## Resolved Decisions

- **Transport**: Plain HTTP only (stdio removed, SSE deferred)
- **Loading**: Eager (start all servers on roster initialization)
- **Port range**: 50000-51000, managed by PortAllocator
- **Plugin requirement**: Must accept `--port` argument
- **Security**: Localhost-only, firewall-ready port range
- **Migration**: No cost (no plugins exist yet)
- **HTTP vs SSE**: Start with plain HTTP, add SSE later if bulk operations need progress indication
