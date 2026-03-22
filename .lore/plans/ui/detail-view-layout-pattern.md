---
title: "Detail view layout pattern: viewport-locked containers with condensing headers"
date: 2026-03-22
status: draft
tags: [ui, layout, css, commissions, artifacts, plan]
modules: [commission-view, commission-header, artifact-page, artifact-provenance]
related:
  - .lore/specs/ui/detail-view-layout-pattern.md
  - .lore/specs/ui/meeting-view-layout.md
---

# Plan: Detail View Layout Pattern

## Spec Reference

**Spec**: `.lore/specs/ui/detail-view-layout-pattern.md`

Requirements addressed:

- REQ-DVL-1: Commission viewport lock (`height: 100dvh; overflow: hidden`) &rarr; Phase 1, Step 1
- REQ-DVL-2: Flex chain propagation (`.main` and `.sidebar` overflow-y) &rarr; Phase 1, Step 2
- REQ-DVL-3: Commission breadcrumb always visible &rarr; Phase 1 (structural outcome)
- REQ-DVL-4: NeighborhoodGraph in fixed header zone &rarr; Phase 1 (already satisfied by page structure)
- REQ-DVL-5: CommissionHeader becomes client component with condensed toggle &rarr; Phase 2, Step 1
- REQ-DVL-6: Expanded state preserves current layout &rarr; Phase 2, Step 1
- REQ-DVL-7: Condensed single-row layout (gem + title + status + worker + model + toggle) &rarr; Phase 2, Steps 1-2
- REQ-DVL-8: Condensed header uses simplified border styling &rarr; Phase 2, Step 2
- REQ-DVL-9: max-height transition animation (250ms ease) &rarr; Phase 2, Step 2
- REQ-DVL-10: matchMedia default (condensed at <=960px) &rarr; Phase 2, Step 1
- REQ-DVL-11: Responsive stacked sidebar at <768px with independent scroll &rarr; Phase 1, Step 2
- REQ-DVL-12: Reduced padding at <480px &rarr; Phase 1 (already exists)
- REQ-DVL-20: Artifact structural change to column-first layout &rarr; Phase 3, Steps 1-2
- REQ-DVL-21: Artifact viewport lock &rarr; Phase 3, Step 2
- REQ-DVL-22: Artifact body row flex chain &rarr; Phase 3, Step 2
- REQ-DVL-23: Artifact breadcrumb always visible &rarr; Phase 3 (structural outcome)
- REQ-DVL-24: ArtifactProvenance becomes client component with condensed toggle &rarr; Phase 4, Step 1
- REQ-DVL-25: Expanded state preserves current layout &rarr; Phase 4, Step 1
- REQ-DVL-26: Condensed single-row layout (breadcrumb + copy button + toggle) &rarr; Phase 4, Steps 1-2
- REQ-DVL-27: Condensed provenance uses simplified border styling &rarr; Phase 4, Step 2
- REQ-DVL-28: max-height transition animation (250ms ease) &rarr; Phase 4, Step 2
- REQ-DVL-29: matchMedia default (condensed at <=960px) &rarr; Phase 4, Step 1
- REQ-DVL-30: Image artifacts use same viewport-locked layout &rarr; Phase 3, Step 1
- REQ-DVL-31: Artifact responsive stacked sidebar at <768px &rarr; Phase 3, Step 2
- REQ-DVL-32: Meeting banner stays in fixed zone &rarr; Phase 3, Step 1

## Codebase Context

### Meeting View (Reference Pattern)

The meeting view is the reference implementation. Key structural facts:

**Page container** (`web/app/projects/[name]/meetings/[id]/page.module.css:1-11`): `.meetingView` uses `height: 100vh; height: 100dvh; overflow: hidden` with `flex-direction: column`. This is the viewport lock.

**MeetingHeader** (`web/components/meeting/MeetingHeader.tsx`): Client component with `condensed` state. Uses `useState(() => window.matchMedia("(max-width: 960px)").matches)` at line 36-38 for initial state, plus a `useEffect` at lines 43-48 for SSR safety. Toggle is a chevron button (Unicode `\u25BC`/`\u25B2`). The `headerCondensed` CSS class sets `max-height: 56px` with simplified border (no border-image).

