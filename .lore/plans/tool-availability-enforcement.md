---
title: Tool Availability Enforcement
date: 2026-03-10
status: implemented
tags: [plan, agent-sdk, workers, toolbox, security]
modules: [sdk-runner, toolbox-resolver, lib-types]
related:
  - .lore/specs/tool-availability-enforcement.md
  - .lore/retros/unified-sdk-runner.md
---

# Plan: Tool Availability Enforcement

## Spec Reference

**Spec**: `.lore/specs/tool-availability-enforcement.md`

Requirements addressed:
- REQ-TAE-4, TAE-6: `ResolvedToolSet` and toolbox resolver changes -> Step 1
- REQ-TAE-5, TAE-7: `SdkQueryOptions` and `prepareSdkSession` changes -> Step 2
- REQ-TAE-1, TAE-2, TAE-3, TAE-8, TAE-9: Enforcement semantics -> Steps 1-2
- REQ-TAE-10 (tests 6-7): Toolbox resolver tests -> Step 3
- REQ-TAE-10 (tests 1-5): SDK runner tests -> Step 4
- REQ-TAE-12: Mock fixture updates -> Steps 3-4
- REQ-TAE-11: Backward compatibility -> verified across all steps

## Codebase Context

**Toolbox resolver** (`daemon/services/toolbox-resolver.ts:134-143`): Builds `allowedTools` from `worker.builtInTools` + MCP server wildcards and returns `{ mcpServers, allowedTools }`. The `builtInTools` array is available in this function but only used as input to `allowedTools`. Passing it through as a separate field is a one-line addition.

**SDK runner** (`daemon/lib/agent-sdk/sdk-runner.ts:384-398`): `prepareSdkSession` builds `SdkQueryOptions` from the activation result. It reads `activation.tools.allowedTools` and `activation.tools.mcpServers`. Adding `tools: activation.tools.builtInTools` is a one-line addition to the options object.

**`SdkQueryOptions`** (`daemon/lib/agent-sdk/sdk-runner.ts:35-49`): The local type for SDK session options. Currently has `allowedTools?: string[]` but no `tools` field. The SDK accepts `tools?: string[] | { type: "preset"; preset: "claude_code" }`.

**`ResolvedToolSet`** (`lib/types.ts:175-178`): Shared type used by both the toolbox resolver (producer) and the SDK runner (consumer, via `ActivationResult.tools`). Currently has `mcpServers` and `allowedTools`. Adding `builtInTools` here makes it available throughout the activation chain without touching intermediate types.

**Test fixtures**: Adding `builtInTools` to `ResolvedToolSet` will cause compile errors in every file that constructs one without the new field. The full list:

| File | Fixture | Value for `builtInTools` |
|------|---------|--------------------------|
| `tests/daemon/services/sdk-runner.test.ts` | `mockResolvedTools` (line 374) | `["Read", "Write"]` |
| `tests/daemon/services/sdk-runner.test.ts` | `mockResolvedTools` (line 1147) | `["Read", "Write"]` |
| `tests/daemon/services/sdk-runner.test.ts` | inline `tools` override (line 591) | `[]` |
| `tests/daemon/services/manager-worker.test.ts` | `defaultTools` (line 23) | `[]` |
| `tests/daemon/services/manager-worker.test.ts` | inline `ResolvedToolSet` (line 211) | `[]` |
| `tests/packages/worker-role-smoke.test.ts` | `makeResolvedTools()` (line 15) | `[]` |
| `tests/packages/worker-activation.test.ts` | `makeResolvedTools()` (line 5) | `[]` |

All fixtures outside `sdk-runner.test.ts` use `builtInTools: []` because they test activation mechanics, not tool enforcement. The `sdk-runner.test.ts` fixtures use values matching their test scenario.

**Activation chain**: Worker activation (`packages/shared/worker-activation.ts`) passes `context.resolvedTools` through to `ActivationResult.tools`. Since `resolvedTools` and `ActivationResult.tools` are both typed as `ResolvedToolSet`, the `builtInTools` field flows through without any changes to the activation code.

## Implementation Steps

### Step 1: Add `builtInTools` to `ResolvedToolSet` and toolbox resolver

**Files**: `lib/types.ts`, `daemon/services/toolbox-resolver.ts`
**Addresses**: REQ-TAE-4, REQ-TAE-6

In `lib/types.ts`, add `builtInTools: string[]` to `ResolvedToolSet`:

