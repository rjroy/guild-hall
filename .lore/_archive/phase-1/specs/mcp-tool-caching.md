---
title: MCP Tool Caching - Solve Agent Discovery Chicken-and-Egg Problem
date: 2026-02-14
status: superseded
tags: [mcp, caching, tool-discovery, agent-integration, archived]
modules: [mcp-manager, plugin-discovery]
related:
  - .lore/_archive/phase-1/specs/mcp-server-factory.md
  - .lore/_archive/phase-1/specs/guild-hall-phase-1.md
  - .lore/_archive/phase-1/notes/mcp-server-factory.md
  - .lore/_archive/phase-1/brainstorm/mcp-transport-stdio-vs-http.md
req-prefix: MCP-TOOL
---

# Spec: MCP Tool Caching

> **Status**: This spec is superseded by the decision to use HTTP transport with eager loading instead of stdio with lazy loading (see `.lore/_archive/phase-1/brainstorm/mcp-transport-stdio-vs-http.md`). Tool caching may still be needed for fast startup, but the design will be simpler with HTTP. Preserved for historical context - the chicken-and-egg problem analysis remains valid.

## Overview

Enable agents to discover MCP tools before the MCP server starts by caching tool lists to disk and displaying them in the roster. This solves the chicken-and-egg problem where deferred MCP server initialization makes tools invisible to agents (agent can't request tools it doesn't know about).

## Entry Points

- **Roster load** (from Page Load): When the roster UI loads, it should display all discovered guild members with their cached tools, making them visible to both the user and the agent.
- **Plugin discovery** (from Startup): After discovering guild members via `discoverGuildMembers()`, start all MCP servers to populate the tool cache.

## Requirements

### Cache Storage

- REQ-MCP-TOOL-1: Tool cache files MUST be stored in each plugin directory at `guild-members/[plugin-name]/tools-cache.json`
- REQ-MCP-TOOL-2: Cache file format MUST be JSON with fields: `version` (string from manifest), `tools` (array of tool metadata), `cachedAt` (ISO timestamp)
- REQ-MCP-TOOL-3: Tool metadata MUST include `name` (string), `description` (string), and `inputSchema` (JSON schema object) matching MCPServerHandle.listTools() return type

### Cache Population

- REQ-MCP-TOOL-4: On roster initialization, MCPManager MUST attempt to read cached tools for each guild member before starting servers
- REQ-MCP-TOOL-5: After reading cached tools, MCPManager MUST populate `member.tools` from cache immediately so they're visible in the roster
- REQ-MCP-TOOL-6: After roster load completes, MCPManager MUST start all MCP servers in the background to refresh the tool cache
- REQ-MCP-TOOL-7: When starting a server for cache refresh, MCPManager MUST call `listTools()` and write the result to `tools-cache.json`
- REQ-MCP-TOOL-8: Cache refresh MUST happen asynchronously (non-blocking) so roster load remains fast

### Cache Invalidation

- REQ-MCP-TOOL-9: Before using a cached tool list, MCPManager MUST compare the cached `version` field to the plugin manifest's `version` field
- REQ-MCP-TOOL-10: If versions differ, the cache MUST be considered invalid and ignored (wait for server to start and provide fresh tool list)
- REQ-MCP-TOOL-11: If the cache file is missing or malformed, it MUST be ignored without error (wait for server to start)
- REQ-MCP-TOOL-12: After a successful cache refresh, the cache file MUST be atomically written (write to temp file, then rename) to avoid corruption

### Integration with MCPManager

- REQ-MCP-TOOL-13: MCPManager MUST accept an optional `cacheDir` parameter in its constructor (defaults to `guild-members` directory)
- REQ-MCP-TOOL-14: MCPManager MUST expose a new method `refreshToolCaches()` that starts all servers and updates cache files
- REQ-MCP-TOOL-15: `refreshToolCaches()` MUST update `member.tools` for each guild member after successful cache write
- REQ-MCP-TOOL-16: `refreshToolCaches()` MUST emit a `tools_updated` event when cache is refreshed for a member

### Error Handling

- REQ-MCP-TOOL-17: If cache file read fails (permissions, corrupted JSON), log warning and continue without cached tools
- REQ-MCP-TOOL-18: If cache write fails, log error but don't block roster load or tool invocation
- REQ-MCP-TOOL-19: If server start fails during cache refresh, set `member.status = "error"` and preserve cached tools (stale tools better than no tools)
- REQ-MCP-TOOL-20: Cache errors MUST NOT prevent agents from using tools (tool invocation auto-starts servers if needed)

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Agent requests cached tool | Agent invokes tool that was loaded from cache | [Spec: mcp-server-factory] (server auto-starts via MCPManager.invokeTool) |
| Roster displays tools | User expands guild member in UI | [Spec: guild-hall-phase-1] (REQ-GH1-7 tool list display) |
| Cache refresh completes | Background server start finishes | [Spec: mcp-server-factory] (server stops after listTools) |

## Success Criteria

How we know this is done:

- [ ] Roster displays cached tools immediately on load (no waiting for servers to start)
- [ ] Agent can discover and request tools before MCP server starts
- [ ] Cache is populated on first roster load (background server start)
- [ ] Cache is invalidated when plugin version changes
- [ ] Stale cache is ignored and fresh tools are fetched
- [ ] Cache errors don't block roster load or tool invocation
- [ ] Manual testing confirms agent sees tools in roster and can invoke them

## AI Validation

**Defaults apply** (unit tests with mocks, 90%+ coverage, fresh-context review) plus:

**Custom validation**:
- Test that cached tools appear in `member.tools` before server starts
- Test that version mismatch invalidates cache
- Test that corrupted cache is ignored gracefully
- Test that cache refresh updates tools and emits events
- Integration test: verify agent can invoke cached tool, triggering server auto-start

## Constraints

- Cache files live in plugin directories (co-located with manifest)
- Version-based invalidation requires plugin authors to bump version on tool changes
- Eager cache population may slow initial roster load if many plugins exist
- Cache refresh happens in background (roster shows stale tools during refresh)

## Context

**Problem discovered**: During Phase 9 manual testing of MCPServerFactory implementation, the deferred initialization pattern (MCP servers don't start until first use) created a chicken-and-egg problem: tools aren't visible in roster until server starts, but server doesn't start until tool is requested, but agent can't request tool it can't see.

**Architectural precedents**:
- File-based persistence: Sessions stored in `sessions/`, stderr logs in `sessions/logs/[plugin-name]-stderr.log`
- Manifest-based discovery: `plugin-discovery.ts` scans `guild-members/` for `plugin.json`
- Cache invalidation: Claude Code marketplace pattern (caching with version pinning)
- Eager vs lazy loading: VS Code uses lazy activation, but tools need eager loading for agent discovery

**Related findings from lore-researcher**:
- Phase I established deferred initialization for MCP servers to avoid wasted resources
- Agent-native applications research emphasizes "dynamic capability discovery" pattern
- Parity principle: whatever user can do through UI, agent should achieve through tools
- VS Code extensions declare contribution points in manifest that VS Code reads at startup without loading the extension (precedent for cached tool metadata)
