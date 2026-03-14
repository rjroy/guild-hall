---
title: Commission list filtering - multi-select status checkboxes
date: 2026-03-10
status: resolved
tags: [ux, commissions, filtering, ui]
modules: [web/components/commission/CommissionList]
related:
  - .lore/issues/commission-list-no-filtering.md
  - .lore/specs/ui/guild-hall-views.md
  - .lore/specs/ui/artifact-sorting.md
---

# Brainstorm: Commission List Filtering

## Problem

The commission list is a flat chronological dump of every commission ever created. At 80+ items, finding what's actionable requires scrolling through completed work that dominates by volume. The two common questions ("what's running?" and "did anything fail?") shouldn't require scanning.

## Approach: Multi-Select Status Checkboxes

Not tabs (exclusive selection). A checkbox list where each status is independently togglable. This lets you see "in_progress + sleeping + failed" simultaneously, which tabs can't do. The default selection answers "what needs attention?" without any clicks.

## All Statuses (from `lib/commissions.ts:248-260`)

The commission-specific `STATUS_GROUP` map defines 10 statuses across 4 sort groups. This is separate from `ARTIFACT_STATUS_GROUP` in `lib/types.ts:72-107`, which uses a 5-group model for general artifact browsing (see "Sorting context" below).

| Status | Sort Group | Actionable? | Default On? |
|--------|-----------|-------------|-------------|
| `pending` | idle (0) | Yes, waiting to dispatch | Yes |
| `blocked` | idle (0) | Yes, needs attention | Yes |
| `paused` | idle (0) | Maybe, deliberately paused | No |
| `dispatched` | active (1) | Yes, just sent | Yes |
| `in_progress` | active (1) | Yes, actively running | Yes |
| `sleeping` | active (1) | Yes, will resume | Yes |
| `active` | active (1) | Yes, running | Yes |
| `failed` | failed (2) | Yes, needs attention | Yes |
| `cancelled` | failed (2) | Yes, might need re-dispatch | Yes |
| `abandoned` | done (3) | No | No |
| `completed` | done (3) | No | No |

### Sorting context: two status maps, one UI

PR #103 (2026-03-11) introduced `ARTIFACT_STATUS_GROUP` in `lib/types.ts:72-107` with a 5-group model for general artifact sorting and gem color mapping. That map reorganized `blocked` into group 2 ("Closed negative," alongside `failed` and `cancelled`) and kept `paused` in group 0 ("Active work"). It also added a 5th group (Inactive) for `abandoned`, `wontfix`, `declined`, etc.

The commission-specific `STATUS_GROUP` in `lib/commissions.ts:248-260` was not changed. It still uses the original 4-group model where `blocked` is idle (group 0) and `abandoned` shares group 3 with `completed`.

This matters for filtering because `statusToGem()` now derives from `ARTIFACT_STATUS_GROUP`, not the commission sort groups. A `blocked` commission renders with a red/blocked gem (group 2 in artifact sorting) but sorts in the idle group (group 0 in commission sorting). The filter UI should group by commission sort groups (that's what determines list order), but the gem colors will follow the artifact status map. This is fine as long as the filter checkboxes use `StatusBadge` for visual consistency, since the gem already renders correctly for each status.

## Default Selection

Defaults on: `pending`, `blocked`, `dispatched`, `in_progress`, `sleeping`, `active`, `failed`, `cancelled`

Defaults off: `paused`, `abandoned`, `completed`

The logic: if you might need to act on it (run it, watch it, retry it, re-dispatch it), it's on by default. `blocked` defaults on because PR #103 reclassified it as "needs attention" (same artifact group as `failed` and `cancelled`), and a blocked commission is something you want to know about, not something deliberately parked. `paused` stays off (deliberately parked by the user). Terminal statuses (`abandoned`, `completed`) are off because they're history, not action items.

## Resolved Questions

1. **`blocked` default**: **On.** PR #103 reclassified `blocked` as "needs attention" (artifact sort group 2, alongside `failed` and `cancelled`). A blocked commission is something you want to see, not something you parked.

2. **Checkbox layout**: **Grouped by sort group, gem+label checkboxes, one row per group.** Gem-only was ruled out because 10 statuses map to only 5 gem colors (`GemIndicator` has `pending`, `active`, `blocked`, `info`, `inactive`), so statuses like `pending`/`paused` or `dispatched`/`in_progress` would be visually identical without labels. Flat row of 10 is too wide. Grouping by the commission sort groups (Idle / Active / Failed / Done) gives semantic structure, keeps each row to 2-4 items, and the group labels teach users how commissions sort in the list below.

   ```
   Idle:    [x] Pending   [x] Blocked   [ ] Paused
   Active:  [x] Dispatched  [x] In Progress  [x] Sleeping  [x] Active
   Failed:  [x] Failed   [x] Cancelled
   Done:    [ ] Abandoned  [ ] Completed
                                             [Reset]
   ```

3. **Reset toggle**: **Yes.** A "Reset" link returns checkboxes to defaults. Once you start toggling, getting back to the useful default set takes multiple clicks without it.

4. **Count display**: **Yes.** Show count after each label, e.g., `In Progress (2)`. Only display counts for statuses with at least one commission, so zeroes don't add visual noise.

## Implementation Shape

`CommissionList` is currently a server component (`web/components/commission/CommissionList.tsx`). Adding checkboxes means converting to a client component (`"use client"` + `useState` for the selected set). The data is already passed as `CommissionMeta[]` props from the project page, so filtering is a client-side array filter. No server changes needed.

The `status` field on `CommissionMeta` is a plain `string` (not a union type), so the filter logic is just `Set<string>.has(commission.status)`.

State type: `Set<string>` initialized with the default-on statuses.

## Not in Scope

- URL param persistence for filter state (nice to have, not blocking)
- Text search (different problem, layer later)
- Pagination / virtual scroll (80 items is fine for the DOM)
- Group headers or collapsible sections (could complement checkboxes later)
