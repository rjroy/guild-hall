---
title: Artifact Tag View
date: 2026-04-05
status: draft
tags: [ui, artifacts, navigation, filtering, tags]
modules: [artifact-browser, artifact-list]
related:
  - .lore/specs/ui/artifact-tag-view.md
  - .lore/plans/ui/artifact-smart-views.md
  - .lore/issues/tag-view.md
---

# Plan: Artifact Tag View

## Goal

Add a third artifact browser mode ("Tag View") alongside Smart View and Tree View. Users browse artifacts by the tags they authored in YAML frontmatter. The tag list shows tags appearing on more than one artifact, ordered by count descending then alphabetically. Selecting a tag filters artifacts to those carrying it.

## Codebase Context

**Starting point:**

`web/components/project/ArtifactList.tsx` is the client component that owns the artifact browser. It manages a `viewMode` state (`"smart" | "tree"`) at line 187 and renders sub-tabs plus the selected view. `SmartViewFilterBar` and `SmartView` are inner components handling the smart view's filter bar and item list respectively.

`lib/artifact-smart-view.ts` contains pure filter/metadata logic for smart views: `filterSmartView()`, `smartViewCounts()`, `artifactTypeLabel()`, `artifactDomain()`. Tag View follows the same pattern: pure functions in `lib/`, consumed by components in `web/`.

`web/components/project/ArtifactList.module.css` has existing styles for sub-tabs (`.subTabs`, `.subTab`, `.subTabActive`), filter bar (`.filterBar`, `.filterButton`, `.filterButtonActive`, `.filterBadge`), and smart list items (`.smartItem`, `.smartLink`, `.smartItemMain`, `.smartItemMeta`, `.smartTitle`). Tag View reuses the filter bar and smart item styles directly.

`lib/types.ts:60` defines `ArtifactMeta.tags` as `string[]`. `lib/types.ts:368` exports `artifactTypeSegment()`. `lib/types.ts:437` exports `compareArtifactsByStatusAndTitle()`. Both are already used by the smart view module.

**What changes:**

- `lib/artifact-tag-view.ts` (new) - pure tag index computation and filtering functions
- `tests/lib/artifact-tag-view.test.ts` (new) - unit tests for the tag logic
- `web/components/project/ArtifactList.tsx` - expand `viewMode` type to include `"tags"`, add Tag View sub-tab and rendering
- `web/components/project/ArtifactList.module.css` - no new class names needed; Tag View reuses `filterBar`/`filterButton`/`filterButtonActive`/`filterBadge` for the tag bar and `smartItem`/`smartLink`/`smartItemMain`/`smartItemMeta` for the item list

**What does not change:**

- `lib/artifact-smart-view.ts` - smart view logic untouched
- `lib/types.ts` - no type changes needed
- Smart View and Tree View behavior (rendering, filtering, sorting)
- Daemon, API routes, and all other components

## Requirement Traceability

| REQ ID | Step |
|--------|------|
| REQ-TAGVIEW-1 | Step 3 (sub-tab addition, view mode type expansion) |
| REQ-TAGVIEW-2 | Step 3 (ephemeral React state) |
| REQ-TAGVIEW-3 | Step 1 (`computeTagIndex`) |
| REQ-TAGVIEW-4 | Step 1 (`computeTagIndex` threshold filter) |
| REQ-TAGVIEW-5 | Step 1 (tag ordering in `computeTagIndex`) |
| REQ-TAGVIEW-6 | Step 3 (tag bar using `filterBar`/`filterButton` styles) |
| REQ-TAGVIEW-7 | Step 3 (no-selection empty state) |
| REQ-TAGVIEW-8 | Step 3 (no-shared-tags empty state) |
| REQ-TAGVIEW-9 | Step 3 (single-select toggle) |
| REQ-TAGVIEW-10 | Step 1 (`filterByTag`) + Step 3 (rendering) |
| REQ-TAGVIEW-11 | Step 1 (`filterByTag` sorting) |
| REQ-TAGVIEW-12 | Step 3 (reuses smart view item layout) |
| REQ-TAGVIEW-13 | Step 3 (artifact detail link) |

## Implementation Steps

### Step 1: Tag computation and filtering logic

**Files:** `lib/artifact-tag-view.ts` (new)
**REQ IDs:** REQ-TAGVIEW-3, REQ-TAGVIEW-4, REQ-TAGVIEW-5, REQ-TAGVIEW-10, REQ-TAGVIEW-11
**Risk:** Low. Pure functions, no side effects, no imports from `web/` or `daemon/`.

