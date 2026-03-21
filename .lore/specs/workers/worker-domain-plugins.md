---
title: Worker domain plugins
date: 2026-03-07
status: implemented
tags: [architecture, workers, plugins, operations, agent-sdk, packages]
modules: [sdk-runner, packages, toolbox-resolver]
related:
  - .lore/specs/workers/guild-hall-workers.md
  - .lore/specs/commissions/guild-hall-commissions.md
  - .lore/specs/commissions/commission-layer-separation.md
  - .lore/research/claude-agent-sdk.md
  - .lore/research/typescript-plugin-systems.md
  - packages/guild-hall-writer/plugin/skills/cleanup-commissions/SKILL.md
  - packages/guild-hall-writer/plugin/skills/cleanup-meetings/SKILL.md
req-prefix: DPL
---

# Spec: Worker Domain Plugins

## Overview

Worker packages can contain a Claude Code plugin (skills, commands, hooks, agents). Workers declare which packages they want plugins loaded from via `domainPlugins` in their package metadata, mirroring how `domainToolboxes` works for tools. The daemon resolves plugin paths from discovered packages and passes them to the SDK session via the `plugins` option.

This gives workers access to skills and commands during commissions and meetings without injecting anything into the system prompt. The SDK handles plugin loading natively.

## Entry Points

- Package author adds a `.claude-plugin/` directory to a worker or toolbox package (from package development)
- Worker package declares `domainPlugins` referencing other packages (from package metadata)
- Guild Hall activates a worker and resolves plugin paths alongside tool resolution (from [Spec: guild-hall-workers](guild-hall-workers.md), REQ-WKR-12)

## Requirements

### Plugin in Packages

- REQ-DPL-1: A package may optionally contain a Claude Code plugin inside a `plugin/` subdirectory. The plugin is identified by the presence of `plugin/.claude-plugin/plugin.json` relative to the package root. The plugin follows the standard Claude Code plugin structure: `skills/*/SKILL.md`, `commands/*.md`, `agents/*.md`, `hooks/hooks.json`, `.mcp.json`, all relative to the `plugin/` directory. The `plugin/` subdirectory prevents plugin concerns (skills, hooks, commands, agents) from mixing with package concerns (posture.md, soul.md, index.ts).

- REQ-DPL-2: A package contains at most one plugin. The plugin is the package's plugin. There is no mechanism for a package to contain multiple plugins.

- REQ-DPL-3: Plugin presence is detected during package discovery (`lib/packages.ts`). When a package directory contains `plugin/.claude-plugin/plugin.json`, the discovery result records that a plugin is available and stores the absolute path to the `plugin/` directory. The SDK's `plugins` option expects this path and locates `.claude-plugin/plugin.json` relative to it.

- REQ-DPL-4: Plugin detection does not validate plugin contents. The SDK handles validation when the plugin is loaded. Discovery only checks for the existence of `plugin/.claude-plugin/plugin.json`.

### Worker Declaration

- REQ-DPL-5: Worker package metadata gains an optional `domainPlugins` field: an array of package names whose plugins should be loaded into the worker's session. This mirrors `domainToolboxes` (REQ-WKR-2).

```json
{
  "guildHall": {
    "type": "worker",
    "domainPlugins": ["guild-hall-writer"],
    "domainToolboxes": []
  }
}
```

- REQ-DPL-6: A worker may reference its own package in `domainPlugins`. A writer package that contains both a worker and a plugin can declare `domainPlugins: ["guild-hall-writer"]` to load its own skills into its own sessions.

- REQ-DPL-7: If a declared domain plugin references a package that does not exist among discovered packages, activation fails with a clear error identifying the missing package. This matches the behavior of missing domain toolboxes (REQ-WKR-13).

- REQ-DPL-8: If a declared domain plugin references a package that exists but does not contain a plugin (no `plugin/.claude-plugin/plugin.json`), activation fails with a clear error distinguishing "package not found" from "package has no plugin."

### Plugin Resolution

- REQ-DPL-9: Plugin resolution happens during session preparation (`prepareSdkSession`), after tool resolution and before building SDK options. The resolver iterates the worker's `domainPlugins` list, looks up each package name in the discovered packages, and collects the plugin paths.

- REQ-DPL-10: The resolved plugin paths are added to `SdkQueryOptions` as `plugins: Array<{ type: "local"; path: string }>`. This is the format the Claude Agent SDK expects.

- REQ-DPL-11: Plugin resolution is part of the Session concern (SDK interaction). It does not touch Activity, Artifact, Toolbox, or Worker concerns. The five-concern boundary is preserved.

### SDK Integration

- REQ-DPL-12: `SdkQueryOptions` gains a `plugins` field: `Array<{ type: "local"; path: string }>`. The field is optional and defaults to an empty array.

- REQ-DPL-13: `prepareSdkSession()` populates `options.plugins` from the resolved plugin paths. If the worker declares no `domainPlugins`, the field is omitted or empty.

