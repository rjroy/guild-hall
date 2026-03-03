---
title: Rewire commission orchestrator to use sdk-runner
date: 2026-03-03
status: complete
tags: [task]
source: .lore/plans/unified-sdk-runner.md
related: [.lore/design/unified-sdk-runner.md, .lore/specs/commission-layer-separation.md]
sequence: 3
modules: [commission-orchestrator, sdk-runner]
---

# Task: Rewire Commission Orchestrator to sdk-runner

## What

Replace the commission orchestrator's use of `SessionRunner` with `prepareSdkSession` + `drainSdkSession(runSdkSession(...))` + direct EventBus subscription. Update `daemon/app.ts` production wiring in the same deliverable.

Production wiring must be part of this task, not a separate one. DI factories tested with mocks need production wiring in the same deliverable, or the gap is invisible to tests (per worker-dispatch retro and coverage-di-factories retro).

### 1. Change `CommissionOrchestratorDeps`

In `daemon/services/commission/orchestrator.ts`:
- Remove `sessionRunner: SessionRunner`
- Add `prepDeps: SessionPrepDeps` (resolveToolSet, loadMemories, activateWorker, triggerCompaction)
- Add `queryFn` (the SDK query function, for passing to `runSdkSession`)

### 2. Update `daemon/app.ts`

- Remove the `createSessionRunner(...)` call and `sessionRunner` variable
- Construct a `SessionPrepDeps` object from the existing individual deps (resolveToolSet, loadMemories, activateWorkerFn)
- Wire `triggerCompaction` into the deps (fixes the commission compaction gap; commissions previously never triggered compaction). The meeting orchestrator already does this. Wire it the same way, with `queryFn` captured in the closure.
- Pass `prepDeps` and `queryFn` to the commission orchestrator instead of `sessionRunner`

### 3. Replace session-runner usage

Replace the current pattern in the orchestrator:
```
sessionRunner.run(spec) with callbacks
```

With:
```
1. prepareSdkSession(prepSpec, prepDeps) -> check ok
2. eventBus.subscribe(handler) for tool events
3. drainSdkSession(runSdkSession(queryFn, prompt, options)) -> outcome
4. eventBus.unsubscribe(handler)
5. Build result from outcome + local resultSubmitted flag
```

Concrete changes:

- **Remove `createSessionCallbacks`** (line ~457). The orchestrator handles tool events directly in its EventBus subscription.
- **EventBus subscription filters** by event type and commission ID. The current session-runner uses `SessionEventTypes` names (`"commission:result"`, `"commission:progress"`, `"commission:question"`) and filters by `contextIdField` (`"commissionId"`). The orchestrator replicates this filter inline: `event.type === "commission:result" && event.commissionId === commissionId`. Grep `SessionEventTypes` and `eventMatchesContext` in session-runner to see the current pattern before deleting it.
- **`resultSubmitted`** becomes a local variable set `true` in the EventBus handler when `commission:result` is received. Was in `SessionResult.resultSubmitted`.
- **Remove follow-up retry logic** entirely. No `DEFAULT_FOLLOW_UP_PROMPT`. Dead weight per brainstorm decision.
- **`handleSessionCompletion`** reads the local `resultSubmitted` flag instead of `result.resultSubmitted`. The existing logic (`if resultSubmitted -> success, else -> fail`) stays the same.
- **Build `SessionPrepSpec`** instead of `SessionSpec`. Map the commission's context into the spec's fields (contextId = commissionId, contextType = "commission", workspaceDir, workerName, packages, etc.).

The terminal state guard (`settle()` in session-runner) is no longer needed. The generator produces exactly one terminal state. `drainSdkSession` reports it. No race.

### Not this task

- Do not delete session-runner.ts yet (that's Task 004, after tests are updated)
- Do not modify the meeting orchestrator or query-runner
- Do not modify event-translator (already done in Task 002)

## Validation

1. `bun run typecheck` clean. `CommissionOrchestratorDeps` no longer references `SessionRunner`.
2. `daemon/app.ts` no longer calls `createSessionRunner`. The `SessionPrepDeps` and `queryFn` are passed directly.
3. Commission orchestrator compiles and existing commission tests pass (they may need mock adjustments; if so, make them here rather than deferring to Task 004).
4. Memory compaction is wired for commissions in app.ts (verify `triggerCompaction` is in `SessionPrepDeps`).

## Why

From `.lore/design/unified-sdk-runner.md`, Commission consumption pattern: "No callbacks in the runner. No follow-up retry. The orchestrator decides what to do with the outcome."

From `.lore/specs/commission-layer-separation.md`: Layer 4 (Session Runner) is replaced by the unified sdk-runner module. The layer boundary is preserved: the orchestrator (Layer 5) composes concerns, the session infrastructure (Layer 4) handles SDK interaction.

From `.lore/design/unified-sdk-runner.md`, Migration Path: "Commission first because it's the simpler consumer (drain, no streaming). If something breaks, the blast radius is smaller."

## Files

- `daemon/services/commission/orchestrator.ts` (modify)
- `daemon/app.ts` (modify)
- `tests/daemon/services/commission/orchestrator.test.ts` (modify, mock adjustments)
