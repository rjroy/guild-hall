---
title: "Commission: Fix typecheck and lint failures"
date: 2026-03-15
status: dispatched
type: one-shot
tags: [commission]
worker: Sable
workerDisplayTitle: "Guild Breaker"
prompt: "There are typecheck and/or lint failures in the codebase. Your job:\n\n1. Run `bun run typecheck` and fix all errors.\n2. Run `bun run lint` and fix all errors.\n3. Repeat steps 1 and 2 until both pass cleanly (fixes to one can introduce issues in the other).\n4. Run `bun test` to make sure nothing is broken.\n\nDo not add new features or refactor. Only fix the type and lint errors."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-15T02:09:51.560Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-15T02:09:51.562Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
