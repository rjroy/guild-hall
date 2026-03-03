---
title: Unified SDK runner implementation
date: 2026-03-03
status: draft
tags: [sdk, refactor, session-runner, query-runner, migration]
modules: [sdk-runner, event-translator, commission-orchestrator, meeting-orchestrator]
related: [.lore/design/unified-sdk-runner.md, .lore/brainstorm/unified-sdk-runner.md, .lore/specs/commission-layer-separation.md, .lore/specs/meeting-infrastructure-convergence.md]
---

# Plan: Unified SDK Runner

## Design Reference

**Design**: `.lore/design/unified-sdk-runner.md` (approved)
**Brainstorm**: `.lore/brainstorm/unified-sdk-runner.md` (resolved)

Key decisions from design:
- Streaming generator as universal interface
- Context-free `SdkRunnerEvent` (no activity IDs)
- Shared `prepareSdkSession` for the 5-step setup
- Commission drains generator; meeting yields it
- Migration order: commission first (simpler consumer, smaller blast radius)

## Codebase Context

**Current infrastructure:**
- `daemon/services/session-runner.ts` (442 lines): Factory-based `createSessionRunner`, fire-and-forget, EventBus callback relay, follow-up retry, terminal state guard. Commission-only.
- `daemon/services/query-runner.ts` (268 lines): Stateless functions, async generator yielding `GuildHallEvent`, transcript accumulation, session expiry detection. Meeting-only.
- `daemon/services/event-translator.ts` (267 lines): `translateSdkMessage(message, context: TranslatorContext)` returns `GuildHallEvent[]`. Only consumer today is `query-runner.ts`.
- `daemon/services/sdk-logging.ts` (70 lines): `logSdkMessage()`. Unchanged by this work.

**Consumers:**
- `daemon/services/commission/orchestrator.ts` (1628 lines): Receives `SessionRunner` in deps, builds `SessionSpec` with callbacks, calls `sessionRunner.run(spec)`. Callbacks relay EventBus tool events (result, progress, question) to lifecycle methods.
- `daemon/services/meeting/orchestrator.ts` (1401 lines): Imports `resolveToolSet`, `loadMemories`, `activateWorker` directly. Has inline `buildActivatedQueryOptions` (line 337) doing the same 5-step prep as session-runner. Calls `runQueryAndTranslate` which yields `GuildHallEvent` via `yield*`.

**Production wiring:**
- `daemon/app.ts` (315 lines): Creates `sessionRunner` with bundled deps (resolveToolSet, loadMemories, activateWorker, queryFn, eventBus). Passes `sessionRunner` to commission orchestrator, `queryFn` directly to meeting orchestrator.

**Tests:**
- `tests/daemon/services/session-runner.test.ts` (951 lines): Removed in Phase 2.
- `tests/daemon/event-translator.test.ts` (742 lines): Updated in Phase 1.
- `tests/daemon/meeting-session.test.ts` (3180 lines): Updated in Phase 3.

**Retro warnings (from prior migrations):**
- Wire `createProductionApp()` when DI seams change (coverage-di-factories retro)
- Test ID mapping boundaries carefully (SSE streaming bug fix retro)
- Phased migration with per-phase test verification (meeting infrastructure convergence retro)
- Fresh-eyes review for wiring gaps (in-process commissions retro)

## Implementation Steps

Three phases, each independently verifiable. All existing tests must pass at the end of each phase.

---

### Phase 1: Build the Foundation

Create the new module and update the event translator. After this phase, `sdk-runner.ts` exists with full test coverage, event-translator returns `SdkRunnerEvent`, and both existing consumers still work via a small compatibility patch.

#### Step 1: Create `sdk-runner.ts`

**Files**: `daemon/services/sdk-runner.ts` (new)

Types (from design): `SdkRunnerEvent`, `SdkQueryOptions`, `SessionPrepSpec`, `SessionPrepDeps`, `SessionPrepResult`, `SdkRunnerOutcome`.

