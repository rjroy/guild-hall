---
title: "Image Display in Artifact Views"
date: 2026-03-18
status: executed
tags: [ui, artifacts, images, daemon, api]
modules: [lib/artifacts, lib/artifact-grouping, lib/types, lib/daemon-client, daemon/routes/artifacts, "web/app/projects/[name]/artifacts/[...path]/page", web/app/api/artifacts/image/route, web/components/artifact/ArtifactContent, web/components/artifact/ImageArtifactView, web/components/artifact/ImageMetadataSidebar, web/components/project/ArtifactList, web/components/dashboard/RecentArtifacts]
related:
  - .lore/specs/ui/artifact-image-display.md
  - .lore/specs/ui/artifact-tree-view.md
  - .lore/specs/ui/artifact-sorting.md
---

# Plan: Image Display in Artifact Views

## Goal

Make images first-class artifacts: discoverable in tree views and Recent Scrolls, viewable standalone with metadata, and renderable inline within markdown documents. The work spans four layers: scanner (discovery), daemon (serving), API proxy (Next.js), and UI components (display).

## Codebase Context

**Scanner.** `collectMarkdownFiles()` at `lib/artifacts.ts:261-276` filters to `.md` only. `scanArtifacts()` at line 90 calls it, parses frontmatter with gray-matter, and returns `Artifact[]`. Image support means widening the file filter and producing synthetic metadata for non-markdown files.

**Artifact type.** `Artifact` in `lib/types.ts:57-64` has `meta`, `filePath`, `relativePath`, `content`, `rawContent`, `lastModified`. For images, `content` will be empty string and `rawContent` omitted. The spec says add an optional `artifactType` field. The `Artifact` type is used everywhere (tree view, recent scrolls, sorting), so the field must be backward-compatible.

**Daemon routes.** `daemon/routes/artifacts.ts` has three routes under `/workspace/artifact/document/`. The new image endpoint goes under `/workspace/artifact/image/` to keep the namespace clean. The existing `serializeArtifact()` at line 247 needs to include the new `artifactType` field.

**Activity worktree resolution.** The document read route at `daemon/routes/artifacts.ts:89-131` resolves meetings/ and commissions/ paths to activity worktrees via `resolveMeetingBasePath` and `resolveCommissionBasePath` from `lib/paths.ts`. The image read route must replicate this pattern (REQ-IMG-8).

**Path validation.** `validatePath()` at `lib/artifacts.ts:14-21` resolves and checks containment. Reuse this for image serving (REQ-IMG-7).

**Next.js API proxy.** `web/app/api/artifacts/route.ts` handles PUT for document writes. A new `web/app/api/artifacts/image/route.ts` handles GET for image proxy (REQ-IMG-9). The daemon client at `lib/daemon-client.ts` uses `node:http` with `socketPath`; the proxy route needs to forward binary responses, not JSON.

**Catch-all route.** `web/app/projects/[name]/artifacts/[...path]/page.tsx` is a server component. It calls `/workspace/artifact/document/read` and renders `ArtifactContent` + `MetadataSidebar`. For images, it needs to detect the file extension and render a different component (REQ-IMG-10).

**ArtifactContent.** Client component at `web/components/artifact/ArtifactContent.tsx`. Uses ReactMarkdown with remarkGfm. The `components.img` override goes here for inline image resolution (REQ-IMG-17).

**ArtifactList (tree view).** Client component at `web/components/project/ArtifactList.tsx`. Uses scroll-icon.webp for all artifacts. Needs to switch icon for image artifacts (REQ-IMG-2).

**RecentArtifacts.** Server component at `web/components/dashboard/RecentArtifacts.tsx`. Also uses scroll-icon.webp. Same icon switch needed (REQ-IMG-3).

**CSS Modules everywhere.** No Tailwind. New components get `.module.css` files. Fantasy design tokens from `globals.css`.

**Turbopack constraint.** CSS Modules `composes` is silently ignored. Use TSX-side class composition.

## Implementation Steps

### Phase 1: Scanner and Type Foundation

Everything downstream depends on the scanner producing image artifacts with the right shape.

#### Step 1: Add `artifactType` to the Artifact type

**Modified file:** `lib/types.ts`

Add an optional field to the `Artifact` interface:

