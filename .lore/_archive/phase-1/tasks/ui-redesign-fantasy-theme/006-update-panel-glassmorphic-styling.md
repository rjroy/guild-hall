---
title: Update panel components with glassmorphic styling
date: 2026-02-14
status: complete
tags: [task, css, glassmorphism, panels]
source: .lore/_archive/phase-1/plans/ui-redesign-fantasy-theme.md
related: [.lore/_archive/phase-1/specs/ui-redesign-fantasy-theme.md]
sequence: 6
modules: [roster, board, workshop]
---

# Task: Update Panel Components with Glassmorphic Styling

## What

Apply glassmorphic effect to all panel components by updating the main panel container class in each module CSS file. This step focuses on glassmorphic visual effects only. Responsive behavior (icon-only sidebar, collapsible drawers) is handled in later tasks.

For each panel file, update the `.panel` class:
```css
.panel {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  backdrop-filter: blur(var(--panel-backdrop-blur));
  -webkit-backdrop-filter: blur(var(--panel-backdrop-blur));
  box-shadow: 0 4px 6px var(--panel-shadow);
  /* Preserve existing layout properties (padding, height, etc.) */
}
```

For CreateSessionDialog and ConfirmDialog modals, add backdrop styling:
```css
.backdrop {
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
}

.dialog {
  background: var(--panel-bg);
  border: 2px solid var(--panel-border);
  border-radius: 12px;
  backdrop-filter: blur(var(--panel-backdrop-blur));
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
}
```

Update breadcrumb navigation in WorkshopView (use existing class names `.breadcrumbLink` and `.breadcrumbSep`):
```css
.breadcrumbLink {
  color: var(--color-brass);
  text-decoration: none;
}

.breadcrumbLink:hover {
  color: var(--color-amber);
}

.breadcrumbSep {
  color: var(--text-muted);
  opacity: 0.6;
}
```

## Validation

All five panel files have glassmorphic styling applied:
- `RosterPanel.module.css`: `.panel` uses `backdrop-filter: blur(var(--panel-backdrop-blur))`, `border: 1px solid var(--panel-border)`, `border-radius: 10px`
- `BoardPanel.module.css`: Same glassmorphic properties
- `WorkshopView.module.css`: Same glassmorphic properties + breadcrumb styles (`.breadcrumbLink` brass color, `.breadcrumbSep` muted)
- `CreateSessionDialog.module.css`: `.backdrop` blur + `.dialog` glassmorphic with 12px radius
- `ConfirmDialog.module.css`: `.backdrop` blur + `.dialog` glassmorphic with 12px radius

Existing layout properties (padding, height, width, grid/flex) preserved - only visual glassmorphic effects added.

Verify by inspecting each file for `backdrop-filter`, `border-radius`, and `var(--panel-bg)` usage.

## Why

From `.lore/_archive/phase-1/specs/ui-redesign-fantasy-theme.md`:

**REQ-UI-REDESIGN-14**: All panels (RosterPanel, BoardPanel, Workshop container, CreateSessionDialog) use glassmorphic effect: 80-90% opacity background, 8-12px backdrop blur, 1-2px brass borders

**REQ-UI-REDESIGN-15**: Panel corners have 8-12px border radius for softer appearance

**REQ-UI-REDESIGN-16**: Panels cast subtle shadows to create layering effect over background (4-8px blur, 20-30% opacity, 2-4px vertical offset)

**REQ-UI-REDESIGN-17**: CreateSessionDialog appears as modal overlay with same glassmorphic panel styling, centered on viewport, with darkened backdrop (40-50% opacity) behind it

**REQ-UI-REDESIGN-22**: Breadcrumb navigation uses brass accent color for links, amber on hover, separated by '/' with subtle opacity on non-current segments

**Success Criteria**: RosterPanel and BoardPanel use 80-90% opacity, 8-12px backdrop blur, 1-2px brass borders

## Files

- `components/roster/RosterPanel.module.css` (modify)
- `components/board/BoardPanel.module.css` (modify)
- `components/workshop/WorkshopView.module.css` (modify)
- `components/board/CreateSessionDialog.module.css` (modify)
- `components/ui/ConfirmDialog.module.css` (modify)
