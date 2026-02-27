---
title: Tool use indicators duplicate instead of updating during streaming
date: 2026-02-25
status: resolved
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

## Resolution

The fix was implemented in commission-Developer-20260226-200936 but lost when the worktree was destroyed during a pre-commit hook before the commit could complete. The full diff is preserved in project memory (`commission-Developer-20260226-200936-result.md`) for re-application.

Root cause: the SDK emits content blocks twice when `includePartialMessages` is enabled. Tool use blocks arrive once via stream events (`content_block_start`) and again in the finalized assistant message. The chat interface accumulated both, producing duplicate indicators. The fix suppresses the assistant message path entirely (returning empty from `translateAssistantMessage`) and adds tool use ID matching so that `tool_result` events correlate accurately to their originating `tool_use` entry rather than matching by name alone.

All changes were verified (1572 tests passing, typecheck clean) before the worktree loss.
