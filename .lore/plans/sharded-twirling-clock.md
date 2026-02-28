---
title: System Toolbox Registry
status: draft
date: 2026-02-28
---

# System Toolbox Registry

## Context

The toolbox resolver currently loads system toolboxes (meeting, commission, manager) via `contextFactories`, pre-bound factory arrays built by session files and passed through. This is different from how domain toolboxes are loaded (by name from packages). The session files import factory functions, conditionally assemble arrays, and pass them down. The resolver doesn't know what it's loading or why.

This refactoring replaces `contextFactories` with a name-based registry inside the resolver. The resolver becomes the single authority on which system toolboxes exist and how they're loaded. Session files stop importing factory functions and assembling arrays.

## Design

**Registry:** A constant map in `toolbox-resolver.ts` mapping names to factories:
- `"meeting"` -> `meetingToolboxFactory`
- `"commission"` -> `commissionToolboxFactory`
- `"manager"` -> `managerToolboxFactory`

**Context toolbox (meeting/commission):** Auto-added by the resolver based on `contextType`. Workers don't declare these. Every worker in a meeting gets meeting tools; every worker in a commission gets commission tools. This matches current behavior without requiring redundant config.

**System toolboxes (manager, future):** Declared via `systemToolboxes: string[]` on WorkerMetadata. The resolver iterates the list, looks up each name in the registry, validates eligibility, and calls the factory.

**Manager eligibility:** The resolver checks that `context.services` exists before calling the manager factory. If a worker declares `"manager"` but services aren't provided, it throws. Sessions still populate `services` based on `isManager` check (this doesn't change).

## Resolver Flow (after)

1. Base toolbox (always, unchanged)
2. Context toolbox by name from registry (auto, based on `contextType`)
3. System toolboxes from `worker.systemToolboxes` (name lookup in registry)
4. Domain toolboxes from packages (unchanged)
5. Build allowedTools (unchanged)

## Changes

### 1. `lib/types.ts` (line 61-69)

Add optional `systemToolboxes` to WorkerMetadata:

```typescript
export interface WorkerMetadata {
  type: "worker" | ["worker", "toolbox"];
  identity: WorkerIdentity;
  posture: string;
  systemToolboxes?: string[];    // NEW: system toolbox names (e.g. ["manager"])
  domainToolboxes: string[];
  builtInTools: string[];
  checkoutScope: CheckoutScope;
  resourceDefaults?: ResourceDefaults;
}
```

Optional with implicit default of `[]` so existing worker packages and test helpers don't need updating.

### 2. `lib/packages.ts` (line 47-55)

Add `systemToolboxes` to the Zod schema with `.default([])`:

```typescript
export const workerMetadataSchema = z.object({
  type: z.union([z.literal("worker"), workerToolboxTuple]),
  identity: workerIdentitySchema,
  posture: z.string(),
  systemToolboxes: z.array(z.string()).default([]),  // NEW
  domainToolboxes: z.array(z.string()),
  builtInTools: z.array(z.string()),
  checkoutScope: z.union([z.literal("sparse"), z.literal("full")]),
  resourceDefaults: resourceDefaultsSchema.optional(),
});
```

### 3. `daemon/services/toolbox-resolver.ts` (main refactoring target)

**Add imports** for the three system toolbox factories (meeting, commission, manager).

**Add registry constant:**

```typescript
const SYSTEM_TOOLBOX_REGISTRY: Record<string, ToolboxFactory> = {
  meeting: meetingToolboxFactory,
  commission: commissionToolboxFactory,
  manager: managerToolboxFactory,
};
```

**Remove `contextFactories` from ToolboxResolverContext.** The interface becomes:

```typescript
export interface ToolboxResolverContext {
  projectName: string;
  guildHallHome: string;
  contextId: string;
  contextType: "meeting" | "commission";
  workerName: string;
  eventBus: EventBus;
  config: AppConfig;
  services?: GuildHallToolServices;
}
```

**Refactor `resolveToolSet` steps 2-3:**

Replace the `contextFactories` loop with:

