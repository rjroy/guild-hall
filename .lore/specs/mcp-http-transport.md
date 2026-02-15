---
title: HTTP MCP Transport Integration
date: 2026-02-14
status: draft
tags: [mcp, http, json-rpc, transport, plugin-system, phase-1]
modules: [mcp-manager, server-context, plugin-discovery]
related:
  - .lore/brainstorm/mcp-transport-stdio-vs-http.md
  - .lore/research/mcp-http-protocol.md
  - .lore/specs/guild-hall-phase-1.md
req-prefix: MCP-HTTP
---

# Spec: HTTP MCP Transport Integration

## Overview

Guild Hall's HTTP MCP transport enables plugins to expose tools via HTTP endpoints using JSON-RPC over HTTP POST. Guild Hall controls MCP server lifecycle (eager loading on roster initialization), allocates ports from a managed range (20000-30000), and configures the Claude Agent SDK to connect to these HTTP endpoints. This replaces the stdio transport approach, eliminating duplicate process spawning and enabling simpler server management.

**Note**: This implements a simplified subset of MCP's Streamable HTTP specification. Full Streamable HTTP includes GET for server-initiated messages and SSE responses for streaming. Phase I uses POST-only with plain JSON responses. SSE streaming is deferred to future phases.

## Entry Points

How users arrive at this feature:
- **Roster initialization** (from Page Load): When the roster UI loads, Guild Hall starts all MCP servers, calls tools/list on each, and populates the roster with available tools
- **Direct tool invocation** (from Roster UI): User clicks a tool in the Roster without entering a session, triggering tool execution via HTTP POST to the plugin's MCP endpoint
- **Session creation** (from Session UI): When a session is created with guild members, Agent SDK is configured with HTTP MCP endpoints for selected plugins

## Requirements

### Plugin Manifest

- REQ-MCP-HTTP-1: Plugin manifests MUST specify transport type via `"transport": "http"` field
- REQ-MCP-HTTP-2: Plugin manifests MUST specify `command` field (executable to start HTTP server)
- REQ-MCP-HTTP-3: Plugin manifests MAY specify `args` array, which MUST support `${PORT}` substitution
- REQ-MCP-HTTP-4: Plugin manifests MAY specify `env` object for environment variables passed to the HTTP server process

Example manifest:
```json
{
  "name": "example",
  "version": "1.0.0",
  "transport": "http",
  "command": "bun",
  "args": ["run", "server.ts", "--port", "${PORT}"],
  "env": {
    "NODE_ENV": "production"
  }
}
```

### Port Allocation

- REQ-MCP-HTTP-5: Guild Hall MUST allocate ports from the range 20000-30000
- REQ-MCP-HTTP-6: If a port is unavailable (EADDRINUSE), Guild Hall MUST try the next port in sequence
- REQ-MCP-HTTP-7: If all ports in the range are exhausted, server spawn MUST fail with descriptive error message
- REQ-MCP-HTTP-8: Each plugin MUST receive a unique port (one port per plugin)
- REQ-MCP-HTTP-9: Guild Hall MUST substitute `${PORT}` in manifest `args` with the allocated port number
- REQ-MCP-HTTP-10: Port allocation MUST persist for the lifetime of the MCP server process
- REQ-MCP-HTTP-11: Ports MUST be deallocated when the MCP server process stops

### HTTP Server Lifecycle

- REQ-MCP-HTTP-10: Roster initialization occurs when MCPManager is created during backend startup. During roster initialization, Guild Hall MUST start all MCP servers (eager loading)
- REQ-MCP-HTTP-11: MCP server processes MUST be spawned with current working directory set to `pluginDir` (working directory contract)
- REQ-MCP-HTTP-12: After spawning, Guild Hall MUST verify the server is ready by completing the JSON-RPC initialize handshake. The initialize handshake serves as both initialization AND health verification (no separate health endpoint required)
- REQ-MCP-HTTP-13: The initialize handshake consists of 3 steps: (1) POST initialize request with client capabilities, (2) receive initialize response with server capabilities, (3) POST initialized notification
- REQ-MCP-HTTP-14: If the initialize handshake fails or times out (5 seconds), guild member status MUST be set to "error" with descriptive error message, and the server process MUST be terminated
- REQ-MCP-HTTP-15: Guild Hall MUST stop all MCP servers gracefully on roster unload
- REQ-MCP-HTTP-16: Guild Hall MUST detect server process exits via event listener (process.on('exit')). Any exit (zero or non-zero exit code, signal termination) is treated as a crash unless Guild Hall explicitly stopped the server
- REQ-MCP-HTTP-17: When a server process crashes, guild member status MUST be set to "error" and the port MUST be deallocated
- REQ-MCP-HTTP-18: Guild Hall MUST capture stderr from MCP server processes and log it to console for debugging

