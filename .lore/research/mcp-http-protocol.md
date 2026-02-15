---
title: MCP HTTP Protocol and Claude Agent SDK Integration
date: 2026-02-14
status: active
tags: [mcp, http, sse, streamable-http, protocol, agent-sdk]
modules: [mcp-manager, mcp-server-factory]
related:
  - .lore/brainstorm/mcp-transport-stdio-vs-http.md
---

# Research: MCP HTTP Protocol and Claude Agent SDK Integration

## Summary

The Model Context Protocol (MCP) defines a **Streamable HTTP** transport for connecting AI agents to external tools and data sources. As of March 2025 (protocol version 2025-03-26), MCP deprecated Server-Sent Events (SSE) in favor of Streamable HTTP, though SSE remains supported for legacy servers. The Claude Agent SDK supports both HTTP and SSE transports via simple URL-based configuration.

## Key Findings

### Protocol Evolution

- **MCP Specification Update (March 26, 2025)**: Fundamental shift from SSE to **Streamable HTTP**
- SSE transport is **deprecated** but still supported for legacy servers
- **Recommended transports**: Streamable HTTP or stdio for new integrations
- Current protocol version: `2025-06-18`

### Streamable HTTP Transport

The Streamable HTTP transport is MCP's primary HTTP-based mechanism. It uses:
- **HTTP POST**: Client sends JSON-RPC messages to server
- **HTTP GET**: Client opens SSE stream to receive server-initiated messages
- **Single endpoint**: One URL handles both POST and GET (e.g., `https://example.com/mcp`)
- **Optional SSE**: Server can stream multiple messages or return single JSON response

**Key characteristics:**
- Server operates as independent process handling multiple client connections
- Client sends every JSON-RPC message as a new HTTP POST request
- Server can respond with either single JSON object or SSE stream
- Supports session management via `Mcp-Session-Id` header
- Supports resumability via SSE event IDs and `Last-Event-ID` header

### Message Flow

**Initialization:**
1. Client POSTs `InitializeRequest` to MCP endpoint
2. Server responds with `InitializeResponse` + optional `Mcp-Session-Id` header
3. Client POSTs `InitializedNotification` with session ID (if present)

**Client requests:**
1. Client POSTs JSON-RPC request to MCP endpoint
2. Client includes `Accept: application/json, text/event-stream` header
3. Server either:
   - Returns `Content-Type: application/json` with single response
   - Returns `Content-Type: text/event-stream` to stream multiple messages

**Server-initiated messages:**
1. Client GETs MCP endpoint to open SSE stream
2. Server sends JSON-RPC requests/notifications on stream
3. Either side can close stream at any time

### Session Management

Sessions are **optional** but recommended for stateful servers:

1. Server assigns session ID during initialization via `Mcp-Session-Id` header
2. Session ID must be globally unique and cryptographically secure (UUID, JWT, etc.)
3. Client includes `Mcp-Session-Id` header on all subsequent requests
4. Server responds with `404 Not Found` when session expires
5. Client must reinitialize on 404
6. Client can explicitly terminate via HTTP DELETE to endpoint

### Security Requirements

**Critical for HTTP transport:**

1. **Origin validation**: Servers MUST validate `Origin` header to prevent DNS rebinding attacks
2. **Localhost binding**: Servers SHOULD bind to 127.0.0.1 (not 0.0.0.0) when running locally
3. **Authentication**: Servers SHOULD implement proper authentication for all connections

Without these protections, remote websites could use DNS rebinding to interact with local MCP servers.

### Protocol Version Header

All HTTP requests must include: `MCP-Protocol-Version: 2025-06-18`

Server behavior:
- If header missing: assume protocol version `2025-03-26` (backwards compatibility)
- If header invalid/unsupported: respond with `400 Bad Request`

### Claude Agent SDK Configuration

The Claude Agent SDK supports HTTP/SSE MCP servers via simple configuration:

