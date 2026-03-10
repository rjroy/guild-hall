---
title: System model defaults implementation
date: 2026-03-10
status: draft
tags: [configuration, model-selection, daemon, memory-compaction, meeting-notes, briefing-generator, guild-master]
modules: [config, daemon, memory-compaction, notes-generator, briefing-generator, manager]
related:
  - .lore/specs/system-model-defaults.md
  - .lore/specs/model-selection.md
  - .lore/specs/local-model-support.md
  - .lore/plans/local-model-support.md
  - .lore/plans/model-selection.md
---

# Plan: System Model Defaults

## Spec Reference

**Spec**: `.lore/specs/system-model-defaults.md`

Requirements addressed:
- REQ-SYS-MODEL-1: `systemModels` optional key in config → Step 1
- REQ-SYS-MODEL-2: `AppConfig.systemModels?: SystemModels` type → Step 1
- REQ-SYS-MODEL-3: Zod validates non-empty strings, rejects empty → Step 1
- REQ-SYS-MODEL-4: Valid values are built-in and local model names, lazy resolution → Steps 2, 3, 4, 5
- REQ-SYS-MODEL-5: Memory compaction reads from `config.systemModels?.memoryCompaction` → Step 2
- REQ-SYS-MODEL-6: Meeting notes reads from `config.systemModels?.meetingNotes` → Step 3
- REQ-SYS-MODEL-7: Briefing generator reads from `config.systemModels?.briefing` → Step 4
- REQ-SYS-MODEL-8: Guild Master reads from `config.systemModels?.guildMaster` → Step 5
- REQ-SYS-MODEL-9: Services without config in deps gain optional `config?: AppConfig` → Steps 2, 3
- REQ-SYS-MODEL-10: Guild Master factory receives config at call site in `daemon/app.ts` → Step 5

## Codebase Context

This plan builds on two already-implemented foundations: the model-selection plan (`.lore/plans/model-selection.md`) and the local-model-support plan (`.lore/plans/local-model-support.md`). Both are fully implemented.

**What exists.** `AppConfig` in `lib/types.ts:25-31` has `projects`, `models?`, `settings?`, `maxConcurrentCommissions?`, and `maxConcurrentMailReaders?` — no `systemModels` field yet. The `appConfigSchema` in `lib/config.ts:50-81` validates the same shape. The `models` array and `modelDefinitionSchema` are present from local-model-support. `resolveModel(name, config?)` lives in `lib/types.ts:76` and handles both built-in and local model names. `QueryOptions` is a re-export of `SdkQueryOptions` from `sdk-runner.ts` and already carries `env?: Record<string, string | undefined>` (from local-model-support Step 3 at `sdk-runner.ts:48`).

**The four hardcoded model strings.** Each is a small, isolated change:

1. **Memory compaction** (`daemon/services/memory-compaction.ts:291`): `model: "sonnet"` inside the options object passed to `deps.compactFn()`. `CompactionDeps` has only `guildHallHome` and `compactFn` — no config.

2. **Meeting notes** (`daemon/services/meeting/notes-generator.ts:163`): `model: "sonnet"` inside the options object passed to `deps.queryFn()`. `NotesGeneratorDeps` has only `guildHallHome?` and `queryFn?` — no config.

3. **Briefing generator** (`daemon/services/briefing-generator.ts:385`): `model: "sonnet"` inside `resourceOverrides` on the `SessionPrepSpec`. `BriefingGeneratorDeps` already carries `config: AppConfig` — no DI change needed.

4. **Guild Master** (`daemon/services/manager/worker.ts:116`): `model: "opus" as ModelName` hard-set in `WorkerMetadata` inside `createManagerPackage()`. The function takes no parameters; it's called at `daemon/app.ts:167` with no arguments.

**Production call sites for compaction.** `triggerCompaction` is called in two places with `CompactionDeps`:
- `daemon/app.ts:231-243`: inline closure that builds `{ guildHallHome, compactFn: queryFn! }` — `config` is in scope here.
- `daemon/services/meeting/orchestrator.ts:414-421`: same pattern inside `createMeetingSession` — `deps.config` is in scope here.

