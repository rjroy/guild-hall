---
title: Dashboard Selection Model
date: 2026-03-15
status: executed
tags: [ux, ui, dashboard, project-selection, briefing, commission-filter, in-flight]
modules:
  [
    apps/web/app/page,
    apps/web/components/dashboard,
    apps/web/components/commission,
    apps/daemon/services/briefing-generator,
    apps/daemon/routes/briefing,
    lib/types,
    lib/config,
    lib/paths,
  ]
related:
  - .lore/specs/ui/dashboard-selection-model.md
  - .lore/brainstorm/dashboard-selection-model.md
  - .lore/plans/infrastructure/improve-briefing-full-sdk-pattern.md
  - .lore/specs/ui/commission-list-filtering.md
---

# Plan: Dashboard Selection Model

## Spec Reference

**Spec**: `.lore/specs/ui/dashboard-selection-model.md`
**Brainstorm**: `.lore/brainstorm/dashboard-selection-model.md` (status: resolved — all design decisions final)
**Related executed plan**: `.lore/plans/infrastructure/improve-briefing-full-sdk-pattern.md` (briefing generator SDK pattern already in place)

Requirements addressed:

| REQ | Summary | Steps |
|-----|---------|-------|
| REQ-DASH-1 | Two modes: all-projects (default) and single-project | 4, 5 |
| REQ-DASH-2 | "All Projects" sidebar entry, first, selected by default | 4 |
| REQ-DASH-3 | All four cards respond to selected mode | 3, 5, 6, 7, 9 |
| REQ-DASH-4 | Replace "Task Dependency Map" with "In Flight" card | 3 |
| REQ-DASH-5 | Extract filter panel as shared component | 1, 2 |
| REQ-DASH-6 | "In Flight" card uses same defaults as project page | 1, 3 |
| REQ-DASH-7 | All-projects mode shows project labels on commission rows | 3 |
| REQ-DASH-8 | "In Flight" card is a client component, receives CommissionMeta[] | 3, 5 |
| REQ-DASH-9 | Commission row: StatusBadge, title, worker, project label | 3 |
| REQ-DASH-10 | Empty states for no-match vs no-commissions | 3 |
| REQ-DASH-11 | Recent Scrolls fetches all-projects in all-projects mode | 6 |
| REQ-DASH-12 | Remove "Select a project" empty state from Recent Scrolls | 6 |
| REQ-DASH-13 | Pending Audiences filters by project in single-project mode | 7 |
| REQ-DASH-14 | Remove silent first-project fallback in Briefing | 10 |
| REQ-DASH-15 | All-projects briefing shows LLM-synthesized cross-project text | 8, 9 |
| REQ-DASH-16 | All-projects briefing endpoint, seeded from cached per-project briefings | 8 |
| REQ-DASH-17 | Synthesis prompt uses Guild Master voice, cross-cutting observations | 8 |
| REQ-DASH-18 | All-projects cache at `_all.json`, keyed by composite HEAD hash | 8 |
| REQ-DASH-19 | `briefingCacheTtlMinutes` config value, default 60 | 8 |
| REQ-DASH-20 | All-projects synthesis uses `systemModels.briefing` model | 8 |
| REQ-DASH-22 | REQ-CTREE-1–REQ-CTREE-9 superseded (tree list removed from dashboard) | 3 |
| REQ-DASH-23 | Resolve recent-scrolls-empty-state issue | 11 |

## Codebase Context

**Current dashboard (`apps/web/app/page.tsx`):**
- Reads `selectedProject` from URL `?project=name`
- Fetches all-project commissions and meeting requests via `Promise.all`
- Fetches artifacts only when `selectedProject` is set — all-projects artifacts returns empty
- Passes `selectedProject ?? config.projects[0]?.name` to `ManagerBriefing` (the silent fallback REQ-DASH-14 must remove)
- Passes `allCommissions` (all projects) to `DependencyMap`
- Passes unfiltered `allRequests` to `PendingAudiences`

**`DependencyMap.tsx`** (`apps/web/components/dashboard/`): Server component. Builds a tree list from `buildDependencyGraph` + `buildTreeList`. Renders under "Task Dependency Map" title. Also re-exports `commissionHref`. Depends on `build-tree-list.ts` (local) and `lib/dependency-graph.ts` (shared). After the rewrite, `build-tree-list.ts` becomes dead code and should be deleted. `lib/dependency-graph.ts` (`buildDependencyGraph`, `getNeighborhood`, etc.) stays — used by the commission detail neighborhood graph.

