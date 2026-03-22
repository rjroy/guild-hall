---
title: "Commission: Spec and plan: Remove maxTurns and maxBudget from commission system"
date: 2026-03-22
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "The maxTurns and maxBudget fields in the commission system have provided no benefit and caused repeated failures (Guild Master has no intuition for appropriate values, leading to commissions failing or halting unnecessarily). Budget management belongs at the account level (Anthropic API usage limits), not within Guild Hall.\n\nWrite a spec and implementation plan for removing maxTurns and maxBudget from the entire system. This includes:\n\n- `resourceOverrides` in commission creation (manager toolbox, routes, types)\n- `maxTurns` and `maxBudgetUsd` fields on commission artifacts and state\n- The halted state logic that triggers when maxTurns is exceeded (commissions should run to completion or failure, not halt on an arbitrary turn count)\n- Config defaults for these values\n- UI elements that display or set them\n- Scheduled commission and triggered commission resource overrides\n- SDK runner turn/budget enforcement\n\nTrace the full surface area. Every file that references maxTurns, maxBudgetUsd, or resourceOverrides needs to be cataloged. The plan should be a clean removal with no replacement mechanism.\n\nOne consideration: the halted state itself may still have value for other reasons (SDK errors, user-initiated stops). Don't remove halted state, just remove the maxTurns trigger for it.\n\nSave the spec to `.lore/specs/commissions/remove-budget-controls.md` and the plan to `.lore/plans/commissions/remove-budget-controls.md`."
dependencies: []
linked_artifacts:
  - .lore/specs/commissions/remove-budget-controls.md

  - .lore/plans/commissions/remove-budget-controls.md
  - .lore/plans/commissions/remove-budget-controls.md
activity_timeline:
  - timestamp: 2026-03-22T19:03:13.349Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T19:03:13.350Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-22T19:03:13.397Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-22T19:03:21.311Z
    event: progress_report
    reason: "Starting surface area trace: searching for all references to maxTurns, maxBudgetUsd, and resourceOverrides across the codebase."
  - timestamp: 2026-03-22T19:04:40.694Z
    event: progress_report
    reason: "Surface area trace complete. Found references across 60+ files. Now reading existing lore specs for format conventions, then writing the spec and plan."
  - timestamp: 2026-03-22T19:05:15.815Z
    event: progress_report
    reason: "Research complete. Writing spec to .lore/specs/commissions/remove-budget-controls.md"
  - timestamp: 2026-03-22T19:08:19.369Z
    event: result_submitted
    reason: "Spec and plan written for removing maxTurns/maxBudgetUsd from the commission system.\n\n**Spec:** `.lore/specs/commissions/remove-budget-controls.md` (26 requirements across 10 categories: types, SDK, lifecycle, artifacts, packages, activation, toolbox/routes, scheduler, UI, documentation)\n\n**Plan:** `.lore/plans/commissions/remove-budget-controls.md` (4 phases, 15 steps, full surface area catalog of 60+ files)\n\nKey decisions:\n- `model` field in `resourceOverrides` is preserved (capability selection, not cost control)\n- `halted` state infrastructure is preserved (continue/save/cancel flows), but the maxTurns trigger is removed\n- Internal utility session turn limits (briefing: 200/10/1, triage: 10, notes: 1) are preserved as implementation safeguards\n- Briefing generator must move from `resourceOverrides.maxTurns` to direct options mutation post-prep\n- Existing artifacts with budget fields are silently ignored (no migration needed)\n- `handleHalt` becomes dead code after removal; plan leaves it to implementer/reviewer whether to delete or keep for future halt triggers"
  - timestamp: 2026-03-22T19:08:28.101Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Research complete. Writing spec to .lore/specs/commissions/remove-budget-controls.md"
projectName: guild-hall
---
Spec and plan written for removing maxTurns/maxBudgetUsd from the commission system.

**Spec:** `.lore/specs/commissions/remove-budget-controls.md` (26 requirements across 10 categories: types, SDK, lifecycle, artifacts, packages, activation, toolbox/routes, scheduler, UI, documentation)

**Plan:** `.lore/plans/commissions/remove-budget-controls.md` (4 phases, 15 steps, full surface area catalog of 60+ files)

Key decisions:
- `model` field in `resourceOverrides` is preserved (capability selection, not cost control)
- `halted` state infrastructure is preserved (continue/save/cancel flows), but the maxTurns trigger is removed
- Internal utility session turn limits (briefing: 200/10/1, triage: 10, notes: 1) are preserved as implementation safeguards
- Briefing generator must move from `resourceOverrides.maxTurns` to direct options mutation post-prep
- Existing artifacts with budget fields are silently ignored (no migration needed)
- `handleHalt` becomes dead code after removal; plan leaves it to implementer/reviewer whether to delete or keep for future halt triggers
