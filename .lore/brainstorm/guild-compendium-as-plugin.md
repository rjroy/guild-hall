---
title: "Guild Compendium as Plugin Package"
date: 2026-03-23
status: draft
tags: [compendium, plugins, craft-knowledge, packages, domain-plugins, reference]
modules: [packages, sdk-runner, toolbox-resolver, lib-packages]
related:
  - .lore/brainstorm/guild-hall-future-vision.md
  - .lore/specs/workers/worker-domain-plugins.md
---

# Brainstorm: Guild Compendium as Plugin Package

## Context

Proposal 2 in the future vision brainstorm describes a Guild Compendium: curated craft knowledge that workers consult during sessions. The original proposal placed it at `~/.guild-hall/compendium/` with injection during `prepareSdkSession`, mirroring the memory system. The user's direction reshapes this: the compendium should be a standard package in `packages/` with a `plugin/.claude-plugin/` directory, declared as a `domainPlugin` by workers that use it. No special infrastructure.

The core question: is this just another package following existing patterns, or does the "reference material" aspect require something new?

## How It Maps to the Existing Architecture

### Package structure

The compendium package would follow the same layout as `guild-hall-writer`:

```
packages/guild-compendium/
  package.json
  plugin/
    .claude-plugin/
      plugin.json
    skills/
      consult-compendium/
        SKILL.md
      propose-entry/
        SKILL.md
    reference/
      spec-writing.md
      code-review.md
      typescript-practices.md
      implementation.md
      commission-prompts.md
```

No `index.ts`. No `soul.md` or `posture.md`. This is not a worker. It's a pure plugin package, not a toolbox either. Its `package.json` declares a `type` that the package discovery system can recognize, and workers reference it by name in their `domainPlugins` array.

### package.json

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

Wait. There's a problem here. The current type system in `lib/types.ts` defines `PackageMetadata` as either `WorkerMetadata` or `ToolboxMetadata`. There's no `PluginMetadata` type. The package discovery in `lib/packages.ts` validates against `workerMetadataSchema` or `toolboxMetadataSchema`. A pure plugin package doesn't fit either schema.

But look at how `guild-hall-writer` handles this. The writer package is `type: "worker"` with `domainPlugins: ["guild-hall-writer"]`, meaning it references *itself* as a plugin. The plugin lives at `plugin/.claude-plugin/plugin.json` within the worker package. The discovery code checks for `plugin/.claude-plugin/plugin.json` existence and sets `pluginPath` on the `DiscoveredPackage` if found (`lib/packages.ts:202-206`).

This means the plugin is a subdirectory of a package, not a standalone package type. The `domainPlugins` field on workers is a list of *package names* whose `plugin/` subdirectory gets passed to the SDK.

**Two options emerge:**

**Option A: Piggyback on an existing worker package.** Put the compendium content inside, say, `guild-hall-writer/plugin/reference/`. Workers that want the compendium already declare `guild-hall-writer` as a domain plugin. This is the simplest path but couples the compendium's lifecycle to Octavia's package, which feels wrong. The compendium should be available to workers who don't need Octavia's skills.

**Option B: Create a standalone plugin package.** This requires a small infrastructure change: the package discovery system needs to recognize a `type: "plugin"` package that has no worker metadata, just a plugin directory. The `domainPlugins` resolution in `sdk-runner.ts:300-317` already doesn't care about package type. It finds a package by name and checks for `pluginPath`. If the discovery system can discover a plugin-only package and set its `pluginPath`, the rest works unchanged.

Option B is cleaner and the infrastructure change is small. Let's explore it.

### What the infrastructure change looks like

1. **New schema in `lib/packages.ts`**: A `pluginMetadataSchema` for `type: "plugin"` with `name` and `description` fields.
2. **Update `PackageMetadata` union**: Add `PluginMetadata` type.
3. **Package discovery**: The existing check at `lib/packages.ts:202-206` already detects `plugin/.claude-plugin/plugin.json` and sets `pluginPath` on any package. No change needed for the pluginPath detection.
4. **`domainPlugins` resolution in `sdk-runner.ts`**: Already works by package name lookup and `pluginPath` check. No change needed.

That's it. Two type definitions and one schema addition. The resolution pipeline doesn't change at all.

**Verdict: This is mostly just another package.** One small gap in the type system (no pure plugin package type), but the runtime pipeline already supports it.

## What the `reference/` Directory Contains

### Entry structure

Each reference entry is a markdown file answering a craft question. The file is self-contained: someone reading it should understand the topic without needing other entries.

```markdown
---
title: What Makes a Good Spec
domain: software-development
last_updated: 2026-03-23
source: research commission (Verity, 2026-03-23)
---

## Core Qualities

A spec defines what "done" looks like. It names specific requirements, each
testable in isolation. A spec that says "should handle errors" is a wish.
A spec that says "REQ-4: Returns HTTP 422 when the payload is missing
required fields, with a body listing the missing fields" is a requirement.

## Structure That Works

...

## Common Failure Modes

...
```