**`WorkspaceSidebar.tsx`**: No "All Projects" entry. Selected state is `project.name === selectedProject`. When no project is selected, nothing shows as selected.

**`RecentArtifacts.tsx`**: Shows "Select a project to view recent artifacts" when `projectName` is undefined. Server component. `artifactHref()` takes a separate `projectName` argument — each artifact row currently shares the same project name. In all-projects mode, each artifact needs its own project label.

**`PendingAudiences.tsx`**: Shows all requests regardless of mode. Filtering is straightforward at the page level.

**`ManagerBriefing.tsx`**: Client component. Returns early (shows "Select a project" empty state) when `projectName` is undefined. Fetches `/api/briefing/${projectName}`. The all-projects mode needs a different fetch target when `projectName` is undefined.

**`CommissionList.tsx`** (`apps/web/components/commission/`): Already a client component with filter state. Exports `DEFAULT_STATUSES`, `FILTER_GROUPS`, `filterCommissions`, `countByStatus`, `isDefaultSelection` — these are what the "In Flight" card needs. The filter panel JSX lives inline in the component. Both the functions and the panel need to move to a shared location.

**`briefing-generator.ts`**: Has `generateBriefing(projectName)`. Caches to `briefingCachePath(ghHome, projectName)` → `~/.guild-hall/state/briefings/<projectName>.json`. Cache entry shape: `{ text, generatedAt, headCommit }`. `CACHE_TTL_MS = 60 * 60 * 1000` is hardcoded. The all-projects briefing needs `generateAllProjectsBriefing()` with cache at `_all.json` keyed by a composite HEAD hash.

**`apps/daemon/routes/briefing.ts`**: GET `/coordination/review/briefing/read?projectName=X`. Returns 400 when `projectName` is missing. Needs to accept `projectName=all` as a trigger for all-projects synthesis.

**`apps/web/app/api/briefing/[projectName]/route.ts`**: Proxies to daemon. The dynamic segment `[projectName]` matches "all" as a literal value; a static route at `apps/web/app/api/briefing/all/route.ts` would take precedence in Next.js routing and is cleaner to reason about.

**`AppConfig` / `lib/types.ts`**: `systemModels.briefing` exists. `briefingCacheTtlMinutes` does not exist yet — must be added.

**`lib/paths.ts`**: `briefingCachePath(ghHome, projectName)` exists. Need `allProjectsBriefingCachePath(ghHome)` for `_all.json`.

**`CommissionMeta`** (from `lib/commissions.ts`): Has `projectName` field — already set by the daemon on each response. The "In Flight" card can use it directly for project labels and `commissionHref()` construction.

## Implementation Steps

### Step 1: Extract filter functions and constants to shared module

**Files:**
- NEW: `apps/web/components/commission/commission-filter.ts`
- MODIFIED: `apps/web/components/commission/CommissionList.tsx`
- MODIFIED: `apps/web/tests/components/commission-list.test.tsx` (import path update only)

**Addresses:** REQ-DASH-5, REQ-DASH-6

Move the five exported items out of `CommissionList.tsx` into a standalone module that both the project page and the dashboard can import:

```
apps/web/components/commission/commission-filter.ts
```

The module exports exactly: `DEFAULT_STATUSES`, `FILTER_GROUPS`, `filterCommissions`, `countByStatus`, `isDefaultSelection`. No component rendering — pure logic and constants only.

In `CommissionList.tsx`, replace the inline declarations with imports from `./commission-filter`. Update `apps/web/tests/components/commission-list.test.tsx` to import from `@/apps/web/components/commission/commission-filter` instead of `@/apps/web/components/commission/CommissionList`. This is the canonical location for the filter tests. Step 12 does not create a new test file — the tests stay in `commission-list.test.tsx` with updated imports.

Run `bun test apps/web/tests/components/commission-list.test.tsx` — all tests should pass unchanged. This step is pure refactoring with no behavior change.

### Step 2: Extract CommissionFilterPanel as shared component

**Files:**
- NEW: `apps/web/components/commission/CommissionFilterPanel.tsx`
- NEW: `apps/web/components/commission/CommissionFilterPanel.module.css`
- MODIFIED: `apps/web/components/commission/CommissionList.tsx`
- MODIFIED: `apps/web/components/commission/CommissionList.module.css`

