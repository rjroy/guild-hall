---
title: Implementation notes: commission-layer-separation
date: 2026-03-01
status: complete
tags: [implementation, notes]
source: .lore/plans/commission-layer-separation.md
modules: [commission-record, commission-lifecycle, workspace, session-runner, commission-orchestrator, daemon-app, manager-toolbox]
---

# Implementation Notes: Commission Layer Separation

## Progress
- [x] Phase 1: Layer 1 - Commission Record
- [x] Phase 2: Layer 2 - Commission Lifecycle
- [x] Phase 3: Layer 3 - Workspace Operations
- [x] Phase 4: Layer 4 - Session Runner + Toolbox Callbacks
- [x] Phase 5: Layer 5 - Orchestrator
- [x] Phase 6: Production Wiring + Regression
- [x] Phase 7: Cleanup + Boundary Verification
- [x] Phase 8: Validate Against Spec

## Log

### Phase 1: Layer 1 - Commission Record
- Dispatched: Implementation of `CommissionRecordOps` interface (6 methods, regex-based YAML field replacement)
- Result: `daemon/services/commission/record.ts` (record ops) + `tests/daemon/services/commission/record.test.ts` (50 tests)
- Tests: 50/50 pass, full suite 1747/1747
- Review: `writeStatus`, `updateProgress`, `updateResult` silently no-oped when target field missing from artifact. `replaceYamlField` returned unchanged string without error.
- Resolution: Added field-existence guards to `writeStatus` and `replaceYamlField`. 3 new tests for missing-field scenarios. Final: 53/53 pass, full suite 1750/1750.

### Phase 2: Layer 2 - Commission Lifecycle
- Dispatched: `CommissionLifecycle` class with 8-state machine, signal interface, per-entry locking, transition triggers, and queries
- Result: `daemon/services/commission/lifecycle.ts` + `tests/daemon/services/commission/lifecycle.test.ts` (64 tests initially)
- Tests: 64/64 pass, full suite 1814/1814
- Review: Two critical issues found. (1) Signal methods (`progressReported`, `resultSubmitted`, `questionLogged`) skipped the per-entry lock, creating race conditions with cancel/fail. (2) `resultSignalReceived` flag not reset on redispatch, blocking result submission in second execution cycle.
- Type analysis: `TransitionResult` was `{ executed: boolean }` instead of discriminated union. `TrackedCommission` exported unnecessarily. IDs were plain `string` instead of branded `CommissionId`. `create` accepted any status, didn't reject duplicates.
- Resolution: All 9 fixes applied. Signals wrapped in lock. Flag reset in `executionStarted`. Discriminated union `TransitionResult`. Unexported `TrackedCommission`. Branded `CommissionId`. Duplicate ID guards. Narrowed `initialStatus`. Redispatch cycle test added. Non-null assertion commented. Final: 69/69 pass, full suite 1819/1819.
- Deferred: Event payload enrichment (adding `projectName`, `oldStatus` to `commission_status` events per REQ-CLS-9). Resolve during Layer 5 when the orchestrator consumes these events.

### Phase 3: Layer 3 - Workspace Operations
- Dispatched: `WorkspaceOps` interface with prepare, finalize, preserveAndCleanup, removeWorktree methods. Commission-agnostic with GitOps DI.
- Result: `daemon/services/workspace.ts` (303 lines) + `tests/daemon/services/workspace.test.ts` (38 tests)
- Tests: 38/38 pass, full suite 1857/1857
- Review: Clean. No commission type imports. cleanGitEnv enforced through DI boundary. Merge conflict handling correct. FinalizeResult is proper discriminated union. Two low-confidence observations: duplicated resolveSquashMerge logic (intentional, documented), and transitive import through toolbox-utils (cosmetic, not a violation).

### Phase 4: Layer 4 - Session Runner + Toolbox Callbacks
- Dispatched: `SessionRunner` interface + callback-based toolbox factory. Terminal state guard. Commission-agnostic session execution.
- Result: `daemon/services/session-runner.ts` + `tests/daemon/services/session-runner.test.ts` (28 tests initially). Callback factory added to `commission-toolbox.ts`.
- Tests: 28/28 pass, full suite 1885/1885
- Review: Critical REQ-CLS-23 violations. Session runner had commission knowledge baked in: hardcoded event type names (`commission_result`, etc.), `commissionContext` field, `"commissionId"` field check, `contextType: "commission"` hardcoded, follow-up prompt mentioning "commission." Terminal state guard didn't store first outcome. EventBus subscriber active after settlement.
- Resolution: All commission-domain knowledge extracted to generic spec fields (`contextId`, `contextType`, `contextIdField`, `eventTypes`, `activationExtras`, `followUpPrompt`). File renamed `commission-sdk-logging.ts` to `sdk-logging.ts`. Terminal guard stores first outcome. Unsubscribe before return. Isolation test expanded to catch string-literal coupling. Final: 32/32 pass, full suite 1889/1889.