- REQ-DPL-14: Plugins loaded via `domainPlugins` are additive. They do not replace or interfere with plugins that the SDK loads from other sources (e.g., via `settingSources`). If a skill appears in both a domain plugin and in the project's `.claude/` directory, behavior is undefined. Avoid overlapping skill definitions across these two mechanisms.

- REQ-DPL-15: The worker's commission prompt can reference skills by their slash command name (e.g., "Run `/cleanup-commissions`"). The SDK makes the skill available; the commission prompt tells the worker to use it. No changes to commission context injection are required.

### Package Discovery Updates

- REQ-DPL-16: The `DiscoveredPackage` type gains an optional `pluginPath?: string` field. When a package has a plugin, this is the absolute path to the `plugin/` subdirectory (the directory the SDK receives as the plugin root).

- REQ-DPL-17: The `WorkerMetadata` Zod schema (`workerMetadataSchema`) gains an optional `domainPlugins` field: `z.array(z.string()).optional()`.

- REQ-DPL-18: The package discovery function checks for `plugin/.claude-plugin/plugin.json` existence using `fs.access` (async, matching the file's import style). No file content is read. This keeps discovery fast.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Spec update: guild-hall-workers | REQ-WKR-2 and REQ-WKR-12 need to include `domainPlugins` | [Spec: guild-hall-workers](guild-hall-workers.md) |
| Spec update: REQ-WKR-18 | Clarified: `settingSources` is SDK infrastructure, not worker config. REQ-WKR-18 updated. | [Spec: guild-hall-workers](guild-hall-workers.md) |

## Success Criteria

- [ ] Packages with `plugin/.claude-plugin/plugin.json` are detected during discovery
- [ ] `pluginPath` is populated on `DiscoveredPackage` when a plugin exists
- [ ] Workers can declare `domainPlugins` in package.json metadata
- [ ] Missing domain plugin package fails activation with clear error
- [ ] Package without plugin fails activation with distinct error message
- [ ] Resolved plugin paths are passed to SDK via `options.plugins`
- [ ] A worker can invoke a skill from a domain plugin during a commission
- [ ] Existing behavior (toolboxes, tools, system prompt, settingSources) is unchanged
- [ ] Plugin resolution works for meeting sessions as well as commission sessions
- [ ] Five-concern boundary is preserved (plugin resolution stays in Session concern)

## AI Validation

**Defaults** (apply unless overridden):
- Unit tests with mocked filesystem for package discovery
- Unit tests for plugin resolution (happy path, missing package, package without plugin)
- Integration test: `prepareSdkSession` produces `options.plugins` from worker metadata
- Code review by fresh-context sub-agent

**Custom:**
- End-to-end test: a commission dispatched to a worker with `domainPlugins` can invoke a skill from that plugin (requires live SDK session, may need to be manual verification)

## Constraints

- Plugin contents are opaque to Guild Hall. The daemon does not parse, validate, or transform plugin files. It resolves paths and passes them to the SDK.
- Plugin resolution uses the same discovered-packages set as toolbox resolution. Cross-project plugin references are not supported until the package distribution model is resolved (see `.lore/issues/package-distribution-model.md`).
- This spec does not address the lore-development dependency problem. Workers that need lore-development skills currently get them via `settingSources`. Migrating that dependency to `domainPlugins` is a separate decision.
- This spec does not change how `settingSources` works. `settingSources` is SDK infrastructure that Guild Hall controls; it is not worker-level configuration (see REQ-WKR-18).

## Context

### Lore Researcher Findings

The lore-researcher originally flagged `settingSources: ["local", "project", "user"]` as contradicting REQ-WKR-18. This was a misreading: `settingSources` is SDK infrastructure that Guild Hall controls, not worker-level filesystem access. REQ-WKR-18 has been clarified to make this distinction explicit. The `domainPlugins` mechanism provides explicit, per-worker control over which plugins are loaded, complementing the SDK's own settings loading.

### Related Prior Work

- `.lore/specs/workers/guild-hall-workers.md` - defines the `domainToolboxes` pattern this mirrors
- `.lore/research/claude-agent-sdk.md` - documents the SDK's `plugins` option
- `.lore/research/typescript-plugin-systems.md` - documents the Claude Code plugin structure
- `packages/guild-hall-writer/plugin/skills/cleanup-commissions/SKILL.md` - the motivating use case (a skill that needs to be available to the writer worker)
- `packages/guild-hall-writer/plugin/skills/cleanup-meetings/SKILL.md` - meeting batch cleanup skill
- `.lore/retros/unified-sdk-runner.md` - `prepareSdkSession` is the single extension point for SDK options
- `.lore/retros/worker-dispatch.md` - production wiring in `createProductionApp()` must be updated for any new capability
- `.lore/issues/package-distribution-model.md` - the `packages/` vs `~/.guild-hall/packages/` ambiguity affects plugin path resolution
