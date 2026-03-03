---
title: Unified SDK runner for commissions and meetings
date: 2026-03-03
status: approved
tags: [sdk, refactor, session-runner, query-runner, architecture]
modules: [sdk-runner, event-translator, sdk-logging, commission-orchestrator, meeting-orchestrator]
related: [.lore/brainstorm/unified-sdk-runner.md, .lore/design/process-architecture.md]
---

# Design: Unified SDK Runner

## Problem

Two modules wrap the Claude Agent SDK in different ways:

- `session-runner.ts` (commissions): fire-and-forget, EventBus subscription, follow-up retry, returns `Promise<SessionResult>`
- `query-runner.ts` (meetings): streaming, event translation, transcript accumulation, yields `AsyncGenerator<GuildHallEvent>`

Both iterate SDK messages, capture session IDs, handle abort, and build query options. The duplication means SDK changes require updates in two places, and commission-specific hacks (dead follow-up retry, pass-through EventBus callbacks) have accumulated in session-runner without serving a real purpose.

See [Brainstorm: Unified SDK Runner](.lore/brainstorm/unified-sdk-runner.md) for the exploration that led here.

## Constraints

- Must preserve the Five Concerns boundary: Session concern knows nothing about activity types, git, or artifacts
- Commission orchestrator must still receive tool events (submit_result, report_progress, log_question) via EventBus
- Meeting orchestrator must still stream events to the browser via SSE using `yield*` delegation
- Meeting transcript accumulation must continue working
- Memory compaction (currently missing from commissions) should be added to the shared path
- Migration must be incremental: build new module, wire one consumer, validate, wire the other, remove old modules

## Decision

**Streaming generator as the universal interface, with shared session preparation.**

The async generator is strictly more general than fire-and-forget. A commission drains the generator; a meeting yields it. One iteration loop, two consumption patterns.

This combines Ideas 1, 2, and 4 from the brainstorm:
- **Idea 1**: `runSdkSession()` always returns `AsyncGenerator<SdkRunnerEvent>`
- **Idea 2**: `prepareSdkSession()` handles the shared 5-step setup
- **Idea 4**: `SdkRunnerEvent` is context-free (no meetingId, no commissionId)

Composable generator wrappers (Idea 3) were rejected. The core generator does translation + logging (both always-on). Callers handle their own concerns inline. One drain helper for commissions. No wrapper-stack complexity.

## Interface/Contract

### SdkRunnerEvent

Context-free event type. No activity IDs. Produced by the runner, consumed by orchestrators who map to their domain types.

```typescript
export type SdkRunnerEvent =
  | { type: "session"; sessionId: string }
  | { type: "text_delta"; text: string }
  | { type: "tool_use"; name: string; input: unknown; id?: string }
  | { type: "tool_result"; name: string; output: string; toolUseId?: string }
  | { type: "turn_end"; cost?: number }
  | { type: "error"; reason: string }
  | { type: "aborted" };
```

Compared to `GuildHallEvent`:
- `session` drops `meetingId` and `worker` (callers add these)
- `aborted` is new (commissions need to distinguish abort from error; meetings handle abort externally)
- All other variants are identical

### SdkQueryOptions

Moved from `query-runner.ts`. `allowDangerouslySkipPermissions` is intentionally omitted; neither consumer uses it and `permissionMode: "dontAsk"` is the standard path.

```typescript
export type SdkQueryOptions = {
  systemPrompt?: string | { type: "preset"; preset: "claude_code"; append?: string };
  includePartialMessages?: boolean;
  permissionMode?: string;
  mcpServers?: Record<string, unknown>;
  allowedTools?: string[];
  settingSources?: string[];
  cwd?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  abortController?: AbortController;
  model?: string;
  resume?: string;
};
```

### runSdkSession

Core iteration loop. Translates SDK messages to `SdkRunnerEvent`, logs for debug, yields events.

```typescript
export async function* runSdkSession(
  queryFn: (params: { prompt: string; options: SdkQueryOptions }) => AsyncGenerator<SDKMessage>,
  prompt: string,
  options: SdkQueryOptions,
): AsyncGenerator<SdkRunnerEvent> { ... }
```

Behavior:
1. Call `queryFn({ prompt, options })` to get the SDK generator
2. Iterate SDK messages
3. For each message: call `logSdkMessage()` for debug, call `translateSdkMessage()` for structured events
4. Yield each `SdkRunnerEvent`
5. On `AbortError`: yield `{ type: "aborted" }`, return
6. On other error: yield `{ type: "error", reason }`, return
7. On `queryFn` throwing before iteration: same error handling

### drainSdkSession

Convenience for fire-and-forget consumers. Consumes the generator, returns a summary.

