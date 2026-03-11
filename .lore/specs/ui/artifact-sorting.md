---
title: Artifact Sorting Across Views
date: 2026-03-06
status: implemented
tags: [sorting, artifacts, commissions, meetings, ui]
modules: [artifact-list, commission-list, meeting-list, dashboard]
related:
  - .lore/specs/ui/guild-hall-views.md
  - .lore/specs/ui/artifact-tree-view.md
  - .lore/specs/commissions/guild-hall-commissions.md
  - .lore/specs/meetings/guild-hall-meetings.md
req-prefix: SORT
---

# Spec: Artifact Sorting Across Views

## Overview

Guild Hall displays artifact and activity lists in seven distinct surfaces. Each surface serves a different purpose: some are activity feeds where recency matters, some are browsing views where structural grouping matters, and some are workflow queues where actionability comes first. This spec defines the sort order for each surface, grounded in the fields actually available in the codebase and the role each surface plays.

## Previous Attempt

Commit `95e423d` introduced `compareArtifacts()` in `lib/artifacts.ts:92-117`. This function sorts by status priority (draft > open > closed), then date descending, then title alphabetical. The `recentArtifacts()` function at line 251 calls `scanArtifacts()` which applies this sort, then slices the top N.

The problem: `compareArtifacts()` uses a three-bucket status model (`draft`, `open`, `closed`) that doesn't match the actual status values in the codebase. Real artifact frontmatter uses statuses like `implemented`, `active`, `approved`, `current`, `complete`, `pending`, `requested`, `superseded`, `outdated`, `failed`, `cancelled`, `abandoned`, `declined` (documented in `lib/types.ts:152-172` via `statusToGem()`). The three-bucket model maps most real statuses to the fallback priority (3, below `closed`), which means a `draft` spec and an `implemented` spec sort identically except by date. This defeats the purpose of status-based sorting for general artifact browsing.

The commission sorting (`lib/commissions.ts:237-267`, `sortCommissions()`) does not have this problem. It uses a four-group model (idle, active, failed, completed) with status values that match actual commission frontmatter. The meeting sort in the project page (`web/app/projects/[name]/page.tsx:54-60`) similarly uses `open` vs other, which matches real meeting statuses.

The artifact sort is the one that needs fixing. Commission and meeting sorts are working correctly for their surfaces.

## Sorting Surfaces

Seven surfaces display ordered lists. Each is described below with its data source, current sort behavior, and the fields available for sorting.

### Surface 1: Dashboard "Recent Scrolls"

**Location:** `web/app/page.tsx:33` calls `recentArtifacts(lorePath, 10)`, which calls `scanArtifacts()` (applies `compareArtifacts()`) and slices the first 10.

**Component:** `web/components/dashboard/RecentArtifacts.tsx` renders the list as-is, no re-sorting.

**Data type:** `Artifact` (`lib/types.ts:31-38`)

**Available fields:** `meta.title`, `meta.date`, `meta.status`, `meta.tags`, `meta.modules`, `lastModified` (filesystem mtime), `relativePath`

**Current sort:** `compareArtifacts()`: status (draft > open > closed) then date desc then title alpha.

**Purpose:** A feed of recently changed artifacts for the selected project. The user wants to see what's new, not browse a taxonomy. Recency is the primary axis.

### Surface 2: Project Artifacts Tab (Tree View)

**Location:** `web/app/projects/[name]/page.tsx:35` calls `scanArtifacts(lorePath)`, passes the full sorted array to `ArtifactList`.

**Component:** `web/components/project/ArtifactList.tsx` calls `buildArtifactTree(artifacts)` from `lib/artifact-grouping.ts:161`, which inserts artifacts into a tree structure preserving their input order within each directory. `sortTreeLevel()` at line 141 sorts directory nodes alphabetically. Leaf nodes within a directory retain the order they were inserted, which is the order from `scanArtifacts()`.

**Data type:** `Artifact` passed through to `TreeNode` (leaf nodes carry `artifact` reference).

**Available fields:** Same as Surface 1 plus `relativePath` (drives tree structure).

**Current sort:** Within each tree directory: whatever `scanArtifacts()` produced (status > date > title). Directories themselves sort alphabetically.

