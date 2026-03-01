---
title: "Phase 5: Make the Resolver Data-Driven (Domain Toolbox Loading)"
date: 2026-02-27
status: executed
tags: [plan, refactor, toolbox]
related:
  - plans/toolbox-refactor/toolbox-composability-refactor.md
  - specs/guild-hall-workers.md
---

# Phase 5: Domain Toolbox Loading

## Context

The toolbox resolver (`daemon/services/toolbox-resolver.ts`) assembles MCP tool servers for workers at activation time. Step 3 of that assembly (domain toolboxes) is a stub: it validates that the referenced package exists but never loads or creates MCP servers from it. The comment on line 73 says "Domain toolbox MCP servers will be created by the toolbox package itself in a later phase."

This phase completes that stub, fulfilling REQ-WKR-6a ("A toolbox package exports a collection of tool definitions. Guild Hall loads these at activation time") and closing the last TODO from the original toolbox-resolver design.

## Design Decisions

**Export convention:** Domain toolbox packages export a named `toolboxFactory` from `index.ts`. This matches the existing system toolbox pattern (`baseToolboxFactory`, `meetingToolboxFactory`). Package authors get full control over server name (which determines `mcp__<name>__*` wildcards), version, and tool configuration.

**Entry point:** `path.resolve(pkg.path, "index.ts")`, same convention as worker activation (`meeting-session.ts:318`, `commission-session.ts:999`). No new metadata fields needed.

**Async propagation:** `resolveToolSet` becomes async (dynamic `import()` requires it). Both production call sites are already in async contexts.

**Type sharing:** Domain packages in `packages/` can import types via `@/daemon/services/toolbox-types`. No separate SDK package needed yet.

## Steps

### 1. Add `loadDomainToolbox` and make resolver async

**File: `daemon/services/toolbox-resolver.ts`**

- Add `import * as path from "node:path"` and import `GuildHallToolboxDeps`, `ToolboxOutput` from `./toolbox-types`
- Add async helper `loadDomainToolbox(pkg, deps)` that:
  - Imports `path.resolve(pkg.path, "index.ts")`
  - Validates a `toolboxFactory` named export exists (typeof === "function")
  - Calls the factory with deps, returns the `ToolboxOutput`
  - Wraps import failures and missing exports in descriptive errors naming the package
- Change `resolveToolSet` to `async`, return `Promise<ResolvedToolSet>`
- Replace domain toolbox stub loop body with `await loadDomainToolbox(pkg, deps)` + `mcpServers.push(output.server)`

### 2. Update production call sites

**`daemon/services/meeting-session.ts:511`** - Add `await` before `resolveToolSet(...)`.

**`daemon/services/commission-session.ts:1079`** - Add `await` before `resolve(...)`. The DI seam type (`resolveToolSetFn?: typeof resolveToolSet`) auto-reflects the async signature change.

### 3. Update existing resolver tests for async

**`tests/daemon/toolbox-resolver.test.ts`** - All test functions become `async`, all `resolveToolSet()` calls get `await`. Three `.toThrow()` assertions become `await expect(...).rejects.toThrow()`.

**`tests/daemon/state-isolation.test.ts`** - 2 calls at lines 531, 541.

**`tests/daemon/memory-access-control.test.ts`** - 3 calls at lines 235, 249, 265.

### 4. Update commission test mocks for async DI seam

68 `resolveToolSetFn` occurrences across 4 files need `async` added to the mock function:

| File | Count |
|------|-------|
| `tests/daemon/commission-session.test.ts` | 39 |
| `tests/daemon/commission-concurrent-limits.test.ts` | 19 |
| `tests/daemon/concurrency-hardening.test.ts` | 6 |
| `tests/daemon/dependency-auto-transitions.test.ts` | 4 |

Mechanical change: `resolveToolSetFn: () =>` becomes `resolveToolSetFn: async () =>` (or wrap return in `Promise.resolve()`).

### 5. Add domain toolbox integration tests

**`tests/daemon/toolbox-resolver.test.ts`** - New describe block with real fixture packages on disk.

Test fixtures are `.ts` files written to temp directories. They return mock MCP server shapes (no SDK imports, since temp dirs can't resolve `node_modules`). This is sufficient because the resolver just pushes whatever the factory returns into the array.

Helper:
```ts
async function createToolboxFixture(name, serverName, indexContent) {
  // writes package.json + index.ts to tmpDir/packages/<name>/
  // returns DiscoveredPackage
}
```

Test cases:
1. Domain toolbox loads, server appears in `mcpServers`, wildcard in `allowedTools`
2. Multiple domain toolboxes load in declaration order
3. Domain toolbox + context factory coexist (base + meeting + domain = 3 servers)
4. Missing `toolboxFactory` export throws with package name and available exports
5. Import failure (syntax error) throws with package name and cause
6. Worker-toolbox hybrid package works as domain toolbox

### 6. Verify

```bash
bun run typecheck
bun test tests/daemon/toolbox-resolver.test.ts
bun test
bun run lint
```

## Files Modified

| File | Nature of Change |
|------|-----------------|
| `daemon/services/toolbox-resolver.ts` | Add `loadDomainToolbox`, make async, replace stub |
| `daemon/services/meeting-session.ts` | Add `await` (1 line) |
| `daemon/services/commission-session.ts` | Add `await` (1 line) |
| `tests/daemon/toolbox-resolver.test.ts` | Async migration + 6 new domain toolbox tests |
| `tests/daemon/state-isolation.test.ts` | Async migration (2 calls) |
| `tests/daemon/memory-access-control.test.ts` | Async migration (3 calls) |
| `tests/daemon/commission-session.test.ts` | Async mock migration (39 sites) |
| `tests/daemon/commission-concurrent-limits.test.ts` | Async mock migration (19 sites) |
| `tests/daemon/concurrency-hardening.test.ts` | Async mock migration (6 sites) |
| `tests/daemon/dependency-auto-transitions.test.ts` | Async mock migration (4 sites) |

## Risks

**Bun module cache:** Dynamic imports from temp dirs may be cached by path. Each test uses unique package names and unique temp dirs, so no collisions expected.

**Fixture dependency resolution:** Test fixtures in `/tmp/` can't import from `@anthropic-ai/claude-agent-sdk`. Fixtures return plain objects matching the expected shape instead. This tests the full import-and-invoke path without requiring SDK in temp dirs.
