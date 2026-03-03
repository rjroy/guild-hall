---
title: Implementation notes: unified-sdk-runner
date: 2026-03-03
status: complete
tags: [implementation, notes]
source: .lore/plans/unified-sdk-runner.md
modules: [sdk-runner, event-translator, commission-orchestrator, meeting-orchestrator]
related: [.lore/design/unified-sdk-runner.md, .lore/brainstorm/unified-sdk-runner.md]
---

# Implementation Notes: Unified SDK Runner

## Progress
- [x] Phase 1: Create sdk-runner module (Task 001)
- [x] Phase 2: Update event-translator boundary (Task 002)
- [x] Phase 3: Rewire commission orchestrator (Task 003)
- [x] Phase 4: Commission cleanup and session-runner deletion (Task 004)
- [x] Phase 5: Extract transcript utilities (Task 005)
- [x] Phase 6: Replace meeting prep with prepareSdkSession (Task 006)
- [x] Phase 7: Replace query-runner with inline loop (Task 007)
- [x] Phase 8: Delete query-runner (Task 008)
- [x] Phase 9: Validate against design (Task 009)

## Prior Work Findings

Key warnings from lore-researcher:
1. Wire `createProductionApp()` when DI seams change (in-process commissions retro)
2. Test event mapping boundary with external consumer IDs (SSE streaming bug fix retro)
3. Do not re-introduce text duplication in event-translator (double-data bug fix retro)
4. Memory compaction gap: commissions don't trigger it; shared prep fixes this
5. Terminal state guard replaced by generator semantics (single terminal event invariant)
6. Session expiry suppression in `sendMessage` must be replicated inline
7. Phased migration with per-phase test verification (meeting infrastructure convergence retro)

## Log

### Phase 1: Create sdk-runner module (Task 001)
- Dispatched: Create `daemon/services/sdk-runner.ts` with types, runSdkSession, drainSdkSession, prepareSdkSession, isSessionExpiryError. Tests in `tests/daemon/services/sdk-runner.test.ts`.
- Result: 288 lines, 35 tests, all 1738 existing tests pass, typecheck clean.
- Review: One finding. The `as SdkRunnerEvent` cast in runSdkSession lacked a comment explaining the temporary compatibility bridge. Fixed with explanatory comment.
- Resolution: Comment added. Tests confirmed passing.

### Phase 2: Update event-translator boundary (Task 002)
- Dispatched: Remove TranslatorContext, change translateSdkMessage to return SdkRunnerEvent[], add compatibility shim in query-runner, update tests, clean up sdk-runner.ts stub.
- Result: All 1738 tests pass, typecheck clean. TranslatorContext fully removed. Translator is now a pure function of SDK messages.
- Review: Code reviewer flagged circular `import type` between event-translator and sdk-runner (type-only, works via erasure, conceptual not functional). Type design analyzer scored SdkRunnerEvent 9/8/9/7 and translator interface 10/9/10/8. Recommended branding sessionId as SdkSessionId (future), noting activationExtras permissiveness (design-intentional), and suggesting GuildHallEvent.aborted variant (future).
- Resolution: All findings noted as design quality improvements for future work, not bugs. No changes needed.

### Phase 3: Rewire commission orchestrator (Task 003)
- Dispatched: Replace SessionRunner with sdk-runner in commission orchestrator. Update CommissionOrchestratorDeps, app.ts production wiring, and tests.
- Result: CommissionOrchestratorDeps now has prepDeps + queryFn. Follow-up retry removed. resultSubmitted tracked via EventBus. triggerCompaction wired for commissions (fixes compaction gap). 41 tests pass, 1738 total pass, typecheck clean.
- Review: Clean. EventBus sub/unsub correctly placed (subscribe before run, finally unsubscribe). Event filter matches correct types and commission ID. resultSubmitted tracking is more direct than the old callback chain. app.ts wiring complete. Pre-existing queryFn! assertion noted but not a regression.

### Phase 4: Commission cleanup (Task 004)
- Dispatched: Delete session-runner.ts (442 lines) and its tests (951 lines), verify clean removal.
- Result: Both files deleted. commission-toolbox.ts had SessionCallbacks dependency, inlined the type. 1706 tests pass, typecheck clean, zero references to session-runner remain.
- Fresh-eyes review of app.ts: QueryOptions vs SdkQueryOptions divergence noted (resolves when query-runner.ts deleted in Task 008). queryFn! pre-existing pattern. All other wiring verified correct.

### Phase 5: Extract transcript utilities (Task 005)
- Dispatched: Move truncateTranscript and appendAssistantTurnSafe from query-runner.ts to transcript.ts. Write tests.
- Result: Functions moved, 13 new tests added, 1719 total pass. query-runner.ts re-exports for backward compatibility.

### Phase 6: Replace meeting prep with prepareSdkSession (Task 006)
- Dispatched: Replace buildActivatedQueryOptions (~130 lines) with prepareSdkSession + inline prepDeps construction + buildMeetingPrepSpec helper.
- Result: Both call sites (startSession, sendMessage) use prepareSdkSession. loadMemories wrapped to preserve non-fatal memory failure behavior. triggerCompaction wrapped to bind compactFn. 1719 tests pass.

### Phase 7: Replace query-runner with inline loop (Task 007)
- Dispatched: Replace runQueryAndTranslate with inline runSdkSession loop. Extracted `iterateSession` helper. Updated meeting tests.
- Result: Both call sites use iterateSession. QueryOptions re-exported as alias of SdkQueryOptions for backward compatibility. 1719 tests pass.
- Review (silent-failure-hunter): Found three real issues:
  1. Empty sessionId guard lost during refactor (old code had `if (event.sessionId)` check)
  2. `lastError` "last wins" semantics could miss session expiry if followed by another error
  3. No tests for session expiry suppression and multi-error scenarios
- Resolution: All three fixed. Added guard for empty sessionId. Added `hasExpiryError` boolean tracking. Added 3 new tests (expiry suppression, multi-error renewal, empty sessionId). 1722 tests pass.

### Phase 8: Delete query-runner (Task 008)
- Dispatched: Remove query-runner.ts (210 lines), verify clean removal.
- Result: File deleted. Zero references remain in .ts files. 1722 tests pass, typecheck clean. No modifications needed to any other file.

### Phase 9: Validate against design (Task 009)
- Dispatched: Fresh-context design validation via lore-development:fresh-lore.
- Result: All 15 design checklist items PASS. All 5 end-to-end wiring items PASS. Typecheck clean, 1722 tests pass across 79 files. Design document status updated to `implemented`. Retro written at `.lore/retros/unified-sdk-runner.md`.

## Summary

Built and migrated the unified SDK runner in 9 phases. Net result:
- ~650 lines removed (session-runner.ts 442 + query-runner.ts ~210)
- 1 new module created (sdk-runner.ts, ~280 lines)
- 51 new tests added (35 sdk-runner + 13 transcript + 3 meeting edge cases)
- Memory compaction gap in commissions fixed
- Follow-up retry removed
- Event-translator made pure (no TranslatorContext)
- Five Concerns boundary clarified

## Divergence
(None. Implementation matched the design document.)