Functions:
- `runSdkSession(queryFn, prompt, options)`: Core async generator. Calls queryFn, iterates SDK messages, calls `logSdkMessage` and `translateSdkMessage` for each, yields `SdkRunnerEvent`. Catches `AbortError` (yields `aborted`), catches other errors (yields `error`).
- `drainSdkSession(generator)`: Exhausts generator, returns `SdkRunnerOutcome` (sessionId, aborted, error). Captures first error, does not exit early.
- `prepareSdkSession(spec, deps)`: Shared 5-step setup. Returns `{ ok: true, result }` or `{ ok: false, error }`. Steps: find worker package, resolve tools, load memories (trigger compaction if needed), activate worker, build SDK options.
- `isSessionExpiryError(reason)`: Moved from query-runner. Pattern matching on error strings.

Design target: ~200 lines. The file stays under 300.

`prepareSdkSession` is a pure function (no closures, no side effects beyond calling injected deps). Orchestrators import it directly. The `SessionPrepDeps` object is constructed by the caller from its own dependency bag.

#### Step 2: Modify `event-translator.ts`

**Files**: `daemon/services/event-translator.ts`

Changes:
- Remove `TranslatorContext` type
- Change `translateSdkMessage(message: SDKMessage): SdkRunnerEvent[]` (drop context parameter)
- `session` event returns only `{ type: "session", sessionId }` (no meetingId, no worker)
- Import/export `SdkRunnerEvent` from sdk-runner (or define it there and import here)

This is a small change: one function signature, one event variant.

#### Step 3: Patch `query-runner.ts` for compatibility

**Files**: `daemon/services/query-runner.ts`

`iterateAndTranslate` calls `translateSdkMessage` and yields the results as `GuildHallEvent`. After step 2, `translateSdkMessage` returns `SdkRunnerEvent[]` where the `session` event lacks `meetingId` and `worker`. Patch `iterateAndTranslate` to map the `session` event:

```typescript
for (const event of translateSdkMessage(msg)) {
  if (event.type === "session") {
    yield { ...event, meetingId: meeting.meetingId, worker: meeting.workerName };
  } else {
    yield event as GuildHallEvent;
  }
}
```

This is a temporary shim removed when query-runner is deleted in Phase 3.

#### Step 4: Update event-translator tests

**Files**: `tests/daemon/event-translator.test.ts`

Update assertions to expect `SdkRunnerEvent` instead of `GuildHallEvent`:
- `session` events: assert `{ type: "session", sessionId }` only (no meetingId, no worker)
- All other event types: assertions unchanged (types are identical)
- Remove any `TranslatorContext` setup from test fixtures

#### Step 5: Write sdk-runner tests

**Files**: `tests/daemon/services/sdk-runner.test.ts` (new)

Test `runSdkSession`:
- Normal iteration: mock queryFn yields SDK messages, assert correct `SdkRunnerEvent` sequence
- Abort handling: mock queryFn throws `AbortError`, assert `{ type: "aborted" }` yielded
- Error handling: mock queryFn throws generic error, assert `{ type: "error", reason }` yielded
- Pre-iteration error: queryFn throws before yielding, assert error event
- Multiple events per SDK message: event-translator can return multiple events

Test `drainSdkSession`:
- Captures sessionId from session events
- Reports aborted: true on abort events
- Captures first error only
- Exhausts generator fully (does not exit early on error/abort)

Test `prepareSdkSession`:
- Happy path: all 5 steps succeed, returns `{ ok: true, result }` with correct options
- Failure at each step: worker not found, tool resolution fails, memory load fails, activation fails
- Memory compaction: triggers when `needsCompaction` is true and `triggerCompaction` exists
- Resource overrides applied to options
- Resume and includePartialMessages passed through

Test `isSessionExpiryError`:
- Matches known patterns ("session expired", "session not found", etc.)
- Rejects non-matching strings

All tests use dependency injection (mock queryFn, mock prep deps). No `mock.module()`.

#### Phase 1 Verification

Run full test suite. All 1706+ tests pass. Typecheck clean. New sdk-runner tests pass. Event-translator tests pass with updated assertions. Query-runner compatibility shim keeps meeting tests green.

---

### Phase 2: Commission Migration

Replace session-runner with sdk-runner in the commission orchestrator. After this phase, session-runner.ts is deleted.

#### Step 6: Rewire commission orchestrator deps

**Files**: `daemon/services/commission/orchestrator.ts`, `daemon/app.ts`

