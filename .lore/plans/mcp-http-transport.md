---
title: Implementation plan for HTTP MCP transport integration
date: 2026-02-14
status: draft
tags: [implementation, plan, mcp, http, json-rpc, phase-1]
modules: [mcp-manager, server-context, plugin-discovery, port-allocator]
related:
  - .lore/specs/mcp-http-transport.md
  - .lore/brainstorm/mcp-transport-stdio-vs-http.md
  - .lore/research/mcp-http-protocol.md
---

# Plan: HTTP MCP Transport Integration

## Spec Reference

**Spec**: .lore/specs/mcp-http-transport.md

Requirements addressed:
- REQ-MCP-HTTP-1, 2, 3, 4: Plugin manifest transport type and `${PORT}` substitution → Steps 2, 4
- REQ-MCP-HTTP-5, 6, 7, 8, 9, 10, 11: Port allocation (50000-51000 range, collision handling) → Steps 1, 4
- REQ-MCP-HTTP-10: Roster initialization and eager loading → Step 6
- REQ-MCP-HTTP-11, 12, 13, 14, 16, 17, 18: Server lifecycle (spawn, init handshake, crash detection, stderr) → Steps 2, 4, 5, 6
- REQ-MCP-HTTP-15: Graceful shutdown on roster unload → Step 11
- REQ-MCP-HTTP-19, 20, 21: Health monitoring (init handshake as health check, timeout) → Step 5
- REQ-MCP-HTTP-22, 23, 24, 25, 26, 27, 28, 29: JSON-RPC protocol (endpoint, methods, timeouts) → Step 3
- REQ-MCP-HTTP-30, 31, 32: Security (localhost binding, Origin validation, port range) → Steps 7, 9
- REQ-MCP-HTTP-33, 34, 35: Agent SDK integration (HTTP config format) → Step 8
- REQ-MCP-HTTP-36, 37, 38, 39: Tool discovery (tools/list, populate roster) → Step 6
- REQ-MCP-HTTP-40, 41, 42, 43, 44: Error handling (protocol vs execution errors, status updates) → Steps 5, 6, 7
- Success Criteria: Example plugin HTTP server, integration tests → Steps 9, 10
- AI Validation: Unit tests, integration tests, fresh-context review → Steps 10, 12

## Codebase Context

**Existing patterns to follow:**
- DI factory pattern: `createX(deps)` with default instance export (used in SessionStore, AgentManager, MCPManager, ServerContext)
- Mock factories for tests: track calls, configurable errors/results, no mock.module()
- MCPServerFactory interface: `spawn(config) → MCPServerHandle`
- MCPServerHandle interface: `stop()`, `listTools()`, `invokeTool(name, input)`
- Working directory contract: factory sets `cwd` to pluginDir before spawning
- Event emission: MCPManager emits `started`, `tools_updated`, `stopped`, `error`
- Reference counting: MCPManager tracks which sessions reference each server

**Where changes will land:**
- New module: `lib/port-registry.ts` (port number tracking/allocation)
- New module: `lib/json-rpc-client.ts` (HTTP client for MCP protocol)
- New module: `lib/http-mcp-factory.ts` (HTTP server spawning and lifecycle)
- Update: `lib/types.ts` (add transport and port fields to GuildMember)
- Update: `lib/schemas.ts` (add transport to manifest schema)
- Update: `lib/mcp-manager.ts` (eager loading, process tracking, crash detection, shutdown)
- Update: `lib/plugin-discovery.ts` (add pluginDir to GuildMember)
- Update: `lib/server-context.ts` (call initializeRoster(), inject HTTP factory, shutdown handlers)
- Update: `guild-members/example/server.ts` (HTTP server implementation with EADDRINUSE handling)
- Update: `guild-members/example/guild-member.json` (add transport type, `${PORT}` arg)
- New tests: `tests/lib/port-registry.test.ts`
- New tests: `tests/lib/json-rpc-client.test.ts`
- New tests: `tests/lib/http-mcp-factory.test.ts`
- Update tests: `tests/lib/mcp-manager.test.ts` (eager loading, crash detection)
- New tests: `tests/integration/http-mcp-transport.test.ts`