```ts
export interface Artifact {
  meta: ArtifactMeta;
  filePath: string;
  relativePath: string;
  content: string;
  rawContent?: string;
  lastModified: Date;
  /** Distinguishes document artifacts (.md) from image artifacts. Defaults to "document" when absent. */
  artifactType?: "document" | "image";
}
```

Optional with implicit default preserves backward compatibility. Existing code that doesn't care about the distinction ignores the field.

**Naming note:** REQ-IMG-23 says "a `type` field" but the spec's Constraints section (line 109) says "A new optional `artifactType` field." This plan uses `artifactType` because `type` is too generic (conflicts with TypeScript utility patterns, might collide with future fields). The spec should be updated to consistently use `artifactType` in REQ-IMG-23.

**Covers:** REQ-IMG-23 (type distinction in list response)

#### Step 2: Add image constants to `lib/artifacts.ts`

**Modified file:** `lib/artifacts.ts`

Add at the top of the file, below the existing imports:

```ts
/** File extensions recognized as image artifacts. */
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

/** Maps file extensions to MIME types for image serving. */
export const IMAGE_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};
```

Export `IMAGE_MIME_TYPES` because the daemon image serving route needs it. Keep `IMAGE_EXTENSIONS` module-private since it's only used by the scanner.

**Covers:** REQ-IMG-1 (supported extensions), REQ-IMG-24 (Content-Type mapping)

#### Step 3: Widen the file collector

**Modified file:** `lib/artifacts.ts`

Rename `collectMarkdownFiles` to `collectArtifactFiles` and widen the filter:

```ts
async function collectArtifactFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectArtifactFiles(fullPath);
      results.push(...nested);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === ".md" || IMAGE_EXTENSIONS.has(ext)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}
```

Update `scanArtifacts()` to call `collectArtifactFiles` instead of `collectMarkdownFiles`. In the loop that processes entries, branch on extension:

```ts
const ext = path.extname(filePath).toLowerCase();
if (IMAGE_EXTENSIONS.has(ext)) {
  // Synthetic metadata for image artifacts (REQ-IMG-4)
  const stat = await fs.stat(filePath);
  const relPath = path.relative(resolvedBase, filePath);
  const filename = path.basename(filePath, ext);
  const title = filename
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  artifacts.push({
    meta: {
      title,
      date: stat.mtime.toISOString().split("T")[0],
      status: "complete",
      tags: [],
    },
    filePath,
    relativePath: relPath,
    content: "",
    lastModified: stat.mtime,
    artifactType: "image",
  });
} else {
  // Existing markdown parsing logic (unchanged)
  // ...existing code, add artifactType: "document" to the push
}
```

Also update the existing markdown branch to include `artifactType: "document"` in the pushed artifact. This makes the field explicit rather than relying on absence.

**Covers:** REQ-IMG-1 (discovery), REQ-IMG-4 (synthetic metadata), REQ-IMG-5 (sorting, since artifacts go through the same sort), REQ-IMG-18/19 (generated/ images discovered like any other directory)

#### Step 4: Update `serializeArtifact` in daemon routes

**Modified file:** `daemon/routes/artifacts.ts`

Add `artifactType` to the serialized output:

```ts
function serializeArtifact(a: Artifact): Record<string, unknown> {
  return {
    relativePath: a.relativePath,
    meta: a.meta,
    content: a.content,
    lastModified: a.lastModified.toISOString(),
    artifactType: a.artifactType ?? "document",
    ...(a.rawContent !== undefined ? { rawContent: a.rawContent } : {}),
  };
}
```

**Covers:** REQ-IMG-23

### Phase 2: Image Serving (Daemon + API Proxy)

#### Step 5: Add the daemon image serving endpoint

**Modified file:** `daemon/routes/artifacts.ts`

Add a new route within `createArtifactRoutes`:

```
GET /workspace/artifact/image/read?projectName=X&path=Y
```

Implementation:

1. Validate `projectName` and `path` query params (same as document read).
2. Validate file extension is in `IMAGE_MIME_TYPES`. Return 415 if not.
3. Resolve base path: activity worktree for meetings/commissions paths, integration worktree otherwise (same logic as document read at lines 107-117).
4. Build lore path, call `validatePath()` to prevent traversal.
5. Read the file with `fs.readFile(filePath)` (binary, no encoding).
6. Return a `new Response(buffer)` with:
   - `Content-Type` from `IMAGE_MIME_TYPES`
   - `Cache-Control: max-age=300, stale-while-revalidate=60`
   - `Content-Length` from buffer length

