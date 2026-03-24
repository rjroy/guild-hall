---
title: Guild Compendium plugin package
date: 2026-03-23
status: draft
tags: [compendium, plugins, craft-knowledge, packages, domain-plugins, reference, skills]
modules: [lib-types, lib-packages, packages/guild-compendium]
related:
  - .lore/brainstorm/guild-compendium-as-plugin.md
  - .lore/specs/workers/worker-domain-plugins.md
  - .lore/specs/infrastructure/replicate-native-toolbox.md
  - .lore/specs/workers/guild-hall-workers.md
req-prefix: CMP
---

# Spec: Guild Compendium Plugin Package

## Overview

A pure plugin package (`packages/guild-compendium/`) containing curated craft knowledge that workers consult on demand during commissions and meetings. The package exposes two skills: `consult-compendium` (read reference entries) and `propose-entry` (file a proposal when a worker notices a knowledge gap). Workers opt in via `domainPlugins: ["guild-compendium"]`.

This requires one infrastructure change: the package discovery system currently recognizes `"worker"` and `"toolbox"` package types. A `"plugin"` type must be added so the discovery system can validate a package that has no worker identity or toolbox factory, only a Claude Code plugin directory.

## Entry Points

- User identifies a recurring knowledge gap in commission output (from retros, review findings, or observation)
- User wants to encode craft knowledge as standing reference material accessible to workers
- Worker encounters an unfamiliar domain during a commission and needs guidance (from `consult-compendium` skill trigger)
- Worker notices a gap in available craft knowledge during execution (from `propose-entry` skill trigger)

## Requirements

### Infrastructure: Plugin Package Type

- REQ-CMP-1: `lib/types.ts` gains a `PluginMetadata` interface (following the existing pattern where TypeScript interfaces live in `lib/types.ts` and Zod schemas live in `lib/packages.ts`):
  ```typescript
  interface PluginMetadata {
    type: "plugin";
    name: string;
    description: string;
  }
  ```
  The `PackageMetadata` union becomes `WorkerMetadata | ToolboxMetadata | PluginMetadata`. Since `DiscoveredPackage.metadata` is typed as `PackageMetadata`, the union change ripples through any code that narrows the type. Existing narrowing patterns (`"identity" in metadata` for workers, type-string checks in `isWorkerType`/`isToolboxType`) already exclude the `"plugin"` case correctly. `validatePackageModels` guards on `"identity" in pkg.metadata`, which is false for plugin packages, so it passes them through without changes.

- REQ-CMP-2: `lib/packages.ts` gains a `pluginMetadataSchema` that validates `type: "plugin"` packages with required `name` and `description` string fields. The existing `packageMetadataSchema` union includes this new schema alongside `workerMetadataSchema` and `toolboxMetadataSchema`.

- REQ-CMP-3: Package discovery (`discoverPackages` in `lib/packages.ts`) already handles plugin-type packages without code changes. The posture/soul loading block is guarded by `"identity" in metadata`, which is false for plugin packages. The `pluginPath` detection at `lib/packages.ts:202-206` checks for `plugin/.claude-plugin/plugin.json` regardless of package type. No changes to the discovery loop are required beyond the schema addition.

- REQ-CMP-4: Domain plugin resolution in `sdk-runner.ts` requires no changes. It finds packages by name and checks for `pluginPath`. A plugin-type package with a `pluginPath` resolves identically to a worker-type package with a `pluginPath`.

- REQ-CMP-5: The `isWorkerType` and `isToolboxType` helpers in `lib/packages.ts` correctly exclude plugin packages (they check for `"worker"` and `"toolbox"` respectively). Plugin packages do not appear in `getWorkers()` or `getToolboxes()` results. No changes needed.

### Package Structure

- REQ-CMP-6: The package lives at `packages/guild-compendium/` with this layout:
  ```
  packages/guild-compendium/
    package.json
    plugin/
      .claude-plugin/
        plugin.json
      skills/
        consult-compendium/
          SKILL.md
          reference/
            spec-writing.md
            code-review.md
            typescript-practices.md
            implementation.md
            commission-prompts.md
        propose-entry/
          SKILL.md
  ```