**Purpose:** Browsing the full artifact collection. The tree already provides structural grouping by directory. Within each directory, the user scans titles and status to find what they need. Alphabetical by title is the natural complement to directory grouping, since status is already conveyed by gem color.

### Surface 3: Project Commissions Tab

**Location:** `web/app/projects/[name]/page.tsx:62` calls `scanCommissions(lorePath, projectName)`, which returns pre-sorted results.

**Component:** `web/components/commission/CommissionList.tsx` renders the list as-is.

**Data type:** `CommissionMeta` (`lib/commissions.ts:19-35`)

**Available fields:** `commissionId`, `title`, `status`, `worker`, `workerDisplayTitle`, `prompt`, `dependencies`, `linked_artifacts`, `date`, `relevantDate`, `current_progress`, `result_summary`, `projectName`

**Current sort:** `sortCommissions()` in `lib/commissions.ts:254-267`: group by status (idle=0, active=1, failed=2, completed=3), then idle/active/failed sort oldest-first by `relevantDate`, completed sorts newest-first.

**Purpose:** Workflow queue. Active commissions need attention first, pending commissions are next in line, failed ones need triage, completed ones are historical. The current sort correctly serves this purpose.

### Surface 4: Project Meetings Tab

**Location:** `web/app/projects/[name]/page.tsx:38-60` scans meetings from both the integration worktree (closed/merged) and active meeting worktrees (open meetings), deduplicates, then sorts inline.

**Component:** `web/components/project/MeetingList.tsx` renders the list as-is.

**Data type:** `Artifact` (meetings are scanned via `scanArtifacts()` on the `meetings/` subdirectory, not via `scanMeetings()` which returns `MeetingMeta`).

**Available fields:** `meta.title`, `meta.date`, `meta.status`, `meta.extras.worker`, `meta.extras.workerDisplayTitle`, `lastModified`, `relativePath`

**Current sort:** Inline at `page.tsx:54-60`: open meetings first (status === "open" gets priority 0, others get 1), then date descending.

**Purpose:** A list of all meetings for the project, current and historical. Open meetings need to be immediately visible; after that, recency tells you which conversations are freshest.

### Surface 5: Dashboard Pending Audiences

**Location:** `web/app/page.tsx:44-66` calls `scanMeetingRequests()` for each project, merges, then sorts inline.

**Component:** `web/components/dashboard/PendingAudiences.tsx` renders the list as-is.

**Data type:** `MeetingMeta` (`lib/meetings.ts:19-32`)

**Available fields:** `meetingId`, `title`, `status` (always "requested"), `worker`, `agenda`, `date`, `deferred_until`, `linked_artifacts`, `workerDisplayTitle`, `projectName`

**Current sort:** Inline at `page.tsx:53-66`: non-deferred first, deferred sorted by `deferred_until` ascending, then date descending within each group.

**Purpose:** Action queue. The user is deciding what to engage with. Non-deferred requests are urgent; deferred ones were consciously postponed. Within each group, newer requests come first because they're more likely to be contextually relevant.

### Surface 6: Dashboard Dependency Map

**Location:** `web/app/page.tsx:36-42` calls `scanCommissions()` per project, passes flat array to `DependencyMap`.

**Component:** `web/components/dashboard/DependencyMap.tsx:38-44` has its own `sortCommissions()` that sorts by a status priority (running > pending > other) then date desc. This sort is used for the flat card fallback when no graph edges exist.

**Data type:** `CommissionMeta`

**Available fields:** Same as Surface 3.

**Current sort (flat fallback):** Running first, pending second, other third, then date desc. The graph view uses topological layout, not linear sort.

**Purpose:** Visual overview of commission dependencies. When rendered as a graph, sort order is irrelevant (layout is topological). The flat fallback acts as a summary list where active work should be prominent.

### Surface 7: Commission Linked Artifacts

**Location:** `web/app/projects/[name]/commissions/[id]/page.tsx:22-49` resolves `linked_artifacts` paths from commission frontmatter into `CommissionArtifact` objects.

**Component:** `web/components/commission/CommissionLinkedArtifacts.tsx` renders the list as-is.

**Data type:** `CommissionArtifact` (local interface: `path`, `title`, `href`)

**Available fields:** Only `path` and `title` (derived from filename). No frontmatter metadata is loaded for these; they're resolved from path strings.