Note: Hono's `c.body()` can return raw binary. Use `c.body(buffer, 200, headers)`.

Add the corresponding `OperationDefinition` to the operations array. Add `"workspace.artifact.image"` to the descriptions record.

**Covers:** REQ-IMG-6 (serving), REQ-IMG-7 (path validation), REQ-IMG-8 (worktree resolution), REQ-IMG-20 (cache headers), REQ-IMG-24 (Content-Type)

#### Step 6: Add the Next.js API image proxy route

**New file:** `web/app/api/artifacts/image/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const project = request.nextUrl.searchParams.get("project");
  const imagePath = request.nextUrl.searchParams.get("path");

  if (!project || !imagePath) {
    return NextResponse.json({ error: "Missing project or path" }, { status: 400 });
  }

  // Forward to daemon over Unix socket using node:http
  // (can't use daemonFetch because it parses response as text/JSON)
  // Use raw http.request with socketPath, stream the binary response back.
}
```

This route needs a binary-aware daemon fetch. The existing `daemonFetch` in `lib/daemon-client.ts` converts responses to `Response` with string bodies (line 93: `Buffer.concat(chunks).toString("utf-8")`). For binary data, create a variant or use the raw buffer directly.

Two options:
1. Add a `daemonFetchRaw` function to `lib/daemon-client.ts` that returns the raw `Buffer` plus status/headers.
2. Inline the `http.request` call in the API route.

Option 1 is cleaner and testable. Add to `lib/daemon-client.ts`:

```ts
export async function daemonFetchBinary(
  requestPath: string,
  socketPathOverride?: string,
): Promise<{ status: number; headers: Record<string, string>; body: Buffer } | DaemonError> {
  // Same http.request pattern as daemonFetch, but collect chunks as Buffer
  // and don't toString() them.
}
```

The proxy route uses this to construct the browser response:

```ts
const result = await daemonFetchBinary(
  `/workspace/artifact/image/read?projectName=${encodeURIComponent(project)}&path=${encodeURIComponent(imagePath)}`,
);
if (isDaemonError(result)) {
  return NextResponse.json({ error: "Daemon is not running" }, { status: 503 });
}
if (result.status !== 200) {
  return new NextResponse(null, { status: result.status });
}
return new NextResponse(result.body, {
  status: 200,
  headers: {
    "Content-Type": result.headers["content-type"] ?? "application/octet-stream",
    "Cache-Control": result.headers["cache-control"] ?? "max-age=300",
  },
});
```

**Covers:** REQ-IMG-9

### Phase 3: Standalone Image View

#### Step 7: Add `/workspace/artifact/image/meta` daemon endpoint

**Modified file:** `daemon/routes/artifacts.ts`

Lightweight endpoint that returns image metadata without reading the full file. This must be built before Step 8 (the page component that calls it).

```
GET /workspace/artifact/image/meta?projectName=X&path=Y
```

Returns:
```json
{
  "relativePath": "generated/hero.png",
  "meta": { "title": "Hero", "date": "2026-03-18", "status": "complete", "tags": [] },
  "lastModified": "2026-03-18T12:00:00.000Z",
  "fileSize": 245760,
  "mimeType": "image/png"
}
```

Implementation: resolve lore path (with activity worktree logic, same as document read at lines 107-117), validate extension is in `IMAGE_MIME_TYPES` (return 415 if not), `fs.stat()` for size and mtime, derive title from filename same as scanner. This endpoint is not in the spec; it's a technical sub-requirement of REQ-IMG-10 to avoid loading image bytes just to render the page shell.

Add the `OperationDefinition` entry and add `"workspace.artifact.image"` to the descriptions record.

#### Step 8: Branch the catch-all route for image artifacts

**Modified file:** `web/app/projects/[name]/artifacts/[...path]/page.tsx`

The page currently assumes all artifacts are markdown documents. Add a check after the project validation:

```ts
const ext = relativePath.split(".").pop()?.toLowerCase() ?? "";
const imageExtensions = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg"]);
const isImage = imageExtensions.has(ext);
```

