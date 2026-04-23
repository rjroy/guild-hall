---
title: "Plan: Guild Capabilities Discovery"
date: 2026-03-19
status: executed
tags: [base-toolbox, worker-discovery, collaboration]
modules: [base-toolbox, toolbox-resolver, toolbox-types]
related:
  - .lore/specs/workers/guild-capabilities-discovery.md
  - .lore/plans/infrastructure/project-briefing-tool.md
  - .lore/brainstorm/growth-surface-2026-03-17.md
---

# Plan: Guild Capabilities Discovery

## Goal

Add a read-only `list_guild_capabilities` tool to the base toolbox so every worker can discover who else is in the guild and what they do. The tool returns a formatted roster from worker package discovery data, injected via DI callback. No filesystem access from the base toolbox.

The briefing tool (when implemented) tells workers what's happening; this tool tells them who can help.

## Codebase Context

**WorkerIdentity** (`lib/types.ts:176-181`): Already has the three fields the spec requires: `name`, `displayTitle`, `description`. No new type needed.

**knownWorkerNames derivation** (`apps/daemon/services/toolbox-resolver.ts:80-83`): The resolver already filters `packages` to worker packages and maps to identity names. The same filter produces `WorkerIdentity[]` by mapping to `p.metadata.identity` instead of `p.metadata.identity.name`. This is the data source for the new callback.

**BaseToolboxDeps** (`apps/daemon/services/base-toolbox.ts:28-34`): Slim interface with context fields. The new callback gets added here as optional. `GuildHallToolboxDeps` (`apps/daemon/services/toolbox-types.ts:15-27`) is the wider interface that all toolbox factories receive. Both need the callback.

**baseToolboxFactory** (`apps/daemon/services/base-toolbox.ts:306-308`): Passes `GuildHallToolboxDeps` directly to `createBaseToolbox`. TypeScript structural typing narrows implicitly. Adding the callback to both interfaces maintains this pass-through pattern.

**Production wiring** (`apps/daemon/app.ts`): The callback doesn't need app-level wiring. The resolver already has `packages` in scope and builds `GuildHallToolboxDeps` directly (lines 71-86). The callback is derived inside the resolver, not passed in from `app.ts`. This is simpler than the briefing tool's wiring path because the data source is already local to the resolver.

## Implementation Steps

### Step 1: Add getWorkerIdentities callback to both deps interfaces

**Files**: `apps/daemon/services/toolbox-types.ts`, `apps/daemon/services/base-toolbox.ts`

Add an optional `getWorkerIdentities` callback to both interfaces. The callback type is `() => WorkerIdentity[]`. It takes no arguments because the roster is project-independent (all discovered workers are available to all sessions).

In `GuildHallToolboxDeps` (`apps/daemon/services/toolbox-types.ts`):
```typescript
import type { WorkerIdentity } from "@/lib/types";

interface GuildHallToolboxDeps {
  // ... existing fields ...
  getWorkerIdentities?: () => WorkerIdentity[];
}
```

In `BaseToolboxDeps` (`apps/daemon/services/base-toolbox.ts`):
```typescript
// Add WorkerIdentity to the existing import from @/lib/types (which already imports isNodeError)
import { isNodeError } from "@/lib/types";
import type { WorkerIdentity } from "@/lib/types";

interface BaseToolboxDeps {
  // ... existing fields ...
  getWorkerIdentities?: () => WorkerIdentity[];
}
```

Both are optional. Existing callers (tests, other contexts) don't need to provide it. The `baseToolboxFactory` pass-through continues to work because structural typing carries the field from `GuildHallToolboxDeps` through to `BaseToolboxDeps`.

**REQ coverage**: REQ-DISC-4 (WorkerIdentity data type), REQ-DISC-6 (DI callback, no filesystem access), REQ-DISC-7 (optional enables graceful degradation).

### Step 2: Wire getWorkerIdentities in the toolbox resolver

**Files**: `apps/daemon/services/toolbox-resolver.ts`

In `resolveToolSet`, where the `deps` object is assembled (lines 71-86), add a `getWorkerIdentities` callback alongside the existing `knownWorkerNames` derivation. The data source is identical: `packages` filtered to worker packages, but projecting identity objects instead of name strings.

```typescript
const deps: GuildHallToolboxDeps = {
  // ... existing fields ...
  knownWorkerNames: packages
    .filter(isWorkerPackage)
    .map((p) => (p.metadata as WorkerMetadata).identity?.name)
    .filter((name): name is string => typeof name === "string"),
  getWorkerIdentities: () =>
    packages
      .filter(isWorkerPackage)
      .map((p) => (p.metadata as WorkerMetadata).identity)
      .filter((id): id is WorkerIdentity => id != null),
};
```

This does not touch `ToolboxResolverContext`. The callback is derived from `packages` (which the resolver already receives as a parameter), not threaded through from `app.ts`. That's the key difference from the briefing tool: no production wiring step needed.

**REQ coverage**: REQ-DISC-4 (WorkerIdentity[] from DiscoveredPackage[]), REQ-DISC-6 (callback injected via deps, no filesystem access).

### Step 3: Implement the list_guild_capabilities tool

