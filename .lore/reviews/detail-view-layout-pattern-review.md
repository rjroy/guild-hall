---
title: "Review: Detail View Layout Pattern Implementation"
date: 2026-03-22
tags: [review, ui, layout, css, commissions, artifacts, responsive, condensing-headers]
spec: .lore/specs/ui/detail-view-layout-pattern.md
plan: .lore/plans/ui/detail-view-layout-pattern.md
implementation: commission-Dalton-20260322-135347, commission-Dalton-20260322-135358, commission-Dalton-20260322-135407, commission-Dalton-20260322-135414
reviewer: Thorne
status: resolved
---

# Review: Detail View Layout Pattern Implementation

Four commissions across four phases. 11 files changed, 585 insertions, 494 deletions.

- Phase 1 (commission-Dalton-20260322-135347): Commission viewport lock
- Phase 2 (commission-Dalton-20260322-135358): Commission condensing header
- Phase 3 (commission-Dalton-20260322-135407): Artifact viewport lock and structural change
- Phase 4 (commission-Dalton-20260322-135414): Artifact condensing provenance bar

## Requirement Coverage

### REQ-DVL-1: Commission viewport lock — SATISFIED

`page.module.css:6-8`: `height: 100vh; height: 100dvh; overflow: hidden`. The vh fallback precedes dvh as specified. The `min-height: 100vh` document-scroll pattern is replaced. `max-width: 960px` preserved per constraint.

### REQ-DVL-2: Flex chain propagation — SATISFIED

`CommissionView.module.css:1-6`: `.content` has `flex: 1; min-height: 0` (unchanged, already correct). `.main` at line 14 now has `overflow-y: auto`. `.sidebar` at line 23 now has `overflow-y: auto`. The chain from `.commissionView` (column, viewport-locked) through `.content` (flex row, `flex: 1; min-height: 0`) to `.main`/`.sidebar` (each `overflow-y: auto`) is correct. Height propagates without breaking.

### REQ-DVL-3: Commission breadcrumb always visible — SATISFIED

The breadcrumb is inside `CommissionHeader`, which is a direct child of `.commissionView` (a flex column with `overflow: hidden`). The header is outside the scrollable `.content` zone. The breadcrumb stays fixed.

### REQ-DVL-4: NeighborhoodGraph in fixed header zone — SATISFIED

`page.tsx:179-183`: NeighborhoodGraph renders between CommissionHeader and CommissionView as a sibling in `.commissionView`. It is not inside `.content`, so it does not participate in the body scroll. The graph stays fixed.

### REQ-DVL-5: CommissionHeader becomes client component — SATISFIED

`CommissionHeader.tsx:1`: `"use client"` directive present. `useState` with matchMedia initializer at lines 43-46. Toggle button present in both states. Props remain serializable strings and booleans from the server page.

### REQ-DVL-6: Expanded state preserves current layout — SATISFIED

`CommissionHeader.tsx:90-155`: Expanded state renders breadcrumb nav, title row (GemIndicator `size="md"` + h1 + optional schedule label), and meta row (status badge, worker label, model label). This matches the previous server component layout.

### REQ-DVL-7: Condensed single-row layout — SATISFIED

`CommissionHeader.tsx:64-88`: Condensed row contains GemIndicator `size="sm"`, truncated title, status, optional worker, optional model, and toggle chevron. All required elements are present. The `.condensedTitle` CSS at `CommissionHeader.module.css:46-54` handles truncation (`text-overflow: ellipsis; flex: 1; min-width: 0`).

### REQ-DVL-8: Condensed uses simplified border (no border-image) — SATISFIED

`CommissionHeader.module.css:27-34`: `.headerCondensed` sets `border: 1px solid rgba(184, 134, 11, 0.3); border-image: none; border-radius: 8px`. The `border-image: none` explicitly unsets the ornate border, matching the spec requirement exactly. This is a deliberate improvement over the meeting header pattern, which relies on border-radius to visually mask the still-present border-image.

### REQ-DVL-9: max-height transition animation — SATISFIED

`.header` at lines 20-21: `max-height: 200px; transition: max-height 250ms ease, padding 250ms ease; overflow: hidden`. `.headerCondensed` at line 28: `max-height: 56px`. The animation approach is correct. The 200px expanded value has adequate margin (commission header content is approximately 90px tall).

### REQ-DVL-10: matchMedia default at 960px — SATISFIED

`CommissionHeader.tsx:43-46`: `window.matchMedia("(max-width: 960px)").matches` used in `useState` initializer. SSR safety via `useEffect` + `startTransition` at lines 49-54. Matches the MeetingHeader pattern.

### REQ-DVL-11: Responsive stacked sidebar at <768px — SATISFIED