**MeetingHeader CSS** (`MeetingHeader.module.css`): `.header` has `max-height: 300px; transition: max-height 250ms ease, padding 250ms ease; overflow: hidden`. The `.headerCondensed` class overrides to `max-height: 56px`, reduced padding, simple border-radius. The `border-image-source` on `.header` is inherited from the expanded state; condensed state's border-radius overrides the border-image visually but doesn't explicitly remove it.

**Content area** (`MeetingView.module.css:1-6`): `.meetingContent` has `flex: 1; min-height: 0` which propagates the height constraint. The sidebar at line 17-23 has `overflow-y: auto`.

### Commission View (Target)

**Page container** (`web/app/projects/[name]/commissions/[id]/page.module.css:1-9`): `.commissionView` uses `min-height: 100vh` (document scroll). This is what changes.

**Page structure** (`page.tsx:165-196`): The page renders `CommissionHeader` > `NeighborhoodGraph` > `CommissionView` as siblings inside `.commissionView`. The `NeighborhoodGraph` is a server component that conditionally renders (returns null if no neighbors). It sits between header and body in the DOM, which means it will naturally be in the fixed zone once the container is viewport-locked. No structural JSX change needed for the graph.

**CommissionHeader** (`CommissionHeader.tsx`): Server component (no `"use client"` directive). Renders breadcrumb, title row (GemIndicator + h1 + optional schedule label), and meta row (status badge, worker label, model label). Props are all strings/booleans passed from the server page. Converting to client means adding `"use client"` and state management; all data still flows as props from the server page.

**CommissionView** (`CommissionView.tsx`): Client component. Its `.content` div already has `flex: 1; min-height: 0` (line 1-6 of CSS). But `.main` and `.sidebar` lack `overflow-y: auto`. The `.main` column contains three Panels (prompt, timeline, notes). The `.sidebar` column contains action/schedule/trigger panels and linked artifacts.

**CommissionView CSS** (`CommissionView.module.css`): `.main` has `flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--space-md)` but no `overflow-y`. `.sidebar` is `width: 280px; flex-shrink: 0` with no overflow. The 768px media query stacks `.content` (`flex-direction: column`) and sets `.sidebar` to full width, but doesn't add independent scroll or min-height to either column.

### Artifact View (Target)

**Page container** (`web/app/projects/[name]/artifacts/[...path]/page.module.css:1-8`): `.artifactView` uses `display: flex` (row, implicit), `min-height: 100vh`, `max-width: 1200px`. This is a flat row layout, not column-first. The structural change is larger here than for commissions.

**Page structure** (`page.tsx:124-155`): The document artifact branch renders `.artifactView > .main > (ArtifactProvenance, meetingBanner, ArtifactContent)` alongside `.sidebar > MetadataSidebar`. The image artifact branch (lines 65-88) follows the same pattern: `.artifactView > .main > (ArtifactProvenance, ImageArtifactView)` alongside `.sidebar > ImageMetadataSidebar`.

The structural change (REQ-DVL-20) moves ArtifactProvenance and meetingBanner out of `.main` and into the fixed header zone above a new `.artifactBody` row. Both the document and image branches need this restructure.

**ArtifactProvenance** (`ArtifactProvenance.tsx`): Server component. Renders a `breadcrumbRow` (ArtifactBreadcrumb + CopyPathButton) and a `sourceRow` (WorkerPortrait + stub text). Converting to client follows the same pattern as CommissionHeader: add `"use client"` and condensed state, props remain strings from the server page.

**ArtifactProvenance CSS** (`ArtifactProvenance.module.css`): Uses the same scroll-window `border-image` pattern as MeetingHeader and CommissionHeader. Has a `background-color: rgba(26, 20, 18, 0.85)` that the other headers don't explicitly set (they inherit from the border-image fill). No `max-height` or transition currently.

### What the Meeting Header Does That's Replicable

The condensing pattern has three parts that each new header needs to replicate:

1. **State**: `useState` with `matchMedia` initializer + `useEffect` SSR safety check (5 lines of boilerplate).
2. **Toggle button**: Chevron at trailing edge, `aria-label` and `aria-expanded` attributes.
3. **CSS**: `max-height` + `transition` on the container, a `.headerCondensed` class that overrides max-height, padding, border treatment. The `overflow: hidden` on the container is what clips content during the transition.

The meeting header also has a phone close button in condensed state (REQ-MTG-LAYOUT-22). Neither the commission nor artifact header needs that.

## Assumptions

