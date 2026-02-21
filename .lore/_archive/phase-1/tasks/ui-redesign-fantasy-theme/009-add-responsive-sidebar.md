---
title: Add responsive sidebar behavior for mobile
date: 2026-02-14
status: complete
tags: [task, css, responsive, mobile]
source: .lore/plans/phase-1/ui-redesign-fantasy-theme.md
related: [.lore/specs/phase-1/ui-redesign-fantasy-theme.md]
sequence: 9
modules: [roster, dashboard]
---

# Task: Add Responsive Sidebar Behavior for Mobile

## What

Add responsive CSS to collapse RosterPanel to icon-only mode on mobile (below 768px) in two files.

**RosterPanel.module.css** - Icon-only mode on mobile:
```css
.panel {
  /* Existing glassmorphic styles from previous task */
}

@media (max-width: 767px) {
  .panel {
    width: 56px;
  }

  .memberName,
  .toolCount {
    display: none;
  }

  .avatar {
    width: 40px;
    height: 40px;
  }

  /* Show only avatar icons, hide all text */
}
```

**app/page.module.css** - Update dashboard grid to accommodate narrower sidebar on mobile:
```css
@media (max-width: 767px) {
  .container {
    grid-template-columns: 56px 1fr;
  }
}
```

This creates an icon-only sidebar at mobile widths while preserving the full sidebar on desktop.

## Validation

- `RosterPanel.module.css`: Mobile breakpoint (`@media (max-width: 767px)`) sets panel width to 56px
- Mobile styles hide `.memberName` and `.toolCount` (`display: none`)
- Mobile avatar size reduced to 40x40px
- `app/page.module.css`: Mobile breakpoint adjusts grid to `56px 1fr`
- Desktop layout (>=768px) remains unchanged

Verify by inspecting both files for `@media (max-width: 767px)` queries and the specified property changes.

## Why

From `.lore/specs/phase-1/ui-redesign-fantasy-theme.md`:

**REQ-UI-REDESIGN-44**: Mobile breakpoint (below 768px) collapses RosterPanel to icon-only sidebar (48-64px wide)

**Success Criteria**: Responsive breakpoints verified at 767px, 768px, 1199px, 1200px showing correct column transitions

## Files

- `components/roster/RosterPanel.module.css` (modify)
- `app/page.module.css` (modify)