`CommissionView.module.css:27-44`: At 768px, `.content` switches to column. Both `.main` and `.sidebar` get `flex: 1; min-height: 200px; overflow-y: auto`. Both columns share vertical space and scroll independently.

### REQ-DVL-12: Reduced padding at <480px — SATISFIED

`page.module.css:21-27`: Padding reduces to `var(--space-sm)`, gap to `var(--space-sm)`, max-width to 100%. Unchanged from pre-existing behavior, which is correct per spec ("No additional changes needed").

### REQ-DVL-20: Artifact structural change to column-first — SATISFIED

`page.tsx:65-90` (image branch): ArtifactProvenance is a direct child of `.artifactView`, followed by `.artifactBody` wrapping `.main` + `.sidebar`. `page.tsx:126-159` (document branch): Same structure, with meetingBanner between ArtifactProvenance and `.artifactBody`. Both branches correctly moved ArtifactProvenance out of `.main`.

### REQ-DVL-21: Artifact viewport lock — SATISFIED

`page.module.css:1-11`: `flex-direction: column; height: 100vh; height: 100dvh; overflow: hidden; max-width: 1200px`. The 1200px constraint is preserved per spec.

### REQ-DVL-22: Artifact body row flex chain — SATISFIED

`.artifactBody` at lines 13-18: `display: flex; flex: 1; min-height: 0; gap: var(--space-lg)`. `.main` at lines 20-24: `flex: 1; min-width: 0; overflow-y: auto`. `.sidebar` at lines 26-30: `width: 280px; flex-shrink: 0; overflow-y: auto`. The chain is correct.

### REQ-DVL-23: Artifact breadcrumb always visible — SATISFIED

ArtifactProvenance is a direct child of `.artifactView`, outside `.artifactBody`. It does not scroll.

### REQ-DVL-24: ArtifactProvenance becomes client component — SATISFIED

`ArtifactProvenance.tsx:1`: `"use client"` directive. `useState` with matchMedia at lines 30-33. Toggle button in both states. Props remain serializable strings from the server page.

### REQ-DVL-25: Expanded state preserves current layout — SATISFIED

`ArtifactProvenance.tsx:67-87`: Expanded state renders breadcrumbRow (ArtifactBreadcrumb + CopyPathButton) and sourceRow (WorkerPortrait + stub text). Matches previous layout.

### REQ-DVL-26: Condensed single-row layout — SATISFIED

`ArtifactProvenance.tsx:47-65`: Condensed row contains ArtifactBreadcrumb, CopyPathButton, and toggle chevron. The source row is hidden. The breadcrumb is the essential content per spec.

### REQ-DVL-27: Condensed provenance uses simplified border — SATISFIED

`ArtifactProvenance.module.css:25-32`: `.provenanceCondensed` sets `border: 1px solid rgba(184, 134, 11, 0.3); border-image: none; border-radius: 8px; background-color: rgba(26, 20, 18, 0.85)`. The explicit `background-color` preservation is correct (plan assumption 4). The `border-image: none` explicitly unsets the ornate border.

### REQ-DVL-28: Provenance max-height transition — SATISFIED

`.provenance` at lines 18-19: `max-height: 150px; transition: max-height 250ms ease, padding 250ms ease; overflow: hidden`. `.provenanceCondensed` at line 26: `max-height: 48px`. Values match spec.

### REQ-DVL-29: Provenance matchMedia default at 960px — SATISFIED

`ArtifactProvenance.tsx:30-33`: Same pattern as CommissionHeader and MeetingHeader.

### REQ-DVL-30: Image artifacts use same viewport-locked layout — SATISFIED

`page.tsx:65-90`: Image branch uses identical structure (ArtifactProvenance > .artifactBody > .main + .sidebar). ImageArtifactView renders in `.main`; ImageMetadataSidebar renders in `.sidebar`. No difference from document artifact layout.

### REQ-DVL-31: Artifact responsive stacked sidebar at <768px — PARTIAL

`page.module.css:51-58`: The 768px breakpoint correctly changes `.artifactBody` to `flex-direction: column` and `.sidebar` to `width: 100%`. See WARN-1 below.

### REQ-DVL-32: Meeting banner in fixed zone — SATISFIED

`page.tsx:133-139`: The meetingBanner renders between ArtifactProvenance and `.artifactBody` as a direct child of `.artifactView`. `page.module.css:32-38`: `.meetingBanner` has `flex-shrink: 0`, preventing compression. It stays fixed.

## Findings

### WARN-1: Artifact 768px breakpoint missing flex sharing for stacked layout

**File**: `web/app/projects/[name]/artifacts/[...path]/page.module.css:51-58`

The 768px breakpoint changes `.artifactBody` to column and `.sidebar` to full width, but does not add `flex: 1; min-height: 200px` to either `.main` or `.sidebar`. Compare with the commission view's equivalent at `CommissionView.module.css:27-44`, which explicitly adds `flex: 1; min-height: 200px; overflow-y: auto` to both columns in the stacked breakpoint.