- REQ-CMP-7: The `package.json` declares:
  ```json
  {
    "name": "guild-compendium",
    "version": "0.1.0",
    "guildHall": {
      "type": "plugin",
      "name": "guild-compendium",
      "description": "Curated craft knowledge for the guild. Reference entries on spec writing, code review, TypeScript practices, and other recurring domains."
    }
  }
  ```

- REQ-CMP-8: The `plugin.json` follows the standard Claude Code plugin manifest format, declaring the package name and description. No hooks, commands, agents, or MCP servers. Skills only.

- REQ-CMP-9: The `reference/` directory sits inside the `consult-compendium` skill directory, not at the plugin root. This is an empirical constraint: skills reliably read files at their own level and below, but sibling directory access has been found less dependable. Placing reference material inside the skill that consults it guarantees the agent can read what it needs.

### Skill: consult-compendium

- REQ-CMP-10: The `consult-compendium` SKILL.md description triggers when a worker is about to start work in a domain covered by the compendium. The description names specific trigger contexts: starting a code review, writing a spec, beginning implementation from a plan, writing a commission prompt, or working with TypeScript patterns.

- REQ-CMP-11: When invoked, the skill instructs the agent to use Read and Glob tool calls against the `reference/` directory directly: (1) list the files in `reference/` to see available entries, (2) read the relevant entry or entries based on the current task, (3) use the key points as context for the work ahead. The skill does not inject content automatically or return a summary. It guides the agent to pull what it needs via file reads.

- REQ-CMP-12: The skill is passive guidance. It does not change the worker's posture, identity, or tool access. It hands the worker a reference and lets them proceed with that knowledge loaded.

### Skill: propose-entry

- REQ-CMP-13: The `propose-entry` SKILL.md description triggers when a worker identifies a knowledge gap during execution. Trigger phrases: "the compendium doesn't cover this," "this domain would benefit from a reference entry," "I encountered a pattern that should be documented."

- REQ-CMP-14: When invoked, the skill instructs the agent to write an issue file to `.lore/issues/` following the standard issue frontmatter format (`title`, `date`, `status: open`, `tags` including `compendium-proposal`). The body contains: the domain the entry would cover, evidence from the current task that surfaced the gap, and a suggested scope for the entry. The filename follows the pattern `compendium-proposal-{topic}.md`.

- REQ-CMP-15: The `propose-entry` skill writes to `.lore/issues/`, not to a separate proposals directory. Issue files are the existing mechanism for tracking work items. The user reviews proposals during cleanup cycles or on demand.

- REQ-CMP-16: The `propose-entry` skill does not write to the compendium. It proposes. The asymmetry is deliberate: low cost to propose, no pressure to accept, and no risk of encoding unverified knowledge as standing craft reference.

### Reference Entry Format

- REQ-CMP-17: Each reference entry is a markdown file with YAML frontmatter containing four required fields:
  ```yaml
  ---
  title: What Makes a Good Spec
  domain: software-development
  last_updated: 2026-03-23
  source: "research commission (Verity, 2026-03-23)"
  ---
  ```
  - `title`: descriptive name for the entry
  - `domain`: categorization keyword (kebab-case)
  - `last_updated`: ISO date of last revision
  - `source`: provenance trace (which research commission, direct write, or retro promotion produced it)

- REQ-CMP-18: Individual entries are 500 to 1000 words. Long enough to orient a worker, short enough that a worker would read the whole thing. If an entry exceeds this range, it should be split.

- REQ-CMP-19: Entries are self-contained. A reader understands the topic without needing other entries. Cross-references between entries are permitted but not required for comprehension.

- REQ-CMP-20: Entries are worker-agnostic. A `code-review.md` entry is relevant to the reviewer (how to conduct reviews) and the developer (how to respond to findings). The worker's posture shapes interpretation, not the entry itself.

### Population Workflow

- REQ-CMP-21: Three paths populate the compendium. All require user initiation.
  1. **Research commission**: User commissions Verity to research a domain. Verity produces a research document in `.lore/research/`. The user or Octavia distills the research into a compendium entry. This is the preferred path for initial population and produces the highest-quality entries.
  2. **Direct write**: User writes the entry directly from their own experience.
  3. **Retro promotion**: A retro surfaces a recurring pattern. The user decides it belongs in the compendium and either writes the entry or commissions it.