1. **NeighborhoodGraph height is bounded.** The spec says it's "typically 2-6 lines of text." If someone creates a commission with 20 dependencies, the graph could be tall enough to squeeze the scrollable body. This is an edge case the spec accepts by placing the graph in the fixed zone. No max-height constraint is applied to the graph.

2. **CommissionHeader status is updated via parent re-render, not internal SSE.** The page.tsx description says "re-rendered client-side when SSE updates change the status." Tracing the code: `CommissionView` receives status updates via SSE and calls `onStatusChange`, but CommissionHeader gets its status as a prop from the server page. On SSE status changes, `router.refresh()` re-renders the server page, which re-passes the status prop. Converting CommissionHeader to a client component doesn't change this data flow. The condensed state is purely local UI state.

3. **The condensed state uses explicit `border-image: none` instead of visual override.** The meeting header's condensed state relies on reduced `border-radius` to visually mask the still-present `border-image`. Since the spec (REQ-DVL-8, REQ-DVL-27) explicitly requires "no `border-image`", the commission and artifact condensed states use `border-image: none` for a clean removal. This is a deliberate improvement over the meeting header pattern.

4. **The ArtifactProvenance background-color is intentional.** The provenance bar has an explicit `background-color: rgba(26, 20, 18, 0.85)` at `ArtifactProvenance.module.css:6`. The meeting and commission headers don't have this (they rely on border-image fill). The condensed state should preserve this background-color for visual consistency with the expanded state.

## Implementation Steps

The work is split into four phases. Each phase is independently deployable and testable. Phase 1 and Phase 3 handle the viewport-lock structural changes. Phase 2 and Phase 4 add the condensing headers. This ordering means each view gets "fixed scrolling" first (the more impactful UX fix) before the condensing polish.

### Phase 1: Commission Viewport Lock

Addresses REQ-DVL-1, REQ-DVL-2, REQ-DVL-3, REQ-DVL-4, REQ-DVL-11.

#### Step 1: Lock the page container

**File**: `web/app/projects/[name]/commissions/[id]/page.module.css`

Change `.commissionView`:
- Replace `min-height: 100vh` with `height: 100vh; height: 100dvh` (vh line first as the older-browser fallback, dvh line second as the progressive enhancement for mobile viewports with dynamic toolbars).
- Add `overflow: hidden`.
- Keep existing `max-width: 960px`, `margin`, `padding`, `gap`, `flex-direction: column`.

No changes needed to the responsive breakpoints. The 768px and 480px media queries adjust padding and gap, which remain valid.

#### Step 2: Enable internal scrolling on main and sidebar

**File**: `web/components/commission/CommissionView.module.css`

Add to `.main`:
- `overflow-y: auto` so the prompt, timeline, and notes panels scroll internally.

Add to `.sidebar`:
- `overflow-y: auto` so the action panels and linked artifacts scroll independently.

Update the 768px stacked breakpoint:
- Both `.main` and `.sidebar` get `flex: 1; min-height: 200px; overflow-y: auto` when stacked. The `min-height: 200px` prevents either section from collapsing to nothing when sharing vertical space.

No changes to `.content`. It already has `flex: 1; min-height: 0` which correctly propagates the height constraint from the viewport-locked container.

**Verification**: Load a commission with a long timeline (20+ entries). The header and NeighborhoodGraph should stay fixed. The timeline should scroll in `.main`. The sidebar should scroll independently. No double-scrollbar should appear. At 768px, both sections should stack and each should scroll within their `min-height: 200px` allocation.

### Phase 2: Commission Condensing Header

Addresses REQ-DVL-5 through REQ-DVL-10.

#### Step 1: Convert CommissionHeader to client component with condensed state

**File**: `web/components/commission/CommissionHeader.tsx`

Add `"use client"` directive at top. Add imports: `useState`, `useEffect`, `startTransition` from React.

Add condensed state, following the MeetingHeader pattern at `MeetingHeader.tsx:36-48`:
```typescript
const [condensed, setCondensed] = useState(() => {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 960px)").matches;
});

useEffect(() => {
  const matches = window.matchMedia("(max-width: 960px)").matches;
  if (matches) {
    startTransition(() => setCondensed(true));
  }
}, []);
```

The page.tsx remains a server component. All CommissionHeader props are serializable (strings, booleans, optional strings). No data flow changes.

**Expanded state**: Renders the existing layout (breadcrumb, title row with GemIndicator and h1, meta row with badges). The outer div gets `className={`${styles.header} ${condensed ? styles.headerCondensed : ""}`}`.

