---
title: "Plan: Worker Sub-Agents"
date: 2026-03-20
status: executed
tags: [workers, sub-agents, activation, agent-sdk]
modules: [daemon/lib/agent-sdk/sdk-runner, lib/types, daemon/services/context-type-registry, packages/shared/worker-activation, lib/packages]
related:
  - .lore/specs/infrastructure/worker-sub-agents.md
  - .lore/brainstorm/worker-sub-agents-and-mail-removal.md
---

# Plan: Worker Sub-Agents

## Goal

Make every discovered worker available as a sub-agent to every other worker. During `prepareSdkSession`, each worker package (excluding the calling worker) is compiled into an `AgentDefinition` and passed via the `agents` field on `SdkQueryOptions`. A worker running a commission or meeting can then invoke any other worker through the SDK's Task tool with that worker's real identity, posture, and memory.

This plan implements the full spec at `.lore/specs/infrastructure/worker-sub-agents.md` (REQ-SUBAG-1 through REQ-SUBAG-31).

## Codebase Context

**WorkerMetadata** (`lib/types.ts:189-204`): Interface for worker package metadata. Has `model?: string` but no `subAgentModel`. The new property goes next to `model`.

**Package validation** (`lib/packages.ts`): Two-layer validation. First, Zod schema (`workerMetadataSchema`, line 70-98) validates structure during discovery. Second, `validatePackageModels()` (line 258-275) validates model names against built-in and local models post-discovery. `subAgentModel` validation follows the same two-layer pattern but rejects local models (REQ-SUBAG-2).

**prepareSdkSession** (`daemon/lib/agent-sdk/sdk-runner.ts:318-500`): Five-step pipeline (find worker, resolve tools, load memories, activate, build options). The new agent map construction inserts between step 4 (activate) and step 5 (build options). The existing `SessionPrepDeps` already has `loadMemories` and `activateWorker`, both reusable for sub-agent preparation.

**activateWorkerWithSharedPattern** (`packages/shared/worker-activation.ts:88-99`): Takes an `ActivationContext`, calls `buildSystemPrompt()`, returns `ActivationResult`. When no `meetingContext` or `commissionContext` is provided, the prompt contains only soul, identity, posture, and memory sections. This is exactly what sub-agents need (REQ-SUBAG-16).

**ContextTypeName** (`daemon/services/context-type-registry.ts:6`): Union type `"meeting" | "commission" | "briefing"`. Needs `"subagent"` added. The registry function at line 8-30 adds entries; `"subagent"` follows the `"briefing"` pattern (no toolbox factory).

**SdkQueryOptions** (`daemon/lib/agent-sdk/sdk-runner.ts:41-82`): Options passed to the SDK. Needs an `agents` field. `runSdkSession` (line 163-207) spreads options into `resolvedOptions`; the `agents` field passes through without transformation.

**Test patterns** (`tests/daemon/services/sdk-runner.test.ts`): Uses `makeSpec()` and `makeDeps()` helpers to construct `SessionPrepSpec` and `SessionPrepDeps` with defaults. Tests assert on `result.result.options` properties. Sub-agent tests follow the same pattern, asserting on the new `agents` field.

## Delegation Guide

**Dalton** implements all phases. Each phase is a separate commission. Dalton reads the plan and spec before starting each phase.

**Thorne** reviews after each phase completes. Review commissions verify:
- REQ coverage (every requirement addressed in the phase has a corresponding test).
- No regression (all existing tests pass).
- Build safety (typecheck and lint clean).

The review after Phase 4 additionally verifies integration across phases: the full pipeline produces agent maps with correct prompts, models, and descriptions.

## Implementation Steps

### Phase 1: Type Foundations

Adds `subAgentModel` to the type system, Zod schema, and package validation. No behavioral changes. All existing tests continue to pass because the property is optional with a safe default.

#### Step 1: Add `subAgentModel` to WorkerMetadata

**Files**: `lib/types.ts`
**Addresses**: REQ-SUBAG-1

Add `subAgentModel?: string` to the `WorkerMetadata` interface, immediately after the `model?: string` line (line 194). The property is optional; omitting it is equivalent to `"inherit"`.

#### Step 2: Add `subAgentModel` to workerMetadataSchema

**Files**: `lib/packages.ts`
**Addresses**: REQ-SUBAG-4

Add `subAgentModel: z.string().min(1).optional()` to `workerMetadataSchema` (around line 75, after the `model` field). This matches the `model` field's pattern: basic string shape validation in Zod, semantic model-name validation in the post-discovery step.

