---
title: Meeting context compaction detection and surfacing
date: 2026-03-24
status: draft
tags: [plan, meetings, agent-sdk, context-compaction, ux, observability]
modules: [event-translator, sdk-runner, session-loop, meeting-orchestrator, chat-interface, transcript]
related:
  - .lore/specs/meetings/meeting-context-compaction.md
  - .lore/research/sdk-context-compaction.md
  - .lore/specs/meetings/meeting-infrastructure-convergence.md
---

# Plan: Meeting Context Compaction Detection and Surfacing

## Spec Reference

**Spec**: `.lore/specs/meetings/meeting-context-compaction.md`
**Research**: `.lore/research/sdk-context-compaction.md`

Requirements addressed:

- REQ-MCC-1: Event translator emits `context_compacted` for compact_boundary &rarr; Step 1
- REQ-MCC-2: New `SdkRunnerEvent` variant &rarr; Step 1
- REQ-MCC-3: `SdkSystemMessage` extended, `translateSystemMessage` handles compact_boundary &rarr; Step 1
- REQ-MCC-4: Other system subtypes continue returning empty arrays &rarr; Step 1
- REQ-MCC-5: `SessionPrepSpec` gains `onCompactSummary` callback &rarr; Step 2
- REQ-MCC-6: `prepareSdkSession` constructs `hooks` entry when callback provided &rarr; Step 2
- REQ-MCC-7: `SdkQueryOptions` extended with `hooks` field &rarr; Step 2
- REQ-MCC-8: No hooks when callback absent &rarr; Step 2
- REQ-MCC-9: `GuildHallEvent` gains `context_compacted` variant &rarr; Step 3
- REQ-MCC-10: `iterateSession` maps the event with summary attachment &rarr; Step 4
- REQ-MCC-11: Meeting orchestrator wires `onCompactSummary` into prep spec &rarr; Step 4
- REQ-MCC-12: Transcript compaction marker &rarr; Step 5
- REQ-MCC-13: Transcript parser recognizes `## Context Compacted` headings &rarr; Step 5
- REQ-MCC-14: ChatInterface renders compaction events &rarr; Step 6
- REQ-MCC-15: Commission sessions emit `context_compacted` from translator (automatic) &rarr; Step 1
- REQ-MCC-16: Commission sessions do not register PostCompact hook &rarr; Step 2

## Codebase Context

### event-translator.ts (356 lines)

Pure function module at `daemon/lib/agent-sdk/event-translator.ts`. Two exports: `createStreamTranslator()` (stateful, handles input_json_delta accumulation) and `translateSdkMessage()` (stateless, dispatches by message type).

The compact_boundary drop is at line 202: `if (message.subtype !== "init") { return []; }` inside `translateSystemMessage()`. The local type `SdkSystemMessage` (line 26-30) has `type: "system"`, `subtype?: string`, and `session_id?: string`. It lacks `compact_metadata`, which the SDK's `SDKCompactBoundaryMessage` carries.

The stateful translator at line 71 delegates non-stream_event messages to `translateSdkMessage`, so adding compact_boundary handling there automatically works for both paths.

### sdk-runner.ts (503 lines)

`SdkRunnerEvent` union (lines 30-38) has 8 variants: `session`, `text_delta`, `tool_use`, `tool_input`, `tool_result`, `turn_end`, `error`, `aborted`. The new `context_compacted` variant adds a 9th.

`SdkQueryOptions` (lines 40-87) is Guild Hall's projection of the SDK query options. No `hooks` field today. The SDK's `query()` function accepts `hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>` (sdk.d.ts:927). The SDK types needed for hooks:
- `HookEvent` (line 507): union of 23 string literals including `'PostCompact'`
- `HookCallbackMatcher` (line 500): `{ matcher?: string; hooks: HookCallback[]; timeout?: number }`
- `HookCallback` (line 493): `(input: HookInput, toolUseID: string | undefined, options: { signal: AbortSignal }) => Promise<HookJSONOutput>`
- `HookJSONOutput` (line 511): `AsyncHookJSONOutput | SyncHookJSONOutput`
- `SyncHookJSONOutput` (line 3807): `{ continue?: boolean; suppressOutput?: boolean; stopReason?: string; ... }`
- `PostCompactHookInput` (line 1328): `BaseHookInput & { hook_event_name: 'PostCompact'; trigger: 'manual' | 'auto'; compact_summary: string }`

`SessionPrepSpec` (lines 89-105) is the input to `prepareSdkSession`. It has no callback fields today. Adding `onCompactSummary` here keeps the hook logic out of the event translator (which is pure) and inside the session prep layer (which already handles configuration).

`prepareSdkSession` (lines 263-502) builds `SdkQueryOptions` in step 5 (lines 421-498). The hooks field would be added alongside the existing spread pattern (`...(resolvedPlugins.length > 0 ? { plugins: resolvedPlugins } : {})`).

