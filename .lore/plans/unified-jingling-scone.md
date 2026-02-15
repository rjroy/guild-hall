# MCP Server PID File Coordination

## Context

Turbopack re-evaluates server-side modules per route compilation in dev mode. Each re-evaluation creates a new MCPManager that spawns duplicate MCP server child processes, causing port conflicts. The `_singleton-cache.cjs` workaround (CJS module loaded via `createRequire`) may or may not survive Turbopack's sandbox. PID files are a filesystem-based coordination mechanism: write `{pid, port}` after spawning, check before spawning, reconnect if server is already running.

Spec: `.lore/specs/mcp-pid-files.md` (approved)

## Phase 1: Foundation (PortRegistry + JsonRpcClient)

Small, independent changes that enable later phases.

### 1a. PortRegistry.reserve()

**`lib/port-registry.ts`**: Add `reserve(port: number): void` to `IPortRegistry` interface and `PortRegistry` class. Marks a known port as in-use without auto-selecting. Used when reconnecting to a server whose port we know from a PID file.

**`tests/lib/port-registry.test.ts`**: Add tests:
- `reserve()` marks port as used so `allocate()` skips it
- `reserve()` on out-of-range port is a no-op
- `reserve()` on already-used port is idempotent

### 1b. JsonRpcClient.initialize() timeout parameter

**`lib/json-rpc-client.ts`**: Add optional `timeoutMs` parameter to `initialize()`:
```typescript
async initialize(
  clientInfo: { name: string; version: string },
  options?: { timeoutMs?: number },
): Promise<InitializeResponse>
```
Default stays 5000ms. The reconnect path uses 2000ms. Update the hardcoded `5000` on line 150 and the error message on line 169 to use `timeoutMs`.

**`tests/lib/json-rpc-client.test.ts`** (if exists, otherwise skip): Verify custom timeout fires at the specified duration.

## Phase 2: MCPServerFactory.connect()

**`lib/types.ts`**: Add `connect` to `MCPServerFactory`:
```typescript
connect(config: { port: number }): Promise<{ handle: MCPServerHandle }>;
```

**`lib/http-mcp-factory.ts`**: Implement `connect()`:
- Create `JsonRpcClient` at `http://localhost:${port}/mcp`
- Call `client.initialize()` with `{ timeoutMs: 2000 }`
- Return handle where `stop()` logs disconnect and returns (no kill, no port release)
- `listTools()` and `invokeTool()` work normally via client

**`tests/lib/http-mcp-factory.test.ts`**: Add tests:
- Successful connect creates working handle
- Connect handle `stop()` does not kill process or release port
- Connect throws on handshake timeout
- Connect throws on HTTP error

**Test helpers** (`tests/lib/mcp-manager.test.ts`): Update `createMockFactory` to include a `connect` method with tracking.

## Phase 3: PidFileManager module

**New file: `lib/pid-file-manager.ts`**

Factory: `createPidFileManager(deps)` with injected filesystem and process.kill.

```typescript
type PidFileData = { pid: number; port: number };

type PidFileManagerDeps = {
  baseDir: string;
  fs: { readFile, writeFile, rename, unlink, readdir, mkdir };
  processKill: (pid: number, signal: number) => void;
};
```

Methods:
- `read(memberName)`: Parse `.mcp-servers/{name}.json`, return `PidFileData | null`. Return null on ENOENT.
- `write(memberName, data)`: `mkdir -p`, write to `.{name}.json.tmp`, rename to `{name}.json`.
- `remove(memberName)`: Unlink. Swallow ENOENT.
- `isAlive(pid)`: `processKill(pid, 0)` in try/catch. True if no error.
- `cleanupAll()`: Ensure dir exists, readdir, for each `.json` file: read, if alive kill(pid, SIGTERM), unlink. Also unlink `.tmp` files.
- `shutdownAll()`: Same as `cleanupAll()`.

Production helper: `createNodePidFileManager(baseDir)` wraps Node.js `fs` and `process.kill`.

**New file: `tests/lib/pid-file-manager.test.ts`**

All tests use in-memory mock fs and mock processKill:
- write creates dir, writes tmp, renames to final
- write leaves no tmp file on success
- read returns parsed data for valid file
- read returns null for missing file
- remove deletes file, no-op on missing
- isAlive returns true/false based on processKill
- cleanupAll kills alive processes and deletes all files
- cleanupAll creates directory if missing
- cleanupAll handles empty directory

## Phase 4: MCPManager integration

**`lib/mcp-manager.ts`**: Add optional constructor params:

