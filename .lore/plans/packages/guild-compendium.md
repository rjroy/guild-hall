---
title: Guild Compendium plugin package
date: 2026-03-23
status: draft
tags: [compendium, plugins, craft-knowledge, packages, domain-plugins, skills]
modules: [lib/types.ts, lib/packages.ts, packages/guild-compendium]
related:
  - .lore/specs/packages/guild-compendium.md
  - .lore/brainstorm/guild-compendium-as-plugin.md
  - .lore/specs/workers/worker-domain-plugins.md
  - .lore/plans/workers/worker-domain-plugins.md
---

# Plan: Guild Compendium Plugin Package

## Spec Reference

**Spec**: `.lore/specs/packages/guild-compendium.md`

Requirements addressed:

- REQ-CMP-1, REQ-CMP-2: Plugin package type in discovery system -> Step 1
- REQ-CMP-3, REQ-CMP-4, REQ-CMP-5: No-change verifications (confirmed) -> Step 1 (tests only)
- REQ-CMP-6, REQ-CMP-7, REQ-CMP-8, REQ-CMP-9: Package structure and manifests -> Step 2
- REQ-CMP-10, REQ-CMP-11, REQ-CMP-12: `consult-compendium` skill -> Step 3
- REQ-CMP-13, REQ-CMP-14, REQ-CMP-15, REQ-CMP-16: `propose-entry` skill -> Step 4
- REQ-CMP-17, REQ-CMP-18, REQ-CMP-19, REQ-CMP-20: Reference entry format -> Step 3 (documented in skill, enforced editorially)
- REQ-CMP-21, REQ-CMP-22: Population workflow -> Out of scope (follow-on research commissions)
- REQ-CMP-23, REQ-CMP-23a: Worker declarations and posture updates -> Step 5
- REQ-CMP-24: Researcher exclusion -> Step 5 (by omission)
- REQ-CMP-25: Guild Master exclusion -> Out of scope (per spec)
- REQ-CMP-26: Initial content targets -> Step 2 (empty `reference/` directory ships; content is follow-on)

## Codebase Context

### What exists

**Package type system** (`lib/types.ts:209`): `PackageMetadata` is currently `WorkerMetadata | ToolboxMetadata`. The `DiscoveredPackage` interface already carries an optional `pluginPath` field (added during domain plugin work). No `PluginMetadata` type exists yet.

**Schema validation** (`lib/packages.ts:78-81`): `packageMetadataSchema` is `z.union([workerMetadataSchema, toolboxMetadataSchema])`. A package with `type: "plugin"` in its `guildHall` key currently fails validation and gets skipped with a warning.

**Discovery loop** (`lib/packages.ts:93-221`): The posture/soul loading block (line 173) guards on `"identity" in metadata`, which is false for plugin packages. The plugin path detection (lines 202-209) runs unconditionally after metadata validation. Both behaviors are correct for plugin packages without changes. Verified against source.

**Plugin resolution** (`daemon/lib/agent-sdk/sdk-runner.ts:298-315`): Domain plugin resolution finds packages by name, checks `pluginPath`, and collects `{ type: "local", path }` entries. It does not check `metadata.type`, so a plugin-type package resolves identically to a worker-type package that happens to carry a plugin. Verified against source.

**Type guards** (`lib/packages.ts:264-274`): `isWorkerType` checks for `"worker"`, `isToolboxType` checks for `"toolbox"`. Neither matches `"plugin"`. Plugin packages are excluded from `getWorkers()` and `getToolboxes()` results. Verified.

**Model validation** (`lib/packages.ts:230-260`): `validatePackageModels` guards on `"identity" in pkg.metadata`. Plugin packages pass through untouched. Verified.

### Worker tool access audit

The spec's six opt-in workers and their Write tool access:

| Worker | Has Skill | Has Write | Can use `consult-compendium` | Can use `propose-entry` |
|--------|-----------|-----------|------------------------------|------------------------|
| guild-hall-writer (Octavia) | Yes | Yes | Yes (via Skill) | Yes |
| guild-hall-developer (Dalton) | Yes | Yes | Yes (via Skill) | Yes |
| guild-hall-steward (Edmund) | Yes | Yes | Yes (via Skill) | Yes |
| guild-hall-illuminator (Sienna) | **No** | Yes | Partial (via posture only) | Yes (if triggered) |
| guild-hall-visionary (Celeste) | Yes | Yes | Yes (via Skill) | Yes |
| guild-hall-reviewer (Thorne) | Yes | **No** | Yes (via Skill) | **No** |

