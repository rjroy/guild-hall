---
title: Replacing SVG commission graph with tree list
date: 2026-03-14
status: open
tags: [ux, commissions, visualization, dashboard, dependency-graph]
modules: [web/components/dashboard/CommissionGraph, web/components/dashboard/DependencyMap, web/components/commission/NeighborhoodGraph, lib/dependency-graph]
related:
  - .lore/research/wide-dag-visualization-patterns.md
  - .lore/specs/ui/guild-hall-views.md
---

# Brainstorm: Commission Graph to Tree List

## Problem

`CommissionGraph.tsx` renders an SVG DAG using a Sugiyama-style layout algorithm (`lib/dependency-graph.ts`, 513 lines of layer assignment, barycentric ordering, and coordinate computation). In practice, most commissions are independent one-offs with no dependencies. `DependencyMap.tsx:39` already gates on `graph.edges.length > 0`, showing the SVG only when edges exist and falling back to a flat card list otherwise.

The flat card list (DependencyMap lines 47-89) already looks good: `StatusBadge` gem, title with optional "Recurring" badge, worker name, and progress text. The SVG adds visual noise without proportional value. The prior research (`.lore/research/wide-dag-visualization-patterns.md`) confirms this: every CI/CD tool that scales eventually offers a list/table alternative to the graph.

The proposal: remove the SVG entirely, always use the flat card list, and enhance it to show dependency relationships when they exist.

## Idea 1: Indented Tree with CSS Connector Lines

Show dependency chains as indented items with subtle vertical/horizontal connector lines drawn via CSS pseudo-elements, similar to a file tree or `tree` command output.

**How it works:**
- Root commissions (no dependencies) render at the top level, flush left.
- Dependent commissions indent under their dependency, with a thin brass-colored vertical line from the parent's left edge and a short horizontal tick connecting to the child.
- The connector lines use `::before` pseudo-elements on the indented items: a vertical bar (left border on a positioned element) and a horizontal tick (top border).

**Visual:**
```
[gem] Commission A (root)
  |-- [gem] Commission B (depends on A)
  |   |-- [gem] Commission D (depends on B)
  |-- [gem] Commission C (depends on A)
[gem] Commission E (independent)
```

**Fits the aesthetic:** The connector lines would use `var(--color-brass)` at low opacity, consistent with the existing `edge` stroke style in `CommissionGraph.module.css:44` (`stroke: var(--color-brass); stroke-opacity: 0.6`). The overall look is closer to a guild ledger or scroll than a circuit diagram.

**Implementation:** CSS only, no SVG. The indentation depth is the node's layer from `assignLayers()`. The connector lines are `::before`/`::after` pseudo-elements with `border-left` and `border-top`.

**What if:** This is the simplest approach and the one most consistent with how the rest of the UI works (HTML + CSS Modules, no SVG). It naturally handles deep chains without the horizontal expansion problem that makes the SVG noisy. The information density is higher because each row shows status badge, title, worker, and progress text, not just a truncated label.

## Idea 2: Flat List with Dependency Annotations

Don't use visual structure at all. Keep the flat card list exactly as is, but add a small "depends on: Commission A" annotation below the progress text when a commission has dependencies.

**How it works:**
- Same flat list as the current fallback.
- Commissions with dependencies get a small annotation line in muted text: "Awaits: Commission A, Commission C".
- Commissions with dependents could optionally show "Blocks: Commission D" but this might be noise.

**Visual:**
```
[gem] Commission A
[gem] Commission B
      Awaits: Commission A
[gem] Commission C
      Awaits: Commission A
[gem] Commission D
      Awaits: Commission B
```

**Fits the aesthetic:** Minimal change. The annotation uses `var(--color-text-muted)` like the existing `.worker` class.

**What if:** This is the least disruptive option. It requires no layout algorithm at all. It preserves the sort order from `sortCommissions()` (which groups by status, not by dependency topology). The downside is that you can't visually trace chains; you have to read the annotation and search for the named commission. For the common case (0-2 dependencies), this is fine. For longer chains, it would be harder to follow than the tree.

## Idea 3: Grouped Sections with Dependency Headers

Group dependent commissions under a collapsible section headed by their root dependency.

**How it works:**
- Independent commissions render in a flat list as today.
- Commissions that form dependency chains are grouped under a section header named after the root commission.
- Within each group, commissions are ordered topologically.

**What if:** This adds UI complexity (collapsible sections) without a clear benefit over the indented tree. The tree is more information-dense and requires less chrome. Parking this idea.

## Recommendation: Idea 1 (Indented Tree)

The indented tree with CSS connector lines is the strongest option. It's visually clear, fits the existing aesthetic, uses standard HTML/CSS (no SVG), and naturally handles both the common case (flat list, no indentation) and the dependency case (indented tree).

## Diamond Dependencies

Commission A depends on both B and C. How should this render?

**Option A: Appear once, annotate multiple parents.** Commission A appears once in the tree, indented under its primary dependency (first in the `dependencies` array). A small annotation shows the other dependency: "Also awaits: Commission C". This keeps the tree clean but introduces a concept of "primary" dependency that doesn't exist in the data model.

**Option B: Appear under the last dependency in topological order.** Place Commission A under whichever dependency resolves later (higher layer number). This is consistent with "you can't start until your last dependency finishes" but the positioning logic is subtle.