**Files**: `apps/daemon/services/base-toolbox.ts`

Add a `makeListGuildCapabilitiesHandler` factory and register the tool in `createBaseToolbox`.

Handler factory:
```typescript
export function makeListGuildCapabilitiesHandler(
  getWorkerIdentities?: () => WorkerIdentity[],
) {
  return async (): Promise<ToolResult> => {
    if (!getWorkerIdentities) {
      return {
        content: [{
          type: "text",
          text: "Guild capabilities discovery is not available in this context.",
        }],
      };
    }

    const workers = getWorkerIdentities();
    if (workers.length === 0) {
      return {
        content: [{
          type: "text",
          text: "No guild workers discovered.",
        }],
      };
    }

    const lines = workers.map(
      (w) => `${w.name} (${w.displayTitle}) - ${w.description}`,
    );
    const text = "Guild Workers:\n\n" + lines.join("\n");

    return { content: [{ type: "text", text }] };
  };
}
```

Tool registration inside `createBaseToolbox`:
```typescript
const listGuildCapabilities = makeListGuildCapabilitiesHandler(deps.getWorkerIdentities);

// In the tools array:
tool(
  "list_guild_capabilities",
  "List all guild workers with their titles and capabilities. Returns names, titles, and descriptions. Read-only.",
  {},
  () => listGuildCapabilities(),
),
```

Export the handler factory for direct testing (same pattern as `makeReadMemoryHandler`).

**Design notes**:
- No input parameters. The roster is context-free (REQ-DISC-1).
- No filtering by caller identity. All workers listed including Guild Master and self (REQ-DISC-3).
- Output is human-readable text, not JSON (REQ-DISC-2). Workers use this as context, not as data to parse.
- Only name, displayTitle, description exposed. No toolboxes, posture, model, or canUseToolRules (REQ-DISC-5).
- When callback is absent, returns informational message, not empty list, not error (REQ-DISC-7).
- The `workers.length === 0` case handles an edge condition where packages are discovered but none are worker packages. This is distinct from the callback-absent case.

**REQ coverage**: REQ-DISC-1 (tool definition), REQ-DISC-2 (output format), REQ-DISC-3 (no filtering), REQ-DISC-5 (limited fields), REQ-DISC-7 (graceful degradation).

### Step 4: Verify wiring end-to-end

This is a checkpoint, not a code change. Trace the callback path manually:

1. `resolveToolSet` derives `getWorkerIdentities` from `packages` and puts it in `deps`
2. `deps` flows to `baseToolboxFactory(deps)` (line 89 of toolbox-resolver.ts)
3. `baseToolboxFactory` passes `deps` to `createBaseToolbox(deps)` (line 307 of base-toolbox.ts)
4. `createBaseToolbox` reads `deps.getWorkerIdentities` and passes to handler factory

If any link is missing, the tool silently returns "not available" (correct degradation but wrong production behavior). Confirm the chain is unbroken before proceeding to tests.

### Step 5: Tests

**Files**: `apps/daemon/tests/base-toolbox.test.ts`

Add a `describe("list_guild_capabilities", ...)` block with these cases:

1. **Returns formatted roster when callback provides workers.** Create handler with a mock callback returning two `WorkerIdentity` objects. Verify the response includes "Guild Workers:" header, both worker names, titles, and descriptions in the expected format.

2. **Returns informational message when callback is absent.** Create handler with `getWorkerIdentities: undefined`. Verify the response text is "Guild capabilities discovery is not available in this context." Verify `isError` is not set.

3. **Returns empty roster message when callback returns empty array.** Create handler with a callback returning `[]`. Verify the response says "No guild workers discovered." (distinct from the callback-absent message).

4. **createBaseToolbox includes the tool.** Call the tool through the MCP server instance and verify it responds (either with roster data or the unavailability message). This proves registration without needing to inspect SDK internals.

5. **All discovered workers appear, including caller.** Create handler with a callback that includes the calling worker's identity. Verify the caller appears in the output (REQ-DISC-3).

### Step 6: Validate

Launch a fresh-context sub-agent to verify:
- The tool is registered in the base toolbox
- The callback is wired in the resolver (not just declared in types)
- The handler factory is exported and directly testable
- No state changes occur when the tool is called
- No filesystem access from the base toolbox
- The tool works across all session types (meeting, commission). This is structurally guaranteed because the base toolbox is always present regardless of context type, but confirm no context-type gating was accidentally introduced.
- All seven REQs from the spec are covered

## Delegation Guide

| Step | Implementer | Reviewer | Notes |
|------|-------------|----------|-------|
| Steps 1-4 | Dalton | (self-verified via Step 4 trace) | Straightforward DI wiring. Single PR. |
| Step 5 | Dalton | (tests are self-verifying) | Same test file, same patterns as existing memory tool tests. |
| Step 6 | Fresh-context review agent | Dalton fixes findings | Post-implementation review catches wiring gaps the implementer misses. This is the lesson from briefing generator: DI seams created during refactoring must be verified by someone who didn't write them. |

No specialized expertise needed. This is a direct application of the established DI callback pattern.

## Open Questions

None. The spec is approved, the data types exist, and the wiring pattern has a working template in the briefing tool plan.
