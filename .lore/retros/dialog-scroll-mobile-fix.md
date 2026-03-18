---
title: Dialog with scrollable body needs flex column, not whole-container overflow
date: 2026-02-18
status: complete
tags: [css, responsive, mobile, flex-layout, scroll-overflow]
modules: [create-session-dialog]
related: [.lore/retros/mobile-roster-layout-fix.md]
---

# Retro: Create Session Dialog Mobile Overflow

## Summary

Fixed the "New Session" dialog being unusable on mobile when more than 2 plugins were present. The member checklist pushed the footer (Cancel/Create buttons) below the viewport with no way to scroll to it. Changed the dialog from whole-container `overflow-y: auto` to a flex column layout where only the body scrolls.

## What Went Well

- Root cause was immediately clear from reading the CSS: `overflow-y: auto` on the dialog container treated header, body, and footer as one scrollable unit
- Fix was four property changes, no component restructuring needed
- All 774 tests passed without modification
- Previous retro on mobile roster layout was in `.lore/retros/` and provided useful context on the project's mobile layout history

## What Could Improve

- This is the second mobile usability issue caught by real device testing rather than during implementation. The first was the roster sidebar squish (see related retro). Both were CSS layout issues invisible on desktop.
- No mobile-specific testing step exists in the workflow. These bugs survive because desktop browser dev tools don't surface "can't reach the button" the same way a real phone does.

## Lessons Learned

- Dialogs with fixed headers/footers and scrollable bodies need flex column layout. Putting `overflow-y: auto` on the whole dialog container means the footer scrolls away when content grows. The pattern: dialog is `display: flex; flex-direction: column; max-height: Xvh`, body gets `overflow-y: auto; flex: 1; min-height: 0`, header and footer get `flex-shrink: 0`.
- Adding `padding` to a fixed-position backdrop (instead of `margin` on the dialog) is a clean way to prevent the dialog from touching screen edges on small viewports. No media query needed.

## Artifacts

- **Files changed**:
  - `components/board/CreateSessionDialog.module.css` - Flex column layout, body-only scroll, backdrop padding
