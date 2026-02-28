# Elevate tool services into GuildHallToolboxDeps

## Context

`ManagerServices` (`commissionSession` + `gitOps`) is currently bound via closure in `createManagerToolboxFactory`. This closure pattern was necessary because `GuildHallToolboxDeps` didn't carry service handles. Now that `eventBus` and `config` have been elevated into `GuildHallToolboxDeps`, the same pattern should apply to the remaining services: `commissionSession` and `gitOps`. This eliminates the closure-based factory wrapper and makes the manager toolbox a plain `ToolboxFactory` like commission and meeting toolboxes.

## Plan

### Step 1: Add `GuildHallToolServices` to `daemon/lib/toolbox-utils.ts`

Define the renamed interface using type-only imports (no runtime cycle):

```typescript
import type { CommissionSessionForRoutes } from "@/daemon/services/commission-session";
import type { GitOps } from "@/daemon/lib/git";

export interface GuildHallToolServices {
  commissionSession: CommissionSessionForRoutes;
  gitOps: GitOps;
}
```

### Step 2: Add `services?` to `GuildHallToolboxDeps` in `daemon/services/toolbox-types.ts`

Import `GuildHallToolServices` from `toolbox-utils` and add an optional field:

```typescript
import type { GuildHallToolServices } from "@/daemon/lib/toolbox-utils";

export interface GuildHallToolboxDeps {
  // ...existing fields...
  services?: GuildHallToolServices;
}
```

Optional because not all toolboxes need these services (only manager does).

### Step 3: Thread services through `ToolboxResolverContext` in `daemon/services/toolbox-resolver.ts`

`ToolboxResolverContext` mirrors `GuildHallToolboxDeps` fields. Add:

```typescript
services?: GuildHallToolServices;
```

And include it in the `deps` construction (line 52-60):

```typescript
services: context.services,
```

### Step 4: Simplify `createManagerToolboxFactory` in `daemon/services/manager-toolbox.ts`

Replace the closure-based factory with a plain `ToolboxFactory`:

```typescript
export const managerToolboxFactory: ToolboxFactory = (ctx) => ({
  server: createManagerToolbox({
    projectName: ctx.projectName,
    guildHallHome: ctx.guildHallHome,
    eventBus: ctx.eventBus,
    getProjectConfig: (name: string) =>
      Promise.resolve(ctx.config.projects.find((p) => p.name === name)),
    commissionSession: ctx.services!.commissionSession,
    gitOps: ctx.services!.gitOps,
  }),
});
```

Remove `ManagerServices` interface and `createManagerToolboxFactory` function. Keep `ManagerToolboxDeps` (still used by internal handler functions).

### Step 5: Update callers to pass services via context

**`daemon/services/commission-session.ts`** (~line 1065-1086):

Replace:
```typescript
const contextFactories: ToolboxFactory[] = [commissionToolboxFactory];
if (isManager && deps.commissionSessionRef?.current && deps.eventBus) {
  contextFactories.push(
    createManagerToolboxFactory({
      commissionSession: deps.commissionSessionRef.current,
      gitOps: git,
    }),
  );
}
// ... resolveToolSet call with contextFactories
```

With:
```typescript
const contextFactories: ToolboxFactory[] = [commissionToolboxFactory];
if (isManager && deps.commissionSessionRef?.current && deps.eventBus) {
  contextFactories.push(managerToolboxFactory);
}
// ... resolveToolSet call adds services to context:
services: isManager ? { commissionSession: deps.commissionSessionRef!.current!, gitOps: git } : undefined,
```

**`daemon/services/meeting-session.ts`** (~line 499-517): Same pattern.

### Step 6: Update tests

**`tests/daemon/toolbox-resolver.test.ts`**: Update fixtures that call `createManagerToolboxFactory({...})` to use `managerToolboxFactory` and pass `services` on the context object.

## Files to modify

| File | Change |
|------|--------|
| `daemon/lib/toolbox-utils.ts` | Add `GuildHallToolServices` interface |
| `daemon/services/toolbox-types.ts` | Add `services?` field to `GuildHallToolboxDeps` |
| `daemon/services/toolbox-resolver.ts` | Thread `services` through context to deps |
| `daemon/services/manager-toolbox.ts` | Replace closure factory with plain `ToolboxFactory` const, remove `ManagerServices` |
| `daemon/services/commission-session.ts` | Pass services via context, use `managerToolboxFactory` |
| `daemon/services/meeting-session.ts` | Same |
| `tests/daemon/toolbox-resolver.test.ts` | Update test fixtures |

## Verification

1. `bun run typecheck` passes
2. `bun test` passes (all 1529 tests)
3. `bun run lint` passes
