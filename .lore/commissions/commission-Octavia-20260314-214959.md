---
title: "Commission: Specify: Commission graph to tree list"
date: 2026-03-15
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a specification for replacing the SVG commission graph with an indented tree list.\n\n**Source brainstorm:** `.lore/brainstorm/commission-graph-to-tree-list.md` — read this first, it contains resolved decisions on all major questions.\n\n**Task:** Create a spec at `.lore/specs/ui/commission-graph-to-tree-list.md` using the `/lore-development:specify` skill.\n\n**Key decisions from the brainstorm (do not re-open these):**\n- Replace SVG graph on dashboard with CSS indented tree list\n- Replace NeighborhoodGraph on commission detail page with upstream/downstream text list\n- Diamond dependencies: multi-parent commissions render flat at root level with \"Awaits:\" annotations (Option C)\n- No collapsibility\n- Sort: root-level by status (existing `sortCommissions()`), children by status within parent group\n- Scheduled commissions keep existing flat list styling (scheduledCard, scheduledBadge)\n- Spawned commissions appear as children of their schedule\n- Add `buildAdjacencyList()` utility to `lib/dependency-graph.ts`\n- Delete: CommissionGraph.tsx, CommissionGraph.module.css, NeighborhoodGraph.tsx, NeighborhoodGraph.module.css, layout algorithm functions from dependency-graph.ts\n- Keep: buildDependencyGraph(), getNeighborhood(), graph data structures\n\n**Existing specs to reference for context:**\n- `.lore/specs/ui/guild-hall-views.md` — overall view structure\n- `.lore/specs/ui/graph-scrollable-container.md` — current graph container (being replaced)\n- `.lore/specs/ui/commission-list-filtering.md` — filtering that interacts with this list\n\n**Requirements should cover:**\n1. Dashboard tree list component (structure, indentation, CSS connectors, card content)\n2. Commission detail neighborhood replacement (upstream/downstream sections)\n3. Diamond dependency handling (Option C from brainstorm)\n4. Scheduled/spawned commission rendering in the tree\n5. What gets deleted (enumerate files and functions)\n6. What gets kept (graph data structures)\n7. New utility function (`buildAdjacencyList`)\n8. Interaction with commission list filtering\n9. CSS approach (connector lines using pseudo-elements, brass color tokens)\n\nDo NOT re-open resolved questions from the brainstorm. The spec should formalize those decisions into requirements."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-15T04:49:59.253Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-15T04:49:59.255Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-15T04:49:59.296Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-15T04:50:06.212Z
    event: progress_report
    reason: "Starting spec work. Reading brainstorm and referenced specs to gather context."
  - timestamp: 2026-03-15T04:50:46.379Z
    event: progress_report
    reason: "Context gathering complete. Read brainstorm, all referenced specs, and verified source files (dependency-graph.ts, CommissionGraph.tsx, DependencyMap.tsx, NeighborhoodGraph.tsx, CSS modules, sortCommissions). Now invoking /lore-development:specify to write the spec."
  - timestamp: 2026-03-15T04:51:42.281Z
    event: result_submitted
    reason: "Completed lore search for commission graph visualization, tree list UI, dependency graph rendering, and dashboard card rendering. Found 12 highly relevant documents across specs, brainstorms, research, reference, issues, retros, and plans."
  - timestamp: 2026-03-15T04:54:08.869Z
    event: progress_report
    reason: "Spec drafted at .lore/specs/ui/commission-graph-to-tree-list.md (27 requirements, REQ-CTREE-1 through REQ-CTREE-27). Running fresh-eyes review via spec-reviewer agent."
  - timestamp: 2026-03-15T04:57:39.191Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Spec drafted at .lore/specs/ui/commission-graph-to-tree-list.md (27 requirements, REQ-CTREE-1 through REQ-CTREE-27). Running fresh-eyes review via spec-reviewer agent."
projectName: guild-hall
---
Completed lore search for commission graph visualization, tree list UI, dependency graph rendering, and dashboard card rendering. Found 12 highly relevant documents across specs, brainstorms, research, reference, issues, retros, and plans.
