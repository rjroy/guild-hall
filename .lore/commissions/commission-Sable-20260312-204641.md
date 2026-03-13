---
title: "Commission: Fix lint errors"
date: 2026-03-13
status: completed
type: one-shot
tags: [commission]
worker: Sable
workerDisplayTitle: "Guild Breaker"
prompt: "Run `bun run lint` and fix all errors. Do not change any behavior, only fix lint violations. Run `bun run lint` again after fixes to confirm clean."
dependencies: []
linked_artifacts:
  - daemon/lib/agent-sdk/sdk-runner.ts

activity_timeline:
  - timestamp: 2026-03-13T03:46:41.347Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-13T03:46:41.349Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-13T03:46:41.388Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-13T03:46:47.925Z
    event: progress_report
    reason: "Running initial lint to identify all violations."
  - timestamp: 2026-03-13T03:47:41.812Z
    event: result_submitted
    reason: "Fixed 2 lint errors in `daemon/lib/agent-sdk/sdk-runner.ts`:\n\n1. **Line 281** (`@typescript-eslint/require-await`): Removed `async` from arrow function that had no `await` expression. The return type accepts sync values, so no behavior change.\n2. **Line 297** (`@typescript-eslint/no-unnecessary-type-assertion`): Removed redundant `as string` cast — the `typeof` guard on the line above already narrowed the type.\n\n`bun run lint` now passes clean."
  - timestamp: 2026-03-13T03:47:44.774Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Running initial lint to identify all violations."
projectName: guild-hall
---
Fixed 2 lint errors in `daemon/lib/agent-sdk/sdk-runner.ts`:

1. **Line 281** (`@typescript-eslint/require-await`): Removed `async` from arrow function that had no `await` expression. The return type accepts sync values, so no behavior change.
2. **Line 297** (`@typescript-eslint/no-unnecessary-type-assertion`): Removed redundant `as string` cast — the `typeof` guard on the line above already narrowed the type.

`bun run lint` now passes clean.
