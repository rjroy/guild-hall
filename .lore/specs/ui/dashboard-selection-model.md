---
title: Dashboard selection model
date: 2026-03-15
status: implemented
tags: [ux, ui, dashboard, project-selection, briefing, commission-filter]
modules: [web/app/page, web/components/dashboard, web/components/commission, daemon/services/briefing-generator, daemon/routes/briefing, lib/config]
related:
  - .lore/brainstorm/ui/dashboard-selection-model.md
  - .lore/specs/ui/guild-hall-views.md
  - .lore/specs/ui/commission-list-filtering.md
  - .lore/specs/ui/commission-graph-to-tree-list.md
  - .lore/issues/recent-scrolls-empty-state.md
req-prefix: DASH
---

# Spec: Dashboard Selection Model

## Overview

The dashboard has two modes: "All Projects" (default) and single-project focus. A sidebar entry makes the mode explicit. All four dashboard cards (Briefing, In Flight, Recent Scrolls, Pending Audiences) respond consistently to the selected mode. The "Task Dependency Map" card is replaced by an "In Flight" filtered commission list that reuses the filter panel from the project page's Commission List. The all-projects briefing synthesizes cached per-project briefings through a Guild Master LLM session.

The brainstorm's decision summary recommended a static summary (Option C) first with LLM synthesis (Option B) as a follow-on. This spec implements Option B directly: the seeded-from-cached-briefings approach keeps cold-cache cost manageable, and there's no value in shipping a terse metrics panel that gets replaced immediately. Option C is skipped, not deferred.

Source decisions: `.lore/brainstorm/ui/dashboard-selection-model.md` (status: resolved).

## Entry Points

- User opens Guild Hall in a browser (lands on Dashboard in "All Projects" mode)
- User clicks a project in the sidebar (enters single-project mode via `?project=name`)
- User clicks "All Projects" in the sidebar (returns to all-projects mode via `/`)

## Requirements

### Selection model

- REQ-DASH-1: The dashboard has two modes: "All Projects" (no `?project` query parameter) and single-project (`?project=name`). "All Projects" is the default on every fresh page load.

- REQ-DASH-2: The sidebar renders an "All Projects" entry as the first item in the project list, below the "Active Projects" section heading. It links to `/`. It is visually distinct from project items (no project gem) but uses the same layout (name, optional description). When no project is selected, "All Projects" shows the selected highlight (`.selected` class). When a project is selected, that project shows the highlight and "All Projects" does not.

- REQ-DASH-3: All four dashboard cards (Briefing, In Flight, Recent Scrolls, Pending Audiences) respond to the selected mode. In "All Projects" mode, each card shows cross-project content. In single-project mode, each card filters to the selected project. No card diverges from the selection.

### In Flight card (replaces Task Dependency Map)

- REQ-DASH-4: The "Task Dependency Map" card is replaced by an "In Flight" card. The card title changes from "Task Dependency Map" to "In Flight." The card renders a filtered commission list instead of the tree list from REQ-CTREE-1.

- REQ-DASH-5: The filter panel from `CommissionList.tsx` is extracted into a shared component. The extraction is at the filter-panel level (Level 1): the shared component renders the checkbox groups, count annotations, and reset button. List rendering stays specific to each consumer. The pure filter functions (`filterCommissions`, `countByStatus`, `isDefaultSelection`), constants (`FILTER_GROUPS`, `DEFAULT_STATUSES`), and their tests move to a shared location alongside the panel component.

- REQ-DASH-6: The "In Flight" card uses the same default statuses as the project page filter: `pending`, `blocked`, `dispatched`, `in_progress`, `sleeping`, `active`, `failed`, `cancelled` on; `paused`, `abandoned`, `completed` off. The filter panel renders identically to the project page filter (four groups: Idle, Active, Failed, Done).

- REQ-DASH-7: In "All Projects" mode, the card receives commissions from all projects. Each commission row includes a project label. In single-project mode, the card receives only the selected project's commissions. Project labels are omitted in single-project mode (redundant with the selection).

- REQ-DASH-8: The "In Flight" card is a client component (filter state requires `useState`). The page passes `CommissionMeta[]` as props from the server side, same as the project page passes commissions to `CommissionList`. `CommissionMeta` already carries a `projectName` field on each item (set during the per-project fetch in `page.tsx`); this is what the "In Flight" card uses for project labels and `commissionHref()` link construction in all-projects mode.

- REQ-DASH-9: Each commission row in the "In Flight" card shows: `StatusBadge` gem, commission title, worker display title, and project label (in all-projects mode). Rows link to the commission detail page via `commissionHref()`. The row layout is compact (single line per commission where possible).

