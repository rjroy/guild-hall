---
title: Tool use indicators duplicate instead of updating during streaming
date: 2026-02-25
status: open
tags: [bug, ui, meetings, streaming, sse]
modules: [meeting-chat, tool-use-indicator, event-translator]
---

# Tool Use Indicators Duplicate During Streaming

## What Happened

During a meeting session, when a tool is invoked the user sees an initial notification that the tool has started. When the tool completes, a second notification appears rather than updating the existing one in place. This results in duplicate visual entries for the same tool call.

## Why It Matters

The chat interface gets cluttered with redundant tool indicators, making it harder to follow the conversation. It also looks broken. The expected behavior is a single indicator that transitions from "running" to "complete" as the tool lifecycle progresses.

## Fix Direction

The SSE event stream likely emits separate events for tool start and tool result. The `ToolUseIndicator` component or the message accumulation logic needs to match tool results back to their corresponding tool start events (by tool use ID) and update in place rather than appending a new entry.

1. Check how `event-translator.ts` emits tool start vs tool result events.
2. Check how the chat message state accumulates these events during streaming.
3. Ensure the rendering logic deduplicates by tool use ID, showing the latest state.