**Addresses:** REQ-DASH-5

Extract the filter panel JSX from `CommissionList.tsx` into a standalone client component. The panel receives what it needs to render and fire callbacks — it does not hold state:

```typescript
interface CommissionFilterPanelProps {
  commissions: CommissionMeta[];   // unfiltered, for count annotations
  selected: Set<string>;
  onToggle: (status: string) => void;
  onReset: () => void;
}
```

The panel renders the four group rows (Idle, Active, Failed, Done), checkbox labels with `StatusBadge` and count annotations, and the conditional Reset button. It imports `FILTER_GROUPS`, `DEFAULT_STATUSES`, `countByStatus`, `isDefaultSelection` from `./commission-filter` and `statusToGem` from `@/lib/types`.

Move all `.filterPanel`, `.filterRow`, `.filterGroupLabel`, `.filterCheckboxes`, `.filterCheckbox`, `.filterCount`, `.filterReset`, `.resetButton` CSS from `CommissionList.module.css` to `CommissionFilterPanel.module.css`.

In `CommissionList.tsx`, replace the inline filter panel JSX with `<CommissionFilterPanel>`. The `selected` state and toggle/reset handlers stay in `CommissionList` (they belong to the list consumer).

This step is still pure refactoring — run the full test suite to confirm nothing broke before moving on.

### Step 3: Rewrite DependencyMap.tsx as "In Flight" client component

**Files:**
- MODIFIED: `apps/web/components/dashboard/DependencyMap.tsx` (complete rewrite)
- MODIFIED: `apps/web/components/dashboard/DependencyMap.module.css` (styles for new layout)
- DELETED: `apps/web/components/dashboard/build-tree-list.ts` (no other consumers after rewrite)
- MODIFIED: `apps/web/tests/components/dashboard-commissions.test.tsx` (remove `buildTreeList` tests, update `commissionHref` import)

**Addresses:** REQ-DASH-4, REQ-DASH-6, REQ-DASH-7, REQ-DASH-8, REQ-DASH-9, REQ-DASH-10, REQ-DASH-22

Rewrite `DependencyMap.tsx` as a client component named `InFlight` (the default export keeps its name; the file stays `DependencyMap.tsx` per the spec constraint). Add `"use client"` as the first line.

New props interface:

```typescript
interface InFlightProps {
  commissions: CommissionMeta[];
  selectedProject?: string;   // undefined = all-projects mode
}
```

The component:

1. Initializes filter state: `useState<Set<string>>(() => new Set(DEFAULT_STATUSES))` from `@/apps/web/components/commission/commission-filter`.
2. Computes `filtered = filterCommissions(commissions, selected)`.
3. Derives `showProjectLabel = !selectedProject` — project labels appear only in all-projects mode.
4. Renders `<Panel title="In Flight">`.
5. Empty state when `commissions.length === 0`: "No active commissions." No filter panel.
6. When commissions exist, renders `<CommissionFilterPanel>` followed by the commission list.
7. When `filtered.length === 0` but `commissions.length > 0`: "No commissions match the current filter."
8. Commission row (compact, single line where possible): `StatusBadge` gem + title + worker display title + project label (if `showProjectLabel`). Row links to `commissionHref(commission.projectName, commission.commissionId)`.

Remove the `commissionHref` re-export that was in the old `DependencyMap.tsx`. Anything importing `commissionHref` from this file should instead import it from `@/lib/commission-href` directly. Check for consumers: `grep -r "from.*DependencyMap"` in the web and test layers — this includes `apps/web/tests/components/dashboard-commissions.test.tsx`, which imports `commissionHref` from the old path and must be updated to `@/lib/commission-href`.

Delete `build-tree-list.ts` — no other file imports it after this rewrite. The `buildTreeList` tests in `apps/web/tests/components/dashboard-commissions.test.tsx` test code that no longer exists; delete those test cases. Keep the `commissionHref`, `sortCommissions`, `buildDependencyGraph`, and `getNeighborhood` tests in that file — they test `lib/` code that is unchanged.