Changes to `CommissionOrchestratorDeps`:
- Remove `sessionRunner: SessionRunner`
- Add `prepDeps: SessionPrepDeps` (resolveToolSet, loadMemories, activateWorker, triggerCompaction)
- Add `queryFn` (the SDK query function, for passing to `runSdkSession`)

Update `daemon/app.ts` to construct `SessionPrepDeps` and pass it (plus `queryFn`) to the commission orchestrator instead of the bundled `sessionRunner`.

#### Step 7: Replace session-runner usage in commission orchestrator

**Files**: `daemon/services/commission/orchestrator.ts`

Replace the current pattern:
```
sessionRunner.run(spec) with callbacks
```

With:
```
1. prepareSdkSession(prepSpec, prepDeps)
2. eventBus.subscribe(handler) for tool events (result, progress, question)
3. drainSdkSession(runSdkSession(queryFn, prompt, options))
4. eventBus.unsubscribe(handler)
5. Build result from outcome + local state
```

Concrete changes:
- Remove `createSessionCallbacks` function (line 457). The orchestrator handles tool events directly in its EventBus subscription.
- EventBus subscription filters by event type and commission ID. The current session-runner uses `SessionEventTypes` names (`"commission:result"`, `"commission:progress"`, `"commission:question"`) and filters by `contextIdField` (`"commissionId"`). The orchestrator replicates this filter inline: `event.type === "commission:result" && event.commissionId === commissionId`. Grep `SessionEventTypes` and `eventMatchesContext` in session-runner to see the current pattern.
- `resultSubmitted` becomes a local variable set in the EventBus handler (was in `SessionResult`).
- Remove follow-up retry logic (dead weight per brainstorm decision).
- `handleSessionCompletion` reads the local `resultSubmitted` flag instead of `result.resultSubmitted`.
- The `SessionSpec` type is no longer used. Build `SessionPrepSpec` instead.

The terminal state guard (`settle()` in session-runner) is no longer needed. The generator produces exactly one terminal state. `drainSdkSession` reports it. No race.

#### Step 8: Update commission tests

**Files**: `tests/daemon/services/session-runner.test.ts` (removed), `tests/daemon/services/commission/orchestrator.test.ts`

Remove `session-runner.test.ts` entirely (951 lines).

Update `tests/daemon/services/commission/orchestrator.test.ts` to:
- Replace `sessionRunner` mock with `prepDeps` and `queryFn` mocks in the deps factory
- Remove imports of `SessionRunner`, `SessionResult`, `SessionSpec` from session-runner
- Verify EventBus subscription happens before session starts
- Verify EventBus unsubscription happens after session completes
- Verify `resultSubmitted` tracking via EventBus events
- Verify abort handling (generator yields `aborted`, drain reports it)
- Verify error handling (generator yields `error`, drain reports it)
- No follow-up retry tests (feature removed)

#### Step 9: Remove session-runner.ts

**Files**: `daemon/services/session-runner.ts` (deleted)

Remove the file. Remove imports from any remaining consumers (should be none after step 7). Remove the `SessionRunner` type export if it was re-exported anywhere.

#### Phase 2 Verification

Run full test suite. All tests pass (minus the removed session-runner tests). Typecheck clean. Commission flow works end-to-end with the new wiring.

**Expertise**: Fresh-eyes review of app.ts wiring. DI seam changes are where wiring bugs hide (per coverage-di-factories retro).

---

### Phase 3: Meeting Migration

Replace query-runner with sdk-runner in the meeting orchestrator. After this phase, query-runner.ts is deleted.

#### Step 10: Move transcript utilities to existing `transcript.ts`

**Files**: `daemon/services/transcript.ts` (existing), `daemon/services/query-runner.ts`

`daemon/services/transcript.ts` already handles transcript read/write for meetings. Move from `query-runner.ts` into it:
- `truncateTranscript(transcript, maxChars)`: Preserves turn boundaries when truncating.
- `appendAssistantTurnSafe(meetingId, textParts, toolUses, ghHome)`: Appends turn to transcript file, swallows errors.

These are transcript operations that belong with the existing transcript module. No new file needed.

