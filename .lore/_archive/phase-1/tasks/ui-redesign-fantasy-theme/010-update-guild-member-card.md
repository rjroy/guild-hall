---
title: Update guild member card with avatar styling
date: 2026-02-14
status: complete
tags: [task, css, avatar, members]
source: .lore/_archive/phase-1/plans/ui-redesign-fantasy-theme.md
related: [.lore/_archive/phase-1/specs/ui-redesign-fantasy-theme.md]
sequence: 10
modules: [roster]
---

# Task: Update Guild Member Card with Avatar Styling

## What

Update `GuildMemberCard.module.css` to add circular avatar with positioned status dot and member text styling.

Add circular avatar with responsive sizing:
```css
.avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  position: relative;
}

@media (max-width: 767px) {
  .avatar {
    width: 48px;
    height: 48px;
  }
}
```

Add status dot positioned at bottom-right of avatar:
```css
.statusDot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  position: absolute;
  bottom: -2px;
  right: -2px;
  border: 2px solid var(--panel-bg);
}

.statusDot.active {
  background: var(--status-running);
}

.statusDot.offline {
  background: var(--status-idle);
}
```

Add member text styling:
```css
.memberName {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
}

.toolCount {
  font-size: 13px;
  color: var(--text-secondary);
}
```

## Validation

- `.avatar` is circular (50% border-radius), 64px desktop, 48px mobile (<768px)
- `.statusDot` is 10px circle, positioned `absolute` at `bottom: -2px, right: -2px`
- Status dot has 2px border in panel background color
- `.active` status uses `var(--status-running)` (green)
- `.offline` status uses `var(--status-idle)` (gray)
- `.memberName` is 15px, weight 500, primary text color
- `.toolCount` is 13px, secondary text color

Verify by inspecting `GuildMemberCard.module.css` for these CSS properties and values.

## Why

From `.lore/_archive/phase-1/specs/ui-redesign-fantasy-theme.md`:

**REQ-UI-REDESIGN-26**: GuildMemberCard displays circular avatar thumbnail (48px on mobile, 64px on desktop)

**REQ-UI-REDESIGN-27**: Online status indicator appears as colored dot (10px) positioned at bottom-right of avatar circle, extending slightly outside avatar boundary (green=active, gray=offline)

**REQ-UI-REDESIGN-28**: Guild member names use clean, readable typography (sans-serif, 14-16px)

**REQ-UI-REDESIGN-29**: Tool count and status appear as secondary text below name

**Success Criteria**: GuildMemberCard shows circular avatar (48px mobile, 64px desktop) with 10px status dot at bottom-right

## Files

- `components/roster/GuildMemberCard.module.css` (modify)
