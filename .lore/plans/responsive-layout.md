---
title: Responsive layout support for dashboard and project pages
date: 2026-02-27
status: draft
tags: [css, responsive, layout, ui, mobile, tablet]
modules: [dashboard, project-view, panel, fantasy-chrome, css-design-system]
related: [.lore/issues/responsive-layout.md]
---

# Plan: Responsive Layout Support

## Goal

Make the dashboard and project pages usable on tablet (768px) and phone (480px) viewports. The fantasy chrome (image borders, glassmorphic panels, gem indicators) should degrade gracefully rather than overflow or clip.

## Current State

**What already works.** Five CSS modules already have `@media` queries at 768px or 600px:
- `MeetingView.module.css` (sidebar stacks below chat at 768px)
- `CommissionView.module.css` (sidebar stacks below main at 768px)
- `CommissionHeader.module.css` (padding/radius reduction at 600px)
- `MeetingHeader.module.css` (padding/radius reduction at 600px)
- Artifact page `page.module.css` (sidebar stacks below main at 768px)

**What does not work.** The two primary views, dashboard and project, have no responsive rules at all. The dashboard uses a three-column CSS grid with fixed column widths (`260px 1fr 320px`) that overflows on anything below ~900px. The project page has `max-width: 960px` which is fine for tablet but no phone adjustments.

**Fantasy chrome issues.** Three border-image patterns are used across 10+ components:
1. `border.webp` (Panel, WorkerPicker dialog, ArtifactsPanel): `border-image-width: 30px`. On a 320px phone, 60px of border on a 280px-wide panel is excessive.
2. `border-ornate.webp` (ChatInterface, ArtifactContent viewer/editor): `border-image-width: 40px`. Same problem at higher severity.
3. `scroll-window-dark.webp` (ProjectTabs, MeetingHeader, CommissionHeader, ArtifactProvenance): `border-image-width: 20-50px` with large horizontal padding (50px). On narrow screens, the 50px left/right padding pushes content to a sliver.

GemIndicator sizes (16px sm, 24px md) are fine at all breakpoints. No changes needed there.

WorkerPortrait frame sizes are 48/72/96px. The `md` and `lg` sizes may feel oversized on phone but they are already used selectively. No changes needed in Phase 1.

## Breakpoints