```typescript
export type SdkRunnerOutcome = {
  sessionId: string | null;
  aborted: boolean;
  error?: string;
};

export async function drainSdkSession(
  generator: AsyncGenerator<SdkRunnerEvent>,
): Promise<SdkRunnerOutcome> { ... }
```

Behavior:
1. Iterate all events from the generator to completion
2. Capture `sessionId` from `session` events
3. Track `firstError` from the first `error` event seen (if any)
4. Track `aborted` from `aborted` events
5. After the generator completes, return the accumulated outcome

The drain always exhausts the generator. It does not exit early on error or abort events because the generator may yield cleanup events after an error (e.g., partial turn_end with cost). The generator itself decides when to stop; the drain just collects the summary.

The drain helper does not log or process events beyond extracting the outcome. The generator already logged and translated during iteration.

### isSessionExpiryError

SDK-level knowledge about error string patterns. Moved from `query-runner.ts`.

```typescript
export function isSessionExpiryError(reason: string): boolean { ... }
```

Meeting orchestrator calls this to decide whether to renew the session. Commission orchestrator doesn't need it (no resume). The function lives in `sdk-runner.ts` because it's SDK knowledge (what error strings the SDK uses), not meeting policy. Only the meeting orchestrator calls it today; the placement is a bet that a second caller appears if commissions ever gain resume support. If that never happens, the function is still correctly placed at the SDK boundary rather than in a consumer.

### SessionPrepSpec

Input to the shared preparation function. Context-agnostic.

```typescript
export type SessionPrepSpec = {
  workerName: string;
  packages: DiscoveredPackage[];
  config: AppConfig;
  guildHallHome: string;
  projectName: string;
  projectPath: string;
  workspaceDir: string;

  // Tool resolution context
  contextId: string;
  contextType: "commission" | "meeting";
  eventBus: EventBus;
  services?: GuildHallToolServices;

  // Activation
  activationExtras?: Partial<ActivationContext>;

  // SDK options (caller-provided overrides)
  abortController: AbortController;
  includePartialMessages?: boolean;
  resume?: string;
  resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number };
};
```

Note: `eventBus` is passed through to `resolveToolSet` (toolboxes need it for event emission). The runner itself does not subscribe to EventBus. The preparation function passes it along without using it.

### SessionPrepDeps

Injected dependencies for the preparation function.

```typescript
export type SessionPrepDeps = {
  resolveToolSet: (
    worker: WorkerMetadata,
    packages: DiscoveredPackage[],
    context: {
      projectName: string;
      guildHallHome: string;
      contextId: string;
      contextType: "meeting" | "commission";
      workerName: string;
      eventBus: EventBus;
      config: AppConfig;
      services?: GuildHallToolServices;
    },
  ) => Promise<ResolvedToolSet>;

  loadMemories: (
    workerName: string,
    projectName: string,
    deps: { guildHallHome: string; memoryLimit?: number },
  ) => Promise<{ memoryBlock: string; needsCompaction: boolean }>;

  activateWorker: (
    workerPkg: DiscoveredPackage,
    context: ActivationContext,
  ) => Promise<ActivationResult>;

  /**
   * Trigger background memory compaction. Fire-and-forget.
   * The caller wires this with queryFn captured in the closure at DI time,
   * so the prep function doesn't need to carry queryFn for compaction.
   */
  triggerCompaction?: (
    workerName: string,
    projectName: string,
    opts: { guildHallHome: string },
  ) => void;

  memoryLimit?: number;
};
```

### SessionPrepResult

Output from preparation: everything the caller needs to run a session.

```typescript
export type SessionPrepResult = {
  options: SdkQueryOptions;
};
```

The preparation function consumes `ActivationResult` internally to build `options`. Callers don't need the activation object; everything they need (system prompt, tools, resource bounds, model) is already baked into `options`.

### prepareSdkSession

Shared 5-step setup. Returns ready-to-use SDK options or an error.

```typescript
export async function prepareSdkSession(
  spec: SessionPrepSpec,
  deps: SessionPrepDeps,
): Promise<{ ok: true; result: SessionPrepResult } | { ok: false; error: string }> { ... }
```

Steps:
1. **Find worker package** by `spec.workerName` in `spec.packages`
2. **Resolve tools** via `deps.resolveToolSet(workerMeta, packages, context)`
3. **Load memories** via `deps.loadMemories(name, project, opts)`. If `needsCompaction` and `deps.triggerCompaction` exists, fire it (fixes the commission compaction gap).
4. **Activate worker** via `deps.activateWorker(pkg, activationContext)`. Spreads `spec.activationExtras` into the context.
5. **Build SDK options**: system prompt, MCP servers, allowed tools, permissions, cwd, model, resource bounds. Apply `spec.resourceOverrides`, `spec.includePartialMessages`, `spec.resume`, `spec.abortController`.

Each step can fail independently. On failure, return `{ ok: false, error }`.

