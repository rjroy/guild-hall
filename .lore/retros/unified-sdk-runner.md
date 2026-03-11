---
title: Unified SDK runner: streaming generator as universal session interface
date: 2026-03-03
status: complete
tags: [refactor, agent-sdk, session-runner, architecture, dependency-injection, generator]
modules: [sdk-runner, event-translator, commission-orchestrator, meeting-orchestrator]
related:
  - .lore/design/unified-sdk-runner.md
  - .lore/plans/unified-sdk-runner.md
  - .lore/brainstorm/unified-sdk-runner.md
  - .lore/notes/unified-sdk-runner.md
---

# Retro: Unified SDK Runner

## Summary

Replaced two divergent SDK wrapper modules (`session-runner.ts` for commissions, `query-runner.ts` for meetings) with a single unified abstraction in `sdk-runner.ts`. The core insight: an async generator is strictly more general than fire-and-forget. Commissions drain the generator; meetings yield it. One iteration loop, two consumption patterns.

The migration proceeded in 9 phases over a single day:
1. Create sdk-runner module (types, runSdkSession, drainSdkSession, prepareSdkSession, isSessionExpiryError)
2. Update event-translator boundary (remove TranslatorContext, produce SdkRunnerEvent)
3. Rewire commission orchestrator to use sdk-runner
4. Delete session-runner.ts and its tests (442 lines + 951 lines of tests)
5. Extract transcript utilities (appendAssistantTurnSafe, truncateTranscript) to transcript.ts
6. Replace meeting prep with prepareSdkSession
7. Replace query-runner with inline loop in meeting orchestrator
8. Delete query-runner.ts
9. Validate against design (this task)

Net result: ~650 lines removed, memory compaction gap in commissions fixed, follow-up retry removed, event-translator made pure, five-concerns boundary clarified.

## What Went Well

**The async generator unification held up.** The design prediction that "commission drains, meeting yields" would work cleanly was correct. The two consumption patterns (drainSdkSession vs. iterateSession) are clearly distinct and neither leaks into the other.

**Phased migration worked.** Per-phase typecheck + test verification caught regressions immediately. The blast radius of any phase's changes was bounded. Phase 7 caught a real bug (empty sessionId guard lost during refactor) that would have been harder to trace after a big-bang migration.

**Fresh-eyes review at each phase caught real issues.** Phase 7's silent-failure-hunter review found three bugs:
  - Empty sessionId guard lost during refactor
  - `lastError` "last wins" semantics could miss session expiry if followed by another error
  - No tests for session expiry suppression and multi-error scenarios

All three were fixed before the next phase. The reviewers didn't just rubber-stamp.

**The Five Concerns boundary held.** sdk-runner.ts has zero imports from git, workspace, artifacts, or activity-type-specific modules. The boundary is cleaner after this refactor than before.

**TranslatorContext removal was clean.** Making translateSdkMessage a pure function (SDK message in, SdkRunnerEvent[] out) eliminated a design smell that had coupled the translator to meeting-specific concepts.

**Memory compaction gap fixed.** Commissions were silently not triggering memory compaction before this work. The fix landed as part of the shared prepareSdkSession infrastructure, not as a separate patch.

## What Could Improve

**Implementation notes as task log.** The notes file tracked progress well, but resolution was sometimes summarized ("fixed") without recording the specific change made. When a review finds a bug and it gets fixed, the notes should say what the fix was, not just that it was fixed.

**Review finding classification.** Phase 2's review found "circular import type" between event-translator and sdk-runner. The finding was correct (type-only import, works via erasure) but the resolution ("design quality improvement, not a bug") could have been a one-liner comment in the notes. Instead it took several sentences. A tighter format for "noted but not actioned" findings would help.

**queryFn! non-null assertion.** The production wiring uses `queryFn!` in two places in app.ts (commission orchestrator, compaction closure). This was pre-existing before this work but the refactor touched both spots. The right fix is to guard at app startup rather than assert at callsite. Low priority, but it's a known rough edge now that the wiring is consolidated.

## Lessons Learned

- **Phased migration with per-phase test verification is the only safe way to do a large refactor.** No phase touched more code than could be verified against existing tests. Phase 7 found a real regression that would have been untraceable in a big-bang migration.

- **Fresh-eyes review after each phase is worth the overhead.** The silent-failure-hunter found three bugs in Phase 7 that the implementation agent missed. These were production bugs (empty sessionId guard, session expiry tracking, missing test coverage), not style findings. The review step should not be skipped to save time.

- **The async generator as universal interface.** When two modules both iterate an SDK generator but consume results differently (fire-and-forget vs. streaming), an async generator return type unifies them. The consumer decides whether to drain or yield. The generator itself only decides when to stop.

- **Backward-compatibility re-exports as migration scaffolding.** QueryOptions re-exported as an alias of SdkQueryOptions from meeting/orchestrator kept downstream consumers from breaking mid-migration. The alias is clearly marked for removal. This pattern is appropriate for large refactors where touching all consumers in one phase is risky.

- **TranslatorContext is a code smell.** Any translator that requires caller-supplied context to stamp onto its output is not a translator - it is a domain mapper. The right split: translator is a pure function of the SDK message; caller adds domain IDs when mapping to domain events.

- **Compaction gaps are silent.** The commission path was missing memory compaction for an unknown period. No error, no warning, just silently using stale memories. Shared infrastructure (prepareSdkSession) is the right place to enforce "this always happens", not in each orchestrator independently.

## Artifacts

- `.lore/design/unified-sdk-runner.md` - Approved design (status updated to `implemented`)
- `.lore/plans/unified-sdk-runner.md` - Implementation plan
- `.lore/brainstorm/unified-sdk-runner.md` - Design exploration
- `.lore/notes/unified-sdk-runner.md` - Phase-by-phase implementation log
- `daemon/services/sdk-runner.ts` - New unified module (~280 lines)
- `daemon/services/event-translator.ts` - Modified: SdkRunnerEvent output, no TranslatorContext
- `daemon/services/commission/orchestrator.ts` - Rewired to sdk-runner
- `daemon/services/meeting/orchestrator.ts` - Rewired to sdk-runner with inline session loop
- `daemon/services/transcript.ts` - Gained appendAssistantTurnSafe, truncateTranscript
- `daemon/app.ts` - Production wiring updated
