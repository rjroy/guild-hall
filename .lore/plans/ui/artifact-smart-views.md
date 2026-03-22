---
title: Artifact Smart Views
date: 2026-03-21
status: approved
tags: [ui, artifacts, navigation, filtering, smart-views, gem-mapping]
modules: [artifact-browser, artifact-list, artifact-grouping, lib/types]
related:
  - .lore/specs/ui/artifact-smart-views.md
  - .lore/specs/ui/artifact-sorting.md
  - .lore/plans/ui/commission-list-filtering.md
---

# Plan: Artifact Smart Views

## Goal

Replace the artifact tree as the default landing in the artifacts tab with a smart view that answers three workflow questions: "What's next?", "What deserves more thought?", and "Where's the work I can commission forward?" The existing tree survives as a secondary mode via sub-tab. Along the way, correct the gem mapping for `approved` from active (green) to pending (orange).

## Codebase Context

**Starting point:**

`web/app/projects/[name]/page.tsx:60-70` renders the artifacts tab. It passes `Artifact[]` to `ArtifactList`, which builds a tree and renders it. `ArtifactList` is already a client component (`"use client"` at line 1) because it manages expand/collapse state.

`lib/types.ts:81-116`: `ARTIFACT_STATUS_GROUP` defines five status groups. `approved` is currently in Group 1 (in progress/green). `statusToGem()` at line 316 derives gem colors from this map. `statusToPriority()` at line 307 is used by `compareArtifactsByStatusAndTitle()` at line 409 for sorting.

`lib/artifact-grouping.ts`: `buildArtifactTree()` builds the tree structure. `displayTitle()` at line 26 derives display names. `groupKey()` at line 8 extracts the first path segment.

`web/components/commission/CommissionFilterPanel.tsx` and `web/components/commission/commission-filter.ts` established the filter-with-counts pattern. Smart view filters follow a similar visual approach but use single-select (radio-like) instead of multi-select checkboxes.

`web/components/ui/StatusBadge.tsx` renders `GemIndicator` + `formatStatus()`. Already used in `ArtifactList` for tree leaf items.

**What changes:**

- `lib/types.ts` — move `approved` from Group 1 to Group 0 in `ARTIFACT_STATUS_GROUP`
- `web/components/project/ArtifactList.tsx` — wrap existing tree in a sub-tab container, add smart view as default
- `web/components/project/ArtifactList.module.css` — new styles for sub-tabs, smart view items, and filter buttons
- `lib/artifact-smart-view.ts` — new file; pure filter/mapping functions for smart views
- `tests/lib/artifact-smart-view.test.ts` — new file; unit tests for the filter logic
- `tests/lib/types.test.ts` — add test for `approved` gem mapping change
- `.lore/specs/ui/artifact-sorting.md` — update REQ-SORT-4 status group table per REQ-SMARTVIEW-19

**What does not change:**

- `lib/artifact-grouping.ts` — tree building and sorting logic untouched
- `web/app/projects/[name]/page.tsx` — continues to pass `Artifact[]` to `ArtifactList`; server boundary unaffected
- Daemon, API routes, and all other components
- Tree view behavior (display, expand/collapse, sorting)

## Implementation Steps

### Step 1: Gem mapping correction

**Files:** `lib/types.ts`
**REQ IDs:** REQ-SMARTVIEW-17, REQ-SMARTVIEW-18
**Risk:** Low. Single line change. All callers of `statusToGem()` and `statusToPriority()` propagate automatically.

Move `approved` from Group 1 to Group 0 in `ARTIFACT_STATUS_GROUP`:

```typescript
// In ARTIFACT_STATUS_GROUP (lib/types.ts:81-116)
// Move this line from the Group 1 block:
//   approved: 1,
// To the Group 0 block:
//   approved: 0,
```

After this change:
- `statusToGem("approved")` returns `"pending"` (orange) instead of `"active"` (green)
- `statusToPriority("approved")` returns `0` instead of `1`, so approved artifacts sort earlier
- All surfaces (tree view, dashboard, commission linked artifacts) reflect the change automatically

