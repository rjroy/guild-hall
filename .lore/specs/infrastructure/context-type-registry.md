---
title: Context Type Registry
date: 2026-03-19
status: implemented
tags: [refactor, toolbox-resolver, worker-activation, extensibility, registry]
modules: [toolbox-resolver, toolbox-types, worker-activation, base-toolbox, sdk-runner]
related:
  - .lore/issues/context-type-registry-refactor.md
  - .lore/specs/infrastructure/event-router.md
  - .lore/specs/infrastructure/daemon-application-boundary.md
req-prefix: CXTR
---

# Spec: Context Type Registry

## Overview

Context types (`meeting`, `commission`, `briefing`) define what kind of session a worker is activated into. Each context type can contribute a toolbox (meeting gets meeting tools, commission gets commission tools) and a system prompt section (commission injects task and protocol).

These are currently hardcoded in five places across the daemon:

1. **`contextType` union** in `daemon/services/toolbox-types.ts:20` (the `GuildHallToolboxDeps` interface)
2. **`SYSTEM_TOOLBOX_REGISTRY`** in `daemon/services/toolbox-resolver.ts:26-31` (maps context type names to toolbox factories)
3. **`ToolboxResolverContext.contextType`** in `daemon/services/toolbox-resolver.ts:39` (duplicated union)
4. **`SessionPrepSpec.contextType`** and **`SessionPrepDeps` inline type** in `daemon/lib/agent-sdk/sdk-runner.ts:92,113` (more duplicated unions)
5. **`buildSystemPrompt`** in `packages/shared/worker-activation.ts:32-83` (hardcoded if-chains for `meetingContext`, `commissionContext`)

Additional downstream uses: `base-toolbox.ts` repeats the union in two places: the `BaseToolboxDeps` interface (line 32) and the `makeRecordDecisionHandler` parameter (line 327). Both need the same `string` change.

Adding a fifth context type means editing all five files with no shared contract between them. The `briefing` type is already inconsistent: it appears in the union and `SessionPrepSpec` but has no entry in `SYSTEM_TOOLBOX_REGISTRY` (no toolbox) and no section builder in `worker-activation.ts` (no system prompt contribution). This works only because the resolver silently skips missing registry entries and the briefing generator builds its own prompt externally.

This spec extracts a registry where each context type declares its capabilities. New types register once; the resolver and type system consume the registry. The system prompt section builders in `worker-activation.ts` (location 5 above) are intentionally left unchanged: they are three clear branches tightly coupled to `ActivationContext` fields, and extracting them would add indirection without improving type safety (see REQ-CXTR-11).

## Entry Points

- Issue: `.lore/issues/context-type-registry-refactor.md`
- Growth Surface brainstorm Proposal 3 (`.lore/brainstorm/growth-surface-2026-03-17.md`): user endorsed this refactor as "closer to my original intent."
- The event router spec (`.lore/specs/infrastructure/event-router.md`) established the DI factory pattern for daemon services. This spec follows the same pattern: factory function, injected dependencies, config-driven behavior.

## Requirements

### Registry Definition

- REQ-CXTR-1: A `ContextTypeRegistration` interface is defined in `daemon/services/toolbox-types.ts` with these fields:

  ```typescript
  interface ContextTypeRegistration {
    /** Unique name used in contextType fields. */
    name: string;
    /** Optional toolbox factory. When present, the resolver auto-adds this toolbox for sessions of this context type. When absent (e.g. briefing), no context toolbox is added. */
    toolboxFactory?: ToolboxFactory;
    /** Maps this context type to a state subdirectory for decision logs. Required. */
    stateSubdir: string;
  }
  ```

- REQ-CXTR-2: A `ContextTypeRegistry` type is defined as `Map<string, ContextTypeRegistration>`. It is a `Map`, not a plain object, to make the contract explicit (`.has()`, `.get()`, `.keys()`). The registry is passed by reference, not imported as a module-level constant.

### Registry Population

- REQ-CXTR-3: A factory function `createContextTypeRegistry()` is defined in a new file `daemon/services/context-type-registry.ts`. It creates and returns a `ContextTypeRegistry` populated with the three built-in context types:

  | Name | Toolbox Factory | State Subdir |
  |------|----------------|--------------|
  | `meeting` | `meetingToolboxFactory` | `meetings` |
  | `commission` | `commissionToolboxFactory` | `commissions` |
  | `briefing` | (none) | `briefings` |

  The factory imports the two toolbox factories directly. This is the only file that imports all context-type toolbox factories.

- REQ-CXTR-4: The factory function takes no parameters. It returns a fresh registry instance each time (no shared mutable state). This follows the same pattern as `createEventRouter` in the event router spec: pure factory, no global singletons.

### Toolbox Resolver Changes

