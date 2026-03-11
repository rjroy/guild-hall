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
Sorting is also wrong: sleeping commissions (waiting for mail reply) sort to the very end
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

### Why `sleeping` commissions sort wrong

The `"sleeping"` status (commission paused waiting for a mail reply) is absent from
`STATUS_GROUP` in `lib/commissions.ts`. It falls through to the default of `9`, sorting
after completed commissions. Sleeping is an active state and should sit in group 1
alongside `dispatched` and `in_progress`.

`STATUS_GROUP` also omits `"abandoned"`. It falls through to group 9, but should be in
group 2 alongside `failed` and `cancelled`.

### Why `sleeping` gems are wrong

`statusToGem()` in `lib/types.ts` does not include `"sleeping"` in any of its three
status sets. It falls through to `"info"` (no filter = base gem color). Sleeping is an
active waiting state; it should show the active gem (green), not a neutral one.

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

### Fix 2: Add `sleeping` to `statusToGem` — `lib/types.ts`

Add `"sleeping"` to `ACTIVE_STATUSES`:

```typescript
const ACTIVE_STATUSES = new Set([
  "approved", "active", "current", "complete", "completed",
  "resolved", "in_progress", "dispatched",
  "sleeping",   // <-- add this
]);
```

Sleeping is an active state (the commission is still running, just waiting for a mail
reply). It should display the same green gem as `in_progress`.

### Fix 3: Add `sleeping` and `abandoned` to `STATUS_GROUP` — `lib/commissions.ts`

```typescript
const STATUS_GROUP: Record<string, number> = {
  pending: 0,
  blocked: 0,
  paused: 0,
  dispatched: 1,
  in_progress: 1,
  sleeping: 1,    // <-- add: active waiting state
  active: 1,
  failed: 2,
  cancelled: 2,
  abandoned: 2,   // <-- add: terminal failure state (same group as failed/cancelled)
  completed: 3,
};
```

`sleeping` belongs in group 1: it's running and should float to the top of the list
alongside other active commissions. `abandoned` belongs in group 2: it's a terminal
negative outcome, same character as `failed` and `cancelled`.

### Fix 4: Add `sleeping` to `extractRelevantDate` — `lib/commissions.ts`

The `extractRelevantDate` function maps commission statuses to their corresponding
timeline events. `sleeping` is currently absent, so it falls back to the `created`
timestamp. Add it:

```typescript
const targetEvent: Record<string, string> = {
  completed:  "status_completed",
  failed:     "status_failed",
  cancelled:  "status_cancelled",
  dispatched: "status_dispatched",
  in_progress:"status_in_progress",
  sleeping:   "status_sleeping",   // <-- add this
};
```

This ensures the timestamp shown for a sleeping commission reflects when it entered
the sleeping state, not when it was created.

### Fix 5: Add test coverage — `tests/lib/types.test.ts` and `tests/lib/commissions.test.ts`

**In `tests/lib/types.test.ts`**, add to the `statusToGem` test cases:

```typescript
// Commission-specific statuses
["dispatched", "active"],
["in_progress", "active"],
["sleeping", "active"],     // active waiting state
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
// sleeping sorts before completed
// abandoned sorts before completed (same group as failed/cancelled)
```

Verify that a sleeping commission appears above a completed commission in the sorted
output. Verify that an abandoned commission appears above a completed commission.

## Sort Order Intent (all statuses, with groups)

For reference, the complete intended group assignment across both commission types:

| Status       | Source                | Group | Rationale                        |
|--------------|-----------------------|-------|----------------------------------|
| pending      | one-shot              | 0     | not yet started                  |
| blocked      | one-shot              | 0     | waiting on dependency            |
| paused       | scheduled             | 0     | schedule paused by user          |
| dispatched   | one-shot              | 1     | running                          |
| in_progress  | one-shot              | 1     | running                          |
| sleeping     | one-shot (mail)       | 1     | running, waiting for reply       |
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
| sleeping          | active          | .active                | green         |
| completed         | active          | .active                | green         |
| active (scheduled)| active          | .active                | green         |
| approved          | active          | .active                | green         |
| pending           | pending         | .pending               | amber         |
| blocked           | pending         | .pending               | amber         |
| paused (scheduled)| pending         | .pending               | amber         |
| failed            | blocked         | .blocked               | red           |
| cancelled         | blocked         | .blocked               | red           |
| abandoned         | blocked         | .blocked               | red           |
| sleeping (missing)| info (fallback) | .info                  | base color    |

The last row shows the current bug: sleeping falls through to "info" because it's absent
from all three status sets. Fix 2 moves it to the active/green column.

## Files Changed

| File                          | Change                                      |
|-------------------------------|---------------------------------------------|
| `web/app/globals.css`         | Fix CSS filter values for gem status colors |
| `lib/types.ts`                | Add `sleeping` to ACTIVE_STATUSES           |
| `lib/commissions.ts`          | Add `sleeping`/`abandoned` to STATUS_GROUP; add `sleeping` to extractRelevantDate |
| `tests/lib/types.test.ts`     | Add commission-specific statusToGem cases   |
| `tests/lib/commissions.test.ts`| Add sleeping/abandoned sort cases          |

No component changes are needed. The data flows through `statusToGem()` and
`sortCommissions()` — fixing those two functions and the CSS variables is sufficient.
`CommissionList.tsx` and `GemIndicator.tsx` are correct as written.

## Implementation Notes

- Fix the CSS values first and verify visually before touching the TypeScript. If the
  gem turns out to be amber or another base color, the rotation calculations above will
  need to be adjusted. Don't guess — open the UI and confirm.
- The `"sleeping"` test coverage gap applies to both `statusToGem` and `sortCommissions`.
  Add both before declaring the fix complete.
- Run `bun test` after each fix. The test suite will catch any regressions in the sort
  logic immediately. CSS changes need visual confirmation.