`drainSdkSession` (lines 210-240) iterates the generator and handles `session`, `aborted`, `error`, and `turn_end` events. The new `context_compacted` event falls through the else branch and is ignored. No changes needed for commission passthrough (REQ-MCC-15).

### session-loop.ts (190 lines)

`iterateSession` (lines 58-136) is the meeting's event loop. It maps `SdkRunnerEvent` to `GuildHallEvent`. The switch at lines 77-128 handles `session`, `text_delta`, `tool_use`, `tool_result`, `aborted`, and `error` explicitly. Everything else (lines 125-128) falls through to `yield event`, which works because `text_delta`, `tool_use`, `tool_input`, `tool_result`, `turn_end` are structurally identical between `SdkRunnerEvent` and `GuildHallEvent`.

The new `context_compacted` event needs explicit handling because the `GuildHallEvent` variant has a `summary` field that doesn't exist on the `SdkRunnerEvent` variant (the summary comes from the hook callback, not the stream).

`startSession` (lines 144-189) calls `prepareSdkSession` at line 170 via the `prepDeps`. It passes the result to `iterateSession` at line 178. This function doesn't build the `SessionPrepSpec` itself; it receives a `buildMeetingPrepSpec` callback from the orchestrator. The hook callback wiring happens in that callback, not here.

### transcript.ts (373 lines)

`TranscriptMessage` (lines 35-40): `{ role: "user" | "assistant"; content: string; toolUses?: ToolUseEntry[]; timestamp: string }`. Needs `"system"` added to the role union.

`parseTranscriptMessages` (lines 259-309) regex matches `## (User|Assistant) \(([^)]+)\)`. The `## Context Compacted` heading uses a different format: `## Context Compacted (timestamp)`. The regex needs extending to capture this third heading type.

`appendAssistantTurn` (lines 125-152) and `appendUserTurn` (lines 109-119) follow the same pattern: validate, build section string, `fs.appendFile`. A new `appendCompactionMarker` function follows the same pattern.

`truncateTranscript` (line 164) splits on `## (?:User|Assistant)` headings. It needs to also recognize `## Context Compacted` to avoid splitting a compaction marker across the truncation boundary.

The parallel parser in `lib/meetings.ts` (`parseTranscriptToMessages`, line 282) also needs updating to recognize `## Context Compacted` headings. Its `TranscriptChatMessage` type (line 257) has `role: "user" | "assistant"` and would need `"system"` as well.

### daemon/types.ts (96 lines)

`GuildHallEvent` union (lines 88-95) has 7 variants. The new `context_compacted` variant adds an 8th. Since the SSE routes (`daemon/routes/meetings.ts`, `daemon/routes/events.ts`) just JSON-serialize each event, no route changes are needed.

### ChatInterface.tsx (390 lines)

The SSE event handler (lines 234-324) switches on `event.type`. It handles `text_delta`, `tool_use`, `tool_input`, `tool_result`, `turn_end`, and `error`. A new `context_compacted` case inserts a system message into the `messages` array.

`ChatMessage` (from `lib/types.ts`, line 377): `{ id: string; role: "user" | "assistant"; content: string; toolUses?: ToolUseEntry[] }`. Needs `"system"` added to the role union.

`MessageBubble` renders messages. It currently assumes user or assistant roles for styling. System messages need distinct rendering (info banner, not speech bubble).

### orchestrator.ts (1000+ lines)

`buildMeetingPrepSpec` (lines 461-521) constructs the `SessionPrepSpec`. The `onCompactSummary` callback would be added here, storing the summary on a variable accessible to `iterateSession`. Since the orchestrator creates the `SessionLoopDeps` at line 526 and both `buildMeetingPrepSpec` and `iterateSession` are closures within the same orchestrator scope, a shared mutable variable (or a field on `ActiveMeetingEntry`) can hold the latest summary.

### registry.ts (50 lines)

`ActiveMeetingEntry` (lines 14-27) tracks per-meeting state. Adding `lastCompactSummary?: string` here would make the summary accessible to `iterateSession` through the `meeting` parameter. This is the cleanest approach: the orchestrator sets it in the hook callback, and `iterateSession` reads it when mapping the event.

### Commission orchestrator

`drainSdkSession` at line 1837 of `daemon/services/commission/orchestrator.ts`. The `context_compacted` event type falls through the known-event checks in `drainSdkSession` (it only checks `session`, `aborted`, `error`, `turn_end`), so it's silently ignored. No changes needed (REQ-MCC-15, REQ-MCC-16).

### Existing tests