Write unit tests for InFlight in `apps/web/tests/components/in-flight.test.tsx`. Since it is a client component with `useState`, test the underlying pure functions (already covered via updated imports in `commission-list.test.tsx`) rather than rendering. The filter functions are the testable surface; the React state machinery is not. Mode-switching behavior (all-projects vs single-project prop passing from the server page) cannot be unit-tested at the page boundary. It is deferred to the Step 14 manual checklist.

### Step 4: Add "All Projects" entry to WorkspaceSidebar

**Files:**
- MODIFIED: `apps/web/components/dashboard/WorkspaceSidebar.tsx`
- MODIFIED: `apps/web/components/dashboard/WorkspaceSidebar.module.css`

**Addresses:** REQ-DASH-1, REQ-DASH-2

Add "All Projects" as the first item in the project list, before the `projects.map(...)` render. It is selected (`isSelected = !selectedProject`) when no project is in the URL. It links to `/`. It has no `GemIndicator`.

```tsx
<li className={[styles.projectItem, !selectedProject ? styles.selected : ""].filter(Boolean).join(" ")}>
  <Link href="/" className={styles.projectLink}>
    <div className={styles.projectInfo}>
      <span className={styles.projectName}>All Projects</span>
    </div>
  </Link>
</li>
```

The "All Projects" item does not have a "View >" link (no project detail page for aggregated view). The indent where `GemIndicator` would normally sit can be left empty or use a minor CSS adjustment to keep alignment. Check the CSS to see if the layout assumes `GemIndicator` is always present; if so, add a `styles.allProjectsItem` modifier that removes the icon slot.

The empty-project-list guard (`projects.length === 0`) still applies to the project items. The "All Projects" entry renders regardless of whether any projects are registered.

### Step 5: Update page.tsx to pass selectedProject to InFlight card

**Files:**
- MODIFIED: `apps/web/app/page.tsx`

**Addresses:** REQ-DASH-3, REQ-DASH-7, REQ-DASH-8

The `DependencyMap` import still works (file not renamed). Add `selectedProject` as a prop:

```tsx
<DependencyMap commissions={allCommissions} selectedProject={selectedProject} />
```

In all-projects mode (`selectedProject` undefined), `allCommissions` already contains commissions from all projects with `projectName` set on each. In single-project mode, all commissions in `allCommissions` share the same `projectName`. The "In Flight" card handles the display difference via `showProjectLabel` internally.

### Step 6: Fix Recent Scrolls all-projects fetch

**Files:**
- MODIFIED: `apps/web/app/page.tsx`
- MODIFIED: `lib/types.ts` (add `ArtifactWithProject` export)
- MODIFIED: `apps/web/components/dashboard/RecentArtifacts.tsx`
- MODIFIED: `apps/web/components/dashboard/RecentArtifacts.module.css` (if project label styles needed)

**Addresses:** REQ-DASH-11, REQ-DASH-12

**In `page.tsx`:** Change the artifact fetch from "only when `selectedProject` is set" to:

- If `selectedProject` is set: fetch for that project only (current behavior).
- If `selectedProject` is not set: `Promise.all` across all projects, merge results by `lastModified` descending, take top 10.

Add to `lib/types.ts`:

```typescript
export type ArtifactWithProject = Artifact & { projectName: string };
```

Using a shared type avoids duplication between `page.tsx` and `RecentArtifacts.tsx`, and avoids circular imports since `lib/types.ts` has no imports from `web/`.

When fetching per-project artifacts in `page.tsx`, annotate each with `projectName`:

```typescript
const perProjectArtifacts = await Promise.all(
  config.projects.map(async (p) => {
    const r = await fetchDaemon<{ artifacts: Artifact[] }>(
      `/workspace/artifact/document/list?projectName=${encodeURIComponent(p.name)}&recent=true&limit=10`
    );
    if (!r.ok) return [];
    return r.data.artifacts.map((a) => ({ ...a, projectName: p.name }));
  })
);
const artifacts: ArtifactWithProject[] = perProjectArtifacts
  .flat()
  .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
  .slice(0, 10);
```

Pass `artifacts` and `selectedProject` to `RecentArtifacts`. `RecentArtifacts` now accepts `ArtifactWithProject[]` instead of `Artifact[]`.

**In `RecentArtifacts.tsx`:**

