---
title: Collapsible tree view for Artifacts tab
date: 2026-02-26
status: implemented
tags: [ui, artifacts, navigation, tree-view]
modules: [artifact-list, artifact-grouping]
related: [.lore/specs/ui/guild-hall-views.md]
req-prefix: TREE
---

# Spec: Collapsible Tree View for Artifacts Tab

## Overview

The Artifacts tab on the project page displays artifacts as a flat list grouped by top-level directory. Projects with deep nesting (3+ levels like `_abandoned/poc/brainstorm/`) present all items under a single heading with no visible structure. This makes navigation slow for projects with many artifacts.

Replace the flat grouped list with a collapsible tree that mirrors the actual directory structure of `.lore/`.

## Entry Points

- Project page Artifacts tab (from tab selection on `/projects/[name]?tab=artifacts`)

## Requirements

- REQ-TREE-1: Build a tree data structure from artifact relative paths, where each directory segment becomes a node and artifacts are leaves.
- REQ-TREE-2: Directory nodes are collapsible. Clicking a directory toggles its children between visible and hidden.
- REQ-TREE-3: A visual indicator (chevron or similar) shows whether a directory node is expanded or collapsed.
- REQ-TREE-4: Leaf nodes render the existing artifact link layout: scroll icon, title, date, tags, and gem indicator.
- REQ-TREE-5: Top-level directories start expanded. Deeper levels start collapsed.
- REQ-TREE-6: Indentation visually communicates depth. Each level indents further than its parent.
- REQ-TREE-7: Single-level directories (like `specs/`) display identically to the current view when expanded: heading with items beneath.
- REQ-TREE-8: The "root" group (files directly in `.lore/`) renders its items without a collapsible wrapper, same as today.
- REQ-TREE-9: Directory node labels are the capitalized directory name (matching current `capitalize()` behavior).
- REQ-TREE-10: Collapse state is ephemeral (React state). No persistence to localStorage.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Artifact detail | User clicks an artifact leaf node | `/projects/[name]/artifacts/[...path]` (existing) |

## Success Criteria

- [ ] Artifacts tab renders a collapsible tree matching the directory structure of `.lore/`
- [ ] Directories with children can be expanded and collapsed by clicking
- [ ] Visual indicator distinguishes expanded vs collapsed state
- [ ] Leaf nodes preserve scroll icon, title, metadata, and gem indicator
- [ ] Depth is visible through indentation
- [ ] Existing single-level groups (specs, plans, retros) look and behave the same when expanded
- [ ] Fantasy design system (brass, parchment, gem indicators) is preserved

## AI Validation

**Defaults apply:**
- Unit tests with mocked time/network/filesystem/LLM calls
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Tree-building function tested with: empty input, single-level paths, multi-level paths, root-level files, mixed depths
- Component renders correct nesting for a known set of artifact paths

## Constraints

- CSS Modules (not Tailwind)
- Component receives `artifacts: Artifact[]` and `projectName: string` as props (interface unchanged)
- Must convert from server component to client component (collapse state requires interactivity)
- Wrapped in `<Panel size="lg">`
- Compatible with existing `Artifact` type from `lib/types.ts`

## Context

The current implementation groups by first path segment only (`lib/artifact-grouping.ts:groupKey()`). REQ-VIEW-16 in the views spec defines the Artifacts tab content but does not prescribe flat vs tree layout. This spec extends the existing requirement with a navigation improvement.

Real `.lore/` directories in this project have 3+ levels of nesting:
- `_abandoned/poc/brainstorm/` and `_abandoned/poc/notes/` (18 files under one flat heading today)
- `tasks/phase-2-workers-first-audience/` and `tasks/phase-5-git-integration/` (25+ files under one heading)
- `specs/`, `plans/`, `retros/` (single level, 5-15 files each)
