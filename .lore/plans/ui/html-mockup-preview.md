---
title: "HTML Mockup Preview"
date: 2026-04-06
status: executed
tags: [ui, artifacts, mockups, preview]
modules: [lib/types, lib/artifacts, daemon/routes/artifacts, lib/daemon-client, "web/app/api/artifacts/mockup/route", "web/app/projects/[name]/artifacts/[...path]/page", web/components/project/ArtifactList, web/components/dashboard/RecentArtifacts]
related:
  - .lore/specs/ui/html-mockup-preview.md
  - .lore/plans/ui/artifact-image-display.md
  - .lore/specs/infrastructure/daemon-application-boundary.md
---

# Plan: HTML Mockup Preview

## Goal

Make self-contained HTML mockups discoverable in artifact views and previewable in a new browser tab. The work follows the same four-layer pattern as image display (scanner, daemon, proxy, UI) but is simpler: no inline rendering, no binary streaming, no metadata endpoint. The mockup opens in a new tab as raw HTML with security headers.

## Codebase Context

**Scanner.** `collectArtifactFiles()` at `lib/artifacts.ts:330-348` collects `.md` and image files. The extension check at line 341 is `ext === ".md" || IMAGE_EXTENSIONS.has(ext)`. Adding `.html` means widening this filter. The `scanArtifacts()` loop at lines 131-195 branches on `IMAGE_EXTENSIONS.has(ext)` to produce synthetic metadata for images. HTML files need the same synthetic metadata treatment (title from filename, status "complete", date from mtime), with `artifactType: "mockup"` instead of `"image"`.

**Artifact type.** The `Artifact` interface at `lib/types.ts:68-78` has `artifactType?: "document" | "image"`. This union needs a third member: `"mockup"`. All code that switches on `artifactType` must handle the new value. Current switch points:
- `ArtifactList.tsx:47` (tree view icon selection)
- `RecentArtifacts.tsx:74` (recent scrolls icon selection)
- `serializeArtifact()` at `daemon/routes/artifacts.ts:397` (default fallback)
- Catch-all page at `web/app/projects/[name]/artifacts/[...path]/page.tsx:53-54` (extension-based branch)

**Daemon routes.** The image serving pattern at `daemon/routes/artifacts.ts:194-244` is the template: validate params, check extension, resolve integration worktree, `validatePath()`, read file, return with typed headers. The mockup route is simpler because it uses the integration worktree only (REQ-MKP-9) and has a fixed Content-Type.

**Image proxy pattern.** The Next.js proxy at `web/app/api/artifacts/image/route.ts` uses `daemonFetchBinary()` from `lib/daemon-client.ts` to forward binary responses. The mockup proxy follows the same shape but must also forward CSP and other security headers from the daemon response (REQ-MKP-13).

**Catch-all route.** `web/app/projects/[name]/artifacts/[...path]/page.tsx` branches on `IMAGE_EXTENSIONS` at line 53. An HTML file currently falls through to the document branch and gets parsed as markdown with gray-matter, producing garbled output. The fix adds an `.html` check before the image check.

**CSS Modules.** No Tailwind. Fantasy design tokens from `globals.css`. New components get `.module.css` files. No raw color values; use `var(--color-*)` tokens.

## Implementation Steps

### Phase 1: Type Foundation and Scanner

Everything downstream depends on the scanner producing mockup artifacts with the right shape. This phase is a single commission.

#### Step 1: Extend the `artifactType` union

**Modified file:** `lib/types.ts`

Change the `artifactType` field on the `Artifact` interface at line 77:

```ts
artifactType?: "document" | "image" | "mockup";
```

The JSDoc comment should be updated to mention mockups:

```ts
/** Distinguishes document artifacts (.md), image artifacts, and HTML mockup artifacts. Defaults to "document" when absent. */
```

**Verification:** Typecheck passes. Grep for `artifactType` confirms no switch/conditional treats the union as exhaustive without handling `"mockup"`.

**Covers:** REQ-MKP-5

#### Step 2: Add `.html` to the file collector

**Modified file:** `lib/artifacts.ts`

At `collectArtifactFiles()` line 341, widen the filter:

```ts
if (ext === ".md" || ext === ".html" || IMAGE_EXTENSIONS.has(ext)) {
```

No new constant needed. `.html` is the sole mockup extension (REQ-MKP-1). A constant for one value adds indirection without benefit.

