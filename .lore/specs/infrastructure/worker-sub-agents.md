---
title: Worker Sub-Agents
date: 2026-03-20
status: implemented
tags: [workers, sub-agents, activation, agent-sdk]
modules: [apps/daemon/lib/agent-sdk/sdk-runner, lib/types, apps/daemon/services/context-type-registry, packages/shared/worker-activation]
related:
  - .lore/brainstorm/worker-sub-agents-and-mail-removal.md
  - .lore/specs/infrastructure/context-type-registry.md
  - .lore/specs/workers/worker-identity-and-personality.md
  - .lore/research/claude-agent-sdk-ref-typescript.md
req-prefix: SUBAG
---

# Spec: Worker Sub-Agents

## Overview

Workers currently reach for generic Claude Code agents (like `code-reviewer` from pr-review-toolkit) because those are the agents available through the SDK's Task tool. Guild Hall workers with richer identity, project memory, and domain-specific posture exist but aren't available through the same mechanism. Dalton can't ask Thorne for a review. Thorne can't ask Octavia to check a spec.

The Claude Agent SDK's `query()` function accepts an `agents` parameter: `Record<string, AgentDefinition>`. Each `AgentDefinition` carries a `description` (when to use), `prompt` (system prompt), optional `tools` (filter on parent's tools), and optional `model` override. The SDK handles sub-agent invocation through its built-in Task tool. Sub-agents run synchronously within the caller's session, return results to the caller, and do not inherit the parent's system prompt.

This spec makes every discovered worker available as a sub-agent to every other worker. During `prepareSdkSession`, each worker package (excluding the calling worker) is compiled into an `AgentDefinition` and passed via the `agents` field. Thorne running a commission sees Dalton, Octavia, and every other worker as agents it can invoke through the Task tool with their real identity, posture, and memory.

## Entry Points

- Brainstorm `.lore/brainstorm/worker-sub-agents-and-mail-removal.md`, Proposal 2 defines the core concept: compile worker packages into `AgentDefinition` objects during session preparation.
- The Claude Agent SDK reference (`.lore/research/claude-agent-sdk-ref-typescript.md`) documents `AgentDefinition` and the `agents` field on `Options`.
- The context type registry spec (`.lore/specs/infrastructure/context-type-registry.md`) defines how new context types are added.

## Requirements

### Sub-Agent Model Property

- REQ-SUBAG-1: `WorkerMetadata` in `lib/types.ts` gains a new optional property `subAgentModel` of type `string`. This property declares what model the worker should use when running as a sub-agent, separate from its primary `model` property (used for commissions and meetings). Omitting the property is equivalent to specifying `"inherit"`.

- REQ-SUBAG-2: Valid values for `subAgentModel` are:
  - `"inherit"`: Use the calling worker's model. This is the default when the property is omitted.
  - Any built-in model name from `VALID_MODELS` (`"opus"`, `"sonnet"`, `"haiku"`).

  Local model names from `config.models` are not valid for `subAgentModel`. The SDK's `AgentDefinition.model` field accepts only the built-in names and `"inherit"`. Local models require per-session environment variables (`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`) that the SDK does not support per-sub-agent.

- REQ-SUBAG-3: Package validation rejects `subAgentModel` values that are not `"inherit"` and not in `VALID_MODELS`. The error message names the invalid value and lists the valid options. Validation runs during package discovery, same as existing metadata validation.

- REQ-SUBAG-4: The `subAgentModel` property lives in `package.json` under `guildHall`, at the same level as `model`. Example:

  ```json
  {
    "guildHall": {
      "type": "worker",
      "model": "opus",
      "subAgentModel": "sonnet",
      "identity": { ... }
    }
  }
  ```

  Most workers will not declare `subAgentModel`. The default (`"inherit"`) is appropriate when the sub-agent's value is judgment, not compute. Workers that benefit from a specific model tier regardless of caller (e.g., an illuminator that needs vision capabilities) would declare one explicitly.

### Agent Map Construction

