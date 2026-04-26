---
title: "Plan: project_briefing base toolbox tool"
date: 2026-03-18
status: executed
tags: [base-toolbox, briefing, worker-awareness, tools]
modules: [base-toolbox, briefing-generator, toolbox-resolver, sdk-runner]
related:
  - .lore/brainstorm/growth-surface-2026-03-17.md
  - .lore/specs/infrastructure/background-briefing-refresh.md
  - .lore/plans/infrastructure/background-briefing-refresh.md
  - .lore/plans/infrastructure/improve-briefing-full-sdk-pattern.md
---

# Plan: project_briefing Base Toolbox Tool

## Goal

Add a read-only `project_briefing` tool to the base toolbox so every worker can check the current project status during any session (meeting, commission, mail). The tool calls the existing briefing generator's cache and returns the summary. No generation, no state changes.

This addresses the worker awareness gap: workers currently operate blind to what other workers are doing unless the user tells them. The briefing generator already produces this information for the dashboard. This plan makes it available where the work happens.

## Codebase Context

**Briefing generator** (`apps/daemon/services/briefing-generator.ts`): Factory function `createBriefingGenerator(deps)` returns an object with `getCachedBriefing(projectName): Promise<BriefingResult | null>`. This is a cache-only read. Returns `null` if no cached briefing exists. `BriefingResult` is `{ briefing: string, generatedAt: string, cached: boolean }`. The background refresh service (`apps/daemon/services/briefing-refresh.ts`) keeps the cache warm, so `getCachedBriefing` should return data under normal operation.

**Base toolbox** (`apps/daemon/services/base-toolbox.ts`): `createBaseToolbox(deps: BaseToolboxDeps)` builds an MCP server with 4 tools. `BaseToolboxDeps` is a slim interface: `contextId`, `contextType`, `workerName`, `projectName`, `guildHallHome`. The `baseToolboxFactory` in the same file narrows from `GuildHallToolboxDeps` to `BaseToolboxDeps`.

**Toolbox types** (`apps/daemon/services/toolbox-types.ts`): `GuildHallToolboxDeps` includes `config` and `eventBus` but not `briefingGenerator`. This is the type all toolbox factories receive from the resolver.

**Production wiring** (`apps/daemon/app.ts`): The `briefingGenerator` is created at app startup (line 425) and passed to routes and the refresh service. It is not currently passed to the toolbox resolver or session prep.

**Existing tests** (`apps/daemon/tests/base-toolbox.test.ts`): Tests use `mkdtemp` for isolation, call exported handler factories directly (e.g., `makeReadMemoryHandler`), and verify return shapes. No mocking of external services.

## Implementation Steps

### Step 1: Add getCachedBriefing callback to both deps interfaces

**Files**: `apps/daemon/services/base-toolbox.ts`, `apps/daemon/services/toolbox-types.ts`

Add an optional `getCachedBriefing` callback to both interfaces. The callback type is `(projectName: string) => Promise<BriefingResult | null>`. Add `import type { BriefingResult } from "./briefing-generator"` to `base-toolbox.ts` (new cross-service import, acceptable because the dependency direction is base-toolbox -> briefing-generator, not circular).

In `BaseToolboxDeps`:
```typescript
interface BaseToolboxDeps {
  // ... existing fields ...
  getCachedBriefing?: (projectName: string) => Promise<BriefingResult | null>;
}
```

In `GuildHallToolboxDeps`:
```typescript
interface GuildHallToolboxDeps {
  // ... existing fields ...
  getCachedBriefing?: (projectName: string) => Promise<BriefingResult | null>;
}
```

Both are optional. Existing callers (tests, briefing context sessions) don't need to provide it. Update `baseToolboxFactory` in `base-toolbox.ts` to forward `deps.getCachedBriefing` into the `BaseToolboxDeps` it constructs for `createBaseToolbox()`.

### Step 2: Wire getCachedBriefing through the toolbox resolver

**Files**: `apps/daemon/services/toolbox-resolver.ts`, `apps/daemon/app.ts`

The `GuildHallToolboxDeps` object is assembled inside `toolbox-resolver.ts` (around line 71-86), not in `app.ts`. The wiring path is:

1. `toolbox-resolver.ts`: The resolver builds `GuildHallToolboxDeps` from its context. Add `getCachedBriefing` to the context type the resolver accepts and forward it into the `GuildHallToolboxDeps` object it constructs.
2. `apps/daemon/app.ts`: Where `prepDeps` is assembled (around line 321-331), the briefing generator is already in scope. Pass `briefingGenerator.getCachedBriefing` into the resolver's context so it flows through to `GuildHallToolboxDeps` and down to `baseToolboxFactory`.

### Step 3: Implement the project_briefing tool

**Files**: `apps/daemon/services/base-toolbox.ts`

Add the tool to the `createBaseToolbox` function's tools array. Follow the `read_memory` pattern: a `makeProjectBriefingHandler` factory that closes over the callback and project name.

Handler behavior:
- If `getCachedBriefing` callback is not provided, return a message saying briefing is not available in this context.
- Call `getCachedBriefing(projectName)` with the project name from deps.
- If result is `null`, return a message saying no briefing is currently cached (the background refresh hasn't run yet or the project is new).
- If result exists, return the briefing text with the generation timestamp.
- No parameters needed. The project name comes from the session context, not from the worker.

Tool definition:
- Name: `project_briefing`
- Description: "Get the current project status briefing. Returns a summary of active commissions, meetings, and recent activity. Read-only, returns cached data."
- Input schema: empty object (no parameters)
- Export the handler factory for direct testing.

### Step 4: Verify production wiring end-to-end

Steps 1 and 2 handle the type changes and `app.ts` wiring. This step is a checkpoint: verify that the callback flows from `app.ts` through the resolver into `GuildHallToolboxDeps` into `baseToolboxFactory` into `createBaseToolbox`. Trace the path manually. If any link is missing, the tool will silently return "not available" because the callback is optional, which is correct degradation but wrong production behavior.

### Step 5: Tests

**Files**: `apps/daemon/tests/base-toolbox.test.ts`

Add a `describe("project_briefing", ...)` block. Test cases:

1. **Returns briefing when cache has data.** Create handler with a mock `getCachedBriefing` that returns `{ briefing: "All quiet.", generatedAt: "2026-03-18T12:00:00Z", cached: true }`. Verify the response includes the briefing text and timestamp.

2. **Returns message when cache is empty.** Mock returns `null`. Verify the response says no briefing is available (not an error, just informational).

3. **Returns message when callback is absent.** Create handler with `getCachedBriefing: undefined`. Verify the response says briefing is not available in this context.

4. **createBaseToolbox includes the tool.** Verify the MCP server config includes a tool named `project_briefing` when the toolbox is created.

### Step 6: Validate

Launch a sub-agent that reads this plan's Goal section and the implementation, verifying: the tool is registered in the base toolbox, the callback is wired in production, the handler is exported and tested, and no state changes occur.

## Delegation Guide

No specialized expertise needed. This is a straightforward DI wiring task following established patterns. Any implementation worker can handle all steps.

## Open Questions

None. The scope is bounded, the patterns are established, and the brainstorm has user approval.
