---
title: "Plan: Context Type Registry"
date: 2026-03-20
status: draft
tags: [refactor, toolbox-resolver, registry, extensibility, daemon-service]
modules: [toolbox-resolver, toolbox-types, context-type-registry, base-toolbox, sdk-runner, daemon/app]
related:
  - .lore/specs/infrastructure/context-type-registry.md
  - .lore/issues/context-type-registry-refactor.md
  - .lore/plans/infrastructure/event-router.md
---

# Plan: Context Type Registry

## Goal

Extract the hardcoded context type mapping from five locations into a single registry. New context types register once; the resolver, base toolbox, and type system consume the registry. This eliminates a class of drift bugs where adding a context type requires edits across five files with no shared contract.

This plan implements the full spec at `.lore/specs/infrastructure/context-type-registry.md` (REQ-CXTR-1 through REQ-CXTR-14).

## Codebase Context

**Toolbox types** (`daemon/services/toolbox-types.ts`): Defines `GuildHallToolboxDeps` with `contextType: "meeting" | "commission" | "mail" | "briefing"` at line 20, `ToolboxFactory`, and `ToolboxOutput`. This is where the new `ContextTypeRegistration` interface and `ContextTypeRegistry` type will live.

**Toolbox resolver** (`daemon/services/toolbox-resolver.ts`): `SYSTEM_TOOLBOX_REGISTRY` (lines 26-31) maps four names to toolbox factories: `meeting`, `commission`, `manager`, `mail`. The `resolveToolSet` function uses it for both context toolbox auto-add (step 2, line 103) and system toolbox lookup (step 3, line 110). After the refactor, context types move to the registry and only `manager` stays in the resolver's own map.

**Base toolbox** (`daemon/services/base-toolbox.ts`): `BaseToolboxDeps` (line 32) repeats the hardcoded union. `makeRecordDecisionHandler` (line 325-330) has an inline conditional chain mapping `contextType` to `stateSubdir`. Both change.

**SDK runner** (`daemon/lib/agent-sdk/sdk-runner.ts`): `SessionPrepSpec.contextType` (line 92) and the inline context type in `SessionPrepDeps.resolveToolSet` (line 113) both carry the hardcoded union. Per the spec, these caller-facing interfaces get `ContextTypeName` (compile-time narrowing), while internal interfaces get `string`.

**Production wiring** (`daemon/app.ts`): `createProductionApp()` constructs `prepDeps` (line 329) wrapping `resolveToolSet`. The registry needs to be created here and threaded through `prepDeps` to the resolver.

**Existing tests** (`tests/daemon/toolbox-resolver.test.ts`): Tests `resolveToolSet` with `contextType: "meeting"` throughout. The `testContext()` helper (line 73) constructs a `ToolboxResolverContext`. All call sites need the new `contextTypeRegistry` parameter.

**Additional test files** referencing the resolver or constructing contexts: `tests/daemon/services/sdk-runner.test.ts`, `tests/daemon/services/briefing-generator.test.ts`, `tests/daemon/services/commission/orchestrator.test.ts`, `tests/daemon/services/mail/orchestrator.test.ts`, `tests/daemon/integration-commission.test.ts`, `tests/daemon/memory-access-control.test.ts`, and three package integration tests.

## Implementation Steps

### Phase 1: Registry Definition and Factory

Define the types and build the factory. No behavioral changes, no existing code modified yet.

**REQs:** REQ-CXTR-1, REQ-CXTR-2, REQ-CXTR-3, REQ-CXTR-4, REQ-CXTR-9

**Risk:** None. New file, new types. No existing code touched.

#### Step 1.1: Define `ContextTypeRegistration` and `ContextTypeRegistry` in toolbox-types.ts

Add to `daemon/services/toolbox-types.ts`:

```typescript
export interface ContextTypeRegistration {
  name: string;
  toolboxFactory?: ToolboxFactory;
  stateSubdir: string;
}

export type ContextTypeRegistry = Map<string, ContextTypeRegistration>;
```