Without this, the stacked layout has two problems:

1. `.sidebar` retains `flex-shrink: 0` from its base styles (line 28). In a stacked column, this means the sidebar takes its full intrinsic height and cannot be compressed, even if the viewport is too short. If sidebar content is tall (many tags, many associated commissions), it could push `.main` out of view.

2. Neither column gets `min-height: 200px` to guarantee minimum visible content. If the sidebar is very tall, `.main` could shrink to a few pixels.

The spec (REQ-DVL-31) says: "Both `.main` and `.sidebar` share vertical space and scroll independently. Same approach as the commission stacked layout (REQ-DVL-11)." The commission layout's approach includes `flex: 1; min-height: 200px; overflow-y: auto` on both columns, which is missing here.

**Fix**: Add the same stacked breakpoint treatment as the commission view:

```css
@media (max-width: 768px) {
  .artifactBody {
    flex-direction: column;
  }

  .main,
  .sidebar {
    flex: 1;
    min-height: 200px;
    overflow-y: auto;
  }

  .sidebar {
    width: 100%;
  }
}
```

### INFO-1: Margin-bottom shift during toggle animation

**Files**: `CommissionHeader.module.css:9,33`, `MeetingHeader.module.css:9,30`

The commission header `.header` has `margin-bottom: var(--space-md)` in expanded state. The `.headerCondensed` overrides to `margin-bottom: var(--space-sm)`. The `transition` property only animates `max-height` and `padding`, not `margin-bottom`. The margin change is instant while height and padding animate, which could cause a small visual jump at the bottom edge during the toggle.

The artifact provenance does NOT have this issue. The plan noted that `margin-bottom` should be removed from `.provenance` since the parent's `gap` handles spacing, and the implementation correctly does not include `margin-bottom` on `.provenance` or `.provenanceCondensed`.

The commission header's `margin-bottom` shift is inherited from the meeting header pattern. It is a cosmetic concern, not a functional one. If the shift is visible in practice, adding `margin-bottom` to the transition property (`transition: max-height 250ms ease, padding 250ms ease, margin-bottom 250ms ease`) would smooth it.

### INFO-2: No explicit flex-shrink: 0 on fixed-zone headers

**Files**: `CommissionHeader.module.css`, `ArtifactProvenance.module.css`

The spec's CSS contract says "The header is a flex-shrink-0 element with a max-height transition." Neither `.header` nor `.provenance` has an explicit `flex-shrink: 0`. They default to `flex-shrink: 1`, meaning the flex algorithm could theoretically shrink them if the viewport is extremely small.

In practice, this is not a problem: the headers' content is small relative to any reasonable viewport, and the scrollable body (`flex: 1; min-height: 0`) absorbs all the size pressure. Adding `flex-shrink: 0` would be spec-correct but has no observable effect at practical viewport sizes. Noted for completeness.

### INFO-3: Meeting header still lacks explicit border-image: none in condensed state

**File**: `MeetingHeader.module.css:26-31`

The commission header (`.headerCondensed`, line 31) and artifact provenance (`.provenanceCondensed`, line 29) both explicitly set `border-image: none` as required by REQ-DVL-8 and REQ-DVL-27. The meeting header's `.headerCondensed` relies on `border-radius: 8px` to visually mask the still-present border-image.

This is not a defect in the current implementation (the spec does not modify the meeting view, and the plan documented this as assumption 3). It is a pre-existing inconsistency. If the meeting header is touched in the future, adding `border-image: none` to `.headerCondensed` would make all three headers consistent.

## Cross-Phase Consistency

The four phases are internally consistent:

- **Viewport lock pattern**: Both `.commissionView` and `.artifactView` use identical CSS (height: 100vh/100dvh, overflow: hidden, flex-direction: column). Correct.
- **Condensing state pattern**: Both headers use the same matchMedia + useState + useEffect + startTransition boilerplate. Both use `border-image: none` in condensed state. Both use the same toggle button styling. Correct.
- **Toggle accessibility**: Both headers provide `aria-label` ("Expand header"/"Collapse header") and `aria-expanded` on toggle buttons. Correct.
- **Data flow**: Both converted components receive all data as serializable props from server pages. Neither fetches data internally. The server-to-client conversion is clean.

## Verdict

23 of 24 requirements are fully satisfied. REQ-DVL-31 is partially satisfied (direction and width change are correct, but flex sharing and min-height are missing in the stacked breakpoint). One WARN-level finding. Two INFO-level notes for future consideration.

The implementation is well-structured and consistent across all four phases. The flex chain is correct for all desktop and wide viewport scenarios. The only gap is the artifact stacked layout at narrow viewports.