**Current sort:** None. Rendered in the order they appear in the commission's `linked_artifacts` frontmatter array.

**Purpose:** Reference list. Shows what the commission produced or depends on. The chronological order of creation (as written by the daemon into frontmatter) is the natural ordering.

## Fields Available for Sorting

The following table lists every field that could serve as a sort key, where it comes from, and which surfaces have access to it.

| Field | Source | Type | Surfaces |
|-------|--------|------|----------|
| `meta.status` | Frontmatter `status:` | string | 1, 2, 4 |
| `meta.date` | Frontmatter `date:` | string (YYYY-MM-DD) | 1, 2, 4 |
| `meta.title` | Frontmatter `title:` | string | 1, 2, 4 |
| `meta.tags` | Frontmatter `tags:` | string[] | 1, 2, 4 |
| `lastModified` | `fs.stat().mtime` | Date | 1, 2, 4 |
| `relativePath` | Computed from directory walk | string | 1, 2, 4 |
| `CommissionMeta.status` | Frontmatter `status:` | string | 3, 6 |
| `CommissionMeta.date` | Frontmatter `date:` | string (YYYY-MM-DD) | 3, 6 |
| `CommissionMeta.relevantDate` | Derived from timeline | string (ISO) | 3, 6 |
| `MeetingMeta.date` | Frontmatter `date:` | string (YYYY-MM-DD) | 5 |
| `MeetingMeta.deferred_until` | Frontmatter `deferred_until:` | string | 5 |

## Requirements

### General Sorting Principles

- REQ-SORT-1: Each sorting surface has exactly one fixed sort order. Sort orders are not user-configurable in V1. The sort order is determined by the surface's purpose (feed, queue, browser) and applied consistently.

  **Rationale:** Configurability adds UI complexity (sort dropdowns, persistence) without clear benefit for a tool used by one person. The right default sort eliminates the need to choose.

- REQ-SORT-2: All sort functions are pure, exported, and independently testable. Sort logic lives in `lib/` modules, not inline in page components or rendering code.

  **Rationale:** The current codebase has sorting split between `lib/artifacts.ts`, `lib/commissions.ts`, inline sorts in `web/app/page.tsx:53-66` and `web/app/projects/[name]/page.tsx:54-60`, and a duplicated `sortCommissions()` in `web/components/dashboard/DependencyMap.tsx:38-44`. This makes behavior hard to verify and easy to break.

- REQ-SORT-3: Missing fields (empty string, undefined, null) sort after present fields. An artifact with no date sorts below one with a date when date is the sort axis. An artifact with no status sorts below one with a recognized status.

  **Rationale:** `lib/artifacts.ts:100-101` already implements this for dates. The principle should hold for all sort axes.

### Artifact Sort (Surfaces 1 and 2)

- REQ-SORT-4: Replace the three-bucket status model in `compareArtifacts()` with the actual status vocabulary used by `statusToGem()` in `lib/types.ts:152-172`. The status sort groups are:

  | Group | Priority | Statuses | Gem |
  |-------|----------|----------|-----|
  | Active work | 0 | `draft`, `open`, `pending`, `requested`, `blocked`, `queued` | pending (amber) |
  | In progress | 1 | `approved`, `active`, `current`, `in_progress`, `dispatched` | active (green) |
  | Terminal | 2 | `complete`, `resolved`, `implemented` | active (green) |
  | Closed negative | 3 | `superseded`, `outdated`, `wontfix`, `declined`, `failed`, `cancelled`, `abandoned` | blocked (red) |
  | Unknown | 4 | Anything not in the above lists | info (blue) |

  **Rationale:** The previous attempt (`STATUS_PRIORITY` at `lib/artifacts.ts:76-81`) only recognized `draft`, `open`, and `closed`. Every real status used in the project (e.g. `implemented`, `active`, `approved`) fell through to the default priority, making status sorting ineffective for 90%+ of artifacts. This mapping aligns with the gem color logic already in `statusToGem()` but reorders for browsing priority: work that needs attention surfaces first.

