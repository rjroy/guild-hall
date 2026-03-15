---
title: "Commission: Fix lint and typecheck errors"
date: 2026-03-15
status: dispatched
type: one-shot
tags: [commission]
worker: Sable
workerDisplayTitle: "Guild Breaker"
prompt: "There are lint errors in the codebase that are likely also breaking typecheck. Run `bun run lint` and `bun run typecheck` to identify them, then fix all errors found.\n\nThis is a fix-only task. Don't add new features or refactor beyond what's needed to resolve the errors. After fixing, verify both `bun run lint` and `bun run typecheck` pass cleanly."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-15T09:11:55.468Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-15T09:11:55.470Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
