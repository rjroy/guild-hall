---
title: "Commission: Fix unit tests, lint, and typecheck errors"
date: 2026-03-19
status: dispatched
type: one-shot
tags: [commission]
worker: Sable
workerDisplayTitle: "Guild Breaker"
prompt: "The codebase has test failures, lint errors, and/or typecheck errors after recent commissions completed.\n\nRun these commands and fix everything that's broken:\n\n1. `bun run typecheck` — fix any type errors\n2. `bun run lint` — fix any lint errors\n3. `bun test` — fix any test failures\n\nIterate until all three commands pass clean. Don't add new features or refactor existing code. Just fix what's broken."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-19T01:04:10.976Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-19T01:04:10.978Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
