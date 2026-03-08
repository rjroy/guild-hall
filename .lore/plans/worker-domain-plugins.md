---
title: Worker domain plugins
date: 2026-03-07
status: draft
tags: [plan, architecture, workers, plugins, packages]
modules: [sdk-runner, packages, lib-types]
related:
  - .lore/specs/worker-domain-plugins.md
  - .lore/design/cleanup-commissions-skill.md
  - .lore/retros/unified-sdk-runner.md
  - .lore/retros/worker-dispatch.md
---

# Plan: Worker Domain Plugins

## Spec Reference

**Spec**: `.lore/specs/worker-domain-plugins.md`
**Motivating design**: `.lore/design/cleanup-commissions-skill.md`

Requirements addressed:
- REQ-DPL-1, DPL-2: Plugin structure in packages (`.claude-plugin/plugin.json`) -> Step 1
- REQ-DPL-3, DPL-4: Plugin detection during discovery -> Step 1
- REQ-DPL-5, DPL-6: Worker `domainPlugins` declaration -> Step 2
- REQ-DPL-7, DPL-8: Missing plugin error handling -> Step 3
- REQ-DPL-9, DPL-10, DPL-11: Plugin resolution in Session concern -> Step 3
- REQ-DPL-12, DPL-13, DPL-14, DPL-15: SDK integration -> Step 3
- REQ-DPL-16: `pluginPath` on `DiscoveredPackage` -> Step 1
- REQ-DPL-17: `domainPlugins` in Zod schema -> Step 2
- REQ-DPL-18: Existence check only, no content read -> Step 1

## Codebase Context

**Package discovery** (`lib/packages.ts`): `discoverPackages()` scans directories for `package.json` with a `guildHall` key, validates metadata via Zod, and returns `DiscoveredPackage[]`. Currently does not check for `.claude-plugin/`. The `DiscoveredPackage` type lives in `lib/types.ts` with fields `name`, `path`, `metadata`.

**Worker metadata** (`lib/packages.ts`): `workerMetadataSchema` already has `domainToolboxes: z.array(z.string())`. Adding `domainPlugins` as optional mirrors this pattern exactly.

**Toolbox resolver** (`daemon/services/toolbox-resolver.ts`): Domain toolbox resolution (lines 118-132) finds packages by name, validates they're toolbox packages, and loads them. Plugin resolution follows the same lookup pattern but is simpler: no dynamic import, just collect paths.

**Session preparation** (`daemon/lib/agent-sdk/sdk-runner.ts`): `prepareSdkSession` is a 5-step function. Step 1 finds the worker package and extracts `workerMeta`. Step 2 resolves tools using `spec.packages`. Step 5 builds `SdkQueryOptions`. Plugin resolution slots into step 5 using data already available (`workerMeta.domainPlugins` + `spec.packages[].pluginPath`). No new dependencies needed.

**Production wiring** (`daemon/app.ts`): No changes needed. `prepareSdkSession` already receives `packages` (which will carry `pluginPath` after discovery changes) and worker metadata (which will carry `domainPlugins` after schema changes). No new DI seams required.

**Existing patterns**: No workers currently use `domainToolboxes` (all have `[]`). `domainPlugins` will be the first real use of the "declare external packages by name" pattern, but the Writer package referencing itself (REQ-DPL-6) is the simplest case: no cross-package lookup needed.

## Implementation Steps

### Step 1: Package discovery gains plugin detection

**Files**: `lib/types.ts`, `lib/packages.ts`
**Addresses**: REQ-DPL-1, DPL-2, DPL-3, DPL-4, DPL-16, DPL-18

Add `pluginPath?: string` to `DiscoveredPackage` in `lib/types.ts`.

In `discoverPackages()` (`lib/packages.ts`), after successfully reading and validating a package, check for the existence of `.claude-plugin/plugin.json` relative to the package directory. The rest of `discoverPackages` uses `fs/promises` (async), so use `fs.access()` with a try/catch rather than `fs.existsSync` to stay consistent with the file's import style. If the file exists, set `pluginPath` to the absolute path of the package root directory (the SDK expects the root, not the plugin.json path). Do not read or validate plugin contents.