If `isImage`:
- Don't fetch from `/workspace/artifact/document/read` (it would fail on binary).
- Fetch from `/workspace/artifact/image/meta` (Step 7) to get synthetic metadata, fileSize, and mimeType.
- Render `ImageArtifactView` instead of `ArtifactContent` + `MetadataSidebar`.

The branched rendering:

```tsx
if (isImage) {
  const metaResult = await fetchDaemon<ImageMetaResponse>(
    `/workspace/artifact/image/meta?projectName=${encoded}&path=${relativePath}`,
  );
  if (!metaResult.ok) {
    if (metaResult.error.includes("not found")) notFound();
    return <DaemonError message={metaResult.error} />;
  }
  const { meta, fileSize, mimeType, lastModified } = metaResult.data;
  const displayTitle = meta.title || relativePath;

  return (
    <div className={styles.artifactView}>
      <div className={styles.main}>
        <ArtifactProvenance
          projectName={projectName}
          artifactTitle={displayTitle}
          artifactPath={relativePath}
        />
        <ImageArtifactView
          projectName={projectName}
          artifactPath={relativePath}
        />
      </div>
      <div className={styles.sidebar}>
        <ImageMetadataSidebar
          filename={relativePath.split("/").pop() ?? ""}
          mimeType={mimeType}
          fileSize={fileSize}
          lastModified={lastModified}
          projectName={projectName}
        />
      </div>
    </div>
  );
}
```

**Covers:** REQ-IMG-10 (standalone view), REQ-IMG-11 (provenance breadcrumb), REQ-IMG-13 (no edit button)

#### Step 9: Create `ImageArtifactView` component

**New file:** `web/components/artifact/ImageArtifactView.tsx`
**New file:** `web/components/artifact/ImageArtifactView.module.css`

Server component (no interactivity needed). Renders the image at natural size, constrained to viewport width:

```tsx
import styles from "./ImageArtifactView.module.css";

interface ImageArtifactViewProps {
  projectName: string;
  artifactPath: string;
}

export default function ImageArtifactView({
  projectName,
  artifactPath,
}: ImageArtifactViewProps) {
  const src = `/api/artifacts/image?project=${encodeURIComponent(projectName)}&path=${encodeURIComponent(artifactPath)}`;

  return (
    <div className={styles.viewer}>
      <div className={styles.imageContainer}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={artifactPath.split("/").pop() ?? "Image artifact"}
          className={styles.image}
        />
      </div>
    </div>
  );
}
```

CSS: Copy the ornate-border pattern from `ArtifactContent.module.css` lines 100-109 (the `.viewer::before` with `border-image-source: url("/images/ui/border-ornate.webp")`). The `.image` gets `max-width: 100%; height: auto; display: block; margin: 0 auto;`. Use `object-fit: contain` for aspect ratio preservation.

SVG files must render via `<img>`, not embedded inline. The `<img>` tag treats SVG as an image and does not execute embedded scripts, which satisfies the XSS constraint in the spec.

Use `<img>` not `next/image` because the source is a dynamic API route, not a statically optimizable asset.

**Covers:** REQ-IMG-10

#### Step 10: Create `ImageMetadataSidebar` component

**New file:** `web/components/artifact/ImageMetadataSidebar.tsx`
**New file:** `web/components/artifact/ImageMetadataSidebar.module.css`

Server component. Shows:
- Filename
- Format (from MIME type, e.g., "PNG", "JPEG")
- File size (formatted: bytes, KB, or MB)
- Last modified date
- Dimensions: deferred. REQ-IMG-12 says "dimensions (if available from the response)." Getting image dimensions server-side requires reading and parsing the image header (e.g., via a library like `image-size`). This adds a dependency for marginal value. The "if available" qualifier allows omitting this. If dimensions are desired later, the `/workspace/artifact/image/meta` endpoint can be extended to read the first few bytes of the file and extract width/height from the header.

Reuses the `Panel` component and follows the same section structure as `MetadataSidebar.tsx` (`.section` with `.sectionTitle` + `.value`). Can share most CSS patterns from `MetadataSidebar.module.css`.

