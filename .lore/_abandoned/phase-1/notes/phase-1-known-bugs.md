---
title: Phase I known bugs from manual testing
date: 2026-02-12
status: active
tags: [bugs, phase-1, frontend, sse, navigation]
source: .lore/retros/guild-hall-phase-1.md
modules: [workshop, board]
---

# Phase I Known Bugs

Three bugs found during manual testing after the Phase I implementation was committed (525030d).

## 1. ~~Agent response does not appear until page refresh~~ (RESOLVED)

Two bugs caused this. First, a race condition: `addUserMessage` set `status: "running"` optimistically, which triggered the EventSource before the POST returned. The events endpoint checked `isQueryRunning()`, found no query registered yet, and closed the stream. Second, an event bus key mismatch: `iterateQuery` emitted events keyed by the SDK session ID (a UUID), but the events endpoint subscribed with the Guild Hall session ID. Events went to the wrong channel.

**Fix**: Decoupled SSE connection from status by managing an explicit `sseUrl` in the hook (set after POST 202, not derived from status). Added `sessionId` parameter to `startAgentQuery`/`iterateQuery` so event bus routing uses the Guild Hall session ID.

## 2. ~~Double data in the response~~ (RESOLVED)

The SDK emits text twice when `includePartialMessages: true`: first as streaming `SDKPartialAssistantMessage` chunks (which `translateStreamEvent` converted to `assistant_text` SSE events), then as a complete `SDKAssistantMessage` whose text content blocks `translateAssistantMessage` also converted to `assistant_text`. Both paths fed into the same accumulation on the frontend (`streamingText += event.text`) and backend (`textParts.push(event.text)`), doubling the content in both the live stream and persisted `messages.jsonl`.

**Fix**: `translateAssistantMessage` now only extracts `tool_use` blocks from complete assistant messages. Text blocks are skipped because the streaming events already delivered them. Tool use blocks only appear in complete messages (not in stream events), so there's no duplication risk for those.

## 3. ~~No navigation from Workshop back to Dashboard~~ (RESOLVED)

After creating a session, the user lands in the Workshop (`/sessions/[id]`) with no UI element to return to the Dashboard (`/`). The only way back is manually navigating to the root URL.

**Fix**: Added a breadcrumb ("Guild Hall / Session Name") to the workshop header. "Guild Hall" is a Next.js `Link` back to `/`. Also added a "Back to Dashboard" link in the error/404 state so users aren't stranded there either.
