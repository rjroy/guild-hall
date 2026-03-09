---
title: "Commission: Run typecheck, lint, tests and fix errors"
date: 2026-03-09
status: dispatched
tags: [commission]
worker: Sable
workerDisplayTitle: "Guild Breaker"
prompt: "Run the full verification suite and fix any errors found.\n\n1. Run `bun run typecheck` — fix all type errors\n2. Run `bun run lint` — fix all lint errors\n3. Run `bun test` — fix all test failures\n\nRecent work landed on the branch includes:\n- Portrait Display-Time Resolution (removed workerPortraitUrl from artifacts, display-time resolution from packages)\n- Model Selection (VALID_MODELS constant, three-tier resolution, commission/meeting/briefing model wiring, UI display)\n- Mail Reader Toolbox (packages/guild-hall-email/ — JMAP client, four read-only tools, factory with three states)\n- Review fix-ups (commission route types, unhandled promise rejection, unconfigured handler test)\n\nThese all landed as separate commissions on separate worktrees, so there may be merge conflicts or integration issues between them. Fix whatever you find.\n\nAfter fixing, re-run all three commands to confirm everything is clean. Do not declare complete until typecheck, lint, and tests all pass."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-09T12:59:11.552Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T12:59:11.553Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
