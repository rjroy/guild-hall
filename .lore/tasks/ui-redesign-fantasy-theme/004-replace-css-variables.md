---
title: Replace CSS variables with fantasy theme colors
date: 2026-02-14
status: complete
tags: [task, css, theme, colors]
source: .lore/plans/ui-redesign-fantasy-theme.md
related: [.lore/specs/phase-1/ui-redesign-fantasy-theme.md]
sequence: 4
modules: [dashboard]
---

# Task: Replace CSS Variables with Fantasy Theme Colors

## What

Replace the Phase I CSS variable definitions in `:root` and media query sections of `app/globals.css` with fantasy theme colors. Remove the `@media (prefers-color-scheme: dark)` approach and replace with explicit theme selectors.

Define three sections:

1. **`:root`** - Typography and shared accent/status colors (same for both modes)
2. **`:root, [data-theme="dark"]`** - Dark mode colors (default)
3. **`[data-theme="light"]`** - Light mode colors

Remove all Phase I color values (`#ffffff`, `#f8f9fa`, `#0a0a0a`, `#111113`).

Color palette from spec:
- Ambers: `#F4D58D`, `#E8C170`, `#D4A574`, `#C79A5C`
- Brass/Bronze: `#B8860B`, `#CD7F32`
- Browns: `#5C4033`, `#3E2723`
- Status: Idle `#6B7280`, Running `#10B981`, Completed `#3B82F6`, Expired `#F59E0B`, Error `#EF4444`

Dark mode panels: `rgba(26, 26, 26, 0.85)`, `rgba(36, 36, 36, 0.8)`
Light mode panels: `rgba(245, 241, 232, 0.85)`, `rgba(237, 232, 220, 0.8)`

## Validation

- `app/globals.css` defines CSS variables in `:root`, `:root` + `[data-theme="dark"]`, and `[data-theme="light"]` sections
- All Phase I color values (`#ffffff`, `#f8f9fa`, `#0a0a0a`, `#111113`) removed
- Typography variables use `--font-primary` and `--font-mono` referencing the font families
- Panel variables include `--panel-bg`, `--panel-border`, `--panel-shadow`, `--panel-backdrop-blur`
- Card variables include `--card-bg`, `--card-border`, `--card-hover-bg`, `--card-hover-border`
- Text variables include `--text-primary`, `--text-secondary`, `--text-muted`
- Status color variables defined: `--status-idle`, `--status-running`, `--status-completed`, `--status-expired`, `--status-error`

Verify by grepping for Phase I colors:
```bash
grep -E "#ffffff|#f8f9fa|#0a0a0a|#111113" app/globals.css  # Should return empty
```

Verify variable definitions exist:
```bash
grep -E "^  --color-brass:|^  --panel-bg:|^  --text-primary:" app/globals.css  # Should find matches
```

## Why

From `.lore/specs/phase-1/ui-redesign-fantasy-theme.md`:

**REQ-UI-REDESIGN-5**: Primary color palette uses warm tones: ambers (#D4A574, #C79A5C), golds (#E8C170, #F4D58D), and browns (#5C4033, #3E2723)

**REQ-UI-REDESIGN-6**: Accent colors for borders and highlights use brass (#B8860B) and bronze (#CD7F32)

**REQ-UI-REDESIGN-7**: Status colors use semantic mapping: Idle=gray, Running=green, Completed=blue, Expired=amber, Error=red

**REQ-UI-REDESIGN-8**: Dark mode (default) uses dark charcoal panels (#1A1A1A, #242424) with 80-90% opacity

**REQ-UI-REDESIGN-9**: Light mode uses light cream/parchment panels (#F5F1E8, #EDE8DC) with 80-90% opacity

**REQ-UI-REDESIGN-10**: Both modes share the same warm accent colors (brass, bronze, ambers, golds) and status colors

**REQ-UI-REDESIGN-11**: Update CSS variables in `:root` and theme-specific selectors (e.g., `[data-theme="dark"]`, `[data-theme="light"]`) to define both color modes

**REQ-UI-REDESIGN-12**: Update globals.css to include fantasy theme CSS variables and remove Phase I theme variables

**Success Criteria**:
- globals.css and theme configuration files updated with fantasy theme variables
- All CSS variables updated to warm color palette (brass, bronze, ambers, golds)
- No Phase I CSS background colors (#ffffff, #f8f9fa, #0a0a0a, #111113) remain in any .module.css files

## Files

- `app/globals.css` (modify)
