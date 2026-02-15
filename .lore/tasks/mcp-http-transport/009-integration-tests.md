---
title: Write integration tests for HTTP MCP transport
date: 2026-02-14
status: complete
tags: [task]
source: .lore/plans/mcp-http-transport.md
related: [.lore/specs/mcp-http-transport.md]
sequence: 9
modules: [integration-tests]
---

# Task: Write Integration Tests

## What

Create comprehensive integration test suite in `tests/integration/http-mcp-transport.test.ts` that verifies end-to-end HTTP MCP transport functionality with actual HTTP server processes.

Test scenarios:
1. **Basic tool invocation**: Spawn example server, call echo and reverse tools, verify results
2. **Working directory contract**: Plugin can read files relative to `pluginDir` (add test file to example plugin directory)
3. **Port collision handling**: Manually occupy port 50000, spawn plugin, verify it gets port 50001
4. **Concurrent plugins**: Spawn two plugins simultaneously, verify both work with unique ports
5. **Initialize timeout**: Mock JSON-RPC client to delay initialize response beyond 5s, verify spawn fails and process is killed
6. **Tool invocation timeout**: Mock tool that sleeps 31 seconds, verify invokeTool throws timeout error, verify server process still running (call another tool)
7. **Crash detection**: Spawn server, manually kill process, verify crash listener triggers and sets error status within 1 second
8. **Agent SDK integration**: Create session with guild member, verify Agent SDK can invoke tools via HTTP endpoint

Test setup:
- Use actual `HttpMCPFactory`, `PortRegistry`, `JsonRpcClient`
- Spawn real example server processes
- Clean up processes in `afterEach` or `afterAll`
- Use temporary test files for working directory verification

## Validation

All tests pass:
- listTools returns echo and reverse tools
- echo tool works (returns input text)
- reverse tool works (returns reversed text)
- Working directory contract verified (plugin reads test file)
- Port collision retry works (allocates next port)
- Concurrent plugins get unique ports
- Initialize timeout kills process and throws error
- Tool timeout aborts request, server continues running
- Crash detection updates status immediately
- Agent SDK can invoke tools via HTTP

Coverage:
- Integration tests cover all success criteria from spec
- Edge cases covered: timeouts, crashes, collisions, concurrent access

## Why

From `.lore/specs/mcp-http-transport.md`, AI Validation section:
- "Integration test that starts actual HTTP MCP server and calls tools via HTTP POST"
- "Test that verifies working directory contract (plugin reads `./test-file.txt`)"
- "Test that verifies port allocation and `${PORT}` substitution in command args"
- "Test that verifies port collision handling"
- "Test that verifies JSON-RPC message format compliance"
- "Test that verifies initialize handshake timeout (5s) terminates process"
- "Test that verifies tool invocation timeout (30s) aborts request without killing server"
- "Test that verifies concurrent plugins receive unique ports"
- "Test that verifies crash detection via process exit event"

Success Criteria:
- "Multiple plugins run concurrently with different allocated ports"
- "Port collision handling works"
- "Server crash updates guild member status immediately"
- "Initialize handshake timeout sets status to error and terminates process"
- "Tool invocation timeout aborts request and returns error without killing server"
- "Working directory contract verified"

## Files

- `tests/integration/http-mcp-transport.test.ts` (create)
- `guild-members/example/test-file.txt` (create - for working directory test)
