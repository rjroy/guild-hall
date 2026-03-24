---
title: "SDK Context Compaction: Detection and Surfacing"
status: active
Date: 2026-03-22
tags: [agent-sdk, context-compaction, meetings, ux]
---

# SDK Context Compaction: Detection and Surfacing

## Summary

The Claude Agent SDK has three mechanisms that surface context compaction. Guild Hall currently ignores all of them. Two require no SDK changes to use; one requires a code change to the event translator.

## Research Questions and Findings

### 1. Does the SDK emit any event when context compaction occurs?

**Yes. Three distinct signals.**

**Signal A: `SDKCompactBoundaryMessage`** (stream message)

```typescript
// sdk.d.ts line 1666
type SDKCompactBoundaryMessage = {
  type: 'system';
  subtype: 'compact_boundary';
  compact_metadata: {
    trigger: 'manual' | 'auto';
    pre_tokens: number;
    preserved_segment?: {
      head_uuid: UUID;
      anchor_uuid: UUID;
      tail_uuid: UUID;
    };
  };
};
```

This message appears in the `SDKMessage` stream. It is part of the `SDKMessage` union type (`sdk.d.ts:1997`). The `trigger` field distinguishes user-initiated compaction (`manual`) from automatic compaction when context limits are hit (`auto`). `pre_tokens` indicates the token count before compaction.

**Verified:** The event translator at `daemon/lib/agent-sdk/event-translator.ts:200-204` explicitly drops this message:

```typescript
// The SDK uses "system" for multiple subtypes. Only "init" maps to a
// Guild Hall event; compact_boundary, status, hook_*, task_*, and
// files_persisted are internal.
if (message.subtype !== "init") {
  return [];
}
```

**Confidence: High** (verified against SDK type definitions and Guild Hall source code).

**Signal B: `SDKStatusMessage` with `status: 'compacting'`** (stream message)

```typescript
// sdk.d.ts line 2226-2234
type SDKStatus = 'compacting' | null;

type SDKStatusMessage = {
  type: 'system';
  subtype: 'status';
  status: SDKStatus;
  permissionMode?: PermissionMode;
  uuid: UUID;
  session_id: string;
};
```

This is a separate system message that signals the SDK has entered the compacting state. It is emitted *before* the compact_boundary message. The `null` status value presumably signals the return to normal operation. Also dropped by the same guard at `event-translator.ts:202`.

**Confidence: High** (verified against SDK types). The sequencing (status first, boundary after) is inferred from the type names; I did not trace it in the minified SDK source.

**Signal C: `PreCompact` and `PostCompact` hooks** (hook callbacks)

```typescript
// sdk.d.ts line 1343-1347
type PreCompactHookInput = BaseHookInput & {
  hook_event_name: 'PreCompact';
  trigger: 'manual' | 'auto';
  custom_instructions: string | null;
};

// sdk.d.ts line 1306-1313
type PostCompactHookInput = BaseHookInput & {
  hook_event_name: 'PostCompact';
  trigger: 'manual' | 'auto';
  compact_summary: string;  // The summary produced by compaction
};
```

Both hooks are part of the `HookEvent` union (`sdk.d.ts:485`). Hooks are configured via the `hooks` option in `SdkQueryOptions`. Guild Hall does not currently pass any hooks to the SDK.

**Confidence: High** (verified against SDK types).

### 2. Is there a way to hook into or observe the compaction process?

**Yes. Two independent approaches:**

**Approach A: Translate stream messages.** The `SDKCompactBoundaryMessage` and `SDKStatusMessage` already flow through the SDK message generator that `runSdkSession` iterates. The event translator just needs to emit a new `SdkRunnerEvent` type instead of returning `[]`.

**Approach B: Register SDK hooks.** The `hooks` option in `SdkQueryOptions` accepts `PreCompact` and `PostCompact` callbacks. These fire synchronously in the SDK's execution loop. The `PostCompact` hook receives the `compact_summary`, which is the LLM-generated summary of what was compressed.

Both approaches can be used simultaneously. The stream messages give timing; the hooks give the summary content.

### 3. What information is lost vs preserved during compaction?

**What is preserved** (from type analysis):
- The `compact_summary` (from `PostCompactHookInput`): an LLM-generated summary of the compressed conversation
- A `preserved_segment` (from `SDKCompactBoundaryMessage`): recent messages identified by UUIDs that are kept verbatim. The SDK's comment says "suffix-preserving" and "prefix-preserving partial compact," indicating it keeps recent messages and summarizes older ones.
- System prompt and tool definitions (these are outside the conversation and not subject to compaction)

**What is lost:**
- Exact wording of earlier messages
- Tool call details from earlier turns
- Nuance and context that the summary model doesn't capture
- Any information the LLM considers less important during summarization

The `pre_tokens` field on the boundary message tells you how many tokens existed before compaction, which gives a rough measure of how much was compressed.

**Confidence: Medium.** The type definitions describe the metadata shape. The actual summarization behavior (what the LLM keeps vs discards) is internal to the SDK and not documented in the types. The "suffix-preserving" comment suggests recent messages are kept verbatim, but I cannot verify the exact algorithm from the minified source.

### 4. Are there SDK configuration options that control compaction behavior?