### Health Monitoring

- REQ-MCP-HTTP-19: Before invoking a tool on a server that is not running, Guild Hall MUST start the server and complete the initialize handshake (which serves as health verification)
- REQ-MCP-HTTP-20: The initialize handshake MUST have a timeout of 5 seconds. On timeout, the HTTP request is aborted, guild member status is set to "error", and the server process is terminated
- REQ-MCP-HTTP-21: Guild Hall does not perform proactive health checks beyond the initialize handshake. Server health is verified only at startup and before first tool invocation on a stopped server

### JSON-RPC Protocol

- REQ-MCP-HTTP-22: MCP servers MUST expose a single HTTP endpoint at `http://localhost:{PORT}/mcp`
- REQ-MCP-HTTP-23: The endpoint MUST accept POST requests with `Content-Type: application/json`
- REQ-MCP-HTTP-24: All requests MUST include `MCP-Protocol-Version: 2025-06-18` header
- REQ-MCP-HTTP-25: Guild Hall MUST implement the initialize handshake (3 steps):
  1. POST initialize request with client capabilities
  2. Receive initialize response with server capabilities
  3. POST initialized notification
- REQ-MCP-HTTP-26: Guild Hall MUST implement tools/list method to discover available tools
- REQ-MCP-HTTP-27: Guild Hall MUST implement tools/call method to invoke tools
- REQ-MCP-HTTP-28: Tool invocations MUST have a default timeout of 30 seconds. On timeout, the HTTP request is aborted and an error is returned to the caller. The server process is not terminated
- REQ-MCP-HTTP-29: Guild Hall MUST distinguish between protocol errors (JSON-RPC error object) and tool execution errors (result with `isError: true`)

### Security

- REQ-MCP-HTTP-30: MCP servers MUST bind to 127.0.0.1 (localhost only, not 0.0.0.0)
- REQ-MCP-HTTP-31: Guild Hall MUST validate Origin header to prevent DNS rebinding attacks
- REQ-MCP-HTTP-32: Ports MUST only be allocated from the managed range 20000-30000

### Agent SDK Integration

- REQ-MCP-HTTP-33: Guild Hall MUST configure Agent SDK with HTTP MCP servers using format:
```typescript
{
  type: "http",
  url: "http://localhost:{PORT}/mcp"
}
```
- REQ-MCP-HTTP-34: Guild Hall MCP servers MUST be used for direct tool invocation from Roster
- REQ-MCP-HTTP-35: Agent SDK MAY manage its own MCP connections during query sessions (Guild Hall does not prevent this)

### Tool Discovery

- REQ-MCP-HTTP-36: After successful health check, Guild Hall MUST call tools/list to retrieve available tools
- REQ-MCP-HTTP-37: Guild Hall MUST populate `member.tools` with the tool list for roster display
- REQ-MCP-HTTP-38: Tools MUST be immediately visible to agents (no caching needed with eager loading)
- REQ-MCP-HTTP-39: If tools/list fails, guild member status MUST be set to "error"

### Error Handling

- REQ-MCP-HTTP-40: Server spawn failures (command not found, permission denied) MUST set guild member status to "error" with descriptive message
- REQ-MCP-HTTP-41: HTTP connection failures (connection refused, timeout) MUST set guild member status to "error" with descriptive message
- REQ-MCP-HTTP-42: Protocol errors (malformed JSON-RPC) MUST be logged and surfaced to the user
- REQ-MCP-HTTP-43: Tool execution errors (result with `isError: true`) MUST be returned to the caller without changing guild member status
- REQ-MCP-HTTP-44: All errors MUST include the guild member name for identification

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| SSE streaming | Long-running tools need progress indication (bulk operations, video generation) | [STUB: mcp-sse-streaming] |
| Session management | Stateful operations require session tracking across multiple requests | [STUB: mcp-session-management] |
| Per-tool timeout config | Specific tools need timeout overrides (e.g., 30-minute video generation) | [STUB: per-tool-timeout-config] |
| UI component registration | Plugins provide React components for custom roster UI | [STUB: ui-component-registry] |

## Success Criteria

How we know this is done:

