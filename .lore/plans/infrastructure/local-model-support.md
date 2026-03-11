---
title: Local model support implementation
date: 2026-03-09
status: executed
tags: [local-models, ollama, model-selection, daemon, configuration]
modules: [daemon, sdk-runner, config, worker-activation, web-ui]
related:
  - .lore/specs/infrastructure/local-model-support.md
  - .lore/issues/local-model-support.md
  - .lore/brainstorm/model-selection.md
  - .lore/plans/infrastructure/model-selection.md
  - .lore/specs/infrastructure/model-selection.md
---

# Plan: Local Model Support

## Spec Reference

**Spec**: `.lore/specs/infrastructure/local-model-support.md`
**Issue**: `.lore/issues/local-model-support.md`
**Brainstorm**: `.lore/brainstorm/model-selection.md`
**Foundation**: `.lore/plans/infrastructure/model-selection.md` (already implemented)

Requirements addressed:
- REQ-LOCAL-1: ModelDefinition shape → Step 1
- REQ-LOCAL-2: Local names work identically to built-in names → Steps 2, 5
- REQ-LOCAL-3: config.yaml gains `models` array → Step 1
- REQ-LOCAL-4: AppConfig gains `models?: ModelDefinition[]` → Step 1
- REQ-LOCAL-5: Name collision with built-ins rejected → Step 1
- REQ-LOCAL-6: Duplicate names rejected → Step 1
- REQ-LOCAL-7: Invalid URL rejected at config load time → Step 1
- REQ-LOCAL-8: Model resolution order (built-in → local → error) → Step 2
- REQ-LOCAL-9: `resolveModel()` + `isValidModel(name, config?)` → Step 2
- REQ-LOCAL-10: `SdkQueryOptions.env` field → Step 3
- REQ-LOCAL-11: Local model sessions inject env vars → Step 3
- REQ-LOCAL-12: Built-in model sessions do not set env → Step 3
- REQ-LOCAL-13: Reachability check before session start → Step 3
- REQ-LOCAL-14: Reachability failure transitions per session type → Steps 3, 8
- REQ-LOCAL-15: Reachability check skipped for built-in models → Step 3
- REQ-LOCAL-16: Mid-session failure propagates through SDK error path → Step 3
- REQ-LOCAL-17: No automatic retry → Step 3 (no action needed; existing behavior)
- REQ-LOCAL-18: Local model failures prefixed in error messages → Step 3
- REQ-LOCAL-19: Local names valid at all levels of the resolution chain → Steps 2, 5
- REQ-LOCAL-20: Manager `create_commission` accepts local model names → Step 6
- REQ-LOCAL-21: Scheduled commission templates accept local model names → Step 5
- REQ-LOCAL-22: Meetings and mail use worker's default model if local → Step 3 (automatic via env injection)
- REQ-LOCAL-23: Package validation accepts configured local names → Step 4
- REQ-LOCAL-24: Validation error for unconfigured model includes hint → Step 4
- REQ-LOCAL-25: Commission view shows "(local)" suffix → Step 7
- REQ-LOCAL-26: Worker roster view shows "(local)" suffix → Step 7
- REQ-LOCAL-27: Commission creation UI lists local models grouped separately → Step 8
- REQ-LOCAL-28: Failure reason in UI includes model name, URL, and actionable hint → Step 3 + existing UI
- REQ-LOCAL-29: `GET /models` endpoint → Step 9
- REQ-LOCAL-30: Reachability in `/models` is best-effort → Step 9

## Codebase Context

The model-selection plan (`.lore/plans/infrastructure/model-selection.md`) is already implemented. That plan is the foundation:

**What exists today.** `VALID_MODELS = ["opus", "sonnet", "haiku"]` and `isValidModel()` live in `lib/types.ts:48-53`. `WorkerMetadata.model?: ModelName` is declared. `SessionPrepSpec.resourceOverrides?.model` flows through `prepareSdkSession` at `sdk-runner.ts:314` as `resolvedModel`. The commission orchestrator validates `resourceOverrides.model` via `isValidModel()` at `orchestrator.ts:1609`. The manager toolbox validates model names via `isValidModel()` at `toolbox.ts:665,999` and via `z.string().refine(isValidModel)` in the tool schema at `toolbox.ts:1125`.

