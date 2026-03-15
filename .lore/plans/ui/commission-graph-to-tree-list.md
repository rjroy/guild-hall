---
title: Commission graph to tree list
date: 2026-03-15
status: executed
tags: [ui, commissions, visualization, dashboard, dependency-graph, tree-list, css, deletion]
modules: [web/components/dashboard/DependencyMap, web/components/commission/NeighborhoodGraph, lib/dependency-graph, web/app/projects]
related:
  - .lore/specs/ui/commission-graph-to-tree-list.md
  - .lore/brainstorm/commission-graph-to-tree-list.md
  - .lore/specs/ui/graph-scrollable-container.md
---

# Plan: Commission Graph to Tree List

## Spec Reference

**Spec**: `.lore/specs/ui/commission-graph-to-tree-list.md`
**Brainstorm**: `.lore/brainstorm/commission-graph-to-tree-list.md` (status: resolved)

Requirements addressed:

- REQ-CTREE-1: Tree list always renders (no SVG branch) → Step 2
- REQ-CTREE-2: Card layout (gem, title, worker, progress) → Step 2
- REQ-CTREE-3: Root-level items (zero deps + diamond case) → Step 2
- REQ-CTREE-4: Single-dependency indentation → Step 2
- REQ-CTREE-5: CSS connector lines (::before pseudo-elements) → Step 3
- REQ-CTREE-6: Connector line styling (brass, 1px, 0.6 opacity) → Step 3
- REQ-CTREE-7: Fixed indentation offset per level → Step 3
- REQ-CTREE-8: Diamond dependency renders at root with "Awaits:" annotation → Step 2
- REQ-CTREE-9: "Awaits:" annotation styling → Step 3
- REQ-CTREE-10: Neighborhood replacement (Depends on / Blocks sections) → Step 4
- REQ-CTREE-11: Upstream/downstream list contents from getNeighborhood() → Step 4
- REQ-CTREE-12: Items link to commission detail page → Step 4
- REQ-CTREE-13: Isolated nodes suppress the section entirely → Step 4
- REQ-CTREE-14: Empty sections omitted → Step 4
- REQ-CTREE-15: Scheduled commission styling preserved → Step 2
- REQ-CTREE-16: Spawned commissions render as children of parent schedule → Step 2
- REQ-CTREE-17: File deletion (CommissionGraph.tsx, .module.css, NeighborhoodGraph.tsx, .module.css) → Step 6
- REQ-CTREE-18: Layout exports removed from dependency-graph.ts → Step 6
- REQ-CTREE-19: Retained code unchanged → Step 1, Step 6
- REQ-CTREE-20: buildAdjacencyList() utility → Step 1
- REQ-CTREE-21: Dashboard tree list independent from project CommissionList → Step 2
- REQ-CTREE-22: Future filtering note (no current work) → N/A
- REQ-CTREE-23: CSS-only connectors → Step 3
- REQ-CTREE-24: Styles in CSS modules → Step 3
- REQ-CTREE-25: graph-scrollable-container spec superseded → Step 7
- REQ-CTREE-26: DependencyMap remains server component → Step 2
- REQ-CTREE-27: Neighborhood replacement is server component → Step 4
- REQ-CTREE-28: Project page removes CommissionGraph import → Step 5

## Codebase Context

**Graph data layer** (`lib/dependency-graph.ts`, 513 lines): Contains both graph data structures (interfaces, `buildDependencyGraph`, `getNeighborhood`, `extractCommissionId`) and the Sugiyama layout algorithm (`assignLayers`, `orderNodesInLayers`, `layoutGraph`, layout types/constants). The data structures stay; the layout algorithm is deleted. The file will shrink from 513 lines to roughly 196.

**Dashboard entry point** (`web/components/dashboard/DependencyMap.tsx`, 90 lines): Server component. Lines 39-45 branch on `graph.edges.length > 0` to render `CommissionGraph` (SVG) or the flat card list. The flat card list (lines 47-89) is the foundation for the tree list. Imports `CommissionGraph` on line 5.