Two tool gaps affect skill behavior:

1. **Thorne lacks Write.** The `propose-entry` skill writes to `.lore/issues/`. Thorne can use `consult-compendium` (read-only) but cannot execute `propose-entry`. The skill's SKILL.md should note the Write requirement.

2. **Sienna lacks Skill.** Sienna's `builtInTools` are `["Read", "Glob", "Grep", "Write", "Edit", "Bash"]`. Without `Skill`, the formal skill invocation mechanism won't fire. However, domain plugins are loaded via the SDK's `plugins` option, so skill descriptions are still present in the agent's context. Sienna can follow the skill's instructions manually (reading reference files with Read/Glob) when directed by her posture line. The posture line for Sienna should be more explicit than the others: instead of "check the compendium" (which implies a skill invocation), it should say "read the reference entries in the compendium's `reference/` directory" to guide the agent toward direct file reads. Adding `Skill` to Sienna's `builtInTools` is a separate decision outside this plan's scope.

Neither gap is a blocker. The plugin is still valuable for both workers through the mechanisms available to them.

### Current domainPlugins state

| Worker | Current `domainPlugins` |
|--------|------------------------|
| guild-hall-writer | `["guild-hall-writer"]` |
| guild-hall-reviewer | (not declared) |
| guild-hall-developer | (not declared) |
| guild-hall-steward | (not declared) |
| guild-hall-illuminator | `[]` |
| guild-hall-visionary | `[]` |

Four packages need `domainPlugins` added or extended. Two already have the field and need `"guild-compendium"` appended.

## Implementation Steps

### Step 1: Add PluginMetadata type and schema

**Files changed**:
- `lib/types.ts`: Add `PluginMetadata` interface, update `PackageMetadata` union
- `lib/packages.ts`: Add `pluginMetadataSchema`, update `packageMetadataSchema` union

**Addresses**: REQ-CMP-1, REQ-CMP-2

In `lib/types.ts`, add after `ToolboxMetadata` (before the `PackageMetadata` union at line 209):

```typescript
/**
 * Metadata for a plugin package. Plugin packages contain only a Claude Code
 * plugin directory (skills, hooks, etc.) with no worker identity or toolbox factory.
 */
export interface PluginMetadata {
  type: "plugin";
  name: string;
  description: string;
}
```

Update the union:

```typescript
export type PackageMetadata = WorkerMetadata | ToolboxMetadata | PluginMetadata;
```

In `lib/packages.ts`, add after `toolboxMetadataSchema` (before line 78):

```typescript
export const pluginMetadataSchema = z.object({
  type: z.literal("plugin"),
  name: z.string(),
  description: z.string(),
});
```

Update the union:

```typescript
export const packageMetadataSchema = z.union([
  workerMetadataSchema,
  toolboxMetadataSchema,
  pluginMetadataSchema,
]);
```

**Tests** (new test file `tests/lib/plugin-metadata.test.ts`):
- `pluginMetadataSchema` accepts valid `{ type: "plugin", name: "...", description: "..." }`
- `pluginMetadataSchema` rejects missing `name` or `description`
- `packageMetadataSchema` accepts plugin-type metadata alongside worker and toolbox
- `discoverPackages` discovers a plugin-type package, sets `pluginPath` when plugin dir exists
- `discoverPackages` discovers a plugin-type package, `pluginPath` undefined when no plugin dir (edge case: a plugin package without the plugin directory would validate but have no effect)
- `getWorkers()` excludes plugin packages
- `getToolboxes()` excludes plugin packages
- `validatePackageModels` passes plugin packages through unchanged
- Integration test: `prepareSdkSession` resolves a plugin-type package's plugin path when a worker's `domainPlugins` references it. Construct a mock spec with a plugin-type package that has `pluginPath` set and a worker declaring it in `domainPlugins`. Confirm the resulting session options include `plugins` with the correct path. This covers the spec's AI Validation custom criterion.