Tests:
- Package with `.claude-plugin/plugin.json` gets `pluginPath` populated
- Package without `.claude-plugin/plugin.json` gets `pluginPath` undefined
- Discovery does not fail if `.claude-plugin/` exists but `plugin.json` is missing inside it

### Step 2: Worker metadata schema gains `domainPlugins`

**Files**: `lib/packages.ts`, `lib/types.ts`
**Addresses**: REQ-DPL-5, DPL-6, DPL-17

Add `domainPlugins: z.array(z.string()).optional()` to `workerMetadataSchema` in `lib/packages.ts`. Add `domainPlugins?: string[]` to the `WorkerMetadata` interface in `lib/types.ts`.

Note: `domainToolboxes` is required in both the interface and schema. `domainPlugins` is intentionally optional in both (`.optional()` in Zod, `?` in the interface). This is correct per the spec: existing workers don't declare plugins, and the field should not require a default. The interface and schema must match: optional in both places.

This is a schema-only change. No behavior yet.

Tests:
- Worker metadata with `domainPlugins: ["pkg-name"]` validates successfully
- Worker metadata without `domainPlugins` validates successfully (optional field)

### Step 3: Plugin resolution in `prepareSdkSession`

**Files**: `daemon/lib/agent-sdk/sdk-runner.ts`
**Addresses**: REQ-DPL-7, DPL-8, DPL-9, DPL-10, DPL-11, DPL-12, DPL-13, DPL-14, DPL-15

Add `plugins?: Array<{ type: "local"; path: string }>` to `SdkQueryOptions`.

In `prepareSdkSession`, between step 2 (tool resolution) and step 5 (build options), resolve plugins from `workerMeta.domainPlugins`. For each declared plugin name:

1. Find the package in `spec.packages` by name
2. If no package found: return error `"Worker X requires domain plugin Y but no matching package was found"`
3. If package found but `pluginPath` is undefined: return error `"Worker X requires domain plugin Y but package Y does not contain a plugin (no .claude-plugin/plugin.json)"`
4. Collect `{ type: "local" as const, path: pkg.pluginPath }`

Add the collected array to `options.plugins` in step 5. If `domainPlugins` is undefined or empty, omit the field.

This keeps resolution in the Session concern. No changes to toolbox-resolver, worker activation, or any other concern.

Tests:
- Worker with `domainPlugins: ["pkg-a"]` where `pkg-a` has `pluginPath` produces `options.plugins` with one entry
- Worker with `domainPlugins: ["pkg-a"]` where `pkg-a` is not in packages returns error
- Worker with `domainPlugins: ["pkg-a"]` where `pkg-a` exists but has no `pluginPath` returns error with distinct message
- Worker with no `domainPlugins` produces no `plugins` in options
- Worker with `domainPlugins: ["self"]` referencing its own package works (REQ-DPL-6)
- Worker with `domainPlugins: ["pkg-a", "pkg-b"]` where both have `pluginPath` produces `options.plugins` with two entries (confirms iteration)

### Step 4: Validate against spec

Launch a sub-agent that reads the spec at `.lore/specs/worker-domain-plugins.md`, reviews the implementation, and flags any requirements not met. This step is not optional.

Two things the validator should specifically check:
1. Setting `plugins` in `SdkQueryOptions` does not affect `settingSources` or other existing options (REQ-DPL-14)
2. Both commission and meeting code paths reach `prepareSdkSession`, confirming plugin resolution covers both session types

## Delegation Guide

No steps require specialized expertise beyond the codebase patterns already in use. All three implementation steps are straightforward TypeScript changes following existing patterns (Zod schema extension, async existence check, array mapping).

Review strategy: Run the `plan-reviewer` agent after saving this plan, and use fresh-eyes code review after implementation (per the unified-sdk-runner and worker-dispatch retro lessons).

## Open Questions

- The spec notes REQ-WKR-18 (`settingSources` contradiction) as an exit point but explicitly defers resolution. No action needed here, but skills that appear in both a domain plugin and project `.claude/` directory will have undefined behavior. Avoid overlap.
- The first real consumer will be `guild-hall-writer` with `domainPlugins: ["guild-hall-writer"]` (self-reference). Creating the `.claude-plugin/` directory and packaging the cleanup-commissions skill is a separate task after this infrastructure lands.