- Update the props type to accept `artifacts: ArtifactWithProject[]` (import the type from `@/apps/web/app/page` is not clean — define `ArtifactWithProject` in a shared location, or inline it in `RecentArtifacts.tsx` as a local interface. Prefer defining it in `lib/types.ts` as `export type ArtifactWithProject = Artifact & { projectName: string }` so both files use the same type without circular imports).
- Remove the "Select a project to view recent artifacts" early return. Replace with: if `artifacts.length === 0`, show "No recent artifacts." — no mention of selecting a project.
- In single-project mode (`selectedProject` is set), omit the project label (redundant).
- In all-projects mode (`selectedProject` is undefined), show a project label below the artifact title. Use existing `styles.date` CSS pattern as a model for the label text style, or add `styles.projectLabel`.
- `artifactHref()` already takes `(artifact, projectName)`. Pass `artifact.projectName` for each row.

Write unit test for the page-level merge: given two per-project artifact arrays, confirms sorted order and top-10 limit.

### Step 7: Filter Pending Audiences by selected project

**Files:**
- MODIFIED: `apps/web/app/page.tsx`

**Addresses:** REQ-DASH-13

`PendingAudiences` already receives `MeetingMeta[]`. `MeetingMeta` has `projectName`. The filter is one line in `page.tsx`:

```typescript
const displayedRequests = selectedProject
  ? allRequests.filter((r) => r.projectName === selectedProject)
  : allRequests;
```

Pass `displayedRequests` to `PendingAudiences` instead of `allRequests`. No changes to `PendingAudiences.tsx`.

### Step 8: Add briefingCacheTtlMinutes config

**Files:**
- MODIFIED: `lib/types.ts`
- MODIFIED: `lib/config.ts`
- MODIFIED: `apps/daemon/services/briefing-generator.ts`

**Addresses:** REQ-DASH-19

In `lib/types.ts`, add to `AppConfig`:

```typescript
briefingCacheTtlMinutes?: number;
```

In `lib/config.ts`, add to the Zod schema alongside `systemModels`:

```typescript
briefingCacheTtlMinutes: z.number().int().positive().optional(),
```

In `briefing-generator.ts`, replace the hardcoded constant:

```typescript
// Before
const CACHE_TTL_MS = 60 * 60 * 1000;

// After (computed inside createBriefingGenerator using deps.config)
const cacheTtlMs = (deps.config.briefingCacheTtlMinutes ?? 60) * 60 * 1000;
```

Use `cacheTtlMs` wherever `CACHE_TTL_MS` was referenced. Both `generateBriefing` and the upcoming `generateAllProjectsBriefing` use the same value.

Write unit test: `briefingCacheTtlMinutes: 30` in config causes a cache entry at 31 minutes to be stale; `briefingCacheTtlMinutes: 120` makes it still valid at 90 minutes.

### Step 9: Add all-projects briefing to daemon

**Files:**
- MODIFIED: `lib/paths.ts`
- MODIFIED: `apps/daemon/services/briefing-generator.ts`
- MODIFIED: `apps/daemon/routes/briefing.ts`

**Addresses:** REQ-DASH-15, REQ-DASH-16, REQ-DASH-17, REQ-DASH-18, REQ-DASH-20

**`lib/paths.ts`:** Add:

```typescript
export function allProjectsBriefingCachePath(ghHome: string): string {
  return path.join(ghHome, "state", "briefings", "_all.json");
}
```

**`briefing-generator.ts`:** Add `generateAllProjectsBriefing()` to the returned object from `createBriefingGenerator`:

1. **Composite HEAD hash**: Read the HEAD commit of each project's integration worktree using the existing `readHeadCommit()`. Concatenate all head commits (sorted by project name for determinism). Hash with `crypto.createHash("sha256")` from `node:crypto`. This becomes the cache key.

2. **Cache check**: Read `_all.json` via `readCacheFile`. Same dual rule: valid if HEAD hash matches OR within TTL.

3. **If cache miss**: For each project, call `this.generateBriefing(projectName)` with `await` in a sequential loop (not `Promise.all`). This reuses the per-project cache — projects with valid caches return immediately; projects with stale caches trigger an LLM session. Sequential is required by REQ-DASH-16 ("one LLM session at a time, not parallel"). Collect the briefing text for each project after all have resolved.

4. **Synthesis session**: Build a synthesis prompt that includes each project's briefing text and instructions for the Guild Master to produce cross-cutting observations. Run through `generateWithFullSdk` pattern (same infrastructure as per-project briefings), or if `prepDeps` is absent, run a single-turn synthesis. The synthesis prompt:

