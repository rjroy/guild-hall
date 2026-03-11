---
title: Model selection implementation
date: 2026-03-08
status: executed
tags: [model-selection, workers, commissions, cost-management]
modules: [daemon, worker-activation, sdk-runner, commission-orchestrator, manager-toolbox, web-ui]
related:
  - .lore/specs/infrastructure/model-selection.md
  - .lore/brainstorm/model-selection.md
  - .lore/issues/local-model-support.md
  - .lore/plans/infrastructure/improve-briefing-full-sdk-pattern.md
---

# Plan: Model Selection

## Spec Reference

**Spec**: `.lore/specs/infrastructure/model-selection.md`
**Brainstorm**: `.lore/brainstorm/model-selection.md`

Requirements addressed:
- REQ-MODEL-1: Worker packages declare a default model → Steps 1, 2, 7
- REQ-MODEL-2: Guild Master includes model in WorkerMetadata → Step 4
- REQ-MODEL-3: Valid model names validated → Steps 1, 2, 5
- REQ-MODEL-4: Valid model list defined as a single constant → Step 1
- REQ-MODEL-5: Activation reads model from metadata → Steps 3, 4
- REQ-MODEL-6: Missing model falls back to opus → Steps 3, 4
- REQ-MODEL-7: Commission resource_overrides accepts model → Steps 5, 6
- REQ-MODEL-8: Commission model override takes precedence → Step 5
- REQ-MODEL-9: Resolution order: commission > worker > fallback → Step 5
- REQ-MODEL-10: Scheduled commission templates include model in resource_overrides → Step 6
- REQ-MODEL-11: Meetings use worker's default model → Step 5 (automatic)
- REQ-MODEL-12: Mail uses worker's default model → Step 5 (automatic)
- REQ-MODEL-13: Briefing generator uses resourceOverrides path → Step 8
- REQ-MODEL-14: Manager posture includes model guidance → Step 9
- REQ-MODEL-15: Manager defaults to worker's model, overrides when task fits different tier → Step 9
- REQ-MODEL-16: Commission views display model → Step 10
- REQ-MODEL-17: Meeting views display model → Step 10
- REQ-MODEL-18: Worker roster displays default model → Step 10

## Codebase Context

The infrastructure already supports model selection. The changes extend existing patterns rather than introducing new ones.

**Existing model flow.** `ActivationResult.model` is `string | undefined` (`lib/types.ts:154`). `prepareSdkSession` passes `activation.model` through to `SdkQueryOptions` (`daemon/lib/agent-sdk/sdk-runner.ts:327`). The SDK runner already handles the model when present.

**Hardcoded "opus" in two places.** `packages/shared/worker-activation.ts:111` (all roster workers) and `daemon/services/manager/worker.ts:164` (Guild Master). Both return `model: "opus"` in `ActivationResult`. These are the only two sites that need to change from hardcoded to metadata-driven.

**Briefing generator override pattern.** `daemon/services/briefing-generator.ts:401` overrides model via a direct spread: `{ ...prepResult.result.options, model: "sonnet" }`. This works but bypasses the `SessionPrepSpec.resourceOverrides` path that commissions use. REQ-MODEL-13 formalizes it.

**Commission resource_overrides flow.** The commission orchestrator reads `resource_overrides` from the artifact frontmatter in `dispatchCommission` (`daemon/services/commission/orchestrator.ts:1385-1392`), builds a `resourceOverrides` object, and passes it to `SessionPrepSpec`. `prepareSdkSession` applies these overrides after activation (`sdk-runner.ts:313-314`). Model follows this same path.

**CommissionSessionForRoutes interface.** `createCommission` and `updateCommission` accept `resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number }`. This type needs `model?: string` added. The manager toolbox's `create_commission` tool schema (`daemon/services/manager/toolbox.ts:656-659`) mirrors this shape.

**Package validation.** `lib/packages.ts` uses Zod schemas (`workerMetadataSchema`, line 48-59) to validate `package.json` guildHall keys during discovery. The `model` field goes here with validation against the allowed list.

**Worker roster UI.** No dedicated worker roster view exists in the web UI. The project page has tabs for artifacts, commissions, and meetings but not workers. REQ-MODEL-18 references the worker roster spec, which is draft. Implementation here is limited to whatever worker display currently exists (likely the dashboard or project header).

**Commission UI.** Commission detail page (`web/app/projects/[name]/commissions/[id]/page.tsx`) reads `CommissionMeta` via `readCommissionMeta` and passes data to `CommissionHeader` and `CommissionView`. The `CommissionMeta` type (`lib/commissions.ts:19-35`) includes `resource_overrides` but not model specifically.