**Covers:** REQ-MKP-1

#### Step 3: Add mockup branch in `scanArtifacts()`

**Modified file:** `lib/artifacts.ts`

In the `scanArtifacts()` loop at lines 131-195, the current structure is:

```
if (IMAGE_EXTENSIONS.has(ext)) → image branch
else → markdown branch
```

Add a mockup branch before the markdown fallback:

```ts
if (IMAGE_EXTENSIONS.has(ext)) {
  // existing image branch (unchanged)
} else if (ext === ".html") {
  const stat = await fs.stat(filePath);
  const relPath = toPosixPath(path.relative(resolvedBase, filePath));
  const filename = path.basename(filePath, ext);
  const title = filename
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  artifacts.push({
    meta: {
      title,
      date: stat.mtime.toISOString().split("T")[0],
      type: artifactTypeSegment(relPath) || undefined,
      status: "complete",
      tags: [],
    },
    filePath,
    relativePath: relPath,
    content: "",
    lastModified: stat.mtime,
    artifactType: "mockup",
  });
} else {
  // existing markdown branch (unchanged)
}
```

This mirrors the image branch exactly, per the spec's directive to match the image artifact pattern (REQ-MKP-4). Content is empty string, no `rawContent`. No frontmatter parsing attempted.

**Covers:** REQ-MKP-1, REQ-MKP-3, REQ-MKP-4, REQ-MKP-5

#### Step 4: Tests for scanner changes

**Modified file:** `tests/lib/artifacts.test.ts`

Add test cases within the existing artifact scanner test suite:

- HTML files in `.lore/` appear in scan results with `artifactType: "mockup"`
- HTML artifacts get synthetic metadata: title from filename, date from mtime, status "complete", empty tags
- Mixed `.md`, image, and `.html` files all discovered in a single scan
- HTML files in nested directories discovered correctly
- Non-`.html` extensions (`.htm`, `.xhtml`) are not collected
- `content` is empty string for mockup artifacts

**Verification:** `bun test tests/lib/artifacts.test.ts` passes.

**Covers:** REQ-MKP-1, REQ-MKP-4, REQ-MKP-5

### Phase 2: Daemon Mockup Serving

Depends on Phase 1 (type union must exist). This is a single commission.

#### Step 5: Add the mockup serving endpoint

**Modified file:** `daemon/routes/artifacts.ts`

Add a new route within `createArtifactRoutes`:

```
GET /workspace/artifact/mockup/read?projectName=X&path=Y
```

Implementation follows the image serving pattern at lines 194-244, with these differences:

1. Validate `projectName` and `path` query params (same as image read).
2. Validate file extension is `.html`. Return 415 for anything else (REQ-MKP-7). No MIME map needed; the type is fixed.
3. Resolve base path from integration worktree only (REQ-MKP-9). No activity worktree resolution. This is simpler than the image route.
4. Build lore path via `projectLorePath()`, call `validatePath()` to prevent traversal (REQ-MKP-8).
5. Read the file with `fs.readFile(filePath)` (as Buffer for clean passthrough).
6. Return with `c.body(buffer, 200, headers)`:
   - `Content-Type: text/html; charset=utf-8` (REQ-MKP-6)
   - `Content-Security-Policy: default-src 'self' 'unsafe-inline' data:; script-src 'unsafe-inline'; style-src 'unsafe-inline' data:; img-src 'self' data: blob:; connect-src 'none'; frame-ancestors 'none'` (REQ-MKP-10)
   - `X-Content-Type-Options: nosniff` (REQ-MKP-10)
   - `Content-Disposition: inline` (REQ-MKP-10)
   - `Cache-Control: no-cache` (REQ-MKP-17)
   - `Content-Length` from buffer length

Add the corresponding `OperationDefinition` to the operations array:

```ts
{
  operationId: "workspace.artifact.mockup.read",
  version: "1",
  name: "read",
  description: "Serve raw HTML for a mockup artifact",
  invocation: { method: "GET", path: "/workspace/artifact/mockup/read" },
  sideEffects: "",
  context: { project: true },
  idempotent: true,
  hierarchy: { root: "workspace", feature: "artifact", object: "mockup" },
  parameters: [
    { name: "projectName", required: true, in: "query" as const },
    { name: "path", required: true, in: "query" as const },
  ],
}
```