These tests verify REQ-CMP-3, REQ-CMP-4, and REQ-CMP-5 by demonstrating the existing guards work correctly for the new type. The integration test verifies the composition path end-to-end.

**Scope**: Small. Two source files, one or two test files. Additive type/schema changes only.

### Step 2: Create package structure

**Files created**:
- `packages/guild-compendium/package.json`
- `packages/guild-compendium/plugin/.claude-plugin/plugin.json`
- `packages/guild-compendium/plugin/skills/consult-compendium/SKILL.md` (placeholder, replaced in Step 3)
- `packages/guild-compendium/plugin/skills/consult-compendium/reference/` (empty directory, use `.gitkeep`)
- `packages/guild-compendium/plugin/skills/propose-entry/SKILL.md` (placeholder, replaced in Step 4)

**Addresses**: REQ-CMP-6, REQ-CMP-7, REQ-CMP-8, REQ-CMP-9, REQ-CMP-26 (empty reference dir)

`package.json`:
```json
{
  "name": "guild-compendium",
  "version": "0.1.0",
  "guildHall": {
    "type": "plugin",
    "name": "guild-compendium",
    "description": "Curated craft knowledge for the guild. Reference entries covering domains encountered during commissions and meetings."
  }
}
```

`plugin.json`:
```json
{
  "name": "Guild Compendium",
  "description": "Curated craft knowledge workers consult on demand. Skills for reading reference entries and proposing new ones."
}
```

The `reference/` directory sits inside `consult-compendium/` per REQ-CMP-9. Ship with a `.gitkeep` so the empty directory is tracked. The five target filenames from REQ-CMP-26 (`spec-writing.md`, `code-review.md`, `typescript-practices.md`, `implementation.md`, `commission-prompts.md`) are not created here. Content is follow-on research work.

**Scope**: Small. File creation only, no logic.

### Step 3: Author consult-compendium skill

**Files changed**:
- `packages/guild-compendium/plugin/skills/consult-compendium/SKILL.md`

**Addresses**: REQ-CMP-10, REQ-CMP-11, REQ-CMP-12, REQ-CMP-17, REQ-CMP-18, REQ-CMP-19, REQ-CMP-20

This is text authoring, not code. The SKILL.md must accomplish three things:

1. **Trigger reliably** (REQ-CMP-10): The description must name specific trigger contexts so the SDK's skill matching fires when the worker enters a covered domain. Name them concretely: "starting a code review," "writing a spec," "beginning implementation from a plan," "writing a commission prompt," "working with TypeScript."

2. **Guide file reads** (REQ-CMP-11): The body must instruct the agent to: (a) use Glob to list files in the `reference/` directory relative to this skill, (b) read the relevant entry or entries based on the current task, (c) absorb the key points as context. The skill does not inject content; the agent pulls what it needs.

3. **Stay passive** (REQ-CMP-12): The skill must not instruct the agent to change posture, identity, or tool access. It hands the worker reference material and lets them proceed.

The skill should also document the reference entry format (REQ-CMP-17 through REQ-CMP-20) so the agent knows what to expect when reading entries: frontmatter with `title`, `domain`, `last_updated`, `source`; 500-1000 word entries; self-contained; worker-agnostic.

**Authoring note**: Skill trigger reliability depends on the description matching the agent's current task context. The description should use the same vocabulary the workers use in their posture and commission prompts. Test the trigger by running a session with a compendium-enabled worker and observing whether the skill fires when entering a covered domain.

**Scope**: Medium. Text authoring requires iteration to get trigger language right. No code changes.

### Step 4: Author propose-entry skill

**Files changed**:
- `packages/guild-compendium/plugin/skills/propose-entry/SKILL.md`

**Addresses**: REQ-CMP-13, REQ-CMP-14, REQ-CMP-15, REQ-CMP-16

This is text authoring. The SKILL.md must accomplish:

1. **Trigger on gap recognition** (REQ-CMP-13): Trigger phrases: "the compendium doesn't cover this," "this domain would benefit from a reference entry," "I encountered a pattern that should be documented," "no compendium entry exists for this topic."