The frontmatter carries `domain` for categorization, `last_updated` for staleness tracking, and `source` to trace provenance (which research commission or direct write produced it).

### How big are entries?

They should be concise. These aren't textbooks. A reference entry on spec writing might be 500-1000 words: enough to orient a worker, not enough to become noise. The compendium's value is density. If an entry is long enough that a worker wouldn't read the whole thing, it's too long.

### Initial scope

Start with entries matching the guild's actual work domains:

- `spec-writing.md` (what makes requirements testable, common failure modes)
- `code-review.md` (what to look for, how to calibrate severity, presenting findings)
- `typescript-practices.md` (patterns the codebase follows, pitfalls)
- `implementation.md` (working from a plan, when to deviate, testing alongside)
- `commission-prompts.md` (what makes a good commission prompt, common gaps)

This is a starting set, not a fixed list. The user decides when new entries belong.

## How Agents Access the Compendium

This is where the plugin model does something elegant. Claude Code plugins make their skills and files available to the agent session. The agent can invoke skills by name and read files within the plugin directory. The reference entries live inside the plugin, so agents can read them on demand.

**On-demand, not injected.** The original proposal injected compendium content during `prepareSdkSession`, mirroring memory. That approach has a cost: it uses context window space whether the worker needs the material or not. The plugin model is better. The agent decides when to consult the compendium. A skill like `consult-compendium` could guide the agent to the right reference entry, or the agent could read `reference/` files directly when it recognizes a relevant domain.

This is the same pattern as how agents currently use skills: the skill exists, the agent's posture or the task context triggers it, the agent pulls what it needs. No pre-loading.

**One concern:** Will agents actually consult the compendium without being told to? Claude Code plugins are available but not automatically invoked. The agent has to decide to use them. Two mechanisms can help:

1. **Posture guidance.** Workers who should consult the compendium get a line in their posture: "Before starting a code review, check the compendium for relevant craft guidance." This is lightweight and doesn't require infrastructure.

2. **A `consult-compendium` skill.** The skill's description in SKILL.md triggers when the agent is about to do work in a compendium domain. The skill reads the right reference entry and returns it. This is more structured than relying on posture alone.

Both approaches work within existing plugin mechanics.

## The Population Workflow

The user identifies a gap. Something goes wrong in a commission, or a pattern shows up in retros, or the user simply notices that workers lack knowledge in a domain. Then:

### Option 1: Research commission (Verity)

The user commissions Verity to research the question: "What makes a good spec?" Verity does what Verity does: gathers external context, reads prior art, consults existing lore artifacts. The output is a research document in `.lore/research/`. The user reviews it. If it's worth encoding as standing craft knowledge, the user (or Octavia) distills the research into a compendium entry and commits it to `packages/guild-compendium/plugin/reference/`.

This is the highest-quality path. Research commissions produce thorough, sourced material. The distillation step ensures only the actionable parts make it into the compendium.

### Option 2: Direct write

The user writes the entry directly. They know what they want to say about code review practices. They write `reference/code-review.md` in the compendium package. No research commission needed.

This is fastest. Good for entries where the user's own experience is the source.

### Option 3: Retro promotion

A retro surfaces a recurring pattern. The retro says "WARN-level findings keep getting dropped." The user decides this belongs in the compendium. Either the user writes it directly or commissions a research-and-write to expand the insight into a full reference entry.

This is the path the original proposal described (Guild Master proposes, user approves). But instead of the Guild Master driving the proposal, the user drives it after reviewing retro output. The user identifies the gap; the system doesn't.

### Who curates?

The user. Always the user. New entries only enter the compendium when the user decides. The system can surface candidates (retro findings, recurring patterns), but the user gates every addition. This is Vision Principle 2 (User Authority) in its purest form.

In practice, Octavia is the natural writer. She writes specs and documentation. She could write compendium entries too, given a commission prompt like "Research and write a compendium entry on spec writing practices, drawing from our retro history and external best practices." But the user initiates that commission.

## What Skills the Plugin Exposes

### `consult-compendium`

**Trigger:** When a worker is about to start work in a domain covered by the compendium. The skill description names specific triggers: "starting a code review," "writing a spec," "beginning implementation."

**Behavior:** Lists available reference entries, reads the relevant one(s), and presents the key points as context for the current task. The worker then proceeds with that knowledge loaded.

This skill is passive guidance. It doesn't change the worker's posture or identity. It hands them a reference book and says "you might want to read this first."

### `propose-entry`

**Trigger:** When a worker identifies a knowledge gap during execution. "I encountered a pattern here that the compendium doesn't cover" or "This domain would benefit from a reference entry."

**Behavior:** Writes a proposal to `.lore/issues/` (or a dedicated `.lore/compendium-proposals/` directory) with the gap description, suggested scope, and evidence. The user reviews proposals during cleanup cycles or on demand.