**What this plan adds.** Local model support routes through the same `resolvedModel` variable. The key change: when `resolvedModel` maps to a local definition (from `config.models`), `prepareSdkSession` sets `options.env` with the Ollama/local server env vars instead of leaving the process environment alone. Every other piece of the system (model override chain, resource_overrides YAML, scheduled commission inheritance) already works — it's unaware of whether the name resolves to built-in or local.

**Config loading.** `lib/config.ts` defines `appConfigSchema` and `readConfig()`. The schema is Zod-based with `z.superRefine()` available for cross-field validation. `AppConfig` is the TypeScript type. Both live in separate files (`lib/types.ts` for types, `lib/config.ts` for schema + I/O).

**SdkQueryOptions.** Defined at `sdk-runner.ts:33-46`. Currently has no `env` field. The Claude Agent SDK's `query()` function accepts `env: Record<string, string | undefined>`. Adding it to `SdkQueryOptions` makes it flow through the same path as every other option.

**prepareSdkSession injection point.** Step 5 (build SDK query options) at `sdk-runner.ts:321-334` is where `resolvedModel` becomes `options.model`. Env injection happens here: after resolving the model name to a definition, set `options.model = definition.modelId` and `options.env = { ...process.env, ANTHROPIC_BASE_URL: ..., ANTHROPIC_AUTH_TOKEN: ..., ANTHROPIC_API_KEY: ... }`. The reachability check runs just before this.

**Package validation architecture.** `lib/packages.ts` defines `workerMetadataSchema` at line 52-64 with `model: z.string().refine(isValidModel, ...).optional()`. This schema is defined at module level with no access to config. Workers declaring local model names currently fail this refine and are skipped with a warning. The fix: widen the schema to accept any string (`z.string().optional()`), then add a separate post-discovery validation pass that checks each worker's model against both built-ins and `config.models`.

**Existing model name regex bug.** `updateCommission` at `orchestrator.ts:1508` uses `/^ {2}model: (\w+)$/m` to read existing model names from YAML. `\w` matches `[a-zA-Z0-9_]` but not hyphens. Local model names like `mistral-local` would not be read back correctly. This must be fixed as part of this plan (local names make the bug exploitable). The fix: change the capture group to `([^\s]+)`.

**Manager toolbox config access.** The toolbox is created with a deps bag that currently does not include `AppConfig`. The `services` object passed from the orchestrator (at `orchestrator.ts:1726-1734`) includes `commissionSession`, `gitOps`, `scheduleLifecycle`, `recordOps`, `packages`. To validate local model names at tool invocation time, the toolbox needs `config` in its deps. This requires adding `config` to the services bag or adding a separate toolbox dep.

**SessionPrepDeps reachability injection.** To keep `prepareSdkSession` testable, the reachability check should be injected as an optional dep: `checkReachability?: (url: string) => Promise<{ reachable: boolean; error?: string }>`. The default implementation does `fetch(url, { signal: AbortSignal.timeout(5000) })` and catches errors. Tests inject a mock.

## Implementation Steps

### Step 1: Config schema — ModelDefinition type and AppConfig extension

**Files**: `lib/types.ts`, `lib/config.ts`
**Addresses**: REQ-LOCAL-1, REQ-LOCAL-3, REQ-LOCAL-4, REQ-LOCAL-5, REQ-LOCAL-6, REQ-LOCAL-7

**lib/types.ts**: Add `ModelDefinition` interface after `AppConfig`. Add `models?: ModelDefinition[]` to `AppConfig`:

```typescript
export interface ModelDefinition {
  name: string;
  modelId: string;
  baseUrl: string;
  auth?: {
    token?: string;
    apiKey?: string;
  };
}

export interface AppConfig {
  projects: ProjectConfig[];
  models?: ModelDefinition[];
  settings?: Record<string, unknown>;
  maxConcurrentCommissions?: number;
  maxConcurrentMailReaders?: number;
}
```