These use `ToolboxFactory` already defined in the same file. No new imports needed.

#### Step 1.2: Define `ContextTypeName` and `createContextTypeRegistry` factory

Create `daemon/services/context-type-registry.ts`:

```typescript
import type { ContextTypeRegistry } from "./toolbox-types";
import { meetingToolboxFactory } from "./meeting/toolbox";
import { commissionToolboxFactory } from "./commission/toolbox";
import { mailToolboxFactory } from "./mail/toolbox";

export type ContextTypeName = "meeting" | "commission" | "mail" | "briefing";

export function createContextTypeRegistry(): ContextTypeRegistry {
  const registry: ContextTypeRegistry = new Map();
  registry.set("meeting", {
    name: "meeting",
    toolboxFactory: meetingToolboxFactory,
    stateSubdir: "meetings",
  });
  registry.set("commission", {
    name: "commission",
    toolboxFactory: commissionToolboxFactory,
    stateSubdir: "commissions",
  });
  registry.set("mail", {
    name: "mail",
    toolboxFactory: mailToolboxFactory,
    stateSubdir: "commissions",
  });
  registry.set("briefing", {
    name: "briefing",
    stateSubdir: "briefings",
  });
  return registry;
}
```

This is the single file that imports all three context toolbox factories. The factory takes no parameters and returns a fresh instance each call.

#### Step 1.3: Tests for registry factory

Create `tests/daemon/services/context-type-registry.test.ts`:

1. `createContextTypeRegistry()` returns a Map with 4 entries.
2. `meeting` entry has `toolboxFactory` defined and `stateSubdir: "meetings"`.
3. `commission` entry has `toolboxFactory` defined and `stateSubdir: "commissions"`.
4. `mail` entry has `toolboxFactory` defined and `stateSubdir: "commissions"` (shared with commission).
5. `briefing` entry has no `toolboxFactory` and `stateSubdir: "briefings"`.
6. Each call returns a fresh instance (not the same reference).

Run `bun test tests/daemon/services/context-type-registry.test.ts`.

### Phase 2: Widen Internal Type Signatures

Change internal interfaces from the hardcoded union to `string`. No behavioral changes. The resolver still uses its own registry constant, unchanged. This phase is purely type-level.

**REQs:** REQ-CXTR-8, REQ-CXTR-9

**Risk:** Low. Type-only changes. The compiler catches mismatches.

#### Step 2.1: Widen `GuildHallToolboxDeps.contextType` to `string`

In `daemon/services/toolbox-types.ts` line 20, change:
```typescript
contextType: "meeting" | "commission" | "mail" | "briefing";
```
to:
```typescript
contextType: string;
```

#### Step 2.2: Widen `ToolboxResolverContext.contextType` to `string`

In `daemon/services/toolbox-resolver.ts` line 39, change the union to `string`.

#### Step 2.3: Widen `BaseToolboxDeps.contextType` to `string`

In `daemon/services/base-toolbox.ts` line 32, change the union to `string`.

#### Step 2.4: Widen `makeRecordDecisionHandler` parameter to `string`

In `daemon/services/base-toolbox.ts` line 328, change the `contextType` parameter type from the union to `string`.

#### Step 2.5: Update caller-facing interfaces to use `ContextTypeName`

In `daemon/lib/agent-sdk/sdk-runner.ts`:
- Import `ContextTypeName` from `@/daemon/services/context-type-registry`.
- `SessionPrepSpec.contextType` (line 92): change from hardcoded union to `ContextTypeName`.
- `SessionPrepDeps.resolveToolSet` inline context type (line 113): change to `contextType: string`. This is the internal-facing side that the resolver consumes, so it uses `string` per REQ-CXTR-9.

#### Step 2.6: Verify

```bash
bun run typecheck
bun run lint
bun test
```

