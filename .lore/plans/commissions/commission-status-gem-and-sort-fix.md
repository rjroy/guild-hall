---
title: Commission Status Gem and Sort Fix
date: 2026-03-09
status: executed
tags: [commissions, ui, sorting, css]
modules: [commission-list, gem-indicator, lib-commissions, lib-types]
related:
  - .lore/plans/ui/artifact-sorting.md
  - .lore/plans/commissions/guild-hall-scheduled-commissions.md
---

# Plan: Commission Status Gem and Sort Fix

## Problem

The commission tab shows a red gem for every commission, regardless of actual status.
Sorting is also wrong: some commission statuses sort to the very end
of the list, after completed commissions.

Both issues were introduced or made visible when scheduled commissions were added.

## Root Cause Analysis

### Why everything shows red

The gem image (`/public/images/ui/gem.webp`) is described in code comments as a "blue base
gem" (hue approximately 240°). The CSS custom properties in `globals.css` apply
`hue-rotate` filters to tint it:

```css
--gem-active:  hue-rotate(100deg)  saturate(1.5) brightness(0.9);
--gem-pending: hue-rotate(-70deg)  saturate(2)   brightness(1.1);
--gem-blocked: hue-rotate(-140deg) saturate(2)   brightness(0.85);
--gem-info:    none;
```

For a blue (240°) base gem, the math produces:

| Variable       | Rotation | Result Hue | Apparent Color |
|----------------|----------|------------|----------------|
| `--gem-active` | +100°    | ~340°      | **red-magenta** |
| `--gem-pending`| -70°     | ~170°      | cyan-green     |
| `--gem-blocked`| -140°    | ~100°      | yellow-green   |
| `--gem-info`   | none     | 240°       | blue           |

The **intended** colors (from test comments in `tests/lib/types.test.ts`) are:
- active = **green**, pending = **amber**, blocked = **red**, info = **blue**

What was intended is almost the mirror image of what's in the CSS. `--gem-active` and
`--gem-blocked` produce the wrong colors — active appears red, blocked appears
yellow-green.

Since `statusToGem()` maps the majority of commission statuses to `"active"` (completed,
dispatched, in_progress, scheduled-active), nearly every gem in the list renders red.
This is the primary bug.

**Correction for a blue (240°) base gem to reach target hues:**

| Variable        | Target hue | Required rotation |
|-----------------|------------|-------------------|
| `--gem-active`  | 120° (green) | `hue-rotate(-120deg)` |
| `--gem-pending` | 45° (amber)  | `hue-rotate(-195deg)` |
| `--gem-blocked` | 0°/360° (red)| `hue-rotate(120deg)`  |
| `--gem-info`    | 240° (blue)  | `none` (unchanged)    |

The implementer must visually verify the output after applying these values — the exact
hue of the gem image determines whether these calculations hold. If the gem image is not
pure blue, adjust accordingly.

### Why `abandoned` commissions sort wrong

`STATUS_GROUP` omits `"abandoned"`. It falls through to group 9, but should be in
group 2 alongside `failed` and `cancelled`.

### What wasn't broken by scheduled commissions

The scheduled commission statuses themselves (`active`, `paused`, `completed`, `failed`)
all map correctly through both `statusToGem()` and `STATUS_GROUP`. The scheduling
feature didn't introduce new status-mapping gaps — it just increased the volume of
commissions visible in the list, making the pre-existing CSS bug more apparent.

## Changes Required

### Fix 1: CSS filter values — `web/app/globals.css`

Replace the three incorrect filter values:

```css
/* Before */
--gem-active:  hue-rotate(100deg)  saturate(1.5) brightness(0.9);
--gem-pending: hue-rotate(-70deg)  saturate(2)   brightness(1.1);
--gem-blocked: hue-rotate(-140deg) saturate(2)   brightness(0.85);

/* After (for blue base gem — verify visually before committing) */
--gem-active:  hue-rotate(-120deg) saturate(1.5) brightness(0.9);
--gem-pending: hue-rotate(-195deg) saturate(2)   brightness(1.1);
--gem-blocked: hue-rotate(120deg)  saturate(2)   brightness(0.85);
```

**Verification requirement**: Open the commissions tab after applying the change. Confirm:
- A completed or dispatched commission shows a **green** gem.
- A failed or cancelled commission shows a **red** gem.
- A pending/blocked commission shows an **amber** gem.
- The `--gem-info: none` gem still shows the original gem color (for fallback status values).

