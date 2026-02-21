---
title: Build Workshop frontend with SSE streaming
date: 2026-02-11
status: complete
tags: [task]
source: .lore/_archive/phase-1/plans/guild-hall-phase-1.md
sequence: 15
modules: [guild-hall]
related:
  - .lore/_archive/phase-1/specs/guild-hall-phase-1.md
  - .lore/_archive/phase-1/plans/guild-hall-phase-1.md
---

# Task: Build Workshop frontend with SSE streaming

## What

Build the Workshop view in substep order:

**15.1: State management** - Create `hooks/useWorkshopSession.ts`:
- State: session metadata, messages array, current status, streamingText (in-progress assistant text)
- State transitions: send message -> running; SSE assistant_text -> append to streamingText; SSE tool_use -> append to messages; SSE tool_result -> update pending tool call; SSE done -> flush streamingText to messages, status idle; SSE error -> display error; stop -> idle

**15.2: SSE client** - Create `hooks/useSSE.ts`:
- Connect to `GET /api/sessions/[id]/events` using EventSource or fetch-based reader
- Parse typed events matching SSEEventSchema
- Call state update callbacks per event type
- Handle reconnection: if connection drops mid-query, reconnect (receives `status_change` with `running`)
- Clean up on unmount

**15.3: Static components**:
- `components/workshop/ConversationHistory.tsx`: Renders message list (MessageBubble or ToolCallDisplay). Auto-scrolls to bottom on new content.
- `components/workshop/MessageBubble.tsx`: User and assistant messages. `streaming` prop for in-progress text.
- `components/workshop/ToolCallDisplay.tsx`: Tool name, collapsible input and result. Visual distinction between pending and completed.

**15.4: Dynamic components**:
- `app/sessions/[id]/page.tsx`: Fetches session from API, renders WorkshopView with Roster sidebar.
- `components/workshop/WorkshopView.tsx`: Orchestrates hooks and components. Shows session guild members.
- `components/workshop/MessageInput.tsx`: Text input + send button. Disabled when running. POST to messages endpoint.
- `components/workshop/ProcessingIndicator.tsx`: Visible when running. Stop button calls POST to stop endpoint.
- Expired session: show explanation message and "Start Fresh" button.

## Validation

Full integration test with mocked API and SSE:
1. Load session page, conversation history renders from fetched data
2. Send a message: input disables, SSE connects, processing indicator appears
3. Receive assistant_text events: streaming text appears in conversation
4. Receive tool_use event: tool call renders with pending state
5. Receive tool_result event: tool call updates with result
6. Receive done event: assistant message finalizes, input re-enables, processing indicator hides
7. Click stop button: POST to stop endpoint fires, status returns to idle
8. Load an expired session: "Start Fresh" button appears, clicking it sends a message (fresh SDK session)
9. Roster sidebar renders in Workshop layout
10. Guild members configured for the session are displayed

## Why

REQ-GH1-14: "The Workshop displays the full conversation history for the active session."

REQ-GH1-15: "Agent activity streams in real time. Tool calls, tool results, and assistant text appear as they happen."

REQ-GH1-16: "The Workshop provides a message input for sending prompts to the agent."

REQ-GH1-17: "The Workshop provides a stop control that interrupts the agent mid-execution."

REQ-GH1-18: "The Workshop shows which guild members are configured for this session."

## Files

- `hooks/useWorkshopSession.ts` (create)
- `hooks/useSSE.ts` (create)
- `app/sessions/[id]/page.tsx` (create)
- `components/workshop/WorkshopView.tsx` (create)
- `components/workshop/ConversationHistory.tsx` (create)
- `components/workshop/MessageBubble.tsx` (create)
- `components/workshop/ToolCallDisplay.tsx` (create)
- `components/workshop/MessageInput.tsx` (create)
- `components/workshop/ProcessingIndicator.tsx` (create)
- `tests/components/workshop.test.tsx` (create)
- `tests/hooks/useWorkshopSession.test.ts` (create)
- `tests/hooks/useSSE.test.ts` (create)
