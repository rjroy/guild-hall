---
title: Update session card status badges and participant avatars
date: 2026-02-14
status: complete
tags: [task, css, badges, status]
source: .lore/_archive/phase-1/plans/ui-redesign-fantasy-theme.md
related: [.lore/_archive/phase-1/specs/ui-redesign-fantasy-theme.md]
sequence: 11
modules: [board, session-board]
---

# Task: Update Session Card Status Badges and Participant Avatars

## What

Update `SessionCard.module.css` to style status badges as colored pills with Phase I status mapping and add participant avatar styling.

Add status badge base and variant styles:
```css
.statusBadge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  text-transform: capitalize;
}

.statusBadge.idle {
  background: var(--status-idle);
  color: white;
}

.statusBadge.running {
  background: var(--status-running);
  color: white;
}

.statusBadge.completed {
  background: var(--status-completed);
  color: white;
}

.statusBadge.expired {
  background: var(--status-expired);
  color: white;
}

.statusBadge.error {
  background: var(--status-error);
  color: white;
}
```

Add participant avatar styling with overlap:
```css
.participants {
  display: flex;
  margin-top: 8px;
}

.participantAvatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid var(--panel-bg);
  margin-left: -8px;
}

.participantAvatar:first-child {
  margin-left: 0;
}
```

## Validation

- `.statusBadge` is an inline pill (12px radius, 4px/12px padding, 12px font, capitalize text)
- Five status variants defined: `.idle`, `.running`, `.completed`, `.expired`, `.error`
- Each variant uses corresponding `--status-*` variable and white text
- Status mapping: Idle=gray (#6B7280), Running=green (#10B981), Completed=blue (#3B82F6), Expired=amber (#F59E0B), Error=red (#EF4444)
- `.participants` is flex container with 8px top margin
- `.participantAvatar` is 28px circle with 2px panel-bg border, -8px left margin (except first child)

Verify by inspecting `SessionCard.module.css` for these CSS properties and status color variables.

## Why

From `.lore/_archive/phase-1/specs/ui-redesign-fantasy-theme.md`:

**REQ-UI-REDESIGN-30**: Session title uses prominent typography (16-18px, medium weight)

**REQ-UI-REDESIGN-31**: Status badge appears as colored pill with Phase I status values mapped to colors: Idle=gray, Running=green, Completed=blue, Expired=amber, Error=red

**REQ-UI-REDESIGN-32**: Timestamp appears in secondary text size (12-14px to match card text hierarchy) with clock icon

**REQ-UI-REDESIGN-33**: Participant avatars (if multiple) appear as overlapping circles

**Success Criteria**: Session cards show status badge with correct Phase I status colors, 12-14px timestamp, and hover glow effect

## Files

- `components/board/SessionCard.module.css` (modify)
