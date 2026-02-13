---
title: SDK streaming emits text twice, translator must pick one source
date: 2026-02-13
status: complete
tags: [bug-fix, sse, streaming, sdk, data-duplication]
modules: [agent]
related:
  - .lore/notes/phase-1-known-bugs.md
  - .lore/retros/sse-streaming-bug-fix.md
---

# Retro: Double Data Bug Fix

## Summary

Fixed bug #2 from Phase I manual testing: "Double data in the response." When `includePartialMessages: true`, the Agent SDK emits text content twice: first as streaming `SDKPartialAssistantMessage` chunks during generation, then again inside the complete `SDKAssistantMessage` after the turn finishes. `translateAssistantMessage` was converting both to `assistant_text` SSE events, doubling the content in the live stream, the persisted `messages.jsonl`, and the page-refresh load.

## What Went Well

- **Reading the translation layer identified the cause immediately.** The two code paths (`translateStreamEvent` and `translateAssistantMessage`) both produced `assistant_text` events. Once you see that the SDK sends text through both message types, the duplication is obvious. No debugging tools or reproduction steps needed.

- **The fix was one deleted condition.** Removed the `text` block handling from `translateAssistantMessage`, leaving it to only extract `tool_use` blocks. Tool use blocks only appear in complete messages (not stream events), so there's no equivalent duplication risk for those. Two test assertions updated. All 368 tests passed without other changes.

- **The mapping comment at the top of `agent.ts` was the right place to document this.** Updated the SDK-to-SSE mapping table to show that `SDKAssistantMessage` text blocks are intentionally ignored. Future readers won't re-add the text extraction thinking it was accidentally omitted.

## What Could Improve

- **The original implementation should have caught this.** The Agent SDK docs in the header comment explicitly note that `SDKPartialAssistantMessage` delivers streaming text and `SDKAssistantMessage` contains the complete text. The translation layer handled both without considering that they carry the same content. The mapping table even listed both as producing `assistant_text`. A closer read during implementation would have prevented this.

- **No integration test covers the full streaming-to-persistence path.** The unit tests for `translateSdkMessage` tested each message type in isolation. A test that fed a realistic SDK message sequence (init, stream chunks, complete assistant message, result) through the full pipeline and checked the final persisted content would have caught the doubling.

## Lessons Learned

- When an SDK offers both streaming partial messages and complete messages, they overlap on text content. The translator must choose one source for text and ignore the other. Complete messages are the authority for structured content (tool calls) that doesn't appear in stream events.

- Mapping tables that document "X produces Y" are load-bearing documentation. When the table said both stream events and assistant messages produce `assistant_text`, that was the bug description hiding in plain sight.

## Artifacts

- Known bugs: `.lore/notes/phase-1-known-bugs.md` (bug #2 marked resolved)