**Notes generation call site.** `generateMeetingNotes` is called at `meeting/orchestrator.ts:1126-1131` with `{ guildHallHome: ghHome, queryFn: deps.notesQueryFn }` — `deps.config` is in scope here.

**Local model resolution for direct-calling services.** Memory compaction and meeting notes invoke their query functions directly, bypassing `prepareSdkSession`. They must call `resolveModel()` inline to handle local model names: resolve the name, set `model` to `definition.modelId` for local models, and set `env` with the Ollama env vars. The `env` field is already on `QueryOptions` (`SdkQueryOptions` re-export at `meeting/orchestrator.ts:98`). For the briefing generator and Guild Master, resolution happens automatically through `prepareSdkSession` — no inline resolution needed.

## Implementation Steps

### Step 1: Config schema — SystemModels type and AppConfig extension

**Files**: `lib/types.ts`, `lib/config.ts`
**Addresses**: REQ-SYS-MODEL-1, REQ-SYS-MODEL-2, REQ-SYS-MODEL-3
**Depends on**: nothing

**lib/types.ts**: Add a `SystemModels` interface after `AppConfig`, then add `systemModels?: SystemModels` to `AppConfig`:

```typescript
export interface SystemModels {
  memoryCompaction?: string;
  meetingNotes?: string;
  briefing?: string;
  guildMaster?: string;
}

export interface AppConfig {
  projects: ProjectConfig[];
  models?: ModelDefinition[];
  systemModels?: SystemModels;
  settings?: Record<string, unknown>;
  maxConcurrentCommissions?: number;
  maxConcurrentMailReaders?: number;
}
```

**lib/config.ts**: Add `systemModelsSchema` and wire it into `appConfigSchema`. Use `z.string().min(1)` for each field — empty strings are rejected at parse time (REQ-SYS-MODEL-3):

```typescript
const systemModelsSchema = z.object({
  memoryCompaction: z.string().min(1).optional(),
  meetingNotes: z.string().min(1).optional(),
  briefing: z.string().min(1).optional(),
  guildMaster: z.string().min(1).optional(),
}).optional();

// In appConfigSchema, after models:
systemModels: systemModelsSchema,
```

No cross-field validation needed here. REQ-SYS-MODEL-4 specifies lazy resolution — errors surface when the service is invoked, not at config parse time.

**Tests** (add to `tests/lib/config.test.ts`):
- Config with `systemModels` section parses without error; all four fields are present
- All four `systemModels` fields are independently optional — configs with one, two, or three fields parse correctly
- An empty string for any field is rejected at parse time with a validation error
- Absent `systemModels` key returns `config.systemModels === undefined` (no behavior change)
- Existing tests pass unchanged (no regression)

---

### Step 2: Memory compaction model

**Files**: `daemon/services/memory-compaction.ts`, `daemon/app.ts`, `daemon/services/meeting/orchestrator.ts`
**Addresses**: REQ-SYS-MODEL-5, REQ-SYS-MODEL-9 (compaction half)
**Depends on**: Step 1

**daemon/services/memory-compaction.ts**: Add `config?: AppConfig` to `CompactionDeps` (import `AppConfig` from `@/lib/types`). In `compactMemories` (the function that builds the SDK options at line 291), resolve the configured model before constructing the options object:

```typescript
import { resolveModel } from "@/lib/types";

// At the top of compactMemories, after reading guildHallHome:
const rawModelName = deps.config?.systemModels?.memoryCompaction ?? "sonnet";
let compactionModel: string = rawModelName;
let compactionEnv: Record<string, string | undefined> | undefined;

const resolved = resolveModel(rawModelName, deps.config);
if (resolved.type === "local") {
  const { definition } = resolved;
  compactionModel = definition.modelId;
  compactionEnv = {
    ...process.env,
    ANTHROPIC_BASE_URL: definition.baseUrl,
    ANTHROPIC_AUTH_TOKEN: definition.auth?.token ?? "ollama",
    ANTHROPIC_API_KEY: definition.auth?.apiKey ?? "",
  };
}

// Then in the options object (replacing the hardcoded "sonnet"):
options: {
  systemPrompt: "...",
  maxTurns: 1,
  model: compactionModel,
  ...(compactionEnv ? { env: compactionEnv } : {}),
  permissionMode: "dontAsk",
  settingSources: [],
  mcpServers: {},
  allowedTools: [],
},
```

