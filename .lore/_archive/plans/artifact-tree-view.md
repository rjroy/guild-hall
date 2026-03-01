---
title: Plan for collapsible artifact tree view
date: 2026-02-26
status: executed
tags: [ui, artifacts, navigation, tree-view, plan]
modules: [artifact-grouping, artifact-list]
related: [.lore/specs/artifact-tree-view.md, .lore/specs/guild-hall-views.md]
---

# Plan: Collapsible Tree View for Artifacts Tab

## Spec Reference

**Spec**: `.lore/specs/artifact-tree-view.md`
**Related**: `.lore/specs/guild-hall-views.md` (REQ-VIEW-16, Artifacts tab)

Requirements addressed:
- REQ-TREE-1: Build tree data structure from artifact paths → Step 1
- REQ-TREE-2: Directory nodes are collapsible → Step 2
- REQ-TREE-3: Visual indicator for expand/collapse state → Step 2
- REQ-TREE-4: Leaf nodes render existing artifact link layout → Step 2
- REQ-TREE-5: Top-level dirs expanded, deeper collapsed → Steps 1, 2
- REQ-TREE-6: Indentation communicates depth → Step 2
- REQ-TREE-7: Single-level dirs look identical to current view when expanded → Step 2
- REQ-TREE-8: Root group renders without collapsible wrapper → Step 2
- REQ-TREE-9: Directory labels are capitalized directory name → Step 1
- REQ-TREE-10: Collapse state is ephemeral React state → Step 2

## Codebase Context

**Current data flow:**
1. `app/projects/[name]/page.tsx` calls `scanArtifacts(lorePath)` which returns `Artifact[]` sorted by `lastModified` descending.
2. Passes `artifacts` and `projectName` to `ArtifactList`.
3. `ArtifactList` calls `groupArtifacts()` from `lib/artifact-grouping.ts`, which groups by first path segment only. Deep paths like `_abandoned/poc/brainstorm/idea.md` all land under the `_abandoned` heading with no sub-structure.
4. Each group renders as a heading + flat list of artifact links.

**Files that change:**
- `lib/artifact-grouping.ts`: New `buildArtifactTree()` function (replaces `groupArtifacts()` as the primary data transformation for this view). `groupArtifacts()`, `groupKey()`, `capitalize()`, and `displayTitle()` remain as-is to keep the module's public API and existing tests stable.
- `components/project/ArtifactList.tsx`: Convert to client component, replace flat group rendering with recursive tree rendering.
- `components/project/ArtifactList.module.css`: Add styles for tree nodes, indentation, chevron indicators, and collapsible containers.
- `tests/lib/artifact-grouping.test.ts`: Add test suite for `buildArtifactTree()`.

**Files that don't change:**
- `app/projects/[name]/page.tsx`: Props passed to `ArtifactList` stay the same (`artifacts: Artifact[]`, `projectName: string`).
- `lib/artifacts.ts`: Scanning logic unchanged.
- `lib/types.ts`: `Artifact` interface unchanged.
- `components/ui/Panel.tsx`, `components/ui/GemIndicator.tsx`: Consumed as-is.

**Patterns to follow:**
- Phase 1 retro established the pattern of extracting pure utility functions and testing them independently. The tree-building function follows this pattern exactly.
- Existing test file uses `makeArtifact()` helper for fixture creation. New tests should reuse this pattern.
- CSS uses design tokens from `globals.css` (`--color-brass`, `--space-*`, `--color-text-muted`).

## Implementation Steps

### Step 1: Tree data structure (`lib/artifact-grouping.ts`)

**Files**: `lib/artifact-grouping.ts`, `tests/lib/artifact-grouping.test.ts`
**Addresses**: REQ-TREE-1, REQ-TREE-5, REQ-TREE-9

Add a `TreeNode` type and `buildArtifactTree()` function to `lib/artifact-grouping.ts`.

