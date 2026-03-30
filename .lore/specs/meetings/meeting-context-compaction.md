---
title: Meeting context compaction detection and surfacing
date: 2026-03-23
status: implemented
tags: [meetings, agent-sdk, context-compaction, ux, observability]
modules: [event-translator, sdk-runner, session-loop, meeting-orchestrator, chat-interface]
related:
  - .lore/research/sdk-context-compaction.md
  - .lore/specs/meetings/meeting-infrastructure-convergence.md
  - .lore/specs/meetings/guild-hall-meetings.md
  - .lore/specs/infrastructure/daemon-application-boundary.md
req-prefix: MCC
---

# Spec: Meeting Context Compaction Detection and Surfacing

## Overview

The Claude Agent SDK performs context compaction when a session approaches the model's token limit. It summarizes older conversation turns and continues with the compressed context. Guild Hall currently drops all three compaction signals silently (research: `.lore/research/sdk-context-compaction.md`). The user gets no indication that compaction occurred, which means the Guild Master or worker starts losing nuance in earlier turns and the user has no way to know why responses changed quality.

This spec adds compaction detection and surfacing so that:
1. The user sees when compaction happens during a meeting.
2. The user can read what the SDK's summary preserved.
3. The compaction event is recorded in the meeting transcript for later review.

## Scope

Two SDK signals are surfaced:

- **`SDKCompactBoundaryMessage`** (stream message with `subtype: 'compact_boundary'`): Provides timing, trigger type (`manual` or `auto`), and pre-compaction token count. Already flows through the event translator; currently dropped at `event-translator.ts:202`.

- **`PostCompact` hook** (callback with `compact_summary`): Provides the LLM-generated summary of what was compressed. Requires registering a hook callback in `SdkQueryOptions`, which Guild Hall does not currently do.

Out of scope:
- `SDKStatusMessage` with `status: 'compacting'` (Option 3 from research). This is UX polish (a "compacting..." spinner) that can follow as a separate change.
- The `betas: ['context-1m-2025-08-07']` option (Option 4 from research). Model-dependent configuration decision, orthogonal to detection.

## Entry Points

- Existing meeting SSE stream (`GET /events`): gains a new `context_compacted` event type.
- Existing meeting transcript: gains compaction markers in the written record.

## Requirements

### Event Translator: Translate compact_boundary

- REQ-MCC-1: The event translator emits a new `SdkRunnerEvent` variant when it encounters a system message with `subtype: 'compact_boundary'`. The event carries the trigger type (`'manual' | 'auto'`) and the pre-compaction token count (`preTokens: number`).

- REQ-MCC-2: The new event type is `context_compacted`. It is added to the `SdkRunnerEvent` union in `sdk-runner.ts`:

  ```typescript
  | { type: "context_compacted"; trigger: "manual" | "auto"; preTokens: number }
  ```

- REQ-MCC-3: The `SdkSystemMessage` local type projection in `event-translator.ts` is extended with optional fields for the compact metadata (`compact_metadata?: { trigger: string; pre_tokens: number }`). The `translateSystemMessage` function handles `subtype === 'compact_boundary'` as a second case alongside the existing `subtype === 'init'` path.

- REQ-MCC-4: System messages with subtypes other than `'init'` and `'compact_boundary'` continue to return empty arrays. The existing comment listing dropped subtypes is updated to remove `compact_boundary` from the "internal" list.

### PostCompact Hook: Capture the Summary

- REQ-MCC-5: `prepareSdkSession` in `sdk-runner.ts` accepts an optional `onCompactSummary` callback in `SessionPrepSpec`. The callback signature is `(summary: string, trigger: 'manual' | 'auto') => void`.

- REQ-MCC-6: When `onCompactSummary` is provided, `prepareSdkSession` constructs a `hooks` entry in the `SdkQueryOptions` that registers a `PostCompact` hook. The hook callback invokes `onCompactSummary` with the `compact_summary` and `trigger` fields from `PostCompactHookInput`.

- REQ-MCC-7: The `SdkQueryOptions` type in `sdk-runner.ts` is extended with an optional `hooks` field. The type is `Partial<Record<HookEvent, HookCallbackMatcher[]>>`, imported from `@anthropic-ai/claude-agent-sdk`. The hook callback must return `Promise<HookJSONOutput>` (returning `{ continue: true }` for PostCompact). The `onCompactSummary` callback in MCC-5 is Guild Hall's internal interface; the `prepareSdkSession` implementation wraps it in an SDK-compatible `HookCallback` that extracts fields from `PostCompactHookInput` and returns the required `HookJSONOutput`.

