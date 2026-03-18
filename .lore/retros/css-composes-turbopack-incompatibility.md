---
title: CSS Modules composes silently ignored by Turbopack
date: 2026-03-15
status: complete
tags: [bug, css-modules, turbopack, next-js, silent-failure]
modules: [meeting-request-card, commit-lore-button]
---

# Retro: CSS Modules `composes` silently ignored by Turbopack

## Summary

Two components (MeetingRequestCard, CommitLoreButton) used CSS Modules `composes` to inherit base button styles. The directive was silently ignored by Turbopack, meaning buttons rendered without their shared base styles (font, padding, border, cursor, transition). Fixed by removing `composes` and applying both class names in TSX via template literals.

## What Went Well

- Quick diagnosis. The `--turbopack` flag in the dev script pointed directly at the cause.
- Fix was straightforward. TSX class composition is a reliable pattern that doesn't depend on preprocessor behavior.

## What Could Improve

- The bug existed since these components were written. `composes` was never actually working, but because each button also had its own `background-color` and `color` overrides, the visual breakage was subtle (missing base font, padding, border, cursor, and transition properties).
- No editor or build-time warning. Turbopack parses `composes` without error but doesn't process it. A CSS linter rule could catch this.

## Lessons Learned

- Turbopack's CSS Modules implementation does not support `composes`. The directive is silently ignored. Use TSX-side class composition (`className={`${styles.base} ${styles.variant}`}`) instead.
- Silent compatibility gaps between webpack and Turbopack can hide behind partial visual correctness. When a component "mostly looks right," missing inherited styles go unnoticed until someone inspects the elements.

## Artifacts

- `web/components/dashboard/MeetingRequestCard.module.css`
- `web/components/dashboard/MeetingRequestCard.tsx`
- `web/components/project/CommitLoreButton.module.css`
- `web/components/project/CommitLoreButton.tsx`
