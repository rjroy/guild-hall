---
title: Dashboard and project pages not responsive on mobile/tablet
date: 2026-02-25
status: open
tags: [ui, layout, responsive, css]
modules: [next-app, css-design-system]
related: [.lore/plans/responsive-layout.md]
---

# Responsive Layout

## What Happened

The main dashboard and project pages don't display well on tablet or phone-sized viewports. The layout is not reactive to screen size.

## Why It Matters

The fantasy chrome CSS (image-based borders, glassmorphic panels, fixed-width layouts) was designed for desktop. Anyone checking Guild Hall from a tablet or phone gets a broken experience. If the tool is used during meetings or away from a desk, this becomes a real friction point.

## Fix Direction

Add responsive breakpoints to the CSS design system. Key areas to address:

1. Dashboard layout (cards, dependency map, pending audiences) needs to stack or reflow at narrower widths.
2. Project page (artifact list, meeting list, commission list) needs single-column fallback.
3. Fantasy chrome elements (image borders, gem indicators) need to degrade gracefully at small sizes rather than overflow or clip.
4. Test at common breakpoints: ~768px (tablet portrait), ~480px (phone).