- `tests/daemon/event-translator.test.ts`: Tests `translateSdkMessage` and `createStreamTranslator` with mock SDK messages. Provides helper patterns (`makeInitMessage`, etc.) for constructing mock messages.
- `tests/daemon/services/sdk-runner.test.ts`: Tests `runSdkSession`, `drainSdkSession`, `prepareSdkSession` with mock queryFn and DI deps.
- `tests/daemon/services/transcript.test.ts` and `tests/daemon/transcript.test.ts`: Tests transcript CRUD and `parseTranscriptMessages` parsing.

No session-loop tests exist today. The session loop is tested indirectly through the meeting orchestrator.

## Key Design Challenge: Hook-Stream Correlation

The `SDKCompactBoundaryMessage` arrives via the SDK message stream. The `PostCompact` hook fires separately in the SDK's execution loop. The spec says `summary` is optional on the `GuildHallEvent` because the two signals may arrive in different order.

**Strategy: shared mutable summary on `ActiveMeetingEntry`.**

1. The `onCompactSummary` callback (wired by the orchestrator) writes the summary to `meeting.lastCompactSummary`.
2. When `iterateSession` encounters a `context_compacted` SdkRunnerEvent, it reads `meeting.lastCompactSummary`, attaches it if present, then clears it.
3. If the hook fires first (before the boundary message), the summary is already available when the event arrives. If the boundary message arrives first, the summary is absent on the emitted event. The transcript append handles this: it writes what it has immediately.

This approach avoids buffering timeouts. The SDK's execution model is single-threaded per session, so both signals arrive within the same SDK iteration cycle. In practice, the compact_boundary message appears in the stream first (it marks the boundary in the message sequence), and the PostCompact hook fires after the SDK finishes the compaction process. So the more likely ordering is: boundary first, hook second. The summary will usually be absent on the real-time event but present in the transcript (written by the hook callback directly, see Step 5).

**Decision: The hook callback also appends the summary to the transcript.**

This decouples transcript completeness from event ordering. When the hook fires (with summary), it appends a `## Context Compacted` marker with the summary. When the boundary message fires (without summary yet), `iterateSession` emits the `context_compacted` GuildHallEvent for SSE. If the summary was already written by the hook, the transcript is complete. If not, the hook writes it when it fires. The transcript may get two markers in some orderings, but the parser handles this by producing two `system` messages (acceptable, and the second contains the summary).

**Revised approach: single marker, hook updates it.**

On reflection, two markers is messy. Simpler: `iterateSession` appends the initial transcript marker (without summary) and also emits the SSE event. The hook callback, when it fires, updates `meeting.lastCompactSummary`. A separate `appendCompactSummary` function appends just the summary blockquote. The parser sees one `## Context Compacted` heading followed by optional summary content.

Actually, the simplest approach: **only one write point.** The `iterateSession` handler appends the transcript marker. It checks `meeting.lastCompactSummary` at that moment. If present (hook fired first), the summary is included. If absent, the marker is written without summary. The hook callback, if it fires later, appends just the summary as a follow-up line. The parser collects all content between consecutive `##` headings into one message, so the late-arriving summary is still part of the same compaction message's body.

This is the approach I'll specify.

## Implementation Steps

### Step 1: Translate compact_boundary in the event translator

**Files**: `daemon/lib/agent-sdk/event-translator.ts`, `daemon/lib/agent-sdk/sdk-runner.ts`
**Addresses**: REQ-MCC-1, REQ-MCC-2, REQ-MCC-3, REQ-MCC-4, REQ-MCC-15

**1a. Add `context_compacted` to the `SdkRunnerEvent` union** in `sdk-runner.ts`:

```typescript
| { type: "context_compacted"; trigger: "manual" | "auto"; preTokens: number }
```

Add it after the `aborted` variant.

**1b. Extend `SdkSystemMessage`** in `event-translator.ts`:

```typescript
interface SdkSystemMessage {
  type: "system";
  subtype?: string;
  session_id?: string;
  compact_metadata?: {
    trigger: string;
    pre_tokens: number;
  };
}
```

**1c. Handle `compact_boundary` in `translateSystemMessage`:**

Replace the current early-return at line 202 with a two-branch structure:

```typescript
function translateSystemMessage(
  message: SdkSystemMessage,
): SdkRunnerEvent[] {
  if (message.subtype === "init") {
    return [{ type: "session", sessionId: message.session_id ?? "" }];
  }

  if (message.subtype === "compact_boundary" && message.compact_metadata) {
    return [{
      type: "context_compacted",
      trigger: message.compact_metadata.trigger === "manual" ? "manual" : "auto",
      preTokens: typeof message.compact_metadata.pre_tokens === "number"
        ? message.compact_metadata.pre_tokens
        : 0,
    }];
  }

  // status, hook_*, task_*, files_persisted remain internal.
  return [];
}
```

