---
title: Update commission tests and delete session-runner
date: 2026-03-03
status: complete
tags: [task]
source: .lore/plans/unified-sdk-runner.md
related: [.lore/design/unified-sdk-runner.md, .lore/specs/commission-layer-separation.md]
sequence: 4
modules: [commission-orchestrator, session-runner]
---

# Task: Commission Cleanup

## What

Fully update commission orchestrator tests for the new sdk-runner consumption pattern, delete session-runner.ts, and verify no references remain.

### 1. Update `tests/daemon/services/commission/orchestrator.test.ts`

- Replace `sessionRunner` mock with `prepDeps` and `queryFn` mocks in the deps factory
- Remove imports of `SessionRunner`, `SessionResult`, `SessionSpec`, `SessionCallbacks` from session-runner
- Verify EventBus subscription happens before session run
- Verify EventBus unsubscription happens after session completes
- Verify `resultSubmitted` tracking via EventBus `commission:result` events
- Verify abort handling: generator yields `{ type: "aborted" }`, drain reports `aborted: true`
- Verify error handling: generator yields `{ type: "error" }`, drain reports it
- Verify preparation failure: `prepareSdkSession` returns `{ ok: false }`, commission fails gracefully
- No follow-up retry tests (feature removed)

### 2. Delete `tests/daemon/services/session-runner.test.ts`

Remove entirely (951 lines). The session-runner module no longer exists; these tests have no subject.

### 3. Delete `daemon/services/session-runner.ts`

Remove the file (442 lines). Verify no remaining imports: `grep -r "session-runner" daemon/ tests/` should return zero hits.

If any other file still imports from session-runner (type re-exports, barrel files), update those imports to point to sdk-runner equivalents or remove them.

### Not this task

- Do not modify the meeting orchestrator or query-runner
- Do not modify sdk-runner.ts or event-translator.ts
- Do not modify daemon/app.ts (already updated in Task 003)

## Validation

1. `bun test` passes all tests (minus the 951 removed session-runner test lines). No regressions anywhere.
2. `bun run typecheck` clean. No references to `SessionRunner`, `SessionResult`, `SessionSpec`, or `SessionCallbacks` types remain in the codebase.
3. `grep -r "session-runner" daemon/ tests/` returns zero hits.
4. Commission orchestrator tests exercise: prep success, prep failure, EventBus lifecycle, resultSubmitted tracking, abort, error.

After this task, request fresh-eyes review of `daemon/app.ts` DI wiring via `lore-development:fresh-lore`. Feed findings into Tasks 005-007.

## Why

From `.lore/design/unified-sdk-runner.md`, What Gets Removed (session-runner.ts): Lists `SessionCallbacks`, `SessionEventTypes`, `SessionSpec`, `SessionResult`, `SessionRunner`, `SessionRunnerDeps`, `createSessionRunner()`, `eventMatchesContext()`, `DEFAULT_FOLLOW_UP_PROMPT`, EventBus subscription logic, follow-up session logic, and terminal state guard.

The design notes: "The terminal state guard was solving a real problem (abort vs completion race). In the unified model, the generator handles this naturally: AbortError during iteration yields { type: 'aborted' } and returns. The generator produces exactly one terminal state."

## Files

- `tests/daemon/services/commission/orchestrator.test.ts` (modify)
- `tests/daemon/services/session-runner.test.ts` (delete)
- `daemon/services/session-runner.ts` (delete)