Add `"workspace.artifact.mockup": "HTML mockup artifacts"` to the descriptions record.

**Covers:** REQ-MKP-6, REQ-MKP-7, REQ-MKP-8, REQ-MKP-9, REQ-MKP-10, REQ-MKP-11, REQ-MKP-17

#### Step 6: Tests for the mockup serving endpoint

**Modified file:** `tests/daemon/routes/artifacts.test.ts`

Add test cases using the existing Hono `app.request()` test pattern:

- Returns 200 with `Content-Type: text/html; charset=utf-8` for valid `.html` path
- Response body matches file content exactly (no transformation)
- CSP header contains `connect-src 'none'` and `frame-ancestors 'none'`
- `X-Content-Type-Options: nosniff` header present
- `Cache-Control: no-cache` header present
- Returns 400 for missing `projectName` or `path`
- Returns 404 for project not in config
- Returns 404 for non-existent file
- Returns 415 for non-`.html` extension (e.g., `.htm`, `.txt`)
- Returns 400 for path traversal attempt (`../../../etc/passwd`)

**Verification:** `bun test tests/daemon/routes/artifacts.test.ts` passes.

**Covers:** REQ-MKP-6, REQ-MKP-7, REQ-MKP-8, REQ-MKP-10, REQ-MKP-17, REQ-MKP-18, REQ-MKP-19

### Phase 3: Next.js Proxy Route

Depends on Phase 2 (daemon endpoint must exist for integration testing). This is a single commission.

#### Step 7: Add the mockup proxy route

**New file:** `web/app/api/artifacts/mockup/route.ts`

Follows the image proxy pattern at `web/app/api/artifacts/image/route.ts`. Key differences:

- Calls `/workspace/artifact/mockup/read` instead of `/workspace/artifact/image/read`
- Forwards additional headers from daemon response: `Content-Security-Policy`, `X-Content-Type-Options`, `Content-Disposition` (REQ-MKP-13)
- Uses `daemonFetchBinary()` from `lib/daemon-client.ts` (already exists)

```ts
import { NextRequest, NextResponse } from "next/server";
import { daemonFetchBinary, isDaemonError } from "@/lib/daemon-client";

export async function GET(request: NextRequest) {
  const project = request.nextUrl.searchParams.get("project");
  const mockupPath = request.nextUrl.searchParams.get("path");

  if (!project || !mockupPath) {
    return NextResponse.json(
      { error: "Missing project or path" },
      { status: 400 },
    );
  }

  const result = await daemonFetchBinary(
    `/workspace/artifact/mockup/read?projectName=${encodeURIComponent(project)}&path=${encodeURIComponent(mockupPath)}`,
  );

  if (isDaemonError(result)) {
    return NextResponse.json(
      { error: "Daemon is not running" },
      { status: 503 },
    );
  }

  if (result.status !== 200) {
    return new NextResponse(new Uint8Array(result.body), {
      status: result.status,
      headers: {
        "Content-Type": result.headers["content-type"] ?? "application/json",
      },
    });
  }

  return new NextResponse(new Uint8Array(result.body), {
    status: 200,
    headers: {
      "Content-Type": result.headers["content-type"] ?? "text/html; charset=utf-8",
      "Content-Security-Policy": result.headers["content-security-policy"] ?? "",
      "X-Content-Type-Options": result.headers["x-content-type-options"] ?? "nosniff",
      "Content-Disposition": result.headers["content-disposition"] ?? "inline",
      "Cache-Control": result.headers["cache-control"] ?? "no-cache",
    },
  });
}
```

**Verification:** Typecheck passes. Manual test: daemon running, hit `/api/artifacts/mockup?project=X&path=Y` in browser, verify HTML renders with CSP headers in dev tools.

**Covers:** REQ-MKP-13, REQ-MKP-18, REQ-MKP-19

#### Step 8: Tests for the proxy route

**New file:** `tests/web/api/artifacts-mockup.test.ts` (or add to existing proxy test file if one exists)

- Forwards 200 response with body and headers intact
- Forwards 404 status from daemon
- Forwards 415 status from daemon
- Returns 400 for missing `project` or `path` params
- Returns 503 when daemon is offline
- CSP header from daemon is preserved in proxy response

**Verification:** `bun test tests/web/api/artifacts-mockup.test.ts` passes.

**Covers:** REQ-MKP-13, REQ-MKP-18, REQ-MKP-19

