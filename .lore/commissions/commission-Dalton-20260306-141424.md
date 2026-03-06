---
title: "Commission: Implement: Worker Identity and Personality in Packages"
date: 2026-03-06
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the Worker Identity and Personality plan at `.lore/plans/worker-identity-and-personality.md`. The spec is at `.lore/specs/worker-identity-and-personality.md`.\n\nRead both documents fully before starting. The plan has 9 steps covering types, discovery, prompt assembly, wiring, posture cleanup, soul file creation, manager split, test updates, and review.\n\nKey points:\n- Steps 1-4: Infrastructure. Add `soul` field to types/schemas, load `soul.md` in discovery, update prompt assembly order (soul -> identity -> posture -> memory -> context), wire through session preparation.\n- Step 5: Remove Vibe lines from all five roster posture files. Save the text for use in Step 6.\n- Step 6: Create `soul.md` files for all five roster workers (Character, Voice, Vibe sections). Read `.lore/research/soul-md-personality-techniques.md` for guidance. Each file under 80 lines. You're a developer, not a writer, so create structurally correct files with reasonable content. Keep it grounded in each worker's existing posture and identity.\n- Step 7: Split manager's `MANAGER_POSTURE` into `MANAGER_SOUL` + `MANAGER_POSTURE`. Update `activateManager()` to follow the same assembly order as `buildSystemPrompt()`, including identity metadata.\n- Steps 8-9: Update smoke/roster tests, full suite verification, fresh-eyes review.\n\nThe delegation guide says Step 3 (prompt assembly) and Step 7 (manager convergence) carry the most risk. Write tests alongside each step per the plan's test strategy. Run `bun test` after each step."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-06T22:14:24.736Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-06T22:14:24.736Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