**Dependencies:**
- Node.js `child_process` for spawning HTTP server processes
- Built-in `fetch` (or `node-fetch` if Node < 18) for HTTP calls to MCP servers
- @modelcontextprotocol/sdk (already installed) for example HTTP server implementation
- Existing MCPManager, MCPServerFactory interface, plugin discovery

**Integration points:**
- ServerContext: inject HTTP factory as default (replaces stub)
- MCPManager: add eager loading flow (start all servers on init)
- AgentManager: already calls `mcpManager.getServerConfigs()` and `startServersForSession()`
- API routes: already call `mcpManager.invokeTool()` for direct invocation

## Implementation Steps

### Step 1: Implement Port Registry

**Files**: `lib/port-registry.ts`, `tests/lib/port-registry.test.ts`
**Addresses**: REQ-MCP-HTTP-5, 6, 7, 8, 9, 10, 11
**Expertise**: None needed

Create `PortRegistry` class that tracks port number assignments (not actual socket binding):

```typescript
export class PortRegistry {
  private usedPorts = new Set<number>();
  private readonly minPort = 50000;
  private readonly maxPort = 51000;

  allocate(): number {
    for (let port = this.minPort; port <= this.maxPort; port++) {
      if (!this.usedPorts.has(port)) {
        this.usedPorts.add(port);
        return port;
      }
    }
    throw new Error("No ports available in range 50000-51000");
  }

  release(port: number): void {
    this.usedPorts.delete(port);
  }

  markDead(port: number): void {
    // Port failed to bind (EADDRINUSE), mark as dead forever
    // Keep it in usedPorts so it's never reallocated
    this.usedPorts.add(port);
  }
}
```

Implementation details:
- **Registry only** - tracks port numbers, does NOT bind sockets
- MCP server processes do actual socket binding
- Sequential port search starting at 50000
- Throws error if all 1000 ports are exhausted
- `allocate()` returns next available port number
- `release(port)` frees port for reuse (only on clean shutdown)
- `markDead(port)` permanently reserves port that failed to bind
- Dead ports stay reserved forever (1000-port range makes exhaustion unlikely)
- Thread-safe (synchronous operations, no races)