**SVG renderer** (`web/components/dashboard/CommissionGraph.tsx`, 247 lines): Client component. Imports `layoutGraph` and `LayoutNode` from `lib/dependency-graph`. Consumed by `DependencyMap.tsx`, `NeighborhoodGraph.tsx`, and `web/app/projects/[name]/page.tsx`. Entirely deleted.

**Neighborhood graph** (`web/components/commission/NeighborhoodGraph.tsx`, 44 lines): Client component. Renders `CommissionGraph` in compact mode with `focalNodeId`. Consumed by commission detail page (`web/app/projects/[name]/commissions/[id]/page.tsx`, line 13, rendered at line 152). Replaced with a server component rendering upstream/downstream text lists.

**Project page** (`web/app/projects/[name]/page.tsx`): Imports `CommissionGraph` (line 9), renders it in compact mode on the Commissions tab (lines 84-89). This import and usage are removed; `CommissionList` already handles the commission display on this page.

**Existing tests**:
- `tests/lib/dependency-graph.test.ts`: Tests for `buildDependencyGraph` (8 tests), `getNeighborhood` (3 tests), `layoutGraph` (8 tests). The `layoutGraph` describe block (lines 341-595) is deleted. The `makeNode` helper and graph test data helpers are shared across all blocks and must be preserved.
- `tests/components/dashboard-commissions.test.ts`: Imports `layoutGraph` (line 5), uses it in the `NeighborhoodGraph data flow` test at line 335. The `layoutGraph` import and the test that calls it must be updated. Tests for `commissionHref`, `sortCommissions`, `statusToGem`, and the graph vs. flat list decision logic are kept (the decision logic tests validate `buildDependencyGraph` and `getNeighborhood`, not `layoutGraph`, except the last test in the `NeighborhoodGraph data flow` block).

**CSS modules**:
- `DependencyMap.module.css` (75 lines): Existing card styles (`.list`, `.card`, `.link`, `.info`, `.title`, `.worker`, `.progress`, `.scheduledCard`, `.scheduledBadge`). Tree connector styles are added here.
- `CommissionGraph.module.css` (72 lines): SVG-specific styles. Deleted entirely.
- `NeighborhoodGraph.module.css` (9 lines): `.wrapper` and `.heading`. Replaced with new styles for the upstream/downstream list component.

**Client/server boundary note**: `CommissionGraph.tsx` is a client component that was previously flagged for causing a Turbopack build break via transitive `node:fs` imports (retro: `build-break-client-fs-imports.md`). Deleting it removes one client-side consumer of `lib/dependency-graph.ts`. `DependencyMap.tsx` is a server component, so its imports from `lib/dependency-graph.ts` are safe. The neighborhood replacement must also be a server component (REQ-CTREE-27), eliminating the other client-side consumer.

**Import dependency map** (verified via grep, source-code consumers only):

| Deleted artifact | Imported by |
|-----------------|-------------|
| `CommissionGraph.tsx` | `DependencyMap.tsx`, `NeighborhoodGraph.tsx`, `page.tsx` (project), `dashboard-commissions.test.ts` |
| `NeighborhoodGraph.tsx` | `page.tsx` (commission detail) |
| `layoutGraph` export | `CommissionGraph.tsx`, `dependency-graph.test.ts`, `dashboard-commissions.test.ts` |
| `LayoutNode` type | `CommissionGraph.tsx` |
| `LayoutResult`, `LayoutOptions` types | None (internal to `layoutGraph`) |

## Implementation Steps

### Step 1: Add `buildAdjacencyList()` to `lib/dependency-graph.ts`

**Files**: `lib/dependency-graph.ts`, `tests/lib/dependency-graph.test.ts`
**Addresses**: REQ-CTREE-19, REQ-CTREE-20

