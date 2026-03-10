---
title: "Commission: Fix lint errors in admin route and register tests"
date: 2026-03-10
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix 22 lint errors (`@typescript-eslint/require-await`) in two test files:\n\n1. `tests/cli/register.test.ts` (2 errors, lines 218 and 234): async arrow functions `mockFetch` and `failingFetch` have no `await` expression.\n2. `tests/daemon/routes/admin.test.ts` (20 errors): async methods on mock objects have no `await` expression. Mock methods like `branchExists`, `commitAll`, `hasUncommittedChanges`, `currentBranch`, `listWorktrees`, `detectDefaultBranch`, `createPullRequest`, `isAncestor`, `treesEqual`, `revParse`, `squashMergeNoCommit`, `listConflictedFiles`, `hasCommitsBeyond`, `readConfigFromDisk`, and `syncProject`.\n\n**Fix:** Remove the `async` keyword from these mock functions/methods since they don't use `await`. They return values directly (or return `Promise.resolve()` implicitly). If any return a Promise explicitly, keep `async`; otherwise drop it.\n\nRun `bun run lint` after fixing to confirm zero errors."
dependencies: []
linked_artifacts:
  - tests/cli/register.test.ts

  - tests/daemon/routes/admin.test.ts
  - tests/daemon/routes/admin.test.ts
resource_overrides:
  model: haiku

activity_timeline:
  - timestamp: 2026-03-10T22:27:14.787Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T22:27:14.789Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-10T22:27:14.823Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-10T22:27:20.078Z
    event: progress_report
    reason: "Starting lint error fix. Reading test files to identify async functions without await."
  - timestamp: 2026-03-10T22:28:48.433Z
    event: progress_report
    reason: "Fixed all 22 lint errors. Removed async keyword from functions without await in both test files. Tests pass: 2492 pass, 0 fail."
  - timestamp: 2026-03-10T22:28:52.994Z
    event: result_submitted
    reason: "Fixed all 22 `@typescript-eslint/require-await` lint errors across two test files:\n\n**tests/cli/register.test.ts** (2 fixes):\n- Line 218: Removed `async` from `mockFetch` function (no await used)\n- Line 234: Removed `async` from `failingFetch` function (no await used)\n\n**tests/daemon/routes/admin.test.ts** (20 fixes):\n- Removed `async` from all mock GitOps methods in `makeAdminDeps()` (lines 12-40) and converted to explicit `Promise.resolve()` returns\n- Removed `async` from `readConfigFromDisk` and `syncProject` methods in the main factory (lines 42-43)\n- Removed `async` from all test-specific overrides in the four test cases (lines 63, 90, 114, 120, 162)\n\n**Verification:**\n- `bun run lint` passes with zero errors\n- All 2492 tests pass, 0 fail\n- No regressions introduced"
  - timestamp: 2026-03-10T22:28:56.068Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Fixed all 22 lint errors. Removed async keyword from functions without await in both test files. Tests pass: 2492 pass, 0 fail."
projectName: guild-hall
---
Fixed all 22 `@typescript-eslint/require-await` lint errors across two test files:

**tests/cli/register.test.ts** (2 fixes):
- Line 218: Removed `async` from `mockFetch` function (no await used)
- Line 234: Removed `async` from `failingFetch` function (no await used)

**tests/daemon/routes/admin.test.ts** (20 fixes):
- Removed `async` from all mock GitOps methods in `makeAdminDeps()` (lines 12-40) and converted to explicit `Promise.resolve()` returns
- Removed `async` from `readConfigFromDisk` and `syncProject` methods in the main factory (lines 42-43)
- Removed `async` from all test-specific overrides in the four test cases (lines 63, 90, 114, 120, 162)

**Verification:**
- `bun run lint` passes with zero errors
- All 2492 tests pass, 0 fail
- No regressions introduced
