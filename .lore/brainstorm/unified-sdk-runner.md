---
title: Unified SDK runner for commissions and meetings
date: 2026-03-03
status: resolved
tags: [sdk, refactor, session-runner, query-runner, architecture]
modules: [session-runner, query-runner, event-translator, sdk-logging]
related: [.lore/brainstorm/meeting-infrastructure-convergence.md]
---

# Brainstorm: Unified SDK Runner

## Context

`session-runner.ts` and `query-runner.ts` both wrap the Claude Agent SDK's async generator, but they grew independently to serve different consumption patterns:

- **session-runner** (commissions): fire-and-forget. Consumes the generator internally, tracks results via EventBus subscription, handles follow-up sessions, returns `Promise<SessionResult>`.
- **query-runner** (meetings): streaming. Yields `GuildHallEvent` as an async generator so the meeting orchestrator can stream events to the browser via SSE.

Both do the same fundamental work (call queryFn, iterate messages, capture session_id, handle abort), but the surrounding concerns differ enough that they were built separately. The question: what would a unified approach look like, and is it worth doing?

## Decisions Made During Brainstorm

### EventBus subscription does not belong in the runner

The session-runner subscribes to EventBus to detect tool events (submit_result, report_progress, log_question), then invokes callbacks (onResult, onProgress, onQuestion) that the commission orchestrator passed in. This is a pass-through: toolbox emits event, runner relays it, orchestrator receives it. The runner adds no value in the middle. The commission orchestrator should subscribe to EventBus directly.

This removes `SessionCallbacks`, `SessionEventTypes`, `contextId`, `contextIdField`, and `eventTypes` from the runner's type surface. The runner doesn't need to know what "result" or "progress" means in the caller's domain.

### Follow-up/retry logic is dead weight (remove)

The follow-up session ("resume if no submit_result") was a solution to a problem that turned out to be in the tool itself. The retry is not meaningfully different from the original attempt (just an added prompt and "run it again"). It doesn't fix tool bugs. Remove it entirely.

### The runner should not know about EventBus at all

With callbacks and retry removed, the runner has no reason to reference EventBus. Its dependency list shrinks to just `queryFn` (and preparation deps if we include setup). EventBus is a communication channel between toolboxes and orchestrators. The runner sits at a different layer.

### Session preparation is duplicated and should be shared

Side-by-side comparison of session-runner steps 1-5 vs. meeting orchestrator's `buildActivatedQueryOptions` confirms they're structurally identical:

| Step | session-runner | meeting orchestrator | Match? |
|------|---------------|---------------------|--------|
| Find worker package | By `identity.name` | By `identity.name` (via helper) | Yes |
| Resolve tools | `resolveToolSet(worker, packages, context)` | Same call, same context shape | Yes |
| Load memories | `loadMemories(name, project, opts)` | Same call | Yes (meeting adds compaction) |
| Activate worker | `activateWorker(pkg, context)` | Same call | Yes (context extras differ) |
| Build SDK options | Same shape, same fields | Same shape, same fields | Yes (minor option diffs) |

Divergences that matter:
- **Memory compaction**: meeting triggers it, session-runner doesn't. This is a bug in session-runner; commissions should compact too.
- **`includePartialMessages`**: `true` for meetings (streaming), `false` for commissions. Caller-provided option.
- **Session resume**: meetings support it, commissions don't. Caller-provided option.
- **Activation extras**: both pass context-specific data, but through the same `activationExtras` spread mechanism.

## Emerging Shape

### The runner's job (narrow)

Take a prompt and SDK options, iterate the async generator, produce structured events. That's it.

```
runSdkSession(queryFn, prompt, options) -> AsyncGenerator<SdkRunnerEvent>
```

The runner owns:
- Iterating SDK messages
- Translating to structured events (event-translator, already exists)
- Debug logging (sdk-logging, already exists)
- Capturing session_id (yielded as an event)
- Abort handling (AbortError -> error event)

The runner does NOT own:
- EventBus subscription (orchestrator concern)
- Follow-up/retry logic (removed)
- Transcript accumulation (meeting orchestrator concern)
- Result tracking via tool events (commission orchestrator concern)
- Session preparation (shared function, called by orchestrators before the runner)

### Shared preparation function

```
prepareSdkSession(spec) -> { prompt, options, activation, sessionId? }
```

Handles the 5-step setup. Callers pass a spec with their context-specific extras (meetingContext, commissionContext, includePartialMessages, resume). The function doesn't know which activity type it's preparing for.

### Consumption patterns

**Commissions:**
```
options = await prepareSdkSession(spec)
eventBus.subscribe(handleToolEvents)  // orchestrator subscribes directly
for await (const event of runSdkSession(queryFn, prompt, options)) {
  logEvent(event)  // or ignore
}
eventBus.unsubscribe()
```

**Meetings:**
```
options = await prepareSdkSession(spec)
for await (const event of runSdkSession(queryFn, prompt, options)) {
  accumulateTranscript(event)
  yield toGuildHallEvent(event, meetingContext)
}
appendTranscript()
```

### Event type

`SdkRunnerEvent` is context-free. No `meetingId`, no `commissionId`. Events carry SDK-level information only:
- `session` (session_id captured)
- `text_delta` (streaming text)
- `tool_use` (tool invocation started)
- `tool_result` (tool completed)
- `turn_end` (cost)
- `error` (failure reason)

Callers map to `GuildHallEvent` at their boundary by adding context IDs. This matches the Five Concerns model: the Session concern doesn't know about activity types.

Note: `SdkRunnerEvent` may end up being identical to `GuildHallEvent` minus the context fields, or it may be `GuildHallEvent` with context fields made optional. The cleanest option depends on how many callers need the mapping.

## Composable wrappers (maybe, maybe not)

Idea 3 proposed `withLogging()`, `withTranscript()`, `drainToResult()` as composable generator wrappers. This is elegant in theory but risks wrapper-stack confusion during debugging. The alternative is simpler: the core generator does translation + logging (both are always-on), and callers handle their own concerns inline in their `for await` loop.

The drain helper is worth keeping as a convenience:
```
drainSdkSession(generator) -> Promise<SdkRunnerResult>
```

Transcript accumulation is simple enough to inline in the meeting orchestrator's loop. No need for a wrapper.

## Open Questions

1. **Preparation function signature.** What does the spec look like? Does it mirror `SessionSpec` (minus callbacks, EventBus, event types), or is it a new type?

2. **Where does `prepareSdkSession` live?** In the new `sdk-runner.ts`? In its own file? It has dependencies on `resolveToolSet`, `loadMemories`, `activateWorker` which are currently injected.

3. **Migration path.** Can we build the unified runner alongside the existing modules, wire commission to it first (simpler consumer), validate, then wire meetings? Incremental is strongly preferred.

4. **Session expiry detection.** Query-runner has `isSessionExpiryError()` for meeting resume. Does this belong in the unified runner (it's SDK-level knowledge) or in the meeting orchestrator (it's resume policy)?

5. **`SdkRunnerEvent` vs `GuildHallEvent`.** Should we create a new type or make `GuildHallEvent` context fields optional? The new type is cleaner but adds a mapping step. Optional fields are pragmatic but muddy the type.

## Next Steps

If this brainstorm resolves:
- Design `SdkRunnerEvent` type and `prepareSdkSession` spec type
- Build unified `sdk-runner.ts` with `runSdkSession` generator
- Wire commission orchestrator to use it (replace session-runner)
- Wire meeting orchestrator to use it (replace query-runner)
- Remove session-runner.ts, query-runner.ts
- Add memory compaction to the shared preparation path