This step adds new code only. Layout export deletion is deferred to Step 6 because `CommissionGraph.tsx` still imports `layoutGraph` and `LayoutNode` at this point.

Add `buildAdjacencyList(graph: DependencyGraph): Map<string, string[]>` as a new exported function. It iterates the edge list once, building a map from parent ID to array of child IDs (edges where `edge.from` equals the parent). This is O(n) from the edge list.

Add a new `describe("buildAdjacencyList", ...)` block in `tests/lib/dependency-graph.test.ts` with tests for:
- Single-parent chain: A→B→C produces `{A: [B], B: [C]}`
- Diamond: A→B, A→C, B→D, C→D produces `{A: [B, C], B: [D], C: [D]}`
- Isolated nodes: no edges, returns empty map (or map with no entries)
- Schedule→spawned edges appear in the adjacency list

**Verification**: `bun test tests/lib/dependency-graph.test.ts` passes. All existing tests unchanged and green. `bun run typecheck` passes.

### Step 2: Rewrite `DependencyMap.tsx` as a tree list

**Files**: `web/components/dashboard/DependencyMap.tsx`
**Addresses**: REQ-CTREE-1, REQ-CTREE-2, REQ-CTREE-3, REQ-CTREE-4, REQ-CTREE-8, REQ-CTREE-9, REQ-CTREE-15, REQ-CTREE-16, REQ-CTREE-21, REQ-CTREE-26

Remove the `CommissionGraph` import and the `graph.edges.length > 0` branch (lines 5, 39-45). The component always renders the card list.

Add tree construction logic:
1. Call `buildDependencyGraph(commissions)` to get edges (already done on line 35).
2. Call `buildAdjacencyList(graph)` to get parent-to-children map.
3. Count incoming edges per node from `graph.edges` to identify:
   - Root nodes: zero incoming edges (no dependencies at all)
   - Multi-parent nodes: 2+ incoming edges (diamond case, render at root level with "Awaits:" annotation)
   - Single-parent nodes: exactly 1 incoming edge (indent under their parent)
4. Build tree: start with root-level items (zero deps + multi-parent), sort by `sortCommissions()`. For each root, recursively attach single-parent children, sorted by `sortCommissions()` within each parent group.
5. Flatten the tree into a render list with depth metadata.

The tree construction can be a local function within the component or extracted to a testable utility in the same file. Given REQ-CTREE-26 (server component, pure computation), a testable utility is preferred.

Card rendering remains the same pattern (gem, title with Recurring badge, worker, progress). Add:
- Depth-driven indentation uses fixed CSS classes: `.depth1`, `.depth2`, `.depth3`, `.depth4`. Each applies `margin-left: calc(N * 24px)`. Commission dependency chains are unlikely to exceed four levels; if they do, depth 4+ shares the `.depth4` class. This satisfies REQ-CTREE-24 (no inline styles) while keeping the approach simple.
- For multi-parent root nodes: render "Awaits:" annotation below the progress line, listing upstream dependency titles in muted text.
- The "Awaits:" line shows commission titles from the graph nodes. If an edge points to an unknown node (not in the graph), show the commission ID instead (REQ-CTREE-9).

**Edge case: children of multi-parent root nodes.** A multi-parent node renders at root level (depth 0). If that node has single-parent children, those children indent at depth 1 under it. The visual hierarchy is correct: the multi-parent node is a root, its children are one level deep. The depth counter resets at each root node.

Extract tree construction into a testable utility function (e.g., `buildTreeList()` in a new file `web/components/dashboard/build-tree-list.ts`, or co-located in `DependencyMap.tsx` and re-exported for testing). The function takes `CommissionMeta[]` and `DependencyGraph` and returns a flat array of `{ commission: CommissionMeta, depth: number, awaits?: string[] }`.

