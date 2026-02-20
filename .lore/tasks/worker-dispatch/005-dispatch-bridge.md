---
title: Create per-plugin dispatch MCP servers (dispatch bridge)
date: 2026-02-17
status: complete
tags: [task]
source: .lore/plans/worker-dispatch.md
related:
  - .lore/specs/phase-1/worker-dispatch.md
  - .lore/research/claude-agent-sdk.md
sequence: 5
modules: [guild-hall-core, mcp-manager, plugin-contract]
---

# Task: Create Per-Plugin Dispatch MCP Servers (Dispatch Bridge)

## What

Create per-plugin dispatch MCP servers that bridge the main agent to worker-capable plugins. This uses `createSdkMcpServer()` from the Agent SDK (verified in Task 001).

**Dispatch bridge** (`lib/dispatch-bridge.ts`): Export a `createDispatchBridge(memberName, port)` factory that returns a dispatch MCP server instance. For each worker-capable plugin, creates an in-process MCP server using `createSdkMcpServer()`. Define six tools using the `tool()` helper:

- `dispatch` - accepts `{ description, task, config? }`, calls `JsonRpcClient.dispatchWorker()`
- `list` - accepts `{ detail?, filter? }`, calls `JsonRpcClient.listWorkers()`
- `status` - accepts `{ jobId }`, calls `JsonRpcClient.workerStatus()`
- `result` - accepts `{ jobId }`, calls `JsonRpcClient.workerResult()`
- `cancel` - accepts `{ jobId }`, calls `JsonRpcClient.cancelWorker()`
- `delete` - accepts `{ jobId }`, calls `JsonRpcClient.deleteWorker()`

Each tool handler uses a `JsonRpcClient` targeting `http://localhost:${port}/mcp` and calls the corresponding method. Error responses from the plugin propagate as tool error results.

**MCPManager integration** (`lib/mcp-manager.ts`): Add a separate `getDispatchConfigs(memberNames)` method that returns `Record<string, McpSdkServerConfigWithInstance>` for worker-capable plugins. This keeps `getServerConfigs()` unchanged (returns only HTTP configs). The agent-manager merges both config sets when constructing the `query()` call:

```typescript
const toolConfigs = mcpManager.getServerConfigs(memberNames);
const dispatchConfigs = mcpManager.getDispatchConfigs(memberNames);
const mcpServers = { ...toolConfigs, ...dispatchConfigs };
```

**Worker-only plugin exclusion**: Worker-only plugins are excluded from `getServerConfigs()` to avoid unnecessary MCP connections. Detection is based on the manifest `capabilities` array (defined in Task 002):
- Worker-only: capabilities includes `"worker"` but NOT `"tools"` (skip HTTP MCP config, only dispatch server)
- Hybrid: capabilities includes both `"worker"` and `"tools"` (HTTP MCP config AND dispatch server)
- Tool-only: no capabilities or capabilities includes `"tools"` only (HTTP MCP config, no dispatch)
- Backwards compatible: existing plugins without capabilities get HTTP MCP config (tool-only behavior)

**Lifecycle**: Dispatch servers are created eagerly during `initializeRoster()`, alongside HTTP server spawn. Only for plugins with `"worker"` in capabilities. In-process, so no PID files or reference counting needed. Per the MCP PID files retro, verify behavior under Turbopack re-evaluation since in-process servers don't have the `_singleton-cache.cjs` protection.

**Agent-manager integration** (`lib/agent-manager.ts`): Merge tool and dispatch configs in `runQuery` before passing to `query()`.

## Validation

- `createDispatchBridge` creates correct tools for a worker-capable plugin
- Tool handlers call the right JsonRpcClient methods with correct params
- `getDispatchConfigs` returns configs for worker-capable plugins only
- `getDispatchConfigs` returns empty for tool-only plugins
- `getServerConfigs` excludes worker-only plugins (capabilities has "worker" but not "tools")
- `getServerConfigs` includes hybrid plugins (capabilities has both "worker" and "tools")
- `getServerConfigs` includes plugins without capabilities (backwards compatible, tool-only)
- Agent-manager merges both config sets when constructing query
- 90%+ coverage

## Why

From `.lore/specs/phase-1/worker-dispatch.md`:
- REQ-WD-36: A `WorkerHandle` interface provides the six worker methods. Worker-capable plugins receive both handles.
- REQ-WD-45: If `worker/dispatch` is called on a plugin that doesn't support it, Guild Hall does not send the request.
- REQ-WD-4: Worker-capable plugins MAY also expose regular tools. The two capabilities are independent.

Plan Resolved Decision #4: Keep `getServerConfigs()` unchanged, add separate `getDispatchConfigs()`. Avoids coupling MCPManager to Agent SDK types.

Plan Resolved Decision #6: WorkerHandle construction in MCPManager instead of MCPServerFactory (intentional deviation from REQ-WD-36 spec language).

## Files

- `lib/dispatch-bridge.ts` (create)
- `lib/mcp-manager.ts` (modify: add getDispatchConfigs, exclude worker-only from getServerConfigs)
- `lib/agent-manager.ts` (modify: merge dispatch configs into query)
- `tests/dispatch-bridge.test.ts` (create)
- `tests/mcp-manager.test.ts` (modify: add dispatch config tests)
