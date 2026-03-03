---
title: Create sdk-runner module with types and functions
date: 2026-03-03
status: complete
tags: [task]
source: .lore/plans/unified-sdk-runner.md
related: [.lore/design/unified-sdk-runner.md]
sequence: 1
modules: [sdk-runner]
---

# Task: Create sdk-runner Module

## What

Create `daemon/services/sdk-runner.ts` with the unified SDK session types, the core iteration generator, the drain helper, the shared preparation function, and the session expiry detector. Write comprehensive tests.

### 1. Create `daemon/services/sdk-runner.ts`

Types from the design (`.lore/design/unified-sdk-runner.md`):

- `SdkRunnerEvent`: Context-free union type (session, text_delta, tool_use, tool_result, turn_end, error, aborted). No activity IDs. The `session` variant carries only `sessionId`. The `aborted` variant is new (commissions need to distinguish abort from error; meetings handle abort externally).
- `SdkQueryOptions`: SDK query parameters. Intentionally omits `allowDangerouslySkipPermissions` (neither consumer uses it) and `additionalDirectories` (unused).
- `SessionPrepSpec`: Input to shared preparation. Includes workerName, packages, config, guildHallHome, projectName, projectPath, workspaceDir, contextId, contextType ("commission" | "meeting"), eventBus (passed through to toolbox resolver, not used by runner), services, activationExtras, abortController, includePartialMessages, resume, resourceOverrides.
- `SessionPrepDeps`: Injected dependencies (resolveToolSet, loadMemories, activateWorker, triggerCompaction?, memoryLimit?).
- `SessionPrepResult`: Output from preparation (`{ options: SdkQueryOptions }`).
- `SdkRunnerOutcome`: Drain result (`{ sessionId: string | null, aborted: boolean, error?: string }`).

Functions:

- `runSdkSession(queryFn, prompt, options)`: Core async generator. Calls queryFn to get SDK generator, iterates SDK messages, calls `logSdkMessage` and `translateSdkMessage` for each, yields every `SdkRunnerEvent`. Catches `AbortError` (yields `{ type: "aborted" }`, returns). Catches other errors (yields `{ type: "error", reason }`, returns). Also handles `queryFn` throwing before iteration starts (same error handling). Always returns normally.
- `drainSdkSession(generator)`: Exhausts generator fully (does not exit early). Returns `SdkRunnerOutcome`. Captures `sessionId` from first `session` event, `aborted` from `aborted` events, `error` from first `error` event only.
- `prepareSdkSession(spec, deps)`: Shared 5-step setup. Returns discriminated union: `{ ok: true, result: SessionPrepResult }` or `{ ok: false, error: string }`. Steps: (1) find worker package by `spec.workerName` in `spec.packages`, (2) resolve tools via `deps.resolveToolSet(workerMeta, packages, context)`, (3) load memories via `deps.loadMemories` and fire `deps.triggerCompaction` if `needsCompaction` and dep exists, (4) activate worker via `deps.activateWorker(pkg, activationContext)` with `spec.activationExtras` spread, (5) build `SdkQueryOptions` from activation result + spec overrides (resource bounds, includePartialMessages, resume, abortController, model, cwd).
- `isSessionExpiryError(reason)`: Pattern matching on known SDK error strings. Moved from query-runner.ts.

Target: ~200 lines, under 300.

### 2. Write `tests/daemon/services/sdk-runner.test.ts`

Test `runSdkSession`:
- Normal iteration: mock queryFn yields SDK messages, assert correct SdkRunnerEvent sequence
- Abort handling: mock queryFn throws AbortError mid-iteration, assert `{ type: "aborted" }` yielded then generator done
- Error handling: mock queryFn throws generic error, assert `{ type: "error", reason }` yielded
- Pre-iteration error: queryFn throws before yielding any messages, assert error event yielded
- Multiple events per SDK message: event-translator returns multiple events, all are yielded

Test `drainSdkSession`:
- Captures sessionId from session events
- Reports `aborted: true` on abort events
- Captures first error only (second error ignored)
- Exhausts generator fully (assert all events consumed even after error/abort)
- Returns `{ sessionId: null, aborted: false }` for empty generator

Test `prepareSdkSession`:
- Happy path: all 5 steps succeed, returns `{ ok: true, result }` with correct SdkQueryOptions
- Worker not found: returns `{ ok: false, error }` with descriptive message
- Tool resolution fails: returns `{ ok: false, error }`
- Memory load fails: returns `{ ok: false, error }`
- Activation fails: returns `{ ok: false, error }`
- Memory compaction triggered when `needsCompaction` is true and `triggerCompaction` exists
- Memory compaction not triggered when `needsCompaction` is false
- Memory compaction not triggered when `triggerCompaction` is absent
- Resource overrides applied to options
- Resume passed through to options
- includePartialMessages passed through to options

Test `isSessionExpiryError`:
- Matches "session expired" pattern
- Matches "session not found" pattern
- Rejects unrelated error strings
- Case handling matches current query-runner behavior

All tests use dependency injection. No `mock.module()`.

### Not this task

- Do not modify event-translator.ts (that's Task 002)
- Do not modify query-runner.ts or session-runner.ts
- Do not modify any orchestrator or app.ts
- The event-translator still returns `GuildHallEvent[]` at this point. `sdk-runner.ts` must import `translateSdkMessage` with its current signature. If this creates a type mismatch with `SdkRunnerEvent`, handle via type assertion or mapping in `runSdkSession`. This gets resolved cleanly in Task 002 when event-translator is updated.

## Validation

1. `bun test tests/daemon/services/sdk-runner.test.ts` passes with all test cases green.
2. `bun test` passes all existing tests (1706+). The new module is additive, no existing code changes.
3. `bun run typecheck` clean. `SdkRunnerEvent` is a well-formed discriminated union. All exported types resolve.
4. `sdk-runner.ts` is under 300 lines.
5. `SdkRunnerEvent` has no activity IDs (no meetingId, no commissionId, no worker field).

## Why

From `.lore/design/unified-sdk-runner.md`, Decision: "Streaming generator as the universal interface, with shared session preparation." The module provides the shared infrastructure both consumers will use. `runSdkSession` replaces the iteration loops in both session-runner and query-runner. `prepareSdkSession` replaces the duplicated 5-step setup. `drainSdkSession` provides the fire-and-forget convenience commissions need.

## Files

- `daemon/services/sdk-runner.ts` (create)
- `tests/daemon/services/sdk-runner.test.ts` (create)