**1d. Update the comment** at the function to remove `compact_boundary` from the "internal" list.

This change is automatic for commissions (REQ-MCC-15): commissions use the same `runSdkSession` and `createStreamTranslator`.

### Step 2: Add PostCompact hook infrastructure to sdk-runner

**Files**: `daemon/lib/agent-sdk/sdk-runner.ts`
**Addresses**: REQ-MCC-5, REQ-MCC-6, REQ-MCC-7, REQ-MCC-8, REQ-MCC-16

**2a. Add `hooks` to `SdkQueryOptions`:**

Import the SDK hook types at the top of `sdk-runner.ts`:

```typescript
import type {
  SDKMessage,
  HookEvent,
  HookCallbackMatcher,
} from "@anthropic-ai/claude-agent-sdk";
```

Extend `SdkQueryOptions`:

```typescript
hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
```

Add after the `canUseTool` field (line 87).

**2b. Add `onCompactSummary` to `SessionPrepSpec`:**

```typescript
export type SessionPrepSpec = {
  // ... existing fields ...
  onCompactSummary?: (summary: string, trigger: "manual" | "auto") => void;
};
```

**2c. Wire the hook in `prepareSdkSession`.**

After the options object is built (line 483), conditionally add hooks:

```typescript
// 5e. Wire PostCompact hook when onCompactSummary is provided (REQ-MCC-6)
if (spec.onCompactSummary) {
  const callback = spec.onCompactSummary;
  options.hooks = {
    PostCompact: [{
      hooks: [
        async (input) => {
          const typed = input as { trigger?: string; compact_summary?: string };
          const trigger = typed.trigger === "manual" ? "manual" as const : "auto" as const;
          const summary = typeof typed.compact_summary === "string" ? typed.compact_summary : "";
          callback(summary, trigger);
          return { continue: true };
        },
      ],
    }],
  };
}
```

The cast to a local type is necessary because `HookInput` is a union of all hook input types. The `PostCompact` hook will always receive `PostCompactHookInput`, but TypeScript can't narrow this from the callback signature alone.

When `onCompactSummary` is absent (the default), no hooks are registered (REQ-MCC-8). Commission sessions never set this field (REQ-MCC-16).

### Step 3: Add `context_compacted` to `GuildHallEvent`

**File**: `daemon/types.ts`
**Addresses**: REQ-MCC-9

Add the new variant to the `GuildHallEvent` union:

```typescript
| { type: "context_compacted"; trigger: "manual" | "auto"; preTokens: number; summary?: string }
```

The `summary` field is optional: it may or may not be available when the event is emitted (depends on hook timing).

### Step 4: Wire the session loop and orchestrator

**Files**: `daemon/services/meeting/session-loop.ts`, `daemon/services/meeting/orchestrator.ts`, `daemon/services/meeting/registry.ts`
**Addresses**: REQ-MCC-10, REQ-MCC-11

**4a. Add `lastCompactSummary` to `ActiveMeetingEntry`** in `registry.ts`:

```typescript
export type ActiveMeetingEntry = {
  // ... existing fields ...
  /** Most recent compact summary from PostCompact hook, consumed by iterateSession. */
  lastCompactSummary?: string;
};
```

**4b. Handle `context_compacted` in `iterateSession`** in `session-loop.ts`.

Add a case before the else-passthrough block (line 125):

```typescript
if (event.type === "context_compacted") {
  const summary = meeting.lastCompactSummary;
  meeting.lastCompactSummary = undefined; // consume
  yield {
    type: "context_compacted",
    trigger: event.trigger,
    preTokens: event.preTokens,
    ...(summary ? { summary } : {}),
  };
}
```

Also add the transcript append in this block (see Step 5 for the function signature):

```typescript
if (event.type === "context_compacted") {
  const summary = meeting.lastCompactSummary;
  meeting.lastCompactSummary = undefined;

  // Append compaction marker to transcript (REQ-MCC-12)
  await appendCompactionMarkerSafe(
    meeting.meetingId as string,
    event.trigger,
    event.preTokens,
    summary,
    deps.guildHallHome,
  );

  yield {
    type: "context_compacted",
    trigger: event.trigger,
    preTokens: event.preTokens,
    ...(summary ? { summary } : {}),
  };
}
```

Import the new function from `transcript.ts`.

**4c. Wire `onCompactSummary` in `buildMeetingPrepSpec`** in `orchestrator.ts`.

In the `buildMeetingPrepSpec` function (line 461), add the callback to the `SessionPrepSpec`:

```typescript
const spec: SessionPrepSpec = {
  // ... existing fields ...
  onCompactSummary: (summary, _trigger) => {
    meeting.lastCompactSummary = summary;
  },
};
```

The `meeting` parameter is the `ActiveMeetingEntry` passed to `buildMeetingPrepSpec`. The callback stores the summary where `iterateSession` can read it.