Test scenarios:
- Allocates starting at 50000
- Allocates sequentially (50000, 50001, 50002...)
- Reuses released ports
- Throws error when range exhausted (allocate 1001 ports)
- Release non-allocated port is no-op (doesn't error)
- markDead() prevents port reallocation
- Dead port is skipped on next allocate()

### Step 2: Update Manifest Schema and Factory Interface

**Files**: `lib/types.ts`, `lib/schemas.ts`, `lib/mcp-manager.ts`, `guild-members/example/guild-member.json`
**Addresses**: REQ-MCP-HTTP-1, 2, 3, 4, 11
**Expertise**: None needed

Update `GuildMemberManifestSchema` to include transport type (in `lib/schemas.ts` around line 19):

```typescript
export const GuildMemberManifestSchema = z.object({
  name: z.string(),
  displayName: z.string(),
  description: z.string(),
  version: z.string(),
  transport: z.enum(["http"]),  // NEW: Only http for Phase I
  mcp: z.object({
    command: z.string(),
    args: z.array(z.string()),
    env: z.record(z.string(), z.string()).optional(),
  }),
});
```

Update `GuildMember` type to include `transport` and `port` fields:

```typescript
export type GuildMember = {
  // ... existing fields
  transport: "http";
  port?: number;  // Allocated port (set after spawn)
  // ... rest
};
```

Update `MCPServerFactory.spawn()` interface to include `pluginDir`:

```typescript
export interface MCPServerFactory {
  spawn(config: {
    command: string;
    args: string[];
    env?: Record<string, string>;
    pluginDir: string;  // NEW: Working directory for spawned process
  }): Promise<{ process: ChildProcess; handle: MCPServerHandle; port: number }>;
}
```

Update example manifest:

```json
{
  "name": "example",
  "displayName": "Example Guild Member",
  "description": "A sample guild member for development and testing.",
  "version": "0.1.0",
  "transport": "http",
  "mcp": {
    "command": "bun",
    "args": ["run", "server.ts", "--port", "${PORT}"]
  }
}
```

**MCP Server Exit Code Contract**:
- `0` = normal shutdown
- `1` = general error (uncaught exception)
- `2` = EADDRINUSE (port collision detected by server)
- `3+` = reserved for future error codes

MCP servers MUST exit with code `2` when socket binding fails with EADDRINUSE.

Test scenarios:
- Manifest with `transport: "http"` parses successfully
- Manifest missing transport field fails validation
- Manifest with invalid transport value fails validation
- GuildMember type includes port field
- MCPServerFactory interface includes pluginDir parameter

### Step 3: Implement JSON-RPC Client

**Files**: `lib/json-rpc-client.ts`, `tests/lib/json-rpc-client.test.ts`
**Addresses**: REQ-MCP-HTTP-22, 23, 24, 25, 26, 27, 28, 29
**Expertise**: None needed

Create `JsonRpcClient` class that wraps HTTP communication to MCP servers:

```typescript
export class JsonRpcClient {
  constructor(private readonly baseUrl: string) {}

  async initialize(clientInfo: { name: string; version: string }): Promise<InitializeResponse> {
    const response = await this.call("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {
        roots: { listChanged: true },
        sampling: {},
      },
      clientInfo,
    }, 5000); // 5s timeout

    // Send initialized notification (no response expected)
    await this.notify("notifications/initialized");

    return response;
  }

  async listTools(): Promise<ToolInfo[]> {
    const response = await this.call("tools/list", {}, 30000); // 30s timeout
    return response.tools;
  }

  async invokeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const response = await this.call("tools/call", { name, arguments: args }, 30000);

    if (response.isError) {
      throw new Error(`Tool execution failed: ${response.content[0].text}`);
    }

    return response;
  }

  private async call(method: string, params: unknown, timeout: number): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method,
          params,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.error) {
        throw new Error(`JSON-RPC error: ${result.error.message}`);
      }

      return result.result;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async notify(method: string): Promise<void> {
    await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method,
      }),
    });
  }
}
```

Implementation details:
- Uses `AbortController` for timeout enforcement
- Distinguishes JSON-RPC protocol errors (`result.error`) from tool execution errors (`result.isError`)
- Initialize completes 3-step handshake (request, response, notification)
- `notify()` sends notification without expecting response
- Protocol version header on all requests

Test scenarios:
- Initialize succeeds and sends initialized notification
- listTools parses tool array from response
- invokeTool returns result on success
- invokeTool throws on `isError: true`
- call() throws on HTTP error status
- call() throws on JSON-RPC error object
- call() throws on timeout (aborts request)
- Timeout cleanup (clearTimeout called on success)

### Step 4: Implement HTTP MCP Factory with Port Collision Retry

**Files**: `lib/http-mcp-factory.ts`, `tests/lib/http-mcp-factory.test.ts`
**Addresses**: REQ-MCP-HTTP-6, 11, 12, 13, 14, 16, 17, 18, 30
**Expertise**: None needed

Create `createHttpMCPFactory(deps)` that spawns HTTP MCP server processes:

```typescript
export type HttpMCPFactoryDeps = {
  portRegistry: PortRegistry;
};

export function createHttpMCPFactory(deps: HttpMCPFactoryDeps): MCPServerFactory {
  return {
    async spawn(config): Promise<{ process: ChildProcess; handle: MCPServerHandle; port: number }> {
      // Retry loop for port collision handling
      for (let attempt = 0; attempt < 10; attempt++) {
        const port = deps.portRegistry.allocate();

        // Substitute ${PORT} in args
        const args = config.args.map(arg => arg.replace("${PORT}", String(port)));

        // Spawn process with cwd=pluginDir
        const proc = childProcess.spawn(config.command, args, {
          cwd: config.pluginDir,  // Working directory contract
          env: { ...process.env, ...config.env },
          stdio: ["ignore", "ignore", "pipe"], // capture stderr
        });

        // Capture stderr for debugging
        let stderrBuffer = "";
        proc.stderr?.on("data", (chunk) => {
          const text = chunk.toString();
          stderrBuffer += text;
          if (stderrBuffer.length > 10000) {
            stderrBuffer = stderrBuffer.slice(-5000); // Keep last 5KB
          }
          console.error(`[MCP stderr] ${text}`);
        });

        // Wait for process to either:
        // 1. Exit with code 2 (EADDRINUSE) - retry with new port
        // 2. Start successfully - proceed to initialize
        const exitPromise = new Promise<number>((resolve) => {
          proc.once("exit", (code) => resolve(code ?? 1));
        });

        // Give server brief window to detect port collision
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check if already exited with EADDRINUSE
        if (proc.exitCode === 2) {
          deps.portRegistry.markDead(port);
          continue; // Retry with next port
        }

        // Create JSON-RPC client
        const client = new JsonRpcClient(`http://localhost:${port}/mcp`);

        // Wait for server to be ready (initialize handshake)
        try {
          await client.initialize({
            name: "GuildHall",
            version: "0.1.0",
          });
        } catch (err) {
          proc.kill();

          // If process exited with code 2, mark port dead and retry
          const exitCode = await exitPromise;
          if (exitCode === 2) {
            deps.portRegistry.markDead(port);
            continue; // Retry with next port
          }

          // Other errors: release port and fail
          deps.portRegistry.release(port);
          throw new Error(`Server failed to initialize: ${err.message}\nstderr: ${stderrBuffer}`);
        }

        // Create handle
        const handle: MCPServerHandle = {
          async stop() {
            proc.kill();
            deps.portRegistry.release(port);
          },
          async listTools() {
            return client.listTools();
          },
          async invokeTool(name, input) {
            return client.invokeTool(name, input);
          },
        };

        // Success - return process, handle, and port
        return { process: proc, handle, port };
      }

      // Exhausted retry attempts
      throw new Error("Failed to spawn MCP server: port collision retry limit exceeded");
    },
  };
}
```

Implementation details:
- **Retry loop** for port collision (max 10 attempts)
- Allocates port, spawns process, checks for exit code 2 (EADDRINUSE)
- If exit code 2: mark port dead, allocate next port, retry
- Substitutes `${PORT}` in all args
- Sets working directory to `config.pluginDir` (working directory contract)
- Captures stderr with 10KB buffer (keeps last 5KB if exceeded)
- Logs stderr to console with `[MCP stderr]` prefix
- Waits 100ms for quick port collision detection before initialize
- Waits for initialize handshake (5s timeout)
- On init failure: kills process, releases port (unless EADDRINUSE), throws error
- Returns `{ process, handle, port }` for MCPManager to attach exit listener
- `stop()` kills process and releases port

Test scenarios:
- Spawn succeeds with valid config
- `${PORT}` substitution in args works
- Working directory set to config.pluginDir
- Initialize handshake called on spawn
- Spawn fails if initialize times out (5s)
- **Port collision retry**: Exit code 2 triggers markDead() and retry
- **Port collision retry**: Succeeds on second attempt after first port fails
- Port released on spawn failure (non-collision errors)
- Port marked dead on EADDRINUSE (exit code 2)
- Retry limit exceeded throws error
- stop() kills process and releases port
- stderr captured and logged with size limit

### Step 5: Add Health Monitoring and Error Handling

**Files**: `lib/http-mcp-factory.ts` (update from Step 4)
**Addresses**: REQ-MCP-HTTP-19, 20, 21, 40, 41, 42, 43, 44
**Expertise**: None needed

Enhance factory to handle health monitoring and error scenarios:

- Initialize handshake timeout (5s) terminates process:
  ```typescript
  try {
    await client.initialize(...);
  } catch (err) {
    proc.kill(); // Terminate on timeout/error
    deps.portAllocator.release(port);
    throw new Error(`Health check failed: ${err.message}`);
  }
  ```

- Tool invocation timeout (30s) aborts request without killing server:
  - JsonRpcClient already handles this via AbortController
  - Server process continues running
  - Error returned to caller

- Crash detection via process exit event (already in Step 4)

- Error messages include guild member name:
  - Factory doesn't know member name (injected at MCPManager level)
  - MCPManager wraps errors with member name context

Test scenarios:
- Initialize timeout kills process and releases port
- Initialize error kills process and releases port
- Tool invocation timeout aborts request, process still running
- Tool invocation error doesn't affect server status
- Crash detected within 1 second of process exit

### Step 6: Add Eager Loading to MCPManager

**Files**: `lib/mcp-manager.ts`, `lib/server-context.ts`, `tests/lib/mcp-manager.test.ts`
**Addresses**: REQ-MCP-HTTP-10, 16, 36, 37, 38, 39
**Expertise**: None needed

Add roster initialization flow that starts all MCP servers eagerly.

Update `MCPManager` to add `initializeRoster()` and handle factory's new return type:

```typescript
export class MCPManager extends EventEmitter<MCPManagerEvent> {
  private processes = new Map<string, ChildProcess>();  // NEW: Track processes for exit listeners

