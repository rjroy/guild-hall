---
title: Meeting view components
date: 2026-02-21
status: pending
tags: [task]
source: .lore/plans/phase-2-workers-first-audience.md
related:
  - .lore/specs/guild-hall-views.md
  - .lore/retros/ui-redesign-fantasy-theme.md
sequence: 9
modules: [guild-hall-ui]
---

# Task: Meeting View Components

## What

Build the meeting view: a streaming chat interface with worker identity, agenda display, and the fantasy guild aesthetic. Reference mockup: `.lore/prototypes/agentic-ux/view-meeting-audience_0.webp`.

**`app/projects/[name]/meetings/[id]/page.tsx`** (server component): Reads meeting artifact from `.lore/meetings/<id>.md` for initial data (worker name, agenda, status). If not found or closed, redirect to project view. Passes meeting metadata to ChatInterface.

**`components/meeting/MeetingHeader.tsx`**: Worker identity (portrait, name, display title) on left. Meeting agenda on right. Breadcrumb: "Guild Hall > Project: [name] > Audience". Persistent throughout conversation (REQ-VIEW-28, REQ-VIEW-29).

**`components/meeting/ChatInterface.tsx`** (client component): Main interactive container managing:

- Message history array (role, content, toolUses)
- Streaming state (is worker generating?)
- SSE connection lifecycle

On mount, receives first turn's messages as initial state (passed from WorkerPicker in Task 010). Does NOT re-request the first turn. Follow-up flow:

1. User types message, clicks send (or Enter)
2. Add user message to history, disable input
3. POST to `/api/meetings/[meetingId]/messages`
4. Read SSE events: text_delta appends, tool_use adds indicator, tool_result updates indicator
5. turn_end: finalize message, re-enable input
6. error: display inline, re-enable input

**`components/meeting/MessageBubble.tsx`**: Complete message. User messages on right (brass accent border), worker messages on left (parchment background with portrait thumbnail).

**`components/meeting/StreamingMessage.tsx`**: In-progress worker response. Text appears as it arrives with pulsing cursor. Tool use events render inline as collapsed indicators.

**`components/meeting/ToolUseIndicator.tsx`**: Shows tool name and brief status. Expands to show input/output on click. Subtle border to distinguish from text.

**`components/meeting/MessageInput.tsx`**: Text input at bottom. Send button (brass accent). Stop button appears during generation (calls interrupt endpoint). Input disabled during active turn (sequential turn-taking, REQ-VIEW-34).

**Error display** (REQ-VIEW-33): Error events render as distinct message bubble with red gem indicator.

**CSS notes**: All components use CSS Modules with established design system. Chat area uses parchment texture background. Message bubbles use Panel-like glassmorphic styling. Scrollable message area with auto-scroll to bottom. **Vendor prefix**: `-webkit-backdrop-filter` before `backdrop-filter` (ui-redesign retro).

## Validation

- Meeting page renders with worker identity and agenda from artifact
- Meeting not found redirects to project view
- Closed meeting shows "This audience has ended" with link back
- Message bubbles render with correct sender styling (user right, worker left)
- Streaming message shows text incrementally with cursor indicator
- Tool use indicators show tool name and status, expand on click
- Stop button appears during generation, calls interrupt endpoint
- Input disabled during active turn, re-enabled after turn_end
- Error events display with red gem indicator inline
- Auto-scroll to bottom on new content
- Breadcrumb navigation works (back to project and dashboard)

## Why

From `.lore/specs/guild-hall-views.md`:
- REQ-VIEW-28: Worker portrait and identity in meeting view
- REQ-VIEW-29: Meeting agenda displayed
- REQ-VIEW-31: Chat interface with alternating messages
- REQ-VIEW-32: Real-time streaming display
- REQ-VIEW-33: Error events display inline
- REQ-VIEW-34: Message input, send button, stop button

## Files

- `app/projects/[name]/meetings/[id]/page.tsx` (create)
- `app/projects/[name]/meetings/[id]/page.module.css` (create)
- `components/meeting/MeetingHeader.tsx` (create)
- `components/meeting/MeetingHeader.module.css` (create)
- `components/meeting/ChatInterface.tsx` (create)
- `components/meeting/ChatInterface.module.css` (create)
- `components/meeting/MessageBubble.tsx` (create)
- `components/meeting/MessageBubble.module.css` (create)
- `components/meeting/StreamingMessage.tsx` (create)
- `components/meeting/StreamingMessage.module.css` (create)
- `components/meeting/ToolUseIndicator.tsx` (create)
- `components/meeting/ToolUseIndicator.module.css` (create)
- `components/meeting/MessageInput.tsx` (create)
- `components/meeting/MessageInput.module.css` (create)
- `tests/components/meeting-view.test.tsx` (create)
