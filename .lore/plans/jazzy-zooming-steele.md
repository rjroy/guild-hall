# Plan: Escalate AppConfig into GuildHallToolboxDeps

## Context

`GuildHallToolboxDeps` is the universal dependency interface passed to all toolbox factories (base, context, domain). Currently it has 6 fields: `guildHallHome`, `projectName`, `contextId`, `contextType`, `workerName`, `eventBus`. Domain toolboxes have no access to project configuration.

`AppConfig` (projects list, settings bag, maxConcurrentCommissions) is held by sessions (meeting, commission) and threaded to the manager toolbox as a `getProjectConfig` closure. This limits domain toolboxes that might need project-specific config or app-level settings.

Adding `config: AppConfig` to `GuildHallToolboxDeps` makes configuration uniformly available to all toolboxes, including third-party domain toolboxes loaded at activation time. As a bonus, the manager toolbox factory simplifies: `getProjectConfig` moves out of `ManagerServices` since the factory can derive it from `ctx.config`.

## Changes

### 1. Add `config` to `GuildHallToolboxDeps`

**File:** `daemon/services/toolbox-types.ts`

Add `config: AppConfig` to the interface. Add import for `AppConfig` from `@/lib/types`.

### 2. Add `config` to `ToolboxResolverContext`

**File:** `daemon/services/toolbox-resolver.ts`

Add `config: AppConfig` to `ToolboxResolverContext`. Thread it into the `deps` object built at line 50.

### 3. Pass config from meeting session

**File:** `daemon/services/meeting-session.ts`

In `buildActivatedQueryOptions` (line 510), add `config: deps.config` to the `resolveToolSet` context.

### 4. Pass config from commission session

**File:** `daemon/services/commission-session.ts`

In the tool resolution call (line 1079), add `config: deps.config` to the resolver context.

### 5. Simplify manager toolbox factory

**File:** `daemon/services/manager-toolbox.ts`

- Remove `getProjectConfig` from `ManagerServices` (line 698)
- In `createManagerToolboxFactory`, derive `getProjectConfig` from `ctx.config`:
  ```typescript
  getProjectConfig: (name: string) =>
    Promise.resolve(ctx.config.projects.find(p => p.name === name)),
  ```
- `ManagerToolboxDeps` keeps `getProjectConfig` unchanged (handlers don't change)
- Remove `getProjectConfig` from the meeting-session and commission-session call sites where `createManagerToolboxFactory` is invoked

### 6. Update tests

**File:** `tests/daemon/toolbox-resolver.test.ts`

- Add `config: { projects: [] }` (or appropriate shape) to `testContext()`
- Remove `getProjectConfig` from `createManagerToolboxFactory` calls in manager tests

**Files:** `tests/daemon/services/manager-toolbox.test.ts`, `tests/daemon/services/manager-sync-project.test.ts`

These tests construct `ManagerToolboxDeps` directly (not through the factory), so they keep their existing `getProjectConfig` and need no changes.

## Files Modified

| File | Change |
|------|--------|
| `daemon/services/toolbox-types.ts` | Add `config: AppConfig` to interface |
| `daemon/services/toolbox-resolver.ts` | Add `config` to context and deps |
| `daemon/services/meeting-session.ts` | Pass `config` in resolver context |
| `daemon/services/commission-session.ts` | Pass `config` in resolver context |
| `daemon/services/manager-toolbox.ts` | Simplify factory, remove `getProjectConfig` from `ManagerServices` |
| `tests/daemon/toolbox-resolver.test.ts` | Add `config` to test context, update manager factory calls |

## Verification

1. `bun run typecheck` passes
2. `bun test` passes (all 1529 tests)
3. Confirm domain toolbox fixtures in `tests/daemon/toolbox-resolver.test.ts` receive `config` in deps (the existing `toolboxFactory(deps)` fixtures will now see the field)
