---
title: Improve Briefing Generator with Full SDK Pattern
date: 2026-02-27
status: executed
tags: [briefing, agent-sdk, guild-master, infrastructure]
modules: [briefing-generator, sdk-runner]
---

# Improve Briefing Generator with Full SDK Pattern

## Context

The briefing generator (`apps/daemon/services/briefing-generator.ts`) pre-digests project state via `buildManagerContext()` into a markdown string, then asks a single-turn LLM to summarize it. This defeats the purpose of using an LLM: it can't explore files, use tools, or reason about what it finds. The result is a glorified template engine.

The fix: wire the briefing generator through the same SDK infrastructure that meetings and commissions use. Activate the Guild Master worker (with its SOUL/POSTURE/memory), give it read-only tools, set `maxTurns: 30`, and let it explore project state before producing a briefing.

## Approach

Use `prepareSdkSession()` + `runSdkSession()` from the existing SDK runner infrastructure. The Guild Master worker provides identity and memory. A new `"briefing"` context type avoids adding meeting/commission/manager toolboxes. The caching layer stays unchanged.

## Changes

### 1. Add `"briefing"` context type

**Files:**
- `apps/daemon/lib/agent-sdk/sdk-runner.ts` (lines 58, 80)
- `apps/daemon/services/toolbox-resolver.ts` (line 37)
- `apps/daemon/services/toolbox-types.ts` (if `GuildHallToolboxDeps.contextType` is typed there)

Add `"briefing"` to the `contextType` union in `SessionPrepSpec`, `SessionPrepDeps` context arg, and `ToolboxResolverContext`.

In the toolbox resolver, guard the context factory lookup (line 95-96) so missing registry entries don't crash:

```typescript
// Before:
const contextFactory = SYSTEM_TOOLBOX_REGISTRY[context.contextType];
mcpServers.push(contextFactory(deps).server);

// After:
const contextFactory = SYSTEM_TOOLBOX_REGISTRY[context.contextType];
if (contextFactory) {
  mcpServers.push(contextFactory(deps).server);
}
```

This means "briefing" gets no context-specific toolbox (no meeting/commission tools). Just the base toolbox (memory, artifact, decision tools) and the worker's built-in tools (Read, Glob, Grep).

### 2. Strip manager system toolbox for briefing

The Guild Master worker declares `systemToolboxes: ["manager"]`, which would add the 8 coordination tools (create_commission, dispatch, cancel, etc.). Briefings should be read-only.

In the briefing generator, wrap the injected `resolveToolSet` to override the worker's `systemToolboxes` to `[]`:

```typescript
const briefingResolveToolSet: SessionPrepDeps["resolveToolSet"] = (worker, packages, context) => {
  return deps.prepDeps.resolveToolSet(
    { ...worker, systemToolboxes: [] },
    packages,
    context,
  );
};
```

This keeps the change contained to the briefing generator without modifying the resolver or worker definition.

### 3. Add `collectRunnerText()` helper

**File:** `apps/daemon/lib/sdk-text.ts`

`runSdkSession` yields `SdkRunnerEvent`, not `SDKMessage`. We need a text collector for the runner event stream:

```typescript
export async function collectRunnerText(
  generator: AsyncGenerator<SdkRunnerEvent>,
): Promise<string> {
  const parts: string[] = [];
  for await (const event of generator) {
    if (event.type === "text_delta") {
      parts.push(event.text);
    }
  }
  return parts.join("");
}
```

### 4. Refactor `BriefingGeneratorDeps` and `generateBriefing()`

**File:** `apps/daemon/services/briefing-generator.ts`

New deps shape:

```typescript
export interface BriefingGeneratorDeps {
  queryFn?: BriefingQueryFn;
  prepDeps?: SessionPrepDeps;    // NEW: for full SDK pattern
  packages: DiscoveredPackage[];
  config: AppConfig;
  guildHallHome: string;
  clock?: () => number;
}
```

Both `queryFn` and `prepDeps` are optional. When both are present, use the full SDK pattern. When only `queryFn` is present, fall back to current single-turn behavior (backwards compatible). When neither is present, use the template.

New `generateBriefing()` flow (SDK path):

