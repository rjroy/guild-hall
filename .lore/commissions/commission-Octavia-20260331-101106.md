---
title: "Commission: Brainstorm: Project list management solutions"
date: 2026-03-31
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Brainstorm solutions for the project list management problem described in `.lore/issues/project-list-mgmt.md`.\n\n## The problem\n\nThere are an increasing number of projects being added to Guild Hall, and it's becoming difficult to manage and keep track of them all. We need a way to easily view, organize, and search through projects.\n\n## Context to investigate\n\nBefore brainstorming, understand the current state:\n- Read `~/.guild-hall/config.yaml` to see how projects are currently registered and what metadata exists\n- Read `web/` components related to the project list/selector on the dashboard to understand the current UI\n- Check `cli/` for existing project management commands (register, validate, etc.)\n- Look at `lib/config.ts` for how projects are read and managed in code\n- Check the dashboard page (`web/app/page.tsx`) to see how projects are presented today\n\n## What to explore\n\nThink about this from multiple angles:\n\n1. **Organization** — grouping, tagging, archiving, favorites, pinning\n2. **Discovery** — search, filter, sort options\n3. **Lifecycle** — active vs. archived vs. dormant projects, when does a project stop mattering?\n4. **Scale** — what breaks at 10 projects? 50? 100?\n5. **UI surface** — is the dashboard the right place? Does the project selector need to evolve? Dedicated project management page?\n6. **CLI surface** — what project management commands are missing?\n7. **Config structure** — does `config.yaml` need to evolve to support richer project metadata?\n8. **Integration** — how does this interact with the daemon, worktrees, git branches?\n\n## Output\n\nWrite the brainstorm to `.lore/brainstorm/project-list-management.md` with YAML frontmatter (title, status: active, date: 2026-03-31, related: [.lore/issues/project-list-mgmt.md]).\n\nExplore multiple approaches. Name tradeoffs. Flag open questions. Don't converge on a single solution — the point is to map the option space so the user can decide direction."
dependencies: []
linked_artifacts:
  - .lore/brainstorm/project-list-management.md

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-31T17:11:06.269Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-31T17:11:06.270Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-31T17:11:06.318Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-31T17:11:12.451Z
    event: progress_report
    reason: "Starting brainstorm commission. Reading commission context and gathering information about the current project management state."
  - timestamp: 2026-03-31T17:11:58.463Z
    event: progress_report
    reason: "Context gathering complete. I now understand the full shape of the current system: 7 projects in config.yaml, flat list in WorkspaceSidebar, no search/filter, ProjectConfig has name/title/path/description/repoUrl/meetingCap/commissionCap/defaultBranch/memoryLimit. Dashboard performs N parallel fetches per project. Beginning to write the brainstorm artifact."
  - timestamp: 2026-03-31T17:13:55.476Z
    event: result_submitted
    reason: "Brainstorm complete. Wrote `.lore/brainstorm/project-list-management.md`.\n\nThe document maps 8 dimensions of the problem: organization (tags vs. groups vs. pinning), lifecycle (archived flag vs. derived dormancy), search/filter (client-side vs. server-side), config schema evolution, UI surface (sidebar vs. dedicated /projects page), CLI gaps, daemon integration impact, and scale breakpoints.\n\nKey findings:\n- The problem has two distinct parts: visual overload (annoying at 15+ projects) and performance collapse (the \"All Projects\" dashboard fires O(n) API calls — currently 21 requests, broken at 50+ projects).\n- An `archived: boolean` field is the highest-leverage single change: it keeps the dashboard fast and hides dead projects.\n- Tags solve organization and are composable with notification rules and scheduled commissions.\n- The CLI is missing `archive`, `update`, `list`, and `search` — metadata fields added without CLI write commands won't stay populated.\n- Three scoped directions: minimal (archived + CLI commands), medium (archived + tags + sidebar filter + /projects index), full (groups + collapsible sidebar + bulk ops + deregister).\n- Recommended starting point: minimal + sidebar text filter. Solve the performance and stale-project problems first; revisit tags/groups once the long tail is managed."
  - timestamp: 2026-03-31T17:14:04.698Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Context gathering complete. I now understand the full shape of the current system: 7 projects in config.yaml, flat list in WorkspaceSidebar, no search/filter, ProjectConfig has name/title/path/description/repoUrl/meetingCap/commissionCap/defaultBranch/memoryLimit. Dashboard performs N parallel fetches per project. Beginning to write the brainstorm artifact."
projectName: guild-hall
---
Brainstorm complete. Wrote `.lore/brainstorm/project-list-management.md`.

The document maps 8 dimensions of the problem: organization (tags vs. groups vs. pinning), lifecycle (archived flag vs. derived dormancy), search/filter (client-side vs. server-side), config schema evolution, UI surface (sidebar vs. dedicated /projects page), CLI gaps, daemon integration impact, and scale breakpoints.

Key findings:
- The problem has two distinct parts: visual overload (annoying at 15+ projects) and performance collapse (the "All Projects" dashboard fires O(n) API calls — currently 21 requests, broken at 50+ projects).
- An `archived: boolean` field is the highest-leverage single change: it keeps the dashboard fast and hides dead projects.
- Tags solve organization and are composable with notification rules and scheduled commissions.
- The CLI is missing `archive`, `update`, `list`, and `search` — metadata fields added without CLI write commands won't stay populated.
- Three scoped directions: minimal (archived + CLI commands), medium (archived + tags + sidebar filter + /projects index), full (groups + collapsible sidebar + bulk ops + deregister).
- Recommended starting point: minimal + sidebar text filter. Solve the performance and stale-project problems first; revisit tags/groups once the long tail is managed.