  constructor(
    private roster: Map<string, GuildMember>,
    private serverFactory: MCPServerFactory,
  ) {
    super();
  }

  async initializeRoster(): Promise<void> {
    const members = Array.from(this.roster.entries());

    await Promise.allSettled(
      members.map(async ([name, member]) => {
        if (member.transport === "http") {
          await this.spawnServer(name, member);
        }
      })
    );
  }

  private async spawnServer(name: string, member: GuildMember): Promise<void> {
    try {
      const { process: proc, handle, port } = await this.serverFactory.spawn({
        command: member.mcp.command,
        args: member.mcp.args,
        env: member.mcp.env,
        pluginDir: member.pluginDir,  // From discovery
      });

      // Store process for tracking
      this.processes.set(name, proc);

      // Attach crash detection listener
      proc.on("exit", (code, signal) => {
        this.processes.delete(name);
        member.status = "error";
        member.error = `Process exited with code ${code}, signal ${signal}`;
        this.emit({ type: "error", memberName: name, error: member.error });
      });

      // Store handle and port
      this.servers.set(name, handle);
      member.port = port;

      // Fetch tools
      const tools = await handle.listTools();

      // Update roster
      member.status = "connected";
      member.tools = tools;
      delete member.error;

      this.emit({ type: "started", memberName: name });
      this.emit({ type: "tools_updated", memberName: name, tools });
    } catch (err) {
      member.status = "error";
      member.error = err instanceof Error ? err.message : String(err);
      this.emit({ type: "error", memberName: name, error: member.error });
    }
  }
}
```

Update `GuildMember` during discovery to include `pluginDir`:

```typescript
// In lib/plugin-discovery.ts, when creating GuildMember:
const member: GuildMember = {
  // ... existing fields
  pluginDir: path.join(baseDir, relativePath),  // NEW: Store plugin directory
};
```

Call `initializeRoster()` from server context initialization (in `lib/server-context.ts`, after line 70):

```typescript
async function initialize(): Promise<void> {
  const roster = await discoverGuildMembers(deps.guildMembersDir, deps.fs);

  const factory: MCPServerFactory = deps.serverFactory ?? {
    spawn() {
      return Promise.reject(
        new Error("MCP server spawning not yet implemented for agent queries"),
      );
    },
  };

  rosterInstance = roster;
  mcpManagerInstance = new MCPManager(roster, factory);

  // NEW: Eager loading - add after line 70
  await mcpManagerInstance.initializeRoster();

  const bus = contextGetEventBus();

  agentManager = new AgentManager({
    queryFn: deps.queryFn,
    sessionStore: deps.sessionStore,
    mcpManager: mcpManagerInstance,
    eventBus: bus,
    clock: deps.clock ?? (() => new Date()),
    sessionsDir: deps.sessionsDir,
  });
}
```

Implementation details:
- `initializeRoster()` starts all HTTP transport plugins
- Uses `Promise.allSettled` to continue even if some servers fail
- Factory returns `{ process, handle, port }` - MCPManager unpacks all three
- MCPManager attaches `process.on('exit')` listener for crash detection
- Crash listener updates `member.status = "error"` and emits error event
- Port stored in `member.port` for Agent SDK config
- `pluginDir` passed from GuildMember to factory spawn config
- Failed servers have `status: "error"` and `error` field set
- Successful servers have `status: "connected"` and `tools` populated
- Events emitted for each server (started, tools_updated, or error)

Test scenarios:
- initializeRoster() starts all HTTP plugins
- Failed server sets status=error, doesn't block others
- Successful server sets status=connected, tools populated
- Events emitted for each server
- Process exit listener attached and triggers on crash
- member.port populated with allocated port
- pluginDir passed correctly to factory
- Non-HTTP plugins skipped (future-proof for other transports)

### Step 7: Add Security and Origin Validation

**Files**: `lib/http-mcp-factory.ts` (update from Steps 4-5), `lib/json-rpc-client.ts` (update from Step 3)
**Addresses**: REQ-MCP-HTTP-30, 31, 32
**Expertise**: Security review

Add Origin header validation to JSON-RPC client:

```typescript
private async call(method: string, params: unknown, timeout: number): Promise<any> {
  const response = await fetch(this.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2025-06-18",
      "Origin": "http://localhost", // NEW: Include Origin header
    },
    // ... rest of call
  });
}
```

Verify localhost binding:
- Factory spawns servers that MUST bind to 127.0.0.1
- No validation in factory (enforcement is server responsibility)
- Document requirement in example plugin implementation

Verify port range enforcement:
- PortRegistry (Step 1) already enforces 50000-51000
- No additional validation needed

Test scenarios:
- Origin header included in all HTTP requests
- Port allocation stays within 50000-51000 (already tested in Step 1)

### Step 8: Update Agent SDK Integration

**Files**: `lib/agent-manager.ts`, `lib/mcp-manager.ts`, `tests/lib/agent-manager.test.ts`
**Addresses**: REQ-MCP-HTTP-33, 34, 35
**Expertise**: None needed

Update `MCPManager.getServerConfigs()` to return HTTP config format:

```typescript
getServerConfigs(memberNames: string[]): Record<string, McpServerConfig> {
  const configs: Record<string, McpServerConfig> = {};

  for (const name of memberNames) {
    const member = this.roster.get(name);
    if (!member || member.status !== "connected") continue;

    // NEW: HTTP config format
    if (member.transport === "http") {
      configs[name] = {
        type: "http",
        url: `http://localhost:${member.port}/mcp`, // port stored during spawn
      };
    }
  }

  return configs;
}
```

Store port in GuildMember during spawn:

```typescript
// In MCPManager.spawnServer()
member.port = port; // NEW: Store allocated port
```

Agent SDK usage (already exists in AgentManager):

```typescript
const mcpServers = this.deps.mcpManager.getServerConfigs(guildMembers);

