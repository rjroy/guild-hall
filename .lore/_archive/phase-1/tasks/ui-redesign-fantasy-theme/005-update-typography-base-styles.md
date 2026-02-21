---
title: Update typography and base styles
date: 2026-02-14
status: complete
tags: [task, typography, css]
source: .lore/plans/phase-1/ui-redesign-fantasy-theme.md
related: [.lore/specs/phase-1/ui-redesign-fantasy-theme.md]
sequence: 5
modules: [dashboard]
---

# Task: Update Typography and Base Styles

## What

Update the base typography in the `body` selector and add heading styles to `app/globals.css`.

Set `body` to:
- Use `var(--font-primary)` for font family
- Font size: 14px
- Line height: 1.5
- Color: `var(--text-primary)`
- Background: `var(--background) fixed center/cover no-repeat`
- Background color fallback: `#1A1A1A` (while image loads)

Add heading styles for `h1`, `h2`, `h3`:
- h1: 24px, weight 600
- h2: 20px, weight 600
- h3: 16px, weight 600
- All use `var(--text-primary)` color

Add code/pre styling:
- Font family: `var(--font-mono)`

This establishes Ysabeau Office as primary font, Source Code Pro for code, and the fixed background image.

## Validation

- `body` selector uses `var(--font-primary)` and has `background: var(--background) fixed center/cover no-repeat`
- `body` has background-color fallback of `#1A1A1A`
- `h1`, `h2`, `h3` selectors defined with correct sizes (24px, 20px, 16px) and weight 600
- `code, pre` selector uses `var(--font-mono)`
- Font sizes match spec: body 14px, h1 24px, h2 20px, h3 16px
- Line height is 1.5 for body text

Verify by inspecting `app/globals.css` for these selectors and properties.

## Why

From `.lore/specs/phase-1/ui-redesign-fantasy-theme.md`:

**REQ-UI-REDESIGN-2**: Fixed background image displays across all views (Dashboard, Workshop, CreateSessionDialog)

**REQ-UI-REDESIGN-4**: Background uses fixed attachment to create depth as panels scroll over it

**REQ-UI-REDESIGN-42**: Heading sizes create clear hierarchy: h1 (24px), h2 (20px), h3 (16px)

**REQ-UI-REDESIGN-43**: Body text uses 14-16px with 1.5 line-height for readability

**Success Criteria**:
- Ysabeau Office and Source Code Pro fonts load correctly from self-hosted location and apply to appropriate elements (check computed font-family on body and code elements)
- Background image moved to public/ directory and covers 100% viewport width and height on all breakpoints
- Background coverage verified via computed background-size and background-position

## Files

- `app/globals.css` (modify)
