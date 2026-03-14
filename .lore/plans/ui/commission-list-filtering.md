---
title: Commission List Filtering by Status
date: 2026-03-14
status: draft
tags: [ux, commissions, filtering, ui, client-component]
modules: [web/components/commission/CommissionList]
related:
  - .lore/specs/ui/commission-list-filtering.md
  - .lore/brainstorm/commission-list-filtering.md
---

# Plan: Commission List Filtering by Status

## Goal

Add a multi-select status filter to `CommissionList` so users can answer "what needs attention?" without scanning 80+ items. The filter is entirely client-side. No server changes.

## Codebase Context

**Starting point:**

`web/components/commission/CommissionList.tsx` is a server component (no `"use client"` directive). It receives `CommissionMeta[]` as props, already sorted by `sortCommissions()` before being passed from the project page. It renders an empty state if the list is empty, otherwise a `<Panel size="lg">` wrapping a `<ul>` of commission rows.

`lib/commissions.ts:248-260`: `STATUS_GROUP` defines the four commission sort groups and the 11 statuses that belong to them. The filter panel groups checkboxes by these same four groups (Idle, Active, Failed, Done). This is the commission-specific map and is distinct from `ARTIFACT_STATUS_GROUP` in `lib/types.ts`.

`statusToGem()` in `lib/types.ts:310-327` derives gem colors from `ARTIFACT_STATUS_GROUP`, not from the commission sort groups. A `blocked` commission gets a red gem (group 2 in artifact sorting) even though it sits in the Idle commission sort group (group 0). Both behaviors are correct and intentional.

`StatusBadge` (`web/components/ui/StatusBadge.tsx`) takes `gem: GemStatus` and `label: string`. It renders `GemIndicator` (the colored dot) alongside `formatStatus(label)` (which title-cases underscored status strings). This is the canonical status renderer; the filter checkboxes use it for visual consistency between the filter and the list.

**What changes:**

- `web/components/commission/CommissionList.tsx` — convert to client component, add filter state and filter panel
- `web/components/commission/CommissionList.module.css` — add styles for the filter panel
- `tests/components/commission-list.test.tsx` — new file; unit tests for the filter logic (see Step 4 below)

**What does not change:**

- `lib/commissions.ts` — no modifications
- `lib/types.ts` — no modifications
- `web/app/projects/[name]/page.tsx` — passes `CommissionMeta[]` unchanged; server boundary is unaffected
- All other server components, API routes, and daemon code

## Implementation Steps

### Step 1: Extract pure filter logic into testable functions

**Files:** `web/components/commission/CommissionList.tsx` (authored as standalone functions at the top of the file, before the component)
**REQ IDs:** REQ-CFILTER-2, REQ-CFILTER-3, REQ-CFILTER-4, REQ-CFILTER-8, REQ-CFILTER-10, REQ-CFILTER-13
**Risk:** Low. Pure functions, no side effects.

Write the filter logic as pure, exported-for-testing functions before converting the component. Testing them in isolation catches correctness issues before any UI wiring.

Four functions are needed:

**`DEFAULT_STATUSES`** — a `Set<string>` constant with the 8 default-on statuses: `pending`, `blocked`, `dispatched`, `in_progress`, `sleeping`, `active`, `failed`, `cancelled`.

**`FILTER_GROUPS`** — a constant that encodes the filter panel structure: an ordered array of `{ label: string, statuses: string[] }` objects, mirroring the four commission sort groups in `STATUS_GROUP`:

```
[
  { label: "Idle",   statuses: ["pending", "blocked", "paused"] },
  { label: "Active", statuses: ["dispatched", "in_progress", "sleeping", "active"] },
  { label: "Failed", statuses: ["failed", "cancelled"] },
  { label: "Done",   statuses: ["abandoned", "completed"] },
]
```

This constant is derived from reading `lib/commissions.ts:248-260` directly. Group order matches the STATUS_GROUP numeric values (0 → 1 → 2 → 3).

**`filterCommissions(commissions: CommissionMeta[], selected: Set<string>): CommissionMeta[]`** — returns `commissions.filter(c => selected.has(c.status))`. Preserves sort order of the input array.

**`countByStatus(commissions: CommissionMeta[]): Record<string, number>`** — builds a count map from the input array. For each commission, increments `counts[commission.status]`. Returns the map. Used to render count annotations on checkbox labels.

**`isDefaultSelection(selected: Set<string>): boolean`** — returns `true` if `selected` has the same members as `DEFAULT_STATUSES` (same size, every member of `selected` is in `DEFAULT_STATUSES`, and vice versa). Used to determine whether to show the "Reset" button.

