---
title: Fix duplicate tool use indicators during live meeting streaming
date: 2026-02-26
status: executed
tags: [bug-fix, streaming, sse, tool-use, meetings, ui]
modules: [event-translator, meeting-chat, tool-use-indicator]
related: [.lore/_archive/issues/duplicate-tool-notifications.md]
---

# Plan: Fix Duplicate Tool Use Indicators During Live Meeting Streaming

## Goal

During live meeting SSE streaming, each tool invocation should display as a single visual entry that transitions from "Running" to "Complete." Currently, two entries appear: one when the tool starts (correct) and a second when the SDK emits the finalized assistant message (incorrect duplicate). The transcript replay path is unaffected.

## Codebase Context

**The SDK message sequence for a single tool call:**

1. `stream_event` with `content_block_start` (type=tool_use, includes `content_block.id`)
2. `stream_event` with `content_block_delta` (input_json_delta, builds input incrementally)
3. `stream_event` with `content_block_stop`
4. `assistant` message (finalized message with all content blocks, including tool_use with full `id` and `input`)
5. `user` message (tool_result blocks with `tool_use_id` field)
6. Cycle repeats or `result` message (turn_end)

**Root cause:** `translateAssistantMessage()` in `daemon/services/event-translator.ts:168-191` emits `tool_use` events for content blocks already emitted by `translateStreamEvent()` in step 1. The code already suppresses text blocks from assistant messages for exactly this reason (double-data prevention, line 174 comment) but does not apply the same logic to tool_use blocks. Each duplicate `tool_use` event appends a new entry to `accumulatedTools` in `ChatInterface.tsx:202-211`.

**Secondary issue:** `ChatInterface.tsx:215-216` matches tool_result to tool_use by `name` only (`t.name === toolName`). The SDK provides `tool_use_id` on tool_result blocks and `id` on tool_use blocks for reliable matching, but the event translator discards both. Name-only matching fails when the same tool is invoked multiple times in one turn (e.g., two `Read` calls).

**Why transcript replay works:** `lib/meetings.ts` `parseTranscriptToMessages()` reconstructs tool entries from markdown and marks them all as `status: "complete"`. No streaming duplication occurs because the transcript contains the final state, not the event stream.

**Key data structures (current):**

| Location | Type | Missing |
|----------|------|---------|
| `daemon/types.ts:61` | `{ type: "tool_use"; name: string; input: unknown }` | No `id` field |
| `daemon/types.ts:62` | `{ type: "tool_result"; name: string; output: string }` | No `toolUseId` field |
| `components/meeting/ToolUseIndicator.tsx:7-12` | `ToolUseEntry { name, input?, output?, status }` | No `id` field |

**Files involved:**

| File | Lines | Role |
|------|-------|------|
| `daemon/services/event-translator.ts` | 147-156 (stream tool_use), 168-191 (assistant tool_use), 195-213 (user tool_result) | Event translation from SDK to GuildHallEvent |
| `daemon/types.ts` | 58-64 | GuildHallEvent union type |
| `components/meeting/ChatInterface.tsx` | 202-224 | Client-side tool event accumulation |
| `components/meeting/ToolUseIndicator.tsx` | 7-12 | ToolUseEntry interface |
| `components/meeting/types.ts` | 1-10 | Re-exports ToolUseEntry for ChatMessage |
| `tests/daemon/event-translator.test.ts` | 285-305 | Tests that verify current (broken) behavior |

## Implementation Steps

### Step 1: Add `id` field to GuildHallEvent tool types

**Files**: `daemon/types.ts`
**Expertise**: none

Add an optional `id` field to both tool event types in the GuildHallEvent union:

- `tool_use` gets `id?: string` (the tool_use ID from the SDK)
- `tool_result` gets `toolUseId?: string` (the tool_use_id reference from the SDK)

The field is optional because the first-turn SSE helper (`lib/sse-helpers.ts`) constructs these events from parsed JSON and doesn't use tool IDs. Making it optional avoids breaking any code that constructs GuildHallEvents without IDs.

### Step 2: Capture tool_use_id in the event translator

**Files**: `daemon/services/event-translator.ts`
**Expertise**: none

Two changes in this file:

**2a.** In `translateStreamEvent()` (line 147-158): extract `content_block.id` from the `content_block_start` event and include it as `id` in the emitted `tool_use` event. The test helpers already include `id: "tool-1"` on the mock content_block (line 62 of the test file), confirming the SDK provides this field.

