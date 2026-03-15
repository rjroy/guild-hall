---
title: "Review: Dashboard Selection Model"
date: 2026-03-15
status: complete
tags: [review, ui, dashboard, commission-filter, briefing]
reviewer: Thorne
scope: REQ-DASH-1 through REQ-DASH-23
---

# Review: Dashboard Selection Model

Three commissions (Dalton, phases 1-3) implemented the dashboard selection model spec across 14 plan steps. This review covers spec compliance, code correctness, error handling, test coverage, and integration gaps.

## Spec Compliance

### Satisfied Requirements

| REQ | Summary | Evidence |
|-----|---------|----------|
| REQ-DASH-1 | Two modes, all-projects default | `page.tsx` reads `?project` param; absent = all-projects |
| REQ-DASH-2 | "All Projects" sidebar entry | `WorkspaceSidebar.tsx:26-32`; links to `/`; selected when `\!selectedProject`; CSS padding aligns with gem-less layout |
| REQ-DASH-3 | All four cards respond to mode | Briefing, InFlight, RecentArtifacts, PendingAudiences all receive `selectedProject` |
| REQ-DASH-4 | "Task Dependency Map" replaced by "In Flight" | `DependencyMap.tsx` rewritten; title is "In Flight"; renders filtered list |
| REQ-DASH-5 | Filter panel extracted as shared component | `commission-filter.ts` (pure logic), `CommissionFilterPanel.tsx` (shared UI), used by both InFlight and CommissionList |
| REQ-DASH-6 | Same defaults as project page | Both consumers use `DEFAULT_STATUSES` from shared module |
| REQ-DASH-8 | InFlight is client component, receives CommissionMeta[] | `"use client"` directive present; props match spec |
| REQ-DASH-9 | Commission row layout | StatusBadge, title, worker display title, project label all present (see Finding 2 for worker nuance) |
| REQ-DASH-10 | Empty states | No-commissions: "No active commissions." (no filter panel). No-match: "No commissions match the current filter." |
| REQ-DASH-11 | Recent Scrolls all-projects fetch | `page.tsx:42-54` does `Promise.all` across projects, merges by lastModified, top 10 |
| REQ-DASH-12 | "Select a project" empty state removed | `RecentArtifacts.tsx:76`: shows "No recent artifacts." |
| REQ-DASH-13 | Pending Audiences filters by project | `page.tsx:117`: filters `allRequests` by `selectedProject` |
| REQ-DASH-14 | Silent first-project fallback removed | `page.tsx:104`: passes `selectedProject` directly, not `?? config.projects[0]?.name` |
| REQ-DASH-15 | All-projects briefing shows LLM synthesis | `generateAllProjectsBriefing()` produces synthesis; ManagerBriefing fetches `/api/briefing/all` |
| REQ-DASH-16 | All-projects briefing endpoint | Daemon route accepts `projectName=all` or missing; sequential per-project generation |
| REQ-DASH-17 | Synthesis prompt with Guild Master voice | Synthesis prompt at `briefing-generator.ts:419-425` includes project sections and cross-cutting instructions |
| REQ-DASH-18 | All-projects cache at `_all.json` | `allProjectsBriefingCachePath()` returns `_all.json`; composite SHA-256 hash; same dual rule |
| REQ-DASH-19 | `briefingCacheTtlMinutes` config | Added to `AppConfig`, Zod schema (`z.number().int().positive().optional()`), and briefing-generator; default 60 |
| REQ-DASH-20 | Uses `systemModels.briefing` | Both per-project and synthesis use `deps.config.systemModels?.briefing ?? "sonnet"` |
| REQ-DASH-22 | REQ-CTREE-* superseded | `build-tree-list.ts` deleted; no remaining imports; tree list tests removed |
| REQ-DASH-23 | Recent-scrolls-empty-state resolved | Issue file has `status: resolved` with resolution note |

REQ-DASH-21 is a documentation-level statement (refines REQ-VIEW-10). Not testable in code.

### Violated Requirements

**REQ-DASH-7**: "In single-project mode, the card receives only the selected project's commissions. Project labels are omitted in single-project mode (redundant with the selection)."

The second sentence is satisfied (project labels hidden via `showProjectLabel = \!selectedProject`). The first sentence is not.