- REQ-MCC-8: When `onCompactSummary` is not provided (the default), no hooks are registered. Existing behavior is unchanged. Commission sessions do not provide this callback unless explicitly opted in (see REQ-MCC-15).

### Session Loop: Map to GuildHallEvent

- REQ-MCC-9: The `GuildHallEvent` union in `daemon/types.ts` gains a new variant:

  ```typescript
  | { type: "context_compacted"; trigger: "manual" | "auto"; preTokens: number; summary?: string }
  ```

  The `summary` field is optional because the stream event (REQ-MCC-1) arrives before the hook callback (REQ-MCC-5) delivers the summary. The two are correlated by timing within the same turn.

- REQ-MCC-10: The `iterateSession` function in `session-loop.ts` maps the `SdkRunnerEvent` `context_compacted` event to the `GuildHallEvent` `context_compacted` event, decorating it with the meeting context. If a compact summary has been captured by the hook callback for this session, it is attached to the event.

- REQ-MCC-11: The meeting orchestrator wires the `onCompactSummary` callback into the `SessionPrepSpec` when building the meeting prep spec. The callback stores the most recent summary on the `ActiveMeetingEntry` (or a local variable scoped to the session loop) so `iterateSession` can attach it to the `context_compacted` GuildHallEvent.

### Transcript Persistence

- REQ-MCC-12: When a `context_compacted` event is encountered during `iterateSession`, a compaction marker is appended to the meeting transcript. The marker format is:

  ```
  ## Context Compacted (2026-03-23T14:30:00.000Z)

  Context was compressed (auto, 95000 tokens before compaction).

  > Summary: <compact_summary text if available>
  ```

  This uses the same file-append pattern as `appendAssistantTurn` and `appendUserTurn`. The summary blockquote is omitted if no summary was captured yet (the hook may fire slightly after the boundary message).

- REQ-MCC-13: The transcript parser (`parseTranscriptMessages` in `transcript.ts`) recognizes `## Context Compacted` headings and produces a `TranscriptMessage` with a new role value or a dedicated type. This allows the web UI to render compaction events distinctly from user and assistant turns when displaying transcript history.

  Decision: Add a `'system'` role to `TranscriptMessage` rather than a separate type. This keeps the message array homogeneous and lets the UI handle it as a rendering variant. The `TranscriptMessage` type becomes:

  ```typescript
  export type TranscriptMessage = {
    role: "user" | "assistant" | "system";
    content: string;
    toolUses?: ToolUseEntry[];
    timestamp: string;
  };
  ```

### Web UI Rendering

- REQ-MCC-14: The `ChatInterface` component in `web/components/meeting/ChatInterface.tsx` handles the `context_compacted` SSE event. When received, it inserts a system message into the chat message list with a visual indicator that compaction occurred. The message shows:
  - A brief label: "Context was compressed" (with trigger type and token count).
  - If a summary is present: an expandable section (e.g., `<details>`) showing the compact summary text.

  The system message is visually distinct from user and assistant messages (different background, smaller text, or an info-style banner). The exact styling is left to implementation.

### Commission Sessions

- REQ-MCC-15: Commission sessions emit the `context_compacted` `SdkRunnerEvent` from the event translator (this is automatic from REQ-MCC-1, since commissions use the same `runSdkSession` and `createStreamTranslator`). The commission orchestrator's `drainSdkSession` does not need to handle this event specially; it falls through as an unrecognized event type and is ignored.

- REQ-MCC-16: Commission sessions do not register the `PostCompact` hook callback by default. The `onCompactSummary` field on `SessionPrepSpec` is not populated for commissions. Rationale: commissions are non-interactive. The user cannot act on the information during the session. The compaction event still appears in the SDK debug log (via `logSdkMessage`). If future work wants compaction in the commission timeline, it can opt in by providing the callback.

## Design Decisions

**Compact summary in transcript (permanent record) vs. transient UI notification.**
Both. The `context_compacted` GuildHallEvent provides real-time notification via SSE (REQ-MCC-9, REQ-MCC-14). The transcript marker (REQ-MCC-12) provides the permanent record. The transcript is the meeting's source of truth; losing compaction events from it would mean the meeting notes generator has no visibility into context loss that occurred during the session.

**Compact summary storage: meeting notes system vs. separate state file.**
Neither. The summary is stored inline in the transcript (REQ-MCC-12) as a `## Context Compacted` section. This is the simplest approach: no new file format, no new state directory, and the notes generator already reads the transcript. A separate state file would require cleanup on meeting close, and the notes system generates content at close time from the transcript, so the transcript is the right place.