Create `lib/artifact-tag-view.ts` with two exported functions:

**`computeTagIndex(artifacts: Artifact[]): { tag: string; count: number }[]`**

Iterates over `artifacts`, reads `artifact.meta.tags` (already a `string[]`), and accumulates counts into a `Map<string, number>`. Filters out entries where `count <= 1` (REQ-TAGVIEW-4). Converts to an array of `{ tag, count }` objects, sorted by count descending, then alphabetically ascending on tag name (REQ-TAGVIEW-5). Returns the sorted array.

```typescript
import type { Artifact } from "@/lib/types";
import { compareArtifactsByStatusAndTitle } from "@/lib/types";

export interface TagEntry {
  tag: string;
  count: number;
}

export function computeTagIndex(artifacts: Artifact[]): TagEntry[] {
  const counts = new Map<string, number>();
  for (const artifact of artifacts) {
    for (const tag of artifact.meta.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  const entries: TagEntry[] = [];
  for (const [tag, count] of counts) {
    if (count > 1) entries.push({ tag, count });
  }
  entries.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  return entries;
}
```

**`filterByTag(artifacts: Artifact[], tag: string): Artifact[]`**

Filters `artifacts` to those where `artifact.meta.tags.includes(tag)`, then sorts the result with `compareArtifactsByStatusAndTitle` (REQ-TAGVIEW-11). Returns the sorted array.

```typescript
export function filterByTag(artifacts: Artifact[], tag: string): Artifact[] {
  const filtered = artifacts.filter((a) => a.meta.tags.includes(tag));
  filtered.sort(compareArtifactsByStatusAndTitle);
  return filtered;
}
```

Both functions are stateless transformations of the existing `artifacts` prop. No new data fetching or API calls.

**Verification:** Step 2 tests both functions.

### Step 2: Unit tests for tag logic

**Files:** `tests/lib/artifact-tag-view.test.ts` (new)
**REQ IDs:** AI Validation (all custom items)
**Risk:** None. New test file.

Use a minimal artifact factory matching the `Artifact` interface from `lib/types.ts:68-78`. The factory needs `relativePath`, `meta.tags`, and `meta.status` as varying fields.

```typescript
function makeArtifact(
  relativePath: string,
  status: string,
  tags: string[] = [],
): Artifact {
  return {
    meta: {
      title: relativePath.split("/").pop()?.replace(".md", "") ?? "",
      date: "2026-01-01",
      status,
      tags,
      extras: {},
    },
    filePath: `/test/.lore/${relativePath}`,
    relativePath,
    content: "",
    lastModified: new Date("2026-01-01"),
  };
}
```

**Test cases for `computeTagIndex`:**

1. **Basic counting.** Three artifacts: two tagged `ui`, one tagged `api`. Result: `[{ tag: "ui", count: 2 }]`. The `api` tag (count 1) is excluded.
2. **Threshold exclusion.** Five artifacts, each with a unique tag. Result: empty array. All tags have count 1.
3. **Sort by count descending.** Tags with counts 5, 3, 7. Result ordered: 7, 5, 3.
4. **Alphabetical tiebreak.** Tags `beta` and `alpha` both with count 2. Result: `alpha` before `beta`.
5. **Empty tags.** Artifacts with `meta.tags = []` contribute nothing to the index. Mix of tagged and untagged artifacts produces correct counts.
6. **Artifact with multiple tags.** One artifact tagged `[ui, api]`, another tagged `[ui, testing]`. Result includes `ui` with count 2. `api` and `testing` at count 1 are excluded.

**Test cases for `filterByTag`:**

7. **Correct filtering.** Five artifacts, three tagged `ui`. `filterByTag(artifacts, "ui")` returns exactly those three.
8. **Sorted by status and title.** Filtered results follow `compareArtifactsByStatusAndTitle` ordering, not insertion order.
9. **Tag not present.** `filterByTag(artifacts, "nonexistent")` returns empty array.
10. **Case sensitivity.** `filterByTag(artifacts, "UI")` returns empty when artifacts are tagged `"ui"`. Tags are case-sensitive per spec constraints.

**Test for view mode type (REQ-TAGVIEW-1):**

11. **Type check.** Verify that a variable typed `"smart" | "tree" | "tags"` compiles. This is a compile-time check, not a runtime test. The type expansion in Step 3 is the real verification; this test documents the intent.

