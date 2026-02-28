---
title: "Phase 3: Generic Toolbox Factory Interface"
date: 2026-02-27
status: draft
tags: [plan, refactor, toolbox]
related:
  - plans/toolbox-composability-refactor.md
---

# Phase 3: Generic Toolbox Factory Interface

## Context

Phases 1-2 deduplicated shared utilities and normalized deps to derive paths from IDs. Four toolboxes now exist with clean implementations, but each has its own bespoke deps interface (`BaseToolboxDeps`, `MeetingToolboxDeps`, `CommissionToolboxDeps`, `ManagerToolboxDeps`). The resolver constructs each toolbox with bespoke calls and manually threads extras (callbacks, services) through the `ToolboxResolverContext` grab-bag.

This phase extracts a generic factory interface so all toolboxes share the same creation signature. This is prep for Phase 5 (data-driven resolver) where adding a new toolbox shouldn't require editing the resolver.

## Design

### Shared types (`daemon/services/toolbox-types.ts`, new file)

```typescript
interface GuildHallToolboxDeps {
  guildHallHome: string;
  projectName: string;
  contextId: string;
  contextType: "meeting" | "commission";
  workerName: string;
}

interface ToolboxOutput {
  server: McpSdkServerConfigWithInstance;
  wasResultSubmitted?: () => boolean;
}

type ToolboxFactory = (deps: GuildHallToolboxDeps) => ToolboxOutput;
```

Only imports from `@anthropic-ai/claude-agent-sdk`. No service imports, no circular dependency risk.

### Factory pattern

Base and meeting toolboxes directly implement `ToolboxFactory` (no extras needed).

Commission and manager use partial application (bind extras first, return a `ToolboxFactory`):

```
createCommissionToolboxFactory(callbacks) → ToolboxFactory
createManagerToolboxFactory(services) → ToolboxFactory
```

### Resolver change

`ToolboxResolverContext` gains `contextId`, `contextType`, `workerName` as required fields (replacing optional `meetingId`/`commissionId`). Adds `contextFactories?: ToolboxFactory[]` for pre-bound factories. Removes `onProgress`, `onResult`, `onQuestion`, `managerToolboxDeps`, `isManager`. The caller assembles factories; the resolver executes them.

### Test callback capture

Commission session tests currently capture `onProgress/onResult/onQuestion` from the `ToolboxResolverContext` via `resolveToolSetFn`. After the refactor, callbacks aren't on the context. New DI seam `onCallbacksCreated?: (callbacks: CommissionCallbacks) => void` on `CommissionSessionDeps` lets tests capture callbacks when commission-session.ts creates them.

## Steps

### Step 1: Create `daemon/services/toolbox-types.ts`

New file with `GuildHallToolboxDeps`, `ToolboxOutput`, `ToolboxFactory`. No other files change.

### Step 2: Add `baseToolboxFactory` to `daemon/services/base-toolbox.ts`

Additive. New export alongside existing `createBaseToolbox`:

```typescript
export const baseToolboxFactory: ToolboxFactory = (deps) => ({
  server: createBaseToolbox(deps),
});
```

Works because `GuildHallToolboxDeps` is structurally identical to `BaseToolboxDeps`.

### Step 3: Add `meetingToolboxFactory` to `daemon/services/meeting-toolbox.ts`

Additive. New export alongside existing `createMeetingToolbox`:

```typescript
export const meetingToolboxFactory: ToolboxFactory = (deps) => ({
  server: createMeetingToolbox(deps),
});
```

Works because `GuildHallToolboxDeps` is a structural supertype of `MeetingToolboxDeps` (has all four needed fields plus `contextType`).

### Step 4: Add `createCommissionToolboxFactory` to `daemon/services/commission-toolbox.ts`

Additive. New type + export:

```typescript
export interface CommissionCallbacks {
  onProgress: (summary: string) => void;
  onResult: (summary: string, artifacts?: string[]) => void;
  onQuestion: (question: string) => void;
}

export function createCommissionToolboxFactory(callbacks: CommissionCallbacks): ToolboxFactory {
  return (ctx) => {
    const result = createCommissionToolbox({
      guildHallHome: ctx.guildHallHome,
      projectName: ctx.projectName,
      contextId: ctx.contextId,
      ...callbacks,
    });
    return { server: result.server, wasResultSubmitted: result.wasResultSubmitted };
  };
}
```

Existing `createCommissionToolbox` and handler factories unchanged.

### Step 5: Add `createManagerToolboxFactory` to `daemon/services/manager-toolbox.ts`

Additive. New type + export:

```typescript
export interface ManagerServices {
  commissionSession: CommissionSessionForRoutes;
  eventBus: EventBus;
  gitOps: GitOps;
  getProjectConfig: (name: string) => Promise<ProjectConfig | undefined>;
}

export function createManagerToolboxFactory(services: ManagerServices): ToolboxFactory {
  return (ctx) => ({
    server: createManagerToolbox({
      projectName: ctx.projectName,
      guildHallHome: ctx.guildHallHome,
      ...services,
    }),
  });
}
```

Existing `createManagerToolbox` and handler factories unchanged.

### Step 6: Refactor `daemon/services/toolbox-resolver.ts`

Replace the internal assembly logic to use factories.

**`ToolboxResolverContext` becomes:**
```typescript
export interface ToolboxResolverContext {
  projectName: string;
  guildHallHome: string;
  contextId: string;
  contextType: "meeting" | "commission";
  workerName: string;
  contextFactories?: ToolboxFactory[];
}
```