Does NOT show: Status, Tags, Modules, Related, Actions (no "Edit" button per REQ-IMG-13, no "Create Commission from Artifact" since images aren't linkable artifact specs).

Still shows: Project link (same as MetadataSidebar).

**Covers:** REQ-IMG-12 (partially, dimensions deferred), REQ-IMG-13

### Phase 4: Inline Images in Markdown

#### Step 11: Add custom image renderer to ArtifactContent

**Modified file:** `web/components/artifact/ArtifactContent.tsx`

Add a `components` prop to `ReactMarkdown` that overrides `img`:

```tsx
const components = {
  img: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => {
    const resolvedSrc = resolveImageSrc(src, projectName, artifactPath);
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        {...props}
        src={resolvedSrc}
        alt={alt ?? ""}
        loading="lazy"
        className={styles.inlineImage}
      />
    );
  },
};

// In the render:
<ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
  {body}
</ReactMarkdown>
```

The `resolveImageSrc` function (defined in the same file or extracted to a utility):

```ts
function resolveImageSrc(
  src: string | undefined,
  projectName: string,
  artifactPath: string,
): string {
  if (!src) return "";

  // External URLs pass through (REQ-IMG-16)
  if (src.startsWith("http://") || src.startsWith("https://")) {
    return src;
  }

  const encodedProject = encodeURIComponent(projectName);

  // Absolute paths from .lore/ root (REQ-IMG-15)
  if (src.startsWith("/")) {
    const cleanPath = src.slice(1); // remove leading /
    return `/api/artifacts/image?project=${encodedProject}&path=${encodeURIComponent(cleanPath)}`;
  }

  // Relative paths from the artifact's directory (REQ-IMG-14)
  const artifactDir = artifactPath.split("/").slice(0, -1).join("/");
  const resolved = artifactDir ? `${artifactDir}/${src}` : src;
  return `/api/artifacts/image?project=${encodedProject}&path=${encodeURIComponent(resolved)}`;
}
```

Add `.inlineImage` to `ArtifactContent.module.css`:

```css
.markdownContent .inlineImage {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  margin: 0.5em 0;
}
```

This replaces the existing `.markdownContent img` rule at line 265-269 which already does `max-width: 100%`. The class-based selector is more specific and clearer in intent.

**Testability:** Extract `resolveImageSrc` to a separate file (e.g., `web/lib/resolve-image-src.ts`) so it can be unit tested independently. The test file (`tests/web/lib/resolve-image-src.test.ts`) covers: relative paths, absolute paths, external URLs, empty src, paths with special characters, deeply nested artifact paths.

**Covers:** REQ-IMG-14 (relative paths), REQ-IMG-15 (absolute paths), REQ-IMG-16 (external URLs), REQ-IMG-17 (components.img override), REQ-IMG-22 (loading="lazy")

### Phase 5: Tree View and Recent Scrolls Icons

#### Step 12: Add an image artifact icon

**New file:** `web/public/images/ui/image-icon.webp` (or `.png`)

The tree view and Recent Scrolls both use `scroll-icon.webp` for markdown artifacts. Image artifacts need a distinct icon (REQ-IMG-2). Options:

1. Commission a generated icon matching the fantasy aesthetic.
2. Use a simple camera/image glyph as a placeholder.

For now, create a simple placeholder. The icon should be small (24x24 or similar), matching the scroll icon's dimensions.

If generating an icon isn't feasible during implementation, use a text-based indicator in the tree view (e.g., a Unicode character like "\uD83D\uDDBC" or a CSS-only approach with a frame border). The generated icon can be swapped in later.

**Decision:** Use a simple CSS-styled span as the icon indicator, avoiding the need for a new image asset. Add a `.imageIcon` class to the relevant CSS modules.

#### Step 13: Update `ArtifactList` tree view for image artifacts

**Modified file:** `web/components/project/ArtifactList.tsx`

In `TreeNodeRow`, when rendering a leaf node, check `node.artifact?.artifactType`:

```tsx
if (node.artifact) {
  const isImage = node.artifact.artifactType === "image";
  const gemStatus = statusToGem(node.artifact.meta.status);
  return (
    <li ...>
      <Link ...>
        {isImage ? (
          <span className={styles.imageIcon} aria-hidden="true">&#x1F5BC;</span>
        ) : (
          <img src="/images/ui/scroll-icon.webp" ... />
        )}
        ...
      </Link>
    </li>
  );
}
```

Add `.imageIcon` to `ArtifactList.module.css` with sizing to match `.scrollIcon`.

**Covers:** REQ-IMG-2, REQ-IMG-21 (no image bytes loaded in list)

#### Step 14: Update `RecentArtifacts` for image artifacts

**Modified file:** `web/components/dashboard/RecentArtifacts.tsx`

Same icon switch as Step 13. Check `artifact.artifactType === "image"` and render the image icon instead of scroll icon.

**Covers:** REQ-IMG-3

#### Step 15: Update `displayTitle` for image artifacts

**Modified file:** `lib/artifact-grouping.ts`

The current `displayTitle` function strips `.md` from filenames. For image artifacts, the scanner already provides a properly formatted title in `meta.title` (Step 3), so the existing logic (`if (artifact.meta.title) return artifact.meta.title`) handles it. No change needed.

However, `RecentArtifacts.tsx:19-26` has its own `displayTitle` function that only strips `.md`. Update it to also strip image extensions, or better, consolidate to use the one from `lib/artifact-grouping.ts`.

**Modified file:** `web/components/dashboard/RecentArtifacts.tsx`

Replace the local `displayTitle` with an import from `lib/artifact-grouping.ts`. The existing function there already handles the title-from-meta case. Update the fallback to strip image extensions too:

```ts
export function displayTitle(artifact: Artifact): string {
  if (artifact.meta.title) {
    return artifact.meta.title;
  }
  const segments = artifact.relativePath.split("/");
  const filename = segments[segments.length - 1];
  // Strip known extensions
  return filename.replace(/\.(md|png|jpe?g|webp|gif|svg)$/i, "");
}
```

### Phase 6: Binary Daemon Client

#### Step 16: Add `daemonFetchBinary` to daemon client

**Modified file:** `lib/daemon-client.ts`

Add a function that returns raw binary response data instead of converting to string:

```ts
export async function daemonFetchBinary(
  requestPath: string,
  socketPathOverride?: string,
): Promise<
  | { status: number; headers: Record<string, string>; body: Buffer }
  | DaemonError
> {
  const socketPath = socketPathOverride ?? getSocketPath();

  return new Promise((resolve) => {
    const req = http.request(
      { socketPath, path: requestPath, method: "GET" },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers)) {
            if (typeof value === "string") headers[key] = value;
          }
          resolve({ status: res.statusCode ?? 500, headers, body });
        });
        res.on("error", (err) => resolve(classifyError(err)));
      },
    );
    req.on("error", (err) => resolve(classifyError(err)));
    req.end();
  });
}
```

This is used by the API proxy route (Step 6) to forward binary image data.

## Build Order

The phases have dependencies. Here's the correct sequence:

1. **Phase 1 (Steps 1-4):** Type foundation and scanner. Everything depends on this.
2. **Phase 6 (Step 16):** Binary daemon client. Phase 2's proxy route needs this. Numbered as Phase 6 because it's a supporting utility, but it must be built before Phase 2.
3. **Phase 2 (Steps 5-6):** Image serving. Phase 3 and Phase 4 need serveable images.
4. **Phase 3 (Steps 7-10):** Standalone view. Step 7 (daemon endpoint) must precede Step 8 (page component that calls it). Independent of Phase 4.
5. **Phase 4 (Step 11):** Inline markdown images. Independent of Phase 3.
6. **Phase 5 (Steps 12-15):** Tree view icons. Can run in parallel with Phases 3-4.

Phases 3, 4, and 5 can be built concurrently once Phase 2 is complete.

## Files Summary

### New Files

| File | Purpose |
|------|---------|
| `web/app/api/artifacts/image/route.ts` | Next.js API proxy for image serving |
| `web/components/artifact/ImageArtifactView.tsx` | Standalone image display component |
| `web/components/artifact/ImageArtifactView.module.css` | Styling for standalone image view |
| `web/components/artifact/ImageMetadataSidebar.tsx` | Metadata panel for image artifacts |
| `web/components/artifact/ImageMetadataSidebar.module.css` | Styling for image metadata panel |

### Modified Files

| File | Changes |
|------|---------|
| `lib/types.ts` | Add `artifactType` field to `Artifact` |
| `lib/artifacts.ts` | Widen scanner, add image constants, export `IMAGE_MIME_TYPES` |
| `lib/artifact-grouping.ts` | Update `displayTitle` fallback to strip image extensions |
| `lib/daemon-client.ts` | Add `daemonFetchBinary` for binary responses |
| `daemon/routes/artifacts.ts` | Add image read + image meta endpoints, update serializer |
| `web/app/projects/[name]/artifacts/[...path]/page.tsx` | Branch rendering for image artifacts |
| `web/components/artifact/ArtifactContent.tsx` | Add `components.img` override for inline images |
| `web/components/artifact/ArtifactContent.module.css` | Add `.inlineImage` class |
| `web/components/project/ArtifactList.tsx` | Switch icon for image artifacts |
| `web/components/project/ArtifactList.module.css` | Add `.imageIcon` class |
| `web/components/dashboard/RecentArtifacts.tsx` | Switch icon, consolidate `displayTitle` |

## Testing Strategy

### Unit Tests (Automated)

| Test Area | File | What to Test |
|-----------|------|-------------|
| Scanner | `tests/lib/artifacts.test.ts` | Mixed .md and image files discovered; unsupported extensions skipped; empty directory; nested dirs; synthetic metadata (title derivation, status "complete", date from mtime) |
| Scanner | `tests/lib/artifacts.test.ts` | `artifactType` is "document" for .md, "image" for images |
| Image MIME mapping | `tests/lib/artifacts.test.ts` | All 6 extensions map correctly; unknown extension returns undefined |
| Path resolution | `tests/web/lib/resolve-image-src.test.ts` | `resolveImageSrc`: relative paths, absolute paths, external URLs, empty src, edge cases (no directory, deeply nested, special characters) |
| Path validation | `tests/daemon/routes/artifacts.test.ts` | Image endpoint rejects `../` traversal; returns 415 for unsupported extension; returns 404 for missing file |
| Daemon image route | `tests/daemon/routes/artifacts.test.ts` | Correct Content-Type for each extension; Cache-Control header present; binary response body matches file |
| Daemon image meta | `tests/daemon/routes/artifacts.test.ts` | Returns synthetic metadata, fileSize, mimeType |
| Activity worktree | `tests/daemon/routes/artifacts.test.ts` | Image in meetings/ path resolves to activity worktree |
| Serialization | `tests/daemon/routes/artifacts.test.ts` | `serializeArtifact` includes `artifactType` |
| API proxy | `tests/web/api/artifacts-image.test.ts` | Forwards binary response; passes through Content-Type; handles daemon offline |
| Binary client | `tests/lib/daemon-client.test.ts` | `daemonFetchBinary` returns Buffer, not string |

### Visual Verification (Manual)

These need a running daemon with test images in `.lore/`:

1. **Tree view:** Image artifacts appear with distinct icon, not scroll icon. Sorted alongside markdown artifacts by status and title.
2. **Recent Scrolls:** Image artifacts appear with distinct icon when recently modified.
3. **Standalone view:** Clicking image in tree opens full-size view with ornate border, metadata sidebar, provenance breadcrumb.
4. **Inline images:** Markdown artifact with `![alt](relative/path.png)` renders the image inline. Absolute path `![alt](/generated/image.png)` also works. External URL unchanged.
5. **Fantasy aesthetic:** Standalone view matches the parchment/brass/ornate-border design language.
6. **Generated directory:** Images in `.lore/generated/` appear under "Generated" in the tree.

### Edge Cases to Test

- SVG served as image (Content-Type `image/svg+xml`), not embedded HTML
- Image with spaces in filename
- Image in commissions/ directory of active commission (activity worktree resolution)
- Markdown referencing a non-existent image (should show broken image, not crash)
- Very long filename (title truncation in tree view)

## Requirement Traceability

| REQ | Step | Description |
|-----|------|-------------|
| REQ-IMG-1 | 2, 3 | Scanner discovers image files |
| REQ-IMG-2 | 13 | Distinct icon in tree view |
| REQ-IMG-3 | 14 | Image artifacts in Recent Scrolls |
| REQ-IMG-4 | 3 | Synthetic metadata from filename/mtime |
| REQ-IMG-5 | 3 | Sorted alongside markdown artifacts |
| REQ-IMG-6 | 5 | Daemon image serving endpoint |
| REQ-IMG-7 | 5 | Path traversal validation |
| REQ-IMG-8 | 5, 7 | Activity worktree resolution (image read + meta) |
| REQ-IMG-9 | 6, 16 | Next.js API proxy + binary client |
| REQ-IMG-10 | 8, 9 | Standalone image view (page branch + component) |
| REQ-IMG-11 | 8 | Provenance breadcrumb |
| REQ-IMG-12 | 10 | Metadata sidebar (dimensions deferred) |
| REQ-IMG-13 | 8, 10 | No edit button |
| REQ-IMG-14 | 11 | Relative path resolution |
| REQ-IMG-15 | 11 | Absolute path resolution |
| REQ-IMG-16 | 11 | External URL passthrough |
| REQ-IMG-17 | 11 | ReactMarkdown components.img override |
| REQ-IMG-18 | 3 | Generated directory in tree |
| REQ-IMG-19 | 3 | No special treatment for generated |
| REQ-IMG-20 | 5 | Cache-Control headers |
| REQ-IMG-21 | 13 | No image bytes in list |
| REQ-IMG-22 | 11 | loading="lazy" on inline images |
| REQ-IMG-23 | 1, 4 | artifactType field in list response |
| REQ-IMG-24 | 2, 5 | Content-Type from extension |

## Delegation Guide

### Review Points

| After Step | Reviewer Focus | Why |
|------------|---------------|-----|
| Steps 1-4 (Phase 1) | Type compatibility, scanner correctness | The Artifact type change affects every consumer. Verify no existing code breaks when `artifactType` is present. Scanner synthetic metadata must match spec exactly. |
| Steps 5-6, 16 (Phases 2+6) | Security, binary handling | Path traversal validation is security-critical. Binary proxy must not corrupt image data or leak internal paths. Cache headers must be correct. |
| Steps 7-10 (Phase 3) | UI review, design consistency | Standalone view must match fantasy aesthetic. Metadata sidebar should feel consistent with MetadataSidebar. SVG must render via `<img>`, not inline embedding. |
| Step 11 (Phase 4) | Path resolution edge cases | Inline image resolution has the most edge cases (relative, absolute, external, missing). Fresh-eyes review catches assumptions the implementer bakes in. |
| Steps 12-15 (Phase 5) | Visual consistency | Icon treatment should feel intentional, not bolted on. Tree view spacing with mixed icons needs visual check. |

### Implementation Order for Delegation

If splitting across multiple commissions:

1. **Foundation commission:** Steps 1-6, 16. Delivers: scanner, types, daemon endpoints, API proxy, binary client. All unit-testable, no visual component.
2. **UI commission:** Steps 7-15. Delivers: standalone view, inline images, tree icons. Depends on commission 1 being merged.

If a single commission, build in phase order (1, 6, 2, 3, 4, 5) with review after Phase 1 and after Phase 2.

## Codebase Patterns to Follow

- **CSS Modules, not Tailwind.** All new components get `.module.css` files. Use design tokens from `globals.css`.
- **Server components by default.** Only add `"use client"` when the component needs hooks or event handlers. `ImageArtifactView` and `ImageMetadataSidebar` are server components. The inline image renderer lives inside `ArtifactContent` which is already a client component.
- **`fetchDaemon` for JSON, `daemonFetchBinary` for binary.** The server component page uses `fetchDaemon` from `web/lib/daemon-api.ts`. The API proxy route uses the lower-level client from `lib/daemon-client.ts`.
- **Vendor prefix order.** In CSS, `-webkit-backdrop-filter` before `backdrop-filter` (Turbopack drops the standard if it comes first).
- **DI for testability.** Daemon routes use the factory pattern (`createArtifactRoutes(deps)`). New endpoints go in the same factory. Tests use Hono's `app.request()` with injected deps.
- **`eslint-disable-next-line @next/next/no-img-element`** for decorative/dynamic images. `next/image` optimization doesn't apply to Unix socket proxied images.
- **Async params pattern.** `await params` in page components (Next.js 15).
- **Path encoding.** `encodeURIComponent` for query params, `.split("/").map(encodeURIComponent).join("/")` for URL path segments.