```typescript
constructor(
  private roster: Map<string, GuildMember>,
  private serverFactory: MCPServerFactory,
  private pidFiles?: PidFileManager,
  private portRegistry?: IPortRegistry,
)
```

Modify `spawnServer(name, member)`:

1. If `pidFiles` is set, call `pidFiles.read(name)`
2. If PID file exists and `pidFiles.isAlive(pid)`:
   - Try `serverFactory.connect({ port })`
   - On success: store handle (no process ref), `portRegistry.reserve(port)`, list tools, update roster, log reconnect, emit events, return
   - On failure: log "not responsive, treating as stale", fall through
3. If PID file is stale: `pidFiles.remove(name)`
4. Normal spawn path (existing code)
5. After successful spawn: `pidFiles.write(name, { pid: process.pid, port })`

Modify `shutdown()`:
- After existing handle.stop() loop, call `pidFiles?.shutdownAll()`

**`tests/lib/mcp-manager.test.ts`**: New test section "PID file coordination":
- PID file with alive+responsive server triggers reconnect (connect called, not spawn)
- PID file with dead PID triggers delete + fresh spawn
- PID file with alive but unresponsive server triggers delete + fresh spawn
- Successful spawn writes PID file
- Reconnected port is reserved in PortRegistry
- Shutdown calls pidFiles.shutdownAll()
- Without pidFiles injected, behavior is unchanged

## Phase 5: Server context wiring

**`lib/server-context.ts`**:

1. Add to `ServerContextDeps`: `pidFileManager?: PidFileManager`, `portRegistry?: IPortRegistry`, `bootCleanup?: boolean`
2. In `initialize()`, before roster discovery: if `bootCleanup && pidFileManager`, call `pidFileManager.cleanupAll()`
3. Pass `pidFileManager` and `portRegistry` to MCPManager constructor
4. In production wiring: create `PortRegistry` as shared instance (used by both factory and MCPManager), create `PidFileManager`, pass `bootCleanup: true`
5. Graceful shutdown: call `pidFileManager.shutdownAll()` before `process.exit(0)`

**`tests/lib/server-context.test.ts`**: Add tests for boot cleanup running when flag is true.

## Phase 6: Cleanup

- **`.gitignore`**: Add `.mcp-servers/`
- **`lib/_singleton-cache.cjs`**: Update comment to note MCP coordination now uses PID files. Keep file (still needed for EventBus/AgentManager).
- **`lib/server-context.ts`**: Update comments about what _singleton-cache.cjs is for.

## Implementation Order

Phases 1-3 have no dependencies on each other and can be done in parallel. Phase 4 depends on 1-3. Phase 5 depends on 4. Phase 6 is independent.

```
Phase 1a (PortRegistry) ──┐
Phase 1b (JsonRpcClient) ──┤
Phase 2 (factory.connect) ─┼── Phase 4 (MCPManager) ── Phase 5 (server-context) ── Phase 6 (cleanup)
Phase 3 (PidFileManager) ──┘
```

## Verification

1. `bun test` passes (all existing + new tests)
2. Start dev server (`bun dev`), observe logs: servers spawn once, "Creating new ServerContext (first evaluation)" appears once
3. Edit a source file to trigger HMR, observe logs: "Reconnected to existing server on port X" (no new spawn)
4. Stop dev server (Ctrl+C), verify `.mcp-servers/` is empty (PID files cleaned up)
5. Start dev server, `kill -9 <pid>`, restart: observe boot cleanup kills orphans, fresh spawn succeeds

## Critical Files

| File | Change |
|------|--------|
| `lib/port-registry.ts` | Add `reserve()` |
| `lib/json-rpc-client.ts` | Add `timeoutMs` param to `initialize()` |
| `lib/types.ts` | Add `connect()` to MCPServerFactory, `reserve()` to IPortRegistry |
| `lib/http-mcp-factory.ts` | Implement `connect()` |
| `lib/pid-file-manager.ts` | **New**: PID file I/O module |
| `lib/mcp-manager.ts` | PID file check before spawn, write after spawn, shutdown cleanup |
| `lib/server-context.ts` | Wire PidFileManager, boot cleanup, update comments |
| `.gitignore` | Add `.mcp-servers/` |
| `tests/lib/port-registry.test.ts` | Tests for `reserve()` |
| `tests/lib/http-mcp-factory.test.ts` | Tests for `connect()` |
| `tests/lib/pid-file-manager.test.ts` | **New**: PidFileManager tests |
| `tests/lib/mcp-manager.test.ts` | PID file coordination tests |
| `tests/lib/server-context.test.ts` | Boot cleanup tests |