If `resolveModel` throws (unrecognized name), the error propagates into the existing `try/catch` that already handles SDK failures as non-fatal. The compaction is skipped and retried on next activation — consistent with the existing failure behavior.

**daemon/app.ts**: At the `triggerCompaction` closure (line 231-243), add `config` to the `CompactionDeps` object:

```typescript
void triggerCompaction(workerName, projectName, {
  guildHallHome: opts.guildHallHome,
  compactFn: queryFn!,
  config,  // config is already in scope in createProductionApp
});
```

**daemon/services/meeting/orchestrator.ts**: At the `triggerCompaction` call (line 416), add `config: deps.config` to the deps object. `deps.config` is already in scope in `createMeetingSession`:

```typescript
void triggerCompaction(workerName, projectName, {
  guildHallHome: opts.guildHallHome,
  compactFn: deps.queryFn!,
  config: deps.config,
});
```

**Tests** (new or extended in `tests/daemon/services/memory-compaction.test.ts`):
- When `config.systemModels.memoryCompaction` is set to `"haiku"`, the `compactFn` is called with `options.model === "haiku"`
- When `config.systemModels.memoryCompaction` is absent, the `compactFn` is called with `options.model === "sonnet"` (fallback)
- When `config` is absent from deps entirely, behavior is unchanged (`model: "sonnet"`)
- When `config.systemModels.memoryCompaction` is a configured local model name, the `compactFn` receives `options.model === definition.modelId` and `options.env` containing `ANTHROPIC_BASE_URL`
- When `config.systemModels.memoryCompaction` is an unrecognized name, the error is caught and compaction is skipped non-fatally

---

### Step 3: Meeting notes model

**Files**: `daemon/services/meeting/notes-generator.ts`, `daemon/services/meeting/orchestrator.ts`
**Addresses**: REQ-SYS-MODEL-6, REQ-SYS-MODEL-9 (notes half)
**Depends on**: Step 1

**daemon/services/meeting/notes-generator.ts**: Add `config?: AppConfig` to `NotesGeneratorDeps` (import `AppConfig` and `resolveModel` from `@/lib/types`). In `generateMeetingNotes`, resolve the configured model before constructing the options object (replacing the hardcoded `"sonnet"` at line 163):

```typescript
import { resolveModel } from "@/lib/types";

// In generateMeetingNotes, before constructing the options object:
const rawModelName = deps.config?.systemModels?.meetingNotes ?? "sonnet";
let notesModel: string = rawModelName;
let notesEnv: Record<string, string | undefined> | undefined;

try {
  const resolved = resolveModel(rawModelName, deps.config);
  if (resolved.type === "local") {
    const { definition } = resolved;
    notesModel = definition.modelId;
    notesEnv = {
      ...process.env,
      ANTHROPIC_BASE_URL: definition.baseUrl,
      ANTHROPIC_AUTH_TOKEN: definition.auth?.token ?? "ollama",
      ANTHROPIC_API_KEY: definition.auth?.apiKey ?? "",
    };
  }
} catch (err: unknown) {
  return { success: false, reason: `Notes generation failed: unrecognized model "${rawModelName}"` };
}

// Then in the options object:
options: {
  systemPrompt: "...",
  maxTurns: 1,
  model: notesModel,
  ...(notesEnv ? { env: notesEnv } : {}),
  permissionMode: "dontAsk",
  settingSources: [],
},
```

