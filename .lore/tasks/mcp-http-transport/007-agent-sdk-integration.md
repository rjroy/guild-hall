---
title: Update Agent SDK integration for HTTP MCP servers
date: 2026-02-14
status: complete
tags: [task]
source: .lore/plans/mcp-http-transport.md
related: [.lore/specs/mcp-http-transport.md]
sequence: 7
modules: [mcp-manager, agent-manager]
---

# Task: Update Agent SDK Integration

## What

Update `MCPManager.getServerConfigs()` to return HTTP MCP configuration format for Agent SDK.

Changes to `lib/mcp-manager.ts`:
```typescript
getServerConfigs(memberNames: string[]): Record<string, McpServerConfig> {
  const configs: Record<string, McpServerConfig> = {};

  for (const name of memberNames) {
    const member = this.roster.get(name);
    if (!member || member.status !== "connected") continue;

    if (member.transport === "http") {
      configs[name] = {
        type: "http",
        url: `http://localhost:${member.port}/mcp`,
      };
    }
  }

  return configs;
}
```

Port storage (already handled in Task 5):
- `member.port` set during `spawnServer()` in eager loading flow

Agent SDK usage (already exists in AgentManager):
- `mcpManager.getServerConfigs(guildMembers)` returns HTTP config
- Passed to `queryFn()` as `options.mcpServers`

## Validation

Unit tests in `tests/lib/mcp-manager.test.ts`:
- `getServerConfigs()` returns HTTP config with correct URL format
- Port number matches allocated port from spawn
- Disconnected members excluded from config
- Only `status="connected"` members included

Integration test:
- Agent SDK receives correct `mcpServers` object during session creation
- Agent can invoke tools via HTTP endpoints during query

## Why

From `.lore/specs/mcp-http-transport.md`:
- REQ-MCP-HTTP-33: "Guild Hall MUST configure Agent SDK with HTTP MCP servers using format: `{ type: \"http\", url: \"http://localhost:{PORT}/mcp\" }`"
- REQ-MCP-HTTP-34: "Guild Hall MCP servers MUST be used for direct tool invocation from Roster"
- REQ-MCP-HTTP-35: "Agent SDK MAY manage its own MCP connections during query sessions"

The Agent SDK connects to Guild Hall's HTTP endpoints rather than spawning duplicate processes. MCPManager continues to manage server lifecycle (start, stop, reference counting).

## Files

- `lib/mcp-manager.ts` (modify - update getServerConfigs to return HTTP format)
- `tests/lib/mcp-manager.test.ts` (modify - verify HTTP config format)
- `tests/integration/http-mcp-transport.test.ts` (create or modify - Agent SDK integration test)