**TreeNode type:**
```typescript
interface TreeNode {
  name: string;          // directory segment or filename
  label: string;         // capitalize(name) for dirs, displayTitle() for leaves
  path: string;          // full relative path from .lore/ root
  depth: number;         // 0 = top-level, 1 = second level, etc.
  children: TreeNode[];  // subdirectories and artifacts (empty for leaves)
  artifact?: Artifact;   // present only on leaf nodes
  defaultExpanded: boolean; // true for depth 0 (top-level), false for deeper
}
// Invariant: a node is a leaf when artifact is defined AND children is empty.
// A node is a directory when artifact is undefined AND children is non-empty.
// No node should have both artifact and children populated.
```

**`buildArtifactTree(artifacts: Artifact[]): TreeNode[]`**: Takes the same `Artifact[]` input that `groupArtifacts()` takes. Returns an array of top-level `TreeNode` objects. Process:

1. For each artifact, split `relativePath` by `/` to get path segments.
2. Walk the segments, creating or finding directory nodes at each level.
3. The final segment is the leaf node with the `artifact` reference.
4. Root-level files (no directory) go into a synthetic `TreeNode` with `name: "root"`, `label: "Root"`, and `depth: 0` in the returned array. The renderer in Step 2 treats nodes with `name === "root"` specially by rendering children without a collapsible wrapper. This matches the current `groupArtifacts()` behavior where `group: "root"` items render differently.
5. Sort directory nodes alphabetically at each level, with "root" last (matching `groupArtifacts()` sort order).
6. Set `defaultExpanded: true` for `depth === 0`, `false` for deeper nodes (REQ-TREE-5).

This is a pure function with no side effects. It can be tested thoroughly with just path strings.

**Tests to add** (in the existing `tests/lib/artifact-grouping.test.ts`):
- Empty input returns empty array
- Single root-level file produces a root node with one leaf child
- Single-level paths (e.g., `specs/a.md`, `specs/b.md`) produce flat groups matching current `groupArtifacts()` output structure
- Multi-level paths build nested tree (e.g., `tasks/phase-1/a.md` creates `tasks` > `phase-1` > leaf)
- Mixed depths: some dirs shallow, some deep, root files present
- Directory sort order: alphabetical at each level, root last
- `defaultExpanded` is true for depth 0, false for depth 1+
- Leaf nodes carry the `artifact` reference, directory nodes do not
- `label` uses `capitalize()` for directories and `displayTitle()` for leaves

### Step 2: Tree rendering (`components/project/ArtifactList.tsx`)

**Files**: `components/project/ArtifactList.tsx`, `components/project/ArtifactList.module.css`
**Addresses**: REQ-TREE-2, REQ-TREE-3, REQ-TREE-4, REQ-TREE-5, REQ-TREE-6, REQ-TREE-7, REQ-TREE-8, REQ-TREE-10

Convert `ArtifactList` to a client component and replace the flat group rendering with a recursive tree.

**Component changes:**
1. Add `"use client"` directive at the top.
2. Replace `groupArtifacts()` call with `buildArtifactTree()`.
3. Initialize collapse state from `defaultExpanded` on each node. Use a `Set<string>` in `useState` tracking expanded paths. Pre-populate with all nodes where `defaultExpanded === true`.
4. Create a `TreeNodeRow` internal component (or inline render function) that handles both directory and leaf nodes:
   - **Directory node**: Renders a clickable row with chevron indicator + capitalized label. Clicking toggles the path in the expanded set. If expanded, renders `children` recursively. Indentation via `paddingLeft` calculated from `depth`.
   - **Leaf node**: Renders the existing artifact link layout (scroll icon, title, date, tags, gem). Same markup as current `ArtifactList` item rendering, indented to match its depth.
5. **Root group** (REQ-TREE-8): Nodes in the "root" group render their children directly without a collapsible wrapper. The "Root" heading behaves like today's root section.
6. **Single-level directories** (REQ-TREE-7): A directory like `specs/` with only leaf children renders identically to the current view when expanded: heading, then flat list of items beneath. The tree structure naturally produces this when there's only one level of nesting.

