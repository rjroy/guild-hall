---
title: "Commission: Add cancel_commission tool to manager toolbox"
date: 2026-02-27
status: pending
tags: [commission]
worker: Developer
workerDisplayTitle: "Guild Developer"
prompt: "Implement the cancel_commission manager tool as specified in `.lore/plans/cancel-commission-tool.md`.

**Summary of work (4 steps):**

1. **Thread `reason` through `cancelCommission()`** in `daemon/services/commission-session.ts`: Add an optional `reason` parameter (default: `\"Commission cancelled by user\"`) and pass it through to the `transitionCommission()` call, the `eventBus.emit()` call, and the `syncStatusToIntegration()` call. Update the `CommissionSessionForRoutes` interface to match.

2. **Add `cancel_commission` tool** to `daemon/services/manager-toolbox.ts`: Create a `makeCancelCommissionHandler(deps)` factory following the established pattern. Parameters: `commissionId` (string, required), `reason` (string, optional, defaults to \"Commission cancelled by manager\"). Call `deps.commissionSession.cancelCommission(commissionId, reason)`. Return success JSON or `{ isError: true }` on failure.

3. **Add tests**: In `tests/daemon/services/manager-toolbox.test.ts`, add a `describe(\"cancel_commission\")` block with 5 tests (success, custom reason, not found, invalid transition, default reason). In `tests/daemon/commission-session.test.ts`, add a test verifying custom reason flows through to the emitted event.

4. **Validate**: Run `bun test` and `bun run typecheck` to verify everything passes.

Read the plan file first for full context including codebase locations and line numbers."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-02-27T04:09:29.841Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-02-27T04:09:29.878Z
    event: manager_dispatched
    reason: "Guild Master dispatched commission \"Add cancel_commission tool to manager toolbox\""
current_progress: ""
result_summary: ""
projectName: guild-hall
---
