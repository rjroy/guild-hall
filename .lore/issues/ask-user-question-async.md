---
title: AskUserQuestion tool needs async response mechanism
date: 2026-02-25
status: blocked
tags: [feature, meetings, toolbox, async, user-interaction]
modules: [meeting-chat, meeting-toolbox, daemon]
---

# AskUserQuestion Async Problem

## What Happened

The `AskUserQuestion` tool has no way to keep the tool call open while waiting for the user to respond. The tool needs to present a question to the user in the browser and wait for their answer before returning a result to the SDK session, but the current architecture doesn't support this kind of blocking user interaction within a tool execution.

## Why It Matters

Without this, workers can't ask the user clarifying questions during meetings. The tool either times out or returns immediately without an answer, breaking the conversational flow that makes meetings useful.

## Fix Direction

This needs a design discussion. The core challenge is bridging an async user interaction (browser UI) with a synchronous tool return (SDK expects a result). Possible approaches to evaluate:

1. **Long-poll the tool call**: Keep the HTTP connection open while the daemon waits for a user response event. The browser renders the question UI, user responds, browser POSTs the answer, daemon unblocks the tool and returns the result.
2. **Tool suspension**: Return a "pending" result and have the SDK session pause until a follow-up message carries the answer. May not be supported by the Agent SDK.
3. **Split into two turns**: The tool returns immediately with a "question asked" result. The user's answer comes as the next chat message. The worker needs to understand this convention.

Each approach has trade-offs around SDK compatibility, timeout handling, and UX. Needs discussion before implementation.