2. **Write a structured issue** (REQ-CMP-14): Instruct the agent to create a file at `.lore/issues/compendium-proposal-{topic}.md` with frontmatter (`title`, `date`, `status: open`, `tags` including `compendium-proposal`) and body (domain, evidence from current task, suggested scope).

3. **Write to issues, not compendium** (REQ-CMP-15, REQ-CMP-16): The skill must explicitly state that proposals go to `.lore/issues/`, not to the compendium's `reference/` directory. The asymmetry is the point.

4. **Note Write tool requirement**: The skill should state that it requires Write tool access. Workers without Write (currently Thorne) will see the skill but cannot execute it. The skill should instruct the agent to note the gap in its output rather than fail silently if Write is unavailable.

**Scope**: Small. Shorter than `consult-compendium` since the behavior is more constrained.

### Step 5: Update worker declarations and posture

**Files changed** (6 workers, 2 files each = 12 files):
- `packages/guild-hall-writer/package.json` (add `"guild-compendium"` to existing `domainPlugins`)
- `packages/guild-hall-writer/posture.md` (add compendium guidance line)
- `packages/guild-hall-reviewer/package.json` (add `domainPlugins: ["guild-compendium"]`)
- `packages/guild-hall-reviewer/posture.md` (add compendium guidance line)
- `packages/guild-hall-developer/package.json` (add `domainPlugins: ["guild-compendium"]`)
- `packages/guild-hall-developer/posture.md` (add compendium guidance line)
- `packages/guild-hall-steward/package.json` (add `domainPlugins: ["guild-compendium"]`)
- `packages/guild-hall-steward/posture.md` (add compendium guidance line)
- `packages/guild-hall-illuminator/package.json` (add `"guild-compendium"` to existing empty `domainPlugins`)
- `packages/guild-hall-illuminator/posture.md` (add compendium guidance line)
- `packages/guild-hall-visionary/package.json` (add `"guild-compendium"` to existing empty `domainPlugins`)
- `packages/guild-hall-visionary/posture.md` (add compendium guidance line)

**Addresses**: REQ-CMP-23, REQ-CMP-23a, REQ-CMP-24 (researcher excluded by omission)

**package.json changes** break into three patterns:
1. `guild-hall-writer`: already has `"domainPlugins": ["guild-hall-writer"]`. Append `"guild-compendium"` to make `["guild-hall-writer", "guild-compendium"]`.
2. `guild-hall-illuminator`, `guild-hall-visionary`: already have `"domainPlugins": []`. Replace with `["guild-compendium"]`.
3. `guild-hall-reviewer`, `guild-hall-developer`, `guild-hall-steward`: no `domainPlugins` field. Add `"domainPlugins": ["guild-compendium"]`.

**Posture lines** (REQ-CMP-23a) should be per-worker, referencing domains relevant to that worker:

| Worker | Posture line |
|--------|-------------|
| Octavia (writer) | "Before writing a spec, plan, or documentation artifact, check the compendium for relevant craft guidance." |
| Thorne (reviewer) | "Before starting a code review, check the compendium for relevant review practices and finding calibration." |
| Dalton (developer) | "Before starting implementation from a plan, check the compendium for relevant implementation patterns and testing practices." |
| Edmund (steward) | "Before starting maintenance or cleanup work, check the compendium for relevant practices." |
| Sienna (illuminator) | "Before starting visual work, read the reference entries in the guild compendium's `reference/` directory for relevant visual craft guidance and style references." |
| Celeste (visionary) | "Before starting strategic analysis or vision work, check the compendium for relevant analysis patterns." |

Each posture line goes at the end of the worker's existing posture content, in a section that makes sense for that worker's document structure. Read each posture.md before editing to find the right insertion point.

**Scope**: Medium. Many files, but each change is small. The posture lines require reading existing posture content to find appropriate placement.

### Step 6: Validate against spec

Launch a fresh-context sub-agent to:
1. Read the spec at `.lore/specs/packages/guild-compendium.md`
2. Walk every REQ and verify it maps to an implemented change or a confirmed no-change
3. Verify `discoverPackages` discovers the guild-compendium package
4. Verify `prepareSdkSession` resolves the plugin for each declaring worker
5. Run existing tests to confirm no regression
6. Run new tests from Step 1

