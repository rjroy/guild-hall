---
title: Implement example plugin HTTP server
date: 2026-02-14
status: complete
tags: [task]
source: .lore/plans/mcp-http-transport.md
related: [.lore/specs/mcp-http-transport.md]
sequence: 8
modules: [example-guild-member]
---

# Task: Implement Example Plugin HTTP Server

## What

Rewrite example plugin in `guild-members/example/server.ts` to use HTTP transport with JSON-RPC protocol.

Server implementation:
- Parse `--port` from command line arguments
- Bind to `127.0.0.1:{PORT}` (localhost only, not 0.0.0.0)
- Single endpoint at `/mcp` accepting POST requests
- Parse JSON-RPC request body, call `server.handleRequest()`
- Return JSON-RPC response
- Same tools as stdio version: `echo` (returns input text) and `reverse` (reverses input text)

EADDRINUSE handling:
- Listen for `error` event on HTTP server
- If `err.code === "EADDRINUSE"`: log error, exit with code 2
- Other errors: log error, exit with code 1

Manifest update (already done in Task 2):
- `guild-members/example/guild-member.json` includes `"transport": "http"` and args with `${PORT}`

## Validation

Manual testing:
- Run `bun run server.ts --port 50000`
- Verify server binds to `http://127.0.0.1:50000/mcp`
- Send initialize request via curl, verify response
- Send tools/list request, verify echo and reverse tools returned
- Send tools/call request for echo, verify result
- Send tools/call request for reverse, verify result

Integration test (in `tests/integration/http-mcp-transport.test.ts`):
- Spawn example server via factory
- Call `listTools()`, verify echo and reverse tools
- Call `invokeTool("echo", { text: "hello" })`, verify result
- Call `invokeTool("reverse", { text: "hello" })`, verify "olleh"

Port collision test:
- Manually bind port 50000 (e.g., start another HTTP server)
- Spawn example plugin
- Verify it allocates port 50001 instead

## Why

From `.lore/specs/mcp-http-transport.md`:
- Success Criteria: "Example plugin runs as HTTP MCP server accepting JSON-RPC requests"
- REQ-MCP-HTTP-22: "MCP servers MUST expose a single HTTP endpoint at `http://localhost:{PORT}/mcp`"
- REQ-MCP-HTTP-23: "The endpoint MUST accept POST requests with `Content-Type: application/json`"
- REQ-MCP-HTTP-30: "MCP servers MUST bind to 127.0.0.1 (localhost only, not 0.0.0.0)"

The exit code contract (exit code 2 for EADDRINUSE) enables the HTTP factory to detect port collisions and retry with a different port.

## Files

- `guild-members/example/server.ts` (modify - rewrite for HTTP transport)
- `guild-members/example/guild-member.json` (already modified in Task 2)
- Manual testing steps documented above