- REQ-SUBAG-5: `prepareSdkSession` in `sdk-runner.ts` gains a new step between step 4 (activate worker) and step 5 (build SDK query options). This step constructs the agent map: a `Record<string, AgentDefinition>` where each key is a worker name and each value is the compiled `AgentDefinition` for that worker.

- REQ-SUBAG-6: The agent map includes every discovered worker package except the calling worker (identified by `spec.workerName` on `SessionPrepSpec`). The calling worker is excluded because a worker invoking itself as a sub-agent would create identity confusion and duplicate prompts. The Guild Master is also a worker but is not a package (it's built into the daemon), so it is not included.

- REQ-SUBAG-7: For each included worker, the agent map entry is built by calling the `activateWorker` dependency directly (the `SessionPrepDeps.activateWorker` function, which resolves to `activateWorkerWithSharedPattern` from `packages/shared/worker-activation.ts`). This is NOT a recursive call to `prepareSdkSession`. The full 5-step pipeline (toolbox resolution, plugin resolution, sandbox settings, etc.) is only needed for the calling worker. Sub-agents need only a system prompt.

  Steps per sub-agent worker:
  1. Loading the worker's memory via the `loadMemories` dependency (same call used for step 3 of the main pipeline, but with the sub-agent worker's name).
  2. Constructing an `ActivationContext` for the sub-agent (see REQ-SUBAG-15) and calling `activateWorker` to get an `ActivationResult`.
  3. Extracting the `systemPrompt` from the `ActivationResult` to use as the `AgentDefinition.prompt`.
  4. Computing the `description` from the worker's identity (see REQ-SUBAG-17 through REQ-SUBAG-20).
  5. Resolving the `model` from the worker's `subAgentModel` property (see REQ-SUBAG-10).

- REQ-SUBAG-8: Agent map construction failures for individual workers do not fail the session. If a worker's memory load or activation throws, that worker is excluded from the agent map and a warning is logged. The calling worker's session proceeds with a partial agent map. This is a degraded-but-functional path: the caller loses access to one sub-agent, not all of them.

- REQ-SUBAG-9: Agent map construction should not dominate session startup time. Memory loads for sub-agent workers run concurrently (Promise.all). Activation calls are lightweight (string assembly, no I/O beyond memory). If startup latency becomes a concern, this is the place to add caching (not in scope for this spec).

### Sub-Agent Model Resolution

- REQ-SUBAG-10: The `model` field on the generated `AgentDefinition` is determined by:
  1. If the worker's `subAgentModel` is `"inherit"` or omitted, pass `"inherit"` as the `AgentDefinition.model`. The SDK resolves `"inherit"` to the calling session's model.
  2. If the worker's `subAgentModel` is a built-in model name, pass that name directly as the `AgentDefinition.model`.

- REQ-SUBAG-11: The `AgentDefinition.model` value is always set explicitly, even for `"inherit"`. This makes the intent visible in logs and debugging. If the field were omitted (which the SDK also treats as "use the main model"), the behavior would be the same but less traceable.

### Sub-Agent Tools

- REQ-SUBAG-12: The `tools` field on the generated `AgentDefinition` is not set. When `tools` is omitted, the SDK gives the sub-agent access to all of the parent's tools. The sub-agent's value is its judgment and identity, not a restricted toolbox. The calling worker's MCP servers, built-in tools, and `canUseTool` rules all apply to the sub-agent.

### Sub-Agent Activation Path

