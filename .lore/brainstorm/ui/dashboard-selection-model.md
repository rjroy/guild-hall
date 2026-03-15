---
title: Dashboard selection model
date: 2026-03-15
status: open
tags: [ux, ui, dashboard, project-selection, briefing, recent-scrolls, dependency-map]
modules: [web/app/page, web/components/dashboard/ManagerBriefing, web/components/dashboard/RecentArtifacts, web/components/dashboard/DependencyMap, web/components/dashboard/WorkspaceSidebar]
related: [.lore/issues/recent-scrolls-empty-state.md]
---

# Brainstorm: Dashboard Selection Model

## Context

The three dashboard cards (Briefing, Task Dependency Map, Recent Scrolls) have inconsistent behavior around project selection, and there's no explicit deselection mechanism. The intent is for the dashboard to show an overall view across all projects by default, and a project-specific view when one is selected.

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

### Task Dependency Map: should it filter?

This is a more interesting question. The map currently shows all commissions from all projects and is the only card that does so intentionally.

When a project is selected, should the map filter to show only that project's commissions?

**Arguments for filtering:**
- Consistent with the project focus mode — you selected a project to drill into it
- Reduces noise when there are many projects

**Arguments against filtering:**
- Commissions can depend on commissions in other projects (the `awaits` field references commission IDs, and the `CommissionMeta` type includes `projectName` on each node). Filtering hides cross-project dependencies.
- The dependency map is a workload overview. Its value comes from showing everything at once so you can see what's blocking what. Scoping it to one project makes it less useful as a planning tool.
- The map already handles the single-project case well — if only one project has commissions, the map only shows that project's commissions.

**A middle path:** Filter the list but mark cross-project dependencies. When a commission in project A `awaits` a commission in project B, show a greyed-out node for the dependency with a project label. This preserves the dependency context while still giving the focused view.

This middle path adds complexity. For the first pass, the simplest viable answer is probably: **the dependency map stays global.** It becomes an intentionally cross-cutting card. If the user wants to see a project's commissions in isolation, the project page already has a commissions view.

If the map stays global, it's worth making that explicit in the UI — a small "All Projects" label on the card title when a project is selected. This signals "this card intentionally shows everything" rather than making the user wonder whether filtering is broken.

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

## Open Questions

1. **Cross-project dependencies in the dependency map**: How common are they in practice? If they're rare or nonexistent, the filtering question becomes less fraught. Worth checking whether any active commissions actually reference cross-project `awaits`.

2. **Briefing cache on all-projects**: If project briefings are already cached, can the all-projects summary be derived from cached content rather than re-running? This would require either (a) the all-projects endpoint fetching individual briefings first, or (b) storing briefing text in a way the all-projects endpoint can read without re-generating.

3. **The dependency map's scope when a project is selected**: The brainstorm leans toward keeping it global. Is this the right call? A user who selects a project to focus on it might find the global dependency map disorienting ("why am I still seeing other projects' work?"). Worth validating against actual usage patterns.

4. **"All Projects" entry in sidebar — position and label**: Should it appear above the project list or as a special treatment of the "Guild Hall" title? If above, it competes visually with the section heading "Active Projects." Needs a design pass.

5. **Default state on first load with a single project**: If there's only one project registered, should the dashboard auto-select it? Or should the all-projects and project-specific views be identical when there's only one project, making the distinction moot?

## Next Steps

1. Resolve the dependency map scope question (global vs. filtered) — this determines whether cards have divergent scopes, which affects the visual state design.
2. Spec the selection model: define the two modes, what each card shows in each, and the interaction for toggling between them.
3. Decide on the all-projects briefing approach (LLM vs. static) before speccing the briefing changes — the implementation cost differs significantly.
