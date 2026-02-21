---
title: Build Roster frontend components
date: 2026-02-11
status: complete
tags: [task]
source: .lore/_archive/phase-1/plans/guild-hall-phase-1.md
sequence: 13
modules: [guild-hall]
related:
  - .lore/_archive/phase-1/specs/guild-hall-phase-1.md
  - .lore/_archive/phase-1/plans/guild-hall-phase-1.md
---

# Task: Build Roster frontend components

## What

Build the Roster panel and establish the dashboard layout. This is the first frontend task, so it also sets up the layout that the Board and Workshop will share.

**Dashboard layout** (modify `app/page.tsx`): Two-column layout with Roster on one side and Board on the other. The Roster is a shared component that also appears in the Workshop sidebar.

**components/roster/RosterPanel.tsx**: Fetches guild members from `GET /api/roster`. Renders a list of `GuildMemberCard` components. Handles loading and error states.

**components/roster/GuildMemberCard.tsx**: Displays name, description, connection status indicator (connected/disconnected/error), and tool count. Click to expand and show `ToolList`. Error-status guild members show their error message.

**components/roster/ToolList.tsx**: Expanded view within a guild member card. Shows individual tools with name and description. Each tool has an "Invoke" button that opens the invoke form.

**components/roster/ToolInvokeForm.tsx**: Dynamic form from tool's JSON Schema input. Phase I: custom implementation supporting basic types only (string, number, boolean, enum, required/optional). For complex nested schemas, render a raw JSON textarea as fallback. Submit calls `POST /api/tools/invoke`. Displays result inline below the form.

## Validation

- RosterPanel renders guild members fetched from the API
- RosterPanel shows loading state while fetching
- GuildMemberCard displays name, description, status indicator, tool count
- GuildMemberCard with error status shows error message
- Clicking a guild member card expands to show ToolList
- ToolList renders tool names and descriptions
- ToolInvokeForm generates input fields for string, number, boolean parameters
- ToolInvokeForm renders JSON textarea for complex schemas
- Submitting the form calls the invoke API and displays the result
- Roster renders in both dashboard layout and (placeholder for) workshop sidebar

## Why

REQ-GH1-6: "The Roster displays all discovered guild members with name, description, connection status, and tool count."

REQ-GH1-7: "Expanding a guild member in the Roster reveals its individual tools with their names and descriptions."

REQ-GH1-8: "Users can invoke any tool directly from the Roster by selecting it, providing inputs via a form, and receiving the result."

REQ-GH1-9: "The Roster is visible from both the dashboard and within the Workshop."

## Files

- `app/page.tsx` (modify, add dashboard layout)
- `components/roster/RosterPanel.tsx` (create)
- `components/roster/GuildMemberCard.tsx` (create)
- `components/roster/ToolList.tsx` (create)
- `components/roster/ToolInvokeForm.tsx` (create)
- `tests/components/roster.test.tsx` (create)