**Limited.**

- **`betas: ['context-1m-2025-08-07']`** (`sdk.d.ts:886-891`): Enables 1M token context window for Sonnet 4/4.5. This delays compaction by raising the ceiling. Only works with specific models.
- **`PreCompact` hook with `custom_instructions`** (`sdk.d.ts:1346`): The hook input includes a `custom_instructions` field, suggesting the SDK may accept custom instructions for how the summary should be generated. However, I cannot confirm whether a hook response can modify the summary instructions; the hook output type is the generic `HookJSONOutput`.
- **No threshold configuration.** The SDK types do not expose a "compact at X% of context" setting. Compaction timing appears to be internal.
- **No strategy selection.** There is no option to choose between different compaction algorithms (e.g., "aggressive" vs "conservative").

**Confidence: Medium.** The beta flag is documented. The absence of configuration options is a negative finding (absence of evidence, not evidence of absence in the minified source).

### 5. Could we intercept compaction to persist a summary or notify the user?

**Yes. This is feasible with current SDK capabilities.**

The `PostCompact` hook receives the `compact_summary` string. A hook callback can:
1. Persist the summary to the meeting's state
2. Emit an event on the EventBus so the web UI can display a notification
3. Inject the summary into the meeting transcript

The `SDKCompactBoundaryMessage` in the stream provides the timing and token metadata, which can trigger a UI indicator.

## Current Guild Hall Behavior

All three compaction signals are silently dropped:

1. **Stream messages** (`compact_boundary`, `status`): Dropped at `event-translator.ts:202` because `subtype !== "init"`.
2. **Hooks**: Not configured. `prepareSdkSession` in `sdk-runner.ts` does not pass a `hooks` option.

The user gets no indication that compaction occurred. From their perspective, the Guild Master simply starts forgetting things.

## Recommendations

Four options, from least to most effort. They are not mutually exclusive.

### Option 1: Surface compact_boundary as a stream event (smallest change)

Add a new `SdkRunnerEvent` type:

```typescript
| { type: "context_compacted"; trigger: 'manual' | 'auto'; preTokens: number }
```

In `event-translator.ts`, translate `compact_boundary` system messages into this event. The meeting orchestrator maps it to a `GuildHallEvent`, and the web UI renders it as a system message in the meeting stream (e.g., "Context was compressed. Earlier messages have been summarized.").

**Tradeoff:** Minimal code change, but no access to the summary content. The user knows it happened but not what was lost.

### Option 2: Register PostCompact hook to capture the summary

In `prepareSdkSession`, add a `PostCompact` hook callback that:
1. Persists `compact_summary` to the meeting's state directory
2. Emits an EventBus event with the summary text

The web UI can display the summary in a collapsible panel, letting users see what the SDK thinks the conversation covered.

**Tradeoff:** More useful than Option 1 (users can read the summary), but requires adding hook infrastructure to `SdkQueryOptions` building. The `hooks` option is already typed in the SDK; Guild Hall just doesn't use it yet.

### Option 3: Surface the compacting status for a real-time indicator

Translate the `SDKStatusMessage` with `status: 'compacting'` into a status event. The web UI can show a spinner or banner ("Summarizing conversation...") while compaction is in progress, then clear it when `status: null` arrives.

**Tradeoff:** Nice UX polish, but only useful alongside Option 1 or 2. On its own, a spinner that says "compacting" without explanation is confusing.

### Option 4: Use the beta 1M context to delay compaction

Pass `betas: ['context-1m-2025-08-07']` in `SdkQueryOptions` for meeting sessions that use Sonnet 4.x models. This roughly 5x the context window, making compaction much less likely for typical meeting lengths.

**Tradeoff:** Only works for Sonnet models (not Opus or Haiku). Doesn't eliminate the need for compaction detection; it just reduces frequency. Higher API costs due to larger context. The beta may be superseded or change behavior.

### Recommended combination

Options 1 + 2 together give the best coverage for the stated problem. Option 1 is the minimum viable change (a few lines in the event translator + a new event type). Option 2 adds the summary content that makes the notification actually useful. Option 3 is polish that can follow. Option 4 is orthogonal and model-dependent.

## Source Index

| Claim | Source | Confidence |
|-------|--------|------------|
| `SDKCompactBoundaryMessage` type and fields | `sdk.d.ts:1666-1679` | High (type definition) |
| `SDKStatusMessage` with `compacting` status | `sdk.d.ts:2226-2234` | High (type definition) |
| `PreCompact`/`PostCompact` hook types | `sdk.d.ts:1306-1347` | High (type definition) |
| `compact_summary` available in PostCompact | `sdk.d.ts:1310-1312` | High (type definition) |
| `betas` option for 1M context | `sdk.d.ts:886-891` | High (type definition) |
| Event translator drops compact_boundary | `event-translator.ts:200-204` | High (source code) |
| No hooks currently configured | `sdk-runner.ts` (full file review) | High (source code) |
| Compaction summarizes old, preserves recent | `sdk.d.ts:1673` comment | Medium (JSDoc comment, not verified in runtime) |
| No threshold/strategy configuration | Absence in `sdk.d.ts` | Medium (negative finding) |