```
Cross-project status synthesis for Guild Hall.

The following briefings were generated for each registered project:

[PROJECT: project-a]
[briefing text]

[PROJECT: project-b]
[briefing text]

...

Synthesize these into a unified Guild Hall briefing. Cover: which projects have the most activity, which have blocked or failed commissions, any cross-project patterns, and what needs the most attention. Write in the Guild Master's voice. Plain prose, no headers or bullets.
```

5. **Cache result** to `allProjectsBriefingCachePath(deps.guildHallHome)` with `headCommit` set to the composite hash.

6. **Return** `BriefingResult` with `briefing`, `generatedAt`, `cached`.

The `generateAllProjectsBriefing` method must be added to the returned object alongside `generateBriefing` and `invalidateCache`.

**`apps/daemon/routes/briefing.ts`:** Handle `projectName=all` by calling `generateAllProjectsBriefing()`:

```typescript
if (!projectName || projectName === "all") {
  const result = await deps.briefingGenerator.generateAllProjectsBriefing();
  return c.json(result);
}
```

Remove the 400 error for missing `projectName` — "all projects" is now a valid call. Add an `OperationDefinition` entry for the all-projects variant.

Write unit tests:
- Composite HEAD hash changes when any project's HEAD changes (mock `readHeadCommit`).
- Cache is valid within TTL when composite hash matches.
- Cache misses trigger per-project generation calls sequentially.
- `generateAllProjectsBriefing` called with no projects returns a sensible message (no crash).

### Step 10: Update web layer for all-projects briefing

**Files:**
- NEW: `apps/web/app/api/briefing/all/route.ts`
- MODIFIED: `apps/web/components/dashboard/ManagerBriefing.tsx`

**Addresses:** REQ-DASH-15

**`apps/web/app/api/briefing/all/route.ts`:** New static Next.js route. In Next.js, static segments take precedence over `[projectName]`:

```typescript
import { NextResponse } from "next/server";
import { daemonFetch, isDaemonError } from "@/lib/daemon-client";

export async function GET() {
  const result = await daemonFetch(`/coordination/review/briefing/read?projectName=all`);
  if (isDaemonError(result)) {
    return NextResponse.json({ error: "Daemon is not running" }, { status: 503 });
  }
  const body = (await result.json()) as Record<string, unknown>;
  return NextResponse.json(body, { status: result.status });
}
```

**`ManagerBriefing.tsx`:** Change the fetch target selection in `useEffect`:

```typescript
const url = projectName
  ? `/api/briefing/${encodeURIComponent(projectName)}`
  : `/api/briefing/all`;
```

Remove the `if (!projectName) return;` early exit. The component now always fetches — either the project-specific briefing or the all-projects synthesis.

Remove the "Select a project to see the briefing" empty state from the JSX.

The loading skeleton and error states are unchanged — they apply to both modes.

### Step 11: Remove silent briefing fallback in page.tsx

**Files:**
- MODIFIED: `apps/web/app/page.tsx`

**Addresses:** REQ-DASH-14

Change the prop passed to `ManagerBriefing`:

```tsx
// Before
<ManagerBriefing projectName={selectedProject ?? config.projects[0]?.name} />

// After
<ManagerBriefing projectName={selectedProject} />
```

In all-projects mode, `selectedProject` is `undefined`, and `ManagerBriefing` now fetches the all-projects briefing (Step 10). In single-project mode, it fetches the project briefing (unchanged behavior).

### Step 12: Unit tests for all new logic

**Files:**
- NEW or MODIFIED: `lib/tests/briefing-generator.test.ts` (add all-projects tests)
- NEW or MODIFIED: `lib/tests/config.test.ts` (add `briefingCacheTtlMinutes` tests)
- NEW or MODIFIED: `apps/web/tests/components/commission-filter.test.ts`
- NEW: `lib/tests/paths.test.ts` (add `allProjectsBriefingCachePath`)

**Addresses:** Spec AI Validation custom tests

Tests to write:

**Shared filter module** (`apps/web/tests/components/commission-filter.test.ts`):
- Moved from `apps/web/tests/components/commission-list.test.tsx` (Step 1 updated the imports; these tests should already pass, but verify the new location is covered)

