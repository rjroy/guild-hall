---
title: "Commission: Research triage: wide-dag-visualization-patterns"
date: 2026-03-14
status: completed
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Triage the research document `.lore/research/wide-dag-visualization-patterns.md` against the current state of the Guild Hall codebase and its specs.\n\nAnswer three questions:\n\n1. **Was this research used?** Look at the current implementation. Did concepts, patterns, or decisions from this research make it into the codebase? Cite specific files or patterns if so.\n\n2. **Is there still something to learn from it?** Does the research contain insights, patterns, or recommendations that haven't been applied yet but could be valuable going forward?\n\n3. **Is the research invalid given our current direction?** Compare the research's assumptions and recommendations against the specs in `.lore/specs/` and the current implementation. Did we deliberately go a different direction? A research item that's simply \"not yet implemented\" is different from one where we chose the opposite approach.\n\nBased on your answers, classify this research as exactly one of:\n- **FUTURE** — Not yet used, but still relevant and valuable for upcoming work.\n- **PRESENT** — Actively informing current implementation or decisions.\n- **PAST** — No longer of benefit. We either absorbed what we needed or went a different direction.\n\nWrite your classification and reasoning as a note on this commission. Be specific and cite evidence."
dependencies: []
linked_artifacts:
  - .lore/research/wide-dag-visualization-patterns.md

activity_timeline:
  - timestamp: 2026-03-14T21:41:05.541Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-14T21:45:10.977Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-14T21:45:11.012Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-14T21:45:18.389Z
    event: progress_report
    reason: "Reading the research document and gathering context on current implementation."
  - timestamp: 2026-03-14T21:45:46.085Z
    event: progress_report
    reason: "Analysis complete. Compiling classification with evidence from the research document, current implementation (lib/dependency-graph.ts, CommissionGraph.tsx), and spec (graph-scrollable-container.md)."
  - timestamp: 2026-03-14T21:46:21.075Z
    event: result_submitted
    reason: "## Classification: FUTURE\n\n### 1. Was this research used?\n\nPartially. The current implementation in `lib/dependency-graph.ts` uses a simplified Sugiyama-style algorithm (layer assignment via topological sort, barycentric crossing minimization, coordinate assignment), which the research surveys as the standard approach (lines 250-258 of the research). The implementation is a from-scratch version without external dependencies (no dagre, no ELK, no d3-dag), covering the same four-phase pattern the research describes.\n\nThe scrollable container spec (`graph-scrollable-container.md`, status: implemented) addresses the \"SVG in a scrollable container\" problem, which the research identifies as a universal challenge (Mermaid section, lines 172-173: \"the SVG itself doesn't scroll; the container must handle overflow\"). The spec's solution (render at readable scale, scroll to explore) aligns with the research's finding that layout alone is insufficient and the UI container matters.\n\nHowever, the specific patterns the research recommends for wide-and-shallow DAGs have **not** been adopted:\n\n- **No reversed axis (LR layout).** The implementation uses top-to-bottom layout exclusively. Edges go from bottom-center of source to top-center of target (`CommissionGraph.tsx:144-148`). The research identifies LR as the trivial first step for wide-and-shallow graphs.\n- **No collapsible groups.** No grouping mechanism exists. Every commission is a flat node.\n- **No interactive filtering.** No click-to-highlight-upstream/downstream. Clicking a node navigates away to the commission detail page (`CommissionGraph.tsx:180`).\n- **No alternative views.** `DependencyMap.tsx` falls back to a flat card list when there are no edges, but there's no table/list alternative for when the graph itself becomes too large.\n\n### 2. Is there still something to learn from it?\n\nYes. The research contains three actionable insights that remain unimplemented:\n\n**a) LR direction for wide parallelism.** The codebase's known issue \"Commission graph node labels truncated\" (referenced in project memory) is a symptom of the wide-graph problem. When many commissions exist at the same depth level, the top-to-bottom layout expands horizontally, and with `truncateLabel` capping at 14-20 characters (`CommissionGraph.tsx:94`), labels get cut. Switching to LR layout (Pattern 3 in the research) would stack parallel commissions vertically, which the research identifies as the cheapest effective fix.\n\n**b) Interactive dependency highlighting.** The research's synthesis (line 293) recommends click-to-highlight upstream/downstream as a standard complement to graph layout. The current `NeighborhoodGraph` component already computes neighborhoods (`getNeighborhood` in `dependency-graph.ts:164-196`), but this is a separate view, not an interactive overlay on the main graph.\n\n**c) The \"uncomfortable truth\" (line 291).** The research's central finding is that no layout algorithm alone solves wide-and-shallow DAGs. The current implementation relies entirely on layout. If Guild Hall's commission count grows (which is the natural trajectory), the graph will hit the same scalability walls the research documents from Argo (chaos above 2000 nodes), Airflow (slow past a few hundred without groups), and GitHub Actions (illegible at scale). The research prescribes grouping, filtering, and alternative views as the necessary complement. None of these exist yet.\n\n### 3. Is the research invalid given our current direction?\n\nNo. The research makes no assumptions that conflict with the current implementation or specs. The spec `graph-scrollable-container.md` explicitly constrains itself: \"The viewBox attribute and layout computation in lib/dependency-graph.ts should not change\" (line 74). This was a deliberate scope limitation for that spec, not a rejection of the research's recommendations. The spec solves the container problem; the research addresses the layout and interaction problems that the container fix doesn't touch.\n\nThe custom Sugiyama implementation (no external deps) is compatible with the research's recommendations. Adding LR direction or grouping would modify `layoutGraph` in `dependency-graph.ts`, not replace it. The research surveys external libraries (dagre, ELK, d3-dag) but doesn't prescribe them; the patterns it identifies (reversed axis, clustering, interactive filtering) are algorithm-agnostic.\n\n### Summary\n\nThe research was written to inform graph visualization improvements. The scrollable container work absorbed the \"container matters\" insight, but the core layout and interaction recommendations remain unapplied. The known issue with truncated node labels is direct evidence that the wide-graph problem the research targets is already manifesting. The research remains relevant for future graph improvements, particularly LR layout and interactive dependency highlighting."
  - timestamp: 2026-03-14T21:46:27.592Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Analysis complete. Compiling classification with evidence from the research document, current implementation (lib/dependency-graph.ts, CommissionGraph.tsx), and spec (graph-scrollable-container.md)."
