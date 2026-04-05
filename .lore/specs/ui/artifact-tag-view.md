---
title: Artifact Tag View
date: 2026-04-05
status: implemented
tags: [ui, artifacts, navigation, filtering, tags]
modules: [artifact-browser, artifact-list]
related:
  - .lore/specs/ui/artifact-smart-views.md
  - .lore/issues/tag-view.md
req-prefix: TAGVIEW
---

# Spec: Artifact Tag View

## Overview

The artifact browser has two modes: Smart View (default, intent-based filters) and Tree View (directory hierarchy). Both organize artifacts by metadata the system assigns: status groups, path structure, lifecycle stage. Neither surfaces the tags that authors put on their own artifacts.

Tag View adds a third mode that inverts the navigation axis. Instead of the system telling the user what to look at, the user browses by the vocabulary they already use to describe their work. Tags are the only piece of artifact metadata that authors choose freely, which makes them a natural cross-cutting index.

## Entry Points

- User clicks "Tag View" sub-tab in the artifact browser's view controls (alongside "Smart View" and "Tree View")
- Direct URL to `/projects/[name]?tab=artifacts` with Tag View selected via ephemeral state

## Requirements

### Sub-tab integration

- REQ-TAGVIEW-1: The artifacts tab sub-tab bar gains a third option: "Tag View", positioned after "Tree View." The view mode state type expands from `"smart" | "tree"` to `"smart" | "tree" | "tags"`.
- REQ-TAGVIEW-2: Tag View selection is ephemeral React state, consistent with REQ-SMARTVIEW-3. No URL persistence.

### Tag extraction and counting

- REQ-TAGVIEW-3: Tag View computes a tag index from the full artifact list. For each artifact, read `artifact.meta.tags` (a `string[]` already parsed from YAML frontmatter). Accumulate a count of how many artifacts carry each tag.
- REQ-TAGVIEW-4: Only tags with a count greater than 1 appear in the tag list. Single-use tags are noise; they don't help cross-reference.
- REQ-TAGVIEW-5: The tag list is ordered by count descending. Tags with equal counts are ordered alphabetically ascending.

### Tag list panel

- REQ-TAGVIEW-6: The tag list renders as a horizontal bar of selectable tag buttons, visually similar to the Smart View filter bar (`styles.filterBar`). Each button shows the tag name and its count as a badge, following the same pattern as `SmartViewFilterBar`.
- REQ-TAGVIEW-7: When no tag is selected, the tag list panel is shown with no artifact list below it. An empty state message reads "Select a tag to browse matching artifacts."
- REQ-TAGVIEW-8: If no tags in the artifact collection meet the >1 threshold, show an empty state: "No shared tags found across artifacts."

### Tag selection and filtering

- REQ-TAGVIEW-9: Clicking a tag button selects it. Only one tag may be selected at a time. Clicking the selected tag deselects it, returning to the no-selection state.
- REQ-TAGVIEW-10: When a tag is selected, the artifact list below shows all artifacts whose `meta.tags` array includes that tag. The selected tag button receives the active style (`styles.filterButtonActive`).
- REQ-TAGVIEW-11: Filtered artifacts are sorted by `compareArtifactsByStatusAndTitle`, consistent with Smart View (REQ-SMARTVIEW-16).

### Item display

- REQ-TAGVIEW-12: Each artifact in the filtered list reuses the same item layout as Smart View: title, status gem, type label, domain label, and date. This means reusing `artifactTypeLabel()`, `artifactDomain()`, `displayTitle()`, `statusToGem()`, and the `smartItem`/`smartLink`/`smartItemMain`/`smartItemMeta` CSS classes.
- REQ-TAGVIEW-13: Clicking an item navigates to the artifact detail page (`/projects/[name]/artifacts/[path]`), consistent with REQ-SMARTVIEW-15.

## Data Flow

Tag computation is pure and stateless. The `artifacts` array already available in `ArtifactList` contains parsed `meta.tags` on every item. No new data fetching or API calls are needed.

```
ArtifactList (artifacts prop)
  -> computeTagIndex(artifacts)  // returns Map<string, number>, filtered to count > 1
  -> user selects tag
  -> artifacts.filter(a => a.meta.tags.includes(selectedTag))
  -> sort by compareArtifactsByStatusAndTitle
  -> render with SmartView item layout
```

The `computeTagIndex` function belongs in a new module `lib/artifact-tag-view.ts`, following the pattern of `lib/artifact-smart-view.ts`. It takes `Artifact[]` and returns the tag index. The filtering function takes `Artifact[]` and a tag string and returns sorted `Artifact[]`.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Artifact detail | User clicks an item | `/projects/[name]/artifacts/[path]` |
| Smart View | User clicks "Smart View" sub-tab | Smart View (unchanged) |
| Tree View | User clicks "Tree View" sub-tab | Tree View (unchanged) |

## Scope Exclusions

- **Multi-tag selection.** Single-select keeps the interaction simple and mirrors Smart View's one-active-filter model. Multi-tag intersection can be added later if the single-tag filter proves insufficient.
- **Tag search or type-ahead.** Not needed until the tag count grows large enough to make scanning the bar impractical. The >1 threshold already prunes the list.
- **Tag editing.** Tag View is read-only navigation. Editing tags requires modifying frontmatter, which is outside the artifact browser's scope.
- **Tag grouping or hierarchy.** Tags are flat strings. No namespace parsing (e.g., treating `ui/navigation` as a nested tag).

## Success Criteria

- [ ] "Tag View" appears as a third sub-tab and renders the tag list when selected
- [ ] Tags with count <= 1 do not appear in the tag list
- [ ] Tags are ordered by count descending, then alphabetically
- [ ] Selecting a tag filters artifacts to those carrying that tag
- [ ] Filtered items display with the same layout as Smart View items
- [ ] Clicking the selected tag deselects it and returns to empty state
- [ ] Empty states render correctly for both "no shared tags" and "no tag selected"

## AI Validation

**Defaults:**
- Unit tests with mocked time/network/filesystem/LLM calls
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Test `computeTagIndex` returns correct counts and excludes tags with count <= 1
- Test tag ordering: descending by count, alphabetical tiebreak
- Test filtering returns only artifacts containing the selected tag
- Test filtered results are sorted by `compareArtifactsByStatusAndTitle`
- Test that artifacts with empty `meta.tags` contribute no tags to the index
- Test deselection (clicking active tag) clears the filter
- Test that the view mode type union includes `"tags"` alongside `"smart"` and `"tree"`
- Visual verification with 0 tags, 3 tags, and 20+ tags

## Constraints

- Smart View and Tree View implementations are unchanged. This spec adds a third mode alongside them.
- No new API endpoints or data fetching. Tag computation uses the existing `artifacts` prop.
- Tag comparison is case-sensitive (tags are lowercase by convention in this codebase's frontmatter).
- The `>1` threshold is not configurable. It is a fixed filter.