**lib/config.ts**: Add `modelDefinitionSchema` and wire it into `appConfigSchema`. Use `z.superRefine()` on the array to catch cross-field errors that Zod can't express structurally:

```typescript
const modelAuthSchema = z.object({
  token: z.string().optional(),
  apiKey: z.string().optional(),
});

const modelDefinitionSchema = z.object({
  name: z.string().min(1).refine(
    (name) => /^[a-zA-Z0-9_-]+$/.test(name),
    { message: "Model name must contain only alphanumeric characters, hyphens, and underscores" },
  ),
  modelId: z.string().min(1),
  baseUrl: z.string().refine(
    (url) => { try { new URL(url); return true; } catch { return false; } },
    { message: "baseUrl must be a valid URL" },
  ),
  auth: modelAuthSchema.optional(),
});

// In appConfigSchema:
models: z.array(modelDefinitionSchema).optional().superRefine((models, ctx) => {
  if (!models) return;
  // Reject names that collide with built-in models
  for (const def of models) {
    if ((VALID_MODELS as readonly string[]).includes(def.name)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Model definition "${def.name}" conflicts with built-in model name "${def.name}"`,
      });
    }
  }
  // Reject duplicate names
  const seen = new Set<string>();
  for (const def of models) {
    if (seen.has(def.name)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate model name "${def.name}" in models array`,
      });
    }
    seen.add(def.name);
  }
}),
```

Note: `VALID_MODELS` must be imported from `lib/types.ts`. Watch for a circular import (`lib/types.ts` imports from `lib/config.ts` is fine; the reverse direction is what would create a cycle). The current `lib/config.ts` imports types from `lib/types.ts` at line 7, which is the correct direction.

**Tests** (`tests/lib/config.test.ts`):
- Valid model definition parses correctly
- Model name matching a built-in (`"opus"`) is rejected
- Model name with invalid characters (`"my:model"`, `"has space"`) is rejected
- Model name with valid characters (`"llama3"`, `"mistral-local"`, `"qwen2_5"`) passes
- Duplicate names in the array are rejected
- `baseUrl` without a scheme (`"localhost:11434"`) is rejected
- `baseUrl` with a valid URL (`"http://localhost:11434"`) passes
- `auth` is optional; absent `auth` results in `undefined`, not an error
- Existing tests without `models` key still pass

### Step 2: Model resolution — resolveModel() and isValidModel() update

**Files**: `lib/types.ts`
**Addresses**: REQ-LOCAL-2, REQ-LOCAL-8, REQ-LOCAL-9
**Depends on**: Step 1

Add `resolveModel()` after the existing `isValidModel()`. Update `isValidModel()` to accept optional config:

```typescript
export type ResolvedModel =
  | { type: "builtin"; name: ModelName }
  | { type: "local"; definition: ModelDefinition };

/**
 * Resolves a model name to either a built-in name or a local definition.
 * Throws with a descriptive error if the name is unrecognized.
 *
 * Resolution order (REQ-LOCAL-8):
 * 1. Built-in names (opus, sonnet, haiku)
 * 2. config.models definitions by name
 * 3. Unknown → throw
 */
export function resolveModel(name: string, config?: AppConfig): ResolvedModel {
  if ((VALID_MODELS as readonly string[]).includes(name)) {
    return { type: "builtin", name: name as ModelName };
  }
  const local = config?.models?.find((m) => m.name === name);
  if (local) {
    return { type: "local", definition: local };
  }
  const hint = config?.models?.length
    ? ` Configured local models: ${config.models.map((m) => m.name).join(", ")}.`
    : "";
  throw new Error(
    `Unknown model "${name}". Valid built-in models: ${VALID_MODELS.join(", ")}.${hint}`,
  );
}

/**
 * Returns true if the model name resolves to a known model (built-in or
 * configured local). When config is omitted, only built-in names pass.
 */
export function isValidModel(value: string, config?: AppConfig): boolean {
  try {
    resolveModel(value, config);
    return true;
  } catch {
    return false;
  }
}
```

The existing `isValidModel` signature (`value: string): value is ModelName`) must change. The return type can no longer be `value is ModelName` because local model names are not `ModelName`. Change to `boolean`. Any call site that used the type predicate form needs review (there are few; the main ones are the Zod refine in `workerMetadataSchema` and the orchestrator dispatch check).

**Tests** (`tests/lib/types.test.ts` or new `tests/lib/model-resolution.test.ts`):
- `resolveModel("opus")` → `{ type: "builtin", name: "opus" }`
- `resolveModel("llama3", configWithLlama3)` → `{ type: "local", definition: ... }`
- `resolveModel("unknown")` throws with message containing "Unknown model"
- `resolveModel("llama3")` (no config) throws
- `isValidModel("opus")` → `true`
- `isValidModel("llama3", configWithLlama3)` → `true`
- `isValidModel("llama3")` (no config) → `false`
- `isValidModel("unknown")` → `false`

### Step 3: SDK session env injection and reachability check

**Files**: `daemon/lib/agent-sdk/sdk-runner.ts`
**Addresses**: REQ-LOCAL-10, REQ-LOCAL-11, REQ-LOCAL-12, REQ-LOCAL-13, REQ-LOCAL-14, REQ-LOCAL-15, REQ-LOCAL-16, REQ-LOCAL-18
**Depends on**: Step 2

Three changes in this file:

**Add `env` to `SdkQueryOptions`** (after `resume`, around line 45):

```typescript
env?: Record<string, string | undefined>;
```

**Add `checkReachability` to `SessionPrepDeps`** (after `triggerCompaction?`, around line 104):

```typescript
checkReachability?: (url: string) => Promise<{ reachable: boolean; error?: string }>;
```

The default when absent: a fetch-based implementation inline in `prepareSdkSession`. This avoids changing every call site that constructs `SessionPrepDeps` with a required field.

**Update `prepareSdkSession`**, specifically step 5 (build options, around line 311):

```typescript
// Resolve model to built-in or local definition
const resolvedModelResult = resolvedModel
  ? resolveModel(resolvedModel, spec.config)
  : undefined;

// For local models: reachability check then env injection
if (resolvedModelResult?.type === "local") {
  const { definition } = resolvedModelResult;
  const doCheck = deps.checkReachability ?? defaultCheckReachability;
  const check = await doCheck(definition.baseUrl);
  if (!check.reachable) {
    return {
      ok: false,
      error: `Local model "${definition.name}" at ${definition.baseUrl} is not reachable: ${check.error ?? "connection failed"}`,
    };
  }
}

// Build options
const finalModelId = resolvedModelResult?.type === "local"
  ? resolvedModelResult.definition.modelId
  : resolvedModel;

const localEnv = resolvedModelResult?.type === "local"
  ? {
      ...process.env,
      ANTHROPIC_BASE_URL: resolvedModelResult.definition.baseUrl,
      ANTHROPIC_AUTH_TOKEN: resolvedModelResult.definition.auth?.token ?? "ollama",
      ANTHROPIC_API_KEY: resolvedModelResult.definition.auth?.apiKey ?? "",
    }
  : undefined;

const options: SdkQueryOptions = {
  // ...existing fields...
  ...(finalModelId ? { model: finalModelId } : {}),
  ...(localEnv ? { env: localEnv } : {}),
  // ...rest of existing fields...
};
```

Add `defaultCheckReachability` as a module-level function:

```typescript
async function defaultCheckReachability(
  url: string,
): Promise<{ reachable: boolean; error?: string }> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(5000) });
    return { reachable: true };
  } catch (err: unknown) {
    return { reachable: false, error: errorMessage(err) };
  }
}
```

Any HTTP response (including 4xx or 5xx) counts as reachable — a server that's running but returns an error is still reachable. Only network-level failures (connection refused, timeout) count as unreachable. The `defaultCheckReachability` function handles both cases via the try/catch.

REQ-LOCAL-18 (error prefix for local model failures) is partially covered: the `{ ok: false }` return from the reachability check includes the model name and URL. Mid-session failures (REQ-LOCAL-16) come from the SDK's error path and naturally include connection-level details; no additional wrapping is needed because the session type and model context are already in commission logs.

**Tests** (`tests/daemon/lib/agent-sdk/sdk-runner.test.ts`):
- Local model sessions: `options.env` contains `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`
- Built-in model sessions: `options.env` is absent
- Local model session: `options.model` is set to `definition.modelId`, not `definition.name`
- Reachability check succeeds (mock `checkReachability` returns `{ reachable: true }`): session proceeds
- Reachability check fails (mock returns `{ reachable: false, error: "connection refused" }`): `{ ok: false }` with message naming model name and URL
- Auth override: custom `auth.token` appears in env; omitted `auth` uses `"ollama"` default
- Built-in model: `checkReachability` is never called

### Step 4: Package validation with config

**Files**: `lib/packages.ts`
**Addresses**: REQ-LOCAL-23, REQ-LOCAL-24
**Depends on**: Step 2

Two changes:

**Widen the model refine in `workerMetadataSchema`** (line 57). The current refine (`isValidModel`) rejects local model names because it has no config. Change to accept any non-empty string and let post-discovery validation catch bad names:

```typescript
// Before:
model: z.string().refine(isValidModel, { message: "Invalid model name" }).optional(),

// After:
model: z.string().min(1).optional(),
```

**Add `validatePackageModels()` as an exported function**. This runs post-discovery with config available:

```typescript
/**
 * Validates that each worker's declared model is either a built-in name or
 * a configured local model. Returns the packages that pass, logging a warning
 * for each failure (same behavior as schema validation failures).
 */
export function validatePackageModels(
  packages: DiscoveredPackage[],
  config: AppConfig,
): DiscoveredPackage[] {
  return packages.filter((pkg) => {
    if (!("identity" in pkg.metadata)) return true; // toolbox, skip
    const worker = pkg.metadata as WorkerMetadata;
    if (!worker.model) return true; // no model declared, skip
    if (isValidModel(worker.model, config)) return true;
    console.warn(
      `[packages] Worker "${worker.identity.name}" references model "${worker.model}" ` +
        `which is not a built-in model and not defined in config.yaml. ` +
        `Add a model definition to config.yaml or use a built-in model (${VALID_MODELS.join(", ")}). ` +
        `Package skipped.`,
    );
    return false;
  });
}
```

The function is called from `createProductionApp` after `discoverPackages` (Step 8). It is not called inside `discoverPackages` itself to preserve its current signature and avoid coupling package discovery to config loading.

**Tests** (`tests/lib/packages.test.ts`):
- Worker with `model: "haiku"` passes validation with any config
- Worker with `model: "llama3"` passes validation when config includes a `"llama3"` definition
- Worker with `model: "llama3"` is filtered and logged when config has no `"llama3"` definition
- Worker with no `model` field passes regardless of config
- Toolbox packages (no `identity` in metadata) pass regardless

### Step 5: Commission orchestrator — local model validation at dispatch

**Files**: `daemon/services/commission/orchestrator.ts`
**Addresses**: REQ-LOCAL-19, REQ-LOCAL-21
**Depends on**: Step 2

Two changes in this file:

**Update `isValidModel` call at dispatch** (`orchestrator.ts:1609`). The current call is `isValidModel(resourceOverrides.model)`. After Step 2, `isValidModel` accepts an optional second config parameter. Pass `config`:

```typescript
// Before:
if (resourceOverrides.model !== undefined && !isValidModel(resourceOverrides.model)) {

// After:
if (resourceOverrides.model !== undefined && !isValidModel(resourceOverrides.model, config)) {
```

Where `config` is the `deps.config` closure variable (already in scope throughout the orchestrator).

**Fix the model name regex in `updateCommission`** (`orchestrator.ts:1508`). The current pattern `/ {2}model: (\w+)/m` uses `\w` (no hyphens). Local names like `mistral-local` won't be read back correctly. Change the capture group:

```typescript
// Before:
const existingModelMatch = raw.match(/^ {2}model: (\w+)$/m);

// After:
const existingModelMatch = raw.match(/^ {2}model: ([^\s]+)$/m);
```

Also import `resolveModel` from `@/lib/types` if needed for future use (not strictly required for this step, but anticipated by Step 3's integration).

**Tests**: Verify that dispatching a commission with a configured local model name passes validation. Verify that dispatching with an unconfigured name still throws. Verify that `updateCommission` correctly reads and preserves a model name containing a hyphen.

### Step 6: Manager toolbox — local model validation

**Files**: `daemon/services/manager/toolbox.ts`
**Addresses**: REQ-LOCAL-20
**Depends on**: Step 2

Three changes:

**Add `config` to the toolbox deps.** The `GuildHallToolServices` type is defined at `daemon/lib/toolbox-utils.ts:28-34` with fields: `commissionSession`, `gitOps`, `scheduleLifecycle?`, `recordOps?`, `packages?`. Add `config: AppConfig` to this type. The services object is constructed in **two** places that both need updating:
1. Commission orchestrator at `orchestrator.ts:1726-1734`
2. Meeting orchestrator at `meeting/orchestrator.ts:470-478`

**Replace `isValidModel` runtime checks** at `toolbox.ts:665` and `toolbox.ts:999`. These now call `isValidModel(name, deps.config)` (or `services.config`) instead of the no-config form. The error text should name the valid built-in models and hint that local models require a config entry:

```typescript
// Before:
if (args.resourceOverrides?.model && !isValidModel(args.resourceOverrides.model)) {
  return { content: [{ type: "text", text: `Invalid model name: "...". Valid models: opus, sonnet, haiku` }], isError: true };
}

// After:
if (args.resourceOverrides?.model && !isValidModel(args.resourceOverrides.model, services.config)) {
  return { content: [{ type: "text", text: `Invalid model name: "...". Valid built-in models: opus, sonnet, haiku. Local models must be defined in config.yaml.` }], isError: true };
}
```

**Replace the Zod schema refine** at `toolbox.ts:1125`. The refine uses `isValidModel` without config, which will reject local names at Zod parse time before the handler runs. Two options: (A) remove the refine and rely on the runtime check, or (B) make the refine config-aware. Option A is simpler and consistent with the updated handler. The Zod schema becomes `model: z.string().optional()` without a refine.

**Tests**: Verify `create_commission` accepts a local model name when that name is in config.models. Verify it rejects an unconfigured name with the updated hint message.

### Step 7: UI provenance indicators

**Files**: web components for commission and worker views
**Addresses**: REQ-LOCAL-25, REQ-LOCAL-26, REQ-LOCAL-28
**Depends on**: Steps 1, 5

This step has two parts.

**Commission view (REQ-LOCAL-25, REQ-LOCAL-28).** The commission page server component reads `commission.resource_overrides.model` and the worker's default model. To determine provenance, resolve against `config.models`. If the resolved model is local, display `"llama3 (local)"` and show the base URL as a tooltip. If the commission failed due to a local model error, the failure reason already contains the model name and URL (from the `{ ok: false }` return in Step 3).

The page component needs access to `AppConfig` (for `config.models`). Since it's a server component, import `readConfig()` from `@/lib/config` and call it directly. Pass the resolved model info as a prop to the display component.

**Worker roster (REQ-LOCAL-26).** Wherever worker packages are listed in the UI, add a model badge. If `worker.model` resolves to a local definition, show `"<name> (local)"`. Same resolution pattern: call `resolveModel(worker.model, config)` server-side and pass the result as a prop.

**Tests**: Component tests or visual verification. No business logic to unit test here.

### Step 8: Daemon wiring — package validation and model validation in production startup

**Files**: `daemon/app.ts`
**Addresses**: REQ-LOCAL-22 (automatic via env injection), REQ-LOCAL-23 (wires Step 4)
**Depends on**: Steps 4, 6

Two changes in `createProductionApp`:

**Wire `validatePackageModels`** after `discoverPackages`. The existing line:

```typescript
const discoveredPackages = await discoverPackages(scanPaths);
```

becomes:

```typescript
const { validatePackageModels } = await import("@/lib/packages");
const rawPackages = await discoverPackages(scanPaths);
const discoveredPackages = validatePackageModels(rawPackages, config);
```

This applies the config-aware model check to all discovered packages before prepending the manager package. Workers with unconfigured local model names are dropped here.

**Add `config` to the services bag** passed to the orchestrator and through to the manager toolbox (supporting Step 6). The orchestrator's `CommissionOrchestratorDeps` already has `config`; the services object assembled at `orchestrator.ts:1726-1734` is what needs updating. Add `config` to the `GuildHallToolServices` type (in `daemon/lib/toolbox-utils.ts` or wherever it's defined) and include it in the production services bag.

### Step 9: /models endpoint

**Files**: `daemon/routes/models.ts` (new), `daemon/app.ts`
**Addresses**: REQ-LOCAL-29, REQ-LOCAL-30
**Depends on**: Step 1

**Create `daemon/routes/models.ts`**:

```typescript
import { Hono } from "hono";
import type { AppConfig } from "@/lib/types";
import { VALID_MODELS } from "@/lib/types";

export interface ModelsRouteDeps {
  config: AppConfig;
}

export function createModelsRoutes(deps: ModelsRouteDeps): Hono {
  const routes = new Hono();

  routes.get("/models", async (c) => {
    const localModels = deps.config.models ?? [];

    const localWithReachability = await Promise.all(
      localModels.map(async (def) => {
        let reachable = false;
        try {
          await fetch(def.baseUrl, { signal: AbortSignal.timeout(1000) });
          reachable = true;
        } catch {
          reachable = false;
        }
        return { name: def.name, modelId: def.modelId, baseUrl: def.baseUrl, reachable };
      }),
    );

    return c.json({
      builtin: VALID_MODELS.map((name) => ({ name })),
      local: localWithReachability,
    });
  });

  return routes;
}
```

The 1-second timeout (vs 5 seconds for session start) is per REQ-LOCAL-29: this is a dashboard health check, not a blocking session gate.

**Wire into `createApp` and `createProductionApp`** in `daemon/app.ts`. Add `modelsConfig?: AppConfig` to `AppDeps`, mount the route when present, and pass `config` in `createProductionApp`.

**Tests**: Verify response shape. Mock the fetch calls: local server up → `reachable: true`, connection refused → `reachable: false`. Verify built-in models always appear in the response.

### Step 10: Commission creation UI model selector

**Files**: Commission creation component
**Addresses**: REQ-LOCAL-27
**Depends on**: Step 9

The commission creation UI (wherever `CreateCommissionButton` or equivalent lives) currently allows selecting `maxTurns` and `maxBudgetUsd`. For local model support, add a model selector that calls `GET /models` and groups results: built-in models listed first, local models listed second with a "(local)" label. The selected model is sent as `resourceOverrides.model` in the commission creation request.

If the commission creation form doesn't yet have a resource overrides section, this step may require creating one. Assess the current form's scope before implementing; if it requires significant UI work, consult the implementer.

**Tests**: Visual verification that local models appear grouped and labeled.

### Step 11: Spec validation

Launch a sub-agent with fresh context. It reads:
- `.lore/specs/infrastructure/local-model-support.md`
- The implementation files changed in Steps 1–10

Check every REQ-LOCAL requirement for coverage. Pay particular attention to:
- REQ-LOCAL-9: `isValidModel` backwards compatibility when config is omitted
- REQ-LOCAL-14: All four session type failure paths (commission, meeting, mail, briefing)
- REQ-LOCAL-22: Meetings and mail using local model workers — does env injection happen automatically?
- REQ-LOCAL-23/24: Package validation error messages match spec wording

If any requirements are unmet, categorize:
- **Blocking**: Implementation incomplete. Fix before merging.
- **Deferred**: Depends on unbuilt infrastructure. Document and create a tracking issue.
- **Spec mismatch**: Implementation correct, spec wording ambiguous. Flag for spec update.

## Delegation Guide

Steps requiring specialized expertise:
- **Step 7 (UI provenance)**: Frontend (CSS Modules, Next.js server components). Match the existing commission header and worker display patterns.
- **Step 10 (commission creation UI)**: Frontend. Assess current form scope before starting.
- **Step 11 (spec validation)**: Fresh-eyes sub-agent with no implementation context.

Steps that pair well for parallel implementation:
- Steps 1 and 2 form a dependency chain (types before resolution). Do sequentially.
- Step 3 depends on Step 2 (needs `resolveModel`). Sequential after Step 2.
- Steps 4 and 5 both depend on Step 2 and are independent of each other. Parallel after Step 2.
- Step 6 depends on Step 2 and is independent of Steps 4 and 5. Can run parallel to them.
- Step 8 depends on Steps 4 and 6 (wires both). Sequential after both.
- Step 9 depends only on Step 1 (needs `ModelDefinition`). Can start early.
- Steps 7 and 10 depend on Steps 1/5 and Steps 1/9 respectively. UI work at the end.
- Step 11 must be last.

A focused commission breakdown:
1. **Commission A**: Steps 1, 2, 3 — types + resolution + sdk runner (core functional change)
2. **Commission B**: Steps 4, 5, 6 — validation across package discovery, orchestrator, toolbox
3. **Commission C**: Steps 8, 9 — daemon wiring + /models endpoint
4. **Commission D**: Steps 7, 10 — UI provenance and commission creation
5. **Commission E**: Step 11 — spec validation

Commission A must complete before B, C. Commission B and C can start in parallel after A. D after B and C. E after D.

## Resolved Questions

Questions from the draft plan, verified against the codebase during the meeting on 2026-03-09.

**Meeting orchestrator (REQ-LOCAL-14).** Verified. Checks `{ ok: false }` at `meeting/orchestrator.ts:595-600` and yields an SSE error event. The meeting enters "open" status before `prepareSdkSession` runs, so on failure the meeting stays "open" with no active session. This is acceptable: the user can retry via `sendMessage`, and the error is surfaced immediately via the SSE stream. No code change needed.

**Mail reader (REQ-LOCAL-14).** Verified with a gap. Checks `{ ok: false }` at `mail/orchestrator.ts:377-380` and throws, caught at line 397. The sender is woken with an error prompt. **Gap**: no timeline event is recorded in the commission artifact when the reader's `prepareSdkSession` fails. The failure is console-logged but not observable in the artifact. **Action**: Step 3 or Step 8 should add a timeline append (e.g., `mail_reader_failed`) in the catch block at `mail/orchestrator.ts:397-400` before calling `wakeCommission`. This is a small change (one `appendTimeline` call) and should be included in the commission that handles Step 3.

**Briefing generator (REQ-LOCAL-14).** Verified. Correctly handles `{ ok: false }` at `briefing-generator.ts:395-397` and falls back to `generateTemplateBriefing()`. Tested at lines 326-376. No action needed.

**resolvedModel guard.** Verified. Already guarded via conditional spread at `sdk-runner.ts:327`: `...(resolvedModel ? { model: resolvedModel } : {})`. The injection code in Step 3 should call `resolveModel()` inside the same truthiness check. Confirmed safe.

**GuildHallToolServices.** Verified. Type defined at `daemon/lib/toolbox-utils.ts:28-34`. Five fields: `commissionSession`, `gitOps`, `scheduleLifecycle?`, `recordOps?`, `packages?`. Constructed in two places: commission orchestrator (`orchestrator.ts:1726-1734`) and meeting orchestrator (`meeting/orchestrator.ts:470-478`). Both need `config` added. Updated in Step 6.

**Circular import.** Verified safe. `lib/config.ts` imports from `lib/types.ts` (one-way). `lib/types.ts` imports only from `@anthropic-ai/claude-agent-sdk`. Adding `resolveModel()` to `lib/types.ts` with `AppConfig` (already defined there) creates no cycle.

**Model name characters.** Resolved: restrict to `[a-zA-Z0-9_-]+` via a `.refine()` on `modelDefinitionSchema.name`. Added to Step 1 and documented in the spec (REQ-LOCAL-1).

**Spec amendments.** Done. Model-selection spec updated with cross-references to REQ-LOCAL-2, REQ-LOCAL-8, REQ-LOCAL-9, REQ-LOCAL-19, REQ-LOCAL-22.