**Meeting UI.** Meeting detail page (`web/app/projects/[name]/meetings/[id]/page.tsx`) renders `MeetingView`. The model in use for a meeting is the worker's default, which requires looking up the worker package metadata.

## Implementation Steps

### Step 1: Define valid models constant and model type

**Files**: `lib/types.ts`
**Addresses**: REQ-MODEL-3, REQ-MODEL-4

Add a `VALID_MODELS` constant as a readonly array and derive a `ModelName` type from it. Place it alongside the existing package metadata types in `lib/types.ts` (near line 44, after the `CheckoutScope` type).

```typescript
export const VALID_MODELS = ["opus", "sonnet", "haiku"] as const;
export type ModelName = (typeof VALID_MODELS)[number];
```

Using `as const` with a derived union type means the valid model list is defined once and the type system enforces it at compile time. When local model support is added (`.lore/issues/local-model-support.md`), only this array needs to change.

Export a validation helper:

```typescript
export function isValidModel(value: string): value is ModelName {
  return (VALID_MODELS as readonly string[]).includes(value);
}
```

**Tests**: Verify `isValidModel` accepts all three valid names and rejects invalid ones.

### Step 2: Add model to WorkerMetadata and package validation schema

**Files**: `lib/types.ts`, `lib/packages.ts`
**Addresses**: REQ-MODEL-1, REQ-MODEL-3

In `lib/types.ts`, add `model?: ModelName` to the `WorkerMetadata` interface (after `soul`, around line 67). The field is optional; Step 3 handles the fallback.

In `lib/packages.ts`, add `model` to `workerMetadataSchema` (after `soul`, around line 52). Use `z.string().refine(isValidModel)` to validate against the central `VALID_MODELS` constant from Step 1, satisfying REQ-MODEL-4's "defined as a single constant, not repeated across validation sites":

```typescript
import { isValidModel } from "@/lib/types";

model: z.string().refine(isValidModel, { message: "Invalid model name" }).optional(),
```

This ensures the valid model list is defined once in `VALID_MODELS` and referenced everywhere else. When local model support adds new entries to that array, no validation sites need updating.

**Tests**: Package discovery tests should verify:
- A worker with `"model": "haiku"` is discovered with `model: "haiku"` in metadata
- A worker with no model field is discovered with `model: undefined`
- A worker with `"model": "invalid"` is skipped with a validation warning

### Step 3: Wire model through shared activation

**Files**: `lib/types.ts`, `packages/shared/worker-activation.ts`
**Addresses**: REQ-MODEL-5, REQ-MODEL-6

Add `model?: string` to `ActivationContext` in `lib/types.ts` (after `injectedMemory`, around line 122). This field carries the worker's declared model from `prepareSdkSession` into the activation function.

In `packages/shared/worker-activation.ts`, change `activateWorkerWithSharedPattern` (line 111):

```typescript
// Before:
model: "opus",

// After:
model: context.model ?? "opus",
```

All filesystem-loaded worker packages use this shared pattern. This single change covers every roster worker.

**Tests**: Activation tests should verify:
- Context with `model: "haiku"` produces `ActivationResult.model === "haiku"`
- Context with `model: undefined` produces `ActivationResult.model === "opus"` (backwards compatibility)

### Step 4: Wire model through manager activation

**Files**: `daemon/services/manager/worker.ts`
**Addresses**: REQ-MODEL-2, REQ-MODEL-5, REQ-MODEL-6

Two changes in this file:

First, add `model: "opus"` to the Guild Master's `WorkerMetadata` in `createManagerPackage()` (around line 64, inside the `metadata` object). This makes the manager's model declaration consistent with roster workers.

Second, change `activateManager` (line 164):

```typescript
// Before:
model: "opus",

// After:
model: context.model ?? "opus",
```

The manager's metadata says `model: "opus"`, and `prepareSdkSession` will pass it through `ActivationContext.model`. The fallback to `"opus"` ensures backwards compatibility if model is ever undefined.

**Tests**: Manager activation tests should mirror the shared activation tests. Verify `createManagerPackage()` returns metadata with `model: "opus"`.

### Step 5: Add model to SessionPrepSpec.resourceOverrides and apply override in prepareSdkSession

**Files**: `daemon/lib/agent-sdk/sdk-runner.ts`
**Addresses**: REQ-MODEL-7, REQ-MODEL-8, REQ-MODEL-9, REQ-MODEL-11, REQ-MODEL-12

