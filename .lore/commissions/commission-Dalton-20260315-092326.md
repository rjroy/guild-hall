---
title: "Commission: Implement: Dashboard selection model - Phase 1 (UI refactoring)"
date: 2026-03-15
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Steps 1-5 from `.lore/plans/ui/dashboard-selection-model.md`.\n\nThis phase covers:\n- Step 1: Extract filter functions/constants to `web/components/commission/commission-filter.ts`\n- Step 2: Extract `CommissionFilterPanel` as shared component\n- Step 3: Rewrite `DependencyMap.tsx` as \"In Flight\" client component\n- Step 4: Add \"All Projects\" entry to `WorkspaceSidebar`\n- Step 5: Update `page.tsx` to pass `selectedProject` to InFlight card\n\nRead the full plan for detailed file lists, interfaces, and implementation notes per step. The spec is at `.lore/specs/ui/dashboard-selection-model.md`.\n\nKey constraints:\n- `DependencyMap.tsx` must become a client component (`\"use client\"`). No server-only imports (`node:fs`, `node:path`).\n- `CommissionFilterPanel` receives props, does not hold state.\n- Delete `build-tree-list.ts` after rewrite (Step 3). Verify no remaining imports first.\n- Update `commissionHref` imports: anything importing from `DependencyMap` should import from `@/lib/commission-href` instead. Run `grep -r \"commissionHref\" web/` to find consumers.\n- Write tests for new components where the plan specifies them.\n\nAfter implementation: run `bun test`, `bun run typecheck`, `bun run lint`. All must pass.\n"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-15T16:23:26.728Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-15T16:23:54.028Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
