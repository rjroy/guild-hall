---
title: "Phase 4: Untangle Commission Callbacks via EventBus"
date: 2026-02-27
status: draft
tags: [plan, refactor, toolbox]
related:
  - plans/toolbox-composability-refactor.md
---

# Phase 4: Untangle Commission Callbacks via EventBus

## Context

The commission toolbox and commission session are coupled through a callback pattern where the session creates `CommissionCallbacks`, partially applies them into the toolbox factory, and the toolbox calls back into the session's state after each tool invocation. The callbacks are thin adapters: they mutate session state, log, and emit to EventBus. The "result submitted" signal travels through three redundant layers (handler closure, factory closure via getter, session field), all set from the same callback. A test hook (`onCallbacksCreated`) lets tests intercept the callbacks for simulation, appearing 40+ times across test files.

The EventBus already exists and the callbacks already emit to it. Route notifications through EventBus directly and eliminate the callback middleman.

## What Changes

**Commission toolbox** emits events to EventBus after file writes instead of calling callbacks.
**Commission session** subscribes to EventBus for this commission's events and updates its own state.
**`wasResultSubmitted`** getter chain removed from toolbox, resolver, and shared types.
**`CommissionCallbacks`** interface and `onCallbacksCreated` test hook removed.

Result tracking collapses from three levels to two:
- Handler closure `resultSubmitted` (idempotency: prevent MCP tool double-call)
- Session field `commission.resultSubmitted` (completion check, set by EventBus subscription)

## Data Flow After

```
Toolbox handler (report_progress / submit_result / log_question):
  1. Write to disk
  2. [submit_result only] Set handler resultSubmitted = true (idempotency)
  3. Emit event to EventBus

EventBus delivers to all subscribers:
  -> Session subscription: update commission.resultSubmitted, resultSummary, lastActivity
  -> SSE subscriber: stream to browser (already existed, unchanged)

After SDK completes:
  4. Session checks commission.resultSubmitted directly
  5. If false, run follow-up session
  6. Return boolean to handleCompletion
```

## Steps

### 1. Remove `wasResultSubmitted` from shared types and resolver

**`daemon/services/toolbox-types.ts`** (line 22): Remove `wasResultSubmitted` from `ToolboxOutput`.

**`lib/types.ts`** (lines 103-104): Remove `wasResultSubmitted` from `ResolvedToolSet`.

**`daemon/services/toolbox-resolver.ts`**: Remove the `wasResultSubmitted` variable (line 41), the capture block (lines 60-62), and from the return (line 90).

### 2. Refactor commission toolbox to emit to EventBus

**`daemon/services/commission-toolbox.ts`**:

- `CommissionToolboxDeps`: replace `onProgress/onResult/onQuestion` with `eventBus: EventBus`. Import `EventBus` and `SystemEvent` types.
- Handler factories emit events directly after file writes:
  - `makeReportProgressHandler` (line 59): `deps.eventBus.emit({ type: "commission_progress", commissionId: deps.contextId, summary: args.summary })`
  - `makeSubmitResultHandler` (line 114): `deps.eventBus.emit({ type: "commission_result", commissionId: deps.contextId, summary: args.summary, artifacts: args.artifacts })`
  - `makeLogQuestionHandler` (line 135): `deps.eventBus.emit({ type: "commission_question", commissionId: deps.contextId, question: args.question })`
- `createCommissionToolbox`: return type becomes `McpSdkServerConfigWithInstance` (not `CommissionToolboxResult`). Remove the factory-level `resultSubmitted` closure (line 169) and the wrapper that tracked it (lines 190-194). The `submit_result` tool calls the handler directly. Keep handler-level `resultSubmitted` for idempotency.
- Delete `CommissionCallbacks` interface (lines 212-216) and `CommissionToolboxResult` interface (lines 155-158).
- `createCommissionToolboxFactory(eventBus: EventBus)` instead of `createCommissionToolboxFactory(callbacks)`. Returns `{ server: createCommissionToolbox({...deps, eventBus}) }`.

### 3. Refactor commission session to subscribe to EventBus

**`daemon/services/commission-session.ts`**:

- Remove import of `CommissionCallbacks` (line 59).
- Remove `onCallbacksCreated` from `CommissionSessionDeps` (lines 182-186).
- Update `resolveToolSetFn` JSDoc (lines 176-178) to remove `wasResultSubmitted` reference.
- Replace the callback creation block (lines 1057-1097) with an EventBus subscription:
  ```
  Subscribe to EventBus, filter by commissionId.
  commission_result -> set resultSubmitted, resultSummary, resultArtifacts, lastActivity, log
  commission_progress -> set lastActivity, log
  commission_question -> set lastActivity, log
  ```
