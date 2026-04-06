---
title: HTML mockup preview
date: 2026-04-06
status: draft
tags: [ui, artifacts, mockups, preview]
modules: [artifact-list, artifact-content, daemon-routes]
related:
  - .lore/specs/ui/artifact-image-display.md
  - .lore/specs/infrastructure/daemon-application-boundary.md
  - .lore/specs/ui/guild-hall-views.md
req-prefix: MKP
---

# Spec: HTML Mockup Preview

## Overview

Workers (particularly Sienna, the Guild Illuminator) generate self-contained HTML pages as UX mockups. These files live in `.lore/` alongside other artifacts but are invisible to the web UI. The artifact scanner at `lib/artifacts.ts:341` (`collectArtifactFiles`) only collects `.md` and image files. HTML files are skipped.

This spec defines how HTML mockups become previewable from the web UI: discoverable in artifact lists, and openable in a new browser tab for full-viewport rendering.

Mockups open in a new tab rather than rendering inside the artifact detail view. Most mockups assume a full-page viewport. Constraining them in an iframe creates layout and sizing problems, and sandboxing adds complexity for marginal benefit. A new tab gives the mockup its intended viewport while keeping the integration simple.

## Current State

### Discovery

`collectArtifactFiles()` at `lib/artifacts.ts:330-348` walks `.lore/` recursively and collects files matching `.md` or image extensions (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.svg`). HTML files are not in either set, so they never appear in artifact lists, tree views, or recent scrolls.

### Routing

The catch-all route at `web/app/projects/[name]/artifacts/[...path]/page.tsx` branches on file extension at line 53-54. It checks `IMAGE_EXTENSIONS` (a local `Set` of image extensions). Files not matching `.md` or image extensions have no rendering path. An HTML file reaching this route would fall through to the document branch and attempt to parse it as markdown with gray-matter frontmatter, producing garbled output.

### Serving

The daemon serves images via `GET /workspace/artifact/image/read` (`daemon/routes/artifacts.ts:194-244`) with validated MIME types from `IMAGE_MIME_TYPES` at `lib/artifacts.ts:14-21`. No equivalent route exists for HTML content. The Next.js proxy at `web/app/api/artifacts/image/route.ts` forwards binary image responses from the daemon to the browser. No HTML proxy exists.

## Entry Points

- Project page Artifacts tab (artifact tree view at `/projects/[name]?tab=artifacts`)
- Direct artifact navigation (catch-all route at `/projects/[name]/artifacts/[...path]`)
- Dashboard "Recent Scrolls" widget

## Requirements

### Mockup Discovery

- REQ-MKP-1: The artifact scanner discovers HTML files alongside markdown and image files. Supported extension: `.html`.
- REQ-MKP-2: HTML artifacts appear in the artifact tree view under their directory, using a distinct icon (not the scroll icon used for markdown or the image icon).
- REQ-MKP-3: HTML artifacts appear in "Recent Scrolls" when they are among the most recently modified files.
- REQ-MKP-4: HTML artifacts have synthetic metadata: title derived from filename (without extension, hyphens/underscores replaced with spaces, title-cased), empty tags, status "complete", date from filesystem mtime. No frontmatter parsing is attempted. This matches the image artifact pattern at `lib/artifacts.ts:135-158`.
- REQ-MKP-5: HTML artifacts carry `artifactType: "mockup"` on the `Artifact` type. This extends the existing `artifactType` union at `lib/types.ts:77` from `"document" | "image"` to `"document" | "image" | "mockup"`.

### Mockup Serving

- REQ-MKP-6: A daemon endpoint serves raw HTML content for a given project and relative path within `.lore/`. Route: `GET /workspace/artifact/mockup/read?projectName=X&path=Y`. Response is the file content with `Content-Type: text/html; charset=utf-8`.
- REQ-MKP-7: The mockup serving endpoint validates the file extension is `.html`. Other extensions return 415 Unsupported Media Type.
- REQ-MKP-8: The mockup serving endpoint validates the path stays within `.lore/` using the existing `validatePath()` function at `lib/artifacts.ts:40-47`. Path traversal attempts return 400.
- REQ-MKP-9: The mockup serving endpoint resolves paths from the integration worktree, matching the image serving pattern at `daemon/routes/artifacts.ts:224`. Activity worktree resolution is not needed because HTML mockups are general artifacts, not meeting/commission-scoped outputs.

### Security

- REQ-MKP-10: The daemon MUST set the following response headers when serving HTML mockups:
  - `Content-Security-Policy: default-src 'self' 'unsafe-inline' data:; script-src 'unsafe-inline'; style-src 'unsafe-inline' data:; img-src 'self' data: blob:; connect-src 'none'; frame-ancestors 'none'`
  - `X-Content-Type-Options: nosniff`
  - `Content-Disposition: inline`

  Rationale: Mockups are self-contained HTML pages that may include inline scripts (for interactivity demos) and inline styles. The CSP allows these to function while blocking network requests (`connect-src 'none'`) and preventing the page from being framed (`frame-ancestors 'none'`). The `'self'` origin allows the page to load its own resources but not reach external hosts.

- REQ-MKP-11: The mockup serving endpoint MUST NOT follow symlinks that resolve outside `.lore/`. The existing `validatePath()` resolves symlinks via `path.resolve()` and checks the resolved path stays within bounds. This is sufficient.

- REQ-MKP-12: The mockup opens in a new browser tab, not embedded in the Guild Hall UI. This provides natural origin isolation: the mockup page runs in the same origin but cannot access Guild Hall's application state (localStorage, cookies, DOM) because it is a separate navigation context with no references to the opener window.

### New-Tab Preview

- REQ-MKP-13: A Next.js API route proxies mockup requests from the browser to the daemon. Route: `GET /api/artifacts/mockup?project=X&path=Y`. This follows the same proxy pattern as the image route at `web/app/api/artifacts/image/route.ts`. The proxy forwards the daemon's response body and headers (Content-Type, CSP, Cache-Control) to the browser.

- REQ-MKP-14: When a user navigates to an HTML artifact via the catch-all route, the page renders a detail view with:
  - The standard `ArtifactProvenance` breadcrumb header
  - A metadata sidebar showing: filename, file size, last modified date
  - A prominent "Open Preview" button in the main content area that opens the mockup in a new browser tab via `window.open()` targeting the proxy route (`/api/artifacts/mockup?project=X&path=Y`)
  - A brief description: "This is an HTML mockup. Click Open Preview to view it in a new tab."

  The detail view does NOT render the HTML content inline. The main content area is a landing page with the preview action, not a viewer.

- REQ-MKP-15: The artifact tree view and artifact list show a "preview" action for HTML artifacts. Clicking it opens the mockup directly in a new tab (same URL as REQ-MKP-14's button), without navigating to the detail view first. This provides a fast path for users who just want to see the mockup.

- REQ-MKP-16: The "Open Preview" interaction uses `window.open(url, '_blank', 'noopener,noreferrer')`. The `noopener` flag prevents the mockup page from accessing `window.opener`, adding a layer of isolation beyond the CSP.

### Caching

- REQ-MKP-17: The mockup serving endpoint sets `Cache-Control: no-cache` headers. Unlike images, mockups are frequently iterated during development. Browser caching would show stale versions after a worker regenerates a mockup. `no-cache` allows conditional requests (If-Modified-Since) while ensuring the browser validates before displaying.

### Edge Cases

- REQ-MKP-18: If the daemon returns 404 (file not found), the proxy returns 404 and the detail view displays a "Mockup file not found" message with the expected path.
- REQ-MKP-19: If the file exists but has a non-`.html` extension despite being reached through the mockup path, the daemon returns 415 and the proxy forwards it.
- REQ-MKP-20: Files larger than 10MB SHOULD be served without special handling. The daemon reads the full file into memory (matching the image serving pattern). A future optimization could stream large files, but this is out of scope. The assumption is that self-contained HTML mockups are under 10MB.
- REQ-MKP-21: HTML files that are not self-contained (referencing external stylesheets, scripts, or images via relative paths) will have broken references. This is expected and acceptable. The spec targets self-contained mockups. Documenting this limitation in the "Open Preview" UI text (REQ-MKP-14) is not necessary; it is a known constraint of the serving model, not a user-facing error.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Mockup preview tab | User clicks "Open Preview" or tree-view preview action | New browser tab at `/api/artifacts/mockup?project=X&path=Y` |
| Detail view | User clicks an HTML artifact in the tree | `/projects/[name]/artifacts/[...path]` (catch-all, mockup branch) |
| Back to tree | User clicks breadcrumb from detail view | `/projects/[name]?tab=artifacts` |

## Constraints

- No iframe embedding. Mockups open in a new tab exclusively.
- No HTML parsing or content extraction. The daemon serves the raw file bytes. It does not inspect, sanitize, or transform the HTML content.
- No editor. HTML mockups are read-only in the web UI. Workers generate them; users view them.
- The `Artifact` type at `lib/types.ts` gains a new `artifactType` value (`"mockup"`). The `content` and `rawContent` fields are empty for mockup artifacts, matching the image artifact pattern.
- The `.html` extension is the sole identifier. There is no MIME type sniffing, magic byte detection, or frontmatter-based type classification for mockups.

## Assumptions

- HTML mockups in `.lore/` are self-contained: all CSS, JS, and images are inlined or base64-encoded. External resource references will break.
- Mockup files are reasonably sized (under 10MB). The spec does not address streaming.
- The number of HTML mockups per project is small (tens, not hundreds). The scanner's full-tree walk handles this without performance concerns.
- Workers generating mockups place them in `.lore/generated/` or other `.lore/` subdirectories, following the same conventions as image artifacts.

## Non-Goals

- Editing or annotating mockups in the web UI.
- Hot-reloading mockups when the source file changes.
- Serving mockups with external dependencies (CSS frameworks, JS libraries, external images).
- Thumbnail or preview image generation for mockup artifacts in list views.
- Video or animation file support.

## Success Criteria

### Automated (test)

- [ ] HTML files in `.lore/` appear in artifact scan results with `artifactType: "mockup"`
- [ ] HTML artifacts appear in the tree view with a distinct icon
- [ ] The mockup serving endpoint returns raw HTML with correct Content-Type and CSP headers
- [ ] The mockup serving endpoint rejects path traversal attempts (400)
- [ ] The mockup serving endpoint rejects non-`.html` extensions (415)
- [ ] The Next.js proxy forwards daemon responses with headers intact

### Manual (demonstration)

- [ ] Clicking "Open Preview" in the detail view opens the mockup in a new browser tab
- [ ] The mockup renders at full viewport in the new tab
- [ ] Clicking the preview action in the tree view opens the mockup directly
- [ ] Self-contained mockups with inline scripts and styles function correctly
- [ ] The CSP blocks outbound network requests from the mockup

## AI Validation

**Defaults apply:**
- Unit tests with mocked time/network/filesystem/LLM calls
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Mockup scanner tested with: no HTML files, mixed `.md`/image/HTML files, nested directories, non-`.html` files (should be skipped)
- Path validation tested with: valid paths, traversal attempts (`../../../etc/passwd`), paths with special characters
- CSP header tested: verify `connect-src 'none'` and `frame-ancestors 'none'` are present in responses
- Proxy route tested: forwards daemon responses correctly for 200, 404, 415 status codes
- `artifactType` union tested: ensure "mockup" is handled in all switch/conditional branches that check `artifactType`
