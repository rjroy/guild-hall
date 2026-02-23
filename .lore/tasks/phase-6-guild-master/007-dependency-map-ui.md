---
title: Render dependency map SVG and neighborhood graph in views
date: 2026-02-23
status: complete
tags: [task]
source: .lore/plans/phase-6-guild-master.md
related: [.lore/specs/guild-hall-views.md]
sequence: 7
modules: [guild-hall-ui]
---

# Task: Render Dependency Map SVG and Neighborhood Graph in Views

## What

Create SVG rendering components consuming the graph library (Task 6) and integrate them into three views: Dashboard, Commission, and Project.

**components/dashboard/CommissionGraph.tsx (new):**

Client component rendering an inline SVG:
- Calls `layoutGraph()` to get positioned nodes and edges.
- Nodes: rounded rectangles with gem-colored fill matching commission status. Uses existing GemIndicator CSS variables (`--gem-active`, `--gem-pending`, etc.) for fill colors. Glassmorphic panel aesthetics (semi-transparent, border).
- Node labels: commission title, truncated to fit. Full title on hover (SVG `<title>` element).
- Edges: straight lines with arrowheads (SVG `<marker>` + `<line>`).
- Click on node navigates to commission view (Next.js `useRouter` or `<Link>`).
- SVG viewBox scales to fit the layout dimensions with padding.

Props: `{ graph: DependencyGraph; compact?: boolean }`. Compact mode uses smaller node sizing for the project view.

**components/dashboard/DependencyMap.tsx (update):**

Replace flat card list with `CommissionGraph` when edges exist:
```
const graph = buildDependencyGraph(commissions);
if (graph.edges.length > 0) {
  return <Panel title="Task Dependency Map"><CommissionGraph graph={graph} /></Panel>;
} else {
  // Keep existing flat card list for independent commissions
}
```

**components/commission/NeighborhoodGraph.tsx (new):**

Mini version of CommissionGraph showing only the neighborhood subgraph. Uses `getNeighborhood()` to extract the relevant portion. Compact layout, fewer labels. Highlights the focal commission node with a distinct border.

**app/projects/[name]/commissions/[id]/page.tsx (update):**

Add NeighborhoodGraph below the commission header, above the prompt section. Build neighborhood from all commissions in the project.

**app/projects/[name]/page.tsx (update, REQ-VIEW-18):**

Add compact project-scoped dependency graph to the Project view using `CommissionGraph` with `compact: true`. Same edges-exist fallback: show graph when dependencies exist, omit when all commissions are independent. Always scoped to this project's commissions.

**CSS modules:** `CommissionGraph.module.css` and `NeighborhoodGraph.module.css` for node styling, edge styling, hover states, and compact mode adjustments. Use existing design tokens from `globals.css`.

## Validation

- CommissionGraph renders SVG with correct number of `<rect>` nodes and `<line>` edges
- Nodes colored by commission status using gem CSS variables
- Click on a node navigates to the commission detail view
- Hover on node shows full title
- DependencyMap uses CommissionGraph when edges exist
- DependencyMap falls back to flat card list when no edges
- NeighborhoodGraph renders only the focal commission and its neighbors
- NeighborhoodGraph highlights the focal commission visually
- Commission detail page includes the neighborhood graph
- Project view includes compact dependency graph when dependencies exist
- Project view omits graph when all commissions are independent
- Compact mode renders with smaller node dimensions
- SVG viewport scales to fit graph dimensions
- All tests pass, linting clean, commit created (triggers pre-commit hook validation)

## Why

From `.lore/specs/guild-hall-views.md`:
- REQ-VIEW-12.3 (part of REQ-VIEW-12): "Commission Dependency Map (center): visual DAG of commissions with color-coded status nodes. Clicking a node navigates to the Commission view."
- REQ-VIEW-14: "The dependency map renders commissions as connected nodes following the dependency graph."
- REQ-VIEW-18: "Project dependency graph (compact) shows the commission DAG for this project."
- REQ-VIEW-22: "Dependencies section shows a mini dependency graph centered on this commission's neighborhood."

## Files

- `components/dashboard/CommissionGraph.tsx` (create)
- `components/dashboard/CommissionGraph.module.css` (create)
- `components/dashboard/DependencyMap.tsx` (modify)
- `components/dashboard/DependencyMap.module.css` (modify)
- `components/commission/NeighborhoodGraph.tsx` (create)
- `components/commission/NeighborhoodGraph.module.css` (create)
- `app/projects/[name]/commissions/[id]/page.tsx` (modify)
- `app/projects/[name]/page.tsx` (modify)
- `tests/components/dashboard/DependencyMap.test.tsx` (modify)
