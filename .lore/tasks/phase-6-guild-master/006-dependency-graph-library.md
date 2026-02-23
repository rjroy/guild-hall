---
title: Implement dependency graph data structures and layout algorithm
date: 2026-02-23
status: pending
tags: [task]
source: .lore/plans/phase-6-guild-master.md
related: [.lore/specs/guild-hall-system.md, .lore/specs/guild-hall-views.md]
sequence: 6
modules: [lib]
---

# Task: Implement Dependency Graph Data Structures and Layout Algorithm

## What

Create `lib/dependency-graph.ts` with pure data structures and algorithms for commission dependency graphs. No React, no SVG, no UI. This is the computation layer consumed by UI components in Task 7.

**Types:**

```typescript
export interface GraphNode {
  id: string;
  title: string;
  status: string;
  worker?: string;
  projectName: string;
}

export interface GraphEdge {
  from: string;  // dependency commission ID
  to: string;    // dependent commission ID
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface LayoutNode extends GraphNode {
  x: number;
  y: number;
  layer: number;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
}
```

**Functions:**

1. `buildDependencyGraph(commissions: CommissionMeta[]): DependencyGraph`: Parse each commission's `dependencies` field. Dependencies that are artifact paths matching `commissions/<id>.md` produce edges. Non-commission dependencies (specs, designs) are not edges.

2. `getNeighborhood(graph: DependencyGraph, commissionId: string): DependencyGraph`: Return the subgraph containing a commission's direct dependencies and direct dependents (one hop in each direction), plus the commission itself.

3. `layoutGraph(graph: DependencyGraph, options?: { nodeWidth?: number; nodeHeight?: number; padding?: number }): LayoutResult`: Simplified Sugiyama-style layered layout:
   - Topological sort to assign layers (roots at top, leaves at bottom). Handle cycles gracefully (break cycle by removing back edge, log warning).
   - Within each layer, order nodes to minimize edge crossings (greedy barycentric heuristic).
   - Assign x/y coordinates based on layer and position within layer.
   - Return layout dimensions for viewport sizing.

No external dependencies (no D3, no dagre). Pure TypeScript.

## Validation

- `buildDependencyGraph`: produces correct nodes and edges from commission metadata with dependencies
- `buildDependencyGraph`: non-commission dependencies (e.g., `specs/foo.md`) do not produce edges
- `buildDependencyGraph`: commissions with no dependencies produce nodes with no edges
- `buildDependencyGraph`: handles missing/invalid dependency references gracefully
- `getNeighborhood`: returns correct subgraph (direct deps + direct dependents + self)
- `getNeighborhood`: isolated commission (no deps, no dependents) returns single-node graph
- `getNeighborhood`: commission not in graph returns empty graph
- `layoutGraph`: produces valid coordinates (no overlapping nodes within same layer)
- `layoutGraph`: correct layer assignment (roots at layer 0, dependencies above dependents)
- `layoutGraph`: returns dimensions large enough to contain all nodes
- `layoutGraph`: handles single-node graph
- `layoutGraph`: handles disconnected graph (multiple components)
- `layoutGraph`: handles graph with cycles (breaks cycle, logs warning)
- All tests pass, linting clean, commit created (triggers pre-commit hook validation)

## Why

From `.lore/specs/guild-hall-system.md`:
- REQ-SYS-14: "Commissions form dependency graphs through artifact references. The dependency graph is implicit in artifact references, not maintained as a separate data structure."

From `.lore/specs/guild-hall-views.md`:
- REQ-VIEW-14: "The dependency map renders commissions as connected nodes following the dependency graph."
- REQ-VIEW-18: "Project dependency graph (compact) shows the commission DAG for this project."
- REQ-VIEW-22: "Dependencies section shows a mini dependency graph centered on this commission's neighborhood."

## Files

- `lib/dependency-graph.ts` (create)
- `tests/lib/dependency-graph.test.ts` (create)