Two changes in this file:

First, add `model?: string` to the `resourceOverrides` type on `SessionPrepSpec` (line 63):

```typescript
resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number; model?: string };
```

Second, in `prepareSdkSession`, wire the model through the activation context and apply the override.

In step 4 (activate worker, around line 293), add `model` to the `ActivationContext`:

```typescript
const activationContext: ActivationContext = {
  // ...existing fields...
  model: workerMeta.model,
  // ...rest...
};
```

In step 5 (build SDK query options, around line 312), apply the override:

```typescript
// Before:
...(activation.model ? { model: activation.model } : {}),

// After:
const resolvedModel = spec.resourceOverrides?.model ?? activation.model;
// ...then in options:
...(resolvedModel ? { model: resolvedModel } : {}),
```

This implements the three-tier resolution order (REQ-MODEL-9):
1. Commission `resource_overrides.model` (via `spec.resourceOverrides.model`)
2. Worker default (via `activation.model`, which reads from `workerMeta.model`)
3. Fallback `"opus"` (in the activation function, Step 3/4)

Meetings and mail sessions pass no `resourceOverrides.model`, so they automatically use the worker's default model (REQ-MODEL-11, REQ-MODEL-12). No additional code needed for those context types.

**Tests**:
- Model from activation flows to options when no override present
- `resourceOverrides.model` overrides activation model
- No model in activation or overrides produces no model in options (fallback handled by activation)

### Step 6: Wire model through commission orchestrator

**Files**: `daemon/services/commission/orchestrator.ts`, `lib/commissions.ts`
**Addresses**: REQ-MODEL-7, REQ-MODEL-10

Three changes in the orchestrator:

**createCommission** (around line 1159): Update the `resourceOverrides` parameter type to include `model?: string`. When building the artifact YAML, include `model` in the `resource_overrides` block alongside `maxTurns` and `maxBudgetUsd`. The `resourceLines` template (around line 1203) needs a new conditional for model:

```typescript
${resourceOverrides.model !== undefined
  ? `  model: ${resourceOverrides.model}\n`
  : ""}
```

**dispatchCommission** (around line 1385): Read `model` from the parsed `resource_overrides`:

```typescript
if (overrides?.model !== undefined) {
  resourceOverrides.model = String(overrides.model);
}
```

Validate the model name before passing it through. If invalid, throw (same as other validation failures in dispatch).

**updateCommission** (around line 1297): Handle `model` updates in `resource_overrides`, following the same regex-based YAML update pattern as `maxTurns` and `maxBudgetUsd`. The existing patterns use regexes like `/^ {2}maxTurns: (\d+)$/m` to read and replace values in-place. The model equivalent:

```typescript
/^ {2}model: (\w+)$/m
```

If model isn't present in the existing YAML but the update includes one, insert it after the last `resource_overrides` field (same insertion logic used for other override fields).

Update the `CommissionSessionForRoutes` interface (lines 90-97, 98-105) to include `model?: string` in all `resourceOverrides` parameter types.

In `lib/commissions.ts`, add `model` to the `resource_overrides` shape in `CommissionMeta` (line 28):

```typescript
resource_overrides: { maxTurns?: number; maxBudgetUsd?: number; model?: string };
```

Update `parseCommissionData` to extract `model` from `resource_overrides`.

For REQ-MODEL-10 (scheduled commissions): the scheduled commission spawner copies `resource_overrides` from the template to the spawned commission. Since `model` is now part of `resource_overrides`, it flows through the existing copy mechanism without additional code. The scheduled commissions spec amendments (REQ-SCOM-11, REQ-SCOM-19) are documentation updates, not code changes. See Open Questions.

**Tests**:
- Creating a commission with `resourceOverrides: { model: "haiku" }` writes `model: haiku` in the artifact
- Dispatching reads model from artifact and passes it through SessionPrepSpec
- Updating a commission's model override works
- Invalid model names in resource_overrides are rejected during dispatch

### Step 7: Add model to manager toolbox create_commission tool

**Files**: `daemon/services/manager/toolbox.ts`
**Addresses**: REQ-MODEL-14 (partial, mechanism)

Update the `create_commission` tool's Zod schema (around line 656) to include `model` in `resourceOverrides`:

```typescript
import { isValidModel } from "@/lib/types";

resourceOverrides: z.object({
  maxTurns: z.number().optional(),
  maxBudgetUsd: z.number().optional(),
  model: z.string().refine(isValidModel, { message: "Invalid model name" }).optional(),
}).optional().describe("Override default resource limits"),
```