#### Step 3: Extend `validatePackageModels` to validate `subAgentModel`

**Files**: `lib/packages.ts`
**Addresses**: REQ-SUBAG-2, REQ-SUBAG-3, REQ-SUBAG-29

In `validatePackageModels()` (line 258-275), add a second check after the existing `model` check. For `subAgentModel`:

- If absent, pass (defaults to `"inherit"` at runtime).
- If `"inherit"`, pass.
- If in `VALID_MODELS` (`"opus"`, `"sonnet"`, `"haiku"`), pass.
- Otherwise, reject with a warning naming the invalid value and listing valid options (`"inherit"` plus the built-in model names). The package is skipped, same as invalid `model`.

Local model names are explicitly rejected because the SDK's `AgentDefinition.model` field does not support per-sub-agent environment variable injection.

#### Step 4: Add `"subagent"` to ContextTypeName and registry

**Files**: `daemon/services/context-type-registry.ts`
**Addresses**: REQ-SUBAG-13, REQ-SUBAG-14

1. Extend `ContextTypeName` to `"meeting" | "commission" | "briefing" | "subagent"`.
2. Add a registry entry after the `"briefing"` entry:
   ```typescript
   registry.set("subagent", {
     name: "subagent",
     stateSubdir: "subagents",
   });
   ```
   No `toolboxFactory` because sub-agents inherit the parent's tools.

#### Step 5: Tests for Phase 1

**Files**: `tests/lib/packages.test.ts`
**Addresses**: REQ-SUBAG-1, REQ-SUBAG-2, REQ-SUBAG-3, REQ-SUBAG-4, REQ-SUBAG-29

Add test cases to the existing package validation tests:

1. Worker with `subAgentModel: "sonnet"` passes validation.
2. Worker with `subAgentModel: "inherit"` passes validation.
3. Worker with no `subAgentModel` passes validation.
4. Worker with `subAgentModel: "invalid-model"` is rejected, warning names the invalid value.
5. Worker with `subAgentModel: "my-local-model"` (a configured local model) is rejected, because local models are not valid for sub-agents.

Also add a test confirming `"subagent"` is in the context type registry with no toolbox factory and `stateSubdir: "subagents"`.

Run `bun test tests/lib/packages.test.ts` to confirm.

**Review checkpoint**: Thorne reviews Phase 1. Verify type additions are backward-compatible and validation catches the right cases.

---

### Phase 2: Description Generation

A pure function in a new file. No integration with the session pipeline yet. Testable in isolation.

#### Step 6: Create `buildSubAgentDescription`

**Files**: `packages/shared/sub-agent-description.ts` (new)
**Addresses**: REQ-SUBAG-17, REQ-SUBAG-18, REQ-SUBAG-19, REQ-SUBAG-20

Create a pure function:

```typescript
export function buildSubAgentDescription(
  identity: WorkerIdentity,
  posture: string,
): string
```

Implementation:

1. Check a lookup table keyed by `identity.name`. If an entry exists, return:
   ```
   {identity.displayTitle} ({identity.name}). {identity.description}

   {lookup table invocation guidance}
   ```

2. If no table entry, fall back to:
   ```
   {identity.displayTitle} ({identity.name}). {identity.description}

   Invoke this worker when: {identity.description}
   ```

The lookup table includes entries for all current worker packages. Keys are `identity.name` values from `package.json`:

- **Thorne** (Guild Warden): "Invoke this worker when you need a critical review that checks for correctness, security, and adherence to project conventions. This worker reads and evaluates but does not modify code."
- **Octavia** (Guild Chronicler): "Invoke this worker when you need a spec reviewed for clarity, completeness, or consistency with the codebase. Strong on documentation structure and precision."
- **Dalton** (Guild Artificer): "Invoke this worker when you need implementation advice, code architecture review, or help understanding how existing code works."
- **Celeste** (Guild Visionary): "Invoke this worker when you need strategic direction, vision alignment, or creative exploration of possibilities."
- **Edmund** (Guild Steward): "Invoke this worker when you need project maintenance, cleanup, or organizational tasks."
- **Verity** (Guild Pathfinder): "Invoke this worker when you need external research, documentation gathering, or prior art analysis."
- **Sable** (Guild Breaker): "Invoke this worker when you need test strategy advice, test coverage analysis, or help writing tests."
- **Sienna** (Guild Illuminator): "Invoke this worker when you need image generation, visual analysis, or image-related tasks."

Note: `guild-hall-email` and `guild-hall-replicate` are toolbox-only packages (type `"toolbox"`), not workers. They have no `identity` and do not appear in the agent map.

