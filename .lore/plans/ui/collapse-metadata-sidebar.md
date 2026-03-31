---
title: "Collapsible metadata sidebar for artifacts and meetings"
date: 2026-03-31
status: executed
tags: [ui, layout, css, sidebar, artifacts, meetings]
modules: [web/components/artifact/ArtifactDetailLayout, web/components/meeting/MeetingView, web/app/projects]
related:
  - .lore/issues/collapse-metadata-sidebar.md
  - .lore/plans/ui/detail-view-layout-pattern.md
---

# Plan: Collapsible Metadata Sidebar

## Goal

Make the metadata sidebar collapsible on both the artifact detail view and the meeting view. When collapsed, the sidebar slides out and main content expands to fill the space. State persists per view via localStorage so the user's preference survives page navigation.

## Codebase Context

### Artifact Sidebar

The artifact detail page (`web/app/projects/[name]/artifacts/[...path]/page.tsx`) delegates layout to `ArtifactDetailLayout` (`web/components/artifact/ArtifactDetailLayout.tsx`). That component receives `main` and `sidebar` as props and renders them using CSS classes from the page's module CSS (`page.module.css`).

Key CSS (from `page.module.css`):
- `.artifactBody`: flex row, `gap: var(--space-lg)`, `flex: 1`, `min-height: 0`
- `.sidebar`: `width: 280px`, `flex-shrink: 0`, `overflow-y: auto`
- `.mobileSidebar`: hidden on desktop, shown at `<=768px` via `InlinePanel`

At `<=768px`, the desktop sidebar hides (`display: none`) and the mobile InlinePanel appears. This mobile behavior stays unchanged.

### Meeting Sidebar

The meeting view (`web/components/meeting/MeetingView.tsx`, client component) renders the sidebar inline. The sidebar contains an `ArtifactsPanel` (with its own expand/collapse toggle for the artifact list) and a "Close Audience" button.

Key CSS (from `MeetingView.module.css`):
- `.meetingContent`: flex row, `gap: var(--space-md)`, `flex: 1`, `min-height: 0`
- `.sidebar`: `width: 260px`, `flex-shrink: 0`, `overflow-y: auto`
- `.mobileSidebar`: hidden on desktop, shown at `<=768px` via `InlinePanel`

Same mobile pattern as artifacts.

### Existing Components

`InlinePanel` (`web/components/ui/InlinePanel.tsx`) is a collapsible panel used for mobile sidebar relocation. It uses `useState` for expand/collapse, a brass handle button with chevron, and `aria-expanded`. Its pattern is relevant but its purpose is different: it wraps sidebar content for mobile stacking, not for desktop collapse/expand.

## Design Decisions

**Shared component: yes.** Both sidebars follow the same pattern: a fixed-width column that collapses to zero width with a toggle button. The content differs (metadata vs. artifacts+close), but the collapse behavior is identical. A shared `CollapsibleSidebar` component avoids duplicating state management, localStorage persistence, animation CSS, and the toggle button.

**Toggle placement.** A small button at the top-right edge of the sidebar when expanded, and a vertical tab anchored to the right edge of the main content area when collapsed. The collapsed indicator needs to be visible and discoverable. A floating tab labeled with a chevron and "Details"/"Artifacts" (configurable label) provides that.

**Animation approach.** CSS transitions on `width` and `opacity`. The sidebar transitions from its natural width (280px for artifacts, 260px for meetings) to 0. Paired with `overflow: hidden` during transition to clip content cleanly. The main content area auto-expands because it uses `flex: 1`. Duration: 200ms ease, fast enough to feel snappy.

**State persistence.** `localStorage` with keys `sidebar-collapsed:artifact` and `sidebar-collapsed:meeting`. Read on mount via `useState` initializer. This avoids server/client hydration mismatches because the sidebar is only collapsible at desktop widths where JS is running. At mobile widths, the CSS media query handles sidebar visibility regardless of collapse state.

**Keyboard accessibility.** The toggle button gets `aria-expanded`, `aria-label` ("Collapse sidebar"/"Expand sidebar"), and responds to Enter/Space (native `<button>` behavior). Focus moves to the collapsed tab when collapsing, and back to the sidebar content area when expanding.

## Implementation Steps

### Phase 1: CollapsibleSidebar Component

Create a shared component that wraps any sidebar content with collapse/expand behavior.

#### Step 1: Create `web/components/ui/CollapsibleSidebar.tsx`

