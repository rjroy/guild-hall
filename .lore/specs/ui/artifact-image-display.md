---
title: Image display in artifact views
date: 2026-03-18
status: draft
tags: [ui, artifacts, images, generated-content]
modules: [artifact-list, artifact-content, daemon-routes]
related:
  - .lore/specs/ui/artifact-tree-view.md
  - .lore/specs/ui/artifact-sorting.md
  - .lore/specs/ui/guild-hall-views.md
req-prefix: IMG
---

# Spec: Image Display in Artifact Views

## Overview

The web UI renders markdown artifacts from `.lore/` but has no support for image files. Images are invisible to the artifact pipeline at every layer: discovery scans only `.md` files (`lib/artifacts.ts:270`, `collectMarkdownFiles`), the daemon routes serve only parsed markdown documents (`daemon/routes/artifacts.ts`), and the detail view (`ArtifactContent.tsx`) renders markdown through ReactMarkdown with no custom image resolver.

Workers already generate images. The Replicate native toolbox writes to `.lore/generated/`, and workers may place diagrams, screenshots, or reference images anywhere in `.lore/`. These files exist on disk but are unreachable from the UI.

This spec defines how images become first-class artifacts: discoverable in lists, viewable standalone, and renderable inline within markdown documents.

## Current State

### Discovery

`collectMarkdownFiles()` at `lib/artifacts.ts:261-276` recursively walks `.lore/` and filters to `.md` extension. Image files are skipped entirely. The daemon list endpoint (`/workspace/artifact/document/list`) returns only what `scanArtifacts()` produces, so images never appear in any artifact list or tree view.

### Routing

The catch-all route at `web/app/projects/[name]/artifacts/[...path]/page.tsx` calls the daemon's `/workspace/artifact/document/read` endpoint. That endpoint calls `readArtifact()` in `lib/artifacts.ts:144-173`, which reads the file as UTF-8 text and parses frontmatter with gray-matter. Binary image files would produce garbled output or throw.

### Rendering

`ArtifactContent.tsx` renders the body through `ReactMarkdown` with `remarkGfm`. CSS at `ArtifactContent.module.css:265-269` already styles `.markdownContent img` with `max-width: 100%` and `border-radius: 4px`, but these rules have no effect because there's no mechanism to resolve image paths to serveable URLs. A markdown image like `![diagram](generated/flow.png)` would produce a broken `<img>` tag pointing at a relative URL that Next.js can't serve.

### Image Serving

No image serving endpoint exists. The daemon serves JSON over the Unix socket. Next.js serves from `web/public/` for static assets. `.lore/` files live in integration worktrees at `~/.guild-hall/projects/<name>/.lore/`, which is outside the Next.js public directory.

## Entry Points

- Project page Artifacts tab (artifact tree view at `/projects/[name]?tab=artifacts`)
- Direct artifact navigation (catch-all route at `/projects/[name]/artifacts/[...path]`)
- Markdown body rendering in any artifact detail view (inline images)
- Dashboard "Recent Scrolls" widget

## Requirements

### Image Discovery

- REQ-IMG-1: The artifact scanner discovers image files alongside markdown files. Supported extensions: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.svg`.
- REQ-IMG-2: Image artifacts appear in the artifact tree view under their directory, just as markdown artifacts do. They use a distinct icon (not the scroll icon used for markdown).
- REQ-IMG-3: Image artifacts appear in "Recent Scrolls" when they are among the most recently modified files.
- REQ-IMG-4: Image artifacts have synthetic metadata: title derived from filename (without extension, hyphens/underscores replaced with spaces, title-cased), empty tags, status "complete", date from filesystem mtime. No frontmatter parsing is attempted.
- REQ-IMG-5: Image artifacts sort alongside markdown artifacts using the same sort logic (`compareArtifactsByStatusAndTitle` for tree view, `compareArtifactsByRecency` for Recent Scrolls).

### Image Serving

- REQ-IMG-6: A daemon endpoint serves raw image bytes for a given project and relative path within `.lore/`. Route: `GET /workspace/artifact/image/read?projectName=X&path=Y`. Response is the binary file with the correct `Content-Type` header (`image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/svg+xml`).
- REQ-IMG-7: The image serving endpoint validates the path stays within `.lore/` (same traversal check as document reads).
- REQ-IMG-8: The image serving endpoint resolves activity worktrees for images under `meetings/` and `commissions/` paths, matching the document read behavior.
- REQ-IMG-9: A Next.js API route proxies image requests from the browser to the daemon endpoint. Route: `GET /api/artifacts/image?project=X&path=Y`. This avoids exposing the Unix socket to the browser and handles authentication if added later.

### Standalone Image View

- REQ-IMG-10: When a user navigates to an image artifact via the catch-all route, the page renders the image prominently instead of a markdown viewer. The image is displayed at its natural size, constrained to the viewport width.
- REQ-IMG-11: The standalone view includes the same provenance breadcrumb (`ArtifactProvenance`) as markdown artifacts.
- REQ-IMG-12: The standalone view shows a metadata sidebar with: filename, dimensions (if available from the response), file size, format, and last modified date.
- REQ-IMG-13: The standalone view does not show the "Edit" button (images are not editable through the web UI).

### Inline Images in Markdown

- REQ-IMG-14: Markdown image references (`![alt](path)`) in artifact content resolve to serveable URLs. Paths are interpreted relative to the artifact's own directory within `.lore/`. An image `![flow](generated/flow.png)` in `specs/design.md` resolves to `.lore/specs/generated/flow.png`.
- REQ-IMG-15: Absolute paths within `.lore/` (starting with `/`) resolve from the `.lore/` root. `![flow](/generated/flow.png)` always resolves to `.lore/generated/flow.png` regardless of the referencing artifact's location.
- REQ-IMG-16: External URLs (`http://`, `https://`) pass through unchanged. Only local paths are rewritten.
- REQ-IMG-17: The custom image renderer is implemented as a ReactMarkdown `components.img` override in `ArtifactContent.tsx`. It rewrites `src` to point at the `/api/artifacts/image` proxy route.

