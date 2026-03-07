---
title: Artifact Sorting Across Views
date: 2026-03-06
status: executed
tags: [sorting, artifacts, commissions, meetings, ui]
modules: [artifact-list, commission-list, meeting-list, dashboard]
related:
  - .lore/specs/artifact-sorting.md
---

# Plan: Artifact Sorting Across Views

## Goal

Fix artifact sort order across seven display surfaces so each surface sorts according to its purpose: recency for feeds, status-then-title for browsing, workflow priority for queues. Extract all inline sorts into testable `lib/` functions. Eliminate the duplicate `sortCommissions()` in `DependencyMap.tsx`.

## Codebase Context

**Current sorting state:**
- `lib/artifacts.ts:76-117`: `compareArtifacts()` uses a three-bucket status model (`draft`, `open`, `closed`). Real artifact statuses (`implemented`, `active`, `approved`, etc.) all fall through to a default priority, making status sorting ineffective for most artifacts.
- `lib/artifacts.ts:251-257`: `recentArtifacts()` delegates to `scanArtifacts()` which uses `compareArtifacts()`. The dashboard "Recent Scrolls" sorts by status-then-date instead of by modification time.
- `lib/artifact-grouping.ts:141-152`: `sortTreeLevel()` sorts all nodes (directories and leaves) alphabetically by name. No status-aware sorting for leaf nodes.
- `lib/commissions.ts:237-267`: `sortCommissions()` is correct. Four-group model with directional date sorting.
- `web/components/dashboard/DependencyMap.tsx:20-44`: Duplicate `sortCommissions()` with a simpler three-bucket model. Should import from `lib/commissions.ts`.
- `web/app/projects/[name]/page.tsx:54-60`: Inline meeting sort (open first, then date desc). Correct logic, wrong location.
- `web/app/page.tsx:52-66`: Inline meeting request sort (non-deferred first, deferred by `deferred_until` asc, then date desc). Correct logic, wrong location.

**Status vocabulary (from `lib/types.ts:152-172`):**
- `ACTIVE_STATUSES`: approved, active, current, complete, resolved, in_progress, dispatched
- `PENDING_STATUSES`: draft, open, pending, requested, blocked, queued
- `BLOCKED_STATUSES`: superseded, outdated, wontfix, declined, failed, cancelled, abandoned

The spec regroups these for browsing priority (REQ-SORT-4), which differs from the gem color grouping.

**Existing test coverage:**
- `tests/lib/artifacts.test.ts`: Tests for `compareArtifacts()` using the old three-bucket model. Tests for `recentArtifacts()` that assert status-based ordering. Both must be updated.
- `tests/lib/artifact-grouping.test.ts`: Tests for `buildArtifactTree()` and `sortTreeLevel()`. The "children within a directory sort alphabetically" test will need updating to verify status-then-title sorting.
- `tests/lib/commissions.test.ts`: Existing. Commission sort tests should remain unchanged.
- `tests/lib/meetings.test.ts`: Existing. No sort function tests (sorting was inline in page components).

## Implementation Steps

Work is organized in four phases by dependency order. Each step is independently verifiable.

### Phase 1: Shared sort infrastructure in `lib/artifacts.ts`

#### Step 1: Replace status priority model

**Files:** `lib/artifacts.ts`
**REQ IDs:** REQ-SORT-4, REQ-SORT-3, REQ-SORT-13
**Risk:** Medium. Changes the core sort function that `scanArtifacts()` uses. All consumers of `scanArtifacts()` are affected.

Replace `STATUS_PRIORITY` (lines 76-81) and `statusPriority()` (lines 83-85) with the five-group model from the spec:

| Group | Priority | Statuses |
|-------|----------|----------|
| Active work | 0 | draft, open, pending, requested, blocked, queued |
| In progress | 1 | approved, active, current, in_progress, dispatched |
| Terminal | 2 | complete, resolved, implemented |
| Closed negative | 3 | superseded, outdated, wontfix, declined, failed, cancelled, abandoned |
| Unknown | 4 | anything else |

Update `compareArtifacts()` (lines 92-117) to use the new priority model. The function signature and sort axes remain the same (status, then date desc, then title alpha), only the status grouping changes. Rename to `compareArtifactsByStatusAndTitle` to distinguish from the recency comparator added in Step 2.

