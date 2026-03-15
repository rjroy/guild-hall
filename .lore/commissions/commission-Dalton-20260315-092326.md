---
title: "Commission: Implement: Dashboard selection model - Phase 1 (UI refactoring)"
date: 2026-03-15
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Steps 1-5 from `.lore/plans/ui/dashboard-selection-model.md`.\n\nThis phase covers:\n- Step 1: Extract filter functions/constants to `web/components/commission/commission-filter.ts`\n- Step 2: Extract `CommissionFilterPanel` as shared component\n- Step 3: Rewrite `DependencyMap.tsx` as \"In Flight\" client component\n- Step 4: Add \"All Projects\" entry to `WorkspaceSidebar`\n- Step 5: Update `page.tsx` to pass `selectedProject` to InFlight card\n\nRead the full plan for detailed file lists, interfaces, and implementation notes per step. The spec is at `.lore/specs/ui/dashboard-selection-model.md`.\n\nKey constraints:\n- `DependencyMap.tsx` must become a client component (`\"use client\"`). No server-only imports (`node:fs`, `node:path`).\n- `CommissionFilterPanel` receives props, does not hold state.\n- Delete `build-tree-list.ts` after rewrite (Step 3). Verify no remaining imports first.\n- Update `commissionHref` imports: anything importing from `DependencyMap` should import from `@/lib/commission-href` instead. Run `grep -r \"commissionHref\" web/` to find consumers.\n- Write tests for new components where the plan specifies them.\n\nAfter implementation: run `bun test`, `bun run typecheck`, `bun run lint`. All must pass.\n"
dependencies: []
linked_artifacts:
  - web/components/commission/commission-filter.ts

  - web/components/commission/CommissionFilterPanel.tsx
  - web/components/commission/CommissionFilterPanel.module.css
  - web/components/commission/CommissionList.tsx
  - web/components/commission/CommissionList.module.css
  - web/components/dashboard/DependencyMap.tsx
  - web/components/dashboard/DependencyMap.module.css
  - web/components/dashboard/WorkspaceSidebar.tsx
  - web/components/dashboard/WorkspaceSidebar.module.css
  - web/app/page.tsx
  - tests/components/commission-list.test.tsx
  - tests/components/commission-form.test.tsx
  - tests/components/dashboard-commissions.test.ts
  - tests/integration/navigation.test.ts
  - web/components/commission/CommissionFilterPanel.tsx
  - web/components/commission/CommissionFilterPanel.module.css
  - web/components/commission/CommissionList.tsx
  - web/components/commission/CommissionList.module.css
  - web/components/dashboard/DependencyMap.tsx
  - web/components/dashboard/DependencyMap.module.css
  - web/components/dashboard/WorkspaceSidebar.tsx
  - web/components/dashboard/WorkspaceSidebar.module.css
  - web/app/page.tsx
  - tests/components/commission-list.test.tsx
  - tests/components/commission-form.test.tsx
  - tests/components/dashboard-commissions.test.ts
  - tests/integration/navigation.test.ts
