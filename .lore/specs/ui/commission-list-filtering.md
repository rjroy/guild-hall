---
title: Commission list filtering by status
date: 2026-03-14
status: implemented
tags: [ux, commissions, filtering, ui, client-component]
modules: [web/components/commission/CommissionList]
related:
  - .lore/brainstorm/commission-list-filtering.md
  - .lore/issues/commission-list-no-filtering.md
  - .lore/specs/ui/guild-hall-views.md
  - .lore/specs/ui/artifact-sorting.md
req-prefix: CFILTER
---

# Spec: Commission List Filtering by Status

## Overview

The commission list is a flat chronological-ish dump of every commission ever created. At volume (80+ items), completed work dominates and the actionable items — things running, blocked, or failed — require scanning to find. This spec adds a multi-select status filter that answers "what needs attention?" by default, without any clicks from the user.

The filter lives entirely in the client. `CommissionMeta[]` is already passed as props from the project page; filtering is a client-side array operation against that prop. No server changes are needed.

## Entry Points

One surface: the Commissions tab on the project page (`/projects/[name]`), rendered by `web/components/commission/CommissionList.tsx`. The filter panel appears at the top of this component, above the commission list.

## Requirements

### Component conversion

- REQ-CFILTER-1: `CommissionList` becomes a client component. Add `"use client"` at the top of `web/components/commission/CommissionList.tsx`.

  **Rationale:** Checkbox state (`Set<string>`) requires `useState`. The component currently receives `CommissionMeta[]` as props from the server-side project page; that boundary is unchanged. The server page continues to pass the full unsorted list; the client component handles filtering and renders the result.

### Filter state

- REQ-CFILTER-2: Filter state is a `Set<string>` of selected statuses, managed with `useState`. The initial value is the default-on set defined in REQ-CFILTER-3.

- REQ-CFILTER-3: The default-on statuses are: `pending`, `blocked`, `dispatched`, `in_progress`, `sleeping`, `active`, `failed`, `cancelled`. The default-off statuses are: `paused`, `abandoned`, `completed`.

  **Default-on rationale:** Any status where the user might need to act — dispatch it, watch it, retry it, or investigate it — is on by default. `blocked` is on because PR #103 reclassified it as "needs attention" (same artifact sort group as `failed` and `cancelled`). `paused` is off (deliberately parked). `abandoned` and `completed` are off (terminal; historical record, not action items).

- REQ-CFILTER-4: A "Reset" button (or link) restores filter state to the defaults defined in REQ-CFILTER-3. "Reset" is only shown when the current state differs from the defaults. Once state matches defaults exactly, "Reset" disappears.

  **Rationale:** Users who toggle the filter need a one-click way back to the useful default. Showing "Reset" only when needed avoids persistent visual noise when the filter is already at defaults.

### Filter panel layout

- REQ-CFILTER-5: The filter panel renders above the commission list. It groups checkboxes by commission sort group, matching the four groups defined in `STATUS_GROUP` in `lib/commissions.ts:248-260`: Idle (group 0), Active (group 1), Failed (group 2), Done (group 3).

- REQ-CFILTER-6: Each group renders as a labeled row. The group label appears on the left; its checkboxes appear to the right. Groups render in ascending group order (Idle, Active, Failed, Done).

  ```
  Idle:    [x] Pending   [x] Blocked   [ ] Paused
  Active:  [x] Dispatched  [x] In Progress  [x] Sleeping  [x] Active
  Failed:  [x] Failed   [x] Cancelled
  Done:    [ ] Abandoned  [ ] Completed
                                              [Reset]
  ```

- REQ-CFILTER-7: Each checkbox uses `StatusBadge` (or a gem indicator consistent with `StatusBadge`) for the status gem, followed by the human-readable status label. Gem colors follow `statusToGem()` from `lib/types.ts`, which derives from `ARTIFACT_STATUS_GROUP`. A `blocked` commission renders with a red gem (blocked artifact sort group) even though it sorts in the Idle commission sort group. This is correct behavior.

  **Rationale:** `StatusBadge` is the canonical status renderer. Using it in the filter ensures gem colors in the filter match gem colors in the list below.

- REQ-CFILTER-8: Each checkbox label includes a count of commissions with that status in the current `commissions` prop (the unfiltered full list), displayed as `Label (N)`. The count annotation is only shown when N > 0. When N is 0, the label renders without any count annotation.

  **Rationale:** Zero counts are visual noise. The checkbox still renders (the user might want to filter to "only completed" even if there are none, though that produces an empty list). The count tells the user what they'll see when they toggle.

- REQ-CFILTER-9: The "Reset" button (when visible per REQ-CFILTER-4) renders at the bottom-right of the filter panel.

### Filtering behavior

- REQ-CFILTER-10: The commission list renders only commissions whose `status` field is in the selected set. Filtering is a client-side array operation: `commissions.filter(c => selectedStatuses.has(c.status))`. Sort order of the filtered result matches the sort order of the input `commissions` prop (pre-sorted by `sortCommissions()`).

- REQ-CFILTER-11: When the filtered list is empty but `commissions` is non-empty (the user has filtered everything out), render an empty state message that distinguishes filtering from absence. Use a message such as "No commissions match the current filter." rather than the existing "No commissions yet."