**4d. Handle late-arriving summary.**

If the PostCompact hook fires after the boundary message has already been processed by `iterateSession` (less likely but possible), the summary arrives too late for the SSE event. To handle this, the hook callback should also append the summary to the transcript directly:

```typescript
onCompactSummary: (summary, _trigger) => {
  meeting.lastCompactSummary = summary;
  // If the boundary event already fired and consumed the summary,
  // append it as a follow-up line in the transcript.
  // appendCompactSummarySafe is a fire-and-forget append.
  void appendCompactSummarySafe(
    meeting.meetingId as string,
    summary,
    ghHome,
  );
},
```

Wait. This creates a race: both `iterateSession` and the hook callback write to the transcript. The approach needs to be cleaner.

**Revised approach:** The hook callback only stores the summary. The transcript write happens only in `iterateSession`. If the summary is absent at that point, the marker is written without it. To get the summary into the transcript when it arrives late, add a second check: after the `for await` loop in `iterateSession` completes (line 129), if `meeting.lastCompactSummary` is non-null, append a summary-only follow-up to the transcript.

This is simpler. The hook sets the field, `iterateSession` reads it at two points:
1. During the `context_compacted` event (immediate).
2. After the loop ends (cleanup for late arrivals).

```typescript
// After appendAssistantTurnSafe (line 133), before return:
if (meeting.lastCompactSummary) {
  await appendCompactSummarySafe(
    meeting.meetingId as string,
    meeting.lastCompactSummary,
    deps.guildHallHome,
  );
  meeting.lastCompactSummary = undefined;
}
```

### Step 5: Transcript persistence

**Files**: `daemon/services/meeting/transcript.ts`, `lib/meetings.ts`
**Addresses**: REQ-MCC-12, REQ-MCC-13

**5a. Add `appendCompactionMarker` function** to `transcript.ts`:

```typescript
export async function appendCompactionMarker(
  meetingId: string,
  trigger: "manual" | "auto",
  preTokens: number,
  summary: string | undefined,
  guildHallHome?: string,
): Promise<void> {
  validateMeetingId(meetingId);
  const filePath = transcriptPath(meetingId, guildHallHome);
  const timestamp = new Date().toISOString();

  let section = `\n## Context Compacted (${timestamp})\n\n`;
  section += `Context was compressed (${trigger}, ${preTokens} tokens before compaction).\n`;

  if (summary) {
    section += `\n> Summary: ${summary}\n`;
  }

  await fs.appendFile(filePath, section, "utf-8");
}
```

**5b. Add `appendCompactionMarkerSafe` wrapper** (same pattern as `appendAssistantTurnSafe`):

```typescript
export async function appendCompactionMarkerSafe(
  meetingId: string,
  trigger: "manual" | "auto",
  preTokens: number,
  summary: string | undefined,
  guildHallHome: string,
  log: Log = nullLog("transcript"),
): Promise<void> {
  try {
    await appendCompactionMarker(meetingId, trigger, preTokens, summary, guildHallHome);
  } catch (err: unknown) {
    log.warn(`Transcript compaction marker failed for meeting ${meetingId} (non-fatal): ${errorMessage(err)}`);
  }
}
```

**5c. Add `appendCompactSummarySafe`** for late-arriving summaries:

```typescript
export async function appendCompactSummarySafe(
  meetingId: string,
  summary: string,
  guildHallHome: string,
  log: Log = nullLog("transcript"),
): Promise<void> {
  try {
    validateMeetingId(meetingId);
    const filePath = transcriptPath(meetingId, guildHallHome);
    const section = `\n> Summary: ${summary}\n`;
    await fs.appendFile(filePath, section, "utf-8");
  } catch (err: unknown) {
    log.warn(`Transcript compact summary append failed for meeting ${meetingId} (non-fatal): ${errorMessage(err)}`);
  }
}
```

**5d. Extend `TranscriptMessage` role union:**

```typescript
export type TranscriptMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  toolUses?: ToolUseEntry[];
  timestamp: string;
};
```

**5e. Update `parseTranscriptMessages` to handle `## Context Compacted` headings.**

Extend the heading regex:

```typescript
const headingPattern = /^## (User|Assistant|Context Compacted) \(([^)]+)\)\s*$/gm;
```

In the heading loop, map "Context Compacted" to role `"system"`:

```typescript
headings.push({
  role: match[1] === "Context Compacted"
    ? "system" as const
    : match[1].toLowerCase() as "user" | "assistant",
  timestamp: match[2],
  index: match.index,
  length: match[0].length,
});
```

In the body extraction loop, handle the system role:

```typescript
if (heading.role === "system") {
  messages.push({
    role: "system",
    content: body,
    timestamp: heading.timestamp,
  });
} else if (heading.role === "assistant") {
  // ... existing assistant handling
}
```

