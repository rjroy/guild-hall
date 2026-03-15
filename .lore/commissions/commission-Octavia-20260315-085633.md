---
title: "Commission: Plan: Dashboard selection model"
date: 2026-03-15
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Run the prep-plan skill to create an implementation plan for `.lore/specs/ui/dashboard-selection-model.md`.\n\nRead the spec first, then read the current dashboard implementation (`web/app/page.tsx`, `web/components/dashboard/`) and the daemon briefing service (`daemon/services/briefing/`, `daemon/routes/briefing.ts`) to understand what needs to change.\n\nThe plan should go in `.lore/plans/ui/dashboard-selection-model.md`.\n"
dependencies: []
linked_artifacts:
  - .lore/plans/ui/dashboard-selection-model.md

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-15T15:56:33.100Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-15T15:56:33.102Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-15T15:56:33.139Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-15T15:56:40.325Z
    event: progress_report
    reason: "Starting work: reading spec and implementation files before running prep-plan skill."
  - timestamp: 2026-03-15T15:58:00.222Z
    event: progress_report
    reason: "Context gathered. Running prep-plan skill to draft the implementation plan."
  - timestamp: 2026-03-15T16:02:14.929Z
    event: progress_report
    reason: "Research complete. Drafting the implementation plan now."
  - timestamp: 2026-03-15T16:07:58.519Z
    event: result_submitted
    reason: "Plan created at `.lore/plans/ui/dashboard-selection-model.md`.\n\nThe plan covers all 23 REQ-DASH requirements across 14 ordered steps:\n\n- Steps 1-2: Extract filter logic and filter panel to shared components (`commission-filter.ts`, `CommissionFilterPanel.tsx`) — pure refactoring, tests pass before moving on\n- Step 3: Rewrite `DependencyMap.tsx` as the \"In Flight\" client component, delete `build-tree-list.ts`, update `dashboard-commissions.test.tsx` for the removed tree-list tests\n- Step 4: Add \"All Projects\" entry to `WorkspaceSidebar`\n- Steps 5-7: Update `page.tsx` to pass `selectedProject` to InFlight, fetch all-projects artifacts for Recent Scrolls, filter Pending Audiences by project\n- Step 8: Add `briefingCacheTtlMinutes` to `AppConfig` and surface it through the briefing generator\n- Step 9: Add `generateAllProjectsBriefing()` to the daemon — sequential per-project fetch, composite HEAD hash cache key at `_all.json`, Guild Master synthesis session\n- Step 10: New `web/app/api/briefing/all/route.ts`, update `ManagerBriefing` to fetch all-projects briefing when no project is selected\n- Step 11: Remove the silent first-project fallback in `page.tsx`\n- Step 12: Unit tests for all new logic\n- Steps 13-14: Clean up dead code, close the `recent-scrolls-empty-state` issue, spec validation + code review\n\nA fresh-eyes review was run. Four issues were found and all fixed before final save: `dashboard-commissions.test.tsx` added to Step 3 scope, filter test file ambiguity resolved (tests stay in `commission-list.test.tsx`), `lib/types.ts` added to Step 6 file list for `ArtifactWithProject`, and Step 9 updated to require explicit sequential `await` loop for per-project briefing generation."
  - timestamp: 2026-03-15T16:08:09.002Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Research complete. Drafting the implementation plan now."
projectName: guild-hall
---
Plan created at `.lore/plans/ui/dashboard-selection-model.md`.

The plan covers all 23 REQ-DASH requirements across 14 ordered steps:

- Steps 1-2: Extract filter logic and filter panel to shared components (`commission-filter.ts`, `CommissionFilterPanel.tsx`) — pure refactoring, tests pass before moving on
- Step 3: Rewrite `DependencyMap.tsx` as the "In Flight" client component, delete `build-tree-list.ts`, update `dashboard-commissions.test.tsx` for the removed tree-list tests
- Step 4: Add "All Projects" entry to `WorkspaceSidebar`
- Steps 5-7: Update `page.tsx` to pass `selectedProject` to InFlight, fetch all-projects artifacts for Recent Scrolls, filter Pending Audiences by project
- Step 8: Add `briefingCacheTtlMinutes` to `AppConfig` and surface it through the briefing generator
- Step 9: Add `generateAllProjectsBriefing()` to the daemon — sequential per-project fetch, composite HEAD hash cache key at `_all.json`, Guild Master synthesis session
- Step 10: New `web/app/api/briefing/all/route.ts`, update `ManagerBriefing` to fetch all-projects briefing when no project is selected
- Step 11: Remove the silent first-project fallback in `page.tsx`
- Step 12: Unit tests for all new logic
- Steps 13-14: Clean up dead code, close the `recent-scrolls-empty-state` issue, spec validation + code review

A fresh-eyes review was run. Four issues were found and all fixed before final save: `dashboard-commissions.test.tsx` added to Step 3 scope, filter test file ambiguity resolved (tests stay in `commission-list.test.tsx`), `lib/types.ts` added to Step 6 file list for `ArtifactWithProject`, and Step 9 updated to require explicit sequential `await` loop for per-project briefing generation.
