---
title: "Commission: Spec: Image display in artifact views"
date: 2026-03-18
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec for displaying images that exist in the artifacts directory (`.lore/`) within the Guild Hall web UI.\n\nContext: The Replicate native toolbox (currently being built) will generate images into `.lore/generated/`. Workers may also produce or reference images in other `.lore/` subdirectories. The web UI currently renders markdown artifacts but has no support for displaying images inline or as standalone artifacts.\n\nResearch the current artifact rendering pipeline to understand how artifacts are discovered, routed, and displayed. Key files to examine:\n- `web/app/projects/[name]/artifacts/[...path]/page.tsx` (catch-all artifact route)\n- `web/components/` for existing artifact display components\n- `lib/types.ts` for artifact types\n- The existing markdown rendering setup (react-markdown + remark-gfm)\n\nThe spec should cover:\n1. How images in `.lore/` are discovered and listed alongside markdown artifacts\n2. How images render when navigated to directly (standalone view with metadata)\n3. How images referenced in markdown artifacts render inline (markdown `![alt](path)` syntax)\n4. How `.lore/generated/` images from the Replicate toolbox appear in artifact views\n5. Thumbnail generation or lazy loading considerations for directories with many images\n6. File type support (png, jpg, webp, gif at minimum)\n\nFollow the spec format used in `.lore/specs/`. Include REQ IDs and an AI Validation checklist. Place the spec at `.lore/specs/ui/artifact-image-display.md`."
dependencies: []
linked_artifacts:
  - .lore/specs/ui/artifact-image-display.md

activity_timeline:
  - timestamp: 2026-03-18T20:05:04.565Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T20:05:04.567Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-18T20:05:04.608Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-18T20:05:10.781Z
    event: progress_report
    reason: "Starting research phase: reading the current artifact rendering pipeline (routes, components, types, markdown setup) before drafting the spec."
  - timestamp: 2026-03-18T20:06:12.360Z
    event: progress_report
    reason: "Research complete. Mapped the full artifact pipeline: discovery (collectMarkdownFiles → .md only), daemon routes (list/read/write), rendering (ReactMarkdown), and tree view (ArtifactList). No image support exists anywhere. Now drafting the spec."
  - timestamp: 2026-03-18T20:07:36.947Z
    event: result_submitted
    reason: "Spec written at `.lore/specs/ui/artifact-image-display.md` with 24 requirements (REQ-IMG-1 through REQ-IMG-24).\n\nResearch found that images are invisible at every layer: discovery scans only `.md` files, the daemon serves only parsed markdown, and no image serving endpoint exists. The spec addresses six areas:\n\n1. **Discovery** (REQ-IMG-1 through 5): Extend `collectMarkdownFiles` to also collect image files (.png, .jpg, .jpeg, .webp, .gif, .svg). Synthetic metadata from filename/mtime.\n2. **Serving** (REQ-IMG-6 through 9): New daemon endpoint for raw image bytes with Content-Type headers, proxied through a Next.js API route.\n3. **Standalone view** (REQ-IMG-10 through 13): Catch-all route branches on artifact type, renders image with provenance breadcrumb and metadata sidebar.\n4. **Inline markdown** (REQ-IMG-14 through 17): ReactMarkdown `components.img` override rewrites local paths to the proxy endpoint. Relative and absolute path resolution.\n5. **Generated content** (REQ-IMG-18 through 19): No special treatment needed; `.lore/generated/` images flow through the same pipeline.\n6. **Performance** (REQ-IMG-20 through 22): Cache-Control headers, no server-side thumbnails, native lazy loading for inline images.\n\nKey decisions: no thumbnail generation (CSS handles scaling), no image upload (workers create images, UI is read-only), SVG served as images not embedded HTML (XSS prevention)."
  - timestamp: 2026-03-18T20:07:43.370Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Research complete. Mapped the full artifact pipeline: discovery (collectMarkdownFiles → .md only), daemon routes (list/read/write), rendering (ReactMarkdown), and tree view (ArtifactList). No image support exists anywhere. Now drafting the spec."
projectName: guild-hall
---
Spec written at `.lore/specs/ui/artifact-image-display.md` with 24 requirements (REQ-IMG-1 through REQ-IMG-24).

Research found that images are invisible at every layer: discovery scans only `.md` files, the daemon serves only parsed markdown, and no image serving endpoint exists. The spec addresses six areas:

1. **Discovery** (REQ-IMG-1 through 5): Extend `collectMarkdownFiles` to also collect image files (.png, .jpg, .jpeg, .webp, .gif, .svg). Synthetic metadata from filename/mtime.
2. **Serving** (REQ-IMG-6 through 9): New daemon endpoint for raw image bytes with Content-Type headers, proxied through a Next.js API route.
3. **Standalone view** (REQ-IMG-10 through 13): Catch-all route branches on artifact type, renders image with provenance breadcrumb and metadata sidebar.
4. **Inline markdown** (REQ-IMG-14 through 17): ReactMarkdown `components.img` override rewrites local paths to the proxy endpoint. Relative and absolute path resolution.
5. **Generated content** (REQ-IMG-18 through 19): No special treatment needed; `.lore/generated/` images flow through the same pipeline.
6. **Performance** (REQ-IMG-20 through 22): Cache-Control headers, no server-side thumbnails, native lazy loading for inline images.

Key decisions: no thumbnail generation (CSS handles scaling), no image upload (workers create images, UI is read-only), SVG served as images not embedded HTML (XSS prevention).