- REQ-CXTR-5: The `SYSTEM_TOOLBOX_REGISTRY` constant in `toolbox-resolver.ts` is split into two concerns:
  - **Context type entries** (`meeting`, `commission`) move to the `ContextTypeRegistry` (REQ-CXTR-3).
  - **System toolbox entries** (`manager`) remain in the resolver as a separate `SYSTEM_TOOLBOX_REGISTRY` containing only non-context-type system toolboxes. Workers reference these via `systemToolboxes` in their metadata.

  The resolver's step 2 ("Context toolbox") changes from looking up `SYSTEM_TOOLBOX_REGISTRY[context.contextType]` to looking up `contextTypeRegistry.get(context.contextType)?.toolboxFactory`.

- REQ-CXTR-6: The `ToolboxResolverContext` interface accepts `contextType: string` instead of the hardcoded union. The registry validates that the context type is known at resolution time. If `contextTypeRegistry.has(context.contextType)` is false, `resolveToolSet` throws with a message listing valid context types.

- REQ-CXTR-7: The `resolveToolSet` function receives the `ContextTypeRegistry` as a parameter. This follows the DI pattern: the caller (production wiring in `createProductionApp`) passes the registry; tests can pass a minimal registry. The function signature becomes:

  ```typescript
  async function resolveToolSet(
    worker: WorkerMetadata,
    packages: DiscoveredPackage[],
    context: ToolboxResolverContext,
    contextTypeRegistry: ContextTypeRegistry,
  ): Promise<ResolvedToolSet>
  ```

### Type Changes

- REQ-CXTR-8: The `contextType` fields change from the hardcoded union to `string` in all internal-facing interfaces: `GuildHallToolboxDeps` (`toolbox-types.ts:20`), `ToolboxResolverContext` (`toolbox-resolver.ts:39`), `BaseToolboxDeps` (`base-toolbox.ts:32`), and `makeRecordDecisionHandler` (`base-toolbox.ts:327`). Type safety shifts from compile-time union to runtime registry validation (REQ-CXTR-6).

- REQ-CXTR-9: A `ContextTypeName` type alias is exported from `context-type-registry.ts`:

  ```typescript
  type ContextTypeName = "meeting" | "commission" | "briefing";
  ```

  Caller-facing interfaces use `ContextTypeName` for autocompletion: `SessionPrepSpec.contextType` and the `SessionPrepDeps.resolveToolSet` inline context type in `sdk-runner.ts`. Internal interfaces (`GuildHallToolboxDeps`, `ToolboxResolverContext`, `BaseToolboxDeps`) use `string` because the registry validates at runtime.

  This split is deliberate. Orchestrators that construct a `SessionPrepSpec` get compile-time narrowing to the known types. The resolver and toolbox layer accept any string and validate against the registry, so adding a new context type doesn't require updating internal type signatures.

### ActivationContext Changes

- REQ-CXTR-10: The `ActivationContext` interface (`lib/types.ts:258-290`) remains unchanged. The context-specific fields (`meetingContext`, `commissionContext`, `managerContext`) stay where they are. These are populated by orchestrators before activation; they are not part of the registry's responsibility.

  Rationale: Moving context-specific fields into the registry would require the registry to know about the shape of each orchestrator's data, which inverts the dependency direction. Orchestrators own their data; the registry owns the mapping from context type name to toolbox factory.

### System Prompt Section Builders

- REQ-CXTR-11: System prompt section building remains in `packages/shared/worker-activation.ts`. The `buildSystemPrompt` function continues to check `context.meetingContext` and `context.commissionContext` directly. These are not moved into the registry.

  Rationale: The system prompt sections are tightly coupled to the `ActivationContext` fields that orchestrators populate. The activation module already handles the assembly order (soul, identity, posture, memory, context sections). Extracting section builders into the registry would require passing the full `ActivationContext` through a generic callback, gaining no type safety and losing readability. The current if-chain is three branches and reads clearly.

  The `briefing` context type has no section builder and no `ActivationContext` field because briefing sessions build their prompt externally in `briefing-generator.ts`. This is correct behavior, not a gap. The registry formalizes it: `briefing` registers with no `toolboxFactory` and no prompt section, and both the resolver and activation handle that gracefully.

### Base Toolbox State Directory

- REQ-CXTR-12: The `makeRecordDecisionHandler` function in `base-toolbox.ts:324-329` currently maps `contextType` to a state subdirectory via an inline conditional chain. This changes to look up `stateSubdir` from the registry. The base toolbox factory receives the registry (or the resolved `stateSubdir` string) through `GuildHallToolboxDeps`.

  The simplest approach: add `stateSubdir: string` to `GuildHallToolboxDeps`. The caller (`resolveToolSet`) resolves it from the registry when building `deps` and passes it through. The base toolbox consumes the string without knowing about the registry.

### Production Wiring

- REQ-CXTR-13: `createProductionApp()` in `daemon/app.ts` creates the registry via `createContextTypeRegistry()` and passes it to `resolveToolSet` (through the session prep pipeline). This follows the wiring pattern used by the event router: factory at startup, injected into consumers.