**Condensed state**: Render a single-row layout inside the header container:
```
[GemIndicator size="sm"] [title, truncated] [status badge] [worker] [Model: X] [toggle chevron]
```

The breadcrumb is hidden in condensed state (REQ-DVL-7 rationale: gem + title provide sufficient orientation). The title gets `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` via a CSS class. The GemIndicator shrinks to `size="sm"`. Status badge, worker label, and model label render inline at smaller font size.

The toggle button follows the MeetingHeader pattern: Unicode `\u25BC`/`\u25B2`, `aria-label="Expand header"/"Collapse header"`, `aria-expanded`.

Implementation structure: Use a conditional render based on `condensed`:
```tsx
<div className={headerClassName}>
  {condensed ? (
    <div className={styles.condensedRow}>
      <GemIndicator status={gemStatus} size="sm" />
      <span className={styles.condensedTitle}>{title || "Untitled Commission"}</span>
      <span className={styles.condensedStatus}>{displayStatus}</span>
      {worker && <span className={styles.condensedWorker}>{workerDisplayTitle || worker}</span>}
      {model && <span className={styles.condensedModel}>Model: {model}</span>}
      <button type="button" className={styles.toggleButton} onClick={...} aria-label="Expand header">
        {"\u25BC"}
      </button>
    </div>
  ) : (
    <>
      <nav className={styles.breadcrumb}>...</nav>
      <div className={styles.titleRow}>...</div>
      <div className={styles.meta}>...</div>
      <button type="button" className={styles.toggleButton} onClick={...} aria-label="Collapse header">
        {"\u25B2"}
      </button>
    </>
  )}
</div>
```

Note: The toggle button in expanded state should be placed at the trailing edge. In the meeting header, the toggle lives inside `.agendaTrailing` which is at the end of the flex row. For the commission header, place the toggle after the meta row. A simple approach: wrap the expanded content in a column flex container with the toggle absolutely positioned at top-right, or add the toggle as the last child of the header with `align-self: flex-end; margin-left: auto`. The absolute positioning approach is cleaner since it doesn't interfere with the existing column layout.

Decision: Use `position: absolute; top: var(--space-sm); right: var(--space-md)` on the toggle in expanded state, with `position: relative` on `.header`. In condensed state, the toggle is inline in the row (no absolute positioning needed).

In expanded state, the toggle button uses `className={`${styles.toggleButton} ${styles.toggleExpanded}`}` to combine the base button styling with absolute positioning. In condensed state, it uses `className={styles.toggleButton}` alone (inline in the flex row).

#### Step 2: Add condensing CSS

**File**: `web/components/commission/CommissionHeader.module.css`

Add to `.header`:
- `max-height: 200px` (spec value; commission headers are shorter than meeting headers).
- `transition: max-height 250ms ease, padding 250ms ease`.
- `overflow: hidden`.
- `position: relative` (for the expanded-state toggle button).

Add `.headerCondensed`:
```css
.headerCondensed {
  max-height: 56px;
  padding: var(--space-xs) var(--space-md);
  border: 1px solid rgba(184, 134, 11, 0.3);
  border-image: none;
  border-radius: 8px;
  margin-bottom: var(--space-sm);
}
```

The spec (REQ-DVL-8) requires "no `border-image`, simple 1px solid border." The meeting header's `.headerCondensed` at `MeetingHeader.module.css:26-31` relies on border-radius to visually override border-image, but doesn't explicitly unset it. Since the spec is explicit, this plan uses `border-image: none` to cleanly remove it and `border: 1px solid` for the simple border.

Note on `margin-bottom`: The meeting header uses `margin-bottom: var(--space-sm)` in condensed state (reduced from `var(--space-md)` in expanded state). This margin stacks with the parent container's `gap`, creating a shift during the toggle animation. This is an inherited pattern from the meeting view. The implementer should be aware of this: if the shift is unacceptable, remove `margin-bottom` from both `.header` and `.headerCondensed` and let the parent `gap` handle all spacing. The plan preserves the meeting header pattern for consistency.

Add `.condensedRow`:
```css
.condensedRow {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  white-space: nowrap;
  overflow: hidden;
}
```

Add `.condensedTitle`:
```css
.condensedTitle {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-heading);
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}
```

