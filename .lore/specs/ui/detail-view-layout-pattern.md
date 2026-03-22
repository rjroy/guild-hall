---
title: Detail view layout pattern - viewport-locked containers with condensing headers
date: 2026-03-21
status: implemented
tags: [ui, layout, css, commissions, artifacts, responsive]
modules: [commission-view, commission-header, artifact-page, artifact-provenance]
related:
  - .lore/specs/ui/meeting-view-layout.md
  - .lore/specs/ui/guild-hall-views.md
req-prefix: DVL
---

# Spec: Detail View Layout Pattern

## Overview

The meeting detail view has a layout that works well: the header stays at the top, the input stays at the bottom, and the content scrolls independently between them. The header condenses to a compact bar so it doesn't eat vertical space during active use. The whole thing feels like an app, not a scrolling document.

The commission detail view and artifact detail view still use the old document-scroll layout (`min-height: 100vh`). On long commissions, the header scrolls out of view and the breadcrumb (the only way back to the project) disappears. On long artifacts, the same thing happens with ArtifactProvenance.

This spec applies the meeting view's layout pattern to both views. It also defines the pattern abstractly so future detail views can adopt it without re-deriving the approach.

## The Pattern

The shared layout contract has three zones:

```
+--[ Fixed header ]----------------------------------+
|  Breadcrumb, identity, metadata. Condensable.      |
+----------------------------------------------------+
|                                                    |
|  [ Scrollable body ]                               |
|  Content scrolls here. May have a sidebar.         |
|  Only this zone scrolls.                           |
|                                                    |
+----------------------------------------------------+
+--[ Optional fixed footer ]-------------------------+
|  Input area, action bar, etc.                      |
+----------------------------------------------------+
```

### CSS Contract

Each view that adopts this pattern uses the same structural CSS on its page-level container:

```css
.viewContainer {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;        /* dvh fallback: vh line must precede dvh */
  overflow: hidden;
  max-width: <view-specific>;
  margin: 0 auto;
  padding: var(--space-lg);
  gap: var(--space-md);
}
```

The body zone gets `flex: 1; min-height: 0` so it fills remaining space and allows internal scrolling. If the body has a sidebar, the body is a flex row with the main column scrolling (`overflow-y: auto`) and the sidebar scrolling independently.

The header is a flex-shrink-0 element with a `max-height` transition for condensing. The footer (if present) is also flex-shrink-0.

### Condensing Header Contract

Each condensing header:

1. Starts expanded on viewports above 960px, condensed at or below 960px (matching meeting header behavior from REQ-MTG-LAYOUT-17).
2. Provides a toggle button (chevron) to switch between states.
3. Transitions via `max-height` animation (250ms ease) since CSS `transition: height` does not work with auto-height.
4. In expanded state: uses the ornate `border-image` (scroll-window-dark.webp) styling.
5. In condensed state: uses a simple border with reduced padding, targeting 48-56px height.
6. Never removes information; condensed state truncates and collapses presentation.

### Colorization

All three detail views already share the fantasy theme tokens from `globals.css` (`--color-brass`, `--color-panel-bg`, `--color-dark-bg`, etc.) and the `border-image` scroll-window treatment. No new color work is needed. The pattern inherits colorization from the existing header and panel components.

The condensed header state uses a simplified border (1px solid brass-tinted rgba) consistent with the meeting header's `.headerCondensed` style at `MeetingHeader.module.css:26-31`.

## Decision: Independent Implementation vs. Shared Component

The meeting header owns chat-specific state (close button, closing flag, daemon status). The commission header owns commission-specific state (status gem, worker attribution, model provenance, commission type badge). The artifact provenance bar owns copy-path and source-worker info. Their content and interactions have nothing in common.

What they share is a CSS pattern (viewport lock, flex chain, max-height transition) and a toggle mechanism (condensed boolean + chevron button). Extracting a shared layout wrapper component would require either:

- A render-prop or slot-based composition that passes header content, body content, and optional footer, or
- A shared CSS mixin applied to each view's container

The render-prop approach adds indirection for three consumers. The CSS approach is simpler: each view copies the same 8-line container pattern and the same condensing transition rules. The pattern is small enough that duplication is cheaper than abstraction.

**Decision: Each view implements the pattern independently.** The CSS contract above is the shared specification. If a fourth view adopts the pattern, revisit extraction.

## Commission Detail View

### Current State

```
page.module.css: .commissionView
  display: flex; flex-direction: column; gap: var(--space-md)
  min-height: 100vh; max-width: 960px; padding: var(--space-lg)
  (document scroll, not viewport-locked)

  CommissionHeader (server component, no condensing)
    breadcrumb, title row with gem, meta row (status, worker, model)

  NeighborhoodGraph (server component, conditionally rendered)
    dependency/dependent lists, only if commission has neighbors

  CommissionView (client component)
    .content: flex row, flex: 1, min-height: 0
      .main: flex column (prompt panel, timeline panel, notes panel)
      .sidebar: 280px (actions/schedule/trigger panels, linked artifacts)
```

