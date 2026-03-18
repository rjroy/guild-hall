---
title: Responsive layout for dashboard and project pages
date: 2026-03-04
status: executed
tags: [css, responsive, layout, breakpoints, design-system]
modules: [next-app, css-design-system]
related: [.lore/issues/responsive-layout.md, .lore/retros/mobile-roster-layout-fix.md, .lore/retros/dialog-scroll-mobile-fix.md, .lore/retros/ui-redesign-fantasy-theme.md]
---

# Plan: Responsive Layout

## Goal

Make the Guild Hall UI usable on tablet (~768px) and phone (~480px) viewports. The app is desktop-first, so the approach is progressive: desktop layout stays as-is, with media query overrides at two breakpoints. Fantasy chrome stays intact at all sizes rather than being stripped on mobile. CSS-only changes, no component refactoring.

## Codebase Context

**Current layout state:**
- Dashboard (`web/app/page.module.css`) uses a fixed 3-column CSS Grid: `260px 1fr 320px` with named areas (sidebar, briefing, depMap, recent, audiences). Zero media queries. This is the most fragile layout. Note: the CSS class is `.recentArtifacts` but the grid area name is `recent`.
- Project page (`web/app/projects/[name]/page.module.css`) uses flexbox column with `max-width: 960px`. Already vertically stacked but has no responsive padding/spacing adjustments.
- Meeting, Commission, and Artifact views use a flex-row layout with fixed-width sidebars (260-280px) that already stack at 768px via existing media queries.

**Existing breakpoint pattern:**
- 5 files already have media queries: MeetingView, CommissionView, ArtifactView (768px), MeetingHeader, CommissionHeader (600px).
- Pattern: `flex-direction: column` at 768px, sidebar goes `width: 100%`. Headers reduce padding at 600px.
- No breakpoint tokens in `globals.css`. All breakpoints are hardcoded.

**Fantasy chrome patterns:**
- Panel component (`Panel.module.css`): `border-image` (30px width, 120 slice), `backdrop-filter: blur(12px)`, paper texture `::before` overlay.
- Headers: `border-image` with scroll-window-dark (50px width, 52 slice), `border-radius: 50px`.
- ChatInterface: ornate border via `::before` pseudo-element (40px border).
- Gem indicators: 16px (sm) and 24px (md) sizes with CSS filter tints.

**Vendor prefix requirement (from CLAUDE.md):**
`-webkit-backdrop-filter` must appear BEFORE `backdrop-filter` in CSS or Next.js drops the standard property during compilation. Any media query that touches backdrop-filter must preserve this order.

**Prior retro lessons:**
- Vertical stacking works for content panels; icon sidebars don't work when the sidebar shows rich content (retro: mobile-roster-layout-fix).
- Dialogs with scrollable bodies need `flex-column` + `max-height` + `min-height: 0`, not whole-container overflow (retro: dialog-scroll-mobile-fix).
- Both bugs were caught by real device testing, not dev tools.

## Implementation Steps

Work is organized in three phases by impact. Each phase is independently shippable.

### Phase 1: Dashboard (highest impact)

#### Step 1: Add breakpoint tokens to globals.css

**Files**: `web/app/globals.css`
**Expertise**: none