No test behavior changes. All existing tests pass because `"meeting"`, `"commission"`, etc. are valid `string` values.

### Phase 3: Refactor Resolver to Use Registry

The behavioral change. The resolver receives the registry, uses it for context toolbox lookup and validation, and its `SYSTEM_TOOLBOX_REGISTRY` shrinks to `manager` only.

**REQs:** REQ-CXTR-5, REQ-CXTR-6, REQ-CXTR-7, REQ-CXTR-12

**Risk:** Medium. Signature change on `resolveToolSet` touches all callers. The `stateSubdir` threading changes how `makeRecordDecisionHandler` resolves its directory. Existing tests catch behavioral drift.

#### Step 3.1: Add `stateSubdir` to `GuildHallToolboxDeps`

In `daemon/services/toolbox-types.ts`, add to `GuildHallToolboxDeps`:

```typescript
stateSubdir?: string;
```

Optional so existing test code that constructs `GuildHallToolboxDeps` directly doesn't break until updated.

#### Step 3.2: Refactor `resolveToolSet` signature and body

In `daemon/services/toolbox-resolver.ts`:

1. Add `contextTypeRegistry` parameter to `resolveToolSet`:

```typescript
export async function resolveToolSet(
  worker: WorkerMetadata,
  packages: DiscoveredPackage[],
  context: ToolboxResolverContext,
  contextTypeRegistry: ContextTypeRegistry,
): Promise<ResolvedToolSet>
```

2. Add runtime validation at the top of the function:

```typescript
if (!contextTypeRegistry.has(context.contextType)) {
  const valid = [...contextTypeRegistry.keys()].join(", ");
  throw new Error(
    `Unknown context type "${context.contextType}". Valid types: ${valid}`,
  );
}
```

3. Replace step 2 (context toolbox lookup):

```typescript
// 2. Context toolbox (auto-added from registry based on contextType)
const registration = contextTypeRegistry.get(context.contextType);
if (registration?.toolboxFactory) {
  mcpServers.push(registration.toolboxFactory(deps).server);
}
```

4. Shrink `SYSTEM_TOOLBOX_REGISTRY` to contain only `manager`:

```typescript
const SYSTEM_TOOLBOX_REGISTRY: Record<string, ToolboxFactory> = {
  manager: managerToolboxFactory,
};
```

5. Remove the imports of `meetingToolboxFactory`, `commissionToolboxFactory`, and `mailToolboxFactory` from this file. Only `managerToolboxFactory` remains.

6. Resolve `stateSubdir` from the registry and pass it through `deps`:

```typescript
const stateSubdir = contextTypeRegistry.get(context.contextType)?.stateSubdir ?? "commissions";

const deps: GuildHallToolboxDeps = {
  // ... existing fields ...
  stateSubdir,
};
```

#### Step 3.3: Update `makeRecordDecisionHandler` to use `stateSubdir` from deps

In `daemon/services/base-toolbox.ts`:

1. Add `stateSubdir?: string` to `BaseToolboxDeps` (line 30 area).

2. Change `makeRecordDecisionHandler` to accept and use a `stateSubdir` parameter instead of the inline conditional:

```typescript
export function makeRecordDecisionHandler(
  guildHallHome: string,
  contextId: string,
  stateSubdir: string,
) {
```

3. Remove the inline conditional chain (the `contextType === "meeting" ? "meetings" : ...` expression at line 330).

4. Update `createBaseToolbox` to pass `deps.stateSubdir` (falling back to `"commissions"` if undefined):

```typescript
const recordDecision = makeRecordDecisionHandler(
  deps.guildHallHome,
  deps.contextId,
  deps.stateSubdir ?? "commissions",
);
```

#### Step 3.4: Update `SessionPrepDeps` and production wiring

In `daemon/lib/agent-sdk/sdk-runner.ts`:

