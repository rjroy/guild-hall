---
title: Organize and move font files to public directory
date: 2026-02-14
status: complete
tags: [task, assets, fonts, typography]
source: .lore/plans/ui-redesign-fantasy-theme.md
related: [.lore/specs/phase-1/ui-redesign-fantasy-theme.md]
sequence: 2
modules: [dashboard]
---

# Task: Organize and Move Font Files

## What

Create font directories under `public/fonts/`: `public/fonts/ysabeau-office/` and `public/fonts/source-code-pro/`.

The fonts in `tmp/` are **variable fonts** (single file supporting weight range 100-900), not static weight files. Copy only the variable font files:

**Ysabeau Office** (copy to `public/fonts/ysabeau-office/`):
- `YsabeauOffice-VariableFont_wght.ttf` (all weights 100-900)
- `YsabeauOffice-Italic-VariableFont_wght.ttf` (italic variant)

**Source Code Pro** (copy to `public/fonts/source-code-pro/`):
- `SourceCodePro-VariableFont_wght.ttf` (all weights 100-900)
- `SourceCodePro-Italic-VariableFont_wght.ttf` (italic variant)

**Total: 4 files** - Variable fonts support the full weight range in a single file, much more efficient than copying 20+ static weight files.

## Validation

- `public/fonts/ysabeau-office/` directory exists with 2 files (regular + italic variable fonts)
- `public/fonts/source-code-pro/` directory exists with 2 files (regular + italic variable fonts)
- All 4 files are TTF format and readable
- No static weight files (e.g., `YsabeauOffice-Regular.ttf`) copied - only variable font files

Run:
```bash
ls -lh public/fonts/ysabeau-office/  # Should show 2 .ttf files
ls -lh public/fonts/source-code-pro/ # Should show 2 .ttf files
file public/fonts/ysabeau-office/YsabeauOffice-VariableFont_wght.ttf  # Should identify as TrueType font
```

## Why

From `.lore/specs/phase-1/ui-redesign-fantasy-theme.md`:

**REQ-UI-REDESIGN-39**: Primary font uses Ysabeau Office (currently in tmp/Ysabeau_Office directory, temporary location) as the main sans-serif typeface

**REQ-UI-REDESIGN-40**: Monospace font uses Source Code Pro (currently in tmp/Source_Code_Pro directory, temporary location) for tool/code display

**REQ-UI-REDESIGN-41**: Font files must be moved from tmp to appropriate self-hosting location (e.g., public/fonts/ or Next.js font optimization directory) and properly loaded via CSS @font-face or Next.js font API

**Success Criteria**: Ysabeau Office and Source Code Pro fonts load correctly from self-hosted location

## Files

- Create: `public/fonts/ysabeau-office/` directory
- Create: `public/fonts/source-code-pro/` directory
- Copy: Variable font files from `tmp/Ysabeau_Office/` to `public/fonts/ysabeau-office/`
- Copy: Variable font files from `tmp/Source_Code_Pro/` to `public/fonts/source-code-pro/`
