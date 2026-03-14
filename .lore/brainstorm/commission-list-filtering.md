---
title: Commission list filtering - multi-select status checkboxes
date: 2026-03-10
status: open
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
| `blocked` | idle (0) | Maybe, depends on context | **TBD** |
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

Defaults on: `pending`, `dispatched`, `in_progress`, `sleeping`, `active`, `failed`, `cancelled`

Defaults off: `blocked`, `paused`, `abandoned`, `completed`

The logic: if you might need to act on it (run it, watch it, retry it, re-dispatch it), it's on by default. If it's terminal or deliberately parked, it's off. This means opening the commission list immediately shows you what matters.

## Open Questions

1. **`blocked` default**: The original brainstorm grouped `blocked` with `paused` as "off by default." PR #103 moved `blocked` into the same artifact sort group as `failed` and `cancelled` (group 2, "Closed negative"), which signals the system now treats `blocked` as something that needs attention, not something parked. That strengthens the case for defaulting `blocked` to on. `paused` stays off (deliberately parked, unchanged in both maps). Your call on `blocked`.

2. **Checkbox layout**: Ten checkboxes is a lot for a filter bar. Options:
   - Flat row of checkboxes (wraps on narrow screens, but all visible)
   - Two rows: "Show:" row with actionable defaults, "Also show:" row with terminal/parked
   - Group checkboxes by sort group with sub-headers (Idle / Active / Failed / Done)
   - Compact: checkboxes use the same `StatusBadge` gems as visual shorthand, no text labels needed if the gems are recognizable. This option got stronger after PR #103, since `statusToGem()` now covers all commission statuses correctly and the gems are visually distinct across all five groups.

3. **"All" / "None" / "Reset" toggles**: Useful? An "All" toggle shows everything (equivalent to no filter). A "Reset" returns to defaults. Probably worth having at least "Reset to defaults" since once you start toggling, getting back to the useful default set takes multiple clicks.

4. **Count display**: Show counts next to each checkbox? e.g., `[x] in_progress (2)`. Answers "how many?" without toggling. Costs horizontal space.

## Implementation Shape

`CommissionList` is currently a server component (`web/components/commission/CommissionList.tsx`). Adding checkboxes means converting to a client component (`"use client"` + `useState` for the selected set). The data is already passed as `CommissionMeta[]` props from the project page, so filtering is a client-side array filter. No server changes needed.

The `status` field on `CommissionMeta` is a plain `string` (not a union type), so the filter logic is just `Set<string>.has(commission.status)`.

State type: `Set<string>` initialized with the default-on statuses.

## Not in Scope

- URL param persistence for filter state (nice to have, not blocking)
- Text search (different problem, layer later)
- Pagination / virtual scroll (80 items is fine for the DOM)
- Group headers or collapsible sections (could complement checkboxes later)