**TypeScript (in code):**
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Use the remote API",
  options: {
    mcpServers: {
      "remote-api": {
        type: "http",  // or "sse"
        url: "https://api.example.com/mcp",
        headers: {
          Authorization: `Bearer ${process.env.API_TOKEN}`
        }
      }
    },
    allowedTools: ["mcp__remote-api__*"]
  }
})) {
  // Process messages
}
```

**Configuration file (.mcp.json):**
```json
{
  "mcpServers": {
    "remote-api": {
      "type": "http",
      "url": "https://api.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${API_TOKEN}"
      }
    }
  }
}
```

**Key points:**
- `type: "http"` for non-streaming (single response)
- `type: "sse"` for streaming (SSE-based)
- `url`: Full URL to MCP endpoint
- `headers`: Authentication and custom headers (optional)
- Environment variable expansion via `${VAR_NAME}` syntax

### Transport Type Selection

**How to choose:**
- Server docs give **command to run** (e.g., `npx @org/server`) → use stdio
- Server docs give **URL** → use HTTP or SSE
- Building custom tools in-app → use SDK MCP server (in-process)

**HTTP vs SSE:**
- Use `type: "http"` for simple request/response (no streaming needed)
- Use `type: "sse"` for long-running operations needing progress updates
- Most operations are fast enough for plain HTTP

### Tool Discovery and Permissions

**Tool naming convention:** `mcp__<server-name>__<tool-name>`

Example: Server named `"github"` with `list_issues` tool → `mcp__github__list_issues`

**Permission grant:**
```typescript
options: {
  mcpServers: { /* servers */ },
  allowedTools: [
    "mcp__github__*",              // All tools from github server
    "mcp__db__query",              // Specific tool from db server
  ]
}
```

Wildcards (`*`) allow all tools from a server without listing each individually.

### Connection Status

Agent SDK emits `system` message with `subtype: "init"` containing connection status:

```typescript
if (message.type === "system" && message.subtype === "init") {
  const failedServers = message.mcp_servers.filter(
    s => s.status !== "connected"
  );
  if (failedServers.length > 0) {
    console.warn("Failed to connect:", failedServers);
  }
}
```

**Failure causes:**
- Missing environment variables (credentials)
- Server not reachable (network, firewall)
- Invalid connection string (for database servers)
- Authentication failure

### MCP Tool Search

For large tool sets, MCP tool search loads tools on-demand instead of preloading all:

- Auto-activates when MCP tools exceed 10% of context window
- Tools marked with `defer_loading: true`
- Claude uses search tool to discover relevant MCP tools
- Only needed tools loaded into context

**Configuration:**
```typescript
env: {
  ENABLE_TOOL_SEARCH: "auto",     // Default: 10% threshold
  ENABLE_TOOL_SEARCH: "auto:5",   // Custom: 5% threshold
  ENABLE_TOOL_SEARCH: "true",     // Always enabled
  ENABLE_TOOL_SEARCH: "false"     // Disabled, load all upfront
}
```

**Requirements:** Sonnet 4+, Opus 4+ (not Haiku - lacks `tool_reference` support)

## Implementation Implications for Guild Hall

Based on this research, Guild Hall's HTTP MCP implementation should:

1. **Single HTTP endpoint** at `http://localhost:{PORT}/mcp` supporting both POST and GET
2. **POST handler**: Receive JSON-RPC requests, respond with either:
   - `Content-Type: application/json` + single response (simpler, recommended for MVP)
   - `Content-Type: text/event-stream` + SSE stream (for future progress indication)
3. **GET handler**: Optional SSE stream for server-initiated messages (defer to future)
4. **Session management**: Optional `Mcp-Session-Id` header (may not be needed for stateless tools)
5. **Protocol version header**: Check for `MCP-Protocol-Version: 2025-06-18`
6. **Security**:
   - Validate `Origin` header (prevent DNS rebinding)
   - Bind to 127.0.0.1 (not 0.0.0.0)
   - Port range 20000-30000 (Guild Hall-managed)
7. **Agent SDK config**: Pass `{ type: "http", url: "http://localhost:{PORT}/mcp" }`

**Recommended MVP approach:**
- Plain HTTP (not SSE) for simplicity
- Single JSON response per POST (no streaming)
- Stateless (no session management initially)
- Focus on `tools/list` and `tools/call` JSON-RPC methods

**Future enhancements:**
- Add SSE support for long-running tools (progress indication)
- Add session management for stateful operations
- Add resumability via event IDs

## Sources

- [MCP Transports Specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- [Claude Agent SDK MCP Documentation](https://platform.claude.com/docs/en/agent-sdk/mcp)
- [Why MCP Deprecated SSE and Went with Streamable HTTP](https://blog.fka.dev/blog/2025-06-06-why-mcp-deprecated-sse-and-go-with-streamable-http/)
- [Cloudflare Agents MCP Transport](https://developers.cloudflare.com/agents/model-context-protocol/transport/)
- [Roo Code MCP Server Transports](https://docs.roocode.com/features/mcp/server-transports)
- [Understanding MCP Recent Change Around HTTP+SSE](https://blog.christianposta.com/ai/understanding-mcp-recent-change-around-http-sse/)

## Notes

### Key Takeaway

The MCP Streamable HTTP protocol is simpler than expected:
- **Client → Server**: HTTP POST with JSON-RPC request
- **Server → Client**: Either JSON response or SSE stream
- **Authentication**: Standard HTTP headers
- **Session**: Optional via custom header

**For Guild Hall's use case** (local plugins, simple tools), we can start with:
- Plain HTTP (no SSE)
- Single JSON responses (no streaming)
- No session management (stateless)
- Standard JSON-RPC over HTTP

This is much simpler than the stdio approach (no process lifecycle complexity, no stdin/stdout parsing, no stderr capture) and aligns perfectly with the brainstorm decision to use HTTP transport.

### Open Questions

1. **Which JSON-RPC methods are required?** Need to research MCP core protocol spec to understand:
   - `tools/list` → list available tools
   - `tools/call` → invoke a tool
   - Any other required methods?

2. **What's the exact JSON-RPC message format?** Need examples of:
   - `ListToolsRequest` / `ListToolsResponse`
   - `CallToolRequest` / `CallToolResponse`
   - Error responses

3. **Do we need resources?** MCP supports both tools and resources. Guild Hall focuses on tools initially.

4. **Session vs stateless?** For simple tools (email search, reverse string), stateless is fine. For stateful operations (database transactions), sessions may be needed.

### Next Steps

1. Research MCP JSON-RPC protocol spec (methods, message format)
2. Create HTTP transport spec for Guild Hall
3. Update example plugin to be HTTP server
4. Implement HTTP MCP factory
