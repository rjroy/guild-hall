---
title: "Commission: Spec revision: Add halted state removal as Phase 2 to remove-budget-controls spec"
date: 2026-03-22
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Revise `.lore/specs/commissions/remove-budget-controls.md` to include removal of the `halted` commission state as a Phase 2 scope item.\n\nThe reasoning: with maxTurns removed (Phase 1), there is no remaining path into the `halted` state. The entire halted infrastructure becomes dead code: the state itself, continue/save/abandon flows, crash recovery for halted commissions, preserved worktree logic, UI action buttons, manager toolbox tools (continue_commission, save_commission), and route endpoints.\n\nCurrent spec (REQ-RBUDGET-10) explicitly preserves halted for \"future triggers.\" That's speculative. Remove that requirement and replace it with Phase 2 requirements covering halted state removal.\n\nPhase 1 remains as-is (remove maxTurns/maxBudget, remove the maxTurns trigger for halting). Phase 2 removes the halted state entirely since nothing can trigger it.\n\nKeep the spec's existing structure. Add the Phase 2 requirements after the existing ones. Update the acceptance criteria and scope sections accordingly."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-22T19:12:58.116Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T19:12:58.118Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