1. Check cache (unchanged)
2. Find project in config (unchanged)
3. Build manager context via `buildManagerContext()` (unchanged, injected as `activationExtras.managerContext`)
4. Create `SessionPrepSpec`:
   - `workerName`: `MANAGER_WORKER_NAME` ("Guild Master")
   - `contextType`: `"briefing"`
   - `workspaceDir`: integration worktree path
   - `projectPath`: `project.path` from config
   - `contextId`: `briefing-${projectName}`
   - `eventBus`: `noopEventBus`
   - `abortController`: new per invocation
   - `resourceOverrides`: `{ maxTurns: 30 }`
   - `activationExtras`: `{ managerContext: context }`
   - No `services` (no manager toolbox)
5. Call `prepareSdkSession(spec, wrappedPrepDeps)` with the system-toolbox-stripped resolver
6. Override `options.model` to `"sonnet"` (manager defaults to opus, briefings don't need it)
7. Call `runSdkSession(queryFn, prompt, options)`
8. Collect text via `collectRunnerText()`
9. Fall back to template if text is empty or prep/session fails
10. Write cache and return (unchanged)

The prompt simplifies to something like:

```
Generate a project status briefing for the Guild Hall dashboard.
Cover what's in progress, what's blocked, what recently completed,
and what needs attention next. Be factual and direct. 3-5 sentences,
plain prose, no headers or bullets.
```

The heavy lifting (project state, commissions, meetings, workers) is already in the system prompt via manager activation.

### 5. Update production wiring

**File:** `apps/daemon/app.ts` (lines 287-295)

Pass `prepDeps` to the briefing generator:

```typescript
const briefingGenerator = makeBriefingGenerator({
  queryFn,
  prepDeps,     // NEW: same prepDeps used for commissions/meetings
  packages: allPackages,
  config,
  guildHallHome,
});
```

### 6. Update tests

**File:** `apps/daemon/tests/services/briefing-generator.test.ts`

- Add mock `SessionPrepDeps` (mock `resolveToolSet`, `loadMemories`, `activateWorker`)
- Update `makeDeps()` to include `prepDeps`
- SDK path tests: verify `prepareSdkSession` is called (via mock activateWorker being invoked)
- Mock queryFn still works the same way (yields SDKMessage), but now goes through `runSdkSession` which translates to `SdkRunnerEvent`
- Cache tests: unchanged (they test the outer layer)
- Template fallback tests: unchanged (queryFn undefined path)
- Add test: when `prepDeps` is missing but `queryFn` is present, falls back to single-turn behavior (backwards compat)

## Files Modified

| File | Change |
|------|--------|
| `apps/daemon/lib/agent-sdk/sdk-runner.ts` | Add `"briefing"` to contextType unions (lines 58, 80) |
| `apps/daemon/services/toolbox-resolver.ts` | Guard context factory lookup (line 95-96), add `"briefing"` to context type (line 37) |
| `apps/daemon/services/toolbox-types.ts` | Add `"briefing"` to `GuildHallToolboxDeps.contextType` (line 19) |
| `apps/daemon/services/base-toolbox.ts` | Add `"briefing"` to contextType unions (lines 21, 96), handle `"briefing"` in stateSubdir ternary (line 98) |
| `apps/daemon/lib/sdk-text.ts` | Add `collectRunnerText()` for SdkRunnerEvent streams |
| `apps/daemon/services/briefing-generator.ts` | Refactor to use full SDK pattern |
| `apps/daemon/app.ts` | Pass `prepDeps` to briefing generator (line 290) |
| `apps/daemon/tests/services/briefing-generator.test.ts` | Update for new deps and multi-turn pattern |

## What Stays

- File-based cache with 1-hour TTL
- Template fallback when SDK is unavailable
- `generateTemplateBriefing()` helper (used for fallback)
- Route handler (`apps/daemon/routes/briefing.ts`) unchanged
- `BriefingResult` type unchanged
- `invalidateCache()` unchanged

## Verification

1. `bun test apps/daemon/tests/services/briefing-generator.test.ts` passes
2. `bun run typecheck` passes
3. `bun run lint` passes
4. `bun test` (full suite) passes
5. Manual: start daemon, hit `GET /briefing/test-project`, verify the response is a meaningful briefing (not a template summary)