### Phase 4: UI Integration

Depends on Phase 1 (scanner produces mockup artifacts) and Phase 3 (proxy route exists for preview URLs). This phase touches four files and can be a single commission.

#### Step 9: Branch the catch-all route for mockup artifacts

**Modified file:** `web/app/projects/[name]/artifacts/[...path]/page.tsx`

The current branching at lines 53-54 checks `IMAGE_EXTENSIONS`. Add an `.html` check before the image check:

```ts
const ext = relativePath.split(".").pop()?.toLowerCase() ?? "";
const isHtml = ext === "html";
const isImage = IMAGE_EXTENSIONS.has(ext);
```

Add a mockup branch before the image branch. The mockup detail view (REQ-MKP-14) renders:
- `ArtifactProvenance` breadcrumb header
- `ArtifactDetailLayout` with:
  - Main area: a landing page with description text and an "Open Preview" button
  - Sidebar: filename, file size, last modified date

The main area is a new component (`MockupPreviewLanding`) or inline JSX. Given its simplicity, inline JSX is sufficient:

```tsx
if (isHtml) {
  // Fetch file metadata (stat) from the mockup endpoint
  // We need file size and mtime for the sidebar. The daemon doesn't have
  // a separate metadata endpoint for mockups (unlike images). Use a HEAD
  // request or a lightweight stat approach.
  //
  // Decision: Add a daemon endpoint for mockup metadata, or derive from
  // the document list. The simpler path: fetch the artifact list and find
  // this path in it. But that's expensive for one file.
  //
  // Better: reuse the mockup read endpoint just for headers (Content-Length
  // gives file size). But that fetches the whole file server-side.
  //
  // Simplest: stat the file via a new lightweight daemon endpoint, or
  // accept that the sidebar shows only filename and last-modified from
  // the artifact scan data.
  //
  // Resolution: The catch-all page is a server component. It can fetch
  // the artifact list (already cached per-request by Next.js) and find
  // this artifact in it. The artifact list includes lastModified. File
  // size is not in the scan result, so the sidebar omits it (or we add
  // a mockup meta endpoint later).

  const listResult = await fetchDaemon<{ artifacts: Array<SerializedArtifact & { artifactType?: string }> }>(
    `/workspace/artifact/document/list?projectName=${encoded}`,
  );
  const mockupArtifact = listResult.ok
    ? listResult.data.artifacts.find((a) => a.relativePath === relativePath)
    : undefined;

  const mockupTitle = mockupArtifact?.meta.title || relativePath.split("/").pop()?.replace(/\.html$/, "").replace(/[-_]/g, " ") || relativePath;
  const previewUrl = `/api/artifacts/mockup?project=${encodeURIComponent(projectName)}&path=${encodeURIComponent(relativePath)}`;

  return (
    <div className={styles.artifactView}>
      <ArtifactProvenance
        projectName={projectName}
        projectTitle={projectTitle}
        artifactTitle={mockupTitle}
        artifactPath={relativePath}
      />
      <ArtifactDetailLayout
        main={
          <MockupPreviewLanding
            previewUrl={previewUrl}
            filename={relativePath.split("/").pop() ?? ""}
            lastModified={mockupArtifact?.lastModified}
          />
        }
        sidebar={
          <MockupMetadataSidebar
            filename={relativePath.split("/").pop() ?? ""}
            lastModified={mockupArtifact?.lastModified}
            projectName={projectName}
          />
        }
      />
    </div>
  );
}
```

**Note on file size:** The scan result doesn't include file size. Rather than adding a daemon metadata endpoint for mockups (as was done for images), the sidebar omits file size in Phase 4. If file size is desired, a future commission can add a `/workspace/artifact/mockup/meta` endpoint following the image meta pattern. The spec lists file size in REQ-MKP-14's sidebar, so this is a known gap. The implementer should flag it in the review.

**Covers:** REQ-MKP-14, REQ-MKP-18

#### Step 10: Create `MockupPreviewLanding` component

**New file:** `web/components/artifact/MockupPreviewLanding.tsx`
**New file:** `web/components/artifact/MockupPreviewLanding.module.css`

Client component (needs `window.open()` for the button click). Renders:

- A brief description: "This is an HTML mockup. Click Open Preview to view it in a new tab."
- A prominent "Open Preview" button styled to match the fantasy aesthetic
- The button calls `window.open(previewUrl, '_blank', 'noopener,noreferrer')` (REQ-MKP-16)