#### Step 7: Tests for `buildSubAgentDescription`

**Files**: `tests/packages/shared/sub-agent-description.test.ts` (new)
**Addresses**: REQ-SUBAG-17, REQ-SUBAG-18, REQ-SUBAG-19, REQ-SUBAG-20

Test cases:

1. Worker with a lookup table entry produces description containing the table's invocation guidance.
2. Worker with no lookup table entry produces description with `identity.description` as invocation guidance (fallback).
3. Description starts with `{displayTitle} ({name})`.
4. Description includes `identity.description`.
5. The function has no side effects (returns a string, no I/O).

Run `bun test tests/packages/shared/sub-agent-description.test.ts` to confirm.

**Review checkpoint**: Thorne reviews Phase 2. Verify the function is pure and the lookup table entries are accurate against the actual worker roster.

---

### Phase 3: SdkQueryOptions Extension and Passthrough

Adds the `agents` field to the options type and wires it through `runSdkSession`. No agent map construction yet, so no behavioral change.

#### Step 8: Add `agents` to SdkQueryOptions

**Files**: `daemon/lib/agent-sdk/sdk-runner.ts`
**Addresses**: REQ-SUBAG-21

Add the `agents` property to `SdkQueryOptions` (after the `env` field, around line 55):

```typescript
agents?: Record<string, {
  description: string;
  tools?: string[];
  prompt: string;
  model?: string;
}>;
```

The type is inline, matching the existing pattern where `SdkQueryOptions` is a Guild Hall type that maps to SDK options without re-exporting SDK types.

#### Step 9: Verify `runSdkSession` passthrough

**Files**: `daemon/lib/agent-sdk/sdk-runner.ts`
**Addresses**: REQ-SUBAG-22

`runSdkSession` already spreads `options` into `resolvedOptions` at line 174:
```typescript
const resolvedOptions = { ...options, includePartialMessages: true };
```

The `agents` field passes through automatically. No code change needed, but add a test to verify.

#### Step 10: Tests for Phase 3

**Files**: `tests/daemon/services/sdk-runner.test.ts`
**Addresses**: REQ-SUBAG-21, REQ-SUBAG-22

Add test cases in the `runSdkSession` describe block:

1. `agents` in options is passed through to the queryFn. Capture the options in a mock queryFn and assert `options.agents` matches the input.

The `agents` field on `SdkQueryOptions` is verified at compile time by TypeScript (the field exists on the type). No runtime test is needed in Phase 3 because `prepareSdkSession` does not populate `agents` until Phase 4. Phase 4 tests cover runtime assertions.

Run `bun test tests/daemon/services/sdk-runner.test.ts` to confirm no regressions.

**Review checkpoint**: Thorne reviews Phase 3. Verify the type addition is correct and passthrough works.

---

### Phase 4: Agent Map Construction

The core integration. Constructs the agent map in `prepareSdkSession` and populates the `agents` field on the returned options.

#### Step 11: Build the agent map in `prepareSdkSession`

**Files**: `daemon/lib/agent-sdk/sdk-runner.ts`
**Addresses**: REQ-SUBAG-5, REQ-SUBAG-6, REQ-SUBAG-7, REQ-SUBAG-8, REQ-SUBAG-9, REQ-SUBAG-10, REQ-SUBAG-11, REQ-SUBAG-12, REQ-SUBAG-15, REQ-SUBAG-16, REQ-SUBAG-25, REQ-SUBAG-26, REQ-SUBAG-27, REQ-SUBAG-28, REQ-SUBAG-30, REQ-SUBAG-31

Insert a new step between step 4 (activate worker, line 388-411) and step 5 (build SDK query options, line 413). The new step:

```typescript
// 4b. Build sub-agent map
log.info(`Building sub-agent map: ${otherWorkerPackages.length} workers available`);
```

**Worker filtering**: Filter `spec.packages` to find all worker packages (packages with `identity` in metadata) except the calling worker (where `metadata.identity.name === spec.workerName`).

**Concurrent memory loading**: For each sub-agent worker, load memories via `deps.loadMemories(workerMeta.identity.name, spec.projectName, { guildHallHome: spec.guildHallHome, memoryLimit: deps.memoryLimit })`. Run all loads concurrently with `Promise.allSettled`.

**Per-worker agent construction**: For each worker with successfully loaded memory:

