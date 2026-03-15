---
title: "Commission: Implement: Commission graph to tree list (CTREE plan)"
date: 2026-03-15
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the commission graph to tree list per the plan at `.lore/plans/ui/commission-graph-to-tree-list.md`. The plan has 8 steps. Read the plan first, then the spec at `.lore/specs/ui/commission-graph-to-tree-list.md` for the 28 requirements.\n\nFollow the plan's step sequence exactly. Each step lists the files to touch, requirements addressed, and verification criteria.\n\n**Step summary:**\n1. Add `buildAdjacencyList()` to `lib/dependency-graph.ts` + tests\n2. Rewrite `DependencyMap.tsx` as tree list (structure only, no connector CSS yet)\n3. Add CSS connector lines and tree styling to `DependencyMap.module.css`\n4. Replace `NeighborhoodGraph` with upstream/downstream text list (server component)\n5. Remove `CommissionGraph` from project page\n6. Delete `CommissionGraph.tsx`, `CommissionGraph.module.css`, prune layout exports from `dependency-graph.ts`, update tests\n7. Mark graph-scrollable-container spec as superseded\n8. Validate all 28 requirements against the spec with a fresh-context sub-agent\n\n**Critical details from the plan:**\n- Edge direction convention: `edge.from` = upstream parent, `edge.to` = downstream child. Easy to reverse, verify carefully.\n- Diamond detection: commissions with 2+ incoming edges render at root level with \"Awaits:\" annotation, not indented.\n- `DependencyMap` stays a server component (REQ-CTREE-26). No `\"use client\"`.\n- `NeighborhoodGraph` is rewritten in-place as a server component (remove `\"use client\"`).\n- Step 6 requires grep verification before deletion. Don't delete until confirmed no remaining imports.\n- Depth classes `.depth1` through `.depth4` with `margin-left: calc(N * 24px)`. No inline styles.\n- `canUseToolRules` should not need changes since this is UI-only work.\n\nRun `bun run typecheck`, `bun run build`, and relevant tests after each step as specified in the plan's verification sections."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-15T08:43:39.362Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-15T08:43:39.364Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
