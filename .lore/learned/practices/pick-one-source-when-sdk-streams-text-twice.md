---
title: When the SDK emits both streaming and complete messages, pick one source for text
date: 2026-04-28
status: active
tags: [sse, streaming, agent-sdk, data-duplication]
modules: [agent]
---

When an SDK offers both streaming partial messages and complete messages, they overlap on text content. The translator must choose one source for text and ignore the other. Complete messages remain authoritative for structured content (tool calls) that does not appear in stream events. In `event-translator.ts`: text comes only from `SDKPartialAssistantMessage`; `SDKAssistantMessage` is used solely for `tool_use`. Do not re-add text extraction to the assistant-message path.