1. Construct an `ActivationContext`:
   - `identity`: From the sub-agent worker's metadata.
   - `posture`: From the sub-agent worker's metadata.
   - `soul`: From the sub-agent worker's metadata (if present).
   - `injectedMemory`: The loaded memory block.
   - `model`: From the sub-agent worker's `model` property (not `subAgentModel`). This controls model-specific instructions in the system prompt.
   - `resolvedTools`: Empty `ResolvedToolSet` (`{ mcpServers: [], allowedTools: [], builtInTools: [], canUseToolRules: [] }`).
   - `resourceDefaults`: Empty (`{}`).
   - `localModelDefinitions`: From `spec.config.models`.
   - `projectPath`: From `spec.projectPath`.
   - `workingDirectory`: From `spec.workspaceDir`.
   - No `meetingContext`, `commissionContext`, or `managerContext`.

2. Call `deps.activateWorker(workerPkg, activationContext)` to get an `ActivationResult` with a system prompt.

3. Build the description via `buildSubAgentDescription(workerMeta.identity, workerMeta.posture)`.

4. Resolve the model: if `workerMeta.subAgentModel` is `"inherit"` or absent, use `"inherit"`. If it's a built-in name, use it directly.

5. Assemble the `AgentDefinition`:
   ```typescript
   {
     description: description,
     prompt: activationResult.systemPrompt,
     model: resolvedSubAgentModel,
     // tools omitted per REQ-SUBAG-12
   }
   ```

**Error handling** (REQ-SUBAG-8): Wrap each worker's activation in a try/catch. On failure, log at `warn`: `Failed to build sub-agent for worker '{name}': {error}`. Exclude that worker from the map. Continue with others.

**Completion logging** (REQ-SUBAG-30): After the loop, log at `info`: `Sub-agent map built: {count} agents included`.

**Wire into options**: Add the agent map to the options object at step 5 (the options construction block starting at line 479):
```typescript
...(agents && Object.keys(agents).length > 0 ? { agents } : {}),
```

#### Step 12: Tests for agent map construction

**Files**: `tests/daemon/services/sdk-runner.test.ts`
**Addresses**: REQ-SUBAG-5 through REQ-SUBAG-12, REQ-SUBAG-15, REQ-SUBAG-16, REQ-SUBAG-25 through REQ-SUBAG-28, REQ-SUBAG-30, REQ-SUBAG-31

Add a new `describe("sub-agent map construction", ...)` block within the `prepareSdkSession` describe. Create helper fixtures:

- `mockOtherWorkerMeta`: A second worker (e.g., `"other-worker"`) with identity, posture, and no `subAgentModel`.
- `mockOtherWorkerPkg`: Package for the other worker.
- `mockOtherWorkerWithModel`: Same but with `subAgentModel: "sonnet"`.
- `mockOtherWorkerWithSoul`: Same but with `soul: "A thoughtful soul"`.

Test cases:

1. **Calling worker excluded**: `prepareSdkSession` with the calling worker and one other worker produces an `agents` map containing only the other worker. The calling worker is absent.

2. **Agent has prompt with identity and posture**: The agent entry's `prompt` contains the other worker's identity name and posture content. It does NOT contain commission or meeting context strings.

3. **Agent with `subAgentModel: "sonnet"`**: The agent entry has `model: "sonnet"`.

4. **Agent with no `subAgentModel`**: The agent entry has `model: "inherit"`.

5. **Agent has description**: The agent entry's `description` is non-empty and contains the worker's display title.

6. **No tools field on agent**: The agent entry has no `tools` property (REQ-SUBAG-12).