activity_timeline:
  - timestamp: 2026-03-15T16:23:26.728Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-15T16:23:54.028Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-15T16:23:54.073Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-15T16:24:01.162Z
    event: progress_report
    reason: "Reading plan and spec before implementation."
  - timestamp: 2026-03-15T16:24:44.378Z
    event: progress_report
    reason: "Context gathered. Starting implementation of Steps 1-5. Six files to create/modify across the five steps."
  - timestamp: 2026-03-15T16:27:55.853Z
    event: progress_report
    reason: "Steps 1-5 implemented. Running typecheck and tests to verify."
  - timestamp: 2026-03-15T16:29:57.871Z
    event: result_submitted
    reason: "Implemented Steps 1-5 of the Dashboard Selection Model plan. All changes compile, pass lint, and 2785/2785 tests pass.\n\n**Step 1: Extract filter functions to shared module**\n- Created `web/components/commission/commission-filter.ts` with `DEFAULT_STATUSES`, `FILTER_GROUPS`, `filterCommissions`, `countByStatus`, `isDefaultSelection`\n- Updated `CommissionList.tsx` to import from `./commission-filter`\n- Updated `tests/components/commission-list.test.tsx` and `tests/components/commission-form.test.tsx` import paths\n\n**Step 2: Extract CommissionFilterPanel as shared component**\n- Created `web/components/commission/CommissionFilterPanel.tsx` (stateless, receives props)\n- Created `web/components/commission/CommissionFilterPanel.module.css` (moved filter CSS from CommissionList)\n- Updated `CommissionList.tsx` to use `<CommissionFilterPanel>` instead of inline JSX\n- Removed filter CSS from `CommissionList.module.css`\n\n**Step 3: Rewrite DependencyMap.tsx as \"In Flight\" client component**\n- Rewrote `DependencyMap.tsx` as `InFlight` client component with `\"use client\"`, `useState` filter state, `CommissionFilterPanel`, and flat commission row layout\n- No server-only imports (`node:fs`, `node:path`)\n- Removed `commissionHref` re-export (consumers now import from `@/lib/commission-href`)\n- Rewrote `DependencyMap.module.css` for flat list layout with project label support\n- Deleted `web/components/dashboard/build-tree-list.ts`\n- Updated `tests/components/dashboard-commissions.test.ts`: removed `buildTreeList` tests, fixed `commissionHref` import\n- Updated `tests/integration/navigation.test.ts`: fixed `commissionHref` import\n\n**Step 4: Add \"All Projects\" entry to WorkspaceSidebar**\n- Added \"All Projects\" as first sidebar item, links to `/`, selected when no project in URL\n- Added `styles.allProjectsItem` CSS modifier for alignment without GemIndicator\n\n**Step 5: Update page.tsx to pass selectedProject to InFlight card**\n- Added `selectedProject` prop to `<DependencyMap>` in `page.tsx`"
  - timestamp: 2026-03-15T16:30:16.862Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Steps 1-5 implemented. Running typecheck and tests to verify."
projectName: guild-hall
---
Implemented Steps 1-5 of the Dashboard Selection Model plan. All changes compile, pass lint, and 2785/2785 tests pass.

**Step 1: Extract filter functions to shared module**
- Created `web/components/commission/commission-filter.ts` with `DEFAULT_STATUSES`, `FILTER_GROUPS`, `filterCommissions`, `countByStatus`, `isDefaultSelection`
- Updated `CommissionList.tsx` to import from `./commission-filter`
- Updated `tests/components/commission-list.test.tsx` and `tests/components/commission-form.test.tsx` import paths

**Step 2: Extract CommissionFilterPanel as shared component**
- Created `web/components/commission/CommissionFilterPanel.tsx` (stateless, receives props)
- Created `web/components/commission/CommissionFilterPanel.module.css` (moved filter CSS from CommissionList)
- Updated `CommissionList.tsx` to use `<CommissionFilterPanel>` instead of inline JSX
- Removed filter CSS from `CommissionList.module.css`

**Step 3: Rewrite DependencyMap.tsx as "In Flight" client component**
- Rewrote `DependencyMap.tsx` as `InFlight` client component with `"use client"`, `useState` filter state, `CommissionFilterPanel`, and flat commission row layout
- No server-only imports (`node:fs`, `node:path`)
- Removed `commissionHref` re-export (consumers now import from `@/lib/commission-href`)
- Rewrote `DependencyMap.module.css` for flat list layout with project label support
- Deleted `web/components/dashboard/build-tree-list.ts`
- Updated `tests/components/dashboard-commissions.test.ts`: removed `buildTreeList` tests, fixed `commissionHref` import
- Updated `tests/integration/navigation.test.ts`: fixed `commissionHref` import

**Step 4: Add "All Projects" entry to WorkspaceSidebar**
- Added "All Projects" as first sidebar item, links to `/`, selected when no project in URL
- Added `styles.allProjectsItem` CSS modifier for alignment without GemIndicator

**Step 5: Update page.tsx to pass selectedProject to InFlight card**
- Added `selectedProject` prop to `<DependencyMap>` in `page.tsx`
