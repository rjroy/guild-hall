---
title: Dashboard selection model
date: 2026-03-15
status: resolved
tags: [ux, ui, dashboard, project-selection, briefing, recent-scrolls, commission-filter]
modules: [web/app/page, web/components/dashboard/ManagerBriefing, web/components/dashboard/RecentArtifacts, web/components/dashboard/DependencyMap, web/components/dashboard/WorkspaceSidebar, web/components/commission/CommissionList]
related: [.lore/issues/recent-scrolls-empty-state.md, .lore/specs/ui/commission-list-filtering.md]
---

# Brainstorm: Dashboard Selection Model

## Context

The three dashboard cards (Briefing, Task Dependency Map, Recent Scrolls) have inconsistent behavior around project selection, and there's no explicit deselection mechanism. The intent is for the dashboard to show an overall view across all projects by default, and a project-specific view when one is selected. (Note: the Task Dependency Map was reframed during resolution as an "In Flight" filtered commission list; see that section below.)

The current behavior (verified from source):

- **Briefing** (`ManagerBriefing.tsx`): The page passes `selectedProject ?? config.projects[0]?.name`. When nothing is selected, it silently shows the first project's briefing. The component has an empty state ("Select a project to see the briefing") that's never triggered in practice.
- **Task Dependency Map** (`DependencyMap.tsx`): Always receives `allCommissions` from every project. Ignores selection entirely.
- **Recent Scrolls** (`RecentArtifacts.tsx`): Only fetches artifacts when `selectedProject` is set. Shows "Select a project to view recent artifacts" on every fresh page load — a dead zone on the dashboard.
- **WorkspaceSidebar**: Clicking a project sets `?project=name` in the URL. The "Guild Hall" title links to `/`, which clears the param, but this is not marked as a deselect action.

Three of the four questions below have clean answers. The briefing question is the hard one.

## Ideas Explored

### Deselection

The current model has no explicit way to return to all-projects view. Three options:

**Option A: Toggle on re-click.** When a project is already selected, clicking it in the sidebar links to `/` instead of `/?project=name`. The href becomes `isSelected ? "/" : "/?project=..."`. Simple, no visual changes required. The problem: nothing tells the user this works until they try it.

**Option B: "All Projects" entry at top of sidebar.** An explicit first item in the project list, always visible, selected by default. Links to `/`. This is the clearest option because it makes the selection model explicit — the sidebar always has a selected item, and that item is either "All Projects" or a specific project.

**Option C: Lean on the Guild Hall title link.** It already navigates to `/`. Add a visual cue (e.g., show it as active when no project is selected, or add a small "(all)" annotation) to make it readable as a deselect action.

Option B is probably right. It converts "no selection" from an invisible state into an explicit mode called "All Projects." The other two options are fine workarounds but leave the model implicit. What if a new user doesn't realize the dashboard has modes at all?

---

### Visual state distinction

When no project is selected versus "guild-hall" selected, how does the UI signal which mode it's in?

The sidebar already highlights the selected project. If we add an "All Projects" entry (Option B above), that entry shows as highlighted by default, and the mode is always communicated in the sidebar without any changes to the dashboard cards.

Additional signal options if more emphasis is needed:

- **Subtitle on Briefing card**: Below the "Guild Master's Briefing" panel title, a small context label: "All Projects" or "guild-hall". Low-cost, visible where attention lands first.
- **Thin context bar**: A horizontal strip above the main card grid showing current scope. More prominent, but adds chrome.
- **Per-card scope badges**: Small "[guild-hall]" labels on each card title. Noisy. Only worth it if cards have divergent scopes (e.g., if the dependency map is intentionally always global while others filter).

If all three cards respond consistently to selection, a sidebar highlight alone is probably enough. The scope badge on the briefing card becomes more useful if cards intentionally diverge (see dependency map discussion below).

---

### Recent Scrolls: all-projects mode

The fix here is straightforward. Instead of fetching artifacts only when `selectedProject` is set, always fetch — either from the selected project or from all projects merged by recency.

In all-projects mode: fetch the N most recent artifacts across all registered projects, sorted by modification date, and show the project name on each row. The `artifactHref` function already takes `projectName` as an argument, so linking still works. The only change is adding a project label to each list item.

The backend already has `/workspace/artifact/document/list?projectName=...&recent=true&limit=10`. All-projects mode would call this for each project and merge results in the page. Since this is a server component, the parallel fetch is easy (`Promise.all`).

What if only one project has recent activity? Then the all-projects feed looks indistinguishable from a project-specific feed. That's fine — the user sees what's actually active.

---

### Task Dependency Map: reframed as "In Flight" view

Investigation revealed that cross-project commission dependencies don't exist in practice. The `awaits` field resolves dependencies within a single project's `.lore/commissions/` directory; a cross-project reference would fail at dispatch time. The dependency graph adds visual complexity without much payoff when commissions rarely have dependencies.

The card's real value is answering "what is in flight?" not "what depends on what?" This reframes the card from a graph visualization to a filtered commission list.

The Commission List Filter on the project page's Commission Tab (`CommissionList.tsx`) already solves this well: multi-select checkboxes grouped by status category (Idle, Active, Failed, Done), count annotations, reset to defaults, all client-side. The filter logic is pure functions (`filterCommissions`, `countByStatus`, `isDefaultSelection`) with a `FILTER_GROUPS` array defining the checkbox layout.

**Decision: extract a generic status filter component from CommissionList.tsx and reuse it on the dashboard.** Two levels of extraction were considered:

1. **Filter logic + filter UI only** (pure functions + filter panel component). Each consumer renders its own list. The project page renders commission rows with prompt previews; the dashboard renders a compact "in flight" summary with project labels.
2. **Full parameterized CommissionListFilter** that handles both filter panel and list rendering. Over-abstracts when the two consumers want different row layouts.

Level 1 is the right call. The filter panel becomes a shared component; list rendering stays specific to each consumer.

In all-projects mode, the card shows commissions from all projects with project labels on each row. When a project is selected, it filters to that project's commissions. Consistent with how every other card responds to selection.

---

### Briefing: the hard question

When no project is selected, what does the Briefing card show? This is the question with the most options and the most tradeoffs.

**Option A: Keep silent first-project fallback (status quo).** Works fine for single-project setups. Confusing for multi-project — the user doesn't know they're seeing project A's briefing when they think they're in all-projects mode. Breaks the model.

**Option B: Cross-project summary via LLM.** Add a `/api/briefing/all` endpoint that runs a Guild Master session across all projects. The cache key becomes a hash of all projects' current integration worktree HEADs. Generates a briefing like "Across your three projects, you have 12 active commissions and 2 pending meetings..." with cross-cutting observations. Cost: one LLM call, cached with the same TTL as project briefings (1 hour). When cached, identical load characteristics to single-project briefing. When expired, requires a fresh generation.

This is the richest option. The Guild Master is already framed as a manager overseeing all work — an all-projects briefing fits the persona. What would it actually say that's useful? Things like: which project has the most blocked commissions, which project has been quiet lately, whether there are cross-project dependencies in flight. This is information the user can't easily see from individual project pages.

**Option C: Static structured summary (no LLM).** Derive a summary from already-fetched data: "You have X active commissions across Y projects. Most recent activity in: guild-hall (2 hours ago). Z pending meeting requests." No new API call. Always fresh because it uses data the page already fetched. Doesn't require LLM generation, so no latency on cache miss.

The tradeoff: it's a metrics panel, not a briefing. It's precise but terse. It tells you counts, not context. The Guild Master's voice is missing.

**Option D: Show nothing — explicit "no briefing in all-projects mode."** Make the card intentionally empty with a clear message: "Select a project for a briefing." This is honest but wastes the card in the default view.

**Option E: Tabbed/scrollable briefings.** Show all project briefings in a list or tab strip. Useful for 2-3 projects. Doesn't scale. Puts more visual weight on the card than it can carry.

The most interesting tension is between B and C. Option B gives you the Guild Master's voice at the cost of an LLM call. Option C is always fresh but hollow. What if B is the right long-term answer, but C is the right first-pass answer? Implement C first to fix the broken behavior, and treat B as an enhancement once the rest of the model is stable.

What if the all-projects briefing could be seeded from project briefings rather than generated fresh? If all individual project briefings are already cached, the Guild Master could summarize them without scanning the worktrees again. "Here's what's happening in guild-hall: [brief excerpt]. Here's what's happening in memory-loop: [brief excerpt]. Overall: [synthesis]." This is cheaper and potentially more coherent.

---

## Resolved Questions

1. **Cross-project dependencies in the dependency map**: Nonexistent. The `awaits` field resolves within a single project; cross-project references fail at dispatch. No commission artifacts contain cross-project references. This made the dependency map filtering question moot and led to reframing the card entirely (see "In Flight" section above).

2. **Briefing cache on all-projects**: Yes. Briefing cache is file-based at `~/.guild-hall/state/briefings/<projectName>.json`, storing `{ text, generatedAt, headCommit }`. An all-projects endpoint reads cached briefing text for each project and passes the collection to a single Guild Master session for synthesis. Cache hits are instant; only stale projects incur LLM cost. This makes Option B (LLM cross-project summary) viable as a follow-on to Option C (static summary).

3. **"In Flight" card scope when a project is selected**: Filter to the selected project's commissions. Show all in "All Projects" mode. Consistent with how every other card responds to selection. The dependency graph visualization is replaced by a filtered commission list, so the "global graph for cross-project context" argument no longer applies.

4. **"All Projects" entry in sidebar**: First item in the project list, same visual treatment as project items but distinct (no gem, or a different icon). Selected by default. Links to `/`. Sits below the "Active Projects" section heading.

5. **Default state on first load with a single project**: Always start in "All Projects" mode regardless of project count. Single-project users see identical content either way. Keeps the model consistent: the dashboard always starts the same way.

## Decisions Summary

| Decision | Resolution |
|----------|------------|
| Deselection mechanism | "All Projects" entry at top of sidebar (Option B) |
| Visual state | Sidebar highlight is sufficient when all cards respond consistently |
| Recent Scrolls empty state | Fetch across all projects in all-projects mode, show project labels |
| Task Dependency Map | Reframed as "In Flight" filtered list, reusing Commission List Filter pattern |
| Filter extraction | Level 1: extract filter panel as shared component, keep list rendering per-consumer |
| All-projects briefing | LLM synthesis seeded from cached per-project briefings (Option B directly; Option C skipped) |
| Default mode | Always "All Projects" |

## Next Steps

1. Spec the selection model: define the two modes (All Projects, single project), what each card shows in each, and the interaction for toggling between them.
2. Spec the filter panel extraction from `CommissionList.tsx` and its reuse on the dashboard "In Flight" card.
3. Spec the all-projects briefing (Option C first, Option B as enhancement).