## event-translator Changes

Currently `translateSdkMessage` takes a `TranslatorContext` with `meetingId` and `workerName`, stamps them onto the `session` event. In the unified model:

- `TranslatorContext` is removed
- `translateSdkMessage(message: SDKMessage): SdkRunnerEvent[]` becomes a pure function of just the SDK message
- The `session` event carries only `sessionId`
- Callers (meeting orchestrator) add `meetingId` and `worker` when mapping `SdkRunnerEvent` to `GuildHallEvent`

This is a small change: one function signature, one event variant.

## Module Layout

```
daemon/services/
├── sdk-runner.ts           # NEW: types, runSdkSession, drainSdkSession,
│                           #       prepareSdkSession, isSessionExpiryError
├── event-translator.ts     # MODIFIED: SdkRunnerEvent output, no TranslatorContext
├── sdk-logging.ts          # UNCHANGED
├── session-runner.ts       # REMOVED after commission migration
├── query-runner.ts         # REMOVED after meeting migration
```

One file for the runner. Preparation and iteration are both "SDK session infrastructure" and share types. The file stays well under 300 lines (preparation ~80, iteration ~40, drain ~15, types ~60, isSessionExpiryError ~8).

## Consumption Patterns

### Commission orchestrator

```typescript
// Preparation
const prep = await prepareSdkSession(spec, prepDeps);
if (!prep.ok) {
  // handle error, update commission state
  return;
}

// EventBus subscription (orchestrator owns this directly)
const unsubscribe = eventBus.subscribe((event) => {
  if (event.type === "commission:result" && event.commissionId === commissionId) {
    resultSubmitted = true;
    onResult(event.summary, event.artifacts);
  }
  // ... progress, question
});

// Run and drain
const outcome = await drainSdkSession(
  runSdkSession(queryFn, prompt, prep.result.options)
);

unsubscribe();

// Build commission result from outcome + resultSubmitted
```

No callbacks in the runner. No follow-up retry. The orchestrator decides what to do with the outcome.

Note: `resultSubmitted` tracking moves from the runner to the orchestrator. The current `SessionResult.resultSubmitted` field disappears; the orchestrator sets `resultSubmitted = true` in its own EventBus callback. The existing `handleSessionCompletion` logic (`if (result.resultSubmitted) → success, else → fail`) stays the same, but reads the orchestrator's local flag instead of the runner's return value.

### Meeting orchestrator

```typescript
// Preparation
const prep = await prepareSdkSession(spec, prepDeps);
if (!prep.ok) {
  yield { type: "error", reason: prep.error };
  return;
}

// Stream events, accumulate transcript
const textParts: string[] = [];
const toolUses: ToolUseEntry[] = [];
let sessionId: string | null = null;
let pendingToolName: string | null = null;

for await (const event of runSdkSession(queryFn, prompt, prep.result.options)) {
  // Capture session ID
  if (event.type === "session") {
    sessionId = event.sessionId;
    meeting.sdkSessionId = asSdkSessionId(sessionId);
  }

  // Accumulate transcript data
  if (event.type === "text_delta") textParts.push(event.text);
  if (event.type === "tool_use") pendingToolName = event.name;
  if (event.type === "tool_result") {
    toolUses.push({ toolName: pendingToolName ?? event.name, result: event.output });
    pendingToolName = null;
  }

  // Track errors for post-loop session expiry detection
  if (event.type === "error") lastError = event.reason;

  // Map to GuildHallEvent and yield to SSE
  if (event.type === "session") {
    yield { type: "session", meetingId: meeting.meetingId, sessionId: event.sessionId, worker: meeting.workerName };
  } else if (event.type === "aborted") {
    // Yield an error event to the browser so the UI shows "Turn interrupted".
    // The current code yields { type: "error", reason: "Turn interrupted" } on abort;
    // we preserve that behavior at the mapping boundary.
    yield { type: "error", reason: "Turn interrupted" };
  } else {
    yield event; // text_delta, tool_use, tool_result, turn_end, error pass through
  }
}

// Append transcript (partial content preserved even on abort/error)
await appendAssistantTurnSafe(meeting.meetingId, textParts, toolUses, ghHome);
```

Session expiry detection happens after the loop. This catches both mid-iteration errors and early-throw errors (where `queryFn` fails before iteration begins, which the runner still yields as an error event):
```typescript
if (lastError && isSessionExpiryError(lastError)) {
  // trigger session renewal
}
```

The transcript accumulation and session-id capture that currently live in `iterateAndTranslate` move into the meeting orchestrator's inline loop. This is ~15 lines of straightforward code.

## What Gets Removed