```typescript
export interface ResolvedToolSet {
  mcpServers: McpSdkServerConfigWithInstance[];
  allowedTools: string[];
  builtInTools: string[];
}
```

In `daemon/services/toolbox-resolver.ts`, add `builtInTools` to the return value at line 143:

```typescript
return { mcpServers, allowedTools, builtInTools: worker.builtInTools };
```

This is the producer side. The `builtInTools` value is `worker.builtInTools` passed through unchanged, exactly as declared in the worker's `package.json`. No transformation, no merging with MCP tools.

After this step, TypeScript will report errors wherever `ResolvedToolSet` is constructed without `builtInTools`. That drives the fixture updates in Steps 3-4.

**Verification**: `bun run typecheck` will fail (expected, fixtures not yet updated). The type errors confirm which test fixtures need updating.

### Step 2: Add `tools` to `SdkQueryOptions` and `prepareSdkSession`

**Files**: `daemon/lib/agent-sdk/sdk-runner.ts`
**Addresses**: REQ-TAE-5, REQ-TAE-7, REQ-TAE-1, REQ-TAE-8, REQ-TAE-9

Add `tools` to `SdkQueryOptions` (line 39, after `allowedTools`):

```typescript
export type SdkQueryOptions = {
  systemPrompt?: string | { type: "preset"; preset: "claude_code"; append?: string };
  permissionMode?: string;
  mcpServers?: Record<string, unknown>;
  allowedTools?: string[];
  tools?: string[] | { type: "preset"; preset: "claude_code" };
  // ... rest unchanged
};
```

In `prepareSdkSession`, add `tools` to the options object (after `allowedTools` at line 388):

```typescript
const options: SdkQueryOptions = {
  systemPrompt: { type: "preset", preset: "claude_code", append: activation.systemPrompt },
  cwd: spec.workspaceDir,
  mcpServers,
  allowedTools: activation.tools.allowedTools,
  tools: activation.tools.builtInTools,
  // ... rest unchanged
};
```

Key points from the spec:
- `tools` controls which built-in tools exist in the model's context (REQ-TAE-1, REQ-TAE-2)
- `allowedTools` stays for defense-in-depth (REQ-TAE-8)
- `settingSources` stays as `["local", "project", "user"]` (REQ-TAE-9)
- MCP tools are unaffected by `tools` (REQ-TAE-2)

**Verification**: `bun run typecheck` will still fail (test fixtures). The production code is complete after this step.

### Step 3: Update toolbox resolver tests

**Files**: `tests/daemon/toolbox-resolver.test.ts`
**Addresses**: REQ-TAE-10 (tests 6-7), REQ-TAE-12

Update existing test assertions to verify `builtInTools` in the resolver's return value. The tests already exercise `resolveToolSet` with various `builtInTools` inputs. Add assertions that the output's `builtInTools` field matches.

**New assertions on existing tests**:

In the "built-in tools and MCP wildcards assembled from worker metadata" test (which uses `builtInTools: ["Read", "Glob", "Grep", "Bash", "Edit"]`):
```typescript
expect(result.builtInTools).toEqual(["Read", "Glob", "Grep", "Bash", "Edit"]);
```

In the "empty builtInTools still includes MCP wildcards" test (which uses `builtInTools: []`):
```typescript
expect(result.builtInTools).toEqual([]);
// Confirm MCP wildcards are NOT in builtInTools
expect(result.builtInTools).not.toContain("mcp__guild-hall-base__*");
```

**New test cases** (REQ-TAE-10 tests 6-7):

```typescript
test("builtInTools matches worker declaration exactly", async () => {
  const worker = makeWorker({ builtInTools: ["Read", "Glob", "Grep"] });
  const result = await resolveToolSet(worker, [], testContext());
  expect(result.builtInTools).toEqual(["Read", "Glob", "Grep"]);
});

test("builtInTools excludes MCP server tools even when MCP servers are added", async () => {
  const worker = makeWorker({ builtInTools: ["Read"] });
  const result = await resolveToolSet(worker, [], testContext());
  // builtInTools has only what the worker declared
  expect(result.builtInTools).toEqual(["Read"]);
  // allowedTools has both built-in and MCP wildcards
  expect(result.allowedTools.length).toBeGreaterThan(result.builtInTools.length);
});
```

**Verification**: `bun test tests/daemon/toolbox-resolver.test.ts` passes.