- [ ] Example plugin runs as HTTP MCP server accepting JSON-RPC requests
- [ ] Roster displays tools from HTTP MCP server on initialization (eager loading)
- [ ] User can invoke a tool from Roster (direct invocation without session)
- [ ] Agent SDK connects to Guild Hall's HTTP MCP endpoint during sessions
- [ ] Multiple plugins run concurrently with different allocated ports
- [ ] Port collision handling works (if port occupied, tries next port)
- [ ] Server crash (process exit) updates guild member status to "error" immediately
- [ ] Initialize handshake timeout (5s) sets status to "error" and terminates process
- [ ] Tool invocation timeout (30s) aborts request and returns error without killing server
- [ ] Protocol errors are logged to console with guild member context
- [ ] Working directory contract verified (plugin can read files relative to pluginDir)
- [ ] Port substitution works (${PORT} replaced with allocated port number)

## AI Validation

How the AI verifies completion before declaring done.

**Defaults** (apply unless overridden):
- Unit tests with mocked time/network/filesystem/LLM calls (including Agent SDK `query()`)
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom** (feature-specific):
- Integration test that starts actual HTTP MCP server and calls tools via HTTP POST
- Test that verifies working directory contract (plugin reads `./test-file.txt`)
- Test that verifies port allocation and `${PORT}` substitution in command args
- Test that verifies port collision handling (occupies port 20000, confirms allocation tries 20001)
- Test that verifies JSON-RPC message format compliance (initialize, tools/list, tools/call)
- Test that verifies initialize handshake timeout (5s) terminates process and sets error status
- Test that verifies tool invocation timeout (30s) aborts request without killing server
- Test that verifies concurrent plugins receive unique ports
- Test that verifies crash detection via process exit event

## Constraints

Boundaries and limitations for Phase I:

- HTTP POST/JSON only (no SSE streaming). Full Streamable HTTP support (GET for server-initiated messages, SSE responses) deferred to future phases
- Stateless (no session management via Mcp-Session-Id header)
- Plain JSON responses (no streaming)
- Focus on tools/list and tools/call methods (resources/prompts/sampling deferred)
- Default timeouts only (5s initialize handshake, 30s tool invocation)
- Crash detection via process exit events (no proactive health monitoring beyond initialize handshake)
- Guild Hall controls port allocation (plugins cannot choose their own ports)
- One MCP server process per plugin (no process pooling)

## Context

### Related Lore

**Brainstorm: MCP Transport - Stdio vs HTTP/SSE** (.lore/brainstorm/mcp-transport-stdio-vs-http.md)
- Architectural decision to use HTTP transport instead of stdio
- Rationale: eliminates duplicate processes (Guild Hall + Agent SDK both spawning servers)
- Eager loading chosen over lazy loading for simpler tool discovery
- Port allocation strategy: 20000-30000 range, `${PORT}` substitution in manifest args

**Research: MCP HTTP Protocol and Claude Agent SDK Integration** (.lore/research/mcp-http-protocol.md)
- Complete MCP Streamable HTTP transport specification (POST + GET with SSE)
- Phase I implements POST-only subset with plain JSON responses
- JSON-RPC message formats for initialize, tools/list, tools/call
- Security requirements: Origin validation, localhost binding
- Agent SDK HTTP configuration pattern: `{ type: "http", url: "..." }`
- Protocol version: 2025-06-18 for tools, 2025-03-26 for lifecycle

**Spec: Guild Hall Phase I** (.lore/specs/guild-hall-phase-1.md)
- Direct tool invocation requirement (REQ-GH1-8, REQ-GH1-29)
- MCP-only plugins for Phase I (UI components deferred)
- Plugin manifest format and discovery from `guild-members/` directory

**Brainstorm: Plugin Architecture - Hybrid Model** (.lore/brainstorm/plugin-architecture-hybrid.md)
- Established hybrid model: MCP servers (code isolation) + React components (UI integration)
- MCP server = backend/logic, React component = frontend/UX
- Phase I implements MCP-only, UI components deferred to future phases

**Retro: Guild Hall Phase I** (.lore/retros/guild-hall-phase-1.md)
- Lessons on SSE integration testing and navigation between views
- Note that Agent SDK manages its own MCP servers during queries
- MCPServerFactory primarily serves user-directed tool invocation from Roster

### Superseded Specs

**Spec: MCPServerFactory - Stdio Implementation** (.lore/specs/mcp-server-factory.md)
- Status: superseded by HTTP transport decision
- Complete stdio implementation executed through Phase 9, then reverted
- Manual testing revealed architectural issues: duplicate processes, chicken-and-egg tool discovery
- Implementation learnings preserved in notes for future reference

**Spec: MCP Tool Caching** (.lore/specs/mcp-tool-caching.md)
- Status: superseded by HTTP eager loading approach
- Chicken-and-egg problem analysis remains valid (tools invisible until server starts)
- Solution: eager loading instead of caching (HTTP transport enables this)