Run: `bun test tests/lib/artifact-tag-view.test.ts`

**Verification:** All tests pass before proceeding to Step 3.

### Step 3: Tag View UI in ArtifactList

**Files:** `web/components/project/ArtifactList.tsx`, `web/components/project/ArtifactList.module.css`
**REQ IDs:** REQ-TAGVIEW-1, REQ-TAGVIEW-2, REQ-TAGVIEW-6, REQ-TAGVIEW-7, REQ-TAGVIEW-8, REQ-TAGVIEW-9, REQ-TAGVIEW-10, REQ-TAGVIEW-12, REQ-TAGVIEW-13
**Risk:** Medium. Modifying an existing client component. The sub-tab bar and item rendering are well-established patterns, but the toggle-to-deselect interaction (REQ-TAGVIEW-9) is new.

**3a. Expand view mode type**

Change the `viewMode` state at line 187 from `"smart" | "tree"` to `"smart" | "tree" | "tags"`:

```typescript
const [viewMode, setViewMode] = useState<"smart" | "tree" | "tags">("smart");
```

Add `selectedTag` state for the Tag View's single-select model:

```typescript
const [selectedTag, setSelectedTag] = useState<string | null>(null);
```

Both are ephemeral React state (REQ-TAGVIEW-2).

**3b. Add sub-tab button**

Add a third button to the `.subTabs` div at line 204, after the Tree View button:

```tsx
<button
  className={`${styles.subTab} ${viewMode === "tags" ? styles.subTabActive : ""}`}
  onClick={() => setViewMode("tags")}
>
  Tag View
</button>
```

Position: after "Tree View", matching REQ-TAGVIEW-1.

**3c. Add TagViewPanel component**

Create an inner component (same file, like `SmartView` and `SmartViewFilterBar`):

```tsx
interface TagViewPanelProps {
  artifacts: Artifact[];
  encodedProjectName: string;
  selectedTag: string | null;
  setSelectedTag: (tag: string | null) => void;
}

function TagViewPanel({
  artifacts,
  encodedProjectName,
  selectedTag,
  setSelectedTag,
}: TagViewPanelProps) {
  const tagIndex = computeTagIndex(artifacts);

  if (tagIndex.length === 0) {
    return (
      <Panel>
        <EmptyState message="No shared tags found across artifacts." />
      </Panel>
    );
  }

  const handleTagClick = (tag: string) => {
    setSelectedTag(selectedTag === tag ? null : tag);
  };

  return (
    <>
      <div className={styles.filterBar}>
        {tagIndex.map(({ tag, count }) => (
          <button
            key={tag}
            className={`${styles.filterButton} ${selectedTag === tag ? styles.filterButtonActive : ""}`}
            onClick={() => handleTagClick(tag)}
          >
            {tag}
            <span className={styles.filterBadge}>{count}</span>
          </button>
        ))}
      </div>
      {selectedTag === null ? (
        <Panel>
          <EmptyState message="Select a tag to browse matching artifacts." />
        </Panel>
      ) : (
        <TagViewItems
          artifacts={artifacts}
          tag={selectedTag}
          encodedProjectName={encodedProjectName}
        />
      )}
    </>
  );
}
```

The tag bar reuses `filterBar`, `filterButton`, `filterButtonActive`, and `filterBadge` CSS classes from the smart view filter bar (REQ-TAGVIEW-6).

Toggle-to-deselect: clicking the active tag passes `null` to `setSelectedTag`, returning to the no-selection state (REQ-TAGVIEW-9).

**3d. Add TagViewItems component**

Reuses the smart view item layout (REQ-TAGVIEW-12):

```tsx
interface TagViewItemsProps {
  artifacts: Artifact[];
  tag: string;
  encodedProjectName: string;
}

function TagViewItems({ artifacts, tag, encodedProjectName }: TagViewItemsProps) {
  const filtered = filterByTag(artifacts, tag);

  if (filtered.length === 0) {
    return (
      <Panel>
        <EmptyState message="No artifacts match this tag." />
      </Panel>
    );
  }

  return (
    <Panel size="lg">
      <ul className={styles.smartList}>
        {filtered.map((artifact) => {
          const typeLabel = artifactTypeLabel(artifact.relativePath);
          const domain = artifactDomain(artifact.relativePath);
          return (
            <li key={artifact.relativePath} className={styles.smartItem}>
              <Link
                href={`/projects/${encodedProjectName}/artifacts/${artifact.relativePath}`}
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
                  {artifact.meta.date && (
                    <span className={styles.metaDate}>{artifact.meta.date}</span>
                  )}
                  {typeLabel && (
                    <span className={styles.metaLabel}>{typeLabel}</span>
                  )}
                  {domain && (
                    <span className={styles.metaLabel}>{domain}</span>
                  )}
                  {artifact.meta.tags.length > 0 && (
                    <>
                      {artifact.meta.tags.map((t) => (
                        <span key={t} className={styles.tag}>{t}</span>
                      ))}
                    </>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
```