Export `DEFAULT_STATUSES`, `FILTER_GROUPS`, `filterCommissions`, `countByStatus`, and `isDefaultSelection` so tests can import them directly without rendering the component.

**Label map:** Add a `STATUS_LABELS: Record<string, string>` constant mapping each of the 11 statuses to its human-readable form per REQ-CFILTER-14. Even though `formatStatus()` from `lib/types.ts` would produce the same strings, an explicit map avoids implicit dependency on `formatStatus`'s underscore-splitting behavior and makes the label set authoritative and auditable.

### Step 2: Convert component to client, add filter state, render filtered list

**Files:** `web/components/commission/CommissionList.tsx`
**REQ IDs:** REQ-CFILTER-1, REQ-CFILTER-2, REQ-CFILTER-10, REQ-CFILTER-11, REQ-CFILTER-12
**Risk:** Low. The component already receives all data as props. Adding `"use client"` and `useState` does not affect the server boundary or the data flow.

Changes:

1. Add `"use client"` as the first line of the file.
2. Add `import { useState } from "react"`.
3. Inside the component, initialize filter state: `const [selected, setSelected] = useState<Set<string>>(() => new Set(DEFAULT_STATUSES))`. The lazy initializer prevents re-creating the `Set` on every render.
4. Replace the current `commissions.length === 0` early return with a check that also accounts for the filtered-out case (see below).
5. Compute the filtered list: `const filtered = filterCommissions(commissions, selected)`.
6. The `commissions.length === 0` early return stays at the top (REQ-CFILTER-12: no filter panel when there are no commissions at all).
7. For the non-empty case, render the filter panel above the commission list (Step 3 below).
8. Replace the `<ul>` contents with `filtered.map(...)` instead of `commissions.map(...)`.
9. When `filtered.length === 0` but `commissions.length > 0`, render `<EmptyState message="No commissions match the current filter." />` inside the `<Panel>` in place of the `<ul>` (REQ-CFILTER-11).

The `truncate`, `formatTimestamp`, and commission row JSX are unchanged.

### Step 3: Render the filter panel

**Files:** `web/components/commission/CommissionList.tsx`, `web/components/commission/CommissionList.module.css`
**REQ IDs:** REQ-CFILTER-5, REQ-CFILTER-6, REQ-CFILTER-7, REQ-CFILTER-8, REQ-CFILTER-9
**Risk:** Low. Additive. No existing rendering logic is touched.

The filter panel renders above the `<Panel size="lg">` list wrapper (or inside a wrapping fragment that includes both). Structure:

```
<div className={styles.filterPanel}>
  {FILTER_GROUPS.map(({ label, statuses }) => (
    <div key={label} className={styles.filterRow}>
      <span className={styles.filterGroupLabel}>{label}</span>
      <div className={styles.filterCheckboxes}>
        {statuses.map((status) => {
          const count = counts[status] ?? 0;
          const gem = statusToGem(status);
          return (
            <label key={status} className={styles.filterCheckbox}>
              <input
                type="checkbox"
                checked={selected.has(status)}
                onChange={() => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(status)) next.delete(status);
                    else next.add(status);
                    return next;
                  });
                }}
              />
              <StatusBadge gem={gem} label={status} size="sm" />
              {count > 0 && (
                <span className={styles.filterCount}>({count})</span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  ))}
  {!isDefaultSelection(selected) && (
    <div className={styles.filterReset}>
      <button
        className={styles.resetButton}
        onClick={() => setSelected(new Set(DEFAULT_STATUSES))}
      >
        Reset
      </button>
    </div>
  )}
</div>
```

The `counts` value is computed once before the JSX: `const counts = countByStatus(commissions)`.

Compute `countByStatus` from `commissions` (the full unfiltered prop), not from `filtered`. Count annotations always reflect the full list regardless of current filter state.

**CSS additions to `CommissionList.module.css`:**

Add `.filterPanel`, `.filterRow`, `.filterGroupLabel`, `.filterCheckboxes`, `.filterCheckbox`, `.filterCount`, `.filterReset`, and `.resetButton`. Design targets:

- `.filterPanel` — bottom border or padding to separate visually from the commission list; margin-bottom before the list
- `.filterRow` — `display: flex`, `align-items: center`, small `gap`
- `.filterGroupLabel` — fixed minimum width (e.g., `5rem`) so checkbox columns align across rows; `font-size: 0.8rem`, `color: var(--color-text-muted)`, `text-transform: uppercase`, `letter-spacing: 0.05em` — consistent with the `.recurringLabel` treatment
- `.filterCheckboxes` — `display: flex`, `flex-wrap: wrap`, `gap: var(--space-sm)`
- `.filterCheckbox` — `display: flex`, `align-items: center`, `gap: 4px`, `cursor: pointer`, `font-size: 0.85rem`; the native `<input type="checkbox">` is left as-is (no custom checkbox styling is needed to match the gem-based aesthetic)
- `.filterCount` — `color: var(--color-text-muted)`, `font-size: 0.8rem`
- `.filterReset` — `display: flex`, `justify-content: flex-end`, `margin-top: var(--space-xs)`
- `.resetButton` — minimal: `background: none`, `border: none`, `cursor: pointer`, `color: var(--color-brass)`, `font-size: 0.85rem`; hover underline

### Step 4: Unit tests

**Files:** `tests/components/commission-list.test.tsx` (new)
**REQ IDs:** AI Validation (custom), REQ-CFILTER-2 through REQ-CFILTER-11
**Risk:** None. New test file.

Tests cover the pure logic functions extracted in Step 1. No component rendering is required; import the functions directly.

**`DEFAULT_STATUSES` tests:**
- Default set contains exactly 8 members.
- All 8 expected statuses (`pending`, `blocked`, `dispatched`, `in_progress`, `sleeping`, `active`, `failed`, `cancelled`) are present.
- None of the 3 default-off statuses (`paused`, `abandoned`, `completed`) appears in the set.

**`filterCommissions` tests:**
- Returns only commissions whose `status` is in the selected set.
- Preserves input order when filtering.
- Returns empty array when selected set is empty.
- Returns all commissions when all statuses are selected.
- A commission with an unrecognized status is excluded when that status is not in the selected set.

**`countByStatus` tests:**
- Returns `0` (or key absent) for a status with no commissions in the list.
- Returns the correct count for each status when multiple commissions share a status.
- An empty commission list returns an empty object.

**`isDefaultSelection` tests:**
- Returns `true` when the set exactly matches `DEFAULT_STATUSES`.
- Returns `false` when one default-on status is removed.
- Returns `false` when a default-off status is added.
- Returns `false` for an empty set.
- Returns `false` for a set containing all 11 statuses.

Use a minimal `CommissionMeta` factory helper to avoid repeating the full 18-field type in every test case:

```typescript
function makeCommission(status: string): CommissionMeta {
  return {
    commissionId: `commission-${status}`,
    title: "",
    status,
    type: "one-shot",
    sourceSchedule: "",
    worker: "",
    workerDisplayTitle: "",
    prompt: "",
    dependencies: [],
    linked_artifacts: [],
    resource_overrides: {},
    current_progress: "",
    result_summary: "",
    projectName: "test",
    date: "2026-01-01",
    relevantDate: "2026-01-01",
  };
}
```

### Step 5: Run tests and full suite

**Files:** None (verification)
**Risk:** None.

Run `bun test tests/components/commission-list.test.tsx` to confirm the new unit tests pass.

Run `bun test` (full suite) to confirm no regressions. The conversion to a client component does not affect server-side rendering or any other component.

### Step 6: Code review

**Files:** All changed files
**Risk:** None (verification step).

Launch a code-reviewer sub-agent with fresh context to verify:

1. `"use client"` is the first line and no server-only imports (e.g., `node:fs`) are in the file.
2. Filter logic is fully self-contained in the pure functions (no logic in JSX callbacks beyond calling the functions).
3. Count annotations are computed from the full `commissions` prop, not from the filtered result.
4. The "Reset" button is absent when state matches defaults; present when it differs.
5. The filter panel does not render when `commissions.length === 0`.
6. The "no match" empty state message is distinct from the "no commissions" empty state.
7. CSS class names follow the existing conventions in `CommissionList.module.css` (kebab-case, consistent with existing patterns).
8. No new imports from `node:` modules.

## Delegation Guide

All six steps are for a single implementation agent. The step boundaries are natural checkpoints, not parallel work streams. Steps 1-2 are pure TypeScript (no rendering concerns); Step 3 is JSX + CSS; Steps 4-6 are testing and review.

| After Step | Reviewer | Focus |
|-----------|----------|-------|
| Step 4 | Self (run tests) | All unit tests green before touching the browser |
| Step 6 | code-reviewer sub-agent | Fresh eyes on client-component constraints and filter correctness |

## Open Questions

None. All design decisions are resolved in the spec and brainstorm. The `blocked` default-on question, the gem color vs. sort group divergence, and the Reset visibility rule are all documented in the spec.