Same `isValidModel` refine approach as Step 2, keeping the valid model list defined in one place (REQ-MODEL-4).

The handler (`makeCreateCommissionHandler`) already passes `args.resourceOverrides` straight through to `commissionSession.createCommission`. With model added to the type, no handler logic changes are needed.

Update the tool description to mention model selection:

```
"Create a new commission for a specialist worker. By default, the commission is dispatched immediately. Set dispatch=false to create without dispatching. Use resourceOverrides.model to override the worker's default model."
```

**Tests**: Verify the tool accepts a model in resourceOverrides and passes it through to createCommission.

### Step 8: Refactor briefing generator to use resourceOverrides.model

**Files**: `daemon/services/briefing-generator.ts`
**Addresses**: REQ-MODEL-13

In `generateWithFullSdk` (around line 372-401), replace the direct spread with `resourceOverrides.model`:

```typescript
// Before (line 384):
resourceOverrides: { maxTurns: 200 },

// After:
resourceOverrides: { maxTurns: 200, model: "sonnet" as ModelName },
```

And remove the post-preparation override (line 401):

```typescript
// Before:
const options = { ...prepResult.result.options, model: "sonnet" };

// After:
const options = prepResult.result.options;
```

The model now flows through the standard `SessionPrepSpec.resourceOverrides` path, consistent with how commissions override models. The Sonnet default is preserved; only the mechanism changes.

**Tests**: Existing briefing generator tests should continue to pass. Add a test verifying that the prep spec includes `model: "sonnet"` in resourceOverrides (instead of checking the post-spread options object).

### Step 9: Add model guidance to manager posture

**Files**: `daemon/services/manager/worker.ts`
**Addresses**: REQ-MODEL-14, REQ-MODEL-15

Append model routing guidance to `MANAGER_POSTURE` (around line 45). Add a section after the existing dispatch guidance:

```
## Model Selection

Each worker declares a default model. When creating commissions, use the worker's default unless the task clearly fits a different tier.

Model guidance:
- **Haiku:** The outcome is predictable, the task is bounded, and variance would be noise.
- **Sonnet:** Variance is acceptable or desirable. Creative work, drafting, exploration.
- **Opus:** Uncertainty is high and consistency matters. Deep reasoning, ambiguous problems, high stakes.

To override a worker's default model, set `model` in `resourceOverrides` when creating the commission.
```

This is posture text, not code logic. The manager makes judgment calls about when to override; the system provides the mechanism.

**Tests**: No unit tests for posture content. Verify the text is included in the manager's system prompt by checking `activateManager` output.

### Step 10: Display model in the UI

**Files**: Multiple web components
**Addresses**: REQ-MODEL-16, REQ-MODEL-17, REQ-MODEL-18

This step has three parts, each independent of the others.

**Commission view (REQ-MODEL-16):**

In `web/app/projects/[name]/commissions/[id]/page.tsx` (server component), the model is available in `commission.resource_overrides.model` (commission override) and through the worker's metadata (worker default). Determine the effective model: `commission.resource_overrides.model ?? workerDefaultModel ?? "opus"`.

Pass the resolved model as a prop to `CommissionHeader` (`web/components/commission/CommissionHeader.tsx`). Display it alongside the worker name and status badge, inside the existing metadata row. A simple text label is sufficient: "Model: haiku" or "Model: opus (default)". If the model was overridden from the worker's default, mark it with "(override)" to make cost implications visible.

The worker's default model requires looking up the worker package. Since the commission page is a server component, this is a filesystem read via `discoverPackages` + `getWorkerByName` from `lib/packages.ts`. Add a helper that resolves the effective model for a commission given the worker name and `resource_overrides`.

**Meeting view (REQ-MODEL-17):**

In `web/app/projects/[name]/meetings/[id]/page.tsx` (server component), the model is the worker's default. The meeting artifact has a `worker` field. Look up the worker package metadata via `discoverPackages` + `getWorkerByName` to find its declared model (or fallback to "opus" if not declared).

Pass the resolved model as a prop to `MeetingView` (`web/components/meeting/MeetingView.tsx`). Display it in the meeting header area, same pattern as commissions.

**Worker roster (REQ-MODEL-18):**

No dedicated worker roster view exists in the UI. The project page shows workers only as commission/meeting assignees. If a worker listing component exists elsewhere (dashboard, sidebar), add model to it. If none exists, defer this requirement until the worker roster view (`.lore/specs/workers/guild-hall-worker-roster.md`) is implemented. Note the deferral in the spec review step.

