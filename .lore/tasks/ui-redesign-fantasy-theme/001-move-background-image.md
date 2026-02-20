---
title: Move background image to public directory
date: 2026-02-14
status: complete
tags: [task, assets, background]
source: .lore/plans/ui-redesign-fantasy-theme.md
related: [.lore/specs/phase-1/ui-redesign-fantasy-theme.md]
sequence: 1
modules: [dashboard]
---

# Task: Move Background Image to Public Directory

## What

Create the `public/` directory at project root if it doesn't exist. Copy the background image from `.lore/prototypes/guild-hall-entry.webp` to `public/guild-hall-entry.webp`. This makes it accessible at `/guild-hall-entry.webp` in the Next.js application. Verify the file size remains 209KB after copying.

## Validation

- `public/guild-hall-entry.webp` exists and is accessible
- File size is ~209KB (optimized webp)
- File is readable and not corrupted (can be opened/displayed)
- Original file in `.lore/prototypes/` remains unchanged

Run:
```bash
ls -lh public/guild-hall-entry.webp  # Should show ~209KB
file public/guild-hall-entry.webp    # Should identify as WebP image
```

## Why

From `.lore/specs/phase-1/ui-redesign-fantasy-theme.md`:

**REQ-UI-REDESIGN-1**: Background image moved from `.lore/prototypes/guild-hall-entry.webp` to `public/guild-hall-entry.webp` for proper Next.js static asset serving

**Success Criteria**: Background image moved to public/ directory and covers 100% viewport width and height on all breakpoints (320px, 768px, 1200px)

## Files

- Create: `public/` directory (if doesn't exist)
- Copy: `.lore/prototypes/guild-hall-entry.webp` → `public/guild-hall-entry.webp`