const query = this.deps.queryFn({
  prompt: userMessage,
  options: {
    mcpServers, // Passed to Agent SDK
    // ... other options
  },
});
```

Implementation details:
- GuildMember type extended with optional `port: number` field
- Port stored during spawn, used in getServerConfigs()
- Agent SDK connects to Guild Hall's HTTP endpoints (no duplicate processes)
- MCPManager continues to manage server lifecycle (start, stop, reference counting)

Test scenarios:
- getServerConfigs() returns HTTP config with correct URL
- Port number matches allocated port
- Disconnected members excluded from config
- Agent SDK receives correct mcpServers object (integration test)

### Step 9: Implement Example Plugin HTTP Server

**Files**: `guild-members/example/server.ts`, `guild-members/example/guild-member.json`
**Addresses**: Success criteria (example plugin runs as HTTP MCP server)
**Expertise**: None needed

Rewrite example plugin to use HTTP transport:

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import http from "http";

const PORT = parseInt(process.argv[process.argv.indexOf("--port") + 1]);

const server = new Server(
  {
    name: "example",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler("tools/list", async () => {
  return {
    tools: [
      {
        name: "echo",
        description: "Echoes back the input text",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string", description: "Text to echo" },
          },
          required: ["text"],
        },
      },
      {
        name: "reverse",
        description: "Reverses the input text",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string", description: "Text to reverse" },
          },
          required: ["text"],
        },
      },
    ],
  };
});

server.setRequestHandler("tools/call", async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "echo") {
    return {
      content: [{ type: "text", text: args.text }],
      isError: false,
    };
  } else if (name === "reverse") {
    return {
      content: [
        { type: "text", text: args.text.split("").reverse().join("") },
      ],
      isError: false,
    };
  } else {
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }
});

// Create HTTP server that handles JSON-RPC
const httpServer = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/mcp") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const jsonRpcRequest = JSON.parse(body);
        const response = await server.handleRequest(jsonRpcRequest);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: err.message } }));
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

httpServer.listen(PORT, "127.0.0.1", () => {
  console.log(`Example MCP server listening on http://127.0.0.1:${PORT}/mcp`);
});