**CSS changes (`ArtifactList.module.css`):**
- `.directoryRow`: Clickable row with cursor pointer, flex layout for chevron + label. Same brass color and border-bottom as current `.groupHeading` for top-level dirs.
- `.chevron`: Small indicator (CSS triangle or Unicode chevron). Rotates 90 degrees when expanded. Transition on transform for smooth animation.
- `.children`: Container for child nodes. No extra styling needed beyond containing the recursive structure.
- Indentation: Apply inline `style={{ paddingLeft: depth * 24 }}` (24px per level, matching `var(--space-lg)`) on each tree row. Inline style is simpler than a CSS custom property approach and keeps the dynamic depth calculation out of the stylesheet.
- Preserve all existing leaf-node styles (`.item`, `.link`, `.scrollIcon`, `.info`, `.title`, `.meta`, `.tags`, `.tag`).
- Directory headings at depth 0 match current `.groupHeading` appearance: `var(--color-brass)`, border-bottom `rgba(184, 134, 11, 0.2)`. Deeper directory nodes use `var(--color-text-muted)` for the label and no border-bottom, creating a lighter visual weight that distinguishes nesting levels.

**Chevron indicator approach**: Use a CSS-only chevron (border-based triangle or a simple `>` character styled with `transform: rotate()`). No image asset needed. This keeps it consistent with the minimalist fantasy chrome.

### Step 3: Testing strategy

**Files**: `tests/lib/artifact-grouping.test.ts` (extended in Step 1)
**Addresses**: AI Validation (custom criteria)

The project does not have `@testing-library/react` or any React render environment. Existing component tests (e.g., `tests/components/commission-view.test.tsx`) call server components as plain functions and inspect the returned React element tree. That approach does not work for client components with `useState`, which throw outside a React render context.

**Decision: test coverage comes from the data layer.** The `buildArtifactTree()` function is where the logic lives, and Step 1's test suite covers it thoroughly. The component itself (`ArtifactList`) is a thin rendering layer that maps tree nodes to JSX. Adding a render environment (`@testing-library/react` or `happy-dom`) just for this feature is not justified.

The Step 1 test suite covers:
- Tree construction correctness (all edge cases from the spec's AI Validation section)
- Root node handling
- Sort ordering
- Default expansion state
- Leaf/directory invariants

What's not covered by automated tests (verified manually or by the Step 4 validation agent):
- Click-to-expand/collapse interaction
- Visual appearance of chevron indicators
- Indentation rendering at depth
- Fantasy design system preservation

### Step 4: Validate against spec

Launch a sub-agent that reads the spec at `.lore/specs/artifact-tree-view.md`, reviews the implementation across all changed files, and flags any requirements not met. This step is not optional.

The validation agent should check:
- Each REQ-TREE-N requirement has corresponding implementation
- Success criteria from the spec are all addressed
- Constraints are respected (CSS Modules, same props, client component, Panel wrapper, Artifact type compatibility)
- Visual styling uses design tokens from `globals.css`; brass, parchment, and gem indicator appearances are unchanged for existing elements
- No regressions to existing behavior for single-level groups and root files

## Delegation Guide

No specialized expertise required beyond standard frontend development. All steps can be executed by a general-purpose implementation agent.

Steps 1 and 2 should be implemented together since the component depends on the data structure. Step 3 can run after Steps 1-2 are complete. Step 4 runs last.

Consult `.lore/lore-agents.md` (if it exists) for available domain-specific agents.

## Open Questions

- **Component test infrastructure**: The project may not have `@testing-library/react` installed. Step 3 notes this and falls back to data-layer testing if needed. Worth checking during implementation.
- **Depth increment value**: The exact `paddingLeft` per depth level needs visual tuning. Start with `var(--space-lg)` (likely 24px based on the 8-step scale) and adjust if the indentation feels too wide or narrow for 3+ levels of nesting.
