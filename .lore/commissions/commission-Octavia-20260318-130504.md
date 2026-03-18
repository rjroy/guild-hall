---
title: "Commission: Spec: Image display in artifact views"
date: 2026-03-18
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec for displaying images that exist in the artifacts directory (`.lore/`) within the Guild Hall web UI.\n\nContext: The Replicate native toolbox (currently being built) will generate images into `.lore/generated/`. Workers may also produce or reference images in other `.lore/` subdirectories. The web UI currently renders markdown artifacts but has no support for displaying images inline or as standalone artifacts.\n\nResearch the current artifact rendering pipeline to understand how artifacts are discovered, routed, and displayed. Key files to examine:\n- `web/app/projects/[name]/artifacts/[...path]/page.tsx` (catch-all artifact route)\n- `web/components/` for existing artifact display components\n- `lib/types.ts` for artifact types\n- The existing markdown rendering setup (react-markdown + remark-gfm)\n\nThe spec should cover:\n1. How images in `.lore/` are discovered and listed alongside markdown artifacts\n2. How images render when navigated to directly (standalone view with metadata)\n3. How images referenced in markdown artifacts render inline (markdown `![alt](path)` syntax)\n4. How `.lore/generated/` images from the Replicate toolbox appear in artifact views\n5. Thumbnail generation or lazy loading considerations for directories with many images\n6. File type support (png, jpg, webp, gif at minimum)\n\nFollow the spec format used in `.lore/specs/`. Include REQ IDs and an AI Validation checklist. Place the spec at `.lore/specs/ui/artifact-image-display.md`."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T20:05:04.565Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T20:05:04.567Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