**Hook callback timing vs. stream event timing.**
The `SDKCompactBoundaryMessage` arrives in the stream; the `PostCompact` hook fires separately in the SDK's execution loop. They may not arrive in a predictable order. The design handles this by making the `summary` field optional on the `context_compacted` GuildHallEvent (REQ-MCC-9). If the summary arrives after the boundary message, the transcript append (REQ-MCC-12) can be updated with the summary when it arrives, or the summary can be written as a separate append. The implementation should prefer a brief buffering window (e.g., store the boundary event, wait for the hook within the same SDK iteration cycle, emit the combined event). If the hook fires first, store the summary and attach it when the boundary arrives.

**Commission opt-in.**
Commissions get the stream event for free (REQ-MCC-15) but don't register the hook (REQ-MCC-16). This is the minimum viable approach. Adding commission timeline entries for compaction is a separate concern that doesn't block meeting surfacing.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Compacting status indicator | After this spec ships, as UX polish | [STUB: meeting-compacting-status-indicator] |
| Commission compaction timeline | If compaction visibility is needed for commission debugging | [STUB: commission-compaction-timeline] |
| Extended context beta | When 1M context beta is evaluated for Guild Hall sessions | [STUB: sdk-extended-context-config] |

## Success Criteria

- [ ] Event translator emits `context_compacted` for `compact_boundary` system messages
- [ ] `PostCompact` hook is registered for meeting sessions and captures the summary
- [ ] `GuildHallEvent` includes `context_compacted` variant
- [ ] Session loop maps the event and attaches the summary when available
- [ ] Meeting transcript contains `## Context Compacted` sections with summary
- [ ] Transcript parser handles `system` role messages
- [ ] ChatInterface renders compaction events with expandable summary
- [ ] Commission sessions pass through compaction events without error
- [ ] No hooks are registered for commission sessions
- [ ] Existing meeting and commission tests continue to pass

## AI Validation

**Defaults:**
- Unit tests with mocked SDK messages
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Event translator test: feed a `compact_boundary` system message through `translateSdkMessage` and `createStreamTranslator`, verify the `context_compacted` SdkRunnerEvent is emitted with correct trigger and preTokens values.
- Event translator test: verify that other system subtypes (`status`, `hook_complete`, etc.) still return empty arrays.
- Hook registration test: call `prepareSdkSession` with an `onCompactSummary` callback in the spec, verify the resulting `SdkQueryOptions` contains a `hooks` entry with a `PostCompact` configuration.
- Hook omission test: call `prepareSdkSession` without `onCompactSummary`, verify no `hooks` entry in the resulting options.
- Session loop test: feed a `context_compacted` SdkRunnerEvent through `iterateSession`, verify the corresponding `GuildHallEvent` is yielded.
- Transcript persistence test: simulate a compaction event during a meeting turn, verify the transcript file contains a `## Context Compacted` section with the expected content.
- Transcript parser test: parse a transcript containing `## Context Compacted` sections, verify they produce `TranscriptMessage` entries with `role: 'system'`.
- Web UI test: verify that `ChatInterface` handles a `context_compacted` SSE event without crashing and renders a system message.
- Commission passthrough test: run `drainSdkSession` with a generator that yields a `context_compacted` event, verify it completes without error.

## Constraints

- No database. Compaction state is stored in the transcript file (existing pattern).
- External API contracts: `GuildHallEvent` gains a new variant (additive, not breaking). Existing event types are unchanged.
- The SDK's `PostCompact` hook type must be verified against the installed `@anthropic-ai/claude-agent-sdk` version at implementation time. The research verified types against `sdk.d.ts`; the hook callback shape and `HookJSONOutput` return type should be confirmed.
- The `SdkQueryOptions` type is Guild Hall's own projection of the SDK's query options. Adding `hooks` requires matching the SDK's expected shape, which may include a map of hook event names to callback configurations.

## Context

- [Research: SDK Context Compaction](.lore/research/sdk-context-compaction.md): Identifies the three signals (compact_boundary, status, PreCompact/PostCompact hooks) and recommends Options 1 + 2. Includes SDK type definitions and source index.
- [Spec: Meeting Infrastructure Convergence](.lore/specs/meetings/meeting-infrastructure-convergence.md): Defines the meeting orchestrator, session loop, and transcript architecture that this spec extends.
- [Spec: Guild Hall Meetings](.lore/specs/meetings/guild-hall-meetings.md): The meeting behavioral contract. This spec adds to the meeting system without modifying existing requirements.
- Current source: `event-translator.ts:202` drops `compact_boundary`. `sdk-runner.ts` builds `SdkQueryOptions` without hooks. `session-loop.ts:77-128` maps `SdkRunnerEvent` to `GuildHallEvent`. `transcript.ts` handles `user` and `assistant` turns.
