---
title: Add Origin header validation for security
date: 2026-02-14
status: complete
tags: [task]
source: .lore/_archive/phase-1/plans/mcp-http-transport.md
related: [.lore/_archive/phase-1/specs/mcp-http-transport.md]
sequence: 6
modules: [json-rpc-client]
---

# Task: Add Security and Origin Validation

## What

Add Origin header to all JSON-RPC HTTP requests to prevent DNS rebinding attacks.

Update `JsonRpcClient.call()` in `lib/json-rpc-client.ts`:
- Add `"Origin": "http://localhost"` to request headers

Security verification (no code changes needed):
- Port allocation already enforces 50000-51000 range (PortRegistry, implemented in Task 1)
- Localhost binding enforcement is MCP server responsibility (documented in example plugin, implemented in Task 8)
- No additional validation needed in factory

## Validation

Unit tests in `tests/lib/json-rpc-client.test.ts`:
- Origin header included in all HTTP requests (initialize, listTools, invokeTool)
- Verify fetch calls include `"Origin": "http://localhost"` in headers object

Port range validation:
- Already covered by PortRegistry tests (Task 1)

## Why

From `.lore/_archive/phase-1/specs/mcp-http-transport.md`:
- REQ-MCP-HTTP-30: "MCP servers MUST bind to 127.0.0.1 (localhost only, not 0.0.0.0)"
- REQ-MCP-HTTP-31: "Guild Hall MUST validate Origin header to prevent DNS rebinding attacks"
- REQ-MCP-HTTP-32: "Ports MUST only be allocated from the managed ephemeral range 50000-51000"

Origin header validation prevents malicious websites from making requests to Guild Hall's MCP servers via DNS rebinding. The MCP server can validate the Origin header and reject requests from untrusted origins.

## Files

- `lib/json-rpc-client.ts` (modify - add Origin header)
- `tests/lib/json-rpc-client.test.ts` (modify - verify Origin header present)