**Test update (same step):** Update `tests/lib/types.test.ts` to reflect the gem change. Two assertions need updating:
- Line 8: change `["approved", "active"]` to `["approved", "pending"]` in the `statusToGem` test cases
- Line 61: change `expect(statusToGem("  approved  ")).toBe("active")` to `.toBe("pending")` in the whitespace trim test

### Step 2: Update artifact-sorting spec

**Files:** `.lore/specs/ui/artifact-sorting.md`
**REQ IDs:** REQ-SMARTVIEW-19
**Risk:** None. Documentation change only.

In the REQ-SORT-4 status group table, move `approved` from the "In progress" row (Group 1) to the "Active work" row (Group 0). The table currently reads:

```
| Active work | 0 | draft, open, pending, requested, blocked, queued | pending (amber) |
| In progress | 1 | approved, active, current, in_progress, dispatched | active (green) |
```

After correction:

```
| Active work | 0 | draft, open, pending, requested, approved, queued | pending (amber) |
| In progress | 1 | active, current, in_progress, dispatched | active (green) |
```

Note: The current implementation has `blocked` in Group 2 (closed negative), not Group 0 as the sorting spec's table says. The implementation is correct (blocked moved in PR #103); the sorting spec table was already stale. This plan does not fix that unrelated staleness to avoid scope creep. File an issue if desired.

Also note: The current `ARTIFACT_STATUS_GROUP` has `paused` in Group 0, while the sorting spec table has it in Group 0 as well. Both match. The smart view spec's REQ-SMARTVIEW-6 references "ARTIFACT_STATUS_GROUP 0" and "ARTIFACT_STATUS_GROUP 2" using the actual code values, which is what matters.

### Step 3: Extract smart view filter logic

**Files:** `lib/artifact-smart-view.ts` (new)
**REQ IDs:** REQ-SMARTVIEW-4, REQ-SMARTVIEW-6, REQ-SMARTVIEW-7, REQ-SMARTVIEW-8, REQ-SMARTVIEW-10, REQ-SMARTVIEW-12, REQ-SMARTVIEW-13, REQ-SMARTVIEW-16
**Risk:** Low. Pure functions, no side effects.

This file contains all the filtering and metadata-extraction logic for smart views. Keeping it in `lib/` (not `web/`) makes it testable without component rendering.

**Type and constants:**

```typescript
import type { Artifact } from "@/lib/types";
import { ARTIFACT_STATUS_GROUP, UNKNOWN_STATUS_PRIORITY, compareArtifactsByStatusAndTitle } from "@/lib/types";

export type SmartViewFilter = "whats-next" | "needs-discussion" | "ready-to-advance";

export const SMART_VIEW_FILTERS: { key: SmartViewFilter; label: string }[] = [
  { key: "whats-next", label: "What's Next" },
  { key: "needs-discussion", label: "Needs Discussion" },
  { key: "ready-to-advance", label: "Ready to Advance" },
];

/** Directories excluded from all smart views. These have dedicated tabs. */
const EXCLUDED_DIRECTORIES = new Set(["meetings", "commissions"]);

/** Maps first path segment to display label. REQ-SMARTVIEW-12. */
const TYPE_LABELS: Record<string, string> = {
  specs: "Spec",
  plans: "Plan",
  brainstorm: "Brainstorm",
  issues: "Issue",
  research: "Research",
  retros: "Retro",
  design: "Design",
  reference: "Reference",
  notes: "Notes",
  tasks: "Task",
  diagrams: "Diagram",
};
```

**Path parsing functions:**

```typescript
/** Returns the first path segment, or null for root-level files. */
export function artifactTypeSegment(relativePath: string): string | null {
  const slash = relativePath.indexOf("/");
  return slash === -1 ? null : relativePath.slice(0, slash);
}

/** Human-readable type label from the first path segment. REQ-SMARTVIEW-12. */
export function artifactTypeLabel(relativePath: string): string | null {
  const segment = artifactTypeSegment(relativePath);
  return segment ? (TYPE_LABELS[segment] ?? null) : null;
}

/** Domain label from the second path segment, if present. REQ-SMARTVIEW-13. */
export function artifactDomain(relativePath: string): string | null {
  const parts = relativePath.split("/");
  if (parts.length < 3) return null; // no second directory segment
  return capitalize(parts[1]);
}

// Import capitalize from lib/artifact-grouping.ts (already exported there)
import { capitalize } from "@/lib/artifact-grouping";
```

