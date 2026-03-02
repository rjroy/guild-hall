---
title: Production wiring and regression testing
date: 2026-03-01
status: pending
tags: [task]
source: .lore/plans/commission-layer-separation.md
related:
  - .lore/specs/commission-layer-separation.md
  - .lore/design/commission-layer-separation.md
sequence: 6
modules: [daemon-app, manager-toolbox, commission-orchestrator]
---

# Task: Production Wiring and Regression Testing

## What

This is the swap step. All new layers exist and have their own tests. Wire them into production and verify the full test suite passes.

1. **Update `createProductionApp()`** in `daemon/app.ts`: Replace `createCommissionSession()` with the new orchestrator. Wire Layer 1, Layer 2, Layer 3, Layer 4, EventBus, config, and path utilities as real dependencies.

2. **Update `manager-toolbox.ts`**: Remove `appendTimelineEntry` import from `commission-artifact-helpers`. Remove the `manager_dispatched` timeline write. Replace the `add_commission_note` tool's direct `appendTimelineEntry` + EventBus emission with `commissionSession.addUserNote(cid, content)`. Remove imports of `resolveCommissionBasePath` and direct EventBus emission for notes.

3. **Run the full test suite**: All 1,529 existing tests must pass. Tests that test external behavior (routes, SSE events, artifact format) should pass without modification. Tests that test internal implementation details are expected to break and are rewritten to test new layer boundaries.

4. **Fresh-eyes review**: Launch `pr-review-toolkit:code-reviewer` sub-agent with no implementation context to review production wiring in `daemon/app.ts`. DI wiring gaps are the single most common failure mode in this codebase (documented in two retros).

5. **Manual verification**: Start the daemon, create a commission, dispatch it, verify SSE events stream correctly, verify artifact updates, verify crash recovery.

**Tests to rewrite** (directly test old internal interfaces):
- `tests/daemon/services/commission-handlers.test.ts` - tests enter/exit handlers that no longer exist
- `tests/daemon/commission-crash-recovery.test.ts` - imports `ActiveCommissionEntry` and `ActivityMachine`
- `tests/daemon/services/commission-recovery.test.ts` - imports `recoverCommissions` from deleted file
- Any test that constructs `ActiveCommissionEntry` with execution fields alongside lifecycle fields

**Tests that should pass unchanged:**
- `tests/daemon/commission-session.test.ts` - tests `CommissionSessionForRoutes` interface
- `tests/daemon/commission-concurrent-limits.test.ts` - tests capacity functions
- `tests/daemon/commission-artifact-helpers.test.ts` - tests artifact I/O
- `tests/daemon/commission-toolbox.test.ts` - tests toolbox behavior
- `tests/api/commissions.test.ts` - tests route handlers

## Validation

- All 1,529 existing tests pass (some rewritten for new layer boundaries, assertions unchanged where testing external behavior)
- `tests/daemon/commission-artifact-helpers.test.ts` passes unchanged (timeline format preserved, REQ-CLS-32)
- State files are written to `~/.guild-hall/state/commissions/` with the same JSON schema (REQ-CLS-33)
- Fresh-eyes review by sub-agent with no implementation context catches no DI wiring gaps
- Manual check: create a commission artifact with pre-existing timeline entries, run through new layers, verify old entries are still readable
- Daemon starts, commission creates and dispatches, SSE events stream, artifact updates, crash recovery works

## Why

From `.lore/specs/commission-layer-separation.md`:

- REQ-CLS-31: All commission behaviors defined in original specs are preserved
- REQ-CLS-32: Activity timeline format and content are preserved
- REQ-CLS-33: Machine-local state files for crash recovery are preserved
- REQ-CLS-35: All 1,529 existing tests continue to pass throughout the migration

From prior retros (in-process-commissions, worker-dispatch, coverage-di-factories): DI factory codebases need an explicit production wiring step. Fresh-eyes review by a sub-agent with zero implementation context is the most reliable way to catch wiring gaps.

## Files

- `daemon/app.ts` (modify - replace commission session creation)
- `daemon/services/manager-toolbox.ts` (modify - remove direct artifact writes)
- `tests/daemon/services/commission-handlers.test.ts` (rewrite)
- `tests/daemon/commission-crash-recovery.test.ts` (rewrite)
- `tests/daemon/services/commission-recovery.test.ts` (rewrite)