**5f. Update `truncateTranscript`** to recognize `## Context Compacted` headings:

```typescript
const turnPattern = /^(## (?:User|Assistant|Context Compacted) \([^)]+\))/m;
```

**5g. Update the parallel parser in `lib/meetings.ts`.**

Extend `TranscriptChatMessage` role union:

```typescript
export interface TranscriptChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  // ...
}
```

Extend `parseTranscriptToMessages` heading regex and role mapping to match the daemon's parser changes (5e).

### Step 6: Web UI rendering

**Files**: `web/components/meeting/ChatInterface.tsx`, `lib/types.ts`, `web/components/meeting/MessageBubble.tsx` (or new `CompactionBanner` component), `web/components/meeting/ChatInterface.module.css`
**Addresses**: REQ-MCC-14

**6a. Extend `ChatMessage` role union** in `lib/types.ts`:

```typescript
export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  toolUses?: ToolUseEntry[];
};
```

**6b. Add `context_compacted` case in the SSE handler** in `ChatInterface.tsx` (line 234):

```typescript
case "context_compacted": {
  const trigger = event.trigger as string;
  const preTokens = event.preTokens as number;
  const summary = event.summary as string | undefined;

  let content = `Context was compressed (${trigger}, ${preTokens.toLocaleString()} tokens before compaction).`;
  if (summary) {
    content += `\n\n${summary}`;
  }

  const systemMessage: ChatMessage = {
    id: generateId(),
    role: "system",
    content,
  };
  setMessages((prev) => [...prev, systemMessage]);
  break;
}
```

This inserts the system message immediately. It does not wait for `turn_end` because compaction is a system event, not part of the assistant's response.

**6c. Audit exhaustive role checks.**

Before adding the system rendering path, grep for patterns matching `role === "user"` and `role === "assistant"` across `web/` and `lib/`. Any code that checks both roles without an else clause for other values will silently skip system messages at runtime (TypeScript won't catch this because string comparison isn't exhaustive). Fix any such sites to handle the `"system"` case.

**6e. Handle system role in `MessageBubble`.**

Check the current `MessageBubble` component to see how it handles roles. Add a system message rendering path. System messages should render as a centered info banner with a distinct background (e.g., `var(--color-parchment)` with a border), smaller text, and no portrait.

If the summary is present, render it in a `<details>` element:

```tsx
if (message.role === "system") {
  return (
    <div className={styles.systemMessage}>
      <p className={styles.systemText}>{firstLine}</p>
      {restOfContent && (
        <details className={styles.systemDetails}>
          <summary>Compaction summary</summary>
          <p>{restOfContent}</p>
        </details>
      )}
    </div>
  );
}
```

The exact split between `firstLine` and `restOfContent` uses the first `\n\n` boundary.

**6f. Add CSS for system messages** in `ChatInterface.module.css` (or `MessageBubble.module.css`, depending on where the rendering lives):

```css
.systemMessage {
  text-align: center;
  padding: var(--space-sm) var(--space-md);
  margin: var(--space-sm) 0;
  border: 1px solid var(--color-brass);
  border-radius: 4px;
  background: color-mix(in srgb, var(--color-parchment) 30%, transparent);
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.systemDetails {
  margin-top: var(--space-xs);
  text-align: left;
}
```

**6g. Handle system messages in transcript resume.**

The meeting page loads transcript history via `parseTranscriptToMessages` from `lib/meetings.ts`. Since Step 5g extends that function to produce system role messages, the transcript-based `initialMessages` prop already includes compaction events on page reload. The `ChatInterface` and `MessageBubble` components handle them via the role check added in 6c.

### Step 7: Tests

**Addresses**: All REQs (validation coverage)

**7a. Event translator tests** (`tests/daemon/event-translator.test.ts`):

Add a helper to construct mock compact_boundary messages:

```typescript
function makeCompactBoundaryMessage(trigger: "manual" | "auto", preTokens: number): SDKMessage {
  return {
    type: "system",
    subtype: "compact_boundary",
    compact_metadata: { trigger, pre_tokens: preTokens },
  } as unknown as SDKMessage;
}
```

Test cases:
1. `translateSdkMessage` with compact_boundary returns `[{ type: "context_compacted", trigger: "auto", preTokens: 95000 }]`.
2. `translateSdkMessage` with compact_boundary and `trigger: "manual"` returns `trigger: "manual"`.
3. `createStreamTranslator()` passes compact_boundary through (delegates to stateless path).
4. System messages with `subtype: "status"` still return `[]`.
5. System messages with `subtype: "hook_complete"` still return `[]`.
6. Compact_boundary with missing `compact_metadata` returns `[]` (defensive).

