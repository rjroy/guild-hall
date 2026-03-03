---
title: Update event-translator to return SdkRunnerEvent
date: 2026-03-03
status: complete
tags: [task]
source: .lore/plans/unified-sdk-runner.md
related: [.lore/design/unified-sdk-runner.md]
sequence: 2
modules: [event-translator, query-runner]
---

# Task: Update Event-Translator Boundary

## What

Modify the event-translator to return context-free `SdkRunnerEvent` instead of `GuildHallEvent`, add a temporary compatibility shim in query-runner, and update event-translator tests.

### 1. Modify `daemon/services/event-translator.ts`

- Remove `TranslatorContext` type export
- Change function signature: `translateSdkMessage(message: SDKMessage): SdkRunnerEvent[]` (drop the `context` parameter)
- Import `SdkRunnerEvent` from `sdk-runner.ts`
- The `session` event now returns only `{ type: "session", sessionId }`. Remove the `meetingId` and `worker` fields that were sourced from `TranslatorContext`.
- All other event translations are unchanged (text_delta, tool_use, tool_result, turn_end, error already match SdkRunnerEvent).

This is a small change: one function signature, one event variant, one type removal.

### 2. Patch `daemon/services/query-runner.ts` for compatibility

`iterateAndTranslate` calls `translateSdkMessage` and yields the results as `GuildHallEvent`. After step 1, `translateSdkMessage` returns `SdkRunnerEvent[]` where the `session` event lacks `meetingId` and `worker`. Patch `iterateAndTranslate` to map the session event back to `GuildHallEvent`:

```typescript
for (const event of translateSdkMessage(msg)) {
  if (event.type === "session") {
    yield { ...event, meetingId: meeting.meetingId, worker: meeting.workerName };
  } else {
    yield event as GuildHallEvent;
  }
}
```

This is a temporary shim. It is removed when query-runner is deleted in Task 008.

Also remove the `TranslatorContext` import and the `translatorContext` variable construction in `runQueryAndTranslate` (it's no longer passed to `translateSdkMessage`).

### 3. Update `tests/daemon/event-translator.test.ts`

- Remove `TranslatorContext` setup from test fixtures (the context object passed to translateSdkMessage)
- Update call sites: `translateSdkMessage(msg)` instead of `translateSdkMessage(msg, context)`
- Update `session` event assertions: expect `{ type: "session", sessionId }` only (no meetingId, no worker)
- All other event type assertions are unchanged (the types are identical)
- Import `SdkRunnerEvent` instead of `GuildHallEvent` for type checking assertions if needed

### Not this task

- Do not modify sdk-runner.ts (already created in Task 001)
- Do not modify any orchestrator
- Do not modify daemon/app.ts
- Do not delete query-runner.ts

## Validation

1. `bun test tests/daemon/event-translator.test.ts` passes with updated assertions.
2. `bun test` passes all existing tests (1706+). The query-runner compatibility shim keeps meeting tests green. Session-runner tests are untouched.
3. `bun run typecheck` clean. No remaining references to `TranslatorContext` in event-translator.ts.
4. `translateSdkMessage` signature takes one parameter (SDKMessage), not two.

After Tasks 001 and 002, request type design review via `pr-review-toolkit:type-design-analyzer` on the new `SdkRunnerEvent` type and the updated event-translator interface. Feed findings into subsequent tasks.

## Why

From `.lore/design/unified-sdk-runner.md`, event-translator Changes: "TranslatorContext is removed. translateSdkMessage(message: SDKMessage): SdkRunnerEvent[] becomes a pure function of just the SDK message. The session event carries only sessionId. Callers (meeting orchestrator) add meetingId and worker when mapping SdkRunnerEvent to GuildHallEvent."

This change is the boundary shift that makes the event-translator context-free, matching the Five Concerns model where the Session concern doesn't know about activity types.

## Files

- `daemon/services/event-translator.ts` (modify)
- `daemon/services/query-runner.ts` (modify, temporary shim)
- `tests/daemon/event-translator.test.ts` (modify)
