---
title: Multiline tool results render as code blocks when reopening meetings
date: 2026-02-25
status: resolved
tags: [bug, ui, meetings, transcript, markdown]
modules: [meeting-chat, transcript, message-bubble]
---

# Multiline Tool Results Render as Code Blocks on Meeting Reopen

## What Happened

When re-opening an in-progress meeting page, some tool use results that contain multiline content aren't stored or parsed correctly. On reload, the display gets confused and renders them as code blocks instead of structured tool output.

## Why It Matters

This makes resumed meetings harder to follow. The conversation history looks broken, with tool results rendered as raw text rather than the formatted tool indicators shown during the live session. Users lose context about what the tools actually did.

## Fix Direction

Investigate the transcript serialization and deserialization path. Likely candidates:

1. **Transcript storage** (`daemon/services/transcript.ts`): Multiline tool results may not be escaped or delimited properly when appended to the transcript file.
2. **Transcript parsing** (`parseTranscriptToMessages`): The parser may split on newlines in a way that breaks multiline tool content.
3. **Message rendering** (`MessageBubble`, `ToolUseIndicator`): The components may not handle the rehydrated format the same way they handle live SSE events.

Compare the data shape of a tool result during live streaming vs after transcript rehydration to find where the mismatch happens.