**Base exclusion filter (applied before any view filter):**

```typescript
/** Excludes meetings/, commissions/, and root-level files from smart views. */
function isSmartViewCandidate(artifact: Artifact): boolean {
  const segment = artifactTypeSegment(artifact.relativePath);
  if (segment === null) return false; // root-level files
  return !EXCLUDED_DIRECTORIES.has(segment);
}
```

**Three filter functions:**

```typescript
/**
 * "What's Next": Group 0 (pending) OR Group 2 (blocked/failed/cancelled).
 * After REQ-SMARTVIEW-17, Group 0 includes approved.
 * REQ-SMARTVIEW-6.
 */
function isWhatsNext(artifact: Artifact): boolean {
  const group = ARTIFACT_STATUS_GROUP[artifact.meta.status.toLowerCase().trim()]
    ?? UNKNOWN_STATUS_PRIORITY;
  return group === 0 || group === 2;
}

/**
 * "Needs Discussion": exploratory artifacts with active statuses.
 * brainstorms with status "open", issues with status "open",
 * research with status "active".
 * REQ-SMARTVIEW-7.
 */
function isNeedsDiscussion(artifact: Artifact): boolean {
  const segment = artifactTypeSegment(artifact.relativePath);
  const status = artifact.meta.status.toLowerCase().trim();
  if (segment === "brainstorm" && status === "open") return true;
  if (segment === "issues" && status === "open") return true;
  if (segment === "research" && status === "active") return true;
  return false;
}

/**
 * "Ready to Advance": artifacts ready for the next lifecycle stage.
 * Specs, plans, and designs with status "approved".
 * REQ-SMARTVIEW-8.
 */
function isReadyToAdvance(artifact: Artifact): boolean {
  const segment = artifactTypeSegment(artifact.relativePath);
  const status = artifact.meta.status.toLowerCase().trim();
  if (status !== "approved") return false;
  return segment === "specs" || segment === "plans" || segment === "design";
}
```

**Main filtering function:**

```typescript
/**
 * Filters artifacts for a smart view and returns them sorted.
 * REQ-SMARTVIEW-10: views are independent cuts; an artifact may appear in multiple.
 * REQ-SMARTVIEW-16: sorted by compareArtifactsByStatusAndTitle.
 */
export function filterSmartView(
  artifacts: Artifact[],
  filter: SmartViewFilter,
): Artifact[] {
  const candidates = artifacts.filter(isSmartViewCandidate);

  let predicate: (a: Artifact) => boolean;
  switch (filter) {
    case "whats-next":
      predicate = isWhatsNext;
      break;
    case "needs-discussion":
      predicate = isNeedsDiscussion;
      break;
    case "ready-to-advance":
      predicate = isReadyToAdvance;
      break;
  }

  const result = candidates.filter(predicate);
  result.sort(compareArtifactsByStatusAndTitle);
  return result;
}

/**
 * Computes badge counts for all three filters.
 * REQ-SMARTVIEW-5: counts are computed from the full artifact list at render time.
 */
export function smartViewCounts(
  artifacts: Artifact[],
): Record<SmartViewFilter, number> {
  const candidates = artifacts.filter(isSmartViewCandidate);
  return {
    "whats-next": candidates.filter(isWhatsNext).length,
    "needs-discussion": candidates.filter(isNeedsDiscussion).length,
    "ready-to-advance": candidates.filter(isReadyToAdvance).length,
  };
}
```

The four-pass approach (one for candidates, then one per filter for counts) is simple and correct for collections under 1000 items. Optimization is not needed.

### Step 4: Unit tests for filter logic

**Files:** `tests/lib/artifact-smart-view.test.ts` (new)
**REQ IDs:** AI Validation (all custom items)
**Risk:** None. New test file.

Test the pure functions from Step 3 using a minimal `Artifact` factory. The factory should accept `relativePath` and `status` as required fields, with sensible defaults for everything else:

```typescript
function makeArtifact(relativePath: string, status: string, date = "2026-01-01"): Artifact {
  return {
    relativePath,
    absolutePath: `/test/.lore/${relativePath}`,
    artifactType: "markdown",
    meta: {
      title: relativePath.split("/").pop()?.replace(".md", "") ?? "",
      date,
      status,
      tags: [],
      modules: [],
      extras: {},
    },
    lastModified: new Date(date),
  };
}
```

**Test cases:**

1. **`approved` in Group 0:** After the gem correction, `statusToPriority("approved")` returns `0`. (This tests the Step 1 change. Goes in `tests/lib/types.test.ts`.)

2. **"What's Next" includes Group 0 and Group 2:**
   - `specs/foo.md` with status `draft` (Group 0) → included
   - `specs/bar.md` with status `approved` (Group 0, after correction) → included
   - `specs/baz.md` with status `blocked` (Group 2) → included
   - `specs/qux.md` with status `failed` (Group 2) → included
   - `specs/done.md` with status `implemented` (Group 3) → excluded

3. **"Needs Discussion" precise matching:**
   - `brainstorm/idea.md` with status `open` → included
   - `brainstorm/parked.md` with status `parked` → excluded (REQ-SMARTVIEW-7 exclusion)
   - `issues/bug.md` with status `open` → included
   - `issues/fixed.md` with status `resolved` → excluded
   - `research/lib.md` with status `active` → included
   - `research/old.md` with status `archived` → excluded
   - `specs/spec.md` with status `open` → excluded (wrong directory type)

