---
title: Build Board frontend components
date: 2026-02-11
status: pending
tags: [task]
source: .lore/plans/guild-hall-phase-1.md
sequence: 14
modules: [guild-hall]
---

# Task: Build Board frontend components

## What

**components/board/BoardPanel.tsx**: Fetches sessions from `GET /api/sessions`. Renders session cards sorted by last activity (API returns them sorted). Includes a "New Session" button that opens the creation dialog. Handles loading and empty states.

**components/board/SessionCard.tsx**: Displays session name, status (with visual indicator: color or icon per status), configured guild members (as small badges), last activity timestamp (relative: "2 minutes ago"), message count. Clicking navigates to `/sessions/[id]`.

**components/board/CreateSessionDialog.tsx**: Modal or slide-over panel. User enters session name (text input), selects guild members from the roster (checkboxes, fetched from `GET /api/roster`). Submit calls `POST /api/sessions`. On success, navigates to `/sessions/[id]` (the new session's Workshop).

Integrate BoardPanel into the dashboard layout from task 013 (the second column alongside the Roster).

## Validation

- BoardPanel renders session cards from the API
- BoardPanel shows empty state when no sessions exist
- Session cards display all required fields (name, status, guild members, timestamp, count)
- Session status has distinct visual indicators for each status value
- Clicking a session card navigates to `/sessions/[id]`
- "New Session" button opens CreateSessionDialog
- CreateSessionDialog lists available guild members as checkboxes
- Submitting the dialog creates a session and navigates to the Workshop
- Sessions are displayed sorted by most recent activity

## Why

REQ-GH1-10: "The Board displays session cards for all known sessions, sorted by most recent activity."

REQ-GH1-11: "Each session card shows: session name, status, configured guild members, last activity timestamp, and message count."

REQ-GH1-12: "Clicking a session card navigates to that session's Workshop view."

REQ-GH1-13: "The Board provides a control to create a new session. The user provides a name and selects which guild members to include."

## Files

- `components/board/BoardPanel.tsx` (create)
- `components/board/SessionCard.tsx` (create)
- `components/board/CreateSessionDialog.tsx` (create)
- `app/page.tsx` (modify, integrate BoardPanel)
- `tests/components/board.test.tsx` (create)