Keep the old `compareArtifacts` name as well if needed for backward compatibility during the transition, but the spec says to split into two named functions (REQ-SORT-7). The cleaner approach: rename the function and update all call sites in the same step, since there's only one call site (`scanArtifacts()` at line 174).

For REQ-SORT-15 (empty title tiebreaker): when `meta.title` is empty, use `relativePath` as the tiebreaker instead. Within a single directory this produces the same result as using the filename stem, since filenames are unique within a directory. Across directories (Surface 1), using `relativePath` is still a reasonable alphabetical tiebreaker.

**Test strategy:**
- Update existing `compareArtifacts` tests to use the new function name and validate the five-group model.
- Add tests for every status in `ACTIVE_STATUSES`, `PENDING_STATUSES`, and `BLOCKED_STATUSES` from `lib/types.ts` mapping to a defined sort group. No status recognized by `statusToGem()` should fall through to "unknown" (priority 4).
- Test empty status sorts to priority 4 (REQ-SORT-13).
- Test empty title falls back to `relativePath` tiebreaker.

#### Step 2: Add recency sort function

**Files:** `lib/artifacts.ts`
**REQ IDs:** REQ-SORT-5, REQ-SORT-7, REQ-SORT-14
**Risk:** Low. New function, no existing code changes.

Add `compareArtifactsByRecency(a: Artifact, b: Artifact): number` that sorts by `lastModified` descending (newest first). This is the sort for Surface 1 (Dashboard Recent Scrolls).

Since `lastModified` comes from `fs.stat().mtime` and is always a valid `Date`, there's no missing-field edge case for this comparator (REQ-SORT-14).

Update `recentArtifacts()` (lines 251-257) to use `compareArtifactsByRecency` instead of delegating to `scanArtifacts()`. It should:
1. Call `scanArtifacts()` to get all artifacts (which still uses `compareArtifactsByStatusAndTitle` internally)
2. Re-sort by `compareArtifactsByRecency`
3. Slice top N

