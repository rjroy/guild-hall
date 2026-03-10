---
title: System model defaults
date: 2026-03-10
status: draft
tags: [configuration, model-selection, daemon, memory-compaction, meeting-notes, briefing-generator, guild-master]
modules: [config, daemon, memory-compaction, notes-generator, briefing-generator]
req-prefix: SYS-MODEL
related:
  - .lore/specs/model-selection.md
  - .lore/specs/local-model-support.md
---

# Spec: System Model Defaults

## Overview

Four daemon services hardcode their model strings: memory compaction uses `"sonnet"`, meeting notes generation uses `"sonnet"`, the briefing generator uses `"sonnet"`, and the Guild Master worker uses `"opus"`. Users cannot change any of these without modifying source code. This spec adds a `systemModels` section to `config.yaml` that exposes each as a typed, optional override with the current value as its default. When the section is absent or a field is omitted, the service falls back to its existing behavior unchanged. Local model names (from `config.models`) are valid at all four sites.

## Entry Points

- User edits `~/.guild-hall/config.yaml` to add or modify a `systemModels` section (direct config editing)
- Daemon startup reads config and passes system model values to each service via existing DI seams (daemon initialization)

## Requirements

### Config Schema

- REQ-SYS-MODEL-1: `config.yaml` gains an optional top-level `systemModels` key. All fields within it are optional. An absent `systemModels` key, or absent individual fields within it, leaves each service's behavior unchanged.

- REQ-SYS-MODEL-2: The `AppConfig` type gains an optional `systemModels?: SystemModels` field. The `SystemModels` type has four optional string fields:
  - `memoryCompaction` — model for memory compaction sessions
  - `meetingNotes` — model for meeting notes generation
  - `briefing` — model for project briefing sessions
  - `guildMaster` — model for the Guild Master worker

- REQ-SYS-MODEL-3: The Zod schema validates `systemModels` as an optional object where each field, when present, is a non-empty string. Empty strings are rejected at parse time.

- REQ-SYS-MODEL-4: Valid values for each field are built-in model names (`opus`, `sonnet`, `haiku`) and local model names defined in `config.models`. An unrecognized name produces an error when the service attempts to resolve it. Validation is lazy: errors surface at the first invocation of the service, not at daemon startup.

### Example config

```yaml
systemModels:
  memoryCompaction: haiku
  meetingNotes: haiku
  briefing: sonnet
  guildMaster: opus
```

### Configurable Sites

- REQ-SYS-MODEL-5: Memory compaction reads its model from `config.systemModels?.memoryCompaction`. When absent, falls back to `"sonnet"` (current behavior preserved). Source: `daemon/services/memory-compaction.ts:291`.

- REQ-SYS-MODEL-6: Meeting notes generation reads its model from `config.systemModels?.meetingNotes`. When absent, falls back to `"sonnet"` (current behavior preserved). Source: `daemon/services/meeting/notes-generator.ts:163`.

- REQ-SYS-MODEL-7: The briefing generator reads its model from `config.systemModels?.briefing`. When absent, falls back to `"sonnet"` (current behavior preserved). Source: `daemon/services/briefing-generator.ts:385`. (`BriefingGeneratorDeps` already carries `AppConfig` — no DI change needed for this service.)

- REQ-SYS-MODEL-8: The Guild Master worker reads its model from `config.systemModels?.guildMaster`. When absent, falls back to `"opus"` (current behavior preserved). Source: `daemon/services/manager/worker.ts:116`.

### Config Access

- REQ-SYS-MODEL-9: Each service reads `systemModels` through its existing dependency injection pattern. Services that do not currently accept config (`CompactionDeps`, `NotesGeneratorDeps`) gain an optional `config?: AppConfig` field. The service reads `config?.systemModels?.memoryCompaction ?? "sonnet"` (or the equivalent `meetingNotes` field) when constructing the options object passed to its SDK call. Existing callers that pass no config continue to compile and behave as before.

- REQ-SYS-MODEL-10: The Guild Master package factory receives config at the call site in `daemon/app.ts`. The config parameter is optional with an `"opus"` fallback so test sites that call the factory with no config argument continue to work.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Model applied to compaction session | Worker activation triggers memory compaction | SDK call in memory-compaction.ts |
| Model applied to notes session | Meeting close triggers notes generation | SDK call in notes-generator.ts |
| Model applied to briefing session | Project briefing request arrives | `resourceOverrides.model` in briefing-generator.ts |
| Model applied to Guild Master | Daemon starts, Guild Master package initialized | `WorkerMetadata.model` in manager/worker.ts |

## Success Criteria

- [ ] `config.yaml` accepts a `systemModels` section; Zod validates it and rejects empty strings
- [ ] Omitting `systemModels` entirely produces no change in behavior (all four fallbacks active)
- [ ] Each of the four hardcoded model strings is replaced by a config-read with fallback
- [ ] Local model names work in `systemModels` fields, resolved through `config.models`
- [ ] An unrecognized model name in any `systemModels` field produces a descriptive error

## AI Validation

**Defaults** (apply unless overridden):
- Unit tests with mocked dependencies
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Config schema tests: valid `systemModels` parses without error; empty strings are rejected; absent `systemModels` key returns config with `systemModels: undefined`; all four fields are optional independently
- Per-service tests: when `config.systemModels.<field>` is set, the SDK call uses that model string; when absent, the SDK call uses the hardcoded fallback
- Local model test: when `config.systemModels.<field>` is set to a configured local model name, the session resolves to the local model's `modelId` and applies the correct `env` overrides — not the raw name string
- Guild Master factory test: factory called with config returns the configured model; factory called without config returns `"opus"`

## Constraints

- This is a config surface, not a model routing system. One model per service, globally. No per-project or per-worker-session overrides within this spec.
- Worker packages in `packages/` declare their own `model` in `guild-hall.json`. That mechanism is separate and unchanged. `systemModels` applies only to the four built-in system services that bypass the worker package activation pipeline.
- These four services have no UI representation for their model choice. This spec does not add any. The config is the only surface.
- Local model names in `systemModels` fields are resolved at runtime via `resolveModel()`, not at config parse time. The config schema validates that each field is a non-empty string; actual model resolution happens when the service is invoked.

## Context

The model selection system (`.lore/specs/model-selection.md`, status: implemented) handled worker-level and commission-level model configuration. REQ-MODEL-13 moved the briefing generator's Sonnet override from a post-prep object spread to `SessionPrepSpec.resourceOverrides.model`, but it remained a source constant, not a user config. REQ-MODEL-2 placed the Guild Master's `"opus"` in `WorkerMetadata.model`, making it a source-level declaration rather than a scattered hardcode — but still not user-configurable.

Local model support (`.lore/specs/local-model-support.md`, status: draft) adds the `models` array to `config.yaml` and extends `resolveModel()` to resolve local names. The new `systemModels` section sits alongside `models` in the same config file and uses the same `resolveModel()` resolution path.

The four services covered here bypass the worker activation pipeline entirely. Memory compaction and meeting notes generation invoke the SDK directly with their own options objects. The briefing generator runs through `prepareSdkSession` but overrides model via `resourceOverrides`. The Guild Master is built-in source code and cannot be changed through the package mechanism that roster workers use — it is the one built-in worker for which `guild-hall.json` does not exist.
