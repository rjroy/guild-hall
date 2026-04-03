---
title: "Raw color values in CSS Modules"
date: 2026-04-03
status: open
---

Multiple `.module.css` files contain hardcoded color values (hex, rgb, rgba) instead of `var(--color-*)` design tokens from `globals.css`. CLAUDE.md already prohibits this ("No raw color values in CSS Modules"), but enforcement is manual and existing violations have accumulated.

Surfaced during commission cleanup when Thorne flagged `rgba(184, 134, 11, 0.3)` in `CollapsibleSidebar.module.css`, but the problem is systemic, not isolated to one component.

## Scope

Need to determine:
- How many `.module.css` files have violations
- Whether existing tokens cover the needed colors, or new tokens are required
- Whether this is a single sweep commission or needs new tokens designed first