### Phase 5: Layer 5 - Orchestrator
- Dispatched: Commission orchestrator implementing `CommissionSessionForRoutes` with six flows (dispatch, completion, cancel, recovery, dependency, update), heartbeat monitoring, and session callback wiring.
- Result: `daemon/services/commission/orchestrator.ts` (~800 lines initially, grew to ~1500 after hardening) + `tests/daemon/services/commission/orchestrator.test.ts` (26 tests initially)
- Tests: 26/26 pass, full suite 1915/1915
- Review (code-reviewer): 3 critical findings. (1) Missing `lifecycle.forget()` in completion/error paths (memory leak). (2) Worktree leak when `executionStarted` returns skipped. (3) `matter.stringify()` in `updateCommission` violates YAML preservation rule. Plus heartbeat default wrong (300s vs spec's 180s), missing cancel-during-prep test.
- Review (silent-failure-hunter): 15 findings across all severity levels. 2 critical (process crash from `void` async calls in callbacks and heartbeat), 4 high (sequential await chains where one failure prevents cleanup, cancel race, early returns leak worktrees), 7 medium (bare catch blocks, stale paths, inconsistent status sync).
- Resolution: All 15 fixes applied. `.catch()` handlers on all fire-and-forget promises. `lifecycle.forget()` in all terminal paths. Worktree cleanup on skip/early-return. `matter.stringify` replaced with regex. Cancel wrapped in try/catch. Sequential awaits wrapped individually. Bare catches given logging. `deleteStateFile` checks ENOENT. `addUserNote` falls back to integration. Heartbeat corrected to 180s. File size comment added. 15 new tests covering all fixes. Final: 41/41 pass, full suite 1930/1930.

### Phase 6: Production Wiring + Regression
- Dispatched: Replace `createCommissionSession()` in `daemon/app.ts` with layered orchestrator assembly. Update `manager-toolbox.ts` to remove direct artifact writes. Wire all 5 layers with real dependencies.
- Result: `daemon/app.ts` modified (replaced `CommissionSessionDeps` + `commissionSessionRef` pattern with Layer 1-5 assembly). `manager-toolbox.ts` modified (removed `appendTimelineEntry`, `resolveCommissionBasePath` imports; `add_commission_note` delegates to `commissionSession.addUserNote`). `session-runner.ts` modified (added `services` field to `SessionSpec` for manager toolbox). `orchestrator.ts` updated with `selfRef` pattern and lint fixes. 4 manager-toolbox tests rewritten for new interface. Lint fixes across several test files.
- Tests: 1930/1930 pass, typecheck clean, lint clean
- Review: No DI wiring gaps found. Production assembly correctly chains all layers.

### Phase 7: Cleanup + Boundary Verification
- Dispatched: Remove old commission files (commission-session.ts, commission-handlers.ts, commission-artifact-helpers.ts, commission-recovery.ts), remove old toolbox factory, update all imports, verify layer boundaries, delete superseded test files.
- Result: 4 old source files deleted. 9 old test files deleted (coverage moved to new layer tests). `commission-toolbox.ts` rewritten: old factory removed, handler factories exported, callback-based architecture. `CommissionSessionForRoutes` interface moved to `orchestrator.ts`. Orchestrator migrated from standalone artifact-helper functions to `recordOps` methods (30+ call sites). `commission-toolbox.test.ts` rewritten to test handler factories directly. 7 other files updated for import paths.
- Tests: 1706/1706 pass (224 tests removed with deleted files, coverage in new layer tests), typecheck clean, lint clean
- Boundary verification: Layer 1 has no layer imports. Layer 2 imports only Layer 1. Layers 3+4 have no commission type imports. Layer 5 is the only module importing from all layers. TrackedCommission has no execution state. ExecutionContext has no lifecycle fields.

### Phase 8: Validate Against Spec
- Dispatched: Fresh-context agent reviewed all 36 REQ-CLS requirements against implementation.
- Result: 28 PASS, 5 PARTIAL, 0 FAIL, 1 CANNOT VERIFY (REQ-CLS-35 requires runtime), 2 N/A.
- Findings: (1) `checkDependencyTransitions` bypassed lifecycle with direct recordOps writes. (2) Untracked cancel/redispatch bypassed lifecycle. (3) Event shape missing `projectName` and `oldStatus` (deferred from Phase 2, never resolved). (4) `progressReported` signal didn't append timeline entry. (5) `syncStatusToIntegration` bypasses lifecycle (accepted as intentional, writing copy of already-transitioned state to different path).
- Resolution: Findings 1-4 fixed. `checkDependencyTransitions` now uses register-transition-forget cycle through lifecycle. Cancel/redispatch of untracked commissions register temporarily before transitioning. `commission_status` events enriched with `oldStatus` and `projectName` fields (added to `SystemEvent` type in `event-bus.ts`). Finding 5 accepted as divergence (integration worktree sync is not a state transition). Final: 1706/1706 pass, typecheck clean, lint clean.

## Divergence

- `syncStatusToIntegration` in the orchestrator writes terminal status to the integration worktree artifact directly via `recordOps`, bypassing Layer 2. This is intentional: the lifecycle has already transitioned the commission and written to the activity worktree artifact. The integration sync is a copy of already-transitioned state to a different file path, not a state transition. Routing this through the lifecycle would require a `syncToPath` method that doesn't map to the state machine concept. (approved)