1. Import `ContextTypeRegistry` from `@/daemon/services/toolbox-types`.
2. Add `contextTypeRegistry: ContextTypeRegistry` to `SessionPrepDeps`.
3. In `prepareSdkSession`, pass `deps.contextTypeRegistry` to `deps.resolveToolSet` as the fourth argument.

In `daemon/app.ts`:

1. Import `createContextTypeRegistry` from `@/daemon/services/context-type-registry`.
2. In `createProductionApp()`, before constructing `prepDeps`, create the registry:

```typescript
const { createContextTypeRegistry } = await import(
  "@/daemon/services/context-type-registry"
);
const contextTypeRegistry = createContextTypeRegistry();
```

3. Add `contextTypeRegistry` to `prepDeps`:

```typescript
const prepDeps: SessionPrepDeps = {
  contextTypeRegistry,
  resolveToolSet: (worker, packages, context) =>
    resolveToolSet(worker, packages, {
      ...context,
      getCachedBriefing: briefingGeneratorRef.current
        ? (pn) => briefingGeneratorRef.current!.getCachedBriefing(pn)
        : undefined,
    }, contextTypeRegistry),
  // ... rest unchanged
};
```

Note: `resolveToolSet` now takes 4 args. The `prepDeps.resolveToolSet` wrapper passes the registry through.

#### Step 3.5: Update all test call sites

Every test that calls `resolveToolSet` directly or constructs `SessionPrepDeps` needs the registry. The approach: create a `createContextTypeRegistry()` call in each test file's setup, or use a minimal test registry for focused tests.

**Files to update** (each needs the fourth `contextTypeRegistry` parameter or updated `prepDeps`):

| File | Change |
|------|--------|
| `tests/daemon/toolbox-resolver.test.ts` | Add `createContextTypeRegistry()` to `testContext()` setup; pass as 4th arg to `resolveToolSet` |
| `tests/daemon/services/sdk-runner.test.ts` | Add `contextTypeRegistry` to mock `SessionPrepDeps` |
| `tests/daemon/services/briefing-generator.test.ts` | Add `contextTypeRegistry` to mock `SessionPrepDeps` |
| `tests/daemon/services/commission/orchestrator.test.ts` | Add `contextTypeRegistry` to `prepDeps` mock |
| `tests/daemon/services/mail/orchestrator.test.ts` | Add `contextTypeRegistry` to `prepDeps` mock |
| `tests/daemon/integration-commission.test.ts` | Add `contextTypeRegistry` to `prepDeps` |
| `tests/daemon/memory-access-control.test.ts` | Update if it constructs `BaseToolboxDeps` directly |
| `tests/packages/guild-hall-email/integration.test.ts` | Add `contextTypeRegistry` to `prepDeps` |
| `tests/packages/guild-hall-illuminator/integration.test.ts` | Add `contextTypeRegistry` to `prepDeps` |
| `tests/packages/guild-hall-steward/integration.test.ts` | Add `contextTypeRegistry` to `prepDeps` |

For the resolver test specifically, also add new test cases:

1. `resolveToolSet` with `contextType: "meeting"` adds meeting toolbox (existing, now using registry).
2. `resolveToolSet` with `contextType: "briefing"` adds no context toolbox (only base + built-in).
3. `resolveToolSet` with `contextType: "unknown"` throws with a message listing valid types.
4. `makeRecordDecisionHandler` with `stateSubdir: "commissions"` writes to the correct path.
5. `makeRecordDecisionHandler` with `stateSubdir: "meetings"` writes to the meetings path.

#### Step 3.6: Verify

```bash
bun run typecheck
bun run lint
bun test
```

All existing tests pass. New tests pass. No behavioral regression: the registry produces the same toolbox factories that were previously hardcoded.

### Phase 4: Validation

#### Step 4.1: Full test suite

Run `bun test` and confirm all tests pass.

#### Step 4.2: Thorne review

Launch a fresh-context review agent (Thorne). The agent reads the spec at `.lore/specs/infrastructure/context-type-registry.md` and all modified files, then verifies:

