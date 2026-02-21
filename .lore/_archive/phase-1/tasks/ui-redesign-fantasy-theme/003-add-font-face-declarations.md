---
title: Add font face declarations to globals.css
date: 2026-02-14
status: complete
tags: [task, fonts, typography, css]
source: .lore/_archive/phase-1/plans/ui-redesign-fantasy-theme.md
related: [.lore/_archive/phase-1/specs/ui-redesign-fantasy-theme.md]
sequence: 3
modules: [dashboard]
---

# Task: Add Font Face Declarations

## What

Add `@font-face` declarations at the top of `app/globals.css` (before the `:root` section) to load the self-hosted variable fonts.

Use variable font syntax with `font-weight: 100 900` to declare the full weight range. The browser will interpolate any weight value (400, 500, 600, etc.) from the single font file.

Add four `@font-face` blocks:
1. Ysabeau Office (normal)
2. Ysabeau Office (italic)
3. Source Code Pro (normal)
4. Source Code Pro (italic)

Use `font-display: swap` to prevent invisible text during font loading.

Example structure:
```css
@font-face {
  font-family: 'Ysabeau Office';
  src: url('/fonts/ysabeau-office/YsabeauOffice-VariableFont_wght.ttf') format('truetype');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}
```

## Validation

- `app/globals.css` contains exactly 4 `@font-face` declarations
- Each declaration uses `font-weight: 100 900` (variable font syntax)
- Each declaration uses `font-display: swap`
- Font paths point to `/fonts/ysabeau-office/` and `/fonts/source-code-pro/`
- Font family names are `'Ysabeau Office'` and `'Source Code Pro'`
- Declarations appear before `:root` CSS variable section

Verify by inspecting `app/globals.css` for the four `@font-face` blocks with correct paths and variable font weight ranges.

## Why

From `.lore/_archive/phase-1/specs/ui-redesign-fantasy-theme.md`:

**REQ-UI-REDESIGN-41**: Font files must be moved from tmp to appropriate self-hosting location (e.g., public/fonts/ or Next.js font optimization directory) and properly loaded via CSS @font-face or Next.js font API (may require code changes to support)

**Success Criteria**: Ysabeau Office and Source Code Pro fonts load correctly from self-hosted location

The plan specifies: "Use `font-weight: 100 900` to declare the full weight range. The browser will interpolate any weight value (400, 500, 600, etc.) from the single font file."

## Files

- `app/globals.css` (modify)