Define two custom properties in `globals.css` as documentation (CSS custom properties can't be used in media queries, but the values should be consistent):

| Token | Value | Target |
|-------|-------|--------|
| Tablet | 768px | iPad portrait, smaller laptops |
| Phone | 480px | iPhone, Android phones |

These align with the existing 768px breakpoints already used in the codebase.

## Implementation Steps

### Step 1: Design system foundation (`globals.css`)

Add responsive custom properties for border chrome sizes. This gives each component a single value to reference, making future adjustments easier.

**File:** `app/globals.css`

Add after the existing `:root` block:

```css
/* Responsive border chrome */
:root {
  --chrome-border-width: 30px;
  --chrome-border-ornate-width: 40px;
  --chrome-scroll-border-width: 50px;
  --chrome-scroll-padding: 50px;
}

@media (max-width: 768px) {
  :root {
    --chrome-border-width: 20px;
    --chrome-border-ornate-width: 28px;
    --chrome-scroll-border-width: 30px;
    --chrome-scroll-padding: 24px;
  }
}

@media (max-width: 480px) {
  :root {
    --chrome-border-width: 14px;
    --chrome-border-ornate-width: 18px;
    --chrome-scroll-border-width: 16px;
    --chrome-scroll-padding: var(--space-md);
  }
}
```

This is the single source of truth for chrome degradation. All subsequent component changes reference these variables.

### Step 2: Panel chrome degradation (`Panel.module.css`)

The Panel is the most-used fantasy chrome component. Reducing its border at narrow widths prevents overflow across every page that uses it.

**File:** `components/ui/Panel.module.css`

Changes:
- Replace `border-image-width: 30px` with `border-image-width: var(--chrome-border-width)`
- Replace `border-radius: 30px` with a responsive value. At 480px, a 30px radius on a small panel wastes too much corner space. Use `border-radius: min(30px, 5vw)` or add a media query to reduce to 16px.

```css
.panel {
  /* ... existing ... */
  border-image-width: var(--chrome-border-width);
  border-radius: 30px;
}

@media (max-width: 480px) {
  .panel {
    border-radius: 16px;
  }
}
```

### Step 3: WorkerPicker dialog chrome (`WorkerPicker.module.css`)

The dialog duplicates Panel's border-image pattern. Apply the same responsive variable.

**File:** `components/ui/WorkerPicker.module.css`

Changes:
- Replace `border-image-width: 30px` with `var(--chrome-border-width)`
- Replace `border-radius: 30px` with responsive value matching Panel

```css
.dialog {
  /* ... */
  border-image-width: var(--chrome-border-width);
}

@media (max-width: 480px) {
  .dialog {
    border-radius: 16px;
  }
}
```

### Step 4: Scroll-window chrome degradation

Four components use the scroll-window-dark border image with 50px padding. Each needs the same treatment.

**Files:**
- `components/project/ProjectTabs.module.css` (border-image-width: 20px, no horizontal padding issue)
- `components/meeting/MeetingHeader.module.css` (border-image-width: 50px, padding: 50px)
- `components/commission/CommissionHeader.module.css` (border-image-width: 50px, padding: 50px)
- `components/artifact/ArtifactProvenance.module.css` (border-image-width: 50px, padding: 50px)

Changes for MeetingHeader, CommissionHeader, ArtifactProvenance:
- Replace `border-image-width: 50px` with `var(--chrome-scroll-border-width)`
- Replace `padding: var(--space-sm) 50px` with `padding: var(--space-sm) var(--chrome-scroll-padding)`
- Replace `border-radius: 50px` with responsive value

MeetingHeader and CommissionHeader already have `@media (max-width: 600px)` blocks that reduce padding and radius. Merge those into the variable approach and remove the hardcoded 600px queries, letting the variables in Step 1 handle both breakpoints.

Changes for ProjectTabs:
- Replace `border-image-width: 20px` with `var(--chrome-border-width)` (it tracks the same scaling)
- The ProjectTabs padding is `0 10px` which is fine. No padding change needed.

### Step 5: Ornate border chrome degradation

Two components use `border-ornate.webp` with 40px width: ChatInterface and ArtifactContent.

**Files:**
- `components/meeting/ChatInterface.module.css`
- `components/artifact/ArtifactContent.module.css` (two locations: `.viewer::before` and `.editor::before`)

Changes:
- Replace `border-image-width: 40px` with `var(--chrome-border-ornate-width)` in all three pseudo-element declarations

The ArtifactsPanel (`components/meeting/ArtifactsPanel.module.css`) uses the standard `border.webp` and is covered by Step 2's variable.

### Step 6: Dashboard grid layout (`page.module.css`)

This is the primary layout change. The current grid:

```
grid-template-columns: 260px 1fr 320px;
grid-template-areas:
  "sidebar briefing   recent"
  "sidebar depMap     recent"
  "sidebar audiences  audiences";
```

This needs to collapse progressively.

**File:** `app/page.module.css`

**At 768px (tablet):** Drop the right sidebar. Stack recent artifacts below the dependency map. Keep the left sidebar.

```css
@media (max-width: 768px) {
  .dashboard {
    grid-template-columns: 220px 1fr;
    grid-template-areas:
      "sidebar briefing"
      "sidebar depMap"
      "sidebar recent"
      "sidebar audiences";
  }
}
```

**At 480px (phone):** Single column. Everything stacks vertically. Sidebar collapses to a horizontal project selector row.

```css
@media (max-width: 480px) {
  .dashboard {
    grid-template-columns: 1fr;
    grid-template-areas:
      "sidebar"
      "briefing"
      "depMap"
      "recent"
      "audiences";
    padding: var(--space-md);
  }
}
```

### Step 7: WorkspaceSidebar phone adaptation (`WorkspaceSidebar.module.css`)

On phone, the sidebar occupies a full-width row instead of a fixed-width column. The project list should wrap horizontally.

**File:** `components/dashboard/WorkspaceSidebar.module.css`

```css
@media (max-width: 480px) {
  .guildTitle {
    font-size: 1.25rem;
    margin-bottom: var(--space-sm);
  }

  .projectList {
    flex-direction: row;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }

  .projectDescription {
    display: none;
  }

  .viewProjectLink {
    display: none;
  }
}
```

The project list becomes a horizontal row of compact project chips. Descriptions and "View project" links are hidden to save space. The gems and project names remain visible, providing the same navigation affordance.

### Step 8: DependencyMap and CommissionGraph overflow

The CommissionGraph SVG already has `overflow-x: auto` on its container, which handles horizontal overflow correctly. At phone widths the graph will be horizontally scrollable, which is acceptable for a DAG visualization.

**File:** `components/dashboard/DependencyMap.module.css`

The `max-width: 400px` on `.progress` will clip on narrow screens. Remove the max-width and let the parent container constrain it.

```css
.progress {
  /* remove max-width: 400px */
  max-width: 100%;
}
```

**File:** `components/commission/CommissionList.module.css`

Same issue with `.promptPreview`:

```css
.promptPreview {
  /* remove max-width: 400px */
  max-width: 100%;
}
```

### Step 9: MeetingRequestCard action buttons

On phone, the action button row in MeetingRequestCard can overflow if all buttons render.

**File:** `components/dashboard/MeetingRequestCard.module.css`

```css
@media (max-width: 480px) {
  .actions {
    flex-wrap: wrap;
  }

  .actionButton {
    flex: 1;
    min-width: 0;
    text-align: center;
  }
}
```

### Step 10: Project page phone adjustments

The project page uses `max-width: 960px` and flex column layout, which works at tablet. Phone needs reduced padding and ensures tab labels don't overflow.

**File:** `app/projects/[name]/page.module.css`

```css
@media (max-width: 480px) {
  .projectView {
    padding: var(--space-md);
  }
}
```

**File:** `components/project/ProjectTabs.module.css`

The tab bar uses `flex` with `gap: var(--space-xs)`. On very narrow screens with many tabs, they could overflow.

```css
@media (max-width: 480px) {
  .tabBar {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .tab {
    font-size: 0.8rem;
    padding: var(--space-xs) var(--space-xs);
    flex-shrink: 0;
  }
}
```

This makes the tab bar horizontally scrollable on phone, with smaller text.

### Step 11: Project header phone adjustments

The ProjectHeader `.actions` row already uses `flex-wrap: wrap`, which handles narrowing well. The heading size is fine. Only reduce padding.

**File:** `components/project/ProjectHeader.module.css`

```css
@media (max-width: 480px) {
  .heading {
    font-size: 1.4rem;
  }
}
```

### Step 12: Commission form phone adjustments

The CommissionForm's `.overridesFields` uses a horizontal flex layout for number inputs. On phone, these should stack.

**File:** `components/commission/CommissionForm.module.css`

```css
@media (max-width: 480px) {
  .overridesFields {
    flex-direction: column;
  }

  .form {
    padding: var(--space-md);
  }
}
```

## Files Changed (Summary)

| File | Change Type |
|------|-------------|
| `app/globals.css` | Add responsive chrome custom properties |
| `components/ui/Panel.module.css` | Use chrome variables, responsive border-radius |
| `components/ui/WorkerPicker.module.css` | Use chrome variables |
| `components/project/ProjectTabs.module.css` | Use chrome variables, phone scrollable tabs |
| `components/meeting/MeetingHeader.module.css` | Use chrome variables, merge existing query |
| `components/commission/CommissionHeader.module.css` | Use chrome variables, merge existing query |
| `components/artifact/ArtifactProvenance.module.css` | Use chrome variables |
| `components/meeting/ChatInterface.module.css` | Use ornate chrome variable |
| `components/artifact/ArtifactContent.module.css` | Use ornate chrome variable (two locations) |
| `components/meeting/ArtifactsPanel.module.css` | Use chrome variable |
| `app/page.module.css` | Responsive grid (tablet 2-col, phone 1-col) |
| `components/dashboard/WorkspaceSidebar.module.css` | Phone horizontal layout |
| `components/dashboard/DependencyMap.module.css` | Remove fixed max-width |
| `components/commission/CommissionList.module.css` | Remove fixed max-width |
| `components/dashboard/MeetingRequestCard.module.css` | Phone button wrapping |
| `app/projects/[name]/page.module.css` | Phone padding reduction |
| `components/project/ProjectHeader.module.css` | Phone heading size |
| `components/commission/CommissionForm.module.css` | Phone stack overrides fields |

Total: 18 CSS modules. No TypeScript/TSX changes required. No new files.

## Files Not Changed (And Why)

- **GemIndicator.module.css**: 16px and 24px sizes work at all breakpoints.
- **WorkerPortrait.module.css**: Frame sizes are used selectively; no overflow risk.
- **DaemonStatus.module.css**: Fixed-position badge is already compact.
- **EmptyState.module.css**: Centered flex layout is inherently responsive.
- **MessageBubble.module.css**: `max-width: 75%` scales naturally.
- **MessageInput.module.css**: Flex layout with `flex: 1` textarea works at all widths.
- **CommissionTimeline.module.css**: Flex-wrap on entries handles narrowing.
- **ManagerBriefing.module.css**: Text content with no fixed dimensions.
- **RecentArtifacts.module.css**: Flex column list with no fixed widths.
- **NotesDisplay.module.css**: Modal pattern, width-agnostic.
- **MeetingView.module.css**: Already responsive at 768px.
- **CommissionView.module.css**: Already responsive at 768px.
- **Artifact page.module.css**: Already responsive at 768px.

## Implementation Order

The steps are ordered for progressive benefit: chrome degradation first (visible improvement everywhere), then layout changes (high-impact on the primary views), then detail adjustments.

1. Step 1 (globals.css) must be first. All other steps depend on the custom properties.
2. Steps 2-5 (chrome degradation) can be done in any order.
3. Steps 6-7 (dashboard layout) should be done together as the sidebar adaptation depends on the grid change.
4. Steps 8-12 (detail adjustments) can be done in any order.

## Verification Strategy

This is primarily visual work. Automated testing is limited to ensuring the build still passes.

**Automated checks:**
- `bun run typecheck` (no TS changes, but confirms nothing is broken)
- `bun run build` (confirms CSS is valid and compilable)
- `bun test` (regression check)

**Manual visual verification at three widths:**
Use browser DevTools responsive mode or a real device. Check each width at each page.

| Page | 1200px (desktop) | 768px (tablet) | 480px (phone) |
|------|-------------------|-----------------|----------------|
| Dashboard | No regression | 2-col grid, sidebar + main | Single column, horizontal projects |
| Project (artifacts tab) | No regression | Content fills width | Reduced padding, scrollable tabs |
| Project (commissions tab) | No regression | Graph scrollable | Form fields stack |
| Project (meetings tab) | No regression | List fills width | List fills width |
| Meeting view | No regression | Already works | Chrome shrinks, no overflow |
| Commission view | No regression | Already works | Chrome shrinks, no overflow |
| Artifact view | No regression | Already works | Chrome shrinks, no overflow |

**Specific checks for chrome degradation:**
- Panel borders visually shrink but remain visible (not paper-thin)
- Scroll-window headers (MeetingHeader, CommissionHeader) don't clip content
- Ornate borders (ChatInterface) remain decorative but don't eat into content area
- ProjectTabs border image remains visible and tab text is accessible

**Edge cases:**
- Dashboard with 0 projects (empty sidebar)
- Dashboard with 5+ projects (sidebar overflow on phone)
- Long commission titles (text-overflow still works)
- MeetingRequestCard with Quick Comment form open on phone

## Risks

**Border-image variable support.** CSS custom properties inside `border-image-width` are well-supported in modern browsers (Chrome 49+, Firefox 31+, Safari 9.1+). No polyfill needed. If a browser doesn't support it, the border falls back to the `border: 10px solid transparent` declaration, which is acceptable degradation.

**grid-template-areas redistribution.** Changing grid areas at breakpoints is straightforward CSS but the named areas must match the HTML structure exactly. Since the dashboard JSX assigns grid areas via className, no HTML changes are needed. The CSS media queries just redefine the area layout.

**Scroll-window border-image with variables.** The `border-image-slice: 52 fill` is a fixed value tied to the image's internal geometry. It should not be made responsive. Only `border-image-width` and the element padding change.