**7b. SDK runner tests** (`tests/daemon/services/sdk-runner.test.ts`):

Test cases for `prepareSdkSession`:
1. When `onCompactSummary` is provided in `SessionPrepSpec`, the resulting `SdkQueryOptions` contains a `hooks` entry with `PostCompact` key.
2. When `onCompactSummary` is absent, the resulting `SdkQueryOptions` has no `hooks` field.
3. The PostCompact hook callback invokes `onCompactSummary` with the correct summary and trigger.

Test cases for `drainSdkSession`:
4. A generator yielding `context_compacted` completes without error (passthrough test for REQ-MCC-15).

**7c. Transcript tests** (`tests/daemon/services/transcript.test.ts`):

Test cases:
1. `appendCompactionMarker` writes a `## Context Compacted (timestamp)` section with trigger and token count.
2. `appendCompactionMarker` includes summary when provided.
3. `appendCompactionMarker` omits summary blockquote when summary is undefined.
4. `parseTranscriptMessages` recognizes `## Context Compacted` headings and produces `role: "system"` messages.
5. `parseTranscriptMessages` with compaction markers interleaved with user/assistant turns produces correctly ordered messages.
6. `truncateTranscript` preserves `## Context Compacted` turn boundaries.

**7d. Parallel parser tests** (`tests/lib/meetings.test.ts` or existing test file for `lib/meetings.ts`):

Test cases:
1. `parseTranscriptToMessages` recognizes `## Context Compacted` headings and produces `role: "system"` messages.
2. `parseTranscriptToMessages` with compaction markers interleaved with user/assistant turns produces correctly ordered messages with correct role values.
3. System messages have no `toolUses` (unlike assistant messages).

**7e. Post-loop cleanup test** (in `tests/daemon/services/sdk-runner.test.ts` or a new session-loop test file):

Test the edge case where `meeting.lastCompactSummary` is non-null after the `for await` loop exits (simulating a late-arriving PostCompact hook). Verify that `appendCompactSummarySafe` is called with the summary and the field is cleared.

**7f. GuildHallEvent type test** (compile-time):

The `context_compacted` variant on `GuildHallEvent` is verified by TypeScript compilation. Any type error in the session loop or SSE handler would surface at build time.

**7g. ChatInterface test** (if render tests exist, otherwise compile-time):

Verify that `ChatMessage` with `role: "system"` is accepted by the component props. If `MessageBubble` has tests, add a case for system role rendering.

### Step 8: Validate against spec

Launch a review sub-agent that reads the spec at `.lore/specs/meetings/meeting-context-compaction.md`, reviews all modified files, and flags any requirements not met. Check:

- All 16 REQs addressed
- Event translator handles compact_boundary (REQ-MCC-1 through MCC-4)
- Hook is registered only for meetings, not commissions (REQ-MCC-6, MCC-8, MCC-16)
- Transcript contains compaction markers (REQ-MCC-12)
- Parser produces system role messages (REQ-MCC-13)
- ChatInterface renders compaction events (REQ-MCC-14)
- Commission sessions pass through without error (REQ-MCC-15)
- Existing tests still pass

## File Change Summary

| File | Change | Steps |
|------|--------|-------|
| `daemon/lib/agent-sdk/event-translator.ts` | Handle compact_boundary in `translateSystemMessage`, extend `SdkSystemMessage` | 1 |
| `daemon/lib/agent-sdk/sdk-runner.ts` | Add `context_compacted` to `SdkRunnerEvent`, `hooks` to `SdkQueryOptions`, `onCompactSummary` to `SessionPrepSpec`, wire hook in `prepareSdkSession` | 1, 2 |
| `daemon/types.ts` | Add `context_compacted` to `GuildHallEvent` | 3 |
| `daemon/services/meeting/registry.ts` | Add `lastCompactSummary` to `ActiveMeetingEntry` | 4 |
| `daemon/services/meeting/session-loop.ts` | Handle `context_compacted` in `iterateSession`, append transcript marker, post-loop summary cleanup | 4 |
| `daemon/services/meeting/orchestrator.ts` | Wire `onCompactSummary` callback in `buildMeetingPrepSpec` | 4 |
| `daemon/services/meeting/transcript.ts` | Add `appendCompactionMarker[Safe]`, `appendCompactSummarySafe`, extend `TranscriptMessage` role, update parser and truncator | 5 |
| `lib/meetings.ts` | Extend `TranscriptChatMessage` role, update `parseTranscriptToMessages` | 5 |
| `lib/types.ts` | Extend `ChatMessage` role to include `"system"` | 6 |
| `web/components/meeting/ChatInterface.tsx` | Handle `context_compacted` SSE event | 6 |
| `web/components/meeting/MessageBubble.tsx` | Render system role messages as info banner | 6 |
| CSS (MessageBubble or ChatInterface module) | `.systemMessage`, `.systemDetails` styles | 6 |
| `tests/daemon/event-translator.test.ts` | compact_boundary translation tests | 7 |
| `tests/daemon/services/sdk-runner.test.ts` | Hook wiring and passthrough tests | 7 |
| `tests/daemon/services/transcript.test.ts` | Compaction marker write/parse tests | 7 |
| `tests/lib/meetings.test.ts` (or existing) | Parallel parser compaction tests | 7 |