**Tree construction tests** go in `tests/components/dashboard-commissions.test.ts` alongside the existing `DependencyMap` data flow tests. Add tests for:
- Tree with single-parent chain: items at correct depths
- Diamond dependency: multi-parent node at root with correct "Awaits:" list
- Isolated nodes: all at depth 0, no "Awaits:" annotations
- Mixed: some independent, some chained, some diamond
- Sort order: children within a parent group sorted by `sortCommissions()`, not globally

**No CSS connector lines in this step.** Connector lines are added in Step 3 after the structure is verified. This step validates tree construction and rendering correctness without visual polish.

**Verification**: `bun run typecheck` passes. `bun run build` passes (critical: confirms no client/server boundary violations). `bun test tests/components/dashboard-commissions.test.ts` passes with new tree construction tests. Manual check: dashboard renders commissions in tree structure with correct indentation depths.

### Step 3: Add CSS connector lines and tree styling

**Files**: `web/components/dashboard/DependencyMap.module.css`, `web/components/dashboard/DependencyMap.tsx` (minor: add CSS class names to tree items)
**Addresses**: REQ-CTREE-5, REQ-CTREE-6, REQ-CTREE-7, REQ-CTREE-23, REQ-CTREE-24

Add CSS classes to `DependencyMap.module.css`:

- `.treeItem`: Base class for indented items. `position: relative` to anchor the `::before` pseudo-element.
- `.depth1`, `.depth2`, `.depth3`, `.depth4`: Fixed depth classes applying `margin-left: calc(N * 24px)`. These pair with `.treeItem` for connector positioning. Using fixed classes instead of inline CSS custom properties satisfies REQ-CTREE-24 (no inline styles).
- `.treeItem::before`: The connector line. `position: absolute`, `border-left: 1px solid var(--color-brass)` for the vertical bar, `border-top: 1px solid var(--color-brass)` for the horizontal tick. `opacity: 0.6`. Positioned to run from the parent's left edge to the child's content. Each `.depthN` class adjusts the `left` position of the `::before` to align the vertical bar with the parent's left edge.
- `.treeConnectorContinue`: For items that are not the last child at their depth, extends the vertical line past the item to connect to the next sibling.
- `.awaitsAnnotation`: "Awaits:" text styling with `color: var(--color-text-muted)`, matching `.worker` class pattern. `font-size: 0.75rem`.

The indentation offset per level is 24px, consistent with the existing card padding (`var(--space-sm)` = 8px). The connector's horizontal tick is 12px wide, connecting the vertical bar to the card content.

Update `DependencyMap.tsx` to apply the CSS classes:
- Root items get no connector classes
- Indented items get `.treeItem` combined with the appropriate depth class (`.depth1` through `.depth4`)
- Items with the "Awaits:" annotation get `.awaitsAnnotation` on the annotation text

**Verification**: Manual visual check. Connector lines render at correct depth with brass color. A dashboard with 3+ levels of nesting shows correct line alignment. A commission with two dependencies renders flat at root with "Awaits:" annotation, not indented.

### Step 4: Replace `NeighborhoodGraph` with upstream/downstream text list

**Files**: `web/components/commission/NeighborhoodGraph.tsx`, `web/components/commission/NeighborhoodGraph.module.css`, `web/app/projects/[name]/commissions/[id]/page.tsx`
**Addresses**: REQ-CTREE-10, REQ-CTREE-11, REQ-CTREE-12, REQ-CTREE-13, REQ-CTREE-14, REQ-CTREE-27

Rewrite `NeighborhoodGraph.tsx` as a server component (remove `"use client"` directive). Remove the `CommissionGraph` import. The component now:

