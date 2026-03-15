---
title: Commission graph to tree list
date: 2026-03-14
status: draft
tags: [ui, commissions, visualization, dashboard, dependency-graph, tree-list, css]
modules: [web/components/dashboard/DependencyMap, web/components/commission/NeighborhoodGraph, web/app/projects, lib/dependency-graph]
related:
  - .lore/brainstorm/commission-graph-to-tree-list.md
  - .lore/specs/ui/guild-hall-views.md
  - .lore/specs/ui/graph-scrollable-container.md
  - .lore/specs/ui/commission-list-filtering.md
  - .lore/specs/ui/artifact-sorting.md
  - .lore/research/wide-dag-visualization-patterns.md
  - .lore/reference/dependency-graph.md
  - .lore/reference/dashboard.md
req-prefix: CTREE
---

# Spec: Commission Graph to Tree List

## Overview

Replace the SVG commission dependency graph with a CSS indented tree list on the dashboard, and replace the SVG neighborhood graph on the commission detail page with an upstream/downstream text list. The SVG layout algorithm (Sugiyama-style layer assignment, barycentric ordering, coordinate computation) and all SVG rendering components are deleted. The graph data structures (`buildDependencyGraph`, `getNeighborhood`, `GraphNode`, `GraphEdge`, `DependencyGraph`) are kept because the tree list still needs to know which commissions depend on which.

The flat card list that `DependencyMap.tsx` already renders when no edges exist is the foundation. The tree list extends that pattern with indentation and CSS connector lines for commissions that have dependencies.

Source decisions: `.lore/brainstorm/commission-graph-to-tree-list.md` (status: resolved). All design questions were settled there.

## Entry Points

- Dashboard "Task Dependency Map" panel (from `DependencyMap.tsx`, per REQ-VIEW-14)
- Project page Commissions tab (from `web/app/projects/[name]/page.tsx`, per REQ-VIEW-18)
- Commission detail page "Dependencies" section (from `NeighborhoodGraph.tsx`, per REQ-VIEW-22)

## Requirements

### Dashboard tree list

- REQ-CTREE-1: `DependencyMap` always renders the card list. The binary branch (SVG graph when edges exist, flat list otherwise) is removed. When commissions have dependencies, dependent commissions render indented under their parent with CSS connector lines. When no dependencies exist, the result is visually identical to the current flat card list.

- REQ-CTREE-2: Each card in the tree list shows: `StatusBadge` gem, commission title (with "Recurring" badge for scheduled commissions), worker display title, and progress text. This matches the existing flat card layout in `DependencyMap` (gem, title, worker, progress pattern) and `DependencyMap.module.css`.

- REQ-CTREE-3: Root-level items are commissions with zero dependencies (no incoming edges) and commissions with two or more dependencies (diamond case, see REQ-CTREE-8). Root-level items sort by the existing `sortCommissions()` order: status group (idle, active, failed, done), then by date within group.

- REQ-CTREE-4: A commission with exactly one dependency renders indented under its parent. Indentation depth corresponds to the commission's position in the dependency chain (depth 1 for a direct child, depth 2 for a grandchild, and so on). Children at each depth level sort by status within their own parent group using the same `sortCommissions()` comparator, not across the entire tree.

- REQ-CTREE-5: CSS connector lines visually link parent and child commissions. Each indented item has a vertical line running from the parent's left edge and a short horizontal tick connecting to the child. The connectors use `::before` pseudo-elements with `border-left` (vertical) and `border-top` (horizontal).

- REQ-CTREE-6: Connector line styling uses `var(--color-brass)` at reduced opacity, consistent with the existing edge stroke style (`stroke: var(--color-brass); stroke-opacity: 0.6` in the current `CommissionGraph.module.css`). Line weight is 1px solid.

- REQ-CTREE-7: Each indentation level adds a fixed left offset. The connector lines and card content align to a grid so that items at the same depth share the same left edge.

### Diamond dependency handling