### Generated Content

- REQ-IMG-18: Images in `.lore/generated/` appear in the artifact tree under a "Generated" directory node, consistent with how other subdirectories appear.
- REQ-IMG-19: No special treatment is required for generated images beyond discovery and display. They follow the same pipeline as images in any other `.lore/` subdirectory.

### Performance

- REQ-IMG-20: The image serving endpoint sets `Cache-Control` headers for browser caching. Use `max-age=300, stale-while-revalidate=60` (5-minute cache with background revalidation). Images in `.lore/` change infrequently once generated.
- REQ-IMG-21: The artifact tree view does not load image bytes for listing. Only the image icon, filename-derived title, and metadata are shown. Image bytes are fetched only when navigating to the standalone view or when inline markdown references render.
- REQ-IMG-22: Inline images in markdown use the browser's native lazy loading (`loading="lazy"` attribute) to defer offscreen images.

### File Type Handling

- REQ-IMG-23: The daemon distinguishes image artifacts from document artifacts in the list response. Each artifact in the list includes a `type` field: `"document"` for markdown, `"image"` for image files.
- REQ-IMG-24: The Content-Type for served images is derived from the file extension. Mapping: `.png` to `image/png`, `.jpg`/`.jpeg` to `image/jpeg`, `.webp` to `image/webp`, `.gif` to `image/gif`, `.svg` to `image/svg+xml`. Unknown extensions return 415 Unsupported Media Type.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Standalone image view | User clicks an image in the artifact tree | `/projects/[name]/artifacts/[...path]` (catch-all, image branch) |
| Full-size image | User clicks an inline image in markdown | Opens standalone view or browser default image behavior |
| Back to tree | User clicks breadcrumb from standalone view | `/projects/[name]?tab=artifacts` |

## Constraints

- No thumbnail generation server-side. The browser handles scaling through CSS (`max-width`, `object-fit`). Server-side thumbnail generation adds build complexity (sharp/canvas dependencies) for a marginal benefit given the expected image volume (tens, not thousands).
- No image upload through the web UI. Images are created by workers via toolboxes or placed manually in `.lore/`. The web UI is read-only for images.
- SVG files are served as images, not parsed or embedded inline. This avoids XSS vectors from SVG script elements.
- The `Artifact` type in `lib/types.ts` is reused for image artifacts. The `content` field is empty for images (the body is binary, not text). The `rawContent` field is omitted. A new optional `artifactType` field distinguishes document from image.

## Assumptions

- Image files in `.lore/` are reasonably sized (under 10MB each). The spec does not address streaming or chunked delivery for very large files.
- Workers that reference images in markdown use paths relative to their artifact's directory or absolute paths from `.lore/` root. No support for paths outside `.lore/`.
- The number of images per project is in the low hundreds at most. The scanner walks the full `.lore/` tree on each list request, same as it does for markdown files today.

## Non-Goals

- Image editing, cropping, or annotation in the web UI.
- Lightbox or gallery view for image collections. The tree view and standalone view are sufficient for the current use case.
- Video file support. Video may be generated by future toolboxes but is out of scope here.
- OCR or image content search.

## Success Criteria

- [ ] Images in `.lore/` appear in the artifact tree with a distinct icon and filename-derived title
- [ ] Clicking an image in the tree opens a standalone view with the image rendered at natural size
- [ ] Metadata sidebar shows filename, format, file size, and last modified date for image artifacts
- [ ] Markdown `![alt](path)` references resolve and render inline with correct image data
- [ ] Relative paths resolve from the referencing artifact's directory
- [ ] Absolute paths (starting with `/`) resolve from `.lore/` root
- [ ] External URLs pass through unchanged
- [ ] Images in `.lore/generated/` appear in the tree under their directory
- [ ] The image serving endpoint rejects path traversal attempts
- [ ] SVG files render as images, not embedded HTML
- [ ] Fantasy design system (brass, parchment tones) is preserved in the standalone view

## AI Validation

**Defaults apply:**
- Unit tests with mocked time/network/filesystem/LLM calls
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Image scanner tested with: no images, mixed `.md` and image files, nested directories, unsupported extensions (should be skipped)
- Path resolution tested with: relative paths, absolute paths, external URLs, path traversal attempts, paths with special characters
- Content-Type mapping tested for all six supported extensions plus an unknown extension
- Inline image rendering verified visually in at least one markdown artifact containing both relative and absolute image references
- Activity worktree resolution tested for images referenced in meeting and commission artifacts
