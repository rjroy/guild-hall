---
title: "Commission: Scrollable container for commission dependency graph"
date: 2026-03-10
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the scrollable container for the commission dependency graph per the spec at `.lore/specs/graph-scrollable-container.md`.\n\n**Summary:** The SVG graph currently scales down to fit its container, becoming illegible on narrow viewports. Fix by rendering at a readable scale inside a scrollable container.\n\n**Key changes (all in `CommissionGraph.tsx` and its CSS module):**\n1. Set SVG width from computed `layout.width` in pixels instead of `width: 100%`\n2. Add `overflow-y: auto` to the container (horizontal overflow is already declared but never triggers)\n3. Adjust or remove `preserveAspectRatio` so the graph doesn't scale down\n4. Respect compact vs full mode for container max-height (existing props already differentiate)\n\n**Constraints:**\n- Fix lives in the shared component, not in each consumer\n- Do not change layout computation in `lib/dependency-graph.ts`\n- Do not change `viewBox` attribute\n- `preserveAspectRatio` on the `<svg>` may be adjusted or removed\n- Interactive behaviors (click, hover, keyboard, focal highlight) must continue working\n- No server-only imports (client component)\n\n**Validation:**\n- Visual verification at 375px viewport with 4+ nodes: labels legible, edges distinguishable, scrollbars appear\n- Visual verification at 1440px viewport: no unnecessary scrollbars when graph fits\n- All three rendering contexts (dashboard, project page, commission detail) display correctly\n- Fresh-context code review\n- If new TypeScript logic is introduced, unit tests with 90%+ coverage. If purely CSS + SVG attribute changes, no new tests required.\n\n**References:**\n- Spec: `.lore/specs/graph-scrollable-container.md`\n- Reference: `.lore/reference/dependency-graph.md`\n- Screenshot of problem: `.lore/issues/2026-03-10-screenshot-dependency-graph.webp`"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-10T21:49:41.868Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T21:49:41.869Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