Add tests for the moved functions in `tests/daemon/services/transcript.test.ts` (create if it doesn't exist, or add to existing).

#### Step 11: Rewire meeting orchestrator for prepareSdkSession

**Files**: `daemon/services/meeting/orchestrator.ts`

Replace `buildActivatedQueryOptions` (line 337) with a call to `prepareSdkSession`. The meeting orchestrator currently imports `resolveToolSet`, `loadMemories`, and `activateWorker` directly. Two options:

**Option A (minimal change):** Construct `SessionPrepDeps` inline from the existing imports. The meeting orchestrator already has these functions available. This avoids changing the meeting orchestrator's external DI surface.

**Option B (full DI):** Add `prepDeps: SessionPrepDeps` to the meeting orchestrator's dependency injection, remove the direct imports. More testable but a larger change.

Recommendation: Option A for this migration. The meeting orchestrator's DI is already complex, and we can clean it up in a separate pass. The important thing is that `prepareSdkSession` is the single code path for both consumers.

Remove `buildActivatedQueryOptions` and its ~100 lines of inline setup.

#### Step 12: Replace query-runner usage with inline loop

**Files**: `daemon/services/meeting/orchestrator.ts`

Two call sites use `runQueryAndTranslate` today:
- `startSession` (line ~488): Primary session, no resume
- `sendMessage` (line ~887): Resume path, passes `resumeSessionId`

Both are replaced with the same inline loop pattern. The `sendMessage` path constructs `SessionPrepSpec` with `resume: meeting.sdkSessionId` to thread the resume parameter through `prepareSdkSession`.

Replace:
```typescript
const outcome = yield* runQueryAndTranslate(queryFn, meeting, prompt, options, ghHome);
```

With the inline loop from the design document:
```typescript
for await (const event of runSdkSession(queryFn, prompt, options)) {
  // Capture session ID
  // Accumulate transcript (text_delta, tool_use, tool_result)
  // Track errors for post-loop session expiry detection
  // Map SdkRunnerEvent to GuildHallEvent and yield (see suppression note below)
}
await appendAssistantTurnSafe(meetingId, textParts, toolUses, ghHome);
```

This is ~25 lines replacing the `yield*` delegation per call site. The meeting orchestrator now owns transcript accumulation and event mapping inline.

**Transcript accumulation: single post-loop call.** The current `iterateAndTranslate` calls `appendAssistantTurnSafe` in three places (normal exit, AbortError catch, generic error catch). In the unified model, `runSdkSession` always returns normally: it catches AbortError internally and yields `{ type: "aborted" }`, catches other errors and yields `{ type: "error" }`, then returns. A single `appendAssistantTurnSafe` after the loop handles all cases. This is a deliberate simplification, not an oversight.

**Session expiry suppression.** The current `sendMessage` passes `suppressSessionExpiryError = true` to prevent session expiry errors from reaching the browser during renewal (avoids a visible error flash before the renewal events arrive). In the inline loop, replicate this: when the loop is inside `sendMessage`'s renewal-eligible path, do not yield error events where `isSessionExpiryError(event.reason)` is true. Track the error for post-loop renewal detection but withhold it from SSE. In `startSession` (where renewal is not applicable), yield all errors normally.

Concretely: extract a helper or use a flag (`suppressExpiryErrors: boolean`) passed to the loop to control this behavior. The helper keeps both call sites clean.

Session expiry detection after the loop:
```typescript
if (lastError && isSessionExpiryError(lastError)) { /* trigger renewal */ }
```

The `aborted` event maps to `{ type: "error", reason: "Turn interrupted" }` for SSE compatibility (preserving current browser behavior).

#### Step 13: Update meeting tests

**Files**: `tests/daemon/meeting-session.test.ts` (3180 lines), `tests/daemon/services/meeting/orchestrator.test.ts` (887 lines)

Both files need updates. The orchestrator test file imports `QueryOptions` from the meeting orchestrator, which is replaced by `SdkQueryOptions` from sdk-runner.

Update tests to:
- Mock `prepareSdkSession` behavior (or mock its deps if using Option A)
- Expect `runSdkSession` generator pattern instead of `runQueryAndTranslate`
- Verify transcript accumulation happens in the orchestrator loop
- Verify `SdkRunnerEvent` to `GuildHallEvent` mapping (session event gets meetingId and worker)
- Verify session expiry detection post-loop
- Verify session expiry suppression in `sendMessage` path (error not yielded during renewal)
- Verify `aborted` maps to "Turn interrupted" error for SSE

Remove any tests that specifically tested query-runner internals via the meeting orchestrator.

#### Step 14: Remove query-runner.ts

**Files**: `daemon/services/query-runner.ts` (deleted)

Remove `query-runner.ts`. The compatibility shim from Step 3 goes away naturally. Types removed: `QueryRunOutcome`, `QueryRunnerMeeting`, `QueryOptions`, `PresetQueryPrompt`. `isSessionExpiryError` now imported from `sdk-runner.ts`.

Verify no remaining imports with: `grep -r "query-runner" daemon/ tests/` (expect zero hits after this step).

Note: `SdkQueryOptions` intentionally drops `additionalDirectories?: string[]` that was in the old `QueryOptions`. Neither consumer used it, and `permissionMode: "dontAsk"` is the standard path. This mirrors the design's note about `allowDangerouslySkipPermissions` being intentionally omitted.

Update `daemon/app.ts`: the meeting orchestrator wiring currently passes `queryFn` directly (not through query-runner), so app.ts changes are limited to removing any residual query-runner imports.

#### Phase 3 Verification

Run full test suite. All tests pass (minus the removed query-runner tests, plus new transcript-utils tests). Typecheck clean. Lint clean. Meeting flow works end-to-end.

**Expertise**: Fresh-eyes review of the event mapping boundary (SdkRunnerEvent to GuildHallEvent). The SSE streaming bug fix retro warns that ID namespace confusion at this boundary caused a prior bug.

---

### Step 15: Validate Against Design

Launch a sub-agent that reads the design at `.lore/design/unified-sdk-runner.md`, reviews the implementation, and flags any requirements not met. This step is not optional.

Checklist from design:
- [ ] `SdkRunnerEvent` is context-free (no activity IDs)
- [ ] `runSdkSession` returns `AsyncGenerator<SdkRunnerEvent>`
- [ ] `drainSdkSession` returns `Promise<SdkRunnerOutcome>`
- [ ] `prepareSdkSession` handles all 5 steps with proper error returns
- [ ] Commission orchestrator subscribes to EventBus directly
- [ ] Meeting orchestrator streams via inline loop with transcript accumulation
- [ ] Memory compaction added to commission path (was missing)
- [ ] Follow-up retry removed from commissions
- [ ] `TranslatorContext` removed from event-translator
- [ ] `session-runner.ts` deleted
- [ ] `query-runner.ts` deleted
- [ ] Five Concerns boundary preserved (session concern knows nothing about activity types)

## Delegation Guide

Steps requiring specialized review:

| Step | Expertise | Agent |
|------|-----------|-------|
| Phase 1 complete | Type design review for SdkRunnerEvent and prep types | `pr-review-toolkit:type-design-analyzer` |
| Phase 2, step 8 | Fresh-eyes review of app.ts DI wiring | `lore-development:fresh-lore` |
| Phase 3, step 13 | Review event mapping boundary (SdkRunnerEvent to GuildHallEvent) | `pr-review-toolkit:silent-failure-hunter` |
| Step 15 | Design validation | `lore-development:fresh-lore` |

## Open Questions

1. **Meeting orchestrator DI cleanup.** Step 11 uses Option A (construct prepDeps from existing imports) to minimize blast radius. A follow-up could move to full DI injection. Low priority, doesn't block this work.

2. **`GuildHallEvent` naming.** After migration, `GuildHallEvent` is only used for the SSE boundary (daemon to browser). The `session` variant keeps `meetingId` and `worker`. The design asks whether to rename it to "meeting event." Low priority, cosmetic.

3. **Session expiry suppression pattern.** Step 12 specifies replicating `suppressSessionExpiryError` behavior inline. An alternative is to push this into the generator itself (make `runSdkSession` accept a filter). That would mean the runner knows about session expiry, which violates the design's "runner doesn't know about resume policy" principle. The inline approach is correct per the design, but the implementer should note this trade-off.