```tsx
"use client";

import styles from "./MockupPreviewLanding.module.css";

interface MockupPreviewLandingProps {
  previewUrl: string;
  filename: string;
  lastModified?: string;
}

export default function MockupPreviewLanding({
  previewUrl,
  filename,
}: MockupPreviewLandingProps) {
  const handleOpen = () => {
    window.open(previewUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className={styles.landing}>
      <div className={styles.icon} aria-hidden="true">{"\uD83D\uDDA5"}</div>
      <h2 className={styles.filename}>{filename}</h2>
      <p className={styles.description}>
        This is an HTML mockup. Click Open Preview to view it in a new tab.
      </p>
      <button
        type="button"
        className={styles.previewButton}
        onClick={handleOpen}
      >
        Open Preview
      </button>
    </div>
  );
}
```

CSS should center the content vertically, style the button with the fantasy button pattern (parchment background, brass border, hover glow). Use design tokens from `globals.css`.

**Covers:** REQ-MKP-14, REQ-MKP-16

#### Step 11: Create `MockupMetadataSidebar` component

**New file:** `web/components/artifact/MockupMetadataSidebar.tsx`
**New file:** `web/components/artifact/MockupMetadataSidebar.module.css`

Server component. Shows:
- Filename
- Last modified date (formatted)
- Project link (same pattern as `ImageMetadataSidebar`)

Omits file size (see Step 9 note). Omits status, tags, modules, related, actions (no edit capability per spec constraints). Reuses the `Panel` component and section structure from `ImageMetadataSidebar.tsx`.

**Covers:** REQ-MKP-14

#### Step 12: Add mockup icon and preview action to tree view

**Modified file:** `web/components/project/ArtifactList.tsx`

In `TreeNodeRow` at line 47, the current check is:

```ts
const isImage = node.artifact.artifactType === "image";
```

Extend to handle mockups:

```ts
const isImage = node.artifact.artifactType === "image";
const isMockup = node.artifact.artifactType === "mockup";
```

Render a distinct icon for mockups (REQ-MKP-2). Use a Unicode monitor character (`\uD83D\uDDA5`) or a CSS-styled span, matching the approach used for the image icon.

Add a "preview" action button for mockup artifacts (REQ-MKP-15). When clicked, it opens the mockup directly in a new tab via `window.open()`, bypassing the detail view. This requires making `TreeNodeRow` (or the mockup-specific branch) a client component for the click handler. Since `ArtifactList.tsx` is already `"use client"`, this works naturally.

```tsx
{isMockup ? (
  <>
    <span className={styles.mockupIcon} aria-hidden="true">{"\uD83D\uDDA5"}</span>
    {/* ... title, meta, status badge ... */}
    <button
      type="button"
      className={styles.previewAction}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const url = `/api/artifacts/mockup?project=${encodeURIComponent(encodedProjectName)}&path=${encodeURIComponent(node.artifact!.relativePath)}`;
        window.open(url, "_blank", "noopener,noreferrer");
      }}
      title="Open preview in new tab"
    >
      Preview
    </button>
  </>
) : isImage ? (
  // existing image icon
) : (
  // existing scroll icon
)}
```

Add `.mockupIcon` and `.previewAction` classes to `ArtifactList.module.css`.

**Covers:** REQ-MKP-2, REQ-MKP-15, REQ-MKP-16

#### Step 13: Add mockup icon to Recent Scrolls

**Modified file:** `web/components/dashboard/RecentArtifacts.tsx`

At line 74, extend the icon selection:

```tsx
{artifact.artifactType === "mockup" ? (
  <span className={styles.mockupIcon} aria-hidden="true">{"\uD83D\uDDA5"}</span>
) : artifact.artifactType === "image" ? (
  <span className={styles.imageIcon} aria-hidden="true">{"\uD83D\uDDBC"}</span>
) : (
  <img src="/images/ui/scroll-icon.webp" ... />
)}
```

Add `.mockupIcon` to `RecentArtifacts.module.css`.

**Covers:** REQ-MKP-3

#### Step 14: Update `artifactHref` for mockup artifacts

**Modified file:** `web/components/dashboard/RecentArtifacts.tsx`