- REQ-DASH-10: When no commissions match the current filter, the card shows "No commissions match the current filter." When no commissions exist at all, the filter panel does not render and the card shows an appropriate empty state.

### Recent Scrolls

- REQ-DASH-11: In "All Projects" mode, Recent Scrolls fetches artifacts from all registered projects via parallel calls to the existing `/workspace/artifact/document/list` endpoint (one per project, `Promise.all`), merges results by modification date, and shows the 10 most recent items. Each item includes a project label. In single-project mode, behavior is unchanged from the current implementation (no project labels needed).

- REQ-DASH-12: The "Select a project to view recent artifacts" empty state is removed. Recent Scrolls always has content to show (in "All Projects" mode, it fetches across all projects). The only empty state is "No recent artifacts" when no projects have any artifacts.

### Pending Audiences

- REQ-DASH-13: In "All Projects" mode, Pending Audiences shows meeting requests from all projects (current behavior). In single-project mode, it filters to meeting requests for the selected project. The `PendingAudiences` component already receives meeting request data with project context; the filter is applied client-side or by passing filtered data as props.

### Briefing

- REQ-DASH-14: In single-project mode, the Briefing card shows the selected project's briefing. This is the current behavior, minus the silent first-project fallback. The page passes `selectedProject` (not `selectedProject ?? config.projects[0]?.name`) to `ManagerBriefing`.

- REQ-DASH-15: In "All Projects" mode, the Briefing card shows a cross-project synthesis generated by a Guild Master LLM session. The synthesis is seeded from cached per-project briefings: the generator reads the cached briefing text for each registered project, passes the collection to a single Guild Master session, and returns a unified briefing covering all projects.

- REQ-DASH-16: The all-projects briefing endpoint is `GET /coordination/review/briefing/read` with no `projectName` parameter (or `projectName=all`). It reads cached briefing text for each project from `~/.guild-hall/state/briefings/<projectName>.json`. Projects with valid cache entries (HEAD match or within TTL) use their cached text directly. Projects with stale or missing caches trigger individual briefing generation sequentially before synthesizing (one LLM session at a time, not parallel).

- REQ-DASH-17: The all-projects synthesis prompt includes each project's cached briefing text and instructs the Guild Master to provide cross-cutting observations: which projects have the most activity, which have blocked or failed commissions, cross-project patterns, and what needs attention. The synthesis uses the Guild Master's voice, not a metrics dump.

- REQ-DASH-18: The all-projects briefing is cached at `~/.guild-hall/state/briefings/_all.json` using the same `CacheEntry` format (`{ text, generatedAt, headCommit }`). The cache key (`headCommit`) is a hash of all projects' current integration worktree HEADs, concatenated and hashed. Cache validity uses the same dual rule as per-project briefings (existing behavior in `briefing-generator.ts`): the cache is valid when EITHER the HEAD hash matches OR the entry is within TTL. Both conditions must fail for the cache to be stale. This means the all-projects briefing can stay valid for weeks if no project has new commits, but regenerates within TTL after any project's HEAD changes.

- REQ-DASH-19: The briefing cache TTL is configurable via `config.yaml` as `briefingCacheTtlMinutes` (top-level, alongside `systemModels`). Default: `60` (1 hour). This surfaces the existing hardcoded `CACHE_TTL_MS` constant in `briefing-generator.ts` as a config value. The cache validity logic itself is unchanged; only the TTL duration becomes configurable. Both per-project and all-projects briefings use the same TTL.

- REQ-DASH-20: The all-projects synthesis uses the model configured at `systemModels.briefing` (same as per-project briefings). No separate model config for all-projects.

### Superseded requirements

- REQ-DASH-21: This spec refines REQ-VIEW-10 (dashboard aggregation) by making the "All Projects" mode explicit with a sidebar entry and defining per-card behavior in each mode.

- REQ-DASH-22: This spec supersedes REQ-VIEW-14 (dependency map rendering) and REQ-CTREE-1 through REQ-CTREE-9, REQ-CTREE-21, REQ-CTREE-22, REQ-CTREE-26 (dashboard tree list). REQ-CTREE-26 required `DependencyMap` to remain a server component; this is superseded because the "In Flight" card requires `useState` and is a client component per REQ-DASH-8. Commission detail page neighborhood sections (REQ-CTREE-10 through REQ-CTREE-14) and project page cleanup (REQ-CTREE-28) are unaffected.