This step is not optional. The spec has 26 requirements. Missing one is easy; a checklist review catches it.

## Delegation Guide

| Step | Worker | Reason |
|------|--------|--------|
| 1. PluginMetadata type/schema | Dalton | Straightforward TypeScript. Follows existing pattern exactly. |
| 2. Package structure | Dalton | File creation, no logic. Bundle with Step 1. |
| 3. consult-compendium skill | Octavia | Text authoring. Skill trigger language requires domain knowledge of how workers use reference material. |
| 4. propose-entry skill | Octavia | Text authoring. Simpler than Step 3. Bundle with Step 3. |
| 5. Worker declarations + posture | Dalton | Mechanical edits across 12 files. Posture lines are provided in the plan. |
| 6. Spec validation | Thorne | Fresh-context review. Catches drift between plan and spec. **Dispatch only after Step 5 completes.** |

**Recommended sequencing**: Steps 1-2 together (one commission to Dalton), Steps 3-4 together (one commission to Octavia), Step 5 (second commission to Dalton, depends on Steps 1-2), Step 6 after all implementation (commission to Thorne).

Steps 1-2 and 3-4 can run in parallel since they touch different files.

## Risks

### Skill trigger reliability

Skills are text files whose behavior depends on agent interpretation. The `consult-compendium` skill must trigger when a worker enters a covered domain, but trigger matching is probabilistic. Mitigation: posture lines (REQ-CMP-23a) provide a belt-and-suspenders mechanism. The posture directs the worker to actively look for reference material, reducing dependence on passive skill triggering.

**Verification**: Manual. Run a session with a compendium-enabled worker, give it a task in a covered domain, and observe whether the skill fires. This cannot be unit-tested.

### Sienna lacks Skill tool

Sienna (illuminator) does not have `Skill` in her `builtInTools`. The formal skill invocation won't fire for her. Mitigation: the posture line for Sienna uses explicit file-read language instead of "check the compendium" (see Step 5 posture table). The compendium's reference material is still accessible through Read/Glob, which Sienna has.

If this pattern (domain plugin on a worker without `Skill`) becomes common, adding `Skill` to Sienna's tools is the proper fix. That's a separate decision.

### Thorne cannot use propose-entry

The reviewer (Thorne) has read-only tool access. The `propose-entry` skill requires Write to create issue files. Thorne will see both skills but can only use `consult-compendium`. This is a known limitation, not a bug. The propose-entry SKILL.md should note the Write requirement so the agent doesn't attempt a write it can't complete.

If this becomes a friction point, the resolution is to add Write to Thorne's builtInTools (separate decision, separate spec). This plan does not change Thorne's tool access.

### Empty reference directory at ship

The compendium ships without content. Workers consulting the compendium before entries exist will find an empty `reference/` directory. The `consult-compendium` skill should handle this gracefully: instruct the agent to check for entries first and proceed without reference material if none exist.

### Schema union ordering

Zod `z.union` tries schemas in order. Adding `pluginMetadataSchema` to the union means a package with both `type: "plugin"` and an `identity` field would match `pluginMetadataSchema` first (since plugin schema only requires `type`, `name`, `description`). In practice this won't happen because no package would declare both, but the ordering should be: worker first, toolbox second, plugin last. This matches the current ordering (worker, toolbox) with plugin appended.

### Posture line placement

Each worker's posture.md has a different structure. The compendium guidance line needs to land in a section that makes contextual sense, not just appended to the end. The implementer must read each posture.md before editing. The plan provides suggested wording but not exact insertion points; those depend on the current content.

## Scope Estimate

| Step | Files | Size |
|------|-------|------|
| 1. Type/schema + tests | 3 (2 source + 1 test) | Small |
| 2. Package structure | 5 files + 1 .gitkeep | Small |
| 3. consult-compendium skill | 1 | Medium (authoring) |
| 4. propose-entry skill | 1 | Small |
| 5. Worker declarations | 12 (6 package.json + 6 posture.md) | Medium (breadth) |
| 6. Validation | 0 (review only) | Small |

Total: ~22 files touched. Two commissions in parallel (Dalton: Steps 1+2, Octavia: Steps 3+4), then one sequential (Dalton: Step 5), then validation (Thorne: Step 6).