The `artifactHref()` function at line 27-49 routes meetings specially and falls through to the artifact detail view for everything else. Mockup artifacts should link to the detail view (where the "Open Preview" button lives), not directly to the preview URL. The current fallback at line 48 already does this:

```ts
return `/projects/${encodedName}/artifacts/${artifact.relativePath}`;
```

No change needed. The detail view handles `.html` artifacts via Step 9.

**Verification:** Mockup artifacts in Recent Scrolls link to the detail view, not a broken markdown parse.

### Phase 5: Review

Depends on Phases 1-4. Separate commission for an independent reviewer.

#### Step 15: Code review

Commission a fresh-context review covering:

- All new and modified files from Phases 1-4
- `artifactType` exhaustiveness: grep for every conditional that checks `artifactType` and verify `"mockup"` is handled
- CSP header correctness: verify the daemon sets all headers from REQ-MKP-10 and the proxy forwards them
- Security: `validatePath()` used correctly, `noopener,noreferrer` on all `window.open()` calls
- CSS: no raw color values, design tokens used throughout
- Test coverage: scanner, daemon endpoint, proxy route all have tests

#### Step 16: Fix review findings

Commission to address findings from Step 15. If no findings, this step is skipped.

## Build Order

The phases form a strict dependency chain:

```
Phase 1 (Scanner + Types)
    |
Phase 2 (Daemon Endpoint)
    |
Phase 3 (Proxy Route)
    |
Phase 4 (UI Integration)
    |
Phase 5 (Review + Fix)
```

No parallelism between phases. Each phase depends on the artifacts of the previous one. Within Phase 4, Steps 9-14 can be implemented in a single pass since they're all UI changes in the same commit context.

## Files Summary

### New Files

| File | Purpose |
|------|---------|
| `web/app/api/artifacts/mockup/route.ts` | Next.js API proxy for mockup serving |
| `web/components/artifact/MockupPreviewLanding.tsx` | Landing page with "Open Preview" button |
| `web/components/artifact/MockupPreviewLanding.module.css` | Styling for mockup landing page |
| `web/components/artifact/MockupMetadataSidebar.tsx` | Metadata panel for mockup artifacts |
| `web/components/artifact/MockupMetadataSidebar.module.css` | Styling for mockup metadata panel |

### Modified Files

| File | Changes |
|------|---------|
| `lib/types.ts` | Add `"mockup"` to `artifactType` union |
| `lib/artifacts.ts` | Widen collector to include `.html`, add mockup branch in scanner |
| `daemon/routes/artifacts.ts` | Add mockup read endpoint with CSP headers, add operation definition |
| `web/app/projects/[name]/artifacts/[...path]/page.tsx` | Add `.html` branch in catch-all route |
| `web/components/project/ArtifactList.tsx` | Mockup icon and preview action in tree view |
| `web/components/project/ArtifactList.module.css` | `.mockupIcon` and `.previewAction` classes |
| `web/components/dashboard/RecentArtifacts.tsx` | Mockup icon in Recent Scrolls |
| `web/components/dashboard/RecentArtifacts.module.css` | `.mockupIcon` class |

### Test Files

| File | What's Tested |
|------|---------------|
| `tests/lib/artifacts.test.ts` | Scanner discovers HTML files, synthetic metadata, `artifactType: "mockup"` |
| `tests/daemon/routes/artifacts.test.ts` | Mockup endpoint: headers, status codes, path validation, extension validation |
| `tests/web/api/artifacts-mockup.test.ts` | Proxy: header forwarding, error status passthrough, daemon offline |

## Testing Strategy

### Unit Tests (Automated)

| Test Area | File | What to Test |
|-----------|------|-------------|
| Scanner | `tests/lib/artifacts.test.ts` | HTML files discovered with `artifactType: "mockup"`; synthetic metadata (title, date, status "complete"); mixed `.md`/image/`.html` in single scan; `.htm` and `.xhtml` not collected; empty content |
| Daemon route | `tests/daemon/routes/artifacts.test.ts` | Correct `Content-Type: text/html; charset=utf-8`; CSP header contains `connect-src 'none'` and `frame-ancestors 'none'`; `X-Content-Type-Options: nosniff`; `Cache-Control: no-cache`; returns 415 for non-`.html`; returns 400 for traversal; returns 404 for missing file |
| Proxy | `tests/web/api/artifacts-mockup.test.ts` | Forwards body and all security headers; forwards 404/415; returns 503 when daemon offline; returns 400 for missing params |