**`resolveToolSet` becomes:**
- Build `GuildHallToolboxDeps` from context fields
- Execute `[baseToolboxFactory, ...context.contextFactories]` with shared deps
- Collect servers and `wasResultSubmitted` from outputs
- Domain toolbox validation unchanged
- `allowedTools` assembly unchanged

Remove imports of `createMeetingToolbox`, `createCommissionToolbox`, `createManagerToolbox`, `ManagerToolboxDeps`. Add import of `baseToolboxFactory`. Remove the `if (context.meetingId)` / `else if (context.commissionId)` branching and the `if (context.isManager)` check.

**Test updates (`tests/daemon/toolbox-resolver.test.ts`):**

`testContext()` changes to:
```typescript
{ projectName: "test-project", contextId: "meeting-test", contextType: "meeting", workerName: "test-worker", guildHallHome }
```

Tests that checked meeting/commission/manager behavior add the appropriate factory to `contextFactories`. Tests for "commission without callbacks throws" and "neither meetingId nor commissionId" are removed (now enforced by TypeScript and caller responsibility).

**Other test updates:**
- `tests/daemon/state-isolation.test.ts`: Update `resolveToolSet` calls to new context shape
- `tests/daemon/memory-access-control.test.ts`: Same

### Step 7: Update `daemon/services/commission-session.ts`

1. Add `onCallbacksCreated` DI seam to `CommissionSessionDeps`:
   ```typescript
   onCallbacksCreated?: (callbacks: CommissionCallbacks) => void;
   ```

2. Refactor the dispatch code (around line 1042) to:
   - Create callbacks as local variables
   - Call `deps.onCallbacksCreated?.(callbacks)` after building them
   - Build `contextFactories` array using `createCommissionToolboxFactory(callbacks)` + optional `createManagerToolboxFactory(services)`
   - Pass new `ToolboxResolverContext` shape with `contextId`, `contextType`, `contextFactories`

**Test updates (`tests/daemon/commission-session.test.ts`):**

`createMockSession()` changes:
- `resolveToolSetFn` no longer captures callbacks from context. It still returns the mock `ResolvedToolSet` with `wasResultSubmitted`.
- New field `onCallbacksCreated` captures the `CommissionCallbacks` object.
- `submitResult`, `reportProgress`, `logQuestion` use captured callbacks.

All ~37 sites passing `resolveToolSetFn: mock.resolveToolSetFn` also pass `onCallbacksCreated: mock.onCallbacksCreated`.

**Other test updates:**
- `tests/daemon/concurrency-hardening.test.ts`: Same mock pattern change (~6 sites)
- `tests/daemon/commission-concurrent-limits.test.ts`: Same (~19 sites)
- `tests/daemon/dependency-auto-transitions.test.ts`: Type import update only (~4 sites)

### Step 8: Update `daemon/services/meeting-session.ts`

Refactor the `resolveToolSet` call (around line 496):
- Build `contextFactories` array: `[meetingToolboxFactory]` + optional `createManagerToolboxFactory(services)`
- Pass new context shape with `contextId`, `contextType`, `contextFactories`
- Remove `ManagerToolboxDeps` import

### Step 9: Cleanup (separate commit)

- Un-export `BaseToolboxDeps` from base-toolbox.ts (or remove, replaced by `GuildHallToolboxDeps`)
- Un-export `MeetingToolboxDeps` from meeting-toolbox.ts
- `ManagerToolboxDeps` stays exported (handler factory tests reference it)
- `CommissionToolboxDeps` stays exported (handler factory tests reference it)
- Update `createBaseToolbox` return type doc comment
- Update `createMeetingToolbox` return type doc comment

## Commit Strategy

- **Commit A** (Steps 1-5): New types + additive factory exports. All tests pass, no callers changed.
- **Commit B** (Steps 6-8): Resolver refactor + caller migration + all test updates. This is one atomic change.
- **Commit C** (Step 9): Cleanup old exports. Optional, can be deferred.

## Files Modified

| File | Change |
|------|--------|
| `daemon/services/toolbox-types.ts` | **New**: shared types |
| `daemon/services/base-toolbox.ts` | Add `baseToolboxFactory` export |
| `daemon/services/meeting-toolbox.ts` | Add `meetingToolboxFactory` export |
| `daemon/services/commission-toolbox.ts` | Add `CommissionCallbacks`, `createCommissionToolboxFactory` |
| `daemon/services/manager-toolbox.ts` | Add `ManagerServices`, `createManagerToolboxFactory` |
| `daemon/services/toolbox-resolver.ts` | New context shape, factory-driven assembly |
| `daemon/services/commission-session.ts` | `onCallbacksCreated` DI seam, factory construction |
| `daemon/services/meeting-session.ts` | Factory construction, new context shape |
| `tests/daemon/toolbox-resolver.test.ts` | New context shape, factory-based assertions |
| `tests/daemon/commission-session.test.ts` | `onCallbacksCreated` mock pattern (~37 sites) |
| `tests/daemon/concurrency-hardening.test.ts` | Same mock pattern (~6 sites) |
| `tests/daemon/commission-concurrent-limits.test.ts` | Same mock pattern (~19 sites) |
| `tests/daemon/dependency-auto-transitions.test.ts` | Type import update (~4 sites) |
| `tests/daemon/state-isolation.test.ts` | New resolver context shape |
| `tests/daemon/memory-access-control.test.ts` | New resolver context shape |

## Verification

1. `bun run typecheck` after each commit
2. `bun test` after each commit (all 1532 tests pass)
3. `bun run lint` after Commit B
4. Spot-check: `bun test tests/daemon/toolbox-resolver.test.ts tests/daemon/commission-session.test.ts tests/daemon/base-toolbox.test.ts`
