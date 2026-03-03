---
title: Delete query-runner.ts and verify clean removal
date: 2026-03-03
status: complete
tags: [task]
source: .lore/plans/unified-sdk-runner.md
related: [.lore/design/unified-sdk-runner.md]
sequence: 8
modules: [query-runner]
---

# Task: Delete query-runner.ts

## What

Remove `daemon/services/query-runner.ts` and verify no references remain. The compatibility shim from Task 002 and all imports were already updated in prior tasks.

### 1. Delete `daemon/services/query-runner.ts`

Remove the file (268 lines). Types removed: `QueryRunOutcome`, `QueryRunnerMeeting`, `QueryOptions`, `PresetQueryPrompt`. Functions removed: `isSessionExpiryError` (moved to sdk-runner in Task 001), `truncateTranscript` and `appendAssistantTurnSafe` (moved to transcript.ts in Task 005), `iterateAndTranslate`, `runQueryAndTranslate`.

### 2. Verify clean removal

Run `grep -r "query-runner" daemon/ tests/` and confirm zero hits.

Check `daemon/app.ts` for residual query-runner imports. The meeting orchestrator wiring passes `queryFn` directly (not through query-runner), so app.ts changes should be limited to removing any residual imports.

### 3. Note on intentional type changes

`SdkQueryOptions` intentionally drops `additionalDirectories?: string[]` that was in the old `QueryOptions`. Neither consumer used it, and `permissionMode: "dontAsk"` is the standard path. This mirrors the design's note about `allowDangerouslySkipPermissions` being intentionally omitted.

### Not this task

- Do not modify any orchestrator code (already updated in prior tasks)
- Do not modify sdk-runner.ts or event-translator.ts

## Validation

1. `bun test` passes all tests. No regressions.
2. `bun run typecheck` clean.
3. `bun run lint` clean.
4. `grep -r "query-runner" daemon/ tests/` returns zero hits.
5. No references to `QueryRunOutcome`, `QueryRunnerMeeting`, `QueryOptions`, or `PresetQueryPrompt` remain.

## Why

From `.lore/design/unified-sdk-runner.md`, What Gets Removed (query-runner.ts): Lists all types and functions. "replaced by runSdkSession()", "replaced by SdkRunnerOutcome", "moved to sdk-runner.ts", "moved to meeting orchestrator or transcript utils."

From `.lore/design/unified-sdk-runner.md`, Module Layout: `query-runner.ts` is marked "REMOVED after meeting migration."

## Files

- `daemon/services/query-runner.ts` (delete)
- `daemon/app.ts` (modify if residual imports exist)