Alternatively, `recentArtifacts()` could do its own file scan to avoid a redundant sort. But `scanArtifacts()` handles error cases and directory walking, so reusing it and re-sorting is simpler and less error-prone. The double sort is on a small dataset (one project's .lore directory).

**Test strategy:**
- Create artifacts with different `lastModified` timestamps and verify `compareArtifactsByRecency` returns newest first regardless of status or frontmatter date.
- Update existing `recentArtifacts` tests: they currently assert status-based ordering. Replace with assertions that verify modification-time ordering. Use filesystem writes with controlled timing (write files in sequence so their mtimes differ).

### Phase 2: Tree view sort in `lib/artifact-grouping.ts`

#### Step 3: Update `sortTreeLevel()` for leaf sorting

**Files:** `lib/artifact-grouping.ts`
**REQ IDs:** REQ-SORT-6, REQ-SORT-16
**Risk:** Medium. Changes how all tree directory contents are ordered in the project artifacts tab.

Currently `sortTreeLevel()` (lines 141-152) sorts all nodes (directories and leaves) alphabetically by `name`. Update it to:
1. Separate directory nodes from leaf nodes.
2. Sort directory nodes alphabetically by name (unchanged), with "root" last.
3. Sort leaf nodes by status group (REQ-SORT-4 priorities) then by display title alphabetically (using `label`, which is already set to `displayTitle()` for leaves in `insertArtifact()` at line 94).
4. Place directories first, then leaves.

Import `compareArtifactsByStatusAndTitle` from `lib/artifacts.ts` or, to avoid a circular dependency, extract the status priority function into a shared location. Since `lib/artifact-grouping.ts` already imports from `lib/types`, the cleanest approach is to compare leaf nodes using their `artifact` reference: `compareArtifactsByStatusAndTitle(a.artifact!, b.artifact!)`. This works because the leaf invariant guarantees `artifact` is defined when `children` is empty.

Check for circular imports: `lib/artifact-grouping.ts` currently imports only from `lib/types`. Adding an import from `lib/artifacts` is a new dependency. `lib/artifacts` does not import from `lib/artifact-grouping`, so no cycle.

**Test strategy:**
- Update the "children within a directory sort alphabetically" test to verify status-then-title ordering.
- Add test: within a directory, a `draft` artifact sorts before an `implemented` artifact.
- Add test: within the same status group, titles sort alphabetically.
- Add test: directories still sort before leaves (new behavior) and alphabetically among themselves.
- Add test: mixed artifact types (different statuses) within one directory sort correctly.

### Phase 3: Extract inline sorts into `lib/meetings.ts`

#### Step 4: Add `sortMeetingArtifacts()` to `lib/meetings.ts`

**Files:** `lib/meetings.ts`, `web/app/projects/[name]/page.tsx`
**REQ IDs:** REQ-SORT-10, REQ-SORT-2
**Risk:** Low. Extracting existing logic; no behavior change.

Add a new exported function to `lib/meetings.ts`:

```typescript
export function sortMeetingArtifacts(meetings: Artifact[]): Artifact[] {
  return [...meetings].sort((a, b) => {
    const aOpen = a.meta.status === "open" ? 0 : 1;
    const bOpen = b.meta.status === "open" ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    return (b.meta.date || "").localeCompare(a.meta.date || "");
  });
}
```

This is the exact logic from `web/app/projects/[name]/page.tsx:54-60`. The function takes `Artifact[]` (not `MeetingMeta[]`) because meetings on the project page are scanned via `scanArtifacts()` on the meetings subdirectory.

Update `web/app/projects/[name]/page.tsx` to import `sortMeetingArtifacts` and replace the inline `.sort()` call at lines 54-60 with `sortMeetingArtifacts(mergedMeetings)`.

Note: `lib/meetings.ts` currently imports from `lib/types` (for `isNodeError`). Adding an import of the `Artifact` type from `lib/types` is straightforward since it's already in that module.

**Test strategy:**
- Add tests in `tests/lib/meetings.test.ts` for `sortMeetingArtifacts()`:
  - Open meetings sort before non-open meetings.
  - Within the same status group, newer dates sort first.
  - Missing dates sort after present dates.
  - Empty array returns empty array.

#### Step 5: Add `sortMeetingRequests()` to `lib/meetings.ts`

**Files:** `lib/meetings.ts`, `web/app/page.tsx`
**REQ IDs:** REQ-SORT-11, REQ-SORT-2
**Risk:** Low. Extracting existing logic; no behavior change.

Add a new exported function to `lib/meetings.ts`:

```typescript
export function sortMeetingRequests(requests: MeetingMeta[]): MeetingMeta[] {
  return [...requests].sort((a, b) => {
    const aDeferEmpty = !a.deferred_until;
    const bDeferEmpty = !b.deferred_until;

    if (aDeferEmpty && !bDeferEmpty) return -1;
    if (!aDeferEmpty && bDeferEmpty) return 1;

    if (!aDeferEmpty && !bDeferEmpty) {
      const deferCmp = a.deferred_until.localeCompare(b.deferred_until);
      if (deferCmp !== 0) return deferCmp;
    }

    return b.date.localeCompare(a.date);
  });
}
```

This is the exact logic from `web/app/page.tsx:53-66`. Update `web/app/page.tsx` to import `sortMeetingRequests` from `lib/meetings` and replace the inline `allRequests.sort(...)` block with `const sortedRequests = sortMeetingRequests(allRequests)`. Pass `sortedRequests` to the `PendingAudiences` component instead of `allRequests`.

**Test strategy:**
- Add tests in `tests/lib/meetings.test.ts` for `sortMeetingRequests()`:
  - Non-deferred requests sort before deferred requests.
  - Deferred requests sort by `deferred_until` ascending.
  - Within the same deferred group, newer dates sort first.
  - Empty array returns empty array.

### Phase 4: Eliminate duplicate commission sort

#### Step 6: Remove duplicate `sortCommissions()` from DependencyMap

**Files:** `web/components/dashboard/DependencyMap.tsx`
**REQ IDs:** REQ-SORT-8, REQ-SORT-9
**Risk:** Low. The `lib/commissions.ts` version is more correct (four-group model with directional date sorting). The DependencyMap's three-bucket model is a simplification that loses information.

Remove the local `STATUS_PRIORITY`, `statusPriority()`, and `sortCommissions()` from `DependencyMap.tsx` (lines 20-44). Import `sortCommissions` from `lib/commissions` instead.

The `commissionHref` function (lines 49-54) stays, as it's view-specific.

Note that `DependencyMap` receives `commissions` already sorted by `lib/commissions.ts` (via `scanCommissions()` in `web/app/page.tsx:37-41`). The local `sortCommissions` call at line 62 is redundant with the pre-sorted input. After switching to the `lib/` import, the sort call is still safe (re-sorting an already-sorted array with the same comparator is a no-op) but could be removed entirely. The spec says to consolidate, not remove, so keep the import and call for clarity. If the `DependencyMap` ever receives unsorted input (e.g., from a different page), the sort call protects against that.

**Test strategy:**
- The commission sort logic itself is already tested in `tests/lib/commissions.test.ts`. No new sort tests needed.
- Verify `DependencyMap` no longer has a local `sortCommissions` (code review / grep).
- Verify `DependencyMap` imports from `@/lib/commissions`.
- Commission sort deduplication test (from spec AI Validation): confirm `DependencyMap` and `CommissionList` both consume the same sort function.

### Phase 5: Validation

#### Step 7: Verify REQ-SORT-12 (no-op)

**Files:** None
**REQ IDs:** REQ-SORT-12
**Risk:** None.

Commission linked artifacts (`web/app/projects/[name]/commissions/[id]/page.tsx:22-49`) render in frontmatter array order. The spec explicitly says no sorting function is needed. Verify by reading the code (already confirmed in the spec analysis above). No code changes.

#### Step 8: Full test suite and review

**Files:** All changed files
**REQ IDs:** REQ-SORT-1 (verified structurally: each surface has one fixed sort, no configurability), plus all others
**Risk:** None (verification step).

Run the full test suite (`bun test`) to verify no regressions. The existing tests that relied on the old three-bucket model should have been updated in Steps 1-2.

Launch a code review sub-agent with fresh context to verify:
1. Every status in `statusToGem()` maps to a defined sort group (not "unknown").
2. All inline sorts have been extracted to `lib/` modules.
3. No duplicate sort functions remain.
4. Sort function exports are consistent (pure, no side effects, independently testable).
5. Import paths are correct (no circular dependencies).

## Delegation Guide

Steps 1-3 are the highest risk because they change core sorting behavior. These should be implemented by a single agent to maintain consistency across the status priority model. Steps 4-6 are mechanical extractions that could run in parallel but depend on Step 1 only for the import of `Artifact` type (which is already available).

Recommended review points:

| After Step | Reviewer | Focus |
|-----------|----------|-------|
| Step 1 | code-reviewer | Status priority mapping completeness. Verify every status from `statusToGem()` has a defined group. |
| Step 3 | code-reviewer | Tree sort produces correct directory-before-leaf ordering with status-then-title for leaves. |
| Step 8 | code-reviewer (fresh context) | Full review of all changes against the spec. |

## Open Questions

1. **`scanArtifacts()` callers beyond Surfaces 1 and 2.** The project page passes `scanArtifacts()` output to `ArtifactList` (Surface 2, tree view). The tree view re-sorts via `sortTreeLevel()`. So the sort from `scanArtifacts()` is intermediate, not the final display order for Surface 2. Changing `compareArtifacts` to the five-group model affects this intermediate sort, but `sortTreeLevel()` applies the final order. This is fine because Surface 2's sort (Step 3) is defined on the tree, not the flat list. The `scanArtifacts()` sort only matters for Surface 1 via `recentArtifacts()`, which re-sorts anyway (Step 2). No issue, but worth noting.

2. **Display title in sort vs. `name` in tree.** `sortTreeLevel()` currently sorts leaf nodes by `name` (the filename segment, e.g., `system.md`). The spec says to sort by title within status groups. Leaf nodes already have `label` set to `displayTitle(artifact)` (which prefers `meta.title` over filename). The sort should use `label` for consistency with what the user sees. If two artifacts have the same display title (unlikely but possible across directories), `name` serves as the final tiebreaker.

3. **`implemented` is in Terminal (priority 2), but `statusToGem()` maps it to "active" (green gem).** The spec intentionally regroups for browsing priority: `implemented` means "done, no action needed" and should sort below work-in-progress. The gem color is about visual feedback ("this is a healthy, completed thing"), not sort priority. This divergence is by design per the spec, not a conflict.
