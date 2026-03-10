---
title: "Commission: Fix lint errors in admin route and register tests"
date: 2026-03-10
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix 22 lint errors (`@typescript-eslint/require-await`) in two test files:\n\n1. `tests/cli/register.test.ts` (2 errors, lines 218 and 234): async arrow functions `mockFetch` and `failingFetch` have no `await` expression.\n2. `tests/daemon/routes/admin.test.ts` (20 errors): async methods on mock objects have no `await` expression. Mock methods like `branchExists`, `commitAll`, `hasUncommittedChanges`, `currentBranch`, `listWorktrees`, `detectDefaultBranch`, `createPullRequest`, `isAncestor`, `treesEqual`, `revParse`, `squashMergeNoCommit`, `listConflictedFiles`, `hasCommitsBeyond`, `readConfigFromDisk`, and `syncProject`.\n\n**Fix:** Remove the `async` keyword from these mock functions/methods since they don't use `await`. They return values directly (or return `Promise.resolve()` implicitly). If any return a Promise explicitly, keep `async`; otherwise drop it.\n\nRun `bun run lint` after fixing to confirm zero errors."
dependencies: []
linked_artifacts: []

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
current_progress: ""
projectName: guild-hall
---