- REQ-CTREE-8: A commission with two or more dependencies (multiple incoming edges, i.e., multiple edges where `edge.to === commissionId`) renders at the root level, not indented under any parent. It displays an "Awaits:" annotation listing the titles of all its upstream dependencies (the `edge.from` nodes), rendered in muted text below the progress line.

  Rationale: A tree is a tree; a DAG is not. Forcing a DAG into tree structure creates misleading visual hierarchy. Single-parent chains indent naturally. Multi-parent nodes stay flat with annotations.

- REQ-CTREE-9: The "Awaits:" annotation uses `var(--color-text-muted)` styling, consistent with the `.worker` class. Commission titles in the annotation are plain text (not links). If a dependency title is unavailable (edge points to an unknown node), the commission ID is shown instead.

### Project page cleanup

- REQ-CTREE-28: The Project page (`web/app/projects/[name]/page.tsx`) currently imports and renders `CommissionGraph` in compact mode on the Commissions tab (lines 9, 84-89). This import and usage must be removed when `CommissionGraph.tsx` is deleted. The Project page already has `CommissionList` for its commission display; removing the compact graph is sufficient. No replacement graph or tree is needed on the Project page because `CommissionList` (with filtering per the commission-list-filtering spec) serves that view.

### Commission detail neighborhood replacement

- REQ-CTREE-10: The SVG neighborhood graph on the commission detail page is replaced with a two-section text list: "Depends on" (upstream) and "Blocks" (downstream). The wrapping section heading remains "Dependencies" (matching the current `NeighborhoodGraph` heading). Each section lists the relevant commissions with their `StatusBadge` gem, title, and status in parentheses.

- REQ-CTREE-11: The "Depends on" section lists commissions where an edge runs from that commission to the focal commission (the focal commission depends on them). The "Blocks" section lists commissions where an edge runs from the focal commission to that commission (they depend on the focal commission). Both lists come from `getNeighborhood()`.

- REQ-CTREE-12: Each item in the upstream/downstream lists links to the commission's detail page (using `commissionHref()`). The focal commission itself does not appear in either list.

- REQ-CTREE-13: If the commission has no upstream dependencies and no downstream dependents (isolated node), the neighborhood section does not render. This matches the current `NeighborhoodGraph` behavior (line 29: `if (neighborhood.nodes.length <= 1) return null`).

- REQ-CTREE-14: Sections with no items are omitted. If a commission has upstream dependencies but no downstream dependents, only "Depends on" renders (and vice versa).

### Scheduled and spawned commissions

- REQ-CTREE-15: Scheduled commissions keep the existing flat list styling: `scheduledCard` (left brass border) and `scheduledBadge` (inline uppercase "Recurring" badge). No changes to their visual treatment.

- REQ-CTREE-16: Spawned commissions (one-shots linked via `sourceSchedule`) render as children of their parent schedule in the tree. `buildDependencyGraph()` already creates edges from schedule to spawned commission (lines 137-148). The tree renders these naturally:

  ```
  [gem] daily-review-check (Recurring)       <- scheduledCard styling, root level
    |-- [gem] commission-reviewer-20260314   <- spawned child, indented
    |-- [gem] commission-reviewer-20260313   <- spawned child, indented
  ```

### Deletion inventory

- REQ-CTREE-17: The following files are deleted entirely:
  - `web/components/dashboard/CommissionGraph.tsx` (247 lines)
  - `web/components/dashboard/CommissionGraph.module.css` (72 lines)
  - `web/components/commission/NeighborhoodGraph.tsx` (44 lines)
  - `web/components/commission/NeighborhoodGraph.module.css` (9 lines)

- REQ-CTREE-18: The following exports are removed from `lib/dependency-graph.ts`:
  - `layoutGraph()` function (lines 442-513)
  - `assignLayers()` function (lines 207-355)
  - `orderNodesInLayers()` function (lines 364-427)
  - `LayoutNode` interface (lines 51-55)
  - `LayoutResult` interface (lines 57-62)
  - `LayoutOptions` interface (lines 64-69)
  - Layout constants: `DEFAULT_NODE_WIDTH`, `DEFAULT_NODE_HEIGHT`, `DEFAULT_HORIZONTAL_GAP`, `DEFAULT_VERTICAL_GAP` (lines 73-76)