4. **"Ready to Advance" precise matching:**
   - `specs/feature.md` with status `approved` → included
   - `plans/impl.md` with status `approved` → included
   - `design/arch.md` with status `approved` → included
   - `retros/lesson.md` with status `approved` → excluded (retros aren't advanceable)
   - `specs/wip.md` with status `draft` → excluded (not approved)

5. **Cross-view membership (REQ-SMARTVIEW-10):**
   - An `approved` spec appears in both "What's Next" AND "Ready to Advance"
   - A `blocked` spec appears in "What's Next" but NOT "Needs Discussion" or "Ready to Advance"

6. **Exclusions:**
   - `meetings/session.md` with any status → excluded from all views
   - `commissions/task.md` with any status → excluded from all views
   - Root-level `README.md` → excluded from all views

7. **Informational types not surfaced:**
   - `retros/lesson.md` with status `complete` → no smart view
   - `reference/guide.md` with status `current` → no smart view
   - `diagrams/flow.md` with status `current` → no smart view

8. **Badge counts match filtered item counts:**
   - Create a fixture set spanning all directory types and statuses
   - Verify `smartViewCounts()` returns the same number as `filterSmartView().length` for each filter

9. **Path metadata extraction:**
   - `specs/infrastructure/daemon.md` → type "Spec", domain "Infrastructure"
   - `plans/ui/sorting.md` → type "Plan", domain "Ui"
   - `brainstorm/idea.md` → type "Brainstorm", domain null
   - `README.md` → type null, domain null

10. **Sorting:** Items within each view are sorted by `compareArtifactsByStatusAndTitle`. Create artifacts with different status groups and titles, verify order.

### Step 5: Smart view UI in ArtifactList

**Files:** `web/components/project/ArtifactList.tsx`, `web/components/project/ArtifactList.module.css`
**REQ IDs:** REQ-SMARTVIEW-1, REQ-SMARTVIEW-2, REQ-SMARTVIEW-3, REQ-SMARTVIEW-5, REQ-SMARTVIEW-9, REQ-SMARTVIEW-11, REQ-SMARTVIEW-14, REQ-SMARTVIEW-15
**Risk:** Medium. Restructuring the component, but the existing tree behavior is preserved by isolating it in a sub-component.

`ArtifactList` is already a client component. The changes add a sub-tab toggle and a smart view renderer alongside the existing tree.

**Component structure after changes:**

```
ArtifactList (client component)
├── SubTab toggle: "Smart View" | "Tree View"
├── if smartView:
│   ├── SmartViewFilters (three buttons with badge counts)
│   └── SmartViewItems (filtered artifact list)
└── if treeView:
    └── ArtifactTree (existing, unchanged)
```

**State additions to the top-level `ArtifactList` component:**

```typescript
const [viewMode, setViewMode] = useState<"smart" | "tree">("smart");
const [activeFilter, setActiveFilter] = useState<SmartViewFilter>("whats-next");
```

Both are ephemeral React state per REQ-SMARTVIEW-3 and REQ-SMARTVIEW-9.

**Sub-tab rendering:**

Two buttons styled as tabs, positioned above the content. Pattern follows `ProjectTabs` visual style (underline active tab) but lives inside the component, not as URL-driven navigation. The sub-tabs sit between the `artifactActions` div (CommitLoreButton) and the content.

```tsx
<div className={styles.subTabs}>
  <button
    className={`${styles.subTab} ${viewMode === "smart" ? styles.subTabActive : ""}`}
    onClick={() => setViewMode("smart")}
  >
    Smart View
  </button>
  <button
    className={`${styles.subTab} ${viewMode === "tree" ? styles.subTabActive : ""}`}
    onClick={() => setViewMode("tree")}
  >
    Tree View
  </button>
</div>
```

**Smart view filter buttons:**

Three buttons, each showing label and badge count. Single-select (clicking one activates it, deactivates the others). Styled as pill/chip buttons with the active one highlighted.

```tsx
const counts = smartViewCounts(artifacts);

<div className={styles.filterBar}>
  {SMART_VIEW_FILTERS.map(({ key, label }) => (
    <button
      key={key}
      className={`${styles.filterButton} ${activeFilter === key ? styles.filterButtonActive : ""}`}
      onClick={() => setActiveFilter(key)}
    >
      {label}
      <span className={styles.filterBadge}>{counts[key]}</span>
    </button>
  ))}
</div>
```

**Smart view item rendering:**

Each item is a clickable row linking to the artifact detail page. Shows: title, status gem (via `StatusBadge`), type label, domain label (if present), and date. Two-row layout: title + gem on the first line, metadata (type, domain, date) on the second.

```tsx
const filtered = filterSmartView(artifacts, activeFilter);

{filtered.length === 0 ? (
  <Panel>
    <EmptyState message="No artifacts match this view." />
  </Panel>
) : (
  <Panel size="lg">
    <ul className={styles.smartList}>
      {filtered.map((artifact) => {
        const typeLabel = artifactTypeLabel(artifact.relativePath);
        const domain = artifactDomain(artifact.relativePath);
        return (
          <li key={artifact.relativePath} className={styles.smartItem}>
            <Link
              href={`/projects/${encodedName}/artifacts/${artifact.relativePath}`}
              className={styles.smartLink}
            >
              <div className={styles.smartItemMain}>
                <span className={styles.smartTitle}>
                  {displayTitle(artifact)}
                </span>
                <StatusBadge
                  gem={statusToGem(artifact.meta.status)}
                  label={artifact.meta.status}
                  size="sm"
                />
              </div>
              <div className={styles.smartItemMeta}>
                {typeLabel && (
                  <span className={styles.metaLabel}>{typeLabel}</span>
                )}
                {domain && (
                  <span className={styles.metaLabel}>{domain}</span>
                )}
                {artifact.meta.date && (
                  <span className={styles.metaDate}>{artifact.meta.date}</span>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  </Panel>
)}
```

**CSS additions to `ArtifactList.module.css`:**

Sub-tab styling:
- `.subTabs` — `display: flex; gap: var(--space-sm); margin-bottom: var(--space-md); border-bottom: 1px solid var(--color-border)`
- `.subTab` — `background: none; border: none; padding: var(--space-xs) var(--space-sm); cursor: pointer; color: var(--color-text-muted); font-size: 0.9rem; border-bottom: 2px solid transparent; transition: color 0.2s`
- `.subTabActive` — `color: var(--color-brass); border-bottom-color: var(--color-brass)`

Filter bar styling:
- `.filterBar` — `display: flex; gap: var(--space-sm); margin-bottom: var(--space-md); flex-wrap: wrap`
- `.filterButton` — `display: flex; align-items: center; gap: var(--space-xs); background: rgba(0, 0, 0, 0.2); border: 1px solid var(--color-border); border-radius: 4px; padding: var(--space-xs) var(--space-sm); cursor: pointer; color: var(--color-text-muted); font-size: 0.85rem; transition: all 0.2s`
- `.filterButtonActive` — `background: rgba(var(--color-brass-rgb, 184, 157, 105), 0.15); border-color: var(--color-brass); color: var(--color-parchment)`
- `.filterBadge` — `background: rgba(0, 0, 0, 0.3); border-radius: 10px; padding: 0 6px; font-size: 0.75rem; min-width: 1.2em; text-align: center`

Smart list item styling:
- `.smartList` — `list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column`
- `.smartItem` — `border-bottom: 1px solid var(--color-border-subtle, rgba(255,255,255,0.06))`
- `.smartLink` — `display: flex; flex-direction: column; gap: 2px; padding: var(--space-sm) var(--space-md); text-decoration: none; color: inherit; transition: background 0.15s` with hover background
- `.smartItemMain` — `display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm)`
- `.smartTitle` — `font-size: 0.95rem; color: var(--color-parchment); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`
- `.smartItemMeta` — `display: flex; gap: var(--space-sm); font-size: 0.8rem; color: var(--color-text-muted)`
- `.metaLabel` — `background: rgba(0, 0, 0, 0.2); border-radius: 3px; padding: 1px 6px; font-size: 0.75rem`
- `.metaDate` — `font-size: 0.75rem`

The existing tree styles (`.list`, `.item`, `.link`, etc.) are unchanged.

**Hooks constraint:** The `useState` declarations for `viewMode` and `activeFilter` must be placed at the top of `ArtifactList`, before any conditional logic, to satisfy React's rules of hooks. The current empty-state early return at line 179 sits before the existing `useState` call in `ArtifactTree` (a separate inner component, so it's fine there), but in the restructured `ArtifactList` we cannot return before declaring state. Move both `useState` calls to the top, then check for empty artifacts afterward. When `artifacts.length === 0`, render the empty state panel directly without sub-tabs. When artifacts exist, render the sub-tab toggle and the selected view.

