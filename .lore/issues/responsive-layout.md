---
title: Dashboard and project pages not responsive on mobile/tablet
date: 2026-02-25
status: resolved
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

## Resolution

Added responsive CSS breakpoints at 768px (tablet) and 480px (phone) across the UI. Changes are CSS-only with no component refactoring.

**Phase 1 (Dashboard):** Added breakpoint reference tokens to `globals.css`. Dashboard 3-column grid collapses to single column at 768px with stacked areas (sidebar, briefing, depMap, audiences, recent). At 480px, padding and gap reduce further.

**Phase 2 (Project pages):** Project, commission detail, and meeting detail pages get reduced padding at 768px. At 480px, padding tightens further, gap shrinks, and max-width constraint is removed to reclaim gutter space. Added 480px gap reduction to MeetingView, CommissionView, and ArtifactView content areas (which already had 768px layout breakpoints).

**Phase 3 (Fantasy chrome):** Panel border-image-width scales from 30px to 18px at 480px. Meeting and commission header border-image-width scales from 50px to 16px at 480px (matching the reduced padding from the existing 600px breakpoint). ChatInterface and ArtifactContent ornate border pseudo-elements scale from 40px to 24px at 480px.

All existing tests pass (1765/1765), typecheck clean, lint clean. Desktop layout is unchanged (all changes are within media queries).
