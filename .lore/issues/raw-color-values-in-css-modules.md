---
title: "Raw color values in CSS Modules"
date: 2026-04-03
status: open
tags: [bug, ui, design-tokens, tech-debt, lint]
modules: [web]
related:
  - .lore/retros/commission-cleanup-2026-04-03.md
---

Multiple `.module.css` files contain hardcoded color values (hex, rgb, rgba) instead of `var(--color-*)` design tokens from `globals.css`. `CLAUDE.md` already prohibits this ("No raw color values in CSS Modules"), but enforcement is manual and existing violations have accumulated.

Surfaced during commission cleanup when Thorne flagged `rgba(184, 134, 11, 0.3)` in `CollapsibleSidebar.module.css`, but the problem is systemic, not isolated to one component.

## Verified Status (2026-04-18)

- **196 raw color values across 35 `.module.css` files** in `web/`. Search: `grep -rn "rgba\|rgb(\|#[0-9a-fA-F]\{3\}\|hsl(" web --include="*.module.css" | grep -v "var(--"`.
- Sample violations in one file (`apps/web/components/artifact/ArtifactContent.module.css`):
  - line 8: `rgba(26, 20, 18, 0.9)` — panel background
  - lines 39, 45: `rgba(184, 134, 11, 0.15)`, `rgba(184, 134, 11, 0.3)` — brass at two opacities
  - lines 50, 56: `rgba(76, 148, 76, 0.2)`, `rgba(76, 148, 76, 0.35)` — green at two opacities
  - line 87: `rgba(224, 96, 96, 0.1)` — red tint
- Affected directories: `apps/web/app/projects/[name]/artifacts/`, `apps/web/components/artifact/`, `commission/`, `dashboard/`, `meeting/`, and others.

The recurring values (brass at 15%/20%/30%, green at 20%/35%, panel-near-black at 85%/90%) are evidence of unnamed semantic tokens. They want names like `--color-emphasis-bg` or `--color-success-pill-bg`.

## Fix Direction

Two-step. Don't attempt one big refactor.

**Step 1 — Catalog and tokenize.**

- Sweep `.module.css` files for raw color values.
- Group recurring values. For each, add a `--color-*` token to `apps/web/app/globals.css`. Name by intent (`--color-emphasis-bg`), not appearance (`--color-brass-30`).
- For genuinely one-off values, add a `/* token-exempt: ... */` comment with the reason.

**Step 2 — Replace and lint.**

- Per-file or per-feature sweep replacing literals with tokens. Keep diffs small for review.
- Add a stylelint rule (or equivalent) that errors on hex/rgb/rgba/hsl literals in `.module.css`. Wire into the pre-commit hook so new violations can't land. Lint is the only durable enforcement; manual review keeps failing.

## Verification After Fix

- `grep -rn "rgba\|rgb(\|#[0-9a-fA-F]\{3\}\|hsl(" web --include="*.module.css" | grep -v "var(--"` returns zero (or only token-exempt lines).
- Stylelint rule active and CI/pre-commit gates on it.
- Token-only test: changing a token value in `globals.css` propagates everywhere without further edits.

## Notes for the Fix

- Per-component fixes don't scale; the lint rule is the answer.
- Token names should describe role, not appearance. `--color-emphasis-bg` survives a redesign; `--color-brass-30` does not.
- A `--color-*` token can hold an opacity expression directly (`--color-emphasis-bg: rgba(184, 134, 11, 0.3)`) — tokens don't need to be solid colors.