- REQ-CMP-22: The user gates every addition to the compendium. No automated system adds entries. Workers can propose (via `propose-entry`), but the user decides whether to act on proposals. This is Vision Principle 2 (User Authority).

### Worker Declarations

- REQ-CMP-23: Four worker packages declare `"guild-compendium"` in their `domainPlugins` array:
  - `guild-hall-writer` (Octavia): consults for spec writing, documentation craft
  - `guild-hall-reviewer` (Thorne): consults for code review practices, finding calibration
  - `guild-hall-developer` (Dalton): consults for implementation patterns, testing practices
  - `guild-hall-steward` (Edmund): consults for maintenance patterns, cleanup practices

- REQ-CMP-23a: Each declaring worker's `posture.md` gains a line directing the worker to consult the compendium before starting work in a covered domain. Example: "Before starting a code review, check the compendium for relevant craft guidance." This is a belt-and-suspenders mechanism: the skill description triggers on domain keywords, but posture guidance ensures the worker actively looks for relevant reference material rather than waiting for a passive trigger. The exact wording is per-worker and should reference the domains relevant to that worker's role.

- REQ-CMP-24: Three worker packages do not declare the compendium:
  - `guild-hall-researcher` (Verity): produces knowledge, does not consume craft guidance. She researches domains from scratch rather than consulting standing reference.
  - `guild-hall-illuminator` (Sienna): image generation work does not benefit from software craft knowledge.
  - `guild-hall-visionary` (Celeste): strategic vision work operates at a level above implementation craft. If the compendium grows to cover strategic topics, this decision can be revisited.

- REQ-CMP-25: The Guild Master is a built-in worker (not a package). Adding compendium access to the Guild Master would require changes to its session preparation in `daemon/services/manager/`. This is out of scope for this spec.

### Initial Content

- REQ-CMP-26: The compendium targets five initial reference entries, populated through the research commission path (REQ-CMP-21, option 1) to ensure entries draw on external best practices rather than echo local habits:
  - `spec-writing.md`: what makes requirements testable, common failure modes, structure
  - `code-review.md`: what to look for, severity calibration, presenting findings
  - `typescript-practices.md`: established patterns, pitfalls, community conventions
  - `implementation.md`: working from a plan, when to deviate, testing alongside
  - `commission-prompts.md`: what makes a good commission prompt, common gaps

  The package structure (REQ-CMP-6) ships without content files. The `reference/` directory is created empty. Research commissions to populate entries are follow-on work, not part of this spec's deliverables.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Worker package updates | Workers need `domainPlugins` updated | Worker `package.json` files (REQ-CMP-23) |
| Guild Master compendium access | Guild Master needs craft guidance | [STUB: guild-master-domain-plugins] |
| Compendium entry research | Initial entries need research commissions | Research commissions to Verity |

## Scope Exclusions

This spec deliberately excludes the following:

- **No `update-entry` skill.** Updating compendium entries should go through the same deliberate path as creation: research commission, user review, explicit commit. If a worker could update entries during a commission, the barrier between "something I just encountered" and "standing craft knowledge" collapses. The difficulty of updating is a feature, not friction.

- **No automatic curation.** No system (Guild Master, triage, post-retro) automatically adds or proposes entries. The `propose-entry` skill lets workers raise gaps they notice, but no automated pipeline drives proposals. The user initiates all curation.

- **No `prepareSdkSession` injection.** The original proposal injected compendium content during session preparation, mirroring memory. The plugin model is better: agents pull what they need on demand via skills. No context window cost when the worker doesn't need the material.

- **No entry validation schema.** Reference entry frontmatter is not validated by Zod at runtime. Entries are authored by the user or Octavia and committed via normal git workflow. Validation is editorial, not programmatic.

- **No staleness automation.** The `last_updated` frontmatter field tracks freshness passively. No system flags stale entries or triggers refresh. The user reviews entry currency during cleanup cycles.

## Success Criteria

**Automated (verifiable by tests):**
- [ ] `PluginMetadata` type and schema exist in `lib/types.ts` and `lib/packages.ts`
- [ ] `PackageMetadata` union includes `PluginMetadata`
- [ ] Package discovery validates `type: "plugin"` packages without error
- [ ] Plugin-type packages do not appear in `getWorkers()` or `getToolboxes()` results
- [ ] `guild-compendium` package is discoverable and its `pluginPath` is set
- [ ] Workers declaring `domainPlugins: ["guild-compendium"]` resolve the plugin path during session preparation
- [ ] Four worker packages (writer, reviewer, developer, steward) declare the compendium

