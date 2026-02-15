---
title: Plugin repository structure - where to develop Guild Hall plugins
date: 2026-02-14
status: resolved
tags: [plugins, repository-structure, guild-founders, development-workflow]
related:
  - .lore/specs/guild-hall-phase-1.md
---

# Brainstorm: Plugin Repository Structure

## Context

Guild Hall discovers MCP-only plugins from the `guild-members/` directory. Phase I is underway with an example plugin already in place. The question: where should core plugins be developed?

Three options considered:
1. **Separate repos per plugin**: Each plugin is its own repository
2. **In guild-hall repo**: Core plugins live in `guild-members/` alongside the platform
3. **Single guild-founders repo**: All core plugins in one separate repository

## Ideas Explored

### Option 1: Separate repos per plugin

**What if each plugin is its own repository?**
- Clean separation and independent versioning
- Standard pattern for mature plugin ecosystems (VS Code, Grafana)
- Publishing to npm becomes straightforward
- But: context-switching overhead during early development
- But: testing against Guild Hall requires linking/publishing
- But: CI duplication across N repositories
- But: fragmented issue tracking

**Conclusion**: Feels like where a mature ecosystem ends up, but premature for bootstrap phase.

### Option 2: Plugins in guild-hall repo

**What if core plugins just live in `guild-members/` alongside the platform?**
- Single PR, single test run, zero version coordination
- Example plugins demonstrate the system to potential authors
- Rapid iteration during Phase I when everything is changing
- Platform and plugin API evolve together naturally
- But: repo could get bloated as plugin count grows
- But: sharing just the plugins (without the platform) becomes awkward
- But: graduation cost later when plugins need to move out

**Conclusion**: Matches current phase (defining what a plugin even is), but creates technical debt for later separation.

### Option 3: Single guild-founders repo

**What if there's one repo for the "core plugin collection"?**
- Middle ground: plugins together, separate from platform
- Still a monorepo but lighter than full per-plugin separation
- Cleaner boundary when plugins stabilize
- No graduation ceremony - plugins start in the right place
- Development history preserved naturally
- But: when does something "graduate" from guild-hall to guild-founders?
- But: do the plugins really share enough to warrant living together?

**Key insight**: Churn dynamics favor this approach. The platform (Guild Hall) stabilizes once discovery, manifest format, and MCP integration are solid. But plugins are where continuous experimentation happens - new tools, new use cases, new domains. Keeping high-churn plugins separate from low-churn platform makes sense.

**Decision**: This is the chosen approach.

## Churn Dynamics (Key Realization)

Initial assumption was backwards: platform would churn more than plugins.

**Reality**: Platform stabilizes, plugins evolve continuously.
- Once Guild Hall's discovery system, Workshop UI, and session management are stable, they don't change much
- Plugins are where experimentation happens: new tools, new use cases, new domains
- Example: Guild Hall v2.0 ships while database-explorer plugin stays at v1.3 (stable)
- Actually: Guild Hall v1.0 stays stable while plugins iterate from v1.0 → v1.5 → v2.0

This inverted understanding makes separation compelling. Guild Hall's commit log should be about platform improvements, not "add weather plugin."

## Submodule Question

**What if guild-founders is a git submodule of guild-hall?**
- Pros: "Works out of the box" developer experience - one clone, plugins populated automatically
- Pros: Plugin changes live in their own repo but pulled into guild-hall for testing
- Cons: Guild Hall "knows about" guild-founders in a way that doesn't generalize
- Cons: Discovery system becomes a facade over a hardcoded reference
- Cons: Developer experience doesn't match user experience

**Preferred approach**: No submodule. Developer explicitly places plugins in `guild-members/`.

README guidance:
```markdown
## Quick Start
1. Clone this repo
2. Clone guild-founders into `guild-members/guild-founders` (or symlink it)
3. `bun install && bun dev`
```

This teaches the plugin model: plugins go in `guild-members/`, Guild Hall finds them. Guild-founders is just the first plugin collection you grab, not special-cased in the platform.

## Founding Plugins Concept

**What belongs in guild-founders?**

Not "all useful plugins" but "the minimal set to bootstrap and demonstrate the platform."

Candidates for initial set:
- **echo-server**: Returns whatever you send it. Simplest possible MCP server for testing discovery and invocation
- **file-inspector**: Reads/writes files. Verifies tool streaming and artifact handling

Later expansions:
- Other plugins can be added to guild-founders if they're part of the "standard library"
- Substantial plugins with independent value could live in their own repos
- Community plugins would definitely be separate repos

The "founders" are the plugins that help develop the plugin system itself, not necessarily the most useful plugins for end users.

## Open Questions

- What exactly belongs in the "founding set" beyond echo and file-inspector?
- When does a plugin "graduate" from guild-founders to its own repo? (If ever?)
- What does third-party plugin authorship look like? Template repo? Documentation?
- Should guild-founders have its own manifest system for discovering multiple plugins from one checkout?
- How do we handle plugin dependencies if one guild member requires another's tools?

## Next Steps

1. Create `guild-founders` repository
2. Move `guild-members/example` into guild-founders as the first plugin
3. Document the "clone into guild-members/" pattern in Guild Hall README
4. Define the manifest format more formally (currently just JSON, but what fields?)
5. Consider whether guild-founders should be structured as one plugin per subdirectory or as a flat collection
