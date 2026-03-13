# Dashboard, Projects, and Artifacts

This guide covers the parts of Guild Hall you will use for orientation: the main dashboard, a project's tabbed hub, and the artifact browser.

## Dashboard overview

The dashboard is the top-level workspace view. It pulls together the current state of all registered projects, then emphasizes the currently selected one.

<img src="../screenshots/gh-home.webp" alt="Guild Hall dashboard with workspace sidebar, briefing, dependency map, recent artifacts, and pending audiences." width="1200">

The main panels are:

- **Workspace sidebar** for switching between registered projects
- **Guild Master briefing** for a readable project summary
- **Dependency map** for commission relationships across projects
- **Recent artifacts** for quick access to the latest documents in the selected project
- **Pending audiences** for meeting requests that need your attention

The pending audience panel is especially useful when workers are requesting direction. From there, you can open the audience immediately, defer it, ignore it, or turn it into a quick-comment commission flow.

## Project hub

Selecting a project opens a dedicated project page with three tabs:

- `Artifacts`
- `Commissions`
- `Meetings`

<img src="../screenshots/gh-project.webp" alt="Project page with tabbed navigation for commissions, artifacts, and meetings." width="1200">

The tabs are stable entry points into the project's `.lore/` content and active work.

## Artifact browsing

The artifact tab renders the project's `.lore/` tree as a navigable list. Files appear inside expandable directories, and each artifact shows its title, date, tags, and a gem-style status badge.

<img src="../screenshots/gh-artifacts.webp" alt="Artifacts tab displaying a tree of documents grouped by folders with statuses and tags." width="1200">

A few practical notes:

- Artifacts are read from the integration worktree by default.
- Open meeting and commission artifacts are resolved from their active worktrees when needed.
- Status is visualized with gem indicators so incomplete, active, blocked, and completed items are easy to scan.

## Artifact detail pages

Opening an artifact gives you a full reading view plus a metadata sidebar.

<img src="../screenshots/gh-artifact-detail.webp" alt="Artifact detail page showing the rendered document body and sidebar metadata." width="1200">

The detail page includes:

- breadcrumb-style provenance back to the project
- rendered Markdown content
- metadata such as status, date, tags, modules, and related artifacts
- associated commissions that reference the artifact
- a shortcut for creating a commission from the current artifact

If the artifact is an open meeting file, the page also shows a direct `View Meeting` link back to the live audience.

## When to stay on the dashboard vs. open a project

Use the dashboard when you want situational awareness across projects or a quick entry into pending work.

Open the project hub when you want to:

- browse the full artifact tree
- review all meetings for one project
- create or monitor commissions in context

## Code references

- Dashboard route: [`web/app/page.tsx`](../../web/app/page.tsx)
- Pending audiences panel: [`web/components/dashboard/PendingAudiences.tsx`](../../web/components/dashboard/PendingAudiences.tsx)
- Project hub route: [`web/app/projects/[name]/page.tsx`](../../web/app/projects/[name]/page.tsx)
- Project tabs: [`web/components/project/ProjectTabs.tsx`](../../web/components/project/ProjectTabs.tsx)
- Artifact list: [`web/components/project/ArtifactList.tsx`](../../web/components/project/ArtifactList.tsx)
- Artifact detail route: [`web/app/projects/[name]/artifacts/[...path]/page.tsx`](../../web/app/projects/[name]/artifacts/[...path]/page.tsx)
- Metadata sidebar: [`web/components/artifact/MetadataSidebar.tsx`](../../web/components/artifact/MetadataSidebar.tsx)