Add `.condensedStatus`, `.condensedWorker`, `.condensedModel`:
```css
.condensedStatus {
  font-size: 0.8rem;
  color: var(--color-brass);
  font-weight: 600;
  text-transform: capitalize;
  flex-shrink: 0;
}

.condensedWorker {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  font-style: italic;
  flex-shrink: 0;
}

.condensedModel {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  flex-shrink: 0;
}
```

Add `.toggleButton` (copy from `MeetingHeader.module.css:159-176`):
```css
.toggleButton {
  background: none;
  border: 1px solid var(--color-brass);
  border-radius: 4px;
  color: var(--color-brass);
  cursor: pointer;
  font-size: 0.65rem;
  line-height: 1;
  padding: 2px 6px;
  transition: color 0.2s, border-color 0.2s;
  flex-shrink: 0;
}

.toggleButton:hover {
  color: var(--color-amber);
  border-color: var(--color-amber);
}
```

For the expanded state, add `.toggleExpanded`:
```css
.toggleExpanded {
  position: absolute;
  top: var(--space-sm);
  right: var(--space-md);
}
```

Update responsive breakpoints: The existing 600px and 480px media queries adjust padding and border-radius on `.header`. The condensed state already uses reduced padding via `.headerCondensed`, so no additional responsive changes needed for the condensed state.

**Verification**: Toggle between expanded and condensed. The animation should be smooth (250ms), no content jump. At 960px viewport, header starts condensed. At 1024px, starts expanded. The breadcrumb disappears in condensed state but the gem + title + status provide context. The toggle chevron is visible in both states.

### Phase 3: Artifact Viewport Lock and Structural Change

Addresses REQ-DVL-20 through REQ-DVL-23, REQ-DVL-30, REQ-DVL-31, REQ-DVL-32.

This is the most involved phase because it changes the artifact page's DOM structure, not just CSS properties.

#### Step 1: Restructure artifact page.tsx

**File**: `web/app/projects/[name]/artifacts/[...path]/page.tsx`

**Document artifact branch** (currently lines 124-155): Change from flat row to column-first:

Current:
```tsx
<div className={styles.artifactView}>
  <div className={styles.main}>
    <ArtifactProvenance ... />
    {meetingLink && <div className={styles.meetingBanner}>...</div>}
    <ArtifactContent ... />
  </div>
  <div className={styles.sidebar}>
    <MetadataSidebar ... />
  </div>
</div>
```

Target:
```tsx
<div className={styles.artifactView}>
  <ArtifactProvenance ... />
  {meetingLink && <div className={styles.meetingBanner}>...</div>}
  <div className={styles.artifactBody}>
    <div className={styles.main}>
      <ArtifactContent ... />
    </div>
    <div className={styles.sidebar}>
      <MetadataSidebar ... />
    </div>
  </div>
</div>
```

ArtifactProvenance and meetingBanner move out of `.main` into the top-level column. A new `.artifactBody` wrapper holds the row layout.

**Image artifact branch** (currently lines 65-88): Same restructure:

Current:
```tsx
<div className={styles.artifactView}>
  <div className={styles.main}>
    <ArtifactProvenance ... />
    <ImageArtifactView ... />
  </div>
  <div className={styles.sidebar}>
    <ImageMetadataSidebar ... />
  </div>
</div>
```

Target:
```tsx
<div className={styles.artifactView}>
  <ArtifactProvenance ... />
  <div className={styles.artifactBody}>
    <div className={styles.main}>
      <ImageArtifactView ... />
    </div>
    <div className={styles.sidebar}>
      <ImageMetadataSidebar ... />
    </div>
  </div>
</div>
```

Image artifacts don't have a meetingBanner, so that conditional is only in the document branch.

#### Step 2: Update artifact CSS for viewport lock

**File**: `web/app/projects/[name]/artifacts/[...path]/page.module.css`

Replace `.artifactView`:
```css
.artifactView {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  padding: var(--space-lg);
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  max-width: 1200px;
  margin: 0 auto;
}
```

Key change: `flex-direction` goes from implicit `row` to explicit `column`, and `min-height: 100vh` becomes `height: 100dvh; overflow: hidden`.

Add `.artifactBody`:
```css
.artifactBody {
  display: flex;
  gap: var(--space-lg);
  flex: 1;
  min-height: 0;
}
```

This is the row container that replaces the previous top-level row layout.

Update `.main`:
```css
.main {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
}
```

Add `overflow-y: auto` to enable scrolling.