### Retained code

- REQ-CTREE-19: The following remain in `lib/dependency-graph.ts`, unchanged:
  - `buildDependencyGraph()` function (lines 110-153)
  - `getNeighborhood()` function (lines 164-196)
  - `GraphNode`, `GraphEdge`, `DependencyGraph` interfaces (lines 27-49)
  - `extractCommissionId()` function (lines 89-98)
  - `CommissionGraphInput` interface (lines 12-23)

### New utility function

- REQ-CTREE-20: A new `buildAdjacencyList()` function is added to `lib/dependency-graph.ts`. Signature: `buildAdjacencyList(graph: DependencyGraph): Map<string, string[]>`. It returns a map from each parent commission ID to an array of its direct child commission IDs (commissions that depend on it, i.e., edges where `edge.from` equals the parent). Built in O(n) from the edge list.

  The tree list component calls this once to determine parent-child relationships for indentation.

### Interaction with commission list filtering

- REQ-CTREE-21: The dashboard tree list is a separate component from the project page `CommissionList`. The commission list filter (REQ-CFILTER-1 through REQ-CFILTER-14) applies to the project page commission list, not to the dashboard tree. These are independent components on different pages.

- REQ-CTREE-22: If commission list filtering is later added to the dashboard tree, the filter should apply before tree construction: filter the `CommissionMeta[]` array, then build the graph and tree from the filtered set. Orphaned children (child visible but parent filtered out) would render at root level. This is noted as a future consideration, not a current requirement.

### CSS approach

- REQ-CTREE-23: Tree connector lines are implemented with CSS pseudo-elements only. No SVG, no canvas, no JavaScript-computed positions. The connectors use:
  - `::before` on indented items for the vertical bar (`border-left: 1px solid`) and horizontal tick (`border-top: 1px solid`)
  - Positioned via `position: relative` on the list item and `position: absolute` on the pseudo-element
  - Colors from design tokens: `var(--color-brass)` with `opacity: 0.6`

- REQ-CTREE-24: All new styles live in `DependencyMap.module.css` (extending the existing card styles) and a new CSS module for the neighborhood replacement component. No inline styles.

### Superseded specs

- REQ-CTREE-25: The spec "Scrollable Container for Commission Dependency Graph" (`.lore/specs/ui/graph-scrollable-container.md`, REQ-GRAPH-1 through REQ-GRAPH-6) is superseded by this spec. Its requirements addressed SVG scaling and scrolling problems that no longer exist with the tree list approach. Its status should be updated to `superseded` with a reference to this spec.

### Server/client boundary

- REQ-CTREE-26: `DependencyMap` remains a server component. The tree list renders static HTML with CSS connector lines. No client-side interactivity is required (no collapse, no hover state beyond CSS `:hover`, no drag). Links use Next.js `<Link>` which works in server components.

- REQ-CTREE-27: The neighborhood replacement on the commission detail page is also a server component. It receives the `DependencyGraph` as a prop and renders static upstream/downstream lists with links.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Commission card click | User clicks a commission in the tree list | Commission detail view (existing `commissionHref()`) |
| Neighborhood item click | User clicks an item in the upstream/downstream list | Commission detail view (existing `commissionHref()`) |

## Success Criteria

- [ ] Dashboard renders all commissions in a tree list, with independent commissions flat and dependent commissions indented
- [ ] CSS connector lines are visible between parent and child commissions, using brass color tokens
- [ ] A commission with two or more dependencies renders at root level with an "Awaits:" annotation listing its dependencies
- [ ] Scheduled commissions display with the existing `scheduledCard` left border and "Recurring" badge
- [ ] Spawned commissions appear indented under their parent schedule
- [ ] Commission detail page shows "Depends on" and "Blocks" sections instead of the SVG neighborhood graph
- [ ] Clicking a commission in either the tree list or the neighborhood list navigates to the commission detail page
- [ ] `CommissionGraph.tsx`, `CommissionGraph.module.css`, `NeighborhoodGraph.tsx`, and `NeighborhoodGraph.module.css` are deleted
- [ ] `layoutGraph()`, `assignLayers()`, `orderNodesInLayers()`, and associated types/constants are removed from `lib/dependency-graph.ts`
- [ ] `buildDependencyGraph()`, `getNeighborhood()`, and graph data structures remain functional
- [ ] `buildAdjacencyList()` exists in `lib/dependency-graph.ts` and returns correct parent-to-children mappings
- [ ] Project page no longer imports or renders `CommissionGraph`
- [ ] No SVG rendering anywhere in the commission visualization pipeline
- [ ] The graph-scrollable-container spec is marked as superseded

