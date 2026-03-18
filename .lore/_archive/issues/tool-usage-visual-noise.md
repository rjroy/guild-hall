---
title: Tool usage list creates visual noise in meeting view
date: 2026-03-06
status: resolved
tags: [ux, meetings, ui]
modules: [StreamingMessage, MessageBubble, ToolUseIndicator]
---

# Tool Usage List Creates Visual Noise

## What Happens

During a meeting, every tool call renders as its own line item in the message bubble. A worker that uses 100 tools in a single turn produces a list of 100 `ToolUseIndicator` rows. This creates a massive block of tool usage that dominates the conversation view and pushes the actual text content out of sight.

## How It Works Now

`StreamingMessage` and `MessageBubble` both render tool usage the same way: iterate the `tools` array, render one `ToolUseIndicator` per entry. Each indicator shows a gem, tool name, and status, and is individually expandable to show input/output. There is no grouping, collapsing, or summarization.

Relevant components:
- `web/components/meeting/ToolUseIndicator.tsx` renders one tool call
- `web/components/meeting/StreamingMessage.tsx` renders the list during streaming
- `web/components/meeting/MessageBubble.tsx` renders the list in completed messages

## Why It Matters

The meeting view is a conversation. When the tool usage block is larger than the text content, it breaks the reading flow. The user has to scroll past dozens of tool indicators to find what the worker actually said.

## Fix Direction

No decision made yet. This needs design discussion. Some directions to consider:

1. **Collapse by default, expand on demand.** Show a summary line ("47 tools used") with a toggle to expand the full list. Simple, preserves all detail.
2. **Group by tool name.** If the worker called `Read` 30 times, show "Read (30)" as a single collapsible group. Reduces line count without hiding information.
3. **Show only active/recent.** During streaming, show only running tools and the last N completed. After streaming completes, collapse to summary.
4. **Hybrid.** Group by name during streaming, collapse to summary line after completion. Expand to full list on demand.

The right answer depends on what users actually need to see. During streaming, knowing which tool is running is useful. After the turn is done, the tool list is rarely relevant unless debugging. The solution should respect both contexts.
