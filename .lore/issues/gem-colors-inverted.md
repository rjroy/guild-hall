---
title: Commission status gem colors are mathematically inverted
status: resolved
tags: [bug, ui, css]
date: 2026-03-10
---

## Problem

All commission status gems display the wrong color. The hue-rotate values in `globals.css` produce the inverse of their intended colors.

Current values and what they produce:
- `--gem-active: hue-rotate(100deg)` → 340° (red) — should be green
- `--gem-blocked: hue-rotate(-140deg)` → 100° (yellow-green) — should be red
- `--gem-pending` — needs review

Two statuses are also entirely unmapped: `sleeping` has no gem CSS, `abandoned` is not in the sort group.

## Proposed Fix

Based on the hue offset needed to shift the gem's base color to target hues:
- Active (should be green): `hue-rotate(-120deg)`
- Blocked (should be red): `hue-rotate(120deg)`
- Pending (should be amber): `hue-rotate(-195deg)`

Add `sleeping` to gem CSS and `abandoned` to sort group.

Requires visual verification against the gem sprite after applying changes — the exact values depend on the sprite's base hue.

## Source

Identified during Octavia's commission 2026-03-09 (commission status gem planning).
