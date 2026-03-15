---
title: "Commission: Brainstorm: Dashboard card selection model"
date: 2026-03-15
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Run the brainstorm skill on the following topic.\n\n## Topic\n\nThe three dashboard cards (Briefing, Task Dependency Map, Recent Scrolls) have inconsistent behavior around project selection:\n\n- **Briefing** shows the first briefing in the list, or the selected project's briefing.\n- **Task Dependency Map** always shows all projects.\n- **Recent Scrolls** only shows the selected project (empty until one is selected).\n\nThe user's intent is:\n- When no project is selected, the dashboard should represent an **overall view across all projects**.\n- When a project is selected, it should show an **overview of that specific project**.\n\n## Questions to explore\n\n1. **Overall briefing**: When no project is selected, what does the briefing card show? Generating an \"all projects\" briefing is non-trivial. What are the options (aggregate, most-recent, summary, etc.) and their tradeoffs?\n\n2. **Selection state distinction**: How does the UI communicate the difference between \"no project selected\" (all-projects view) and \"project X selected\" (project-specific view)? This needs to be visually clear.\n\n3. **Deselection**: How does a user unselect a project and return to the all-projects view? There's currently no mechanism for this.\n\n4. **Per-card behavior**: For each of the three cards, define what \"all projects\" mode and \"selected project\" mode look like concretely.\n\n## Context\n\n- Read `.lore/issues/recent-scrolls-empty-state.md` for background on the empty state problem.\n- Read the dashboard page implementation in `web/app/page.tsx` and the dashboard components in `web/components/dashboard/` to understand current behavior.\n- The brainstorm artifact should go in `.lore/brainstorm/ui/dashboard-selection-model.md`.\n"
dependencies: []
linked_artifacts:
  - .lore/brainstorm/ui/dashboard-selection-model.md

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-15T14:51:12.124Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-15T14:51:12.125Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-15T14:51:12.163Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-15T14:51:22.319Z
    event: progress_report
    reason: "Starting brainstorm on dashboard selection model. Reading relevant source files first."
  - timestamp: 2026-03-15T14:51:56.838Z
    event: progress_report
    reason: "Read all relevant source files. Current state: ManagerBriefing always shows first project (silently falls back), DependencyMap ignores selection entirely, RecentArtifacts blocks until a project is selected. No deselection mechanism exists. Running brainstorm skill now."
  - timestamp: 2026-03-15T14:54:43.364Z
    event: result_submitted
    reason: "Brainstorm complete. Artifact written to `.lore/brainstorm/ui/dashboard-selection-model.md`.\n\nKey findings:\n\n**Deselection**: Add an \"All Projects\" entry at the top of the sidebar project list. It makes the two-mode model explicit and gives users a labeled way to return to the default view. The current \"click Guild Hall title\" workaround is non-obvious.\n\n**Visual state**: If the sidebar always has a selected item (\"All Projects\" or a project name), no dashboard-level changes are needed. A subtitle on the Briefing card adds a second signal if desired.\n\n**Recent Scrolls**: Straightforward fix. In all-projects mode, fetch from all projects in parallel (the page already does this for commissions and meetings), merge by recency, add a project label to each item. Eliminates the dead zone on every fresh load.\n\n**Task Dependency Map**: Leans toward keeping it intentionally global. Cross-project dependency relationships exist in the data model; filtering by project severs them. The map's value is the workload overview. If it stays global, label it \"All Projects\" when a project is selected so users understand the behavior is intentional, not broken.\n\n**Briefing**: The hardest question. Two viable paths: (a) generate a cross-project LLM summary at `/api/briefing/all`, cached like individual briefings; (b) show a static structured summary derived from already-fetched data (commission counts, most recent activity). Option (b) is the right first-pass fix; option (a) is the right long-term answer. An intermediate approach: derive the all-projects briefing by summarizing already-cached individual project briefings rather than re-scanning worktrees.\n\nThree open questions surfaced for the spec phase: frequency of cross-project dependencies in practice, whether the dependency map staying global is the right call, and how to handle single-project installations where the two modes are indistinguishable."
  - timestamp: 2026-03-15T14:54:55.859Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Read all relevant source files. Current state: ManagerBriefing always shows first project (silently falls back), DependencyMap ignores selection entirely, RecentArtifacts blocks until a project is selected. No deselection mechanism exists. Running brainstorm skill now."
projectName: guild-hall
---
Brainstorm complete. Artifact written to `.lore/brainstorm/ui/dashboard-selection-model.md`.

Key findings:

**Deselection**: Add an "All Projects" entry at the top of the sidebar project list. It makes the two-mode model explicit and gives users a labeled way to return to the default view. The current "click Guild Hall title" workaround is non-obvious.

**Visual state**: If the sidebar always has a selected item ("All Projects" or a project name), no dashboard-level changes are needed. A subtitle on the Briefing card adds a second signal if desired.

**Recent Scrolls**: Straightforward fix. In all-projects mode, fetch from all projects in parallel (the page already does this for commissions and meetings), merge by recency, add a project label to each item. Eliminates the dead zone on every fresh load.

**Task Dependency Map**: Leans toward keeping it intentionally global. Cross-project dependency relationships exist in the data model; filtering by project severs them. The map's value is the workload overview. If it stays global, label it "All Projects" when a project is selected so users understand the behavior is intentional, not broken.

**Briefing**: The hardest question. Two viable paths: (a) generate a cross-project LLM summary at `/api/briefing/all`, cached like individual briefings; (b) show a static structured summary derived from already-fetched data (commission counts, most recent activity). Option (b) is the right first-pass fix; option (a) is the right long-term answer. An intermediate approach: derive the all-projects briefing by summarizing already-cached individual project briefings rather than re-scanning worktrees.

Three open questions surfaced for the spec phase: frequency of cross-project dependencies in practice, whether the dependency map staying global is the right call, and how to handle single-project installations where the two modes are indistinguishable.
