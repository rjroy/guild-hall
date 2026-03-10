---
title: "Commission: Fix: lint, typecheck, and test errors"
date: 2026-03-10
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "The CI build failed on the PR. Run `bun run lint`, `bun run typecheck`, and `bun test` in sequence. Fix all errors you find. Keep iterating until all three pass cleanly with zero errors.\n\nDo not skip any failures. Do not defer. Run each command, fix what breaks, run again until clean."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-10T03:46:32.003Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T03:46:32.004Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