// Exit with code 2 on port collision (EADDRINUSE)
httpServer.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} already in use`);
    process.exit(2);  // Exit code 2 = EADDRINUSE
  } else {
    console.error(`Server error: ${err.message}`);
    process.exit(1);  // Exit code 1 = general error
  }
});
```

Update manifest (already done in Step 2):

```json
{
  "transport": "http",
  "mcp": {
    "command": "bun",
    "args": ["run", "server.ts", "--port", "${PORT}"]
  }
}
```

Implementation details:
- Parses `--port` from command line arguments
- Binds to 127.0.0.1 (localhost only)
- Single endpoint at `/mcp` accepting POST requests
- Parses JSON-RPC request body, calls server.handleRequest()
- Returns JSON-RPC response
- Same echo/reverse tools as stdio version

Test approach:
- Manual: `bun run server.ts --port 50000`, then curl to verify
- Integration test: spawn via factory, call tools via client

### Step 10: Write Tests

**Files**: All test files from Steps 1-9
**Addresses**: AI Validation criteria
**Expertise**: None needed

Unit tests (Steps 1-8 already include test scenarios):
- `tests/lib/port-allocator.test.ts`: Allocation, release, exhaustion, collision handling
- `tests/lib/json-rpc-client.test.ts`: Initialize, listTools, invokeTool, timeouts, errors
- `tests/lib/http-mcp-factory.test.ts`: Spawn, ${PORT} substitution, cwd, init handshake, crash detection, stderr capture
- `tests/lib/mcp-manager.test.ts`: Eager loading (initializeRoster), event emission, status updates

