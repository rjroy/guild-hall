---
title: "Commission: Brainstorm: Replace SVG dependency graph with tree list"
date: 2026-03-15
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Run `/lore-development:brainstorm` to explore replacing the SVG commission dependency graph with a text-based tree list on the dashboard.\n\n## Context\n\nThe current `CommissionGraph.tsx` renders an SVG DAG visualization for commissions. In practice, most commissions are independent one-offs with no dependencies, making the graph visualization visual noise. The existing fallback (a flat card list shown when there are no dependencies) already looks good. The proposal is to remove the SVG entirely and enhance the flat list into a tree when dependencies exist.\n\nResearch was already done: `.lore/research/wide-dag-visualization-patterns.md`. Its conclusion supports this direction. Every CI/CD tool that scales well eventually offers a list/table alternative to the graph.\n\n## What to explore\n\n1. **Tree rendering approach**: How should dependency relationships be visualized in a text/card list? Options include CSS indentation with subtle connector lines, pure indentation, nested cards, or other patterns. Consider what fits the existing fantasy/guild aesthetic (CSS Modules, not Tailwind).\n\n2. **Diamond dependencies**: Commission A depends on both B and C. How does this render in a tree? Does the dependent appear under one parent with a reference to the other? Does it appear twice? Flat with a dependency annotation?\n\n3. **Scope**: Should `NeighborhoodGraph` on the commission detail page (`web/components/commission/NeighborhoodGraph.tsx`) also be replaced, or is the SVG still useful there where the graph is small and focused?\n\n4. **Scheduled commissions**: Currently rendered with a double-border and \"Recurring\" badge in the SVG. How should these be distinguished in the tree/list view?\n\n## Key files to read\n\n- `web/components/dashboard/CommissionGraph.tsx` (current SVG implementation)\n- `web/components/dashboard/DependencyMap.tsx` (contains the fallback list and orchestrates which view to show)\n- `web/components/commission/NeighborhoodGraph.tsx` (commission detail page graph)\n- `lib/dependency-graph.ts` (graph data structures and layout algorithm)\n- `.lore/research/wide-dag-visualization-patterns.md` (prior research)\n- `web/app/globals.css` (design tokens and existing styles)\n\nMake concrete recommendations based on existing design patterns and the fantasy guild aesthetic. The brainstorm artifact should go in `.lore/brainstorm/`."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-15T03:52:28.704Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-15T03:52:28.705Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