- REQ-CXTR-14: The registry is a field on `SessionPrepDeps`:

  ```typescript
  interface SessionPrepDeps {
    contextTypeRegistry: ContextTypeRegistry;
    resolveToolSet: (...) => Promise<ResolvedToolSet>;
    // ... other existing fields unchanged
  }
  ```

  `prepareSdkSession` reads `deps.contextTypeRegistry` and passes it to `resolveToolSet`. The `SessionPrepDeps.resolveToolSet` inline context type continues to carry existing optional fields (`getCachedBriefing`) unchanged. These fields are pass-through context, not part of the registry refactor.

## Explicit Non-Goals

- **Redesigning toolboxes.** Toolbox factories, the `ToolboxFactory` interface, and the base/system/domain toolbox layering are unchanged.
- **Redesigning worker activation.** The `ActivationContext` interface and `buildSystemPrompt` assembly order are unchanged.
- **Redesigning the event system.** The event router is independent infrastructure. No changes to EventBus or event types.
- **Package-based context types.** New context types register by adding a call in `createContextTypeRegistry()`. Package-discovered context types (registering via worker packages) are a future extension, not part of this spec.
- **Moving system prompt section builders into the registry.** See REQ-CXTR-11 rationale.
- **Removing ActivationContext optional fields.** The `meetingContext`, `commissionContext`, and `managerContext` fields stay in `ActivationContext`. They are populated by orchestrators and consumed by activation. The registry does not touch them.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Package-discovered context types | A worker package needs to define a new activity type without daemon code changes | Extend `createContextTypeRegistry` to accept registrations from discovered packages |
| Section builder registry | The if-chain in `buildSystemPrompt` grows beyond 5-6 branches and becomes unwieldy | Add optional `buildPromptSection` callback to `ContextTypeRegistration` |
| Context-specific ActivationContext fields | Adding a new context type requires a new optional field on `ActivationContext` every time | Generalize to a `contextData: Record<string, unknown>` field |

## Success Criteria

- [ ] `ContextTypeRegistration` interface and `ContextTypeRegistry` type are defined in `daemon/services/toolbox-types.ts`
- [ ] `createContextTypeRegistry()` factory in `daemon/services/context-type-registry.ts` returns a registry with all three built-in types
- [ ] `SYSTEM_TOOLBOX_REGISTRY` in `toolbox-resolver.ts` contains only non-context-type system toolboxes (e.g. `manager`)
- [ ] `resolveToolSet` receives and uses the registry for context toolbox lookup (step 2) and context type validation
- [ ] `contextType` fields across `toolbox-types.ts`, `toolbox-resolver.ts`, `sdk-runner.ts`, and `base-toolbox.ts` use `string` instead of the hardcoded union
- [ ] `makeRecordDecisionHandler` resolves state subdirectory from `stateSubdir` on deps, not an inline conditional chain
- [ ] `createProductionApp` creates the registry and passes it through the session prep pipeline
- [ ] The `briefing` context type registers with no toolbox factory, which the resolver handles by skipping step 2 (existing behavior, now explicit)
- [ ] All existing tests pass with no behavioral regressions (test call sites may need the new registry parameter, but no test assertions change)
- [ ] New tests verify: registry creation, unknown context type rejection, briefing's no-toolbox behavior

## AI Validation

**Defaults:**
- Read the full spec before starting implementation.
- Verify every requirement has at least one test.
- Run `bun test` and confirm all tests pass before declaring work complete.

**Structural checks:**
- Confirm `ContextTypeRegistration` and `ContextTypeRegistry` are defined in `daemon/services/toolbox-types.ts`.
- Confirm `createContextTypeRegistry()` is defined in `daemon/services/context-type-registry.ts` and imports toolbox factories from their source modules.
- Confirm `SYSTEM_TOOLBOX_REGISTRY` in `toolbox-resolver.ts` no longer contains `meeting` or `commission` entries.
- Confirm `resolveToolSet` signature includes `contextTypeRegistry` parameter.
- Confirm `createProductionApp` in `daemon/app.ts` calls `createContextTypeRegistry()` and threads it to session prep.
- Confirm no file outside `daemon/services/context-type-registry.ts` imports both context toolbox factories (`meetingToolboxFactory`, `commissionToolboxFactory`).

**Behavioral checks:**
- Test that `resolveToolSet` with `contextType: "meeting"` adds the meeting toolbox server.
- Test that `resolveToolSet` with `contextType: "briefing"` adds no context toolbox (only base).
- Test that `resolveToolSet` with `contextType: "unknown"` throws with a message listing valid types.
- Test that `makeRecordDecisionHandler` with `stateSubdir: "commissions"` writes to the correct path.
- Test that `createContextTypeRegistry()` returns entries for all three built-in types.
