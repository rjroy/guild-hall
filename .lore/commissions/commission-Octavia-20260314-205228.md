---
title: "Commission: Brainstorm: Replace SVG dependency graph with tree list"
date: 2026-03-15
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Run `/lore-development:brainstorm` to explore replacing the SVG commission dependency graph with a text-based tree list on the dashboard.\n\n## Context\n\nThe current `CommissionGraph.tsx` renders an SVG DAG visualization for commissions. In practice, most commissions are independent one-offs with no dependencies, making the graph visualization visual noise. The existing fallback (a flat card list shown when there are no dependencies) already looks good. The proposal is to remove the SVG entirely and enhance the flat list into a tree when dependencies exist.\n\nResearch was already done: `.lore/research/wide-dag-visualization-patterns.md`. Its conclusion supports this direction. Every CI/CD tool that scales well eventually offers a list/table alternative to the graph.\n\n## What to explore\n\n1. **Tree rendering approach**: How should dependency relationships be visualized in a text/card list? Options include CSS indentation with subtle connector lines, pure indentation, nested cards, or other patterns. Consider what fits the existing fantasy/guild aesthetic (CSS Modules, not Tailwind).\n\n2. **Diamond dependencies**: Commission A depends on both B and C. How does this render in a tree? Does the dependent appear under one parent with a reference to the other? Does it appear twice? Flat with a dependency annotation?\n\n3. **Scope**: Should `NeighborhoodGraph` on the commission detail page (`web/components/commission/NeighborhoodGraph.tsx`) also be replaced, or is the SVG still useful there where the graph is small and focused?\n\n4. **Scheduled commissions**: Currently rendered with a double-border and \"Recurring\" badge in the SVG. How should these be distinguished in the tree/list view?\n\n## Key files to read\n\n- `web/components/dashboard/CommissionGraph.tsx` (current SVG implementation)\n- `web/components/dashboard/DependencyMap.tsx` (contains the fallback list and orchestrates which view to show)\n- `web/components/commission/NeighborhoodGraph.tsx` (commission detail page graph)\n- `lib/dependency-graph.ts` (graph data structures and layout algorithm)\n- `.lore/research/wide-dag-visualization-patterns.md` (prior research)\n- `web/app/globals.css` (design tokens and existing styles)\n\nMake concrete recommendations based on existing design patterns and the fantasy guild aesthetic. The brainstorm artifact should go in `.lore/brainstorm/`."
dependencies: []
linked_artifacts:
  - .lore/brainstorm/commission-graph-to-tree-list.md

activity_timeline:
  - timestamp: 2026-03-15T03:52:28.704Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-15T03:52:28.705Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-15T03:52:28.754Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-15T03:53:04.602Z
    event: progress_report
    reason: "Read all key files (CommissionGraph.tsx, DependencyMap.tsx, NeighborhoodGraph.tsx, dependency-graph.ts, research doc, globals.css, CSS modules). Now drafting the brainstorm artifact."
  - timestamp: 2026-03-15T03:54:35.213Z
    event: result_submitted
    reason: "Brainstorm artifact written to `.lore/brainstorm/commission-graph-to-tree-list.md`.\n\nExplored three approaches for replacing the SVG commission dependency graph: indented tree with CSS connector lines, flat list with dependency annotations, and grouped collapsible sections.\n\nKey recommendations:\n- **Tree rendering**: Indented tree with CSS connector lines using `::before`/`::after` pseudo-elements in brass at low opacity. Fits the guild aesthetic and reuses the existing flat card pattern.\n- **Diamond dependencies**: Don't force DAGs into trees. Single-parent commissions indent naturally; multi-parent commissions render flat with \"Awaits: B, C\" annotations (Option C).\n- **NeighborhoodGraph scope**: Replace it too. A simple \"Depends on\" / \"Blocks\" text list communicates direction more clearly than a compact SVG.\n- **Scheduled commissions**: Keep the existing `scheduledCard` left-border and `scheduledBadge` inline badge. Schedule families naturally appear as parent-child trees.\n\nNet impact: ~370 lines of layout algorithm and ~320 lines of SVG rendering removed, replaced with CSS-based tree list reusing existing card patterns."
  - timestamp: 2026-03-15T03:54:40.873Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Read all key files (CommissionGraph.tsx, DependencyMap.tsx, NeighborhoodGraph.tsx, dependency-graph.ts, research doc, globals.css, CSS modules). Now drafting the brainstorm artifact."
projectName: guild-hall
---
Brainstorm artifact written to `.lore/brainstorm/commission-graph-to-tree-list.md`.

Explored three approaches for replacing the SVG commission dependency graph: indented tree with CSS connector lines, flat list with dependency annotations, and grouped collapsible sections.

Key recommendations:
- **Tree rendering**: Indented tree with CSS connector lines using `::before`/`::after` pseudo-elements in brass at low opacity. Fits the guild aesthetic and reuses the existing flat card pattern.
- **Diamond dependencies**: Don't force DAGs into trees. Single-parent commissions indent naturally; multi-parent commissions render flat with "Awaits: B, C" annotations (Option C).
- **NeighborhoodGraph scope**: Replace it too. A simple "Depends on" / "Blocks" text list communicates direction more clearly than a compact SVG.
- **Scheduled commissions**: Keep the existing `scheduledCard` left-border and `scheduledBadge` inline badge. Schedule families naturally appear as parent-child trees.

Net impact: ~370 lines of layout algorithm and ~320 lines of SVG rendering removed, replaced with CSS-based tree list reusing existing card patterns.