```tsx
"use client";

interface CollapsibleSidebarProps {
  children: React.ReactNode;
  storageKey: string;       // localStorage key for persistence
  label: string;            // label shown on collapsed tab (e.g. "Details")
  width: number;            // sidebar width in px (280 for artifacts, 260 for meetings)
  className?: string;       // additional class for the sidebar container
}
```

State management:
- `useState<boolean>` initialized from `localStorage.getItem(storageKey)`. Default to `false` (expanded). Parse as `"true"` / `"false"` string.
- On toggle, write to `localStorage` and flip state.
- `useEffect` for SSR safety: read `localStorage` after mount and reconcile (same pattern as `MeetingHeader.tsx:36-48`).

Render structure:

When **expanded**:
```
<div className={containerClass} style={{ width }}>
  <button className={styles.collapseButton} aria-expanded="true" aria-label="Collapse sidebar">
    chevron-right (▶)
  </button>
  <div className={styles.content}>
    {children}
  </div>
</div>
```

When **collapsed**:
```
<div className={containerClass} style={{ width: 0 }}>
  <button className={styles.expandTab} aria-expanded="false" aria-label={`Expand ${label}`}>
    chevron-left (◀) <span>{label}</span>
  </button>
</div>
```

Decision on collapsed tab positioning: The expand button renders outside the zero-width sidebar to remain visible. Use `position: absolute` with a negative `left` offset relative to the collapsed sidebar, or render the button as a sibling. Sibling approach is cleaner: the component renders both the sidebar and a collapsed-state tab, and CSS shows one or the other.

Revised render structure:
```tsx
<>
  {collapsed && (
    <button className={styles.expandTab} onClick={toggle} aria-expanded="false" aria-label={`Show ${label}`}>
      ◀
    </button>
  )}
  <div
    className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""} ${className ?? ""}`}
    style={{ "--sidebar-width": `${width}px` } as React.CSSProperties}
  >
    {!collapsed && (
      <>
        <button className={styles.collapseButton} onClick={toggle} aria-expanded="true" aria-label={`Hide ${label}`}>
          ▶
        </button>
        <div className={styles.content}>
          {children}
        </div>
      </>
    )}
  </div>
</>
```

Using a CSS custom property `--sidebar-width` lets the CSS reference the width without hardcoding it.

#### Step 2: Create `web/components/ui/CollapsibleSidebar.module.css`

```css
.sidebar {
  width: var(--sidebar-width);
  flex-shrink: 0;
  overflow-y: auto;
  overflow-x: hidden;
  transition: width 200ms ease;
  position: relative;
}

.collapsed {
  width: 0;
  overflow: hidden;
}

.collapseButton {
  position: absolute;
  top: var(--space-sm);
  right: var(--space-sm);
  background: none;
  border: 1px solid var(--color-brass);
  border-radius: 4px;
  color: var(--color-brass);
  cursor: pointer;
  font-size: 0.6rem;
  line-height: 1;
  padding: 4px 6px;
  transition: color 0.2s, border-color 0.2s;
  z-index: 1;
}

.collapseButton:hover {
  color: var(--color-amber);
  border-color: var(--color-amber);
}

.expandTab {
  flex-shrink: 0;
  writing-mode: vertical-rl;
  background: var(--color-panel-bg);
  border: 1px solid rgba(184, 134, 11, 0.3);
  border-radius: 4px 0 0 4px;
  color: var(--color-brass);
  cursor: pointer;
  font-family: var(--font-body);
  font-size: 0.75rem;
  padding: var(--space-sm) var(--space-xs);
  transition: color 0.2s, border-color 0.2s;
  align-self: flex-start;
}

.expandTab:hover {
  color: var(--color-amber);
  border-color: var(--color-amber);
}

.content {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}
```

The `expandTab` uses `writing-mode: vertical-rl` so it reads as a vertical tab along the edge. This is a compact, discoverable affordance that doesn't take horizontal space.

At `<=768px`, this component is not rendered (the parent views hide the desktop sidebar and show InlinePanel instead). No responsive rules needed in this file.

### Phase 2: Integrate into Artifact Detail View

#### Step 1: Update `ArtifactDetailLayout.tsx`

Currently imports styles from the page module CSS. Change to wrap the sidebar slot in `CollapsibleSidebar`:

```tsx
import CollapsibleSidebar from "@/web/components/ui/CollapsibleSidebar";