### Step 6: Run tests and full suite

**Files:** None (verification)
**Risk:** None.

1. Run `bun test tests/lib/artifact-smart-view.test.ts` to confirm new unit tests pass.
2. Run `bun test tests/lib/types.test.ts` to confirm the gem mapping change doesn't break existing tests.
3. Run `bun test` (full suite) to confirm no regressions.
4. Run `bun run typecheck` to catch any type errors.

The `approved` gem change in `tests/lib/types.test.ts` was handled in Step 1.

### Step 7: Code review

**Files:** All changed files
**Risk:** None (verification step).

Launch a code-reviewer sub-agent with fresh context to verify:

1. `approved` maps to Group 0 in `ARTIFACT_STATUS_GROUP` and `statusToGem("approved")` returns `"pending"`.
2. All three smart view filters return correct artifacts for a diverse fixture set.
3. Badge counts are computed from the full artifact list, not from the currently filtered subset.
4. The tree view is unchanged in behavior (same component, same props, same rendering).
5. Sub-tab and filter state is ephemeral (no URL persistence, no localStorage).
6. `meetings/` and `commissions/` artifacts are excluded from all smart views.
7. Type and domain labels are derived correctly from path segments.
8. Items link to the correct artifact detail URL.
9. CSS follows existing conventions (CSS Modules, project design tokens).
10. The sorting spec is updated per REQ-SMARTVIEW-19.

## Delegation Guide

All seven steps are for a single implementation agent. Steps 1-2 are data model changes. Steps 3-4 are pure logic + tests. Step 5 is the UI. Steps 6-7 are verification.

| After Step | Reviewer | Focus |
|-----------|----------|-------|
| Step 4 | Self (run tests) | All filter logic tests green before UI work |
| Step 6 | Self (full suite) | No regressions from gem change or component restructure |
| Step 7 | code-reviewer sub-agent | Fresh eyes on filter correctness, gem mapping, and tree preservation |

## Open Questions

None. The spec resolves all design decisions. The three filter predicates, the gem correction, the path-to-type mapping, and the sub-tab structure are all specified.