- REQ-SORT-5: **Surface 1 (Recent Scrolls):** Sort by `lastModified` descending (filesystem mtime, most recently changed first). Do not use `meta.date` (frontmatter creation date) or status grouping for this surface.

  **Rationale:** The dashboard feed answers "what changed recently?" Frontmatter `date` is typically set once at creation and never updated. `lastModified` (already available on every `Artifact` at `lib/types.ts:37`) reflects actual file changes, which is what "recent" means. The current implementation at `lib/artifacts.ts:251-257` uses `compareArtifacts()` which sorts by status then frontmatter date, meaning a `draft` spec from January surfaces above an `implemented` spec edited today. That's wrong for a recency feed.

- REQ-SORT-6: **Surface 2 (Artifact Tree):** Within each tree directory, sort leaf nodes by: (1) status group ascending (REQ-SORT-4 priorities), (2) title alphabetical ascending. Do not use date as a sort axis for tree browsing.

  **Rationale:** The tree provides structural grouping by directory. Within a directory, the user is scanning for a specific artifact, not looking at a timeline. Status grouping puts actionable items (drafts, pending) above completed work. Alphabetical title within each status group provides predictable, scannable ordering. Date adds noise in a browsing view where most artifacts in a directory were created around the same time.

- REQ-SORT-7: The `recentArtifacts()` function in `lib/artifacts.ts:251-257` must apply the Surface 1 sort (REQ-SORT-5), not the general `compareArtifacts()` sort. This is a separate sort function, not a parameter to `compareArtifacts()`.

  **Rationale:** `recentArtifacts()` is only consumed by the dashboard (Surface 1). `scanArtifacts()` is consumed by the project artifacts tab (Surface 2). These surfaces need different sorts. Splitting them into two sort functions (`compareArtifactsByRecency` and `compareArtifactsByStatusAndTitle`, or similar) keeps each function focused.

### Commission Sort (Surfaces 3 and 6)

- REQ-SORT-8: Consolidate commission sorting into a single `sortCommissions()` export in `lib/commissions.ts`. Remove the duplicate `sortCommissions()` in `web/components/dashboard/DependencyMap.tsx:38-44`. The `DependencyMap` component should import from `lib/commissions.ts`.

  **Rationale:** Two functions named `sortCommissions()` with different logic is a maintenance hazard. The `DependencyMap` version uses a simpler three-bucket model; `lib/commissions.ts` uses a four-bucket model with directional date sorting. The `lib/` version is more correct.

- REQ-SORT-9: The existing `sortCommissions()` in `lib/commissions.ts:254-267` is correct for its purpose and does not need changes to its sort logic. Its status groups (idle=0, active=1, failed=2, completed=3) and directional date sorting (oldest-first for active work, newest-first for completed) match real commission statuses and serve the workflow queue purpose.

### Meeting Sort (Surfaces 4 and 5)

- REQ-SORT-10: Extract the inline meeting sort from `web/app/projects/[name]/page.tsx:54-60` into a named, exported function in `lib/meetings.ts`. The sort logic (open first, then date descending) is correct for the Meetings tab and should not change.

- REQ-SORT-11: Extract the inline meeting request sort from `web/app/page.tsx:53-66` into a named, exported function in `lib/meetings.ts`. The sort logic (non-deferred first, deferred by `deferred_until` ascending, then date descending) is correct for the Pending Audiences surface and should not change.

### Commission Linked Artifacts (Surface 7)

- REQ-SORT-12: Commission linked artifacts retain their frontmatter array order. No sorting function is needed. The `linked_artifacts` array in commission frontmatter preserves chronological creation order as written by the daemon.

### Edge Cases

- REQ-SORT-13: When `meta.status` is an empty string (malformed frontmatter), treat it as unknown status (lowest priority in status sorting). `lib/artifacts.ts:24-29` already sets empty defaults for missing frontmatter.

- REQ-SORT-14: When `meta.date` is an empty string, the artifact sorts after artifacts with dates when date is the active sort axis. When `lastModified` is used (Surface 1), all artifacts have a valid `lastModified` (it comes from `fs.stat()`, not frontmatter), so this case does not arise for the dashboard feed.

- REQ-SORT-15: When `meta.title` is an empty string, display title falls back to the filename stem (existing behavior in `lib/artifact-grouping.ts:25-32` and `web/components/dashboard/RecentArtifacts.tsx:19-26`). Sorting should use the same fallback: sort by display title, not raw `meta.title`. This means the sort function needs access to the display title derivation or uses `relativePath` as a tiebreaker (which is equivalent since filenames are unique within a directory).

