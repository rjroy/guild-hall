---
title: "Commission: Run pre-commit hook verification"
date: 2026-03-13
status: dispatched
type: one-shot
tags: [commission]
worker: Sable
workerDisplayTitle: "Guild Breaker"
prompt: "Run `.git-hooks/pre-commit.sh` and report the results. This runs typecheck, lint, tests, and production build. If anything fails, fix it and run the hook again until it passes clean."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-13T03:51:30.704Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-13T03:51:30.705Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