File: `web/app/page.tsx:107`

```tsx
<InFlight commissions={allCommissions} selectedProject={selectedProject} />
```

`allCommissions` contains commissions from ALL registered projects regardless of mode. It's built from `Promise.all` across all projects (lines 58-78) and never filtered. InFlight receives every commission in single-project mode. It hides project labels, but commissions from other projects still appear in the list.

Impact: A user selects project-alpha, and the "In Flight" card shows commissions from project-beta too. Filter counts reflect all-project totals. The only visual difference between modes is the presence of project labels.

Fix: Filter before passing to InFlight.

```tsx
const displayedCommissions = selectedProject
  ? allCommissions.filter(c => c.projectName === selectedProject)
  : allCommissions;
<InFlight commissions={displayedCommissions} selectedProject={selectedProject} />
```

## Findings

### Finding 1: REQ-DASH-7 violation (covered above)

Severity: defect. The In Flight card shows wrong data in single-project mode.

### Finding 2: Worker display fallback inconsistency between InFlight and CommissionList

File: `web/components/dashboard/DependencyMap.tsx:83-86`
```tsx
{commission.workerDisplayTitle && (
  <span className={styles.worker}>{commission.workerDisplayTitle}</span>
)}
```

File: `web/components/commission/CommissionList.tsx:127-130`
```tsx
{commission.worker && (
  <span className={styles.worker}>{commission.workerDisplayTitle || commission.worker}</span>
)}
```

CommissionList shows `workerDisplayTitle || worker` (falls back to the raw worker name). InFlight only shows `workerDisplayTitle` (no fallback). A commission with `worker: "dalton"` and `workerDisplayTitle: ""` would show "dalton" on the project page but nothing on the dashboard.

REQ-DASH-9 says "worker display title," so InFlight's behavior is spec-compliant. But the visual inconsistency between views may confuse users.

### Finding 3: All-projects synthesis proceeds with error-message inputs

File: `daemon/services/briefing-generator.ts:400-412`

When per-project briefing generation fails, the result text starts with `"Unable to assemble"` or `"Unable to generate"`. The code logs a warning (line 411) but still feeds these error messages into the synthesis prompt. The LLM then tries to synthesize error messages, producing unpredictable output.

Impact: If all projects have cold caches and the SDK is unreachable, the synthesis prompt contains only error messages. The synthesis LLM might produce something like "All projects are experiencing issues assembling their state," which is misleading (the projects are fine, the briefing infrastructure failed).

One approach: if all projects have `FALLBACK_MARKERS`-prefixed text, skip synthesis and return a direct error message.

### Finding 4: WorkspaceSidebar renders "All Projects" in a separate `<ul>` from project items

File: `web/components/dashboard/WorkspaceSidebar.tsx:25-33` vs `38-73`

"All Projects" lives in its own `<ul className={styles.projectList}>`, followed by the projects in another `<ul className={styles.projectList}>`. The spec says "first item in the project list" (singular). Two separate list elements may produce a visual gap depending on how `projectList` margins interact.

Impact: Cosmetic. In practice the gap is likely unnoticeable because `ul` has no default margin with `list-style: none`. But changes to `.projectList` CSS would affect both lists independently.

### Finding 5: `CommissionFilterPanel` props are minimal and correct

File: `web/components/commission/CommissionFilterPanel.tsx:13-18`

Props: `commissions` (for count annotations), `selected`, `onToggle`, `onReset`. The panel holds no state. This matches the spec requirement for Level 1 extraction (filter panel only, no list rendering).

No issue here. Confirming the review scope question was investigated.

### Finding 6: No server-only imports in client components

Verified: `DependencyMap.tsx`, `CommissionFilterPanel.tsx`, `CommissionList.tsx`, and `ManagerBriefing.tsx` contain no `node:fs`, `node:path`, or other server-only imports. `RecentArtifacts.tsx` remains a server component (no `"use client"`).

No issue.

### Finding 7: TTL computation is consistent end-to-end