Update `.sidebar`:
```css
.sidebar {
  width: 280px;
  flex-shrink: 0;
  overflow-y: auto;
}
```

Add `overflow-y: auto` for independent scrolling.

Update `.meetingBanner` if needed: Currently has `margin-bottom: var(--space-md)`. Since it's now a direct child of the column container (between provenance and body), the container's `gap: var(--space-lg)` handles spacing. Remove `margin-bottom` or keep it; the gap will be consistent either way. Decision: remove `margin-bottom` since the parent gap handles it. Add `flex-shrink: 0` so the banner doesn't compress when the body grows.

Update 768px media query:
```css
@media (max-width: 768px) {
  .artifactBody {
    flex-direction: column;
  }

  .sidebar {
    width: 100%;
  }

  .main,
  .sidebar {
    flex: 1;
    min-height: 200px;
    overflow-y: auto;
  }
}
```

Note: The current 768px query targets `.artifactView` for `flex-direction: column` (line 39-45). Since `.artifactView` is now always `flex-direction: column`, this media query should target `.artifactBody` instead.

**Verification**: Load a long document artifact. The provenance bar should stay fixed. The content should scroll in `.main`. The sidebar should scroll independently. The meeting banner (if present) should stay fixed between provenance and body. Image artifacts should behave identically. At 768px, both sections stack and scroll. Verify no double-scrollbar appears at any viewport width (the page-level scrollbar should be gone, only `.main` and `.sidebar` scrollbars should appear when content overflows).

### Phase 4: Artifact Condensing Provenance Bar

Addresses REQ-DVL-24 through REQ-DVL-29.

#### Step 1: Convert ArtifactProvenance to client component with condensed state

**File**: `web/components/artifact/ArtifactProvenance.tsx`

Add `"use client"` directive. Add imports: `useState`, `useEffect`, `startTransition`.

Add condensed state (same boilerplate as CommissionHeader, Phase 2 Step 1).

**Expanded state**: Renders the current layout (breadcrumbRow + sourceRow) unchanged.

**Condensed state**: Single row with breadcrumb and copy button:
```
[ArtifactBreadcrumb] [CopyPathButton] [toggle chevron]
```

The sourceRow (WorkerPortrait + stub text) is hidden. The breadcrumb is the essential content. The copy-path button remains accessible.

Implementation:
```tsx
<div className={provenanceClassName}>
  {condensed ? (
    <div className={styles.condensedRow}>
      <ArtifactBreadcrumb
        projectName={projectName}
        artifactTitle={artifactTitle}
      />
      <div className={styles.condensedTrailing}>
        <CopyPathButton path={`.lore/${artifactPath}`} />
        <button type="button" className={styles.toggleButton} onClick={...}>
          {"\u25BC"}
        </button>
      </div>
    </div>
  ) : (
    <>
      <div className={styles.breadcrumbRow}>
        <ArtifactBreadcrumb ... />
        <CopyPathButton ... />
      </div>
      <div className={styles.sourceRow}>
        <WorkerPortrait size="sm" />
        <p className={styles.text}>Source information unavailable.</p>
      </div>
      <button type="button" className={styles.toggleExpanded} onClick={...}>
        {"\u25B2"}
      </button>
    </>
  )}
</div>
```