export default function ArtifactDetailLayout({ main, sidebar, panelLabel = "Details" }) {
  return (
    <>
      <div className={styles.artifactBody}>
        <div className={styles.main}>{main}</div>
        <CollapsibleSidebar storageKey="sidebar-collapsed:artifact" label={panelLabel} width={280}>
          {sidebar}
        </CollapsibleSidebar>
      </div>
      <div className={styles.mobileSidebar}>
        <InlinePanel label={panelLabel}>{sidebar}</InlinePanel>
      </div>
    </>
  );
}
```

#### Step 2: Update `page.module.css`

Remove the `.sidebar` class (its responsibility moves to `CollapsibleSidebar.module.css`). The `overflow-y: auto` and `width: 280px` are now handled by the shared component.

Keep the `.mobileSidebar` and its 768px media query. Add a rule to hide `CollapsibleSidebar` at mobile:

```css
@media (max-width: 768px) {
  /* CollapsibleSidebar is hidden at mobile; InlinePanel takes over */
  .artifactBody > :last-child {
    display: none;
  }

  .mobileSidebar {
    display: block;
  }
}
```

Wait, this is fragile. Better approach: `ArtifactDetailLayout` already has `styles.sidebar` wrapping the sidebar content. Instead of removing that class, keep it as a wrapper that hides at mobile:

Revised approach for Step 1: Don't remove the `.sidebar` div. Wrap `CollapsibleSidebar` inside it:

```tsx
<div className={styles.artifactBody}>
  <div className={styles.main}>{main}</div>
  <div className={styles.sidebar}>
    <CollapsibleSidebar storageKey="sidebar-collapsed:artifact" label={panelLabel} width={280}>
      {sidebar}
    </CollapsibleSidebar>
  </div>
</div>
```

No. That double-wraps and the width logic fights. Cleaner: replace the `.sidebar` div entirely with `CollapsibleSidebar`, and move the mobile hide rule to target the `CollapsibleSidebar` wrapper via a passed `className`.

Final approach: `ArtifactDetailLayout` passes `className={styles.desktopSidebar}` to `CollapsibleSidebar`. The CSS for `.desktopSidebar` sets `display: none` at `<=768px`.

```css
.desktopSidebar {
  /* visible by default */
}

@media (max-width: 768px) {
  .desktopSidebar {
    display: none;
  }
}
```

The `CollapsibleSidebar` renders a fragment (tab + sidebar div), so the `className` applies to the sidebar div. The expand tab also needs to hide at mobile. Since `CollapsibleSidebar` renders both as siblings in a fragment, the parent layout needs to handle hiding both. Simplest: wrap both in a container div inside `CollapsibleSidebar` and apply `className` to that.

Revised `CollapsibleSidebar` render:
```tsx
<div className={`${styles.wrapper} ${className ?? ""}`}>
  {collapsed && <button className={styles.expandTab} ... />}
  <div className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""}`} style={...}>
    ...
  </div>
</div>
```

The `.wrapper` is a flex item in the parent row, sized by its content (the sidebar or the expand tab). This is the cleanest approach.

Update `CollapsibleSidebar.module.css`:
```css
.wrapper {
  display: flex;
  flex-shrink: 0;
}
```

Now `className` on the wrapper handles the mobile hide. The artifact layout passes `className={styles.desktopSidebar}` and the meeting view does the same with its own CSS module class.

#### Step 2 (revised): Update `page.module.css`

Remove `.sidebar` class (replaced by CollapsibleSidebar wrapper). Rename to `.desktopSidebar` with only the mobile hide rule:

```css
.desktopSidebar {
  /* no desktop styles needed; CollapsibleSidebar handles width/overflow */
}

@media (max-width: 768px) {
  .desktopSidebar {
    display: none;
  }
}
```

Keep `.mobileSidebar` and its media query unchanged.

**Verification**: Load an artifact. Sidebar should be expanded by default. Click the collapse button. Sidebar should animate to zero width, main content expands. A vertical tab appears at the right edge. Click the tab to re-expand. Refresh the page: collapsed state persists. Resize to mobile: sidebar disappears regardless, InlinePanel appears at bottom.

### Phase 3: Integrate into Meeting View

#### Step 1: Update `MeetingView.tsx`

Replace the inline sidebar div with `CollapsibleSidebar`:

```tsx
import CollapsibleSidebar from "@/web/components/ui/CollapsibleSidebar";

// In the render, replace:
//   <div className={styles.sidebar}>{sidebarContent}</div>
// With:
<CollapsibleSidebar
  storageKey="sidebar-collapsed:meeting"
  label={`Artifacts (${artifacts.length})`}
  width={260}
  className={styles.desktopSidebar}
>
  {sidebarContent}
</CollapsibleSidebar>
```

