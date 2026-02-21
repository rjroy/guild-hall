---
title: Event types and event translator
date: 2026-02-21
status: complete
tags: [task]
source: .lore/plans/phase-2-workers-first-audience.md
related:
  - .lore/specs/guild-hall-meetings.md
  - .lore/retros/double-data-bug-fix.md
  - .lore/retros/sse-streaming-bug-fix.md
sequence: 5
modules: [guild-hall-core]
---

# Task: Event Types and Event Translator

## What

Define the Guild Hall event types visible to the UI and implement the translator that converts SDK messages to these events. This is the boundary where SDK internals stop and the daemon's public event schema begins.

**`daemon/types.ts`**: Event types for daemon-to-client communication.

```typescript
type GuildHallEvent =
  | { type: "session"; meetingId: string; sessionId: string; worker: string }
  | { type: "text_delta"; text: string }
  | { type: "tool_use"; name: string; input: unknown }
  | { type: "tool_result"; name: string; output: string }
  | { type: "turn_end"; cost?: number }
  | { type: "error"; reason: string };
```

Branded types for the two ID namespaces (highest-risk boundary per SSE streaming retro):

```typescript
type MeetingId = string & { readonly __brand: "MeetingId" };
type SdkSessionId = string & { readonly __brand: "SdkSessionId" };
```

**`daemon/services/event-translator.ts`**: Pure function `translateSdkMessage(message: SDKMessage): GuildHallEvent[]`

Translation rules incorporating retro lessons:

- `SDKSystemMessage` (subtype: "init") -> `session` event with sessionId, meetingId, worker
- `SDKPartialAssistantMessage` (type: "stream_event") -> parse event.type:
  - `content_block_delta` with text delta -> `text_delta`
  - `content_block_start` with tool_use -> `tool_use`
- `SDKAssistantMessage` (type: "assistant") -> extract tool_use blocks ONLY. **Do not extract text blocks** (double-data retro: SDK emits text twice with `includePartialMessages: true`. Pick streaming partials for text, complete messages for tool_use blocks only).
- Tool result messages -> `tool_result`
- `SDKResultMessage` (subtype: "success") -> `turn_end`
- `SDKResultMessage` (subtype: "error_*") -> `error`
- All other message types -> ignored (no SDK internals leak through)

**SDK type verification**: Before implementing translation rules, verify actual SDK message types and their field names against the installed `@anthropic-ai/claude-agent-sdk` package. The plan's assumptions are based on `.lore/research/claude-agent-sdk-ref-typescript.md`, but the actual API may have differences. Document any divergences.

## Validation

- Each SDK message type produces the correct Guild Hall event(s)
- Text deduplication: `SDKAssistantMessage` text blocks are ignored, only tool_use blocks extracted
- `SDKPartialAssistantMessage` text deltas produce `text_delta` events
- `SDKSystemMessage` (init) produces `session` event with correct IDs
- `SDKResultMessage` (success) produces `turn_end`
- `SDKResultMessage` (error variants) produce `error` events
- Unknown/unrecognized SDK message types produce no events (empty array)
- Branded types prevent accidental mixing of MeetingId and SdkSessionId at compile time
- No SDK internal types appear in GuildHallEvent

## Why

From `.lore/specs/guild-hall-meetings.md`:
- REQ-MTG-14: Meeting responses stream incrementally
- REQ-MTG-15: Event types (text_delta, tool_use, tool_result, turn_end, error)

From `.lore/retros/double-data-bug-fix.md`: SDK emits text twice with `includePartialMessages: true`. The translator must pick streaming partials for text content, complete messages for tool_use blocks only.

From `.lore/retros/sse-streaming-bug-fix.md`: Two ID namespaces (meeting ID vs SDK session ID) are the highest-risk code. Branded types turn mixing into a compile error.

## Files

- `daemon/types.ts` (create)
- `daemon/services/event-translator.ts` (create)
- `tests/daemon/event-translator.test.ts` (create)
