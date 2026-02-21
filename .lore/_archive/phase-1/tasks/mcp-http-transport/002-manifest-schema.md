---
title: Update manifest schema for HTTP transport
date: 2026-02-14
status: complete
tags: [task]
source: .lore/_archive/phase-1/plans/mcp-http-transport.md
related: [.lore/_archive/phase-1/specs/mcp-http-transport.md]
sequence: 2
modules: [schemas, types, mcp-manager]
---

# Task: Update Manifest Schema for HTTP Transport

## What

Add HTTP transport support to plugin manifest schema and type definitions:

1. Update `GuildMemberManifestSchema` in `lib/schemas.ts` (around line 19):
   - Add `transport: z.enum(["http"])` field (only HTTP for Phase I)

2. Update `GuildMember` type in `lib/types.ts`:
   - Add `transport: "http"` field
   - Add `port?: number` field (allocated port, set after spawn)

3. Update `MCPServerFactory.spawn()` interface to include `pluginDir`:
   ```typescript
   spawn(config: {
     command: string;
     args: string[];
     env?: Record<string, string>;
     pluginDir: string;  // NEW: working directory for spawned process
   }): Promise<{ process: ChildProcess; handle: MCPServerHandle; port: number }>;
   ```

4. Update example manifest `guild-members/example/guild-member.json`:
   - Add `"transport": "http"`
   - Update args to include `--port` with `${PORT}` placeholder: `["run", "server.ts", "--port", "${PORT}"]`

5. Document MCP Server Exit Code Contract in types or constants:
   - Exit code 0 = normal shutdown
   - Exit code 1 = general error
   - Exit code 2 = EADDRINUSE (port collision)
   - Exit code 3+ = reserved for future use

MCP servers MUST exit with code 2 when socket binding fails with EADDRINUSE.

## Validation

Unit tests in `tests/lib/schemas.test.ts` and `tests/lib/types.test.ts`:
- Manifest with `transport: "http"` parses successfully
- Manifest missing transport field fails validation
- Manifest with invalid transport value fails validation
- GuildMember type includes port field
- MCPServerFactory interface includes pluginDir parameter

## Why

From `.lore/_archive/phase-1/specs/mcp-http-transport.md`:
- REQ-MCP-HTTP-1: "Plugin manifests MUST specify transport type via `\"transport\": \"http\"` field"
- REQ-MCP-HTTP-2: "Plugin manifests MUST specify `command` field"
- REQ-MCP-HTTP-3: "Plugin manifests MAY specify `args` array, which MUST support `${PORT}` substitution"
- REQ-MCP-HTTP-4: "Plugin manifests MAY specify `env` object"
- REQ-MCP-HTTP-11: "MCP server processes MUST be spawned with current working directory set to `pluginDir`"

The exit code contract enables the HTTP factory to distinguish port collision (exit code 2, should retry with new port) from other errors (exit code 1, should fail).

## Files

- `lib/schemas.ts` (modify - add transport to manifest schema)
- `lib/types.ts` (modify - add transport and port to GuildMember)
- `guild-members/example/guild-member.json` (modify - add transport and ${PORT})
- `tests/lib/schemas.test.ts` (modify)
- `tests/lib/types.test.ts` (modify or create)