- Remove `deps.onCallbacksCreated?.(callbacks)` (line 1097).
- Change factory creation (line 1100): `createCommissionToolboxFactory(deps.eventBus)`.
- Replace all `resolvedTools.wasResultSubmitted?.() ?? false` (lines 1229, 1232, 1237, 1276) with `commission.resultSubmitted`.
- Wrap the SDK session loop and follow-up in try/finally with `unsubscribe()` to prevent leaks.

`handleError` (line 1914) already reads `commission.resultSubmitted` directly, so it's unchanged.

### 4. Update commission toolbox tests

**`tests/daemon/commission-toolbox.test.ts`**:

- Create a test EventBus in beforeEach, subscribe to capture emitted events.
- Replace callback mocks in deps with `eventBus: testEventBus`.
- "Callback invocation" tests become "event emission" tests: verify emitted events match expected shape.
- Remove `wasResultSubmitted()` assertions from `createCommissionToolbox` tests. Handler idempotency tests (double submit returns error) stay.

### 5. Update commission session tests

**`tests/daemon/commission-session.test.ts`** (largest change, ~40 `onCallbacksCreated` refs):

- Rewrite `createMockSession()`:
  - Remove `capturedCallbacks` and `onCallbacksCreated`.
  - Remove `wasResultSubmitted` from `resolveToolSetFn` return.
  - `submitResult(eventBus, commissionId, summary, artifacts?)` emits `commission_result` to EventBus.
  - `reportProgress(eventBus, commissionId, summary)` emits `commission_progress`.
  - `logQuestion(eventBus, commissionId, question)` emits `commission_question`.
- Remove `onCallbacksCreated: mock.onCallbacksCreated` from all `createTestDeps` calls.
- Update all `mock.submitResult(summary)` to `mock.submitResult(eventBus, commissionId, summary)`. Same for `reportProgress`, `logQuestion`.

### 6. Update remaining test files

Same mechanical pattern for each:

- **`tests/daemon/commission-concurrent-limits.test.ts`** (~18 `onCallbacksCreated` refs): Rewrite mock helper, remove callbacks, pass EventBus+commissionId.
- **`tests/daemon/concurrency-hardening.test.ts`** (~6 refs): Same pattern.
- **`tests/daemon/dependency-auto-transitions.test.ts`** (2 `wasResultSubmitted` refs): Remove from `resolveToolSetFn` return.
- **`tests/daemon/toolbox-resolver.test.ts`** (2 refs): Remove `wasResultSubmitted` assertions.
- **`tests/daemon/state-isolation.test.ts`** (3 refs): Remove `wasResultSubmitted` assertions.

### 7. Update docs

- Update module header in `commission-toolbox.ts` (lines 1-15): describe EventBus emission instead of callbacks.
- Update `CommissionSessionDeps.resolveToolSetFn` JSDoc.
- Update CLAUDE.md daemon module table entries for commission-toolbox and commission-session.

## What Stays the Same

- `EventBus` interface and `createEventBus()` (unchanged)
- SSE route `/events` (unchanged, already subscribes to EventBus)
- Commission artifact helpers (unchanged, write to disk)
- Manager toolbox (unchanged, separate injection)
- Meeting toolbox (unchanged, no callbacks)
- Base toolbox (unchanged)
- `handleCompletion` and `handleError` logic (unchanged, read `commission.resultSubmitted`)
- Production wiring in `app.ts` (never set `onCallbacksCreated`)

## Risks

**EventBus is synchronous.** `emit()` calls subscribers inline. When the toolbox emits `commission_result`, the session subscription runs immediately, updating `commission.resultSubmitted` before `emit()` returns. No timing gap.

**Unsubscribe on cleanup.** The try/finally ensures cleanup even on abort or throw. Without it, a dead subscription would leak.

**Test volume.** ~65 `onCallbacksCreated` removals, ~29 `wasResultSubmitted` removals, ~6 `CommissionCallbacks` removals. Changes are mechanical (remove callbacks, add EventBus+commissionId params).

## Verification

```bash
bun test                                           # all 1532 tests pass
bun test tests/daemon/commission-toolbox.test.ts   # toolbox event emission
bun test tests/daemon/commission-session.test.ts   # session lifecycle via EventBus
bun test tests/daemon/toolbox-resolver.test.ts     # resolver no longer returns wasResultSubmitted
bun test tests/daemon/state-isolation.test.ts      # cross-context isolation
bun test tests/daemon/commission-concurrent-limits.test.ts
bun test tests/daemon/concurrency-hardening.test.ts
bun test tests/daemon/dependency-auto-transitions.test.ts
bun run typecheck                                  # no type errors
bun run lint                                       # no lint errors
```
