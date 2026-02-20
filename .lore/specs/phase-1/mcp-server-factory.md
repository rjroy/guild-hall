---
title: MCPServerFactory - Stdio MCP Server Process Spawning
date: 2026-02-14
status: superseded
tags: [mcp, process-spawning, stdio, plugin-system, phase-1-completion, archived]
modules: [mcp-manager, server-context]
related:
  - .lore/specs/phase-1/guild-hall-phase-1.md
  - .lore/brainstorm/plugin-architecture-hybrid.md
  - .lore/brainstorm/mcp-transport-stdio-vs-http.md
  - .lore/research/claude-agent-sdk.md
req-prefix: MCPF
---

# Spec: MCPServerFactory - Stdio MCP Server Process Spawning

> **Status**: This spec is superseded by the decision to use HTTP transport instead of stdio (see `.lore/brainstorm/mcp-transport-stdio-vs-http.md`). Preserved for historical context and lessons learned. The stdio implementation was completed and reverted - code is cheap, architecture matters.

## Overview

MCPServerFactory is the production implementation of the factory interface that spawns MCP server processes via stdio transport, enabling direct tool invocation from the Roster (user-directed mode). This completes the final outstanding Phase I success criterion.

The factory spawns plugin processes, manages stdio communication using the MCP SDK's client libraries, and returns handles that can list tools, invoke tools, and stop the process. It implements the working directory contract: spawned processes run with their current working directory set to the plugin directory.

This is the "code isolation" half of Guild Hall's hybrid plugin architecture. UI component registration (in-process React) is future work.

## Entry Points

- **Direct tool invocation from Roster**: User clicks a tool in the Roster without entering a session. The API route (`POST /api/tools/invoke`) calls `mcpManager.invokeTool()`, which uses MCPServerFactory to spawn the MCP server if not already running.
- **Session creation with guild members**: When a session is created, `mcpManager.startServersForSession()` spawns MCP servers for the selected plugins. (Note: Agent SDK manages its own MCP servers during queries, so this is for pre-warming or manual testing.)

## Requirements

### Process Spawning

- REQ-MCPF-1: The factory's `spawn()` method accepts a configuration object: `{ command, args, env?, pluginDir }`.
- REQ-MCPF-2: The factory spawns a child process using Node.js `child_process.spawn()` with the command and arguments from the configuration.
- REQ-MCPF-3: The working directory is set to `pluginDir` before spawning (e.g., for `guild-members/example/`, cwd is `guild-members/example/`).
- REQ-MCPF-4: Environment variables from `env` (if provided) are merged with the parent process's environment and passed to the child process.
- REQ-MCPF-5: If the process fails to spawn (command not found, permission denied, etc.), the factory rejects the spawn promise with a descriptive error.
- REQ-MCPF-6: Spawning has a default timeout of 5 seconds. If the process doesn't start communication within this time, the spawn fails.

### Stdio Communication

