---
title: "Commission: Run typecheck, lint, tests and fix errors"
date: 2026-03-09
status: dispatched
tags: [commission]
worker: Sable
workerDisplayTitle: "Guild Breaker"
prompt: "Run the full verification suite and fix any errors found.\n\n1. Run `bun run typecheck` — fix all type errors\n2. Run `bun run lint` — fix all lint errors\n3. Run `bun test` — fix all test failures\n\nRecent work on the branch includes:\n- Portrait Display-Time Resolution\n- Model Selection (VALID_MODELS, three-tier resolution, UI display)\n- Mail Reader Toolbox (packages/guild-hall-email/, JMAP client, four tools, factory)\n- Scheduled Commissions (scheduler service, schedule lifecycle, cron wrapper, manager toolbox, UI, daemon wiring)\n- Multiple rounds of review fixes (commission route types, promise rejection, test gap fills, describeCron extraction)\n\nAll of these landed as separate commissions on separate worktrees. There may be merge conflicts or integration issues. Fix whatever you find.\n\nAfter fixing, re-run all three commands to confirm everything is clean. Do not declare complete until typecheck, lint, and tests all pass."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-09T20:30:16.415Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T20:30:16.416Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
