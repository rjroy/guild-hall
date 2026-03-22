---
title: "Commission: Spec and plan: Remove maxTurns and maxBudget from commission system"
date: 2026-03-22
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "The maxTurns and maxBudget fields in the commission system have provided no benefit and caused repeated failures (Guild Master has no intuition for appropriate values, leading to commissions failing or halting unnecessarily). Budget management belongs at the account level (Anthropic API usage limits), not within Guild Hall.\n\nWrite a spec and implementation plan for removing maxTurns and maxBudget from the entire system. This includes:\n\n- `resourceOverrides` in commission creation (manager toolbox, routes, types)\n- `maxTurns` and `maxBudgetUsd` fields on commission artifacts and state\n- The halted state logic that triggers when maxTurns is exceeded (commissions should run to completion or failure, not halt on an arbitrary turn count)\n- Config defaults for these values\n- UI elements that display or set them\n- Scheduled commission and triggered commission resource overrides\n- SDK runner turn/budget enforcement\n\nTrace the full surface area. Every file that references maxTurns, maxBudgetUsd, or resourceOverrides needs to be cataloged. The plan should be a clean removal with no replacement mechanism.\n\nOne consideration: the halted state itself may still have value for other reasons (SDK errors, user-initiated stops). Don't remove halted state, just remove the maxTurns trigger for it.\n\nSave the spec to `.lore/specs/commissions/remove-budget-controls.md` and the plan to `.lore/plans/commissions/remove-budget-controls.md`."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-22T19:03:13.349Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T19:03:13.350Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