This mirrors the `SmartView` component's item rendering exactly. The item layout uses `displayTitle()`, `statusToGem()`, `StatusBadge`, `artifactTypeLabel()`, `artifactDomain()`, and the `smartItem`/`smartLink`/`smartItemMain`/`smartItemMeta` CSS classes (REQ-TAGVIEW-12). Clicks navigate to `/projects/[name]/artifacts/[path]` (REQ-TAGVIEW-13).

**3e. Wire into view mode conditional**

Update the conditional rendering block (currently lines 226-234) to include the Tag View case:

```tsx
{viewMode === "smart" && (
  <SmartViewFilterBar ... />
)}
```

The SmartViewFilterBar rendering condition stays as-is (only visible in smart mode).

The content block becomes:

```tsx
{viewMode === "smart" ? (
  <SmartView ... />
) : viewMode === "tags" ? (
  <TagViewPanel
    artifacts={artifacts}
    encodedProjectName={encodedName}
    selectedTag={selectedTag}
    setSelectedTag={setSelectedTag}
  />
) : (
  <ArtifactTree ... />
)}
```

**3f. Add imports**

At the top of `ArtifactList.tsx`, add:

```typescript
import { computeTagIndex, filterByTag } from "@/lib/artifact-tag-view";
```

**CSS note:** No new CSS classes are needed. Tag View reuses the existing filter bar and smart item styles. The `filterBar` div already has `flex-wrap: wrap` (line 184 of the CSS), which handles tag bars wider than the container.

**Verification:** `bun run typecheck` passes. Manual review confirms three sub-tabs render, tag bar populates, selection toggles, and items display.

### Step 4: Full test suite and typecheck

**Files:** None (verification)
**Risk:** None.

1. `bun test tests/lib/artifact-tag-view.test.ts` - new tag logic tests pass
2. `bun test` - full suite, no regressions
3. `bun run typecheck` - no type errors from the view mode type expansion
4. `bun run lint` - no lint violations in new or modified files

**Verification:** All four commands pass clean.

### Step 5: Code review

**Files:** All changed files
**Risk:** None (verification step).

Launch a code-reviewer sub-agent with fresh context. Review checklist:

1. `computeTagIndex` excludes tags with count <= 1 and sorts correctly (count desc, alpha asc).
2. `filterByTag` returns only artifacts containing the selected tag, sorted by `compareArtifactsByStatusAndTitle`.
3. Artifacts with empty `meta.tags` contribute no tags to the index.
4. View mode type is `"smart" | "tree" | "tags"` and selection is ephemeral state.
5. Tag bar reuses `filterBar`/`filterButton` styles from the smart view.
6. Item display reuses `smartItem`/`smartLink`/`smartItemMain`/`smartItemMeta` styles.
7. Clicking the active tag deselects it (returns to null).
8. Both empty states render correctly: "No shared tags found across artifacts" and "Select a tag to browse matching artifacts."
9. Smart View and Tree View behavior is unchanged.
10. CSS follows conventions: no raw color values, uses design tokens from `globals.css`.
11. Items link to `/projects/[name]/artifacts/[path]`.
12. No new API endpoints or data fetching.

## Delegation Guide

This is a single-commission implementation. All five steps execute in one session.

| After Step | Reviewer | Focus |
|-----------|----------|-------|
| Step 2 | Self (run tests) | Tag logic tests green before UI work |
| Step 4 | Self (full suite) | No regressions from component changes |
| Step 5 | code-reviewer sub-agent | Fresh eyes on correctness, style reuse, and empty state handling |

The feature is small enough (two new pure functions, one new component with three inner components, no CSS additions) that a single implement-then-review cycle is appropriate. No fan-out or multi-phase chaining needed.

## Open Questions

None. The spec resolves all design decisions. The tag computation, filtering, threshold, ordering, and UI reuse patterns are fully specified.