16 files total. No new source files (only new exports in existing modules). Three test files expanded.

## Delegation Guide

**Dalton implements Steps 1 through 7.** The work spans daemon infrastructure (event translator, sdk-runner, session loop, transcript) and web UI (ChatInterface, MessageBubble). All layers follow existing patterns with no new architectural decisions.

Implementation order matters: Steps 1-3 are independent type/function additions. Step 4 depends on Steps 1-3. Step 5 is independent of Step 4 (transcript functions are standalone). Step 6 depends on Step 3 (GuildHallEvent type) and Step 5 (transcript parser). Step 7 runs last. Recommended sequence: 1, 2, 3, 5, 4, 6, 7.

**Thorne reviews after Step 7.** Single post-completion review. Review scope:

- Spec compliance: all 16 REQs addressed, no drift
- Event translator: compact_boundary handled, other subtypes still dropped, comment updated
- Hook wiring: only registered when `onCompactSummary` is present, returns `{ continue: true }`, type cast is safe
- Hook-stream correlation: `lastCompactSummary` on `ActiveMeetingEntry` is consumed correctly, post-loop cleanup for late arrivals
- Transcript: marker format matches spec, parser handles `## Context Compacted` headings, `truncateTranscript` regex extended
- `lib/meetings.ts` parallel parser updated (easy to miss)
- ChatMessage role union extended in `lib/types.ts` (shared type, affects both daemon and web)
- MessageBubble system role rendering: info banner, not speech bubble, `<details>` for summary
- Commission passthrough: `drainSdkSession` ignores unknown event types
- Exhaustive role checks audited (Step 6c grep)
- Tests cover: translator (6 cases), sdk-runner (4 cases), transcript (6 cases), parallel parser (3 cases), post-loop cleanup (1 case)

Single review is sufficient. The feature touches many files but the changes are shallow (type extensions, new switch cases, one new transcript function, one CSS class).

## Scope Estimate

Medium feature. The event translator and type changes are small (~30 lines). The hook wiring is ~20 lines. The session loop changes are ~30 lines. The transcript additions are ~60 lines. The web UI changes are ~50 lines. Tests are ~150 lines.

Total: ~340 lines of new/modified code across 15 files. Single commission for implementation, single commission for review.

## Risks

**SDK hook callback type safety.** The `HookCallback` receives `HookInput` (a union of all hook input types). We cast to access `PostCompactHookInput` fields. If the SDK changes the hook input shape, the cast would silently produce undefined fields. Mitigation: runtime type checks on `compact_summary` and `trigger` (present in Step 2c).

**Hook execution model.** The plan assumes the PostCompact hook fires synchronously within the SDK's execution loop (same thread as the stream iteration). If it fires on a separate microtask, the `lastCompactSummary` field might not be set when `iterateSession` reads it. Mitigation: the post-loop cleanup (Step 4d) catches late arrivals for transcript purposes. The SSE event's `summary` field is optional by spec, so a missing summary on the real-time event is acceptable.

**Transcript parser regex.** The extended regex `## (User|Assistant|Context Compacted)` captures "Context Compacted" as a single group. If the heading format changes (e.g., lowercase, different wording), the parser breaks for compaction entries. Mitigation: the heading format is defined by `appendCompactionMarker`, which is in the same file. Changes to one require updating the other.

**ChatMessage role union widening.** Adding `"system"` to `ChatMessage.role` in `lib/types.ts` affects all consumers. Any code that exhaustively checks `role === "user" | "assistant"` without an else clause will miss system messages at runtime (no TypeScript error because string comparison is non-exhaustive). Mitigation: grep for `role === "user"` and `role === "assistant"` patterns to find exhaustive checks.

**Parallel parser in lib/meetings.ts.** This file has its own transcript parser (`parseTranscriptToMessages`) that mirrors the daemon's `parseTranscriptMessages`. Both must be updated. If only the daemon parser is updated, the web UI's transcript resume path will silently drop compaction markers from the initial message list. Mitigation: Step 5g explicitly calls this out. The review should verify both parsers handle `## Context Compacted`.

## Open Questions

None. The spec is detailed enough to implement directly. The hook-stream correlation strategy (shared mutable field on `ActiveMeetingEntry` with post-loop cleanup) is the simplest approach that handles both arrival orderings without buffering timeouts.