- Every REQ-CXTR has at least one test covering it.
- `ContextTypeRegistration` and `ContextTypeRegistry` are in `daemon/services/toolbox-types.ts`.
- `createContextTypeRegistry()` is in `daemon/services/context-type-registry.ts` and imports toolbox factories from their source modules.
- `SYSTEM_TOOLBOX_REGISTRY` in `toolbox-resolver.ts` contains only `manager`.
- `resolveToolSet` signature includes `contextTypeRegistry` parameter.
- `createProductionApp` in `daemon/app.ts` calls `createContextTypeRegistry()` and threads it to session prep.
- No file outside `daemon/services/context-type-registry.ts` imports all three context toolbox factories.
- `makeRecordDecisionHandler` uses `stateSubdir` string, not a conditional chain.
- `contextType` fields in internal interfaces use `string`; caller-facing interfaces use `ContextTypeName`.
- `briefing` context type registers with no `toolboxFactory` and the resolver handles it by skipping step 2.
- REQ-CXTR-10 (ActivationContext unchanged) and REQ-CXTR-11 (system prompt builders unchanged) are confirmed by absence of changes to `lib/types.ts:258-290` and `packages/shared/worker-activation.ts`.

## Files Modified (Summary)

| File | Phase | Change |
|------|-------|--------|
| `daemon/services/toolbox-types.ts` | 1, 2, 3 | Add `ContextTypeRegistration`, `ContextTypeRegistry` (P1); widen `GuildHallToolboxDeps.contextType` to `string` (P2); add `stateSubdir` field (P3) |
| `daemon/services/context-type-registry.ts` | 1 | **New.** `ContextTypeName`, `createContextTypeRegistry()` |
| `daemon/services/toolbox-resolver.ts` | 2, 3 | Widen `ToolboxResolverContext.contextType` (P2); add registry param, shrink `SYSTEM_TOOLBOX_REGISTRY`, remove 3 toolbox imports (P3) |
| `daemon/services/base-toolbox.ts` | 2, 3 | Widen `BaseToolboxDeps.contextType` (P2); add `stateSubdir` to deps, refactor `makeRecordDecisionHandler` (P3) |
| `daemon/lib/agent-sdk/sdk-runner.ts` | 2, 3 | Use `ContextTypeName` on `SessionPrepSpec`, widen inline context type to `string` (P2); add `contextTypeRegistry` to `SessionPrepDeps`, thread to resolver (P3) |
| `daemon/app.ts` | 3 | Create registry, pass through `prepDeps` |
| `tests/daemon/services/context-type-registry.test.ts` | 1 | **New.** Registry factory tests |
| `tests/daemon/toolbox-resolver.test.ts` | 3 | Pass registry to `resolveToolSet`, add unknown-type and briefing tests |
| 8 additional test files | 3 | Add `contextTypeRegistry` to mock `prepDeps` or resolver calls |

## What Stays

- `ActivationContext` in `lib/types.ts` (REQ-CXTR-10). No fields added, removed, or renamed.
- `buildSystemPrompt` in `packages/shared/worker-activation.ts` (REQ-CXTR-11). The if-chain stays.
- `ToolboxFactory` interface. Unchanged.
- Base/system/domain toolbox layering in the resolver. Steps 1, 3, 4, 5 are untouched except for the system registry shrinking to `manager` only.
- The `manager` system toolbox. It is not a context type. It remains in the resolver's `SYSTEM_TOOLBOX_REGISTRY`.

## REQ Coverage Matrix

