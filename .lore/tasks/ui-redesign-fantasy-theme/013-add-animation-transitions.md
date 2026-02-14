---
title: Add animation and transition effects
date: 2026-02-14
status: complete
tags: [task, css, animations, transitions]
source: .lore/plans/ui-redesign-fantasy-theme.md
related: [.lore/specs/ui-redesign-fantasy-theme.md]
sequence: 13
modules: [board, workshop, dashboard]
---

# Task: Add Animation and Transition Effects

## What

Add smooth animations and transitions to three component CSS files for hover states, status changes, and theme mode transitions.

**SessionCard.module.css** - Add smooth hover transitions:
```css
.card {
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.statusBadge {
  transition: background 0.25s ease, color 0.25s ease;
}
```

**ProcessingIndicator.module.css** - Brass-colored spinner:
```css
.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(184, 134, 11, 0.2);
  border-top-color: var(--color-brass);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

**app/globals.css** - Theme mode transition:
```css
* {
  transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease;
}

/* Disable transitions on theme change to prevent flash */
[data-theme-transitioning] * {
  transition: none !important;
}
```

## Validation

- `SessionCard.module.css`: `.card` has transition property for border-color, box-shadow, and background (0.2s ease)
- `SessionCard.module.css`: `.statusBadge` has transition for background and color (0.25s ease)
- `ProcessingIndicator.module.css`: `.spinner` is 28px circle with brass border-top, animation defined
- `@keyframes spin` animates rotation to 360deg
- `app/globals.css`: Universal selector (`*`) has transitions for background-color, color, border-color (0.3s ease)
- `[data-theme-transitioning]` disables transitions with `!important`

Verify by inspecting each file for transition properties, @keyframes definition, and theme transition CSS.

## Why

From `.lore/specs/ui-redesign-fantasy-theme.md`:

**REQ-UI-REDESIGN-21**: ProcessingIndicator uses animated spinner with brass color, 24-32px size, positioned inline with content

**REQ-UI-REDESIGN-51**: Smooth transitions on hover states (200-300ms ease timing)

**REQ-UI-REDESIGN-52**: Session card status changes animate badge color transition

**REQ-UI-REDESIGN-53**: Panel blur effect applies smoothly when background loads

**REQ-UI-REDESIGN-54**: Theme mode transitions (light to dark) animate smoothly (300-400ms ease on color properties)

**Success Criteria**: Theme toggle switches between modes with smooth color transitions

## Files

- `components/board/SessionCard.module.css` (modify)
- `components/workshop/ProcessingIndicator.module.css` (modify)
- `app/globals.css` (modify)