The header scrolls away on long timelines. The breadcrumb disappears. The sidebar scrolls with the page.

### Requirements

#### Viewport Lock

- REQ-DVL-1: The commission page container (`.commissionView`) uses `height: 100vh; height: 100dvh; overflow: hidden` instead of `min-height: 100vh`. The container must not grow beyond the viewport.

- REQ-DVL-2: The flex chain from `.commissionView` through `.content` to `.main` and `.sidebar` propagates height constraints. `.content` already has `min-height: 0`. `.main` needs `overflow-y: auto` so its panels scroll internally. `.sidebar` needs `overflow-y: auto` independently.

- REQ-DVL-3: The breadcrumb (inside `CommissionHeader`) stays visible at the top of the viewport at all times.

- REQ-DVL-4: The NeighborhoodGraph, when present, is part of the fixed header zone. It does not scroll with the body. Rationale: the graph is small (typically 2-6 lines of text) and provides navigation context (which commissions block or depend on this one). Scrolling it away defeats its purpose. It renders between the header and the body, outside the scrollable area.

#### Condensing Header

- REQ-DVL-5: `CommissionHeader` becomes a client component (`"use client"`) with a `condensed` boolean state and a toggle button. The toggle is a chevron at the trailing edge, matching the meeting header pattern.

- REQ-DVL-6: The expanded state shows the current layout: breadcrumb, title row (gem + title + type badge), meta row (status badge, worker, model). The ornate `border-image` styling is preserved.

- REQ-DVL-7: The condensed state collapses to a single row, 48-56px tall:
  ```
  +--[simple border]-------------------------------------------------------+
  |  [Gem] Commission Title (truncated)  status  worker  Model: opus  [v]  |
  +------------------------------------------------------------------------+
  ```
  The breadcrumb is hidden in condensed state. Rationale: unlike the meeting header where the breadcrumb is the only navigation, the commission header has a title row that already contextualizes the view. The breadcrumb adds three segments (Guild Hall > Project > Commissions > Commission) that don't fit in 56px alongside the title. The user can expand to see it. The gem indicator and title provide sufficient orientation in condensed mode.

- REQ-DVL-8: The condensed header uses simplified border styling (no `border-image`, simple 1px solid border, reduced padding), matching the meeting header's condensed treatment.

