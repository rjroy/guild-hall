---
title: "Commission: Remove budget controls Phase 1: maxTurns and maxBudgetUsd removal"
date: 2026-03-22
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 1 of the remove budget controls plan at `.lore/plans/commissions/remove-budget-controls.md`. Spec: `.lore/specs/commissions/remove-budget-controls.md`.\n\nThis covers Steps 1-15 across four sub-phases:\n\n**Sub-phase 1: Core type and logic removal (Steps 1-8)**\n- Remove `ResourceDefaults`, `resourceDefaults`, `resourceBounds` from types\n- Remove `maxTurns`/`maxBudgetUsd` from SDK runner, commission orchestrator, worker activation\n- Fix briefing generator's maxTurns path (move from resourceOverrides to post-prep direct option setting)\n- Remove from routes, scheduler, manager toolbox schemas\n- Update halted-types comment\n\n**Sub-phase 2: Package and UI cleanup (Steps 9-10)**\n- Remove `resourceDefaults` from all 6 worker package.json files\n- Remove Max Turns and Max Budget input fields from CommissionForm\n\n**Sub-phase 3: Test updates (Steps 11-12)**\n- Update ~28 test files removing budget-related fixtures, assertions, and test blocks\n- Delete tests that specifically test maxTurns/maxBudget behavior\n\n**Sub-phase 4: Documentation (Steps 13-15)**\n- Update CLAUDE.md and docs/usage/commissions.md\n- Update worker guidance text in manager/worker.ts\n\nThe plan has detailed line references for each change. Read it carefully. Important: internal utility session limits (briefing, triage, notes generator) are preserved. Only user-facing budget controls are removed. The halted state infrastructure stays intact for Phase 2.\n\nRun the full pre-commit hook before finishing."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-22T19:42:24.989Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T19:42:24.991Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