Unlike compaction (which is fire-and-forget and silently skips on failure), notes generation returns a `NotesResult` discriminated union. An unrecognized model name should return `{ success: false, reason: ... }` rather than throwing.

**daemon/services/meeting/orchestrator.ts**: At the `generateMeetingNotes` call (line 1126-1131), pass `deps.config` in the deps object:

```typescript
notesResult = await generateMeetingNotes(
  meetingId,
  meeting.worktreeDir,
  meeting.workerName,
  { guildHallHome: ghHome, queryFn: deps.notesQueryFn, config: deps.config },
);
```

`deps.config` is already in scope in `createMeetingSession`.

**Tests** (new or extended in `tests/daemon/services/meeting/notes-generator.test.ts`):
- When `config.systemModels.meetingNotes` is set to `"haiku"`, the `queryFn` is called with `options.model === "haiku"`
- When `config.systemModels.meetingNotes` is absent, the `queryFn` is called with `options.model === "sonnet"` (fallback)
- When `config` is absent from deps entirely, behavior is unchanged (`model: "sonnet"`)
- When `config.systemModels.meetingNotes` is a configured local model name, `queryFn` receives `options.model === definition.modelId` and `options.env` containing `ANTHROPIC_BASE_URL`
- When `config.systemModels.meetingNotes` is an unrecognized name, the function returns `{ success: false, reason: "..." }` containing the model name

---

### Step 4: Briefing generator model

**Files**: `daemon/services/briefing-generator.ts`
**Addresses**: REQ-SYS-MODEL-7
**Depends on**: Step 1

`BriefingGeneratorDeps` already carries `config: AppConfig`, so no DI change is needed. The change is purely at the `SessionPrepSpec` construction point around line 385.

Replace the hardcoded `model: "sonnet"` in `resourceOverrides`:

```typescript
resourceOverrides: {
  maxTurns: 200,
  model: deps.config.systemModels?.briefing ?? "sonnet",
},
```

The value (which could be a built-in name or a local model name) flows into `prepareSdkSession` as `spec.resourceOverrides.model`, where `resolveModel()` already handles the resolution through the local-model-support implementation. No inline resolution needed here.