- REQ-DVL-9: The transition between states animates via `max-height` (250ms ease). Expanded max-height: 200px (commission headers are shorter than meeting headers since they don't show a multi-line agenda). Condensed max-height: 56px.

- REQ-DVL-10: On viewports at or below 960px, the header starts condensed. Above 960px, it starts expanded. Determined by `window.matchMedia` at mount time (same approach as `MeetingHeader.tsx:36-38`). The toggle overrides in either direction.

#### No Footer

The commission view has no fixed footer. The notes input (`CommissionNotes`) is inside the scrollable main column, not pinned. This is correct: note-adding is occasional, not the primary interaction (unlike chat input in meetings). No footer zone is needed.

#### Responsive

- REQ-DVL-11: At viewports below 768px, the sidebar stacks below the main content (existing behavior at `CommissionView.module.css:25-33`). In the viewport-locked layout, both `.main` and `.sidebar` share the vertical space and each scrolls independently when stacked. The stacked layout uses `flex-direction: column` on `.content` and both `.main` and `.sidebar` get `flex: 1; min-height: 200px; overflow-y: auto`.

- REQ-DVL-12: At viewports below 480px, padding reduces (existing behavior) and gap reduces. No additional changes needed; the commission view doesn't have a sidebar relocation pattern because the sidebar content (action buttons, artifacts list) is compact and benefits from being visible in a stacked layout rather than hidden in a collapsible panel.

### Files Changed

| File | Change |
|------|--------|
| `web/app/projects/[name]/commissions/[id]/page.module.css` | `.commissionView`: replace `min-height: 100vh` with `height: 100vh; height: 100dvh; overflow: hidden` |
| `web/components/commission/CommissionHeader.tsx` | Add `"use client"`. Add `condensed` state, toggle button, matchMedia default. Render expanded or condensed layout. |
| `web/components/commission/CommissionHeader.module.css` | Add `.headerCondensed` (simple border, compact single-row), `.toggleButton`, `max-height` transition on `.header`. Restructure expanded content for flex row in condensed state. |
| `web/components/commission/CommissionView.module.css` | `.main`: add `overflow-y: auto`. `.sidebar`: add `overflow-y: auto`. At 768px stacked breakpoint: both get `flex: 1; min-height: 200px`. |

## Artifact Detail View

### Current State

```
page.module.css: .artifactView
  display: flex (row); gap: var(--space-lg)
  min-height: 100vh; max-width: 1200px; padding: var(--space-lg)
  (document scroll, not viewport-locked)

  .main (flex: 1)
    ArtifactProvenance (breadcrumb + source info bar)
    optional meetingBanner
    ArtifactContent (rendered markdown)

  .sidebar (280px)
    MetadataSidebar (status, tags, related artifacts, associated commissions)
```

The artifact view is a horizontal flex row (main + sidebar) at the top level, not wrapped in a column container. The header (ArtifactProvenance) is inside `.main`, not above the row. This means the sidebar and main scroll together as a document.

### Requirements

#### Structural Change

- REQ-DVL-20: The artifact page layout changes from a flat row to a column-first structure:
  ```
  .artifactView (column, viewport-locked)
    ArtifactProvenance (fixed header zone, outside the row)
    optional meetingBanner (fixed zone, below provenance)
    .artifactBody (flex row, flex: 1, min-height: 0)
      .main (flex: 1, overflow-y: auto)
        ArtifactContent
      .sidebar (280px, overflow-y: auto)
        MetadataSidebar
  ```
  ArtifactProvenance moves out of `.main` and into the fixed header zone. This requires a structural change in `page.tsx`: the provenance bar renders before the body row, not inside `.main`.

- REQ-DVL-21: The artifact page container (`.artifactView`) uses `height: 100vh; height: 100dvh; overflow: hidden; flex-direction: column` instead of `min-height: 100vh; flex-direction: row`. The `max-width: 1200px` is preserved (artifacts are wider than meetings/commissions because the rendered markdown benefits from more horizontal space).

- REQ-DVL-22: The body row (`.artifactBody`) gets `flex: 1; min-height: 0; display: flex; gap: var(--space-lg)`. The main column gets `overflow-y: auto` for scrolling long artifacts. The sidebar gets `overflow-y: auto` independently.

- REQ-DVL-23: The breadcrumb (inside ArtifactProvenance) stays visible at the top of the viewport at all times.

#### Condensing Provenance Bar

- REQ-DVL-24: `ArtifactProvenance` becomes a client component with a `condensed` boolean state and a toggle button. The toggle follows the same chevron pattern as other condensing headers.

- REQ-DVL-25: The expanded state shows the current layout: breadcrumb row (with copy-path button) and source row (worker portrait + source text). The ornate `border-image` styling is preserved.

- REQ-DVL-26: The condensed state collapses to a single row, 48-56px tall:
  ```
  +--[simple border]-----------------------------------------------------+
  |  Guild Hall > Project > Artifacts > path/to/artifact  [copy]    [v]  |
  +----------------------------------------------------------------------+
  ```
  The source row (worker portrait + "Source information unavailable") is hidden. The breadcrumb is the essential content; the source row is supplementary and currently a stub anyway.

- REQ-DVL-27: The condensed provenance uses simplified border styling (no `border-image`, simple 1px solid border, reduced padding), consistent with the commission and meeting condensed headers.

- REQ-DVL-28: The transition between states animates via `max-height` (250ms ease). Expanded max-height: 150px. Condensed max-height: 48px.

- REQ-DVL-29: On viewports at or below 960px, the provenance starts condensed. Above 960px, it starts expanded. Same matchMedia approach as other headers.

#### Image Artifacts

- REQ-DVL-30: Image artifacts use the same viewport-locked layout. The image view (`ImageArtifactView`) renders in `.main` with `overflow-y: auto`, and `ImageMetadataSidebar` renders in the sidebar. ArtifactProvenance is in the fixed header zone, same as document artifacts. No special condensing behavior needed beyond the standard provenance bar.

#### No Footer

The artifact view has no input area or action bar. No footer zone is needed.

#### Responsive

- REQ-DVL-31: At viewports below 768px, the sidebar stacks below the main content (existing behavior). Both `.main` and `.sidebar` share vertical space and scroll independently. Same approach as the commission stacked layout (REQ-DVL-11).

- REQ-DVL-32: The optional meeting banner ("View Meeting" link for open meeting artifacts) stays in the fixed zone between the provenance bar and the body row. It does not scroll.

### Files Changed

| File | Change |
|------|--------|
| `web/app/projects/[name]/artifacts/[...path]/page.tsx` | Move `ArtifactProvenance` and `meetingBanner` out of `.main`. Wrap remaining main+sidebar in a new `.artifactBody` div. Same restructure for the image artifact branch. |
| `web/app/projects/[name]/artifacts/[...path]/page.module.css` | `.artifactView`: change to column layout with viewport lock. Add `.artifactBody` (flex row, flex: 1, min-height: 0). `.main`: add `overflow-y: auto`. `.sidebar`: add `overflow-y: auto`. |
| `web/components/artifact/ArtifactProvenance.tsx` | Add `"use client"`. Add `condensed` state, toggle button, matchMedia default. Render expanded or condensed layout. |
| `web/components/artifact/ArtifactProvenance.module.css` | Add `.provenanceCondensed` (simple border, compact single-row), `.toggleButton`, `max-height` transition on `.provenance`. |

## Breakpoint Summary

Consolidated responsive behavior for all three detail views:

| Breakpoint | Header Default | Commission Sidebar | Artifact Sidebar |
|-----------|---------------|-------------------|-----------------|
| >960px (desktop) | Expanded | Visible, 280px | Visible, 280px |
| 768-960px (tablet) | Condensed | Visible, 280px | Visible, 280px |
| <768px (small) | Condensed | Stacked below, both scroll | Stacked below, both scroll |
| <480px (phone) | Condensed | Stacked, reduced padding | Stacked, reduced padding |

The meeting view has a more complex responsive story (sidebar relocation into chat column, phone close button in header) because of its interactive nature. Commission and artifact views don't need that complexity: their sidebars are compact metadata panels that work fine stacked vertically.

## Exit Points

No new exit points. All existing navigation (breadcrumbs, artifact links, commission links) remains functional. The breadcrumbs become more useful because they stay visible instead of scrolling away.

## Success Criteria

- [ ] On a commission with a long timeline (20+ entries), the header stays fixed and the timeline scrolls in `.main`
- [ ] On an artifact with a long body (1000+ lines), the provenance bar stays fixed and the content scrolls in `.main`
- [ ] The commission sidebar scrolls independently when it has many artifacts or a tall actions panel
- [ ] The artifact sidebar scrolls independently when metadata is tall
- [ ] No double-scrollbar (page scroll + internal scroll) appears in any viewport size
- [ ] The commission header toggle switches between expanded (ornate border, breadcrumb, title, meta) and condensed (simple border, gem + title + status) states
- [ ] The artifact provenance toggle switches between expanded (breadcrumb + source row) and condensed (breadcrumb only) states
- [ ] Condensing/expanding animates smoothly (250ms, no content jump)
- [ ] On a 960px-wide viewport, both headers start condensed; on 1024px, they start expanded
- [ ] The NeighborhoodGraph (commission) stays visible above the scrollable area
- [ ] The meeting banner (artifact) stays visible above the scrollable area
- [ ] At 768px viewport, commission sidebar stacks below main; both columns scroll independently
- [ ] Image artifacts use the same viewport-locked layout as document artifacts
- [ ] The closed meeting ended panel (when viewing a meeting artifact) is unaffected

## AI Validation

**Defaults** (apply unless overridden):
- Code review by fresh-context sub-agent

**Custom:**
- Visual verification at 1440x900: commission header visible, timeline scrolls internally, sidebar scrolls independently
- Visual verification at 1440x900: artifact provenance visible, content scrolls, sidebar scrolls independently
- Visual verification at 375x667 (iPhone SE): both views usable, no content clipped, breadcrumbs visible
- Verify the flex chain propagates height correctly by loading a commission with 20+ timeline entries
- Verify condensed header toggle on both views: click to condense, click to expand, content reflows smoothly
- Verify NeighborhoodGraph stays in the fixed zone (load a commission with dependencies, scroll the timeline, confirm graph doesn't scroll)
- Verify image artifacts use viewport-locked layout

## Constraints

- The 960px max-width on `.commissionView` must not change.
- The 1200px max-width on `.artifactView` must not change.
- CSS vendor prefix ordering: `-webkit-backdrop-filter` must precede `backdrop-filter`.
- Turbopack does not support CSS Modules `composes`. Use TSX-side class composition.
- `CommissionHeader` is currently a server component. Converting to client means its data still comes from `page.tsx` as props. The page remains a server component.
- `ArtifactProvenance` is currently a server component. Same conversion trade-off. Its props (projectName, artifactTitle, artifactPath) are all strings from the server page.
- The NeighborhoodGraph is a server component and should remain one. It renders conditionally based on graph data and doesn't need client state. It sits in the fixed zone as static content.

## Out of Scope

- Meeting view changes. The meeting view already implements this pattern. This spec does not modify it.
- Sidebar relocation into the main column (the meeting view's Phase 3 pattern). Commission and artifact sidebars are compact enough to stack vertically without needing inline relocation.
- Commission notes footer pinning. The notes input is an occasional action, not a primary interaction surface. It stays in the scrollable main column.
- New responsive breakpoints beyond what each view already has.
- Shared layout wrapper component extraction. See decision above.