Integration test:

```typescript
// tests/integration/http-mcp-transport.test.ts
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createHttpMCPFactory } from "../../lib/http-mcp-factory";
import { PortRegistry } from "../../lib/port-allocator";

describe("HTTP MCP Transport Integration", () => {
  let portAllocator: PortRegistry;
  let factory: MCPServerFactory;
  let handle: MCPServerHandle;

  beforeAll(async () => {
    portAllocator = new PortRegistry();
    factory = createHttpMCPFactory({
      portAllocator,
      pluginDir: path.resolve("./guild-members/example"),
    });

    handle = await factory.spawn({
      command: "bun",
      args: ["run", "server.ts", "--port", "${PORT}"],
      env: {},
    });
  });

  afterAll(async () => {
    await handle.stop();
  });

  test("listTools returns echo and reverse", async () => {
    const tools = await handle.listTools();
    expect(tools).toHaveLength(2);
    expect(tools.map(t => t.name)).toEqual(["echo", "reverse"]);
  });

  test("echo tool works", async () => {
    const result = await handle.invokeTool("echo", { text: "hello" });
    expect(result.content[0].text).toBe("hello");
  });

  test("reverse tool works", async () => {
    const result = await handle.invokeTool("reverse", { text: "hello" });
    expect(result.content[0].text).toBe("olleh");
  });

  test("working directory contract verified", async () => {
    // Spawn server, verify it can read ./test-file.txt relative to pluginDir
    // (Add test file to example plugin directory first)
  });

  test("port collision handling", async () => {
    // Manually occupy port 50000 (e.g., start HTTP server)
    // Spawn plugin, verify it gets port 50001
  });

  test("concurrent plugins get unique ports", async () => {
    const handle1 = await factory.spawn({ /* example */ });
    const handle2 = await factory.spawn({ /* example */ });
    // Verify both servers work (call tools on each)
    // Cleanup
  });

  test("initialize timeout terminates process", async () => {
    // Mock JSON-RPC client to delay initialize response beyond 5s
    // Verify spawn fails and process is killed
  });

  test("tool invocation timeout aborts request", async () => {
    // Mock tool that sleeps 31 seconds
    // Verify invokeTool throws timeout error
    // Verify server process still running (call another tool)
  });

  test("crash detection via process exit", async () => {
    let crashError: string | undefined;
    const handle = await factory.spawn({
      onCrash(error) {
        crashError = error;
      },
      /* ... */
    });

    // Kill process manually
    // Wait for crash callback
    expect(crashError).toContain("exited");
  });
});
```