**Manual/editorial (verifiable by inspection or live session):**
- [ ] `consult-compendium` skill is available to workers with the compendium plugin
- [ ] `propose-entry` skill writes correctly formatted issue files to `.lore/issues/`
- [ ] Worker posture files include compendium guidance lines
- [ ] Reference entries (when populated) follow the defined frontmatter format and size constraints

## AI Validation

**Defaults** (apply unless overridden):
- Unit tests with mocked filesystem for `PluginMetadata` schema validation
- Unit tests for package discovery with plugin-type packages (discovery, pluginPath detection, exclusion from worker/toolbox filters)
- Code review by fresh-context sub-agent

**Custom:**
- Integration test: `prepareSdkSession` resolves a plugin-type package's plugin path when referenced in a worker's `domainPlugins`
- Verify that existing tests for `discoverPackages`, `getWorkers`, `getToolboxes` still pass after schema changes (no regression)
- Manual verification: run a session with a compendium-enabled worker and confirm `consult-compendium` triggers file reads from `reference/` and `propose-entry` creates a correctly formatted file in `.lore/issues/`. Skill behavior is not unit-testable because skills are text files whose behavior depends on agent interpretation.

## Constraints

- Plugin contents are opaque to Guild Hall. The daemon does not parse or validate plugin files beyond confirming `plugin/.claude-plugin/plugin.json` exists.
- The compendium's reference entries are committed to the repo in `packages/`. Since `packages/` is per-installation (not per-project), the compendium is available to all registered projects. This matches the intent of craft knowledge that is project-agnostic.
- The `domainPlugins` resolution mechanism (REQ-DPL-7, REQ-DPL-8 from the worker-domain-plugins spec) applies: missing packages and packages without plugins produce clear activation errors.
- Growth is unbounded. The on-demand access model means total collection size matters less than individual entry quality. At 500-1000 words per entry, even 50 entries remain manageable as a directory listing.

## Context

### Brainstorm Origin

This spec distills `.lore/brainstorm/guild-compendium-as-plugin.md`, which explored the compendium concept from the future vision brainstorm and concluded that a pure plugin package is simpler, better aligned with existing patterns, and gives the user more control than the original `~/.guild-hall/compendium/` proposal.

### Open Question Resolutions

The brainstorm raised five open questions. This spec resolves them:

1. **Should workers write to the compendium during commissions?** No. The `propose-entry` skill is the sanctioned channel for surfacing gaps. Direct modification is prohibited by posture, not by sandbox mechanics. Workers who notice a gap propose it; they don't fix it themselves.

2. **How does the compendium relate to `.lore/`?** Different lifecycles, different locations. `.lore/` holds project-specific work artifacts (specs, retros, research). The compendium holds project-agnostic craft knowledge. Proposals from `propose-entry` land in `.lore/issues/` because they're project-scoped action items, even though the compendium itself is cross-project.

3. **Which workers declare it?** Writer, reviewer, developer, steward. Not researcher (produces knowledge, doesn't consume craft guidance), not illuminator (image generation domain), not visionary (strategic level above implementation craft). Guild Master is deferred (built-in worker, different session preparation path).

4. **Should entries be worker-specific or worker-agnostic?** Worker-agnostic. Same entry, different interpretation via posture. No worker-specific sections.

5. **Growth trajectory?** No hard limit. On-demand access means total size is not a scaling concern. Quality constraints on individual entries (500-1000 words, self-contained) prevent bloat at the entry level.

### Related Specifications

- [Spec: Worker Domain Plugins](.lore/specs/workers/worker-domain-plugins.md): defines `domainPlugins` mechanics (REQ-DPL-1 through REQ-DPL-18). This spec depends on that infrastructure.
- [Spec: Replicate Native Domain Toolbox](.lore/specs/infrastructure/replicate-native-toolbox.md): precedent for a standalone package with clear opt-in mechanics.
- [Spec: Guild Hall Workers](.lore/specs/workers/guild-hall-workers.md): defines worker metadata structure that `domainPlugins` extends.