- REQ-DASH-23: This spec resolves the issue at `.lore/issues/recent-scrolls-empty-state.md`. That issue should be marked `resolved` when this spec is implemented.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Commission row click | User clicks a commission in the "In Flight" card | Commission detail view |
| Artifact row click | User clicks an artifact in Recent Scrolls | Artifact detail view |
| Meeting request action | User accepts/declines/defers a meeting request | [Spec: guild-hall-meetings] |
| Project selection | User clicks a project in the sidebar | Same page, single-project mode |
| All Projects selection | User clicks "All Projects" in the sidebar | Same page, all-projects mode |

## Success Criteria

- [ ] Dashboard loads in "All Projects" mode with no `?project` parameter
- [ ] "All Projects" entry appears first in sidebar, highlighted by default
- [ ] Clicking a project selects it; clicking "All Projects" deselects
- [ ] Sidebar always has exactly one highlighted item
- [ ] "In Flight" card replaces "Task Dependency Map" with a filtered commission list
- [ ] Filter panel is a shared component used by both "In Flight" card and project page `CommissionList`
- [ ] Filter defaults match the project page (8 statuses on, 3 off)
- [ ] In all-projects mode, commission rows and artifact rows show project labels
- [ ] In single-project mode, project labels are omitted
- [ ] Recent Scrolls shows content on fresh load (no "Select a project" empty state)
- [ ] Pending Audiences filters by project when one is selected
- [ ] Briefing card shows per-project briefing in single-project mode (no silent fallback)
- [ ] Briefing card shows LLM-synthesized cross-project briefing in all-projects mode
- [ ] All-projects briefing is seeded from cached per-project briefings
- [ ] `briefingCacheTtlMinutes` config value controls cache TTL for all briefings
- [ ] All-projects briefing cache is keyed by composite HEAD hash
- [ ] All-projects briefing cache invalidates when any registered project's HEAD changes

## AI Validation

**Defaults apply:**
- Unit tests with mocked time/network/filesystem/LLM calls
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Unit test: shared filter functions produce identical results to the current `CommissionList` filter functions (regression).
- Unit test: all-projects briefing cache key changes when any project's HEAD changes.
- Unit test: `briefingCacheTtlMinutes` config value is read and applied; default is 60.
- Unit test: "All Projects" mode passes no project filter to cards; single-project mode passes the selected project name.
- Manual: fresh page load shows all four cards with cross-project content and "All Projects" highlighted in sidebar.
- Manual: select a project, verify all four cards filter to that project's content, verify sidebar highlight moves.
- Manual: click "All Projects", verify return to cross-project view.

## Constraints

- Filter state on the "In Flight" card is ephemeral (`useState`). No URL persistence of filter state.
- The "In Flight" card does not render the tree list or dependency connectors from REQ-CTREE-1 through REQ-CTREE-9. It renders a flat filtered list. Commission dependencies are still visible on the commission detail page (REQ-CTREE-10 through REQ-CTREE-14, unaffected).
- `DependencyMap.tsx` and `DependencyMap.module.css` are replaced (the component is rewritten as the "In Flight" card), not deleted outright, since the file already exists in that location. The tree list code from commission-graph-to-tree-list is removed.
- The all-projects briefing generation requires at least one project to have a valid briefing cache entry. If all caches are cold, the generator produces individual briefings sequentially first, then synthesizes.
- The `briefingCacheTtlMinutes` config value applies to both per-project and all-projects briefings. There is no separate TTL for the all-projects synthesis.

## Context

- [Brainstorm: Dashboard Selection Model](./../brainstorm/ui/dashboard-selection-model.md): source of all design decisions. All questions resolved.
- [Spec: Guild Hall Views](guild-hall-views.md): REQ-VIEW-10 (aggregation), REQ-VIEW-12 (layout), REQ-VIEW-14 (dependency map). This spec refines VIEW-10 and supersedes VIEW-14's dashboard implementation.
- [Spec: Commission List Filtering](commission-list-filtering.md): REQ-CFILTER-5 through REQ-CFILTER-9 define the filter panel layout that becomes the shared component.
- [Spec: Commission Graph to Tree List](commission-graph-to-tree-list.md): REQ-CTREE-1 through REQ-CTREE-9 (dashboard tree list) are superseded. REQ-CTREE-10 through REQ-CTREE-14 (commission detail neighborhood) are unaffected.
- [Issue: Recent Scrolls Empty State](./../issues/recent-scrolls-empty-state.md): resolved by REQ-DASH-11 and REQ-DASH-12.
- [Plan: Improve Briefing with Full SDK Pattern](./../plans/infrastructure/improve-briefing-full-sdk-pattern.md): documents the briefing generator's cache and session infrastructure that the all-projects briefing extends.