**Config TTL** (`lib/tests/config.test.ts`):
- `briefingCacheTtlMinutes: 30` is parsed correctly from config YAML
- Missing `briefingCacheTtlMinutes` defaults to `undefined` (not validated to 60 here — the default is applied in the generator)

**Briefing generator** (`lib/tests/briefing-generator.test.ts`):
- `briefingCacheTtlMinutes: 30` causes 31-minute-old cache to be stale
- `briefingCacheTtlMinutes: 120` keeps 90-minute-old cache valid
- Composite HEAD hash changes when one project's HEAD changes
- All-projects cache at `_all.json` is read and written correctly
- `generateAllProjectsBriefing()` calls `generateBriefing()` per project when cache is cold

**Paths** (`lib/tests/paths.test.ts` or alongside existing path tests):
- `allProjectsBriefingCachePath` returns `<ghHome>/state/briefings/_all.json`

**Mode passing**:
- Unit test at the page level is impractical (server component). Instead, verify via manual checklist in Step 14.

Run `bun test` — full suite must pass before proceeding.

### Step 13: Clean up and close issue

**Files:**
- DELETED: `apps/web/components/dashboard/build-tree-list.ts` (dead after Step 3)
- MODIFIED: `.lore/issues/recent-scrolls-empty-state.md` (status: `resolved`)

Delete `build-tree-list.ts`. Confirm no remaining imports:

```bash
grep -r "build-tree-list" web/ lib/ daemon/
```

Update the issue frontmatter: `status: resolved`. Add a resolution note in the body: "Resolved by dashboard selection model implementation. All-projects mode fetches artifacts across all projects (REQ-DASH-11, REQ-DASH-12)."

### Step 14: Validate against spec

**Addresses:** All REQ-DASH requirements

Launch a `lore-development:spec-reviewer` sub-agent (or `lore-development:plan-reviewer`) with the spec at `.lore/specs/ui/dashboard-selection-model.md` and the list of changed files. The agent should verify:

- Every REQ-DASH-1 through REQ-DASH-23 is addressed
- No spec requirements are missed
- The "In Flight" card renders correctly for both modes
- `briefingCacheTtlMinutes` wiring is complete end-to-end

Then launch `pr-review-toolkit:code-reviewer` on the changed files, with focus on:
- `"use client"` constraint: `DependencyMap.tsx` must be a client component; no server-only imports (`node:fs`, `node:path`) allowed
- `CommissionFilterPanel` receives only what it needs — no direct filter state ownership
- Silent failure patterns in `generateAllProjectsBriefing` (fallback behavior on empty project list, SDK failure)
- TTL computation: `(config.briefingCacheTtlMinutes ?? 60) * 60 * 1000` applied consistently
- No re-export of `commissionHref` from `DependencyMap.tsx` without a verified consumer

After review, run `bun run build` to confirm production build is clean.

## Delegation Guide

All 14 steps are for a single implementation agent. The steps are ordered by dependency — earlier steps must complete before later ones can proceed. The two natural pause points for verification are after Step 2 (refactoring complete, tests pass) and after Step 12 (all logic tested before review).

Steps with elevated risk:

| Step | Risk | Mitigation |
|------|------|-----------|
| Step 3 | Client component boundary violation | Check for server-only imports during code review |
| Step 9 | SDK session in `generateAllProjectsBriefing` fails silently | `pr-review-toolkit:silent-failure-hunter` on briefing-generator.ts changes |
| Step 10 | Next.js static route precedence | Verify `/api/briefing/all` resolves before `[projectName]` in dev and build |
| Step 12 | Briefing generator tests depend on mocked filesystem | Follow existing DI pattern; mock `readHeadCommit` and `readCacheFile` via injected helpers if needed |

Consult `.lore/lore-agents.md` for available agents. Use `pr-review-toolkit:silent-failure-hunter` specifically for Step 9 review.

## Open Questions

- **DependencyMap export audit**: `DependencyMap.tsx` currently re-exports `commissionHref` (line 12). The implementation agent must run `grep -r "commissionHref" web/` before removing this re-export to find any consumers and update their imports to `@/lib/commission-href`.

- **Sidebar "All Projects" item alignment**: The current sidebar layout uses `GemIndicator` as a visual anchor for project names. The "All Projects" entry omits it. If the layout shifts, add a spacer or `styles.allProjectsItem` modifier. The implementation agent should check visually in the browser.