**Expertise**: Frontend (CSS Modules, Next.js server components). The implementer should follow existing patterns in `CommissionHeader` and `MeetingView` for layout and styling.

**Tests**: Component tests if the project has them. Otherwise, visual verification.

### Step 11: Update worker packages

**Files**: `packages/guild-hall-writer/package.json`, `packages/guild-hall-developer/package.json`, `packages/guild-hall-researcher/package.json`, `packages/guild-hall-reviewer/package.json`, `packages/guild-hall-test-engineer/package.json`
**Addresses**: REQ-MODEL-1

Add `"model": "opus"` to the `guildHall` key in each worker package's `package.json`. Place it after `identity`, before `domainToolboxes`:

```json
{
  "guildHall": {
    "type": "worker",
    "identity": { ... },
    "model": "opus",
    "domainToolboxes": [...]
  }
}
```

All current workers default to Opus. This makes the default explicit rather than relying on the fallback, which improves readability of the roster and makes cost implications visible in the package metadata.

**Tests**: Package discovery integration tests should confirm all workers are discovered with `model: "opus"`.

### Step 12: Validate against spec

Launch a sub-agent that reads the spec at `.lore/specs/infrastructure/model-selection.md`, reviews the implementation, and flags any requirements not met. This step is not optional.

Check each REQ-MODEL requirement against the code changes. Pay particular attention to:
- REQ-MODEL-9: Resolution order is correct (commission > worker > fallback)
- REQ-MODEL-4: Model list is defined once, not duplicated across validation sites
- REQ-MODEL-6: Backwards compatibility (no model field = opus)
- REQ-MODEL-18: Worker roster display (may be deferred, which is acceptable if documented)

If validation finds unmet requirements, categorize them:
- **Blocking**: Requirement is unmet and the implementation is incomplete. Fix before merging.
- **Deferred**: Requirement depends on unbuilt infrastructure (e.g., worker roster view). Document the deferral in the spec with a stub reference and create a tracking issue in `.lore/issues/`.
- **Spec mismatch**: The implementation is correct but the spec wording is ambiguous or contradictory. Flag for spec update.

## Delegation Guide

Steps requiring specialized expertise:
- **Step 10 (UI display)**: Frontend expertise. Follow existing CSS Modules patterns in `CommissionHeader` and `MeetingView`. Match the fantasy chrome aesthetic.
- **Step 12 (Validation)**: Fresh-eyes sub-agent with no implementation context. Reads spec and checks code.

Steps that pair well for parallel implementation:
- Steps 1-4 (foundation + activation) are a single dependency chain: do them sequentially.
- Step 5 depends on Steps 2-4 (needs `WorkerMetadata.model` to exist and activation to read it). Sequential after Step 4.
- Steps 6 and 7 (commission orchestrator + manager toolbox) can be done together since they touch related files. Both depend on Step 5.
- Step 8 (briefing generator) is independent of Steps 6-7 but depends on Step 5 (uses `resourceOverrides.model`).
- Step 9 (manager posture) is independent and can be done any time after Step 7.
- Step 10 (UI) depends on Steps 2 and 6 being complete (model field exists in metadata and commission data).
- Step 11 (worker packages) is independent and can be done any time after Step 2.

## Open Questions

**Spec amendments.** REQ-MODEL-7 requires amending REQ-COM-2 in the commissions spec. REQ-MODEL-10 requires amending REQ-SCOM-11 and REQ-SCOM-19 in the scheduled commissions spec. REQ-MODEL-16-18 reference view specs that don't mention model yet. These are documentation updates, not code blockers. They should happen alongside or after implementation but don't block starting.

**REQ-MODEL-10 verification.** Step 6 claims the scheduled commission spawner copies model "through existing copy mechanism." Verify this during implementation: the spawner must read `resource_overrides` from the template and pass the complete object (including `model`) to `createCommission`. If the spawner cherry-picks fields instead of passing the whole object, it will silently drop model. Check the actual copy code before assuming pass-through.

**Worker roster view.** REQ-MODEL-18 requires displaying model in the worker roster, but no roster view exists. The requirement is valid for when the roster is implemented. If Step 10 defers this part, the spec validation step should note it as an open item rather than a failure.

**Commission creation UI.** The spec doesn't have a requirement for selecting model in the commission creation form (CreateCommissionButton), only for displaying it in the commission view. The create form currently supports `maxTurns` and `maxBudgetUsd` in resource overrides. Adding model to the form is natural but not required by the spec. The implementer can include it if the form already handles resource overrides; otherwise, defer.