### Manual Verification

These need a running daemon with an HTML mockup in `.lore/`:

1. **Tree view:** Mockup artifact appears with monitor icon, not scroll icon. "Preview" button visible.
2. **Preview from tree:** Clicking "Preview" opens mockup in new tab at full viewport.
3. **Detail view:** Clicking mockup title navigates to detail view with "Open Preview" button and metadata sidebar.
4. **Preview from detail:** Clicking "Open Preview" opens mockup in new tab.
5. **Recent Scrolls:** Mockup appears with monitor icon when recently modified.
6. **CSP enforcement:** In the preview tab, open dev tools Network tab. Verify no outbound requests succeed. Check Response Headers for CSP.
7. **Self-contained mockup:** An HTML file with inline scripts and styles functions correctly in the preview tab.

## Known Gaps

- **File size in sidebar:** REQ-MKP-14 lists file size in the metadata sidebar. The artifact scan result doesn't include file size. Phase 4 omits it. Adding a `/workspace/artifact/mockup/meta` endpoint (following the image meta pattern) is a natural follow-up but is not in this plan to keep scope tight.
- **Smart views:** The `artifact-smart-view.ts` module filters artifacts by type segments and statuses. Mockup artifacts with status "complete" will appear in the "Ready to Advance" smart view. This is arguably correct (they're finished work), but may need filtering if mockups clutter the view. Monitor after deployment.

## Requirement Traceability

| REQ | Step | Description |
|-----|------|-------------|
| REQ-MKP-1 | 2, 3 | Scanner discovers `.html` files |
| REQ-MKP-2 | 12 | Distinct icon in tree view |
| REQ-MKP-3 | 3, 13 | HTML artifacts in Recent Scrolls |
| REQ-MKP-4 | 3 | Synthetic metadata from filename/mtime |
| REQ-MKP-5 | 1 | `artifactType: "mockup"` on Artifact type |
| REQ-MKP-6 | 5 | Daemon mockup serving endpoint |
| REQ-MKP-7 | 5 | Extension validation (415 for non-`.html`) |
| REQ-MKP-8 | 5 | Path traversal validation via `validatePath()` |
| REQ-MKP-9 | 5 | Integration worktree resolution only |
| REQ-MKP-10 | 5 | CSP, X-Content-Type-Options, Content-Disposition headers |
| REQ-MKP-11 | 5 | Symlink containment via `validatePath()` |
| REQ-MKP-12 | 10, 14 | New tab, natural origin isolation |
| REQ-MKP-13 | 7 | Next.js proxy forwards headers |
| REQ-MKP-14 | 9, 10, 11 | Detail view with provenance, sidebar, Open Preview button |
| REQ-MKP-15 | 12 | Preview action in tree view |
| REQ-MKP-16 | 10, 12 | `window.open()` with `noopener,noreferrer` |
| REQ-MKP-17 | 5 | `Cache-Control: no-cache` |
| REQ-MKP-18 | 6, 9 | 404 handling |
| REQ-MKP-19 | 6, 7 | 415 forwarding |
| REQ-MKP-20 | 5 | Large files served without special handling |
| REQ-MKP-21 | n/a | Broken external references are expected (no work needed) |

## Delegation Guide

| Phase | Worker | Why |
|-------|--------|-----|
| Phase 1 | Dalton | Foundation work: type changes and scanner logic. Pure lib/ code. |
| Phase 2 | Dalton | Daemon route. Same worker avoids context switch from Phase 1 types. |
| Phase 3 | Dalton | Proxy route. Follows established pattern, benefits from Phase 2 context. |
| Phase 4 | Dalton | UI integration. Benefits from full-stack context of Phases 1-3. |
| Phase 5 | Thorne | Independent review. Fresh context catches what the implementer misses. |
| Phase 5 fix | Dalton | Fix findings from Thorne's review. |

Phases 1-4 can be a single commission chain (each phase depends on the prior). Alternatively, Phases 1-2 can be one commission and Phases 3-4 another, if the implementer's context window benefits from a break. The choice depends on total file count: 8 modified + 5 new = 13 files is within a single commission's comfortable range if the changes per file are modest (they are).

**Recommended:** Phases 1-3 as one commission (types + scanner + daemon + proxy), Phase 4 as a second (UI), Phase 5 as review.
