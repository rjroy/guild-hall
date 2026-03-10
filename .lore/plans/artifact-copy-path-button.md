---
title: Artifact Copy Path Button
date: 2026-03-09
status: implemented
tags: [ui, artifacts, clipboard, ux]
modules: [artifact-view]
related:
  - .lore/specs/guild-hall-views.md
---

# Plan: Artifact Copy Path Button

## Goal

Add a "Copy Path" button to the artifact view header that copies the artifact's `.lore/`-relative path (e.g., `.lore/specs/guild-hall-system.md`) to the clipboard. Clicking it during a conversation with the Guild Master lets the user paste the path directly instead of typing a title and forcing a search.

## Codebase Context

**Path computation:**
The artifact page at `web/app/projects/[name]/artifacts/[...path]/page.tsx:17-19` already computes `relativePath = pathSegments.map(decodeURIComponent).join("/")`. This gives the `.lore/`-relative path (e.g., `specs/guild-hall-system.md`). The full path to copy is `.lore/${relativePath}`.

**Component structure:**
- `ArtifactProvenance` (`web/components/artifact/ArtifactProvenance.tsx`) is a server component that renders `ArtifactBreadcrumb` above a source row. The breadcrumb is where REQ-VIEW-36 says the path is shown — the copy button belongs here.
- `ArtifactBreadcrumb` (`web/components/artifact/ArtifactBreadcrumb.tsx`) is a pure server component. It stays unchanged.
- `ArtifactContent` (`web/components/artifact/ArtifactContent.tsx`) is a client component with an Edit button, but its toolbar is scoped to content editing actions. Don't mix clipboard into content editing.

**Existing button styling (`web/components/artifact/ArtifactContent.module.css:38-47`):**
Brass-toned buttons: `background-color: rgba(184, 134, 11, 0.15)`, `border: 1px solid var(--color-brass)`, `color: var(--color-brass)`, `font-size: 0.8rem`, `font-weight: 600`, `padding: var(--space-xs) var(--space-md)`, `border-radius: 3px`. Hover to `rgba(184, 134, 11, 0.3)` and `var(--color-amber)`. Copy Path should use the same treatment.

**No existing clipboard patterns** in the codebase. This is the first `navigator.clipboard` usage.

## Implementation Steps

### Step 1: Create `CopyPathButton`

**New file:** `web/components/artifact/CopyPathButton.tsx`
**New file:** `web/components/artifact/CopyPathButton.module.css`

`CopyPathButton` is a `"use client"` component. It receives one prop: `path: string` — the full path string to write to the clipboard (e.g., `.lore/specs/guild-hall-system.md`).

```tsx
"use client";

import { useState } from "react";
import styles from "./CopyPathButton.module.css";

export default function CopyPathButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(path).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      className={styles.copyButton}
      onClick={handleCopy}
      title={path}
      aria-label={copied ? "Path copied" : "Copy artifact path"}
    >
      {copied ? "Copied!" : "Copy Path"}
    </button>
  );
}
```

The CSS follows the brass button pattern:

```css
.copyButton {
  padding: var(--space-xs) var(--space-md);
  font-family: var(--font-body);
  font-size: 0.8rem;
  font-weight: 600;
  border-radius: 3px;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
  background-color: rgba(184, 134, 11, 0.15);
  border: 1px solid var(--color-brass);
  color: var(--color-brass);
  white-space: nowrap;
  flex-shrink: 0;
}

.copyButton:hover {
  background-color: rgba(184, 134, 11, 0.3);
  color: var(--color-amber);
}

/* Confirmed state: brief green flash to signal success */
.copyButton[aria-label="Path copied"] {
  background-color: rgba(76, 148, 76, 0.2);
  border-color: #4c944c;
  color: #8bc88b;
}
```

The "Copied!" state is communicated by swapping the button label (visual feedback) and the `aria-label` (screen reader feedback). Using `aria-label` to drive the "confirmed" style avoids a separate CSS class and keeps state logic in one place.

### Step 2: Update `ArtifactProvenance`

**Modified file:** `web/components/artifact/ArtifactProvenance.tsx`
**Modified file:** `web/components/artifact/ArtifactProvenance.module.css`

Add `artifactPath: string` to `ArtifactProvenanceProps`. Wrap `ArtifactBreadcrumb` and `CopyPathButton` in a `.breadcrumbRow` div so they sit on the same line with the button right-aligned.

```tsx
<div className={styles.provenance}>
  <div className={styles.breadcrumbRow}>
    <ArtifactBreadcrumb
      projectName={projectName}
      artifactTitle={artifactTitle}
    />
    <CopyPathButton path={`.lore/${artifactPath}`} />
  </div>
  <div className={styles.sourceRow}>
    <WorkerPortrait size="sm" />
    <p className={styles.text}>Source information unavailable.</p>
  </div>
</div>
```

Add to `ArtifactProvenance.module.css`:

```css
.breadcrumbRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}
```

The `ArtifactBreadcrumb` nav element naturally grows to fill the left side; the button shrinks to its intrinsic size on the right.

### Step 3: Thread `artifactPath` from the page

**Modified file:** `web/app/projects/[name]/artifacts/[...path]/page.tsx`

Pass `relativePath` to `ArtifactProvenance`:

```tsx
<ArtifactProvenance
  projectName={projectName}
  artifactTitle={displayTitle}
  artifactPath={relativePath}
/>
```

`relativePath` is already computed at line 19. No new computation needed.

### Step 4: Tests

**New file:** `tests/components/artifact-provenance.test.ts`

Call `ArtifactProvenance` as a function (same pattern as `tests/components/metadata-sidebar.test.ts`) and inspect the JSX tree:

1. `CopyPathButton` is rendered as a child of the breadcrumb row.
2. The `path` prop on `CopyPathButton` is `.lore/${artifactPath}` — verify the prefix is prepended correctly.
3. `ArtifactBreadcrumb` is still rendered with the correct props.

`CopyPathButton` uses `navigator.clipboard` and `useState`, so it cannot be tested by JSX inspection alone. The test verifies the prop threading, not the click behavior. Browser-API behavior (`navigator.clipboard.writeText`) is not unit tested here; it's a platform API.

## Validation

- Build passes (`bun run build`). TypeScript must be satisfied on both the new component and the modified server component props.
- Run `bun test` — existing tests unaffected; new `artifact-provenance.test.ts` passes.
- Manual smoke: navigate to any artifact view, confirm the button appears in the provenance bar right of the breadcrumb. Click it, paste into a text field, confirm `.lore/path/to/artifact.md` is the result. Wait 2 seconds, confirm the button label resets to "Copy Path."

## Constraints and Decisions

- **`navigator.clipboard` requires HTTPS or localhost.** Guild Hall runs locally, so this is fine. No fallback to `document.execCommand` is needed.
- **No new dependencies.** `useState` and `navigator.clipboard` are both available without additional packages.
- **Server/client boundary.** `ArtifactProvenance` remains a server component. It imports and renders `CopyPathButton` (a client component) as a child. This is the standard Next.js App Router pattern; server components can pass props to client components but not the other way around. The `path` prop is a plain string, so it crosses the boundary cleanly.
- **Why the breadcrumb row, not the content toolbar?** The content toolbar (`ArtifactContent.tsx`) is for editing actions. The path isn't content; it's metadata about where the artifact lives. The provenance bar is the right home: it already exists to show path context (REQ-VIEW-36) and provenance.
- **Why not the sidebar?** The sidebar (`MetadataSidebar.tsx`) is already functional (it's where the commission links and tags live), but it's the wrong affordance position. Users reaching for "copy path" will look at the title/header area, not the sidebar.