- REQ-SUBAG-13: A new context type `"subagent"` is added in `apps/daemon/services/context-type-registry.ts`. This requires two changes:
  1. The `ContextTypeName` union type is extended to include `"subagent"` (per the pattern from REQ-CXTR-9). Without this, TypeScript will reject `"subagent"` at any call site that uses `ContextTypeName`.
  2. The runtime registry gains a `"subagent"` entry (see REQ-SUBAG-14).

  The registration has no `toolboxFactory` (sub-agents don't get their own tools) and a `stateSubdir` of `"subagents"` (for decision log routing, per the base toolbox pattern).

- REQ-SUBAG-14: The `"subagent"` context type is registered in `createContextTypeRegistry()` alongside the existing types. Example:

  ```typescript
  registry.set("subagent", {
    name: "subagent",
    stateSubdir: "subagents",
  });
  ```

  No `toolboxFactory` because sub-agents inherit the parent's tools via the SDK, not via toolbox resolution.

- REQ-SUBAG-15: When building the `ActivationContext` for a sub-agent worker, the following fields are populated:
  - `identity`: From the sub-agent worker's metadata.
  - `posture`: From the sub-agent worker's metadata.
  - `soul`: From the sub-agent worker's metadata (if present).
  - `injectedMemory`: Loaded for the sub-agent worker (by name and project).
  - `model`: From the sub-agent worker's metadata (primary `model`, not `subAgentModel`). The `model` field in `ActivationContext` is used by the activation pipeline to include model-specific instructions in the system prompt. It is distinct from `AgentDefinition.model`, which controls which model the SDK routes the sub-agent's requests to. `subAgentModel` maps to `AgentDefinition.model` (REQ-SUBAG-10); `model` maps to `ActivationContext.model`.
  - `resolvedTools`: Empty (`ResolvedToolSet` with empty arrays). Sub-agents don't resolve their own tools (REQ-SUBAG-12), but `ActivationContext` requires this field. The empty value signals "no tool resolution needed."
  - `resourceDefaults`: Empty (sub-agents don't set their own resource bounds; the parent session's limits apply).
  - `localModelDefinitions`: From the calling session's config. The activation pipeline uses this to include model-specific instructions in the system prompt (the REQ-LOCAL-20 pattern from the local model support spec). Passed through for interface compatibility even though sub-agents don't use local models.
  - `projectPath`: From the calling session's spec.
  - `workingDirectory`: From the calling session's spec.

  The following fields are explicitly NOT set:
  - `meetingContext`: Not set. The sub-agent is a consultant, not a meeting participant.
  - `commissionContext`: Not set. The sub-agent is not executing the commission.
  - `managerContext`: Not set.

- REQ-SUBAG-16: The `buildSystemPrompt` function in `packages/shared/worker-activation.ts` already handles the case where no activity-specific context is provided: it assembles soul, identity, posture, and memory sections. No new branch is needed for the `"subagent"` case. The absence of `meetingContext` and `commissionContext` in the `ActivationContext` is the mechanism. The sub-agent gets a prompt that says who it is and what it knows, without any instructions about what task it's performing. The calling agent provides task context when it invokes the sub-agent via the Task tool.

### Invocation Guidance Property

- REQ-SUBAG-32: `WorkerIdentity` in `lib/types.ts` gains a new optional property `guidance` of type `string`. This property describes WHEN to invoke the worker as a sub-agent. Each worker declares this about itself in its `package.json` under `guildHall.identity.guidance`. Example:

  ```json
  {
    "guildHall": {
      "identity": {
        "name": "Thorne",
        "displayTitle": "Guild Warden",
        "description": "Oversees all work with a critical eye. Inspects everything, alters nothing.",
        "guidance": "Invoke this worker when you need a critical review that checks for correctness, security, and adherence to project conventions. This worker reads and evaluates but does not modify code."
      }
    }
  }
  ```

  The guidance string is optional. Workers that omit it fall back to `identity.description` at description-build time (REQ-SUBAG-20). New workers should add a guidance string once their invocation patterns are clear.

- REQ-SUBAG-33: The `workerIdentitySchema` in `lib/packages.ts` adds `guidance` as an optional string field. No minimum length constraint; presence is enough. Validation runs during package discovery alongside existing identity validation.

### Description Generation

- REQ-SUBAG-17: The `description` field on the generated `AgentDefinition` describes WHEN to invoke the worker, not just what the worker does. The SDK surfaces this description to the calling agent so it can decide whether to invoke the sub-agent. A description that says "Reviews code" is less useful than "Use when you want a critical code review that checks for correctness, security, and adherence to project conventions."

- REQ-SUBAG-18: The description is assembled from two sources:
  1. The worker's `identity.description` (from `WorkerMetadata`), which states what the worker does.
  2. The worker's `identity.guidance` (from `WorkerMetadata`), which states when to invoke this worker as a sub-agent.

  The description format:

  ```
  {identity.displayTitle} ({identity.name}). {identity.description}

  {identity.guidance}
  ```

  When `identity.guidance` is present, it is used directly. When absent, the fallback format is:

  ```
  {identity.displayTitle} ({identity.name}). {identity.description}

  Invoke this worker when: {identity.description}
  ```

- REQ-SUBAG-19: A `buildSubAgentDescription` function is introduced in `packages/shared/sub-agent-description.ts`. It takes `WorkerIdentity` as input and returns the description string. The `posture` parameter is no longer needed because invocation guidance now comes from the identity. This function is pure (no I/O, no side effects) and testable in isolation.

- REQ-SUBAG-20: The description function reads `identity.guidance` for the invocation-guidance text. When `guidance` is present, it is used as-is. When absent, the function falls back to `Invoke this worker when: {identity.description}`. There is no hardcoded lookup table. Each worker owns its own guidance as part of its identity declaration, the same way it owns its name and description.

### SdkQueryOptions Extension

- REQ-SUBAG-21: `SdkQueryOptions` in `sdk-runner.ts` gains a new optional property:

  ```typescript
  agents?: Record<string, {
    description: string;
    tools?: string[];
    prompt: string;
    model?: string;
  }>;
  ```

  This mirrors the SDK's `AgentDefinition` type. The property is typed inline rather than importing from the SDK to maintain the existing pattern where `SdkQueryOptions` is a Guild Hall type that maps to SDK options, not a re-export of SDK types.

- REQ-SUBAG-22: `runSdkSession` passes `options.agents` through to the SDK's `query()` call in `resolvedOptions`. No transformation needed; the shape matches.

### SessionPrepSpec and SessionPrepDeps

- REQ-SUBAG-23: `SessionPrepSpec` does not gain new fields for sub-agent configuration. The agent map is constructed from data already available in the spec: `packages` (worker packages), `config` (for model resolution), `projectName`, `projectPath`, `workspaceDir`, and `guildHallHome`.

- REQ-SUBAG-24: `SessionPrepDeps` does not gain new dependencies for sub-agent construction. The existing `loadMemories` and `activateWorker` dependencies are reused for sub-agent preparation. This keeps the interface stable and the test surface unchanged.

### What Sub-Agents Can and Cannot Do

- REQ-SUBAG-25: Sub-agents inherit all of the calling worker's tools. This includes:
  - Built-in tools (Read, Grep, Glob, Bash, etc.)
  - MCP tools from the base toolbox (memory, artifacts, decisions)
  - MCP tools from context toolboxes (commission or meeting tools)
  - MCP tools from domain toolboxes
  - Domain plugins

  The sub-agent can read files, search code, and use any MCP tool the parent has. It operates within the parent's `canUseTool` rules and sandbox settings.

- REQ-SUBAG-26: Sub-agents can write to memory, record decisions, and use artifact tools because these are part of the parent's tool set. This is by design: a sub-agent reviewer that discovers a decision worth recording should be able to record it. The writes happen within the parent session's worktree and project context.

- REQ-SUBAG-27: Sub-agents cannot modify their own toolbox or request additional tools. The SDK's sub-agent mechanism does not support per-agent MCP servers or tool registration. The `tools` field on `AgentDefinition` is a filter (whitelist), not an extension mechanism.

- REQ-SUBAG-28: Sub-agents run within the parent session's turn budget and cost budget. The SDK does not allocate separate budgets per sub-agent. A sub-agent that runs for many turns consumes the parent's allocation. This is the expected behavior: the calling worker's judgment about when to invoke a sub-agent implicitly manages budget.

### Package Validation

- REQ-SUBAG-29: The existing package validation logic (wherever `WorkerMetadata` is validated during package discovery) adds validation for `subAgentModel`:
  - If present and not a string, reject with a type error.
  - If present and not `"inherit"` and not in `VALID_MODELS`, reject with a validation error listing valid values.
  - If absent, no error (defaults to `"inherit"` at runtime).

### Logging

- REQ-SUBAG-30: Agent map construction logs at `info` level:
  - "Building sub-agent map: {count} workers available" (at start).
  - "Sub-agent map built: {count} agents included" (at end, may differ from start if some failed).

- REQ-SUBAG-31: Individual sub-agent construction failures log at `warn` level:
  - "Failed to build sub-agent for worker '{name}': {error}". The session continues without that agent.

## Explicit Non-Goals

- **Sub-agent-specific toolboxes.** Sub-agents inherit the parent's tools. A sub-agent that needs Thorne's domain toolbox would require per-agent MCP server injection, which the SDK does not support. The sub-agent's value is its judgment shaped by its prompt, not a specialized tool set.

- **Sub-agent resource limits.** The SDK does not support per-sub-agent turn or cost budgets. The parent session's limits apply to the entire session including sub-agent invocations.

- **Guild Master as a sub-agent.** The Guild Master is not a package; it's built into the daemon with an exclusive manager toolbox. Making it available as a sub-agent would require either packaging the manager identity or special-casing it in the agent map construction. Neither is justified: workers don't need to consult the manager. The manager consults them.

- **Bidirectional invocation chains.** Worker A can invoke Worker B as a sub-agent. Worker B (running as A's sub-agent) could theoretically invoke Worker A (since A appears in B's sub-agent map). The SDK handles this recursion. This spec does not prevent it, but it also does not require it. If recursive invocation causes problems (budget exhaustion, infinite loops), the SDK's own depth limits apply.

- **Local models for sub-agents.** The SDK's `AgentDefinition.model` field accepts only built-in model names and `"inherit"`. Local models require per-session environment variable injection that the SDK does not support per-sub-agent. If the SDK adds local model support for sub-agents, REQ-SUBAG-2 can be revised.

- **Sub-agent invocation history in artifacts.** Sub-agent invocations appear in the parent session's transcript (the SDK emits `SubagentStart` and `SubagentStop` events). This spec does not add sub-agent invocation tracking to commission or meeting artifacts beyond what the existing transcript captures.

- **Opt-out per worker.** All workers are available as sub-agents to all other workers. There is no mechanism for a worker to declare "I should not be available as a sub-agent." If this becomes necessary (e.g., a worker whose posture is harmful when invoked out of its primary context), a future spec can add an opt-out flag to `WorkerMetadata`.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Sub-agent-specific tools | A sub-agent needs capabilities the parent doesn't have | SDK support for per-agent MCP servers, or a tool passthrough mechanism |
| Local model sub-agents | The SDK adds per-agent model endpoint configuration | Revise REQ-SUBAG-2 to allow local model names |
| Per-worker opt-out | A worker's posture is counterproductive when invoked as a sub-agent | Add `excludeFromSubAgents?: boolean` to `WorkerMetadata` |
| Description from LLM | Human-written guidance strings produce poor invocation quality | Replace `buildSubAgentDescription` with an LLM-generated description cached at package discovery time |
| Sub-agent caching | Agent map construction adds measurable latency to session startup | Cache compiled `AgentDefinition` objects per worker, invalidate on package change |

## Success Criteria

- [ ] Workers can invoke other workers as sub-agents via the SDK's Task tool during commissions and meetings
- [ ] Sub-agent sessions carry the invoked worker's identity, posture, soul, and project memory
- [ ] Sub-agent sessions do not carry the parent's commission task, meeting agenda, or mail context
- [ ] The calling worker is excluded from its own sub-agent map
- [ ] `subAgentModel` defaults to `"inherit"` when omitted
- [ ] `subAgentModel` rejects invalid values during package validation
- [ ] Sub-agent construction failure for one worker does not prevent the session from starting
- [ ] Sub-agents inherit all of the parent's tools (no `tools` filter on `AgentDefinition`)
- [ ] The `"subagent"` context type is registered with no toolbox factory
- [ ] All eight current workers declare invocation guidance in `identity.guidance`
- [ ] Agent descriptions use `identity.guidance` when present, fall back to `identity.description` when absent
- [ ] All daemon tests pass, including new tests for agent map construction and description generation

## AI Validation

**Defaults:**
- Read the full spec before starting implementation.
- Verify every requirement has at least one test.
- Run `bun test` and confirm all tests pass before declaring work complete.

**Structural checks:**
- Confirm `subAgentModel` is added to `WorkerMetadata` in `lib/types.ts`.
- Confirm `agents` is added to `SdkQueryOptions` in `sdk-runner.ts`.
- Confirm `"subagent"` is registered in `createContextTypeRegistry()`.
- Confirm `buildSubAgentDescription` is a pure function with no I/O that takes `WorkerIdentity` (not posture).
- Confirm agent map construction in `prepareSdkSession` runs between step 4 and step 5.
- Confirm `runSdkSession` passes `agents` through to the SDK.
- Confirm `guidance` is an optional string on `WorkerIdentity` in `lib/types.ts`.
- Confirm `guidance` is in the `workerIdentitySchema` in `lib/packages.ts`.

**Behavioral checks:**
- Test that `prepareSdkSession` produces an `agents` map excluding the calling worker.
- Test that agents in the map have prompts containing identity and posture sections but no commission/meeting context.
- Test that a worker with `subAgentModel: "sonnet"` produces an `AgentDefinition` with `model: "sonnet"`.
- Test that a worker with no `subAgentModel` produces an `AgentDefinition` with `model: "inherit"`.
- Test that package validation rejects `subAgentModel: "invalid-model"`.
- Test that a failing sub-agent activation logs a warning and excludes that agent from the map.
- Test that `buildSubAgentDescription` uses `identity.guidance` when present.
- Test that `buildSubAgentDescription` falls back to `identity.description` when `guidance` is absent.
- Test that a worker with soul content produces a prompt containing the soul section, and a worker without soul still activates successfully.
- Test that a worker with memory content produces a prompt containing the memory section.

## Constraints

- The `AgentDefinition` type is sourced from SDK documentation, not from a TypeScript import. If the SDK changes the type shape, the inline type in `SdkQueryOptions` must be updated manually. A sync test (importing the SDK type and comparing fields) could catch drift, but is not required by this spec.
- Sub-agent prompt quality depends on the existing activation pipeline producing good system prompts from identity + posture + memory alone (no activity context). This is the same pipeline used for commissions and meetings, just with fewer inputs. If the prompts are too generic, the solution is richer worker identity and posture content, not changes to the activation pipeline.
- Description generation (REQ-SUBAG-18 through REQ-SUBAG-20) reads from the worker's identity metadata. The quality of invocation guidance depends on each worker's `guidance` string being well-written. If a worker's guidance is vague, the fix is updating the worker's `package.json`, not changing the description function. LLM-generated descriptions cached at package discovery time remain an escape hatch if human-written guidance proves insufficient (see Exit Points).

## Context

- The brainstorm (`.lore/brainstorm/worker-sub-agents-and-mail-removal.md`, Proposal 2) established the core concept and rationale. This spec fills in the requirements the brainstorm left open: property schema, validation, activation path, description generation, and tool inheritance semantics.
- REQ-SUBAG-32, REQ-SUBAG-33 (added 2026-03-21) replace the hardcoded lookup table approach from the original REQ-SUBAG-18/20 with a `guidance` property on `WorkerIdentity`. The lookup table was a workaround for invocation guidance not being in the package metadata. With `guidance` in the identity block, each worker declares its own invocation guidance and `buildSubAgentDescription` becomes a simple read instead of a table lookup.
- The context type registry spec (`.lore/specs/infrastructure/context-type-registry.md`) defines the pattern for adding new context types. The `"subagent"` type follows the same pattern as `"briefing"`: registered in the map, no toolbox factory, uses a state subdirectory.
- The SDK reference (`.lore/research/claude-agent-sdk-ref-typescript.md`) documents the `AgentDefinition` type and the `agents` field on `Options`. The spec's type definitions are derived from this reference.
