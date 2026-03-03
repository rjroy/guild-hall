---
title: Validate implementation against design and run end-to-end
date: 2026-03-03
status: complete
tags: [task]
source: .lore/plans/unified-sdk-runner.md
related: [.lore/design/unified-sdk-runner.md]
sequence: 9
modules: [sdk-runner, event-translator, commission-orchestrator, meeting-orchestrator]
---

# Task: Validate Against Design

## What

Launch a fresh-context sub-agent to validate the implementation against the approved design. Then verify end-to-end behavior, not just unit tests.

### 1. Design validation sub-agent

Invoke `lore-development:fresh-lore` to read the design at `.lore/design/unified-sdk-runner.md` and review the implementation. The agent should verify every item in this checklist:

- [ ] `SdkRunnerEvent` is context-free (no activity IDs)
- [ ] `runSdkSession` returns `AsyncGenerator<SdkRunnerEvent>`
- [ ] `drainSdkSession` returns `Promise<SdkRunnerOutcome>`
- [ ] `prepareSdkSession` handles all 5 steps with proper `{ ok, error }` returns
- [ ] `isSessionExpiryError` lives in sdk-runner.ts
- [ ] Commission orchestrator subscribes to EventBus directly (no callback relay)
- [ ] Meeting orchestrator streams via inline loop with transcript accumulation
- [ ] Memory compaction added to commission path (was missing before this work)
- [ ] Follow-up retry removed from commissions
- [ ] `TranslatorContext` removed from event-translator
- [ ] `session-runner.ts` deleted
- [ ] `query-runner.ts` deleted
- [ ] Five Concerns boundary preserved (session concern knows nothing about activity types)
- [ ] `daemon/app.ts` wiring is complete (no dangling deps, no stale imports)
- [ ] Event mapping boundary: SdkRunnerEvent session event -> GuildHallEvent with meetingId/worker (no ID confusion)

### 2. End-to-end verification

Unit tests validate capability, not assembly (per Phase 4 commissions retro: "1032 tests passed and 33/33 spec requirements validated, but the system didn't work end-to-end").

Verify that the production wiring actually connects:
- `daemon/app.ts` constructs `SessionPrepDeps` with real implementations (not undefined or null)
- `queryFn` is wired to the commission orchestrator (was previously bundled inside sessionRunner)
- `triggerCompaction` is wired for commissions (new, verify the closure captures queryFn correctly)
- Meeting orchestrator's inline `SessionPrepDeps` construction uses the real imports
- `runSdkSession` is called with the output of `prepareSdkSession`, not with stale option shapes

If the codebase supports integration tests that exercise a commission or meeting session flow, run them. If not, trace the wiring manually through app.ts to confirm all deps resolve.

### 3. Update design document status

Change `.lore/design/unified-sdk-runner.md` frontmatter status from `approved` to `implemented`.

### Not this task

- Do not write new code or fix bugs (if issues are found, file them or note them for a follow-up)
- Do not modify the plan status (the user does this)

## Validation

1. Fresh-context agent completes all checklist items with pass/fail.
2. No checklist items fail. If any fail, document what's wrong and which task should have caught it.
3. `bun test` passes all tests.
4. `bun run typecheck` clean.
5. `bun run lint` clean.
6. End-to-end wiring verified (either via integration test or manual trace).

## Why

From `.lore/plans/unified-sdk-runner.md`, Step 15: "Launch a sub-agent that reads the design, reviews the implementation, and flags any requirements not met. This step is not optional."

From `.lore/retros/phase-4-commissions.md`: "Spec validation catches capability, not assembly. Runtime testing is the only thing that catches 'never actually connected.'"

From `.lore/retros/in-process-commissions.md`: "Fresh-eyes review catches DI wiring gaps the implementer misses."

## Files

- `.lore/design/unified-sdk-runner.md` (modify, status update)