## AI Validation

**Defaults apply:**
- Unit tests with mocked time/network/filesystem
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Unit test: `buildAdjacencyList()` returns correct parent-to-children map for a graph with single-parent chains, diamond dependencies, and isolated nodes.
- Unit test: tree construction logic correctly identifies root-level items (zero dependencies + multi-parent nodes) and indented items (single-parent nodes).
- Unit test: diamond dependency detection (commission with 2+ incoming edges) produces correct "Awaits:" annotation data.
- Unit test: `getNeighborhood()` output correctly separates into upstream (depends-on) and downstream (blocks) lists.
- Manual: verify connector lines render at correct depth with brass color on a dashboard with 3+ levels of dependency nesting.
- Manual: verify a commission with two dependencies renders flat at root level with "Awaits:" annotation, not indented under either parent.
- Build verification: confirm deleted files are not imported anywhere (clean build with no missing module errors).

## Constraints

- No collapsibility. The brainstorm resolved this: commission list filtering handles long lists better than manual collapse. No interaction state to persist.
- No urgency bubbling from children to parents. Root-level sort is by the commission's own status, not by the worst status of its children.
- The flat card list pattern (gem + title + worker + progress) is the only card format. No compact or expanded variants.
- `DependencyMap` remains a server component. The tree list is pure HTML + CSS.
- The connector line implementation is CSS-only. No JavaScript layout computation for the tree.
- Existing tests for `buildDependencyGraph()`, `getNeighborhood()`, and `extractCommissionId()` must continue to pass.
- Tests that import `layoutGraph`, `LayoutNode`, `LayoutResult`, or `LayoutOptions` must be updated or removed alongside the code.

## Context

- [Brainstorm: Commission Graph to Tree List](./../brainstorm/commission-graph-to-tree-list.md): source of all design decisions. Resolved: indented tree (Idea 1), diamond handling (Option C), replace NeighborhoodGraph, no collapsibility, sort by status, `buildAdjacencyList()` utility.
- [Spec: Guild Hall Views](guild-hall-views.md): REQ-VIEW-14 (dependency map), REQ-VIEW-22 (neighborhood graph). This spec replaces the SVG implementations of both.
- [Spec: Scrollable Container](graph-scrollable-container.md): REQ-GRAPH-1 through REQ-GRAPH-6 are superseded. The scrolling problem disappears with the tree list because it flows naturally in the page layout.
- [Spec: Commission List Filtering](commission-list-filtering.md): REQ-CFILTER-1 through REQ-CFILTER-14 apply to the project page `CommissionList`, not to the dashboard tree. These are independent components.
- [Spec: Artifact Sorting](artifact-sorting.md): documents `sortCommissions()` and the four status groups used for root-level sort order.
- [Research: Wide DAG Visualization Patterns](./../research/wide-dag-visualization-patterns.md): survey of 8 CI/CD tools confirms that every tool that scales provides a list/table alternative to graph visualization.
- [Reference: Dependency Graph](./../reference/dependency-graph.md): excavated documentation of the current implementation, covering all files and functions affected by this spec.
- [Reference: Dashboard](./../reference/dashboard.md): documents the binary graph/list branch in `DependencyMap` that this spec eliminates.
- [Retro: Phase 4 Commissions](./../retros/phase-4-commissions.md): reminder that unit test pass rates don't guarantee runtime correctness. Runtime verification needed alongside unit tests.