1. Receives `graph: DependencyGraph`, `commissionId: string`, and `projectName: string` as props (same interface).
2. Calls `getNeighborhood(graph, commissionId)`.
3. If `neighborhood.nodes.length <= 1`, returns `null` (REQ-CTREE-13, same as current behavior).
4. Separates edges into upstream (edges where `edge.to === commissionId`) and downstream (edges where `edge.from === commissionId`).
5. Renders "Dependencies" heading (same as current `.heading` class).
6. If upstream list is non-empty: renders "Depends on" subheading with a list of upstream commissions, each showing `StatusBadge` gem, title as a `<Link>` to `commissionHref()`, and status in parentheses.
7. If downstream list is non-empty: renders "Blocks" subheading with the same format.
8. Omits sections with no items (REQ-CTREE-14).

Update `NeighborhoodGraph.module.css` with styles for the upstream/downstream lists:
- `.section`: margins for "Depends on" / "Blocks" sections
- `.sectionHeading`: subheading style
- `.neighborItem`: item with gem + linked title + status text
- Reuse `.wrapper` and `.heading` from the current styles where they fit

The commission detail page (`web/app/projects/[name]/commissions/[id]/page.tsx`) continues to import `NeighborhoodGraph` and pass the same props. Since the component name and props are unchanged, the detail page needs no modification beyond confirming the import still works. The `"use client"` removal means the component is now a server component rendered inside the detail page's server component tree, which is fine.

**Verification**: `bun run typecheck` and `bun run build` pass. Manual check: commission detail page shows "Depends on" and "Blocks" sections with linked items. Isolated commissions show no Dependencies section.

### Step 5: Remove `CommissionGraph` from project page

**Files**: `web/app/projects/[name]/page.tsx`
**Addresses**: REQ-CTREE-28

Remove the `CommissionGraph` import (line 9) and the conditional render block (lines 84-89):
```tsx
{commissionGraph.edges.length > 0 && (
  <CommissionGraph
    graph={commissionGraph}
    compact
    projectName={projectName}
  />
)}
```

The `graphResult` fetch (`/commission/dependency/project/graph`) and `commissionGraph` variable can also be removed since no component on this page uses the graph data anymore. Remove lines related to the graph fetch from the `Promise.all` (line 45) and the `commissionGraph` variable (line 54). Remove the `DependencyGraph` type from the import on line 3 (it is only used for `commissionGraph`, which is being removed; leaving it would be a lint error).

**Verification**: `bun run typecheck` and `bun run build` pass. Manual check: project page Commissions tab renders `CommissionList` without the compact graph above it.

### Step 6: Delete files and prune layout exports

**Files deleted**:
- `web/components/dashboard/CommissionGraph.tsx`
- `web/components/dashboard/CommissionGraph.module.css`

**Files modified**:
- `lib/dependency-graph.ts`: Delete `assignLayers()` (lines 207-355), `orderNodesInLayers()` (lines 364-427), `layoutGraph()` (lines 442-513), `LayoutNode` interface (lines 51-55), `LayoutResult` interface (lines 57-62), `LayoutOptions` interface (lines 64-69), and layout constants `DEFAULT_NODE_WIDTH`, `DEFAULT_NODE_HEIGHT`, `DEFAULT_HORIZONTAL_GAP`, `DEFAULT_VERTICAL_GAP` (lines 73-76)
- `tests/lib/dependency-graph.test.ts`: Remove `layoutGraph` from the import (line 6), delete the entire `describe("layoutGraph", ...)` block (lines 341-595, 8 tests). Keep the `makeNode` helper and all `buildDependencyGraph`/`getNeighborhood`/`buildAdjacencyList` tests.
- `tests/components/dashboard-commissions.test.ts`: Remove `layoutGraph` from the import (line 5), remove the last test in `NeighborhoodGraph data flow` block (`layout produces valid compact dimensions for neighborhood graph`, lines 324-351) since it calls `layoutGraph`. Update the file-level comment (lines 8-18) to remove references to SVG graph decision logic. Keep all other tests.

**Addresses**: REQ-CTREE-17, REQ-CTREE-18

