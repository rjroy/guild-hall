---
title: Phase I known bugs from manual testing
date: 2026-02-12
status: active
tags: [bugs, phase-1, frontend, sse, navigation]
source: .lore/retros/guild-hall-phase-1.md
modules: [workshop, board]
---

# Phase I Known Bugs

Three bugs found during manual testing after the Phase I implementation was committed (525030d).

## 1. Agent response does not appear until page refresh

The agent processes the query (backend works), but the Workshop doesn't display the response in real time. Refreshing the page loads the full conversation including the response. The SSE streaming path is the likely culprit: `useSSE` hook, `useWorkshopSession` state transitions, or the wiring between them. The state machine passes all unit tests in isolation, so this is an integration issue between EventSource and React state.

**Where to look**: `hooks/useSSE.ts`, `hooks/useWorkshopSession.ts`, `components/workshop/WorkshopView.tsx`

## 2. Double data in the response

After refreshing (to see the response per bug 1), the response contains duplicate data. Likely cause: messages are being appended twice, either during SSE event processing, during the done/flush step, or when loading the conversation from the API on refresh. Could also be a backend issue where `messages.jsonl` gets duplicate entries written.

**Where to look**: `lib/workshop-state.ts` (applySSEEvent, flush logic), `lib/agent.ts` (message persistence to JSONL), `app/api/sessions/[id]/route.ts` (GET response construction)

## 3. No navigation from Workshop back to Dashboard

After creating a session, the user lands in the Workshop (`/sessions/[id]`) with no UI element to return to the Dashboard (`/`). The only way back is manually navigating to the root URL. This is a missing UI element (back button, breadcrumb, or shared header nav), not a broken feature. The spec defines entry points but doesn't describe inter-view navigation.

**Where to fix**: Add a header or breadcrumb to `app/sessions/[id]/page.tsx` or `components/workshop/WorkshopView.tsx`, or add a shared navigation component to `app/layout.tsx`.