**2b.** In `translateUserMessage()` (line 195-213): extract `tool_use_id` from each `tool_result` block and include it as `toolUseId` in the emitted `tool_result` event. The `tool_use_id` is already present on the test mock data (line 349 of the test file).

### Step 3: Suppress tool_use from assistant messages

**Files**: `daemon/services/event-translator.ts`
**Expertise**: none

In `translateAssistantMessage()` (line 168-191): stop emitting `tool_use` events from the finalized assistant message. The streaming path (content_block_start) already delivers these events in real time. Emitting them again from the assistant message is the same double-data problem the function already solves for text blocks (line 174 comment).

Change the function to return an empty array, matching the text-only behavior. The existing comment at line 171-174 should be updated to explain that both text AND tool_use blocks are suppressed (not just text).

**Tradeoff**: the stream path emits `input: {}` (because content_block_start doesn't include the full input; it's built incrementally via input_json_delta which the translator ignores). The finalized assistant message had the full input. After this change, the ToolUseIndicator will show `{}` for input during streaming. This is acceptable because: (a) the input is rarely expanded during the "Running" phase, (b) the completed tool entry from the transcript replay still has the correct state, and (c) accumulating input_json_delta in the translator would add significant complexity for marginal value.

### Step 4: Add `id` to ToolUseEntry and use ID-based matching

**Files**: `components/meeting/ToolUseIndicator.tsx`, `components/meeting/ChatInterface.tsx`
**Expertise**: none

**4a.** Add an optional `id?: string` field to the `ToolUseEntry` interface in `ToolUseIndicator.tsx`.

**4b.** In `ChatInterface.tsx`, update the tool event handlers:

- `tool_use` case (line 202-211): capture `event.id` (if present) into the new `ToolUseEntry.id` field.
- `tool_result` case (line 213-239): change the matching logic from name-only to ID-first with name fallback:
  - If the event has a `toolUseId`, find the entry with matching `id` and update it.
  - If no `toolUseId` (backward compatibility), fall back to name+status matching (current behavior).

This handles the edge case where the same tool is invoked twice in one turn. Each tool_result matches its specific tool_use by ID instead of ambiguously matching by name.

### Step 5: Update tests

**Files**: `tests/daemon/event-translator.test.ts`
**Expertise**: none

Three categories of test changes:

**5a.** Update the "tool_use blocks produce tool_use events" test (line 285-305) and the "mixed text + tool_use" test (line 307-331). These currently assert that `translateAssistantMessage` emits tool_use events. After step 3, these should assert empty arrays instead, matching the text deduplication tests.

**5b.** Update the stream event tool_use test (line 234-243) to verify the `id` field is included in the emitted event.

**5c.** Update the tool_result tests (line 344-397) to verify the `toolUseId` field is included in emitted events.

**5d.** Add a new integration-style test that sends the full sequence (stream_event content_block_start, assistant message with same tool_use, user message with tool_result) through the translator and verifies that only one `tool_use` event is produced for the stream_event, the assistant message produces none, and the tool_result carries the matching `toolUseId`.

### Step 6: Validate against goal

Launch a sub-agent that reads the Goal section above, reviews the implementation across all changed files, and verifies:

- Only one tool_use event per tool invocation reaches the client
- tool_result events carry the tool_use_id needed for matching
- The ToolUseIndicator transitions from "Running" to "Complete" via ID-based matching
- Transcript replay behavior is unaffected (it constructs entries differently)
- All tests pass

## Delegation Guide

No specialized expertise is required. This is a straightforward data-flow fix across daemon and UI. All steps can be handled by a general-purpose implementation agent.

Steps 1-3 are the critical path (fix the duplicate). Steps 4-5 harden the fix and prevent related edge cases. Step 6 is mandatory validation.

## Open Questions

1. **Should input_json_delta be accumulated?** Suppressing assistant message tool_use means losing the full `input` during streaming (only `{}` is available from content_block_start). This plan accepts the tradeoff. If the ToolUseIndicator's expanded input view is important during the "Running" phase, accumulating input_json_delta in the translator would be a follow-up enhancement, not part of this fix.

2. **First-turn SSE path in sse-helpers.ts**: The `consumeFirstTurnSSE()` function ignores tool_use and tool_result events entirely (lines 111-113). This means first-turn tool calls don't appear in the initial messages at all. This is a separate issue from the duplicate bug and not addressed here.