- REQ-CFILTER-12: When `commissions` is empty (no commissions exist for the project), the filter panel does not render. The existing "No commissions yet." empty state renders directly, unchanged.

  **Rationale:** A filter with no data to filter is dead UI. The pre-existing empty state is correct and sufficient.

### Status vocabulary

- REQ-CFILTER-13: The filter renders checkboxes for all 11 statuses defined in `STATUS_GROUP` (`lib/commissions.ts:248-260`): `pending`, `blocked`, `paused` (Idle); `dispatched`, `in_progress`, `sleeping`, `active` (Active); `failed`, `cancelled` (Failed); `abandoned`, `completed` (Done). No other statuses are represented in the filter panel.

  **Rationale:** The filter covers the defined commission status vocabulary. Commissions with an unrecognized status (malformed frontmatter) would not appear under any checkbox; they are excluded from the filtered list when any filter is active. This is acceptable because unrecognized statuses are not a normal condition.

- REQ-CFILTER-14: Human-readable labels for each status are:

  | Status | Label |
  |--------|-------|
  | `pending` | Pending |
  | `blocked` | Blocked |
  | `paused` | Paused |
  | `dispatched` | Dispatched |
  | `in_progress` | In Progress |
  | `sleeping` | Sleeping |
  | `active` | Active |
  | `failed` | Failed |
  | `cancelled` | Cancelled |
  | `abandoned` | Abandoned |
  | `completed` | Completed |

## Exit Points

| Exit | Target | Notes |
|------|--------|-------|
| Commission row click | Commission detail view | Existing behavior, unchanged |

## Success Criteria

- [ ] Filter panel renders above the commission list when commissions exist
- [ ] Checkboxes are grouped into four labeled rows (Idle / Active / Failed / Done)
- [ ] Each checkbox shows a gem consistent with `statusToGem()` for that status
- [ ] Default selection has 8 statuses on (`pending`, `blocked`, `dispatched`, `in_progress`, `sleeping`, `active`, `failed`, `cancelled`) and 3 off (`paused`, `abandoned`, `completed`)
- [ ] Count annotations appear next to status labels only when count > 0
- [ ] Toggling a checkbox immediately shows/hides matching commissions
- [ ] Selecting all of a group (e.g., all "Done" statuses) shows historical commissions in the list
- [ ] Deselecting all statuses shows the "no match" empty state, not "no commissions"
- [ ] "Reset" button appears when state differs from defaults, disappears when state matches defaults
- [ ] Clicking "Reset" restores the default-on set in one click
- [ ] Filter panel does not render when there are no commissions for the project
- [ ] No server-side changes required; project page passes `CommissionMeta[]` unchanged

## AI Validation

**Defaults apply:**
- Unit tests with dependency injection
- 90%+ coverage on new logic
- Code review by fresh-context sub-agent

**Custom:**
- Unit test: default state equals the 8-status on-set from REQ-CFILTER-3; verify no status from the default-off list appears in the initial `Set`.
- Unit test: filtering an array of `CommissionMeta` against a `Set` with specific statuses returns only matching items.
- Unit test: count computation returns 0 for a status not present in the list; count annotation is not rendered for that status.
- Unit test: "Reset" visibility — returns `true` when selected set differs from defaults, `false` when identical.
- Manual: toggle all "Done" statuses on; confirm `abandoned` and `completed` commissions appear in list and match the count annotations.
- Manual: deselect every checkbox; confirm the "no match" empty state message appears (not "no commissions yet").

## Constraints

- Client-side only. No API calls, no server changes. The full `CommissionMeta[]` list continues to be loaded server-side and passed as props.
- Filter state is ephemeral (in-memory `useState`). URL parameter persistence is explicitly out of scope.
- `CommissionMeta.status` is a plain `string`, not a union type (`lib/commissions.ts:22`). The `Set<string>` filter is `Set.has(commission.status)` with no type casting needed.
- Gem colors in the filter follow `statusToGem()` (from `ARTIFACT_STATUS_GROUP`). They do not need to match commission sort groups. A `blocked` commission shows a red gem in both the filter and the list. This is correct per the brainstorm's sorting context note.
- Text search, pagination, virtual scroll, group headers, and collapsible sections are out of scope.
- URL param persistence of filter state is out of scope.

## Context

- [Brainstorm: Commission List Filtering](./../brainstorm/commission-list-filtering.md): source of all design decisions in this spec. The brainstorm documents alternatives considered (tabs, gem-only checkboxes, flat row of 10) and why multi-select grouped checkboxes won.
- [Issue: Commission list has no filtering](./../issues/commission-list-no-filtering.md): the problem this spec addresses.
- `lib/commissions.ts:248-260`: `STATUS_GROUP` defines the four sort groups and which statuses belong to each. The filter panel's grouping mirrors this map.
- `lib/types.ts`: `statusToGem()` and `ARTIFACT_STATUS_GROUP` drive gem colors. Note that `blocked` maps to the "closed negative" gem group (red) in the artifact map, but to the idle sort group (0) in the commission map. The filter groups by commission sort group; gem colors follow the artifact map. Both are correct.
- PR #103 (2026-03-11): reclassified `blocked` from a neutral parked state to "needs attention," aligning it with `failed` and `cancelled` in the artifact sort model. This is why `blocked` defaults on despite being in the Idle commission sort group.