- REQ-MCPF-7: The factory uses the MCP SDK's stdio client transport (`@modelcontextprotocol/sdk/client/stdio.js`) to communicate with the spawned process.
- REQ-MCPF-8: The client connects to the process's stdin/stdout for MCP protocol messages.
- REQ-MCPF-9: stderr is captured separately and appended to `sessions/logs/[plugin-name]-stderr.log` (global per plugin, not session-specific).
- REQ-MCPF-10: If the MCP handshake fails (process doesn't respond to initial protocol messages), the spawn fails with a descriptive error.

### MCPServerHandle

- REQ-MCPF-11: The returned handle implements `listTools()`, which calls the MCP server's `tools/list` method and returns a promise resolving to an array of `ToolInfo` objects.
- REQ-MCPF-12: The returned handle implements `invokeTool(toolName, toolInput)`, which calls the MCP server's `tools/call` method and returns a promise resolving to `unknown` (the MCP protocol result value).
- REQ-MCPF-13: Tool invocations have a default timeout of 30 seconds. If a tool doesn't respond within this time, the invocation fails with a timeout error.
- REQ-MCPF-14: The returned handle implements `stop()`, which sends a graceful shutdown message to the MCP server and terminates the process.
- REQ-MCPF-15: Tool invocations are serialized: only one `invokeTool()` call executes at a time per handle. Concurrent calls queue and execute sequentially.

### Process Lifecycle

- REQ-MCPF-16: If the spawned process crashes unexpectedly (exits with non-zero code or signal), the handle emits an error event.
- REQ-MCPF-17: The factory integrates with MCPManager's event system: when a process crashes, it emits `{ type: "error", memberName, error }`.
- REQ-MCPF-18: MCPManager updates the guild member status to "error" when a crash event is received.
- REQ-MCPF-19: When a guild member is in "error" status, the user can trigger a restart (manual, not automatic for Phase I).
- REQ-MCPF-20: Phase I accepts duplicate MCP server processes: factory-spawned servers (for direct tool invocation) and Agent SDK-spawned servers (during session queries) can coexist. This is a stdio transport limitation; future HTTP/SSE transport will enable server sharing.

### Error Handling

- REQ-MCPF-21: All errors (spawn failures, handshake failures, tool invocation failures, crashes) include descriptive error messages that identify the guild member name and the failure mode (e.g., "timeout", "command not found", "permission denied", "protocol error").
- REQ-MCPF-22: Stderr output is captured and made available to the user for debugging, but NOT included in error messages sent to the LLM (to avoid token waste).
- REQ-MCPF-23: The factory distinguishes between temporary failures (timeouts, transient errors) and permanent failures (command not found, protocol mismatch) in error messages.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Per-tool timeout override | A plugin tool needs more than the default 30s timeout (e.g., video generation taking 30 minutes) | [STUB: per-tool-timeout-config] |
| Parallel tool invocation | Multiple tools need to execute concurrently on the same MCP server handle | [STUB: parallel-tool-execution] |
| Auto-retry on crash | Frequent crashes of a plugin suggest auto-restart would improve UX | [STUB: auto-restart-policy] |
| HTTP/SSE transport | Plugins expose MCP servers over HTTP instead of stdio | [STUB: http-sse-transport] |
| Process health monitoring | Need proactive health checks to detect hung servers before user invocation | [STUB: process-health-monitoring] |
| Graceful restart | Need to restart a server without losing in-flight requests or state | [STUB: graceful-restart] |

## Success Criteria

- [ ] User can invoke a tool from the Roster without entering a session, and the tool executes successfully
- [ ] The example plugin's echo/reverse tools work via direct invocation
- [ ] Spawned MCP server processes run with their cwd set to the plugin directory (verified via a test plugin that reads `./test-file.txt`)
- [ ] Process spawn failures (command not found, permission denied) produce clear error messages in the Roster
- [ ] Tool invocation failures (timeout, protocol error) produce clear error messages
- [ ] stderr output from a plugin is captured and stored in `sessions/logs/[plugin-name]-stderr.log`
- [ ] A plugin process that crashes updates the guild member status to "error"
- [ ] Multiple rapid tool invocations on the same plugin are serialized (second waits for first to complete)
- [ ] Stopping a running MCP server (via `handle.stop()`) terminates the process cleanly
- [ ] Default timeouts (5s spawn, 30s tool invocation) work as expected

## AI Validation

**Defaults** (apply unless overridden):
- Unit tests with mocked time/network/filesystem (including child_process.spawn)
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom**:
- Integration test that spawns the example plugin's MCP server and calls echo/reverse tools
- Test that verifies working directory contract (plugin reads a file relative to its directory)
- Test that verifies stderr capture (plugin writes to stderr, output is retrievable)

## Constraints

- Phase I only implements stdio transport. HTTP/SSE transport is a stub.
- Tool invocations are serialized per handle. Parallel execution is a stub.
- No auto-retry on crash. Manual restart only.
- No per-tool timeout override. All tools use the default 30s timeout.
- Process health monitoring is not implemented. Detection happens on invocation failure only.

## Context

### Related Lore

- **Phase I Spec** (`.lore/specs/phase-1/guild-hall-phase-1.md`): REQ-GH1-8 and REQ-GH1-29 define direct tool invocation, which requires MCPServerFactory. This spec completes the final Phase I success criterion.
- **Plugin Architecture Brainstorm** (`.lore/brainstorm/plugin-architecture-hybrid.md`): Established the hybrid model (MCP servers for code isolation, React components for UI integration). MCPServerFactory implements the "code isolation" half.
- **Agent SDK Research** (`.lore/research/claude-agent-sdk.md`): Documents the MCP SDK's stdio transport and client libraries. The factory uses `@modelcontextprotocol/sdk/client/stdio.js`.
- **Phase I Retro** (`.lore/retros/guild-hall-phase-1.md`): Identified MCPServerFactory stub as the only outstanding Phase I item. Noted that the API route, validation, and test infrastructure are already in place.

### Current Implementation State

- **lib/mcp-manager.ts**: Fully implemented with reference counting, event emission, and invokeTool support. Takes an injected MCPServerFactory and delegates all process spawning to it.
- **lib/server-context.ts**: The default production factory is a stub that rejects with "MCP server spawning not yet implemented". Tests use mock factories via dependency injection.
- **guild-members/example/server.ts**: Working MCP server that demonstrates the target runtime behavior. Uses `@modelcontextprotocol/sdk` to implement ListTools and CallTool handlers.

### Working Directory Contract

From `lib/mcp-manager.ts` (MCPServerFactory interface):
> "Implementations MUST set the current working directory to the plugin's directory before spawning the process. This allows plugins to use relative paths in their command/args and server code without knowing their install path."

The factory must honor this contract. Plugin manifests use `"command": "bun", "args": ["run", "server.ts"]` (not `guild-members/example/server.ts`) because the cwd is set to the plugin directory.

### Stderr Logging

Stderr output is captured and appended to `sessions/logs/[plugin-name]-stderr.log`. This is global per plugin (not session-specific), making it easy to diagnose plugin health issues across all sessions. The log persists across server restarts and can be accessed directly via the filesystem or through a future logs API endpoint.