Note on child component boundaries: `CopyPathButton` is already a client component (`"use client"` at `CopyPathButton.tsx:1`, uses `useState` and clipboard DOM APIs). `ArtifactBreadcrumb` is a server component (no `"use client"` directive) that renders pure JSX with `Link` components. When ArtifactProvenance becomes a client component, both children render correctly: CopyPathButton because it's already a client component, and ArtifactBreadcrumb because Next.js can render server components as children of client components when they're passed as JSX (they just lose server-only capabilities, which ArtifactBreadcrumb doesn't use). No changes needed to either child component.

#### Step 2: Add condensing CSS

**File**: `web/components/artifact/ArtifactProvenance.module.css`

Add to `.provenance`:
- `max-height: 150px` (spec value).
- `transition: max-height 250ms ease, padding 250ms ease`.
- `overflow: hidden`.
- `position: relative` (for expanded toggle).

Add `.provenanceCondensed`:
```css
.provenanceCondensed {
  max-height: 48px;
  padding: var(--space-xs) var(--space-md);
  border: 1px solid rgba(184, 134, 11, 0.3);
  border-image: none;
  border-radius: 8px;
  background-color: rgba(26, 20, 18, 0.85);
}
```

The condensed state preserves the explicit `background-color` from the expanded state (assumption 4). The `border-image` is explicitly unset (REQ-DVL-27) and replaced with a simple 1px solid border, matching the commission header approach from Phase 2.

Note: The existing `.provenance` has `margin-bottom: var(--space-md)`. In the new viewport-locked layout from Phase 3, `.artifactView` uses `gap: var(--space-lg)` which already handles spacing between siblings. The implementer should remove `margin-bottom` from `.provenance` (it now stacks with the parent's gap, creating double spacing) rather than adding a different `margin-bottom` to the condensed state. This is a divergence from the meeting header pattern but the correct approach for the new column layout.

Add `.condensedRow`:
```css
.condensedRow {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  min-width: 0;
}
```

Add `.condensedTrailing`:
```css
.condensedTrailing {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-shrink: 0;
  margin-left: auto;
}
```

Add `.toggleButton` and `.toggleExpanded` (same styles as Phase 2's commission toggle).

**Verification**: Toggle the provenance bar. The breadcrumb + copy button should be visible in both states. The source row disappears in condensed state. Animation is smooth. At 960px, starts condensed. At 1024px, starts expanded.

## Review Strategy

Each phase should be reviewed before proceeding to the next.

**Phases 1 and 3** (viewport lock): Review by the Reviewer agent. Focus on:
- Flex chain correctness (does height propagate without breaking?)
- No double-scrollbar at any viewport size
- Responsive breakpoints still function
- Image artifacts behave identically to document artifacts

**Phases 2 and 4** (condensing headers): Review by the Reviewer agent. Focus on:
- Server-to-client conversion doesn't break data flow
- Condensed state shows all required information per spec
- Animation smoothness (no content jump during transition)
- matchMedia default works correctly at boundary (960px)
- Accessibility: aria-label, aria-expanded on toggle

## Risks and Mitigations

**Risk**: The `overflow: hidden` on the viewport-locked container may clip absolutely positioned elements like tooltips or dropdowns inside the scrollable body.
**Mitigation**: The commission and artifact views don't currently have tooltips or dropdown menus in the scrollable area. The commission actions use inline confirmation (not dropdowns). If this becomes an issue later, the fix is to use a portal for the tooltip/dropdown, not to remove the overflow constraint.

**Risk**: Converting CommissionHeader to a client component increases the client bundle. The component imports `GemIndicator`, `Link`, and styles.
**Mitigation**: These are already used by client components elsewhere. The incremental bundle cost is the condensed state logic (a few hundred bytes). Negligible.

**Risk**: The `max-height` animation approach means content is clipped during transition. If the expanded height exceeds the `max-height` value (200px for commission, 150px for artifact), the bottom content will be permanently clipped even in expanded state.
**Mitigation**: Commission headers contain breadcrumb (~20px) + title row (~36px) + meta row (~20px) + gap = ~90px. Well under 200px. Artifact provenance contains breadcrumb row (~32px) + source row (~32px) + gap = ~75px. Well under 150px. The values have margin. If a commission title wraps to multiple lines on a narrow viewport, verify it still fits.

## Files Changed Summary

| File | Phase | Change |
|------|-------|--------|
| `web/app/projects/[name]/commissions/[id]/page.module.css` | 1 | Viewport lock: replace `min-height` with `height: 100dvh; overflow: hidden` |
| `web/components/commission/CommissionView.module.css` | 1 | Add `overflow-y: auto` to `.main` and `.sidebar`; update stacked breakpoint |
| `web/components/commission/CommissionHeader.tsx` | 2 | Convert to client component; add condensed state, toggle, matchMedia |
| `web/components/commission/CommissionHeader.module.css` | 2 | Add transition, condensed styles, toggle button, condensed row layout |
| `web/app/projects/[name]/artifacts/[...path]/page.tsx` | 3 | Restructure: move provenance/banner out of `.main`, add `.artifactBody` wrapper |
| `web/app/projects/[name]/artifacts/[...path]/page.module.css` | 3 | Viewport lock, column layout, add `.artifactBody`, update responsive queries |
| `web/components/artifact/ArtifactProvenance.tsx` | 4 | Convert to client component; add condensed state, toggle, matchMedia |
| `web/components/artifact/ArtifactProvenance.module.css` | 4 | Add transition, condensed styles, toggle button, condensed row layout |

Eight files total, zero new files. Four phases, each independently verifiable.