7. **Failing sub-agent excluded**: When `loadMemories` throws for the other worker (use a deps override that throws only for that worker's name), the agent map is empty and the session still succeeds.

8. **Agent with soul content**: The agent's `prompt` contains the soul content.

9. **Agent with memory content**: Override `loadMemories` to return memory for the other worker's name. Verify the agent's `prompt` contains that memory.

10. **Toolbox packages excluded**: A toolbox-only package does not appear in the agents map.

11. **Multiple workers**: Three worker packages (including the caller). The agents map has two entries (the other two).

12. **All sub-agents fail gracefully**: Both other workers fail memory load. The session succeeds with an empty agents map.

13. **Model field always present on agent entry**: Even when `subAgentModel` is omitted (defaulting to `"inherit"`), the agent entry has `model` set to `"inherit"` (not `undefined`). Verifies REQ-SUBAG-11: the field is always explicit for traceability.

Run `bun test tests/daemon/services/sdk-runner.test.ts` to confirm.

**Review checkpoint**: Thorne reviews Phase 4. This is the critical review. Verify:
- Agent map construction happens between step 4 and step 5.
- The calling worker is excluded.
- Sub-agent ActivationContext has no activity context (no meetingContext, commissionContext).
- Error handling is per-worker, not session-fatal.
- `agents` passes through to the SDK via `runSdkSession`.
- All 31 REQs are addressed across the four phases.

---

## REQ Coverage Summary

| REQ | Phase | Step |
|-----|-------|------|
| REQ-SUBAG-1 | Phase 1 | Step 1 |
| REQ-SUBAG-2 | Phase 1 | Step 3 |
| REQ-SUBAG-3 | Phase 1 | Step 3 |
| REQ-SUBAG-4 | Phase 1 | Step 2 |
| REQ-SUBAG-5 | Phase 4 | Step 11 |
| REQ-SUBAG-6 | Phase 4 | Step 11 |
| REQ-SUBAG-7 | Phase 4 | Step 11 |
| REQ-SUBAG-8 | Phase 4 | Step 11 |
| REQ-SUBAG-9 | Phase 4 | Step 11 |
| REQ-SUBAG-10 | Phase 4 | Step 11 |
| REQ-SUBAG-11 | Phase 4 | Step 11 |
| REQ-SUBAG-12 | Phase 4 | Step 11 |
| REQ-SUBAG-13 | Phase 1 | Step 4 |
| REQ-SUBAG-14 | Phase 1 | Step 4 |
| REQ-SUBAG-15 | Phase 4 | Step 11 |
| REQ-SUBAG-16 | Phase 4 | Step 11 |
| REQ-SUBAG-17 | Phase 2 | Step 6 |
| REQ-SUBAG-18 | Phase 2 | Step 6 |
| REQ-SUBAG-19 | Phase 2 | Step 6 |
| REQ-SUBAG-20 | Phase 2 | Step 6 |
| REQ-SUBAG-21 | Phase 3 | Step 8 |
| REQ-SUBAG-22 | Phase 3 | Step 9 |
| REQ-SUBAG-23 | Phase 4 | Step 11 |
| REQ-SUBAG-24 | Phase 4 | Step 11 |
| REQ-SUBAG-25 | Phase 4 | Step 11 |
| REQ-SUBAG-26 | Phase 4 | Step 11 |
| REQ-SUBAG-27 | Phase 4 | Step 11 |
| REQ-SUBAG-28 | Phase 4 | Step 11 |
| REQ-SUBAG-29 | Phase 1 | Step 3 |
| REQ-SUBAG-30 | Phase 4 | Step 11 |
| REQ-SUBAG-31 | Phase 4 | Step 11 |

## Test Strategy

Tests follow the AI Validation section from the spec. Each phase has its own test step that runs before the review checkpoint.

**Structural checks** (verified during review):
- `subAgentModel` on `WorkerMetadata` in `lib/types.ts` (Phase 1).
- `agents` on `SdkQueryOptions` in `sdk-runner.ts` (Phase 3).
- `"subagent"` in `createContextTypeRegistry()` (Phase 1).
- `buildSubAgentDescription` is pure with no I/O (Phase 2).
- Agent map construction in `prepareSdkSession` between step 4 and step 5 (Phase 4).
- `runSdkSession` passes `agents` through to the SDK (Phase 3).

**Behavioral checks** (covered by specific test cases):
- `prepareSdkSession` produces an `agents` map excluding the calling worker (Phase 4, test 1).
- Agents have prompts with identity and posture but no commission/meeting context (Phase 4, test 2).
- `subAgentModel: "sonnet"` produces `model: "sonnet"` (Phase 4, test 3).
- No `subAgentModel` produces `model: "inherit"` (Phase 4, test 4).
- Package validation rejects `subAgentModel: "invalid-model"` (Phase 1, test 4).
- Failing sub-agent activation logs warning and excludes from map (Phase 4, test 7).
- `buildSubAgentDescription` falls back for unknown workers (Phase 2, test 2).
- Worker with soul produces prompt containing soul section (Phase 4, test 8).
- Worker with memory produces prompt containing memory section (Phase 4, test 9).

## Commission Sequence

Four implementation commissions, each followed by a review commission:

1. Commission: Dalton implements Phase 1 (type foundations).
2. Commission: Thorne reviews Phase 1.
3. Commission: Dalton implements Phase 2 (description generation).
4. Commission: Thorne reviews Phase 2.
5. Commission: Dalton implements Phase 3 (options extension).
6. Commission: Thorne reviews Phase 3.
7. Commission: Dalton implements Phase 4 (agent map construction).
8. Commission: Thorne reviews Phase 4 (integration review across all phases).

Use commission dependencies so each implementation commission depends on the previous review commission.