| REQ | Description | Step |
|-----|-------------|------|
| REQ-CXTR-1 | `ContextTypeRegistration` interface in `toolbox-types.ts` | 1.1 |
| REQ-CXTR-2 | `ContextTypeRegistry` as `Map<string, ContextTypeRegistration>` | 1.1 |
| REQ-CXTR-3 | `createContextTypeRegistry()` factory with 4 built-in types | 1.2, 1.3 |
| REQ-CXTR-4 | Factory takes no params, returns fresh instance | 1.2, 1.3 |
| REQ-CXTR-5 | `SYSTEM_TOOLBOX_REGISTRY` split: context types to registry, manager stays | 3.2 |
| REQ-CXTR-6 | Runtime validation of unknown context types | 3.2, 3.5 |
| REQ-CXTR-7 | `resolveToolSet` receives registry as parameter (DI) | 3.2, 3.4 |
| REQ-CXTR-8 | Internal `contextType` fields widened to `string` | 2.1, 2.2, 2.3, 2.4 |
| REQ-CXTR-9 | `ContextTypeName` alias; caller-facing uses it, internal uses `string` | 1.2, 2.5 |
| REQ-CXTR-10 | `ActivationContext` unchanged | (confirmed by absence of changes) |
| REQ-CXTR-11 | System prompt section builders unchanged | (confirmed by absence of changes) |
| REQ-CXTR-12 | `stateSubdir` resolved from registry, not inline conditional | 3.1, 3.3 |
| REQ-CXTR-13 | `createProductionApp` creates and threads registry | 3.4 |
| REQ-CXTR-14 | Registry is a field on `SessionPrepDeps` | 3.4 |

## Delegation Guide

### Phase Assignments

| Phase | Worker | Rationale |
|-------|--------|-----------|
| Phase 1: Registry Definition | Dalton (developer) | New file, new types, straightforward factory + tests |
| Phase 2: Type Widening | Same agent as Phase 1 | Type-only changes across 4 files, no behavioral change. Doing it in the same session avoids context rebuild |
| Phase 3: Resolver Refactor | Same agent as Phase 1-2 | The bulk of the work. Changing the resolver signature and updating all test call sites is mechanical but requires understanding of how `resolveToolSet` is wired. Keeping the same agent avoids re-reading 10+ files |
| Phase 4: Validation | Thorne (reviewer), fresh context | Spec compliance review. Fresh context catches what the implementer normalized |

### Single-Agent Recommendation for Phases 1-3

All three phases should be handled by a single agent in one commission. The total scope is moderate (1 new file, ~6 modified production files, ~10 test file updates), and the changes are tightly coupled. Phase 2's type widening prepares Phase 3's signature changes. Splitting them across agents would duplicate file reads and risk inconsistency.

The agent should commit after each phase and run the full test suite before proceeding.

### Review Checkpoints

| After | Reviewer | Focus |
|-------|----------|-------|
| Phase 1 | (self-review sufficient) | Factory tests pass, types compile |
| Phase 2 | (self-review sufficient) | `bun run typecheck` passes, no test behavior changes |
| Phase 3 | Thorne (fresh context) | Full spec compliance, no files outside `context-type-registry.ts` import all 3 toolbox factories, unknown context type throws, `stateSubdir` flows correctly, `briefing` has no toolbox |

Phase 4 is the review checkpoint. One review commission after Phases 1-3 complete, not per-phase.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Test call site missed (resolver takes 4 args, test passes 3) | Medium | Build break (caught by typecheck) | Grep for `resolveToolSet(` across all test files |
| `stateSubdir` not threaded correctly to `makeRecordDecisionHandler` | Low | Decision logs written to wrong directory (caught by existing tests if any exercise decision recording) | Dedicated test case in Step 3.5 |
| `prepDeps` wrapper in `daemon/app.ts` doesn't pass registry | Low | Runtime error on first session (caught by integration tests) | Integration tests exercise the full prep pipeline |
| Circular import between `context-type-registry.ts` and `toolbox-types.ts` | None | N/A | Registry imports types from toolbox-types; toolbox-types doesn't import from registry |
| Tests that construct `BaseToolboxDeps` directly don't provide `stateSubdir` | Low | Type error (caught by typecheck) | Field is optional with fallback in `createBaseToolbox` |

## Open Questions

None. The spec resolved all design questions. This plan follows those decisions.