If the image is not blue but amber or another hue, the rotation values above will be
wrong. In that case, dial them empirically to reach the intended colors.

### Fix 2: Add `abandoned` to `STATUS_GROUP` — `lib/commissions.ts`

```typescript
const STATUS_GROUP: Record<string, number> = {
  pending: 0,
  blocked: 0,
  paused: 0,
  dispatched: 1,
  in_progress: 1,
  active: 1,
  failed: 2,
  cancelled: 2,
  abandoned: 2,   // <-- add: terminal failure state (same group as failed/cancelled)
  completed: 3,
};
```

`abandoned` belongs in group 2: it's a terminal
negative outcome, same character as `failed` and `cancelled`.

### Fix 3: Add test coverage — `tests/lib/types.test.ts` and `tests/lib/commissions.test.ts`

**In `tests/lib/types.test.ts`**, add to the `statusToGem` test cases:

```typescript
// Commission-specific statuses
["dispatched", "active"],
["in_progress", "active"],
["completed", "active"],
["failed", "blocked"],
["cancelled", "blocked"],
["abandoned", "blocked"],
["blocked", "pending"],     // waiting on dependency
```

Several of these (dispatched, in_progress, completed, failed, cancelled) were already
in `ACTIVE_STATUSES` / `BLOCKED_STATUSES` but had no test coverage. Add them all.

**In `tests/lib/commissions.test.ts`**, add to the `sortCommissions` tests:

```typescript
// abandoned sorts before completed (same group as failed/cancelled)
```

Verify that an abandoned commission appears above a completed commission in the sorted
output.

## Sort Order Intent (all statuses, with groups)

For reference, the complete intended group assignment across both commission types:

| Status       | Source                | Group | Rationale                        |
|--------------|-----------------------|-------|----------------------------------|
| pending      | one-shot              | 0     | not yet started                  |
| blocked      | one-shot              | 0     | waiting on dependency            |
| paused       | scheduled             | 0     | schedule paused by user          |
| dispatched   | one-shot              | 1     | running                          |
| in_progress  | one-shot              | 1     | running                          |
| active       | scheduled             | 1     | schedule is live                 |
| failed       | both                  | 2     | terminal negative                |
| cancelled    | one-shot              | 2     | terminal negative                |
| abandoned    | one-shot              | 2     | terminal negative                |
| completed    | both                  | 3     | terminal positive                |

Within groups 0–2, older commissions sort first (surface urgent work). Within group 3
(completed), newer commissions sort first (recent history visible at top of completed
section).

## Gem Color Intent (all statuses)

| Commission status | → statusToGem → | → GemIndicator class → | Visible color |
|-------------------|-----------------|------------------------|---------------|
| dispatched        | active          | .active                | green         |
| in_progress       | active          | .active                | green         |
| completed         | active          | .active                | green         |
| active (scheduled)| active          | .active                | green         |
| approved          | active          | .active                | green         |
| pending           | pending         | .pending               | amber         |
| blocked           | pending         | .pending               | amber         |
| paused (scheduled)| pending         | .pending               | amber         |
| failed            | blocked         | .blocked               | red           |
| cancelled         | blocked         | .blocked               | red           |
| abandoned         | blocked         | .blocked               | red           |

## Files Changed

| File                          | Change                                      |
|-------------------------------|---------------------------------------------|
| `web/app/globals.css`         | Fix CSS filter values for gem status colors |
| `lib/commissions.ts`          | Add `abandoned` to STATUS_GROUP              |
| `tests/lib/types.test.ts`     | Add commission-specific statusToGem cases   |
| `tests/lib/commissions.test.ts`| Add abandoned sort cases                   |

No component changes are needed. The data flows through `statusToGem()` and
`sortCommissions()` — fixing those two functions and the CSS variables is sufficient.
`CommissionList.tsx` and `GemIndicator.tsx` are correct as written.

## Implementation Notes

- Fix the CSS values first and verify visually before touching the TypeScript. If the
  gem turns out to be amber or another base color, the rotation calculations above will
  need to be adjusted. Don't guess — open the UI and confirm.
- Run `bun test` after each fix. The test suite will catch any regressions in the sort
  logic immediately. CSS changes need visual confirmation.