`cacheTtlMs` is computed once in `createBriefingGenerator` (line 268):
```typescript
const cacheTtlMs = (deps.config.briefingCacheTtlMinutes ?? 60) * 60 * 1000;
```
Used identically in `generateBriefing` (line 282) and `generateAllProjectsBriefing` (line 390). Config wiring: `lib/types.ts` (type), `lib/config.ts` (Zod schema), `briefing-generator.ts` (consumption). Default 60 applied at consumption site.

No issue.

### Finding 8: Dead code cleanup is complete

`build-tree-list.ts` is deleted. Grep for `build-tree-list` across `web/` returns zero results. `commissionHref` re-export from `DependencyMap.tsx` is removed; all consumers import from `@/lib/commission-href`. `buildTreeList` tests removed from `dashboard-commissions.test.ts`.

No issue.

### Finding 9: Next.js static route precedence is correct

`web/app/api/briefing/all/route.ts` is a static segment. In Next.js App Router, static segments match before dynamic segments (`[projectName]`). A request to `/api/briefing/all` resolves to this route, not to `[projectName]/route.ts` with `projectName="all"`.

No issue.

### Finding 10: Error handling in `generateAllProjectsBriefing` has a three-tier cascade

File: `daemon/services/briefing-generator.ts:427-445`

Full SDK → single-turn → concatenation fallback. Each tier logs on failure (`log.error` or `log.warn`). The concatenation fallback is deterministic and always produces output. The route handler (`briefing.ts:28-39`) catches and returns 500 for any unhandled exception.

The cascade is reasonable. The concern from Finding 3 (error-message inputs to synthesis) is the gap, not the fallback chain itself.

## Test Coverage

### Tests specified in Plan Step 12

| Test Category | Location | Present | Notes |
|---------------|----------|---------|-------|
| Shared filter functions regression | `tests/components/commission-list.test.tsx` | Yes | 15 tests, imports updated to `commission-filter.ts` |
| Config TTL parsing | `tests/lib/config.test.ts` | Yes | 5 tests (parse, default, reject non-integer/zero/negative, YAML round-trip) |
| Briefing generator all-projects | `tests/daemon/services/briefing-generator.test.ts` | Yes | 5 tests (no-projects, per-project calls, composite hash, _all.json cache, no-SDK fallback) |
| Composite HEAD hash change | `tests/daemon/services/briefing-generator.test.ts` | Yes | Advances one project's HEAD + expires TTL, confirms regeneration |
| `allProjectsBriefingCachePath` | `tests/lib/paths.test.ts` | Yes | Returns `_all.json` path |
| Briefing route all-projects | `tests/daemon/routes/briefing.test.ts` | Yes | 3 tests (projectName=all, omitted, error) |
| Recent artifacts merge | `tests/components/recent-artifacts-merge.test.ts` | Yes | 5 tests (sort, limit, projectName preservation, empty, single) |
| Configurable TTL behavior | `tests/daemon/services/briefing-generator.test.ts` | Yes | 3 tests (30-min stale, 120-min valid, default 60-min) |

### Test quality observations

The recent-artifacts-merge test (`recent-artifacts-merge.test.ts`) defines its own `mergeArtifacts` function that mirrors the logic in `page.tsx`. This validates consistency (same algorithm), not correctness of the actual page code. If the page's merge logic drifts from this test's reimplementation, the test would still pass while the page is wrong. This is a known pattern limitation for server component testing.

The briefing generator tests create real git repos in temp directories (`initGitRepo`, `advanceHead`) for HEAD commit resolution. This is integration-level testing for what could be a unit test with mocked `readHeadCommit`. The trade-off: slower tests, but higher confidence that the git-parsing code works. Acceptable.

## Summary

All 23 REQ-DASH requirements are addressed. One is violated in implementation:

1. **REQ-DASH-7**: InFlight receives unfiltered commissions in single-project mode. One-line fix in `page.tsx`.

Two additional code-level concerns:

2. **Worker display fallback inconsistency** between InFlight and CommissionList. InFlight omits the raw worker name fallback that CommissionList provides.

3. **Synthesis with error-message inputs**: when all per-project briefings fail, the synthesis LLM gets error messages as input rather than a clean failure signal.

Everything else is clean: correct client/server boundaries, consistent TTL wiring, shared filter panel with minimal props, dead code removed, proper empty states, comprehensive test coverage matching the plan.