This skill doesn't write to the compendium directly. It proposes. The user decides.

### Maybe: `update-entry`

**Trigger:** User asks a worker to update an existing compendium entry based on new experience.

**Behavior:** Reads the existing entry, reads relevant retros or research, produces an updated draft. This would need Write access to the plugin directory, which raises a question about whether workers should modify the compendium package during commissions. Probably not: compendium updates should be deliberate, not side effects of other work. The user would run a dedicated commission for this.

This skill might not be needed at launch. Updates can be direct writes or dedicated commissions.

## Comparison: Plugin Model vs. Original `~/.guild-hall/compendium/`

### What's gained

**Standard patterns.** The plugin model uses existing package discovery, domain plugin resolution, and Claude Code plugin mechanics. No new session preparation pipeline, no new context injection system.

**Versioned with the project.** The compendium lives in `packages/` inside the repo. It's committed, versioned, reviewable in PRs. The `~/.guild-hall/compendium/` approach put it in the home directory alongside config and state, mixing curated knowledge with operational files.

**Selective adoption.** Workers declare `domainPlugins: ["guild-compendium"]` to opt in. Not every worker needs craft knowledge (the Illuminator doesn't need to know about spec writing). The original proposal's `prepareSdkSession` injection would need its own filtering logic to avoid injecting irrelevant content.

**On-demand access.** Agents pull what they need instead of having it injected. Saves context window space. More aligned with how skills already work.

### What's lost

**Automatic domain matching.** The original proposal had `prepareSdkSession` match compendium entries to commission task types: a code review commission gets the code review entry. With the plugin model, the agent or its posture handles that matching. This is arguably better (agents can judge relevance in context) but less automatic.

**Guild Master curation role.** The original proposal had the Guild Master propose compendium entries as a post-retro step. The plugin model puts curation entirely with the user. The Guild Master could still propose (via `propose-entry` skill findings), but it's less integrated into the retro workflow.

**Global scope.** `~/.guild-hall/compendium/` would be shared across all projects. A package in `packages/` belongs to the repo where it lives. If the user wants the same compendium across multiple Guild Hall projects, they'd need to either copy the package or publish it. For a single-project setup (which is the current reality), this doesn't matter.

### Net assessment

The plugin model is simpler, better aligned with existing patterns, and gives the user more control. The losses are minor: automatic domain matching can be handled by skill descriptions and posture, and global scope isn't needed yet. The one infrastructure gap (no pure plugin package type) is small.

## Does This Need New Infrastructure?

Almost nothing.

**Definitely needed:**
- `PluginMetadata` type and schema in `lib/types.ts` and `lib/packages.ts` (a `type: "plugin"` package with `name` and `description`). Without this, the package discovery system can't validate a pure plugin package.

**Already works:**
- `pluginPath` detection in `lib/packages.ts:202-206` (checks for `plugin/.claude-plugin/plugin.json` regardless of package type)
- `domainPlugins` resolution in `sdk-runner.ts:300-317` (finds package by name, checks for `pluginPath`)
- Claude Code plugin mechanics (skills, file access within plugin directory)

**Nice to have but not required:**
- A way to list available reference entries programmatically (could just be a skill that reads the directory)
- Staleness tracking for entries (the `last_updated` frontmatter handles this passively)

## Open Questions

1. **Should workers be able to write to the compendium during commissions?** The plugin directory is inside the repo. Workers with Write + Bash tools could modify it. But compendium changes should be deliberate, not incidental. Posture guidance ("do not modify compendium entries during commissions") might be sufficient, or the commission sandbox could exclude the path.

2. **How does the compendium relate to `.lore/`?** Research outputs go to `.lore/research/`. Retros go to `.lore/retros/`. Compendium entries distill from both but live in `packages/guild-compendium/plugin/reference/`. That's a different directory tree. Is the separation clear enough, or will it confuse the document mental model? The distinction: `.lore/` is project artifacts (living documents about this project's work). The compendium is craft knowledge (general truths about how to do work well). They have different lifecycles.

3. **Which workers declare it?** Every worker that does judgment work: the writer (spec quality), the reviewer (review practices), the developer (implementation patterns), the test engineer (testing practices), the steward (maintenance patterns). The researcher wouldn't need it (she gathers knowledge, she doesn't consume craft guidance). The Guild Master might want it for commission prompt quality.

4. **Could a single compendium entry serve multiple workers differently?** A "code-review.md" entry is relevant to the reviewer (how to conduct reviews) and the developer (how to respond to review findings). Same knowledge, different angles. Should entries be worker-agnostic, or should there be worker-specific sections? Probably keep entries worker-agnostic. The skill can present the entry, and the worker's posture shapes how they interpret it.

5. **Growth trajectory.** The compendium starts small (5-10 entries). At what size does it become unwieldy? If entries stay concise (500-1000 words), even 50 entries would be manageable as a directory listing. The on-demand access model means only relevant entries are loaded, so total size matters less than individual entry quality.
