---
title: "Commission: Fix: Guild Master portrait always wrong"
date: 2026-03-10
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "The Guild Master's portrait is always wrong in the UI. A recent fix ensured packaged workers always show the correct portrait regardless of how a meeting was started (manual or by request), but the Guild Master portrait is broken.\n\n## Investigation\n\n1. Find the recent fix for worker portraits (likely in meeting-related code or worker resolution). Understand what it changed and why the manager is excluded from the fix.\n2. Trace how the Guild Master's portrait is resolved vs. how packaged workers' portraits are resolved. The manager is a built-in worker (`daemon/services/manager/worker.ts`), not a package on disk, so its portrait resolution path may differ.\n3. Check the meeting artifact creation and the UI components that render portraits to find where the disconnect happens.\n\n## Fix\n\nOnce you understand the root cause, fix it so the Guild Master portrait is correct in all contexts (meetings started manually, meetings started by request, the dashboard, etc.). Make sure tests cover the fix."
dependencies: []
linked_artifacts:
  - lib/packages.ts

  - daemon/services/manager/worker.ts
  - tests/lib/packages.test.ts
  - daemon/services/manager/worker.ts
  - tests/lib/packages.test.ts
activity_timeline:
  - timestamp: 2026-03-10T07:57:23.342Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T07:57:23.343Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-10T07:57:23.381Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-10T07:57:31.424Z
    event: progress_report
    reason: "Starting investigation: searching for the recent portrait fix and tracing how the Guild Master's portrait is resolved vs. packaged workers."
  - timestamp: 2026-03-10T07:59:06.334Z
    event: progress_report
    reason: "Root cause confirmed: `resolveWorkerPortraits()` only scans filesystem packages. The Guild Master is built-in (path=\"\"), never on disk. Moving shared identity constants to lib/ and including the manager in the portrait map."
  - timestamp: 2026-03-10T08:01:38.756Z
    event: result_submitted
    reason: "Fixed the Guild Master portrait not displaying in the UI.\n\n**Root cause:** `resolveWorkerPortraits()` in `lib/packages.ts` only scanned filesystem packages (`~/.guild-hall/packages/`). The Guild Master is a built-in worker with `path: \"\"` (defined in `daemon/services/manager/worker.ts`), never on disk, so it was invisible to the portrait resolution function.\n\n**Fix (3 files changed):**\n1. `lib/packages.ts`: Added `MANAGER_WORKER_NAME` and `MANAGER_PORTRAIT_PATH` constants. Updated `resolveWorkerPortraits()` to always include the Guild Master entry before scanning disk packages.\n2. `daemon/services/manager/worker.ts`: Imports the shared constants from `lib/packages` and re-exports `MANAGER_WORKER_NAME` (all existing importers work unchanged). Uses `MANAGER_PORTRAIT_PATH` in `createManagerPackage()` to eliminate duplication.\n3. `tests/lib/packages.test.ts`: Updated all 6 portrait tests to account for the Guild Master always being present. Added a dedicated test verifying the Guild Master portrait is included even when no packages directory exists.\n\n**Verification:** Typecheck clean, lint clean, 2396 tests pass (0 failures)."
  - timestamp: 2026-03-10T08:01:44.478Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Root cause confirmed: `resolveWorkerPortraits()` only scans filesystem packages. The Guild Master is built-in (path=\"\"), never on disk. Moving shared identity constants to lib/ and including the manager in the portrait map."
projectName: guild-hall
---
Fixed the Guild Master portrait not displaying in the UI.

**Root cause:** `resolveWorkerPortraits()` in `lib/packages.ts` only scanned filesystem packages (`~/.guild-hall/packages/`). The Guild Master is a built-in worker with `path: ""` (defined in `daemon/services/manager/worker.ts`), never on disk, so it was invisible to the portrait resolution function.

**Fix (3 files changed):**
1. `lib/packages.ts`: Added `MANAGER_WORKER_NAME` and `MANAGER_PORTRAIT_PATH` constants. Updated `resolveWorkerPortraits()` to always include the Guild Master entry before scanning disk packages.
2. `daemon/services/manager/worker.ts`: Imports the shared constants from `lib/packages` and re-exports `MANAGER_WORKER_NAME` (all existing importers work unchanged). Uses `MANAGER_PORTRAIT_PATH` in `createManagerPackage()` to eliminate duplication.
3. `tests/lib/packages.test.ts`: Updated all 6 portrait tests to account for the Guild Master always being present. Added a dedicated test verifying the Guild Master portrait is included even when no packages directory exists.

**Verification:** Typecheck clean, lint clean, 2396 tests pass (0 failures).
