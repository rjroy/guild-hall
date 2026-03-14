---
title: Close Audience button is unreachable on mobile without full scroll
date: 2026-03-10
status: wontfix
tags: [ux, ui, meetings, mobile]
modules: [web/components/meeting]
---

# Mobile Close Audience Below Fold

## What Happens

On mobile viewports (375px), the "Close Audience" button appears below the "Linked Artifacts" panel, which itself appears below the chat input. To close a meeting, the user must scroll past the entire conversation history, past the input bar, past the linked artifacts section, to reach the button at the very bottom of the page.

## Why It Matters

Closing a meeting is a primary action. Burying it at the bottom of a potentially long conversation (20+ message exchanges) creates friction. On a phone, this means significant scrolling just to perform a basic operation. The desktop layout handles this better because the sidebar is always visible.

## Fix Direction

1. **Add close button to the header.** The meeting header area (portrait, breadcrumb, agenda) has room for a close/end action. This keeps it visible regardless of scroll position.
2. **Sticky footer on mobile.** Make the input bar and close button sticky at the bottom of the viewport on mobile, so they're always accessible.
3. **Move close into input area.** Add a menu or icon button near the send button that offers "Close Audience" as an option. This puts it adjacent to the primary interaction point.
