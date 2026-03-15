---
title: "Commission: Fix lint and typecheck errors"
date: 2026-03-15
status: completed
type: one-shot
tags: [commission]
worker: Sable
workerDisplayTitle: "Guild Breaker"
prompt: "There are lint errors in the codebase that are likely also breaking typecheck. Run `bun run lint` and `bun run typecheck` to identify them, then fix all errors found.\n\nThis is a fix-only task. Don't add new features or refactor beyond what's needed to resolve the errors. After fixing, verify both `bun run lint` and `bun run typecheck` pass cleanly."
dependencies: []
linked_artifacts:
  - web/components/dashboard/build-tree-list.ts

  - tests/components/commission-view.test.tsx
  - tests/components/commission-view.test.tsx
activity_timeline:
  - timestamp: 2026-03-15T09:11:55.468Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-15T09:11:55.470Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-15T09:11:55.512Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-15T09:12:02.344Z
    event: progress_report
    reason: "Running lint and typecheck to identify errors."
  - timestamp: 2026-03-15T09:13:37.831Z
    event: result_submitted
    reason: "Fixed 6 lint errors across 2 files. Both `bun run lint` and `bun run typecheck` pass clean.\n\n**`web/components/dashboard/build-tree-list.ts`** — Removed unused import `buildDependencyGraph` (1 error).\n\n**`tests/components/commission-view.test.tsx`** — Replaced 3 `require()` calls with top-level ESM imports (`react`, `react-markdown`, `remark-gfm`) and moved `children` from props object to `createElement`'s third argument (5 errors: 3 no-require-imports, 1 no-children-prop, 1 no-unsafe-call). All 52 tests in the file still pass."
  - timestamp: 2026-03-15T09:13:42.149Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Running lint and typecheck to identify errors."
projectName: guild-hall
---
Fixed 6 lint errors across 2 files. Both `bun run lint` and `bun run typecheck` pass clean.

**`web/components/dashboard/build-tree-list.ts`** — Removed unused import `buildDependencyGraph` (1 error).

**`tests/components/commission-view.test.tsx`** — Replaced 3 `require()` calls with top-level ESM imports (`react`, `react-markdown`, `remark-gfm`) and moved `children` from props object to `createElement`'s third argument (5 errors: 3 no-require-imports, 1 no-children-prop, 1 no-unsafe-call). All 52 tests in the file still pass.
