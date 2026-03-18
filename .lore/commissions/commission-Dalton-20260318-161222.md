---
title: "Commission: Artifact image display UI (Steps 7-15)"
date: 2026-03-18
status: blocked
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the UI layer for image display in artifact views. Read the full plan at `.lore/plans/ui/artifact-image-display.md` and spec at `.lore/specs/ui/artifact-image-display.md`.\n\n**Before starting:** Check the review from commission `commission-Thorne-20260318-161208` at `.lore/commissions/commission-Thorne-20260318-161208/`. Address any findings before proceeding.\n\nBuild in this order:\n\n**Phase 3 (Steps 7-10):** Standalone image view.\n- Step 7: Add `/workspace/artifact/image/meta` daemon endpoint (metadata without file bytes)\n- Step 8: Branch the catch-all route for image artifacts in `web/app/projects/[name]/artifacts/[...path]/page.tsx`\n- Step 9: Create `ImageArtifactView` component with ornate border matching fantasy aesthetic\n- Step 10: Create `ImageMetadataSidebar` component (filename, format, size, last modified)\n\n**Phase 4 (Step 11):** Inline images in markdown.\n- Add custom `components.img` to ReactMarkdown in `ArtifactContent.tsx`\n- Extract `resolveImageSrc` to `web/lib/resolve-image-src.ts` for testability\n- Handle relative paths, absolute paths, external URLs\n\n**Phase 5 (Steps 12-15):** Tree view and Recent Scrolls icons.\n- Steps 12-13: Add image icon treatment to `ArtifactList` tree view\n- Step 14: Update `RecentArtifacts` with image icon\n- Step 15: Consolidate `displayTitle` to handle image extensions\n\nKey patterns:\n- CSS Modules, not Tailwind. Fantasy design tokens from `globals.css`\n- Server components by default. Only `\"use client\"` when hooks/events needed\n- `<img>` not `next/image` for dynamic API routes. Add eslint-disable comment.\n- Vendor prefix order: `-webkit-backdrop-filter` before `backdrop-filter`\n- SVG renders via `<img>`, not inline (XSS prevention)\n\nWrite unit tests per the plan's Testing Strategy. Run `bun test` after each phase."
dependencies:
  - commission-Thorne-20260318-161208
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T23:12:22.745Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T23:18:54.817Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