**Option C: Flat with annotations for multi-parent nodes.** Any commission with 2+ dependencies renders at the top level (not indented) with an "Awaits: B, C" annotation. Only single-parent commissions get tree indentation. This is simple and honest: the tree shows what can be shown as a tree, and everything else stays flat.

**Recommendation: Option C.** It's the most honest representation. A tree is a tree; a DAG is not. Forcing a DAG into tree structure creates misleading visual hierarchy. Commissions with a single dependency indent naturally. Commissions with multiple dependencies render flat with annotations. This sidesteps the diamond problem entirely by not pretending it's a tree when it isn't.

This also means the implementation can skip the full topological sort for tree rendering. Single-parent chains can be walked with a simple parent lookup. Multi-parent nodes drop to the root level with annotations.

## Scope: NeighborhoodGraph on the Detail Page

`NeighborhoodGraph.tsx` renders a compact SVG showing a commission and its immediate neighbors (direct dependencies + direct dependents, via `getNeighborhood()`). It only renders when the commission has at least one neighbor (line 29).

**Should it also be replaced?**

The case for keeping it: The neighborhood is always small (1 focal node + its immediate neighbors). The SVG works well at this scale. The compact layout options (`nodeWidth: 120, nodeHeight: 40`) keep it tight. The focal node highlight (`focalNodeId`) adds value that's hard to replicate in a list.

The case for replacing it: Consistency. If the dashboard uses a tree/list, the detail page should too. Two different visualization paradigms for the same data is cognitive overhead. The neighborhood information could be shown as a simple three-section list: "Depends on" (upstream), "This commission" (focal), "Blocks" (downstream).

**Recommendation: Replace it.** The neighborhood is small enough that a structured text list communicates the same information more clearly:

```
Depends on:
  [gem] Commission B (completed)
  [gem] Commission C (in_progress)

Blocks:
  [gem] Commission D (pending)
  [gem] Commission E (draft)
```

This is clearer than a compact SVG where you have to decode node positions to understand direction. The labels "Depends on" and "Blocks" make the relationship explicit. The SVG relies on spatial position (upstream nodes above, downstream below) to convey direction, which is subtle.

The `getNeighborhood()` function in `lib/dependency-graph.ts:164-196` already separates upstream (`edge.to === commissionId`) from downstream (`edge.from === commissionId`), so the data is ready.

## Scheduled Commissions in the Tree/List

Currently, the SVG uses a double-border (dashed outer `rect`) and a "Recurring" text badge for scheduled commissions. The flat card list already handles this with `styles.scheduledCard` (left brass border, `DependencyMap.module.css:58-60`) and `styles.scheduledBadge` (small uppercase badge, lines 62-75).

**Recommendation: Keep the existing flat list treatment.** The `scheduledCard` left border and `scheduledBadge` inline badge work well and are already built. No change needed. The tree indentation works orthogonally to the scheduled styling.

Spawned commissions (one-shots created by a schedule, linked via `sourceSchedule`) would appear as dependents of the schedule commission if `buildDependencyGraph()` creates edges for them (it does, lines 137-148). In the tree view, a scheduled commission with its spawned children would look like:

```
[gem] daily-review-check (Recurring)         <- scheduledCard styling
  |-- [gem] commission-reviewer-20260314     <- spawned child
  |-- [gem] commission-reviewer-20260313     <- spawned child
```

This naturally groups schedule families, which the current SVG also does but with less clarity.

## What Gets Deleted

If this moves forward:

1. `web/components/dashboard/CommissionGraph.tsx` (247 lines) and `CommissionGraph.module.css` (72 lines). Entirely removed.
2. `lib/dependency-graph.ts`: The `layoutGraph()` function (lines 442-513), `assignLayers()` (lines 207-355), and `orderNodesInLayers()` (lines 364-427) become dead code. The `LayoutNode`, `LayoutResult`, `LayoutOptions` types (lines 51-69) and the layout constants (lines 73-77) go too. That's roughly 370 lines of layout algorithm removed.
3. `lib/dependency-graph.ts`: `buildDependencyGraph()`, `getNeighborhood()`, `GraphNode`, `GraphEdge`, `DependencyGraph`, and `extractCommissionId` stay. These are the graph data structures, not the layout. The tree view still needs them to know which commissions depend on which.
4. `web/components/commission/NeighborhoodGraph.tsx` (44 lines) and `NeighborhoodGraph.module.css` (9 lines). Replaced with a simpler upstream/downstream list component.

Net: roughly 370 lines of layout algorithm and 320 lines of SVG rendering removed, replaced with a CSS-based tree list that reuses the existing card pattern from the flat fallback.

## Open Questions

1. **Sort order within the tree.** The flat list uses `sortCommissions()` which groups by status priority. In a tree, children should appear under their parent regardless of status. Should root-level items still sort by status, with children sorted by status within their parent group? Or should the entire tree follow topological order?

2. **Collapsibility.** Should dependency chains be collapsible? The flat list has no need for it, but a tree with spawned schedule children could get long. Leaning "no" for now, since the existing card list doesn't collapse either, and the commission list filtering feature (`.lore/brainstorm/commission-list-filtering.md`) already provides status-based filtering.

3. **Performance of parent lookup.** The tree rendering needs a "children of node X" lookup. `buildDependencyGraph()` returns edges as `{from, to}` pairs. Building an adjacency list (Map<parentId, childId[]>) from the edges is O(n) and trivial, but it's a new data structure that doesn't exist yet. Minor concern.