**Tests** (add to `tests/daemon/services/briefing-generator.test.ts` or equivalent):
- When `config.systemModels.briefing` is set to `"haiku"`, the `SessionPrepSpec` has `resourceOverrides.model === "haiku"`
- When `config.systemModels.briefing` is absent, `resourceOverrides.model === "sonnet"` (fallback)
- When `config.systemModels.briefing` is a local model name, the value passes through to `prepareSdkSession` unchanged (resolution is the runner's responsibility)

---

### Step 5: Guild Master model

**Files**: `daemon/services/manager/worker.ts`, `daemon/app.ts`
**Addresses**: REQ-SYS-MODEL-8, REQ-SYS-MODEL-10
**Depends on**: Step 1

**daemon/services/manager/worker.ts**: Update `createManagerPackage()` to accept an optional `config?: AppConfig` parameter (import `AppConfig` from `@/lib/types`):

```typescript
export function createManagerPackage(config?: AppConfig): DiscoveredPackage {
  const metadata: WorkerMetadata = {
    // ...
    model: (config?.systemModels?.guildMaster ?? "opus") as ModelName,
    // ...
  };
  // ...
}
```

The cast to `ModelName` is necessary because `ModelName` is the union `"opus" | "sonnet" | "haiku"`, but the configured value could be a local model name (a plain string). Use `as ModelName` with a comment explaining why the cast is safe here: the value will be validated when the worker is activated through the normal session prep pipeline, which calls `resolveModel()`. For built-in names, the value is already a valid `ModelName`. For local names, the cast is technically a lie at the type level but the runtime validation catches bad names.

Alternatively, if the `WorkerMetadata.model` type is widened to `string` by a future refactor, the cast is unnecessary. Use a comment to mark this:

```typescript
// Cast: model may be a local name string at this point.
// prepareSdkSession resolves it via resolveModel() at activation time.
model: (config?.systemModels?.guildMaster ?? "opus") as ModelName,
```

**daemon/app.ts**: Pass `config` when calling `createManagerPackage` (line 167):

```typescript
const managerPkg = createManagerPackage(config);
```

`config` is already in scope in `createProductionApp`.

**Tests** (add to `tests/daemon/services/manager/worker.test.ts` or similar):
- `createManagerPackage()` called with no argument returns metadata with `model === "opus"` (REQ-SYS-MODEL-10 backwards compat)
- `createManagerPackage({ projects: [], systemModels: { guildMaster: "sonnet" } })` returns metadata with `model === "sonnet"`
- `createManagerPackage({ projects: [], systemModels: { guildMaster: "haiku" } })` returns metadata with `model === "haiku"`
- `createManagerPackage({ projects: [], systemModels: { guildMaster: "my-local" } })` returns metadata with `model === "my-local"` (local name stored as-is for runtime resolution)
- `createManagerPackage({ projects: [], systemModels: {} })` returns metadata with `model === "opus"` (guildMaster absent, fallback active)

---

### Step 6: Spec validation

**Delegates to**: fresh-context sub-agent

Launch a sub-agent with no implementation context. It reads:
- `.lore/specs/system-model-defaults.md`
- `lib/types.ts`, `lib/config.ts`
- `daemon/services/memory-compaction.ts`
- `daemon/services/meeting/notes-generator.ts`
- `daemon/services/briefing-generator.ts`
- `daemon/services/manager/worker.ts`
- `daemon/app.ts`
- Test files for each changed module

The sub-agent checks every REQ-SYS-MODEL requirement for coverage and evaluates the success criteria. Pay particular attention to:
- REQ-SYS-MODEL-4: Unrecognized model names produce descriptive errors at service invocation, not at config parse time
- REQ-SYS-MODEL-9: Existing callers that pass no config to `CompactionDeps` and `NotesGeneratorDeps` still compile and behave as before
- REQ-SYS-MODEL-10: Test sites that call `createManagerPackage()` with no argument still compile
- Local model test: sessions resolve to `definition.modelId` and set `env`, not the raw local name string

## Delegation Guide

This feature is small and focused. All five implementation steps can be handled in a single Dalton commission; Steps 2, 3, 4, and 5 can be done in parallel (after Step 1 completes) since they touch separate files.

**Dalton (implementation)**: Steps 1 through 5, in order. Step 1 must land before any other step since all four service changes depend on the new type.

**Sable (testing)**: Step 6 test validation, after Dalton's commission completes. Sable should run `bun test` to confirm all tests pass and coverage meets the 90% threshold on new code.

**Sub-agent**: Spec validation (end of Step 6), with fresh context.

**Commission sequencing**:
1. **Commission A** (Dalton): Steps 1 → 2 → 3 → 4 → 5 in a single pass
2. **Commission B** (Sable): Run tests, confirm coverage, report gaps
3. **Commission C** (sub-agent): Spec validation against all REQ-SYS-MODEL requirements

Commission B and C can run in parallel after Commission A completes. If Commission B reveals test gaps, fix them before spec validation.

**Step 1 is the only true dependency blocker.** Steps 2-5 each touch a different file and can be done in any order once the type is in place. Recommend doing them in spec order (compaction, notes, briefing, guild-master) since that matches the spec's requirement numbering and makes the commit history easier to read.

## Verification Checklist

After Dalton completes:

- [ ] `config.yaml` with a full `systemModels` section parses without error
- [ ] `config.yaml` with an empty string in any `systemModels` field fails Zod validation
- [ ] All four services compile with the config change (no TypeScript errors)
- [ ] Existing callers that omit config from `CompactionDeps`, `NotesGeneratorDeps`, and `createManagerPackage()` still compile
- [ ] `bun test` passes with no regressions

After Sable completes:

- [ ] New test cases exercise both "config present" and "config absent" paths for each service
- [ ] Local model name test confirms `modelId` is used and `env` is set for compaction and notes
- [ ] Coverage on changed files meets 90% threshold
