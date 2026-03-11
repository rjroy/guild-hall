---
title: "Commission: Research: Graph layout algorithms for dependency visualization"
date: 2026-03-11
status: completed
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
  - timestamp: 2026-03-11T03:48:36.868Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-11T03:48:45.368Z
    event: progress_report
    reason: "Starting research. Reading the issue document first to understand the problem fully."
  - timestamp: 2026-03-11T03:54:52.473Z
    event: progress_report
    reason: "Research complete across all 8 tools and 4 layout patterns. Web searches and page fetches covered GitHub Actions, Argo Workflows, Apache Airflow, GitLab CI/CD, Jenkins Blue Ocean, Tekton Dashboard, Buildkite, and Mermaid.js. Also researched Sugiyama algorithm modifications, ELK graph wrapping, dagre configuration, and swimlane patterns. Now compiling structured findings."
  - timestamp: 2026-03-11T03:55:16.318Z
    event: progress_report
    reason: "Research complete for all 9+ graph layout libraries. Collected bundle sizes, layout algorithms, API complexity, maintenance status, and React compatibility from npm registry, React Flow documentation, GitHub repos, and package analysis tools. Now compiling structured comparison."
  - timestamp: 2026-03-11T03:55:24.604Z
    event: result_submitted
    reason: "Completed structured comparison of 9 JavaScript/TypeScript graph layout libraries for React applications. Research covers bundle sizes, layout algorithms, API complexity, maintenance status, React compatibility, and suitability for wide shallow DAGs (20-50 nodes wide, 1-3 levels deep). Data sourced from npm registry API, React Flow official documentation, GitHub repositories, and web search."
  - timestamp: 2026-03-11T03:58:37.677Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Research complete for all 9+ graph layout libraries. Collected bundle sizes, layout algorithms, API complexity, maintenance status, and React compatibility from npm registry, React Flow documentation, GitHub repos, and package analysis tools. Now compiling structured comparison."
projectName: guild-hall
---
Completed structured comparison of 9 JavaScript/TypeScript graph layout libraries for React applications. Research covers bundle sizes, layout algorithms, API complexity, maintenance status, React compatibility, and suitability for wide shallow DAGs (20-50 nodes wide, 1-3 levels deep). Data sourced from npm registry API, React Flow official documentation, GitHub repositories, and web search.