### From session-runner.ts (entire file removed)
- `SessionCallbacks` type
- `SessionEventTypes` type
- `SessionSpec` type (replaced by `SessionPrepSpec` + direct `runSdkSession` call)
- `SessionResult` type (replaced by `SdkRunnerOutcome` + orchestrator's own result tracking)
- `SessionRunner` interface
- `SessionRunnerDeps` type
- `createSessionRunner()` factory
- `eventMatchesContext()` helper
- `DEFAULT_FOLLOW_UP_PROMPT` constant
- EventBus subscription logic
- Follow-up session logic
- Terminal state guard (REQ-CLS-24 settle pattern)

The terminal state guard was solving a real problem (abort vs completion race). In the unified model, the generator handles this naturally: AbortError during iteration yields `{ type: "aborted" }` and returns. The generator produces exactly one terminal state. The drain helper reports it. No explicit settle needed.

### From query-runner.ts (entire file removed)
- `QueryRunOutcome` type (replaced by `SdkRunnerOutcome`)
- `QueryRunnerMeeting` interface (meeting orchestrator uses its own meeting type)
- `QueryOptions` type (moved to sdk-runner.ts as `SdkQueryOptions`)
- `PresetQueryPrompt` type (inlined into `SdkQueryOptions`)
- `isSessionExpiryError()` (moved to sdk-runner.ts)
- `truncateTranscript()` (moved to meeting orchestrator or transcript utils)
- `appendAssistantTurnSafe()` (moved to meeting orchestrator or transcript utils)
- `iterateAndTranslate()` (replaced by inline loop in meeting orchestrator)
- `runQueryAndTranslate()` (replaced by `runSdkSession()`)

### From event-translator.ts (modified, not removed)
- `TranslatorContext` type (removed)
- Return type changes from `GuildHallEvent[]` to `SdkRunnerEvent[]`
- `translateSystemMessage` simplified: no context parameter, returns `{ type: "session", sessionId }` only

## Edge Cases

### Abort before preparation
`prepareSdkSession` does not check `abortController.signal.aborted`. The preparation steps (resolve tools, load memories, activate worker) involve I/O that could be wasted if the caller already cancelled. However, preparation is fast (sub-second) and the abort check adds branching to every step for a rare case. The caller can check `signal.aborted` before calling `prepareSdkSession` if early-abort is important. If `signal` is aborted by the time `runSdkSession` calls `queryFn`, the SDK throws `AbortError` immediately. The runner catches it and yields `{ type: "aborted" }`.

### Abort during iteration
SDK throws `AbortError` from the async generator. The runner catches it, yields `{ type: "aborted" }`, returns. The drain helper sees the event and reports `aborted: true`. The meeting orchestrator sees the event and handles it in its loop.

### Session expiry during iteration
The SDK may throw or yield an error containing "session expired" or "session not found". The runner yields `{ type: "error", reason }` like any other error. The meeting orchestrator checks `isSessionExpiryError(reason)` on error events to decide whether to renew.

### Multiple errors
The SDK generator may yield multiple error events (e.g., error during execution followed by a result error). The runner yields all of them. The drain helper captures the first error. The meeting orchestrator processes them as they arrive.

### Memory compaction failure
`triggerCompaction` is fire-and-forget (the current meeting implementation uses `void` to discard the promise). Failure is non-fatal and logged at the compaction call site, not in the runner.

### Preparation failure at any step
`prepareSdkSession` returns `{ ok: false, error }` if any step fails. The caller handles it. No partial state leaks.

## Migration Path

1. **Create `sdk-runner.ts`** with types, `runSdkSession`, `drainSdkSession`, `prepareSdkSession`, `isSessionExpiryError`
2. **Modify `event-translator.ts`** to produce `SdkRunnerEvent`, remove `TranslatorContext`
3. **Update event-translator tests** for new return type
4. **Wire commission orchestrator** to use `prepareSdkSession` + `drainSdkSession(runSdkSession(...))` + direct EventBus subscription
5. **Remove `session-runner.ts`** and its tests
6. **Wire meeting orchestrator** to use `prepareSdkSession` + inline `runSdkSession` loop with transcript accumulation
7. **Move `truncateTranscript` and `appendAssistantTurnSafe`** to meeting orchestrator or transcript utils
8. **Remove `query-runner.ts`** and its tests
9. **Update `app.ts`** wiring: remove `createSessionRunner`, pass `prepareSdkSession` deps directly

Commission first because it's the simpler consumer (drain, no streaming). If something breaks, the blast radius is smaller.

## Open Questions

1. **`truncateTranscript` location.** It's meeting-specific but also general-purpose string manipulation. Leave in a transcript utils file or inline in meeting orchestrator? Low stakes either way.

2. **`GuildHallEvent` type.** After migration, `GuildHallEvent` still exists for the SSE boundary (daemon to browser). The `session` variant keeps `meetingId` and `worker`. Should we rename it to reflect that it's a "meeting event" now, or keep the generic name? Low priority.
