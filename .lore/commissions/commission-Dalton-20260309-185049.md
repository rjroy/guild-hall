---
title: "Commission: Fix: dependency resolution uses raw ID instead of artifact path"
date: 2026-03-10
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Bug fix in `daemon/services/commission/orchestrator.ts`, function `checkDependencyTransitions`.\n\n**The bug:** Line 842 checks dependency satisfaction by joining the raw dependency ID with the integration worktree path:\n```typescript\ndependencies.map((dep) => fileExists(path.join(iPath, dep))),\n```\n\n`readDependencies` returns raw commission IDs like `\"commission-Dalton-20260309-183331\"`. This produces a path like `<integration-worktree>/commission-Dalton-20260309-183331`, which doesn't exist. The actual artifact lives at `<integration-worktree>/.lore/commissions/commission-Dalton-20260309-183331.md`.\n\nBlocked commissions never unblock because the file check always fails.\n\n**The fix:** Use `commissionArtifactPath()` (already imported in the file) to resolve each dependency ID to its actual artifact path before checking existence:\n\n```typescript\ndependencies.map((dep) => fileExists(commissionArtifactPath(iPath, dep as CommissionId))),\n```\n\n**Tests:** Add a test to `tests/daemon/services/commission/orchestrator.test.ts` (or wherever dependency transition tests live) that verifies a blocked commission transitions to pending when its dependency's artifact file exists at the correct `.lore/commissions/<id>.md` path.\n\nRun `bun test` after the fix."
dependencies: []
linked_artifacts:
  - daemon/services/commission/orchestrator.ts

  - tests/daemon/services/commission/orchestrator.test.ts
  - tests/daemon/services/mail/orchestrator.test.ts
  - tests/daemon/services/commission/orchestrator.test.ts
  - tests/daemon/services/mail/orchestrator.test.ts
activity_timeline:
  - timestamp: 2026-03-10T01:50:49.687Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T01:50:49.688Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-10T01:50:49.720Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-10T01:50:58.267Z
    event: progress_report
    reason: "Starting bug fix. Reading orchestrator source and test file."
  - timestamp: 2026-03-10T01:56:48.243Z
    event: result_submitted
    reason: "Fixed dependency path resolution bug in `checkDependencyTransitions`.\n\n**Bug:** Line 842 of `daemon/services/commission/orchestrator.ts` used `path.join(iPath, dep)` to check dependency existence. Since `readDependencies` returns raw commission IDs (e.g. `\"commission-Dalton-20260309-183331\"`), this produced `<integration-worktree>/commission-Dalton-20260309-183331` instead of the actual artifact path at `<integration-worktree>/.lore/commissions/commission-Dalton-20260309-183331.md`. Blocked commissions never unblocked.\n\n**Fix:** Replaced `path.join(iPath, dep)` with `commissionArtifactPath(iPath, dep)` (already imported), which correctly resolves to `.lore/commissions/<id>.md`.\n\n**Tests updated:**\n- `tests/daemon/services/commission/orchestrator.test.ts`: Updated both dependency auto-transition tests to use raw commission IDs instead of full relative paths (which masked the bug).\n- `tests/daemon/services/mail/orchestrator.test.ts`: Updated the abandon-sleeping-unblocks-dependent test to use raw commission ID format.\n\n**Verification:** 2345 tests pass, 0 fail. Typecheck clean."
  - timestamp: 2026-03-10T01:56:56.692Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Starting bug fix. Reading orchestrator source and test file."
projectName: guild-hall
---
Fixed dependency path resolution bug in `checkDependencyTransitions`.

**Bug:** Line 842 of `daemon/services/commission/orchestrator.ts` used `path.join(iPath, dep)` to check dependency existence. Since `readDependencies` returns raw commission IDs (e.g. `"commission-Dalton-20260309-183331"`), this produced `<integration-worktree>/commission-Dalton-20260309-183331` instead of the actual artifact path at `<integration-worktree>/.lore/commissions/commission-Dalton-20260309-183331.md`. Blocked commissions never unblocked.

**Fix:** Replaced `path.join(iPath, dep)` with `commissionArtifactPath(iPath, dep)` (already imported), which correctly resolves to `.lore/commissions/<id>.md`.

**Tests updated:**
- `tests/daemon/services/commission/orchestrator.test.ts`: Updated both dependency auto-transition tests to use raw commission IDs instead of full relative paths (which masked the bug).
- `tests/daemon/services/mail/orchestrator.test.ts`: Updated the abandon-sleeping-unblocks-dependent test to use raw commission ID format.

**Verification:** 2345 tests pass, 0 fail. Typecheck clean.