### Step 4: Update all test fixtures and add tool enforcement tests

**Files**: `tests/daemon/services/sdk-runner.test.ts`, `tests/daemon/services/manager-worker.test.ts`, `tests/packages/worker-role-smoke.test.ts`, `tests/packages/worker-activation.test.ts`
**Addresses**: REQ-TAE-10 (tests 1-5), REQ-TAE-12

**Fixture updates** (REQ-TAE-12): All `ResolvedToolSet` constructions across the test suite need `builtInTools` added. See the fixture table in Codebase Context for the full list. For `sdk-runner.test.ts`:

```typescript
const mockResolvedTools: ResolvedToolSet = {
  mcpServers: [{ name: "test-server" } as ResolvedToolSet["mcpServers"][number]],
  allowedTools: ["read_file", "write_file"],
  builtInTools: ["Read", "Write"],
};
```

Also update the inline `tools` override (around line 591-597) that constructs a partial `ResolvedToolSet`:

```typescript
tools: {
  mcpServers: [
    { name: "server-a" } as ResolvedToolSet["mcpServers"][number],
    { name: "server-b" } as ResolvedToolSet["mcpServers"][number],
  ],
  allowedTools: [],
  builtInTools: [],
},
```

**New test cases** (REQ-TAE-10 tests 1-5):

```typescript
test("prepareSdkSession includes tools matching worker builtInTools", async () => {
  // Use a resolver that returns specific builtInTools
  const deps = makeDeps({
    resolveToolSet: async () => ({
      mcpServers: [{ name: "test-server" } as ResolvedToolSet["mcpServers"][number]],
      allowedTools: ["Read", "Glob", "Grep", "mcp__test-server__*"],
      builtInTools: ["Read", "Glob", "Grep"],
    }),
    activateWorker: async (_pkg, context) => ({
      systemPrompt: "test",
      tools: context.resolvedTools,
      resourceBounds: {},
    }),
  });

  const result = await prepareSdkSession(makeSpec(), deps);
  assert(result.ok);
  expect(result.result.options.tools).toEqual(["Read", "Glob", "Grep"]);
});

test("tools field excludes undeclared built-in tools", async () => {
  // Worker declares only Read, Glob, Grep. No Bash, no Write, no Edit.
  const deps = makeDeps({
    resolveToolSet: async () => ({
      mcpServers: [],
      allowedTools: ["Read", "Glob", "Grep"],
      builtInTools: ["Read", "Glob", "Grep"],
    }),
    activateWorker: async (_pkg, context) => ({
      systemPrompt: "test",
      tools: context.resolvedTools,
      resourceBounds: {},
    }),
  });

  const result = await prepareSdkSession(makeSpec(), deps);
  assert(result.ok);
  expect(result.result.options.tools).not.toContain("Bash");
  expect(result.result.options.tools).not.toContain("Write");
  expect(result.result.options.tools).not.toContain("Edit");
});

test("tools is independent of allowedTools", async () => {
  // allowedTools includes MCP wildcards; tools does not
  const deps = makeDeps({
    resolveToolSet: async () => ({
      mcpServers: [{ name: "my-mcp" } as ResolvedToolSet["mcpServers"][number]],
      allowedTools: ["Read", "Glob", "mcp__my-mcp__*"],
      builtInTools: ["Read", "Glob"],
    }),
    activateWorker: async (_pkg, context) => ({
      systemPrompt: "test",
      tools: context.resolvedTools,
      resourceBounds: {},
    }),
  });

  const result = await prepareSdkSession(makeSpec(), deps);
  assert(result.ok);
  // tools has only built-in names
  expect(result.result.options.tools).toEqual(["Read", "Glob"]);
  // allowedTools has both built-in names and MCP wildcards
  expect(result.result.options.allowedTools).toContain("mcp__my-mcp__*");
});

test("full builtInTools set is passed through to tools", async () => {
  // REQ-TAE-10 test 3: six-tool worker gets all six in tools
  const deps = makeDeps({
    resolveToolSet: async () => ({
      mcpServers: [],
      allowedTools: ["Read", "Glob", "Grep", "Write", "Edit", "Bash"],
      builtInTools: ["Read", "Glob", "Grep", "Write", "Edit", "Bash"],
    }),
    activateWorker: async (_pkg, context) => ({
      systemPrompt: "test",
      tools: context.resolvedTools,
      resourceBounds: {},
    }),
  });

  const result = await prepareSdkSession(makeSpec(), deps);
  assert(result.ok);
  expect(result.result.options.tools).toEqual(
    ["Read", "Glob", "Grep", "Write", "Edit", "Bash"],
  );
});

test("tools does not include MCP server entries", async () => {
  const deps = makeDeps({
    resolveToolSet: async () => ({
      mcpServers: [{ name: "srv" } as ResolvedToolSet["mcpServers"][number]],
      allowedTools: ["Read", "mcp__srv__*"],
      builtInTools: ["Read"],
    }),
    activateWorker: async (_pkg, context) => ({
      systemPrompt: "test",
      tools: context.resolvedTools,
      resourceBounds: {},
    }),
  });

  const result = await prepareSdkSession(makeSpec(), deps);
  assert(result.ok);
  expect(result.result.options.tools).toEqual(["Read"]);
  expect(result.result.options.tools).not.toContain("mcp__srv__*");
});
```