projectName: guild-hall
---
## Classification: FUTURE

### 1. Was this research used?

Partially. The current implementation in `lib/dependency-graph.ts` uses a simplified Sugiyama-style algorithm (layer assignment via topological sort, barycentric crossing minimization, coordinate assignment), which the research surveys as the standard approach (lines 250-258 of the research). The implementation is a from-scratch version without external dependencies (no dagre, no ELK, no d3-dag), covering the same four-phase pattern the research describes.

The scrollable container spec (`graph-scrollable-container.md`, status: implemented) addresses the "SVG in a scrollable container" problem, which the research identifies as a universal challenge (Mermaid section, lines 172-173: "the SVG itself doesn't scroll; the container must handle overflow"). The spec's solution (render at readable scale, scroll to explore) aligns with the research's finding that layout alone is insufficient and the UI container matters.

However, the specific patterns the research recommends for wide-and-shallow DAGs have **not** been adopted:

- **No reversed axis (LR layout).** The implementation uses top-to-bottom layout exclusively. Edges go from bottom-center of source to top-center of target (`CommissionGraph.tsx:144-148`). The research identifies LR as the trivial first step for wide-and-shallow graphs.
- **No collapsible groups.** No grouping mechanism exists. Every commission is a flat node.
- **No interactive filtering.** No click-to-highlight-upstream/downstream. Clicking a node navigates away to the commission detail page (`CommissionGraph.tsx:180`).
- **No alternative views.** `DependencyMap.tsx` falls back to a flat card list when there are no edges, but there's no table/list alternative for when the graph itself becomes too large.

### 2. Is there still something to learn from it?

Yes. The research contains three actionable insights that remain unimplemented:

**a) LR direction for wide parallelism.** The codebase's known issue "Commission graph node labels truncated" (referenced in project memory) is a symptom of the wide-graph problem. When many commissions exist at the same depth level, the top-to-bottom layout expands horizontally, and with `truncateLabel` capping at 14-20 characters (`CommissionGraph.tsx:94`), labels get cut. Switching to LR layout (Pattern 3 in the research) would stack parallel commissions vertically, which the research identifies as the cheapest effective fix.

**b) Interactive dependency highlighting.** The research's synthesis (line 293) recommends click-to-highlight upstream/downstream as a standard complement to graph layout. The current `NeighborhoodGraph` component already computes neighborhoods (`getNeighborhood` in `dependency-graph.ts:164-196`), but this is a separate view, not an interactive overlay on the main graph.

**c) The "uncomfortable truth" (line 291).** The research's central finding is that no layout algorithm alone solves wide-and-shallow DAGs. The current implementation relies entirely on layout. If Guild Hall's commission count grows (which is the natural trajectory), the graph will hit the same scalability walls the research documents from Argo (chaos above 2000 nodes), Airflow (slow past a few hundred without groups), and GitHub Actions (illegible at scale). The research prescribes grouping, filtering, and alternative views as the necessary complement. None of these exist yet.

### 3. Is the research invalid given our current direction?

No. The research makes no assumptions that conflict with the current implementation or specs. The spec `graph-scrollable-container.md` explicitly constrains itself: "The viewBox attribute and layout computation in lib/dependency-graph.ts should not change" (line 74). This was a deliberate scope limitation for that spec, not a rejection of the research's recommendations. The spec solves the container problem; the research addresses the layout and interaction problems that the container fix doesn't touch.

The custom Sugiyama implementation (no external deps) is compatible with the research's recommendations. Adding LR direction or grouping would modify `layoutGraph` in `dependency-graph.ts`, not replace it. The research surveys external libraries (dagre, ELK, d3-dag) but doesn't prescribe them; the patterns it identifies (reversed axis, clustering, interactive filtering) are algorithm-agnostic.

### Summary

The research was written to inform graph visualization improvements. The scrollable container work absorbed the "container matters" insight, but the core layout and interaction recommendations remain unapplied. The known issue with truncated node labels is direct evidence that the wide-graph problem the research targets is already manifesting. The research remains relevant for future graph improvements, particularly LR layout and interactive dependency highlighting.
