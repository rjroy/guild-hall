---
title: Dependency Graph Viewer
date: 2026-03-01
status: current
tags: [dependency-graph, visualization, svg, layout, commissions]
modules: [lib-dependency-graph, web-commission, web-dashboard]
---

# Feature: Dependency Graph Viewer

## What It Does

The dependency graph viewer renders commission dependency relationships as interactive SVG diagrams. It is a visualization layer, not a system. The graph data comes from commission frontmatter (each commission's `dependencies` field lists other commission IDs it depends on). The viewer constructs a directed graph from that metadata, lays it out using a Sugiyama-style algorithm, and renders clickable nodes colored by commission status. It appears in three places: the dashboard's dependency map (full project graph), the project view's commissions tab (compact project graph), and the commission detail page (1-hop neighborhood around a focal commission).

## Capabilities

- **Full project graph**: Renders all commissions and their dependency edges for a project. Used on the dashboard (`DependencyMap`) and the project view commissions tab. Falls back to a flat sorted card list when no dependency edges exist.
- **Neighborhood subgraph**: Extracts a focal commission plus its immediate neighbors (direct dependencies and direct dependents) and renders just that subgraph. Used on the commission detail page. Hides entirely if the commission is isolated (no edges).
- **Layered layout**: Sugiyama-style algorithm assigns layers via topological sort (Kahn's algorithm), orders nodes within layers using barycentric heuristic to reduce edge crossings, then assigns x/y coordinates with centering. Handles cycles by breaking back-edges during layer assignment.
- **Status coloring**: Each node's fill and stroke color reflects commission status via a gem-color mapping. Running commissions are amber, completed are green, failed are red, etc.
- **Clickable navigation**: Clicking a node navigates to that commission's detail page.
- **Focal highlighting**: When rendered on the commission detail page, the focal commission's node gets a distinct border to distinguish it from its neighbors.

## Entry Points

No direct entry points. The dependency graph viewer is a pure computation library (`lib/dependency-graph.ts`) plus three rendering components consumed by other features.

## Implementation

### Files Involved

| File | Role |
|------|------|
| `lib/dependency-graph.ts` | Pure computation: `buildDependencyGraph()` (constructs `DependencyGraph` from `CommissionMeta[]`), `getNeighborhood()` (extracts 1-hop subgraph), `layoutGraph()` (Sugiyama-style layer assignment + barycentric ordering + coordinate assignment). Types: `GraphNode`, `GraphEdge`, `DependencyGraph`, `LayoutNode`, `LayoutResult`. Helper: `extractCommissionId()` filters deps to commission-to-commission references only. |
| `apps/web/components/dashboard/CommissionGraph.tsx` | Client component: SVG rendering of a laid-out graph. Calls `layoutGraph()`, draws edges with arrowhead markers, draws status-colored rect nodes with labels, supports `compact` mode and `focalNodeId` highlighting. Uses `useId()` for unique SVG marker IDs. |
| `apps/web/components/dashboard/DependencyMap.tsx` | Server component: decides between graph and flat list. Calls `buildDependencyGraph()`, renders `CommissionGraph` when edges exist, otherwise renders sorted commission cards. Exports `commissionHref()` used by `CommissionGraph` for navigation. |
| `apps/web/components/commission/NeighborhoodGraph.tsx` | Client component: thin wrapper that calls `getNeighborhood()` to extract the 1-hop subgraph, then renders `CommissionGraph` with `compact` and `focalNodeId` props. Returns null if the commission is isolated (single node, no edges). |
| `apps/web/components/commission/NeighborhoodGraph.module.css` | Styles for the neighborhood graph wrapper. |

### Data

No data of its own. Reads from commission metadata (`CommissionMeta.dependencies` field) provided by the consuming features.

### Dependencies

- Uses: Commission metadata from `lib/commissions.ts` (`CommissionMeta` with `dependencies` field)
- Used by: [dashboard](./dashboard.md) (`DependencyMap` on the main dashboard)
- Used by: [project-view](./project-view.md) (`CommissionGraph` on the commissions tab)
- Used by: [commissions](./commissions.md) (`NeighborhoodGraph` on the commission detail page)

## Connected Features

| Feature | Relationship |
|---------|-------------|
| [commissions](./commissions.md) | Commission detail page renders NeighborhoodGraph; commission frontmatter provides the dependency data |
| [dashboard](./dashboard.md) | DependencyMap renders full project graph on dashboard |
| [project-view](./project-view.md) | Commissions tab renders CommissionGraph when edges exist |

## Implementation Status

| Layer | Status | Notes |
|-------|--------|-------|
| Backend API | N/A | Pure client-side computation, no API |
| Frontend UI | Complete | Three rendering contexts: full graph, compact graph, neighborhood subgraph |
| Tests | Complete | Part of the 1529 tests passing across the project |

## Notes

- The layout algorithm handles cycles by breaking back-edges during Kahn's topological sort. Nodes involved in cycles get assigned to the layer they would have reached naturally, so circular dependencies render without infinite loops but without visual indication that a cycle exists.
- `extractCommissionId()` filters the `dependencies` array to only commission-to-commission references (paths matching `.lore/commissions/*.md`). Non-commission dependencies (arbitrary artifacts) are ignored by the graph builder.
- `CommissionGraph` generates unique SVG marker IDs via React's `useId()` hook. Without this, multiple graphs on the same page would share arrowhead marker definitions and break when one unmounts.
- The `DependencyMap` component makes a binary choice: graph when edges exist, flat list when they don't. There's no hybrid view. This prevents rendering a disconnected set of isolated nodes as a "graph" with no edges.
