---
title: Replace runQueryAndTranslate with inline runSdkSession loop
date: 2026-03-03
status: complete
tags: [task]
source: .lore/plans/unified-sdk-runner.md
related: [.lore/design/unified-sdk-runner.md, .lore/specs/meeting-infrastructure-convergence.md]
sequence: 7
modules: [meeting-orchestrator, sdk-runner]
---

# Task: Replace query-runner Usage with Inline Loop

## What

Replace `runQueryAndTranslate` calls in the meeting orchestrator with inline `for await` loops over `runSdkSession`. Update both meeting test files. This is the meeting-side equivalent of Task 003's commission rewiring.

### 1. Replace both call sites

Two call sites use `runQueryAndTranslate` today:
- `startSession` (line ~488): Primary session, no resume
- `sendMessage` (line ~887): Resume path, uses resumeSessionId

Both are replaced with the same inline loop pattern:

```typescript
const textParts: string[] = [];
const toolUses: ToolUseEntry[] = [];
let sessionId: string | null = null;
let pendingToolName: string | null = null;
let lastError: string | null = null;

for await (const event of runSdkSession(deps.queryFn, prompt, prep.result.options)) {
  if (event.type === "session") {
    sessionId = event.sessionId;
    meeting.sdkSessionId = asSdkSessionId(sessionId);
  }
  if (event.type === "text_delta") textParts.push(event.text);
  if (event.type === "tool_use") pendingToolName = event.name;
  if (event.type === "tool_result") {
    toolUses.push({ toolName: pendingToolName ?? event.name, result: event.output });
    pendingToolName = null;
  }
  if (event.type === "error") lastError = event.reason;

  // Map to GuildHallEvent and yield (see suppression note below)
  if (event.type === "session") {
    yield { type: "session", meetingId: meeting.meetingId, sessionId: event.sessionId, worker: meeting.workerName };
  } else if (event.type === "aborted") {
    yield { type: "error", reason: "Turn interrupted" };
  } else {
    // text_delta, tool_use, tool_result, turn_end, error pass through
    // (with session expiry suppression in sendMessage path)
  }
}

await appendAssistantTurnSafe(meeting.meetingId, textParts, toolUses, ghHome);
```

**Transcript accumulation: single post-loop call.** The current `iterateAndTranslate` calls `appendAssistantTurnSafe` in three places (normal exit, AbortError catch, generic error catch). In the unified model, `runSdkSession` always returns normally (catches AbortError/errors internally, yields events, then returns). A single `appendAssistantTurnSafe` after the loop handles all cases including abort and error. This is a deliberate simplification.

**Session expiry suppression.** The current `sendMessage` passes `suppressSessionExpiryError = true` to prevent session expiry errors from reaching the browser during renewal. In the inline loop, replicate this:

- In `sendMessage`'s loop: do not yield error events where `isSessionExpiryError(event.reason)` is true. Track the error in `lastError` for post-loop renewal detection but withhold it from SSE.
- In `startSession`'s loop: yield all errors normally (no renewal).

Extract a helper or use a flag (`suppressExpiryErrors: boolean`) passed to the loop to keep both call sites clean.

**Session expiry detection** after the loop:
```typescript
if (lastError && isSessionExpiryError(lastError)) {
  // trigger session renewal (existing logic)
}
```

**`aborted` maps to "Turn interrupted"** error for SSE compatibility, preserving current browser behavior.

### 2. Update imports

- Import `runSdkSession`, `isSessionExpiryError`, `type SdkRunnerEvent` from `@/daemon/services/sdk-runner`
- Import `appendAssistantTurnSafe` from `@/daemon/services/transcript` (moved in Task 005)
- Remove imports from `query-runner` (`runQueryAndTranslate`, `iterateAndTranslate`, `type TranslatorContext`, `type QueryRunOutcome`)

### 3. Remove dead code

After replacing both call sites:
- Remove `iterateAndTranslate` import (no longer used)
- Remove `TranslatorContext` import (no longer used)
- Remove `QueryRunOutcome` type usage (replaced by inline lastError + isSessionExpiryError check)
- Remove `runQueryAndTranslate` import

### 4. Update meeting tests

**Files**: `tests/daemon/meeting-session.test.ts` (3180 lines), `tests/daemon/services/meeting/orchestrator.test.ts` (887 lines)

Both files need updates. The orchestrator test file imports `QueryOptions` from the meeting orchestrator, which is replaced by `SdkQueryOptions` from sdk-runner.

Update tests to:
- Mock the `runSdkSession` generator pattern (yield SdkRunnerEvent sequence) instead of `runQueryAndTranslate`
- Verify transcript accumulation happens in the orchestrator loop (text_delta -> textParts, tool_use/tool_result -> toolUses)
- Verify `SdkRunnerEvent` to `GuildHallEvent` mapping: session event gets meetingId and worker
- Verify session expiry detection post-loop (lastError + isSessionExpiryError)
- Verify session expiry suppression in `sendMessage` path (error not yielded to SSE during renewal)
- Verify `aborted` maps to `{ type: "error", reason: "Turn interrupted" }`
- Verify `appendAssistantTurnSafe` called after loop with accumulated data

Remove tests that specifically tested query-runner internals via the meeting orchestrator.

### Not this task

- Do not delete query-runner.ts (that's Task 008)
- Do not modify daemon/app.ts (meeting wiring is unchanged)
- Do not modify sdk-runner.ts or event-translator.ts

## Validation

1. `bun test` passes all existing tests. Meeting streaming behavior is preserved.
2. `bun run typecheck` clean. No remaining imports from query-runner in the meeting orchestrator.
3. Meeting orchestrator tests verify: session event mapping, transcript accumulation, session expiry suppression in sendMessage, session expiry detection post-loop, aborted-to-error mapping, appendAssistantTurnSafe call.
4. The `startSession` and `sendMessage` paths both use `runSdkSession` with correct options (verify resume field threading in sendMessage).
5. No `runQueryAndTranslate` or `iterateAndTranslate` calls remain in the meeting orchestrator.

After this task, request fresh-eyes review of the event mapping boundary (SdkRunnerEvent to GuildHallEvent) via `pr-review-toolkit:silent-failure-hunter`. The SSE streaming bug fix retro warns that ID namespace confusion at this boundary caused a prior bug.

## Why

From `.lore/design/unified-sdk-runner.md`, Meeting consumption pattern: The inline loop owns transcript accumulation and event mapping. "The transcript accumulation and session-id capture that currently live in iterateAndTranslate move into the meeting orchestrator's inline loop. This is ~15 lines of straightforward code."

From `.lore/design/unified-sdk-runner.md`, Session expiry: "Meeting orchestrator calls isSessionExpiryError to decide whether to renew the session. The function lives in sdk-runner.ts because it's SDK knowledge."

From `.lore/specs/meeting-infrastructure-convergence.md`, REQ-MIC-13: The meeting orchestrator's public interface does not change. SSE streaming behavior is preserved.

## Files

- `daemon/services/meeting/orchestrator.ts` (modify)
- `tests/daemon/meeting-session.test.ts` (modify)
- `tests/daemon/services/meeting/orchestrator.test.ts` (modify)