Test coverage goals:
- 90%+ on new code (PortRegistry, JsonRpcClient, HttpMCPFactory)
- Integration test covers all success criteria from spec
- Timeout behavior verified (init vs tool)
- Crash detection verified
- Working directory contract verified
- Port collision handling verified

### Step 11: Implement Graceful Shutdown

**Files**: `lib/server-context.ts`, `lib/mcp-manager.ts`
**Addresses**: REQ-MCP-HTTP-15
**Expertise**: None needed

Add graceful shutdown handling for systemd restarts and Ctrl-C:

Add `shutdown()` method to MCPManager (if not already exists):

```typescript
export class MCPManager extends EventEmitter<MCPManagerEvent> {
  async shutdown(): Promise<void> {
    const shutdownPromises = Array.from(this.servers.entries()).map(
      async ([name, handle]) => {
        try {
          await handle.stop();
          this.emit({ type: "stopped", memberName: name });
        } catch (err) {
          console.error(`Failed to stop MCP server ${name}:`, err);
        }
      }
    );

    await Promise.allSettled(shutdownPromises);
    this.servers.clear();
    this.processes.clear();
    this.references.clear();
  }
}
```

Add shutdown signal handlers to server context or main entry point:

```typescript
// In server-context.ts or app entry point
let shutdownInProgress = false;

async function gracefulShutdown(signal: string) {
  if (shutdownInProgress) return;
  shutdownInProgress = true;

  console.log(`Received ${signal}, shutting down gracefully...`);

  try {
    const mcpManager = await getMCPManager();
    await mcpManager.shutdown();
    console.log("All MCP servers stopped");
  } catch (err) {
    console.error("Error during shutdown:", err);
  }

  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
```

Implementation details:
- SIGTERM: systemd sends this on `systemctl stop` or `systemctl restart`
- SIGINT: sent on Ctrl-C in `bun run dev`
- `shutdown()` calls `stop()` on all MCP server handles
- Each `stop()` kills its process and releases its port
- Uses `Promise.allSettled` to stop all servers even if some fail
- Emits `stopped` event for each server
- Clears all tracking maps (servers, processes, references)
- Prevents duplicate shutdown via `shutdownInProgress` flag
- Exits with code 0 after successful cleanup

Test scenarios:
- shutdown() stops all running servers
- Port registry released for all servers
- Events emitted for each stopped server
- Handles stop() failures gracefully
- SIGTERM triggers shutdown
- SIGINT triggers shutdown
- Duplicate signal handled (no double-shutdown)

### Step 12: Validate Against Spec

**Files**: All files from Steps 1-10
**Addresses**: Final validation requirement
**Expertise**: Fresh-context review

Launch a sub-agent that reads the spec at `.lore/specs/mcp-http-transport.md`, reviews the implementation, and flags any requirements not met:

- All 44 REQ-MCP-HTTP-* requirements implemented
- Success criteria met (example plugin, roster display, tool invocation, concurrent plugins, timeouts, crashes)
- AI validation criteria met (unit tests, integration tests, coverage)
- Constraints respected (HTTP POST only, stateless, no SSE, defaults only)

Sub-agent checks:
- Port allocation (50000-51000, collision handling)
- `${PORT}` substitution
- Eager loading on roster init
- Initialize handshake as health check
- Timeout behavior (5s init kills process, 30s tool aborts request)
- Crash detection via process exit
- Stderr capture
- Working directory contract
- Security (localhost binding, Origin validation)
- Agent SDK HTTP config
- Error handling (protocol vs execution)

## Delegation Guide

Steps requiring specialized expertise:

- **Step 7 (Security)**: Security review of Origin validation, localhost binding enforcement, port range restrictions. Consult security specialist agent if available.

All other steps are general backend implementation work (TypeScript, Node.js process spawning, HTTP clients, testing).

## Open Questions

None. All architectural decisions resolved in brainstorm. Implementation is straightforward application of established patterns.