The existing `mobileSidebar` div and its `InlinePanel` stay unchanged.

#### Step 2: Update `MeetingView.module.css`

Replace `.sidebar` with `.desktopSidebar`:

```css
.desktopSidebar {
  /* CollapsibleSidebar handles width, overflow, and collapse */
}

@media (max-width: 768px) {
  .desktopSidebar {
    display: none;
  }

  .mobileSidebar {
    display: block;
  }
}
```

Remove the old `.sidebar` block (width, flex-shrink, display, flex-direction, gap, overflow-y). The `CollapsibleSidebar` component and its CSS module now own those properties. The `.content` class inside `CollapsibleSidebar.module.css` handles the flex column gap.

**Verification**: Load an open meeting. Sidebar with artifacts panel and close button should be visible. Collapse it. Chat area expands. Vertical tab shows "Artifacts (N)". Re-expand. State persists across page refresh. Mobile: no change from current behavior.

### Phase 4: Tests

#### Step 1: Unit test for CollapsibleSidebar

**File**: `tests/web/components/ui/CollapsibleSidebar.test.tsx`

Test cases:
- Renders children when expanded (default state)
- Does not render children when collapsed
- Toggle button flips state
- Reads initial state from localStorage
- Writes state to localStorage on toggle
- `aria-expanded` reflects current state
- Custom `label` appears on expand tab

Use `@testing-library/react` patterns consistent with existing component tests. Mock `localStorage` via a simple object assignment on `globalThis`.

#### Step 2: Integration verification

No automated browser tests exist in this project. Manual verification covers:
- Artifact detail view: collapse, expand, persist, mobile fallback
- Meeting view: collapse, expand, persist, mobile fallback
- Image artifact view: same behavior as document artifact (both go through `ArtifactDetailLayout`)
- Keyboard: Tab to toggle button, Enter to activate, focus management

## Edge Cases

**Narrow viewports (769px-900px).** The sidebar at 280px on a 800px viewport leaves only 520px for main content. Collapsing the sidebar gives full width. This is the strongest use case for the feature.

**Collapsed state + mobile.** If the user collapses the sidebar on desktop and then resizes to mobile, the mobile InlinePanel appears regardless. The collapse state doesn't interfere because the desktop sidebar is hidden via `display: none` at `<=768px`.

**Multiple artifacts in one session.** The localStorage key is `sidebar-collapsed:artifact`, not per-artifact. All artifact pages share the preference. This is intentional: the user is choosing "I prefer full-width reading" not "hide metadata on this specific artifact."

**Meeting close flow.** When the meeting is closed (showing `NotesDisplay`), the sidebar is not rendered. The collapse state has no effect on the closed meeting view.

**SSR hydration.** The component reads localStorage in a `useState` initializer guarded by `typeof window !== "undefined"`. On the server, it defaults to expanded. On the client, if localStorage says collapsed, the first render will flash expanded then collapse. To avoid this, use the same `useEffect` + `startTransition` pattern from `MeetingHeader.tsx:36-48`: render expanded on server, check localStorage in `useEffect`, transition to collapsed if needed. The 200ms CSS transition makes this imperceptible.

## Files Changed Summary

| File | Phase | Change |
|------|-------|--------|
| `web/components/ui/CollapsibleSidebar.tsx` | 1 | New: shared collapsible sidebar component |
| `web/components/ui/CollapsibleSidebar.module.css` | 1 | New: sidebar, collapsed, expand tab, collapse button styles |
| `web/components/artifact/ArtifactDetailLayout.tsx` | 2 | Replace sidebar div with CollapsibleSidebar |
| `web/app/projects/[name]/artifacts/[...path]/page.module.css` | 2 | Replace `.sidebar` with `.desktopSidebar` (mobile hide only) |
| `web/components/meeting/MeetingView.tsx` | 2 | Replace sidebar div with CollapsibleSidebar |
| `web/components/meeting/MeetingView.module.css` | 3 | Replace `.sidebar` with `.desktopSidebar` (mobile hide only) |
| `tests/web/components/ui/CollapsibleSidebar.test.tsx` | 4 | New: unit tests for the shared component |

Five modified files, two new files. Four phases, each independently verifiable.

## Delegation

- **Phase 1-3**: Dalton (implementation). The component is self-contained and the integration points are well-defined.
- **Phase 4**: Dalton (tests alongside implementation, or as a follow-up if phased).
- **Review**: Thorne after each phase. Focus on CSS transition correctness, accessibility attributes, localStorage edge cases, and mobile fallback behavior.
