---
title: Meeting error persistence
date: 2026-04-05
status: implemented
tags: [meetings, error-handling, transcript, ux]
modules: [session-loop, transcript, meetings-lib, chat-interface]
related:
  - .lore/specs/meetings/meeting-context-compaction.md
  - .lore/specs/meetings/guild-hall-meetings.md
  - .lore/issues/meeting-errors-should-be-logged.md
req-prefix: MEP
---

# Spec: Meeting Error Persistence

## Overview

When the Agent SDK returns an error during a meeting, the error flows through SSE to the browser and is displayed in real time. But it is never written to the transcript. When the user reopens the meeting (page refresh, daemon restart, or session recovery), the error is gone. The conversation looks successful even though it wasn't.

The user needs error visibility on reopen for two reasons: knowing that recovery may be needed, and understanding what went wrong so they can decide how to recover. This spec adds error persistence to the existing transcript infrastructure so errors survive across sessions.

## Entry Points

- Existing meeting SSE stream: already yields `{ type: "error", reason: string }` events via `session-loop.ts:iterateSession`.
- Existing transcript write path: `appendAssistantTurnSafe` is called post-loop at `session-loop.ts:175`. Errors are tracked in `lastError` but not persisted.

## Requirements

### Transcript: Persist Error Events

- REQ-MEP-1: When `iterateSession` yields an error event, the error MUST be written to the transcript as a new section type. The section follows the existing heading convention:

  ```markdown
  ## Error (2026-04-05T12:01:00Z)
  Session expired
  ```

  The heading uses the word `Error` (matching the pattern of `User`, `Assistant`, `Context Compacted`). The body is the error reason string, as-is.

- REQ-MEP-2: Error sections MUST be appended to the transcript at the point they occur in the event stream, not deferred to post-loop. This preserves chronological ordering relative to assistant text and tool use that may have preceded the error in the same turn.

- REQ-MEP-3: A new function `appendErrorSafe` in `apps/daemon/services/meeting/transcript.ts` handles the write. It follows the same pattern as `appendAssistantTurnSafe` and `appendCompactionMarkerSafe`: swallow filesystem errors with a warning log so transcript failures don't break the meeting flow.

  ```typescript
  export async function appendErrorSafe(
    meetingId: string,
    reason: string,
    guildHallHome: string,
    log?: Log,
  ): Promise<void>
  ```

- REQ-MEP-4: `iterateSession` in `session-loop.ts` calls `appendErrorSafe` in the error handling branch (around line 157), immediately before yielding the error event. This applies to all error events that are yielded to SSE (respecting the existing `suppressExpiryErrors` gate). Suppressed expiry errors that are not yielded to SSE SHOULD also be persisted, since they represent real session state changes the user should see on review.

### Transcript Parsing: Read Error Sections

- REQ-MEP-5: The transcript heading regex in `parseTranscriptMessages` (`apps/daemon/services/meeting/transcript.ts:327`) and `parseTranscriptToMessages` (`lib/meetings.ts:297`) MUST be extended to match `## Error (timestamp)` headings. Both parsers already handle three heading types (`User`, `Assistant`, `Context Compacted`). Error becomes the fourth.

- REQ-MEP-6: Parsed error sections produce messages with `role: "system"` and a content string that clearly identifies the message as an error. The content MUST be prefixed with a distinguishing marker so the UI can differentiate errors from compaction notices (which also use `role: "system"`). Format: the content string is the raw error reason, and the message carries an additional field or the content is prefixed.

  Recommended approach: use a content prefix convention. The parsed message content for an error section is:

  ```
  Error: Session expired
  ```

  This parallels how `Context Compacted` sections produce content like `Context was compressed (auto, 45000 tokens before compaction).` The `Error:` prefix is unambiguous and parseable by the UI.

### Transcript Truncation: Preserve Error Sections

- REQ-MEP-7: The `truncateTranscript` function (`apps/daemon/services/meeting/transcript.ts:168`) already splits on a heading pattern that includes `User`, `Assistant`, and `Context Compacted`. This pattern MUST be extended to include `Error` so that error sections are not split mid-section during truncation.

### UI: Display Persisted Errors

- REQ-MEP-8: The `ChatInterface` component (`apps/web/components/meeting/ChatInterface.tsx`) already renders `system` role messages from the transcript (compaction notices). Persisted error messages (those with content starting with `Error:`) MUST render with visual treatment that distinguishes them from informational system messages. The existing `ErrorMessage` component's styling is the reference for how errors should look.

- REQ-MEP-9: Persisted error messages from the transcript MUST NOT re-trigger the `error` state in ChatInterface. They are historical records, not active errors. They render inline in the message list at their chronological position, not in the sticky error banner.

## Scope Exclusions

- **Error recovery actions.** This spec covers visibility only. It does not add retry buttons, session restart prompts, or automatic recovery. Those are separate concerns that build on error visibility.
- **Meeting artifact error fields.** Errors are persisted in the transcript (the session-scoped working file), not in the meeting artifact frontmatter. The transcript is the right place because errors are conversation-level events, not meeting-level metadata.
- **Error aggregation or deduplication.** If the SDK yields the same error three times, three error sections appear in the transcript. Deduplication is a UX polish concern for later.

## Constraints

- The transcript format is append-only markdown. Error sections MUST follow the `## Heading (timestamp)` convention. No new file formats or state file fields.
- Error persistence MUST NOT block the SSE event stream. The `*Safe` pattern (swallow filesystem errors) is mandatory.
- The `TranscriptChatMessage` interface in `lib/meetings.ts` uses `role: "user" | "assistant" | "system"`. Error messages use `role: "system"` with content-based differentiation. Adding a new role would be a breaking change to the UI contract and is not warranted for this feature.

## Success Criteria

### Automated Tests

- A test that calls `appendErrorSafe`, then `readTranscriptMessages`, and verifies the error appears as a system-role message with the `Error:` prefix.
- A test that verifies `parseTranscriptToMessages` (the UI-facing parser in `lib/meetings.ts`) correctly parses `## Error (timestamp)` sections.
- A test that verifies `truncateTranscript` preserves error section boundaries.
- A test that `iterateSession` calls `appendErrorSafe` when the SDK yields an error event.

### Manual Verification

- Start a meeting, trigger an SDK error (e.g., invalid model config), observe the error in real time.
- Refresh the page. The error appears in the transcript at its chronological position with error styling.
- The error does not appear in the sticky error banner on reopen.
