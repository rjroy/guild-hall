---
title: "Commission: Research: Graph layout algorithms for dependency visualization"
date: 2026-03-11
status: dispatched
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research graph layout algorithm options for our commission dependency graph. The issue is documented at `.lore/issues/dependency-graph-layout-algorithm.md` -- read it first.\n\nThe core problem: our current layout uses horizontal rows by depth, which fails because most commissions are independent (wide row 1, sparse row 2+). Child nodes don't sit near their parents, so you can't see relationships without tracing edges.\n\nResearch these areas:\n\n1. **Layout algorithms suitable for wide, shallow DAGs.** Sugiyama/layered, force-directed, tree-based, cluster-based. What works for graphs that are typically 20-50 nodes wide and 1-3 levels deep?\n\n2. **JavaScript/TypeScript libraries.** What's available? Compare dagre, elkjs, d3-hierarchy, d3-force, cytoscape.js, @dagrejs/graphlib, reactflow's built-in layouts, or anything else relevant. We need something that works in a React component (client-side rendering, no server dependency).\n\n3. **Visual patterns for this data shape.** How do tools like GitHub Actions, Argo Workflows, Apache Airflow, or CI/CD pipeline UIs handle wide dependency graphs? What layout choices do they make?\n\n4. **The four directions from the issue.** For each (parent-aligned, cluster-by-chain, different layout, reversed axis), find examples or prior art showing how well they work with wide-shallow DAGs.\n\nDeliver a research artifact at `.lore/research/graph-layout-algorithms.md` with findings, comparisons, and a recommendation for which direction to pursue. Include concrete library suggestions with tradeoffs (bundle size, API complexity, layout quality for our shape)."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-11T03:48:36.790Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-11T03:48:36.792Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
