---
title: "Commission: Fix: dependency resolution uses raw ID instead of artifact path"
date: 2026-03-10
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Bug fix in `daemon/services/commission/orchestrator.ts`, function `checkDependencyTransitions`.\n\n**The bug:** Line 842 checks dependency satisfaction by joining the raw dependency ID with the integration worktree path:\n```typescript\ndependencies.map((dep) => fileExists(path.join(iPath, dep))),\n```\n\n`readDependencies` returns raw commission IDs like `\"commission-Dalton-20260309-183331\"`. This produces a path like `<integration-worktree>/commission-Dalton-20260309-183331`, which doesn't exist. The actual artifact lives at `<integration-worktree>/.lore/commissions/commission-Dalton-20260309-183331.md`.\n\nBlocked commissions never unblock because the file check always fails.\n\n**The fix:** Use `commissionArtifactPath()` (already imported in the file) to resolve each dependency ID to its actual artifact path before checking existence:\n\n```typescript\ndependencies.map((dep) => fileExists(commissionArtifactPath(iPath, dep as CommissionId))),\n```\n\n**Tests:** Add a test to `tests/daemon/services/commission/orchestrator.test.ts` (or wherever dependency transition tests live) that verifies a blocked commission transitions to pending when its dependency's artifact file exists at the correct `.lore/commissions/<id>.md` path.\n\nRun `bun test` after the fix."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-10T01:50:49.687Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T01:50:49.688Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