```typescript
// 2. Context toolbox (auto-added based on context type)
const contextFactory = SYSTEM_TOOLBOX_REGISTRY[context.contextType];
mcpServers.push(contextFactory(deps).server);

// 3. Worker's system toolboxes (e.g. manager)
for (const name of worker.systemToolboxes ?? []) {
  const factory = SYSTEM_TOOLBOX_REGISTRY[name];
  if (!factory) {
    throw new Error(
      `Worker "${worker.identity.name}" declares system toolbox "${name}" ` +
        `but no such system toolbox exists. ` +
        `Available: ${Object.keys(SYSTEM_TOOLBOX_REGISTRY).join(", ")}`,
    );
  }
  if (name === "manager" && !deps.services) {
    throw new Error(
      `Worker "${worker.identity.name}" declares system toolbox "manager" ` +
        `but required services are not available. ` +
        `Only the Guild Master worker may use the manager toolbox.`,
    );
  }
  mcpServers.push(factory(deps).server);
}
```

Domain toolboxes (step 4) and allowedTools (step 5) unchanged.

### 4. `daemon/services/meeting-session.ts` (lines 26-28, 499-512)

**Remove imports:** `meetingToolboxFactory`, `managerToolboxFactory`, `ToolboxFactory`.

**Simplify the resolveToolSet call** (around line 499):

```typescript
// BEFORE:
const contextFactories: ToolboxFactory[] = [meetingToolboxFactory];
if (isManager && deps.commissionSession && deps.eventBus) {
  contextFactories.push(managerToolboxFactory);
}

const resolvedTools = await resolveToolSet(workerMeta, deps.packages, {
  ...fields,
  contextFactories,
  services: isManager && deps.commissionSession
    ? { commissionSession: deps.commissionSession, gitOps: git }
    : undefined,
});

// AFTER:
const resolvedTools = await resolveToolSet(workerMeta, deps.packages, {
  ...fields,
  services: isManager && deps.commissionSession
    ? { commissionSession: deps.commissionSession, gitOps: git }
    : undefined,
});
```

The `isManager` variable and `services` logic stay. Only `contextFactories` building is removed.

### 5. `daemon/services/commission-session.ts` (lines 57-58, 1065-1081)

Same pattern as meeting-session: remove factory imports, remove contextFactories building, keep services logic.

### 6. `daemon/services/manager-worker.ts` (line 36-51)

Add `systemToolboxes: ["manager"]` to the manager's WorkerMetadata:

```typescript
const metadata: WorkerMetadata = {
  type: "worker",
  identity: { ... },
  posture: MANAGER_POSTURE,
  systemToolboxes: ["manager"],   // NEW
  domainToolboxes: [],
  builtInTools: ["Read", "Glob", "Grep"],
  checkoutScope: "full",
  resourceDefaults: { maxTurns: 200 },
};
```

### 7. `tests/daemon/toolbox-resolver.test.ts`

Tests currently pass `contextFactories` explicitly. After this change, the resolver auto-adds context toolboxes.

Key test updates:
- "base only" test (line 89): Now produces base + meeting (since testContext has `contextType: "meeting"`). Update expected count from 1 to 2.
- "context without contextFactories produces base only" (line 219): Rename, now always produces base + context. Remove this test or update to verify the auto-add behavior.
- Tests passing `contextFactories: [meetingToolboxFactory]` (lines 210, 232, 250, 328, 345, 364, 381, 470): Remove `contextFactories` from context. The meeting toolbox is now auto-added.
- Manager tests (line 318+): Instead of passing `contextFactories: [meetingToolboxFactory, managerToolboxFactory]`, use `makeWorker({ systemToolboxes: ["manager"] })` and provide `services`.
- "non-manager worker with meeting context has no manager tools" (line 376): Worker has no systemToolboxes, so no manager. Still valid, just remove contextFactories.
- Commission context test (line 244): Change `contextType: "commission"`, remove `contextFactories`. Verify commission toolbox auto-added.

New tests to add:
- Unknown system toolbox name throws descriptive error
- Manager system toolbox without services throws eligibility error
- System toolbox + domain toolbox coexist

### 8. `tests/daemon/state-isolation.test.ts` (lines 539, 551)

Remove `contextFactories` from the two `resolveToolSet` calls. The resolver now auto-adds context toolboxes.

### 9. `CLAUDE.md` (line 81)

Update the "Toolbox resolver" paragraph to reflect the new pattern.

## Verification

```bash
bun run typecheck              # No type errors from interface changes
bun run lint                   # No unused imports in session files
bun test tests/daemon/toolbox-resolver.test.ts   # Core resolver tests
bun test tests/daemon/state-isolation.test.ts     # Cross-context isolation
bun test tests/lib/packages.test.ts               # Schema with systemToolboxes
bun test                       # Full suite, no regressions
```