Add CSS custom properties for the two standard breakpoints. These are documentation, not functional (CSS custom properties can't be used in media query conditions), but they establish the convention and make the values grep-able.

```css
/* Breakpoints (reference only -- CSS custom properties
   cannot be used in @media conditions) */
--breakpoint-tablet: 768px;
--breakpoint-phone: 480px;
```

Add to the `:root` block after the spacing scale.

#### Step 2: Dashboard tablet breakpoint (768px)

**Files**: `web/app/page.module.css`
**Expertise**: none

At `max-width: 768px`, collapse the three-column grid to a single column. The named grid areas make this straightforward: redefine the template to stack areas vertically in a sensible reading order.

```css
@media (max-width: 768px) {
  .dashboard {
    grid-template-columns: 1fr;
    grid-template-rows: auto;
    grid-template-areas:
      "sidebar"
      "briefing"
      "depMap"
      "audiences"
      "recent";
    padding: var(--space-md);
  }
}
```

The grid area names in the template string must match the `grid-area` declarations (e.g., `recent`, not `recentArtifacts`). The `.recentArtifacts` class has no explicit `grid-row` span to clear; the single-column template handles the reflow automatically.

Reading order rationale: sidebar (navigation) first, then briefing (primary content), dependency map, audiences, recent artifacts last (reference content).

#### Step 3: Dashboard phone breakpoint (480px)

**Files**: `web/app/page.module.css`
**Expertise**: none

At `max-width: 480px`, reduce padding further and tighten the gap.

```css
@media (max-width: 480px) {
  .dashboard {
    padding: var(--space-sm);
    gap: var(--space-sm);
  }
}
```

### Phase 2: Project pages

#### Step 4: Project and route page responsive adjustments

**Files**: `web/app/projects/[name]/page.module.css`, `web/app/projects/[name]/commissions/[id]/page.module.css`, `web/app/projects/[name]/meetings/[id]/page.module.css`
**Expertise**: none

The project page and its child route pages (commission detail, meeting detail) all use the same structure: flex column with `max-width: 960px`, `padding: var(--space-lg)`, and no media queries. The project page is already single-column, so the issue's "single-column fallback" requirement is met. The work here is padding/spacing adjustments for smaller viewports and removing the max-width constraint on phones where gutter space is wasted.

Apply to all three page files:

```css
@media (max-width: 768px) {
  .projectView { /* or .commissionPage, .meetingPage -- match the existing class */
    padding: var(--space-md);
  }
}

@media (max-width: 480px) {
  .projectView {
    padding: var(--space-sm);
    gap: var(--space-sm);
    max-width: 100%;
  }
}
```

Verify that the list components inside the project page (`ArtifactList`, `MeetingList`, `CommissionList` in `web/components/project/`) don't have fixed widths or horizontal layouts that would break at narrow viewports. If they do, add them to this step. If they use flex-wrap or are already vertical, no changes needed.

#### Step 5: Align existing view breakpoints

**Files**: `web/components/meeting/MeetingView.module.css`, `web/components/meeting/MeetingHeader.module.css`, `web/components/commission/CommissionView.module.css`, `web/components/commission/CommissionHeader.module.css`, `web/app/projects/[name]/artifacts/[...path]/page.module.css`
**Expertise**: none

The existing media queries are already correct (768px for layout, 600px for header details). No structural changes needed. Add the 480px phone breakpoint to reduce padding and gap for the content areas within these views.

Add a 480px media query to each file, using the correct class name for that file:

| File | Class to target | Notes |
|------|----------------|-------|
| `MeetingView.module.css` | `.meetingContent` | Main content flex container |
| `CommissionView.module.css` | `.content` | Main content flex container |
| `artifacts/[...path]/page.module.css` | `.artifactView` | Main content flex container |

For each, add:

```css
@media (max-width: 480px) {
  .meetingContent { /* use the correct class per the table above */
    gap: var(--space-sm);
  }
}
```

For each header with a 600px breakpoint, no additional change needed (600px already handles narrow screens).

### Phase 3: Fantasy chrome polish

#### Step 6: Scale border-image widths at phone size

**Files**: `web/components/ui/Panel.module.css`, `web/components/meeting/MeetingHeader.module.css`, `web/components/commission/CommissionHeader.module.css`, `web/components/meeting/ChatInterface.module.css`, `web/components/artifact/ArtifactContent.module.css`
**Expertise**: none

At 480px, the 30-50px border-image widths consume too much screen space. Scale them down proportionally. The `border-image-slice` stays the same (it's a unitless pixel value into the source image); only `border-image-width` changes. The `border` property (the underlying transparent border that establishes clipping geometry) may also need to scale to avoid visual artifacts where the border image and border region mismatch.

**Panel** (`Panel.module.css`): Desktop has `border: 10px solid transparent`, `border-image-width: 30px`, `border-radius: 30px`.

```css
@media (max-width: 480px) {
  .panel {
    border-width: 6px;
    border-image-width: 18px;
    border-radius: 18px;
  }
}
```

**Headers** (`MeetingHeader.module.css`, `CommissionHeader.module.css`): Desktop has `padding: var(--space-sm) 50px`, `border-image-width: 50px`, `border-radius: 50px`. The 600px breakpoint already reduces padding to `var(--space-sm) var(--space-md)` (16px horizontal). At 480px, the border-image-width must not exceed the available padding, or the decorative border will overlap content. Scale the border to match the reduced padding:

```css
@media (max-width: 480px) {
  .header {
    border-image-width: 16px;
    border-radius: 16px;
  }
}
```

**ChatInterface ornate border** (`ChatInterface.module.css`): The `::before` pseudo-element uses `position: absolute` but `.chatInterface` has no `position: relative`. This is a pre-existing positioning gap. Adding responsive rules to the pseudo-element is safe (it won't make the gap worse), but note that the ornate border may not be positioned correctly even at desktop. If this surfaces during testing, add `position: relative` to `.chatInterface` as a fix.

```css
@media (max-width: 480px) {
  .chatInterface::before {
    border-width: 24px;
    border-image-width: 24px;
  }
}
```

**ArtifactContent ornate borders** (`ArtifactContent.module.css`): Both `.viewer::before` and `.editor::before` have the same ornate border pattern (40px). Both need the same reduction:

```css
@media (max-width: 480px) {
  .viewer::before,
  .editor::before {
    border-width: 24px;
    border-image-width: 24px;
  }
}
```

**Gem indicators** (`GemIndicator.module.css`): The sm (16px) and md (24px) sizes are small enough to work at phone viewports without changes. If they appear in dense lists that overflow, the fix is in the parent container's layout, not the gem size. No CSS changes expected for gems.

### Validation

#### Step 7: Validate against goal

Launch a sub-agent that reads the Goal section above, reviews all CSS changes made in Steps 1-6, and checks:

1. Dashboard displays as single column at 768px and narrower
2. Project page has responsive padding and removes max-width constraint at 480px
3. Fantasy chrome elements (borders, glassmorphic panels) render without overflow or clipping at 480px
4. Vendor prefix order (`-webkit-backdrop-filter` before `backdrop-filter`) is preserved in all media queries
5. No existing desktop layout is broken (the desktop styles must remain untouched)
6. Breakpoints are consistent (768px for layout changes, 480px for spacing/chrome, 600px for headers only)

Additionally, the following should be verified manually on real devices or accurate emulators (not just browser dev tools, per retro lessons):
- Desktop layout is unchanged (verify at full width after all changes)
- Dashboard grid stacking order reads naturally on tablet
- Border images scale cleanly without visual artifacts at reduced sizes
- Header content is not overlapped by scaled border images at 480px
- Backdrop blur is visible on mobile Safari (requires `-webkit-` prefix)
- Touch targets are not obscured by scaled-down chrome elements
- ChatInterface ornate border is positioned correctly (pre-existing `position: absolute` without `position: relative` on parent)

## Delegation Guide

This plan is CSS-only and doesn't require specialized expertise. All steps can be handled by a general-purpose implementation agent.

Post-implementation review should use:
- **code-simplifier**: After all CSS changes, ensure consistency across the responsive styles
- **code-reviewer**: Verify CLAUDE.md compliance (vendor prefix order, CSS Modules conventions)

Manual device testing is recommended after implementation. Browser dev tools missed both prior mobile bugs (per retros).

## Open Questions

1. **WorkspaceSidebar at 768px**: The dashboard sidebar is 260px in the grid. When the grid collapses to single column, the sidebar content may benefit from a horizontal layout (e.g., worker cards in a row instead of a stack). This is a CSS-only concern but depends on how much content the sidebar typically shows. If the sidebar is short, simple stacking is fine. If it's long, consider `max-height` with scroll, similar to the dialog pattern from the retro.

2. **Dependency map visualization**: The dependency map (`depMap` grid area) may contain SVG or canvas elements that have their own sizing logic. If so, the responsive plan covers the container but the map content itself may need separate attention. Out of scope for this plan unless it causes visible overflow.

3. **Background image**: The body background (`background-image: url("/images/background.webp")`) uses `background-size: cover` and `background-attachment: fixed`. On iOS Safari, `background-attachment: fixed` has known performance issues and sometimes doesn't render. This is a pre-existing concern, not introduced by this plan, but worth noting.
