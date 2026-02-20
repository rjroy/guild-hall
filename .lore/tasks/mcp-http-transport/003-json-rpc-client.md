---
title: Implement JSON-RPC client for MCP HTTP protocol
date: 2026-02-14
status: complete
tags: [task]
source: .lore/plans/mcp-http-transport.md
related: [.lore/specs/phase-1/mcp-http-transport.md]
sequence: 3
modules: [json-rpc-client]
---

# Task: Implement JSON-RPC Client

## What

Create `JsonRpcClient` class in `lib/json-rpc-client.ts` that handles HTTP communication with MCP servers using JSON-RPC protocol.

Methods:
- `initialize(clientInfo)`: 3-step handshake (POST initialize request, receive response, POST initialized notification). Timeout: 5s.
- `listTools()`: POST tools/list request. Timeout: 30s. Returns array of tool info.
- `invokeTool(name, args)`: POST tools/call request. Timeout: 30s. Throws on `isError: true`.
- `call(method, params, timeout)`: Private method that sends JSON-RPC POST, enforces timeout via `AbortController`, handles HTTP errors and JSON-RPC error objects
- `notify(method)`: Private method that sends notification (no response expected)

Protocol details:
- All requests to `baseUrl` (e.g., `http://localhost:50000/mcp`)
- Headers: `Content-Type: application/json`, `MCP-Protocol-Version: 2025-06-18`
- Request body: `{ jsonrpc: "2.0", id: Date.now(), method, params }`
- Notifications omit `id` field
- Distinguish JSON-RPC protocol errors (`result.error`) from tool execution errors (`result.isError`)

Timeout behavior:
- `AbortController` cancels fetch on timeout
- Cleanup: `clearTimeout` in finally block
- Initialize timeout (5s) will cause factory to kill process
- Tool invocation timeout (30s) aborts request, server process continues running

## Validation

Unit tests in `tests/lib/json-rpc-client.test.ts` (mock fetch):
- Initialize succeeds and sends initialized notification
- listTools parses tool array from response
- invokeTool returns result on success
- invokeTool throws on `isError: true`
- call() throws on HTTP error status (e.g., 500)
- call() throws on JSON-RPC error object (`result.error`)
- call() throws on timeout (request aborted)
- Timeout cleanup verified (clearTimeout called on success and failure)

## Why

From `.lore/specs/phase-1/mcp-http-transport.md`:
- REQ-MCP-HTTP-22: "MCP servers MUST expose a single HTTP endpoint at `http://localhost:{PORT}/mcp`"
- REQ-MCP-HTTP-23: "The endpoint MUST accept POST requests with `Content-Type: application/json`"
- REQ-MCP-HTTP-24: "All requests MUST include `MCP-Protocol-Version: 2025-06-18` header"
- REQ-MCP-HTTP-25: "Guild Hall MUST implement the initialize handshake (3 steps)"
- REQ-MCP-HTTP-26: "Guild Hall MUST implement tools/list method"
- REQ-MCP-HTTP-27: "Guild Hall MUST implement tools/call method"
- REQ-MCP-HTTP-28: "Tool invocations MUST have a default timeout of 30 seconds. On timeout, the HTTP request is aborted and an error is returned to the caller. The server process is not terminated"
- REQ-MCP-HTTP-29: "Guild Hall MUST distinguish between protocol errors (JSON-RPC error object) and tool execution errors (result with `isError: true`)"

## Files

- `lib/json-rpc-client.ts` (create)
- `tests/lib/json-rpc-client.test.ts` (create)
