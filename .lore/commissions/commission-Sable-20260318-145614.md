---
title: "Commission: Fix Illuminator package test failures, lint, and typecheck errors"
date: 2026-03-18
status: dispatched
type: one-shot
tags: [commission]
worker: Sable
workerDisplayTitle: "Guild Breaker"
prompt: "The Illuminator worker package at `packages/guild-hall-illuminator/` was just created by Dalton. There are test failures and possibly lint/typecheck errors.\n\nRun these commands and fix everything that's broken:\n\n1. `bun run typecheck` — fix any type errors\n2. `bun run lint` — fix any lint errors\n3. `bun test` — fix any test failures\n\nFocus on the new `packages/guild-hall-illuminator/` package and its tests at `tests/packages/guild-hall-illuminator/`. But also check that no existing tests were broken by the changes.\n\nIterate until all three commands pass clean. Don't add new features or refactor existing code. Just fix what's broken."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T21:56:14.186Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T21:56:14.187Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