- REQ-SORT-16: Mixed artifact types in a single list (e.g. specs, plans, retros, meetings in the project artifacts tab) sort uniformly by the same rules. The tree view handles type separation through directory structure. Within a single directory, all artifacts follow the same sort regardless of their "type" (which is implicit in the directory, not a frontmatter field).

## Exit Points

| Exit | Target | Notes |
|------|--------|-------|
| `lib/artifacts.ts` | `compareArtifacts()` update, new `compareArtifactsByRecency()` | REQ-SORT-4, REQ-SORT-5, REQ-SORT-7 |
| `lib/artifact-grouping.ts` | `sortTreeLevel()` leaf sort behavior | REQ-SORT-6 |
| `lib/meetings.ts` | New `sortMeetings()` and `sortMeetingRequests()` exports | REQ-SORT-10, REQ-SORT-11 |
| `web/app/page.tsx` | Replace inline sort with `sortMeetingRequests()` call | REQ-SORT-11 |
| `web/app/projects/[name]/page.tsx` | Replace inline sort with `sortMeetings()` call, update `recentArtifacts` usage | REQ-SORT-10 |
| `web/components/dashboard/DependencyMap.tsx` | Remove duplicate `sortCommissions()`, import from `lib/commissions.ts` | REQ-SORT-8 |
| `tests/lib/artifacts.test.ts` | Update tests for new status vocabulary, add recency sort tests | REQ-SORT-4, REQ-SORT-5 |

## Success Criteria

- [ ] Dashboard "Recent Scrolls" shows artifacts ordered by filesystem modification time, not frontmatter date or status
- [ ] Project artifacts tab tree view sorts leaves within each directory by status group then title
- [ ] Status groups in artifact sort recognize all statuses from `statusToGem()`, not just draft/open/closed
- [ ] Commission sort is defined in one place (`lib/commissions.ts`), not duplicated in `DependencyMap.tsx`
- [ ] Meeting sort functions are exported from `lib/meetings.ts`, not inline in page components
- [ ] All sort functions are tested with edge cases (missing fields, unknown statuses, empty arrays)
- [ ] No behavioral change to commission sort logic or meeting sort logic (only location changes)

## AI Validation

**Defaults apply:**
- Unit tests with mocked time/network/filesystem/LLM calls
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Artifact status mapping test: verify every status in `ACTIVE_STATUSES`, `PENDING_STATUSES`, and `BLOCKED_STATUSES` from `lib/types.ts:152-172` maps to a defined sort group. No status recognized by `statusToGem()` should fall through to "unknown."
- Recency sort test: create artifacts with different `lastModified` timestamps and verify the dashboard sort returns newest first regardless of frontmatter date or status.
- Tree sort test: within a directory, verify `draft` sorts before `implemented`, and within the same status group, titles sort alphabetically.
- Commission sort deduplication test: verify `DependencyMap` uses the same sort function as `CommissionList`.

## Constraints

- Sort logic lives in `lib/` modules. UI components receive pre-sorted data and render it in order.
- No new dependencies. Sort functions use built-in comparison operators and string methods.
- The `Artifact` type in `lib/types.ts:31-38` is not modified. All needed fields are already present.
- Status vocabulary is defined by the three sets in `lib/types.ts:152-172` (`ACTIVE_STATUSES`, `PENDING_STATUSES`, `BLOCKED_STATUSES`). The sort spec aligns with these but regroups them for browsing priority, which differs from gem color semantics.
- This spec intentionally does not add user-configurable sorting. If that becomes needed, it would be a separate spec with UI for sort controls and state persistence.

## Context

- [Spec: Guild Hall Views](guild-hall-views.md): REQ-VIEW-12 zone 4 defines "Recent Artifacts" as "recently created or modified artifacts." The current sort does not honor "modified."
- [Spec: Artifact Tree View](artifact-tree-view.md): REQ-TREE-4 defines leaf node rendering but not sort order within a directory.
- Commit `95e423d`: Previous sorting implementation. Added `compareArtifacts()` and `STATUS_PRIORITY` to `lib/artifacts.ts`. The status vocabulary mismatch is the root cause of the follow-up commission to fix sorting.