For the three additional fixture files (`manager-worker.test.ts`, `worker-role-smoke.test.ts`, `worker-activation.test.ts`), add `builtInTools: []` to each `ResolvedToolSet` construction. These files test activation and worker identity, not tool enforcement, so an empty array is correct.

**Verification**: `bun run typecheck` passes (all `ResolvedToolSet` constructions now include `builtInTools`). `bun test` full suite passes.

### Step 5: Full suite verification and spec validation

**Addresses**: All REQ-TAE-* via automated verification

Run the full check sequence:

1. `bun run typecheck` passes (no compile errors from missing `builtInTools` on `ResolvedToolSet`)
2. `bun run lint` passes
3. `bun test` passes (all existing tests + new tests)

Then launch a fresh-context sub-agent to validate the implementation against the spec. The validator should confirm:

1. `prepareSdkSession` passes `tools` as a `string[]` from `activation.tools.builtInTools`
2. `tools` and `allowedTools` are both present in the options (REQ-TAE-8)
3. `settingSources` is unchanged at `["local", "project", "user"]` (REQ-TAE-9)
4. No other callers of `prepareSdkSession` or `SdkQueryOptions` are broken by the new field
5. The `builtInTools` field flows through the activation chain without requiring changes to worker activation code

## Delegation Guide

This is a small, focused change. Three files of production code, five test files (two with new tests, three with fixture updates only). No new patterns, no architectural decisions, no DI wiring changes.

**Dalton (Implementation + fixture updates, Steps 1-2 and fixture portion of Step 4)**: The production changes (Steps 1-2) are one-line additions. The fixture updates across all test files are mechanical: add `builtInTools: []` or an appropriate value to each `ResolvedToolSet` construction. Dalton should handle both production code and fixture updates in a single commit so the pre-commit hook (which runs typecheck) can pass. The only judgment call is field ordering in `SdkQueryOptions` (place `tools` adjacent to `allowedTools` for readability).

**Sable (New tests, Steps 3-4 test cases)**: The toolbox resolver tests (Step 3) extend existing tests with new assertions. The SDK runner tests (Step 4 new test cases) follow the existing `prepareSdkSession` test patterns, specifically how they override `resolveToolSet` and `activateWorker` in `makeDeps`. This can be a second commit after Dalton's.

**Thorne (Review, Step 5 validation)**: Fresh-context review against the spec. Primary concern: confirm the `builtInTools` field flows through the activation chain without intermediate code needing changes. The reviewer should trace from `resolveToolSet` return through `ActivationContext.resolvedTools` through `ActivationResult.tools` to `prepareSdkSession`'s `activation.tools.builtInTools`.

**Pre-commit hook constraint**: The pre-commit hook runs typecheck, lint, tests, and build. Adding `builtInTools` to `ResolvedToolSet` (Step 1) will break typecheck until all fixtures are updated. Dalton must include fixture updates in the same commit as the type change. Sable's new tests can be a separate commit because they add new assertions, not fix compile errors.

### Commission structure

| Commission | Worker | Steps | Can start when |
|-----------|--------|-------|----------------|
| A: Implementation + fixtures | Dalton | 1-2 + fixture updates from Step 4 | Now |
| B: New tests | Sable | 3-4 (new test cases only) | Commission A complete |
| C: Verify + Review | Thorne | 5 | Commission B complete |

## Open Questions

None. The spec resolved all ambiguities. The `tools` parameter semantics, `settingSources` decision, and `allowedTools` retention are all settled. The implementation is mechanical.
