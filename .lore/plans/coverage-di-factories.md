# Coverage Threshold Plan

## Context

Four files are below the 80% functions / 90% lines threshold. Three share the same root cause: hardcoded dependencies with no DI seam, so tests can't reach the code without `mock.module()` (which is banned). The fix is to add factory functions following the project's established DI pattern (AgentManager, MCPManager, SessionStore all accept dependencies via constructor/factory).

## Files Below Threshold

| File | Funcs | Lines | Root Cause |
|------|-------|-------|------------|
| `lib/server-context.ts` | 0% | 27% | Hardcoded singletons |
| `lib/node-session-store.ts` | 0% | 79% | Module-level construction, no export of factory |
| `app/api/tools/invoke/route.ts` | 67% | 88% | POST wires server-context singletons directly |
| `tests/helpers/mock-fs.ts` | 83% | 87% | `stat` file-case and error-case not exercised |

## Phase 1: mock-fs test coverage

**No source changes.** Add a `describe("createMockFs")` block in `tests/lib/plugin-discovery.test.ts` (or a small dedicated test file) exercising:
- `stat()` on a path that exists in `files` (returns `isDirectory: () => false`)
- `stat()` on a nonexistent path (rejects with ENOENT)

**Files:** `tests/lib/plugin-discovery.test.ts`

## Phase 2: node-session-store factory

Export a `createNodeSessionStore(dir)` factory. Keep existing `sessionStore` and `sessionsDir` exports unchanged (backward compatible).

**Source change** in `lib/node-session-store.ts`:
```ts
export function createNodeSessionStore(sessionsDir: string): SessionStore {
  const nodeFs: SessionFileSystem = { /* same lambdas */ };
  return new SessionStore(sessionsDir, nodeFs);
}

// Backward-compatible defaults
export const sessionsDir = process.env.SESSIONS_DIR ?? path.resolve("./sessions");
export const sessionStore = createNodeSessionStore(sessionsDir);
```

**New test** `tests/lib/node-session-store.test.ts`: Integration test that creates a temp dir (`fs.mkdtemp`), calls `createNodeSessionStore(tmpDir)`, exercises `createSession` (covers `mkdir`, `writeFile`), `appendMessage` (covers `appendFile`), `listSessions` (covers `readdir`, `stat`), `getSession` (covers `readFile`), `deleteSession` (covers `rmdir`), `access`. Cleanup in `afterEach`.

**Files:** `lib/node-session-store.ts`, `tests/lib/node-session-store.test.ts` (new)

## Phase 3: server-context factory

Extract `createServerContext(deps)` factory. Move singleton state into the closure. Re-export getters from a default instance for backward compatibility.

**Source change** in `lib/server-context.ts`:
```ts
export type ServerContextDeps = {
  guildMembersDir: string;
  fs: FileSystem;
  queryFn: QueryFn;
  sessionStore: SessionStore;
  sessionsDir: string;
  serverFactory?: MCPServerFactory;
};

export type ServerContext = {
  getEventBus: () => EventBus;
  getAgentManager: () => Promise<AgentManager>;
  getMCPManager: () => Promise<MCPManager>;
  getRosterMap: () => Promise<Map<string, GuildMember>>;
};

export function createServerContext(deps: ServerContextDeps): ServerContext {
  // Closure holds singleton state
  // initialize() uses deps instead of module-level imports
  // Returns object with the four getter functions
}

// Default instance for production
const defaultContext = createServerContext({ /* real deps */ });
export const { getEventBus, getAgentManager, getMCPManager, getRosterMap } = defaultContext;
```

**New test** `tests/lib/server-context.test.ts`: Unit test using `createMockFs` for filesystem, mock `QueryFn` (reuse pattern from `tests/lib/agent.test.ts`), and `createMockSessionFs` + `SessionStore` for session store. Tests verify: `getEventBus` returns consistent instance, `getRosterMap`/`getMCPManager`/`getAgentManager` lazy-initialize correctly, concurrent calls share single initialization.

**Files:** `lib/server-context.ts`, `tests/lib/server-context.test.ts` (new)

## Phase 4: tools/invoke/route.ts POST factory

Export `createPOST(resolveDeps)` factory. Keep `POST` as default instance using real server-context getters.

**Source change** in `app/api/tools/invoke/route.ts`:
```ts
export function createPOST(
  resolveDeps: () => Promise<InvokeToolDeps>,
): (request: Request) => Promise<NextResponse> {
  return async (request: Request) => {
    const deps = await resolveDeps();
    return handleInvokeTool(request, deps);
  };
}

export const POST = createPOST(async () => {
  const [mcpManager, roster] = await Promise.all([getMCPManager(), getRosterMap()]);
  return { mcpManager, roster };
});
```

**Test addition** in `tests/api/tools-invoke.test.ts`: Add `describe("createPOST")` block testing that the factory calls `resolveDeps` and delegates to `handleInvokeTool`. Reuses existing `createDeps`, `makeRequest`, `parseJson` helpers.

**Files:** `app/api/tools/invoke/route.ts`, `tests/api/tools-invoke.test.ts`

## Execution Order

1. Phase 1 (mock-fs tests, no source changes)
2. Phase 2 (node-session-store, needed by phase 3)
3. Phase 3 (server-context)
4. Phase 4 (route.ts)

Run `bun test --coverage` after each phase to confirm progress.

## Verification

```bash
bun test --coverage
```

All four files should reach >= 80% functions, >= 90% lines. Run full suite to confirm no regressions.