**Pre-deletion verification**: Before deleting files, confirm no remaining imports:
1. Grep for `CommissionGraph` in `web/` and `tests/`: should only appear in files being deleted or already modified in prior steps
2. Grep for `layoutGraph` in all `.ts`/`.tsx` files: should only appear in `lib/dependency-graph.ts` (the definition being deleted) and test files (being updated)
3. Grep for `LayoutNode`, `LayoutResult`, `LayoutOptions` in all `.ts`/`.tsx` files: should only appear in `lib/dependency-graph.ts`

This verification is a concrete step, not an assumption. If any unexpected consumer is found, stop and resolve it before deleting.

Note on REQ-CTREE-17 and NeighborhoodGraph files: `NeighborhoodGraph.tsx` and `NeighborhoodGraph.module.css` are rewritten in-place in Step 4, not deleted and recreated. The spec lists them under "deleted entirely," but the component name and file path are preserved with entirely new contents. The old SVG-rendering code and its CSS are gone; the files are reused for the replacement component. This satisfies the spirit of REQ-CTREE-17: the old NeighborhoodGraph implementation is eliminated. Both files must have zero surviving lines from the original after Step 4 completes. The original `.module.css` had only `.wrapper` (margin) and `.heading` (font/color); Step 4 replaces all content with the upstream/downstream list styles, reusing `.wrapper` and `.heading` names if the styling fits. If a literal deletion and re-creation is preferred for a cleaner git diff, that's acceptable but not required.

**Verification**: `bun test` (full suite) passes. `bun run typecheck` passes. `bun run build` passes. No missing module errors.

### Step 7: Mark graph-scrollable-container spec as superseded

**Files**: `.lore/specs/ui/graph-scrollable-container.md`
**Addresses**: REQ-CTREE-25

Update the frontmatter `status` from `implemented` to `superseded`. Add a note at the top of the document body:

> **Superseded by**: [Commission Graph to Tree List](commission-graph-to-tree-list.md). The SVG graph this spec addressed has been replaced with a CSS tree list. The scrolling problems described here no longer exist.

**Verification**: None required beyond the file edit.

### Step 8: Validate against spec

Launch a sub-agent that reads the spec at `.lore/specs/ui/commission-graph-to-tree-list.md`, reviews the implementation, and flags any requirements not met. This step is not optional.

The validation agent should:
1. Check each REQ-CTREE-N against the implementation
2. Run `bun test` to confirm all tests pass
3. Run `bun run build` to confirm clean production build
4. Grep for any remaining references to deleted files or exports
5. Verify the graph-scrollable-container spec status is `superseded`

**Expertise**: fresh-context code review agent

## Delegation Guide

Steps requiring specialized review:

- **Step 1** (buildAdjacencyList + test updates): Code review after tests pass. The reviewer should verify that the adjacency list correctly maps `edge.from` to children (not `edge.to`), since the edge direction convention (from=upstream, to=downstream) is easy to reverse. Use `code-reviewer` agent.

- **Step 2** (tree list rewrite): This is the highest-risk step. The tree construction logic (root identification, diamond detection, recursive child attachment, sort order within groups) is the core algorithm. Review after `bun run build` passes. Use `code-reviewer` agent with explicit instruction to verify:
  - Root-level items include both zero-dependency nodes AND multi-parent nodes
  - Single-parent nodes indent under their parent, not at root
  - Sort order within each parent group uses `sortCommissions()`, not global sort
  - "Awaits:" annotation lists upstream titles, not downstream

- **Step 6** (deletion): Before deleting, the implementer runs the grep verification described in the step. A `code-reviewer` pass after deletion confirms no broken imports survive. `bun run build` is the strongest signal here; a clean build with no missing modules is definitive.

- **Step 8** (spec validation): Fresh-context sub-agent. This is the final gate. The agent has no implementation context and reads only the spec and the code, catching what the implementer takes for granted.

Consult `.lore/lore-agents.md` for available domain-specific agents.

## Open Questions

None. The spec is self-contained with resolved decisions. All design questions were settled in the brainstorm.
