---
title: Project View
date: 2026-03-01
status: current
tags: [project-view, ui, server-component, tabs, artifacts, artifact-viewer]
modules: [web-app, web-project, web-artifact, web-commission, lib-artifacts, lib-artifact-grouping, lib-commissions, lib-meetings]
---

# Feature: Project View

## What It Does

The project view is the per-project detail page. It has two layers: a tabbed overview of a project's artifacts, commissions, and meetings, and a deep-linking artifact viewer for reading and editing individual `.lore/` files. The tabbed page is a server component that scans the filesystem at render time, merging content from both the integration worktree and any active meeting worktrees. The artifact viewer is a catch-all route that renders any artifact with a metadata sidebar, inline editing, and links to associated commissions.

## Capabilities

- **Tabbed browsing**: Three tabs (Artifacts, Commissions, Meetings) controlled by `?tab=` query param. Default tab is Artifacts.
- **Artifact tree**: Hierarchical display of all `.lore/` files grouped by directory. Top-level directories are expanded by default. Leaf nodes show frontmatter title, status gem, and tags. Clicking navigates to the artifact viewer.
- **Commission list**: Sorted commission list with gem status indicators, plus an inline "Create Commission" button that expands to the full commission form. When linked from an artifact viewer's "Create Commission from Artifact" link, the form auto-opens with the dependency pre-filled via `?newCommission=true&dep=<path>`.
- **Commission graph**: When the project's commissions have dependency edges, a compact CommissionGraph SVG renders above the commission list.
- **Meeting list**: Status-aware meeting list. Open meetings link to the live meeting view. Requested meetings link to the dashboard (where accept actions live). Closed and declined meetings link to the artifact viewer. Sorted with open meetings first, then by date descending.
- **Active meeting merging**: The page scans both the integration worktree (merged/closed meetings) and active meeting worktrees (open meetings not yet merged). Deduplicates by `relativePath` so a meeting doesn't appear twice.
- **Start audience**: Button in the project header opens a WorkerPicker modal. The modal fetches available workers from the daemon, lets the user select one and enter an agenda, then creates a meeting via POST, consumes the SSE first-turn stream, and navigates to the live meeting view.
- **Artifact viewing**: Deep-link to any `.lore/` file via catch-all route. Shows rendered markdown with a metadata sidebar containing status, date, tags, modules, related artifacts, associated commissions, and a "Create Commission from Artifact" link.
- **Artifact editing**: Toggle between rendered markdown and a textarea editor. Saves via `PUT /api/artifacts`, which writes the body (preserving frontmatter), auto-commits to the `claude` branch, and triggers dependency checks.
- **Meeting banner**: When viewing an open meeting artifact in the artifact viewer, a banner links to the live meeting view.

## Entry Points

| Entry | Type | Handler |
|-------|------|---------|
| `/projects/[name]` | Page | `apps/web/app/projects/[name]/page.tsx` (server component) |
| `/projects/[name]/artifacts/[...path]` | Page | `apps/web/app/projects/[name]/artifacts/[...path]/page.tsx` (server component) |
| `PUT /api/artifacts` | Next.js API | `apps/web/app/api/artifacts/route.ts` (not a proxy, does real work) |

## Implementation

### Files Involved

| File | Role |
|------|------|
| `apps/web/app/projects/[name]/page.tsx` | Server component: reads config, scans artifacts/commissions/meetings from integration + active worktrees, deduplicates meetings, composes tabbed layout. Query params: `?tab=`, `?newCommission=true`, `?dep=`. |
| `apps/web/app/projects/[name]/page.module.css` | Layout styles for project view and tab content. |
| `apps/web/app/projects/[name]/artifacts/[...path]/page.tsx` | Server component: reads single artifact, finds associated commissions via `linked_artifacts`, detects open meeting artifacts for banner. Composes ArtifactProvenance, ArtifactContent, MetadataSidebar. |
| `apps/web/app/projects/[name]/artifacts/[...path]/page.module.css` | Two-column layout for artifact viewer (main + sidebar). |
| `apps/web/app/api/artifacts/route.ts` | PUT endpoint: writes artifact body via `writeArtifactContent()` (preserves frontmatter), auto-commits to `claude` branch via `git.commitAll()`, triggers `POST /commissions/check-dependencies` on daemon. Non-fatal error handling for both commit and dependency check. |
| `apps/web/components/project/ProjectHeader.tsx` | Server component: breadcrumb (Guild Hall > Project: name), heading, description, repo link, StartAudienceButton. |
| `apps/web/components/project/ProjectTabs.tsx` | Server component: three tab links (Commissions, Artifacts, Meetings) with `?tab=` param and gem status indicators. |
| `apps/web/components/project/ArtifactList.tsx` | Client component: builds hierarchical tree via `buildArtifactTree()`, collapsible directories with chevron toggles, scroll icons, gem indicators, tags. Uses `TreeNodeRow` as module-level component to avoid re-creation on re-render. |
| `apps/web/components/project/MeetingList.tsx` | Server component: status-aware rendering. `meetingStatusToGem()` maps meeting status to gem type. `meetingHref()` routes open meetings to live view, requested to dashboard, others to artifact viewer. |
| `apps/web/components/project/StartAudienceButton.tsx` | Client component: "Start Audience" button that opens WorkerPicker modal. Disabled when daemon is offline (reads from DaemonContext). |
| `apps/web/components/ui/WorkerPicker.tsx` | Client component: portal-rendered modal dialog. Fetches workers from `/api/workers` on mount. Worker selection + agenda textarea + "Start Audience" submit. On submit: POST /api/meetings, consume SSE first turn via `consumeFirstTurnSSE`, store messages in sessionStorage, navigate to meeting view. Handles daemon offline and error states. |
| `apps/web/components/commission/CreateCommissionButton.tsx` | Client component: toggles CommissionForm inline. Supports `defaultOpen` and `initialDependencies` props for deep-linking from artifact viewer. |
| `apps/web/components/commission/CommissionForm.tsx` | Client component: full commission creation form (see [commissions](./commissions.md)). |
| `apps/web/components/artifact/ArtifactBreadcrumb.tsx` | Server component: breadcrumb navigation (Guild Hall > Project: name > Artifact: title). |
| `apps/web/components/artifact/ArtifactProvenance.tsx` | Server component: combines breadcrumb with a stubbed provenance line (worker source tracking planned but not yet implemented). |
| `apps/web/components/artifact/ArtifactContent.tsx` | Client component: view/edit toggle. View mode renders markdown via react-markdown + remark-gfm. Edit mode shows textarea with save/cancel toolbar. Saves via `PUT /api/artifacts`, refreshes page on success. |
| `apps/web/components/artifact/MetadataSidebar.tsx` | Server component: displays artifact metadata (status with gem, date, tags, modules, project link, associated commissions, related artifacts). Includes "Create Commission from Artifact" link that navigates to the commissions tab with `?newCommission=true&dep=<path>`. Exports `relatedToHref()` and `createCommissionHref()` helpers. |
| `lib/artifact-grouping.ts` | Tree construction: `buildArtifactTree()` builds a hierarchical `TreeNode[]` from flat artifact list. `groupKey()`, `capitalize()`, `displayTitle()` helpers. `groupArtifacts()` for flat grouping (used elsewhere). Depth-0 directories default to expanded. Root-level files grouped under synthetic "root" node. |
| `lib/artifacts.ts` | `scanArtifacts`, `readArtifact`, `recentArtifacts`, `writeArtifactContent` with `spliceBody` for frontmatter preservation (see [dashboard](./dashboard.md)). |
| `lib/meetings.ts` | `getActiveMeetingWorktrees` scans `~/.guild-hall/worktrees/<project>/` for meeting-pattern directories (see [meetings](./meetings.md)). |
| `lib/commissions.ts` | `scanCommissions` for commission list and associated commission lookup (see [commissions](./commissions.md)). |
| `lib/dependency-graph.ts` | `buildDependencyGraph` for commission graph on commissions tab (see [dependency-graph](./dependency-graph.md)). |
| `lib/sse-helpers.ts` | `consumeFirstTurnSSE`, `storeFirstTurnMessages` used by WorkerPicker for meeting creation (see [dashboard](./dashboard.md)). |

### Data Sources

The project view reads from multiple sources at render time:

- **Config**: `~/.guild-hall/config.yaml` for project details (via `getProject()`)
- **Artifacts**: `{integration}/.lore/**/*.md` for artifact tree (via `scanArtifacts()`)
- **Commissions**: `{integration}/.lore/commissions/*.md` for commission list and dependency graph (via `scanCommissions()`)
- **Integration meetings**: `{integration}/.lore/meetings/*.md` for merged/closed meetings (via `scanArtifacts()`)
- **Active meeting worktrees**: `~/.guild-hall/worktrees/<project>/audience-*/` for open meetings (via `getActiveMeetingWorktrees()` + `scanArtifacts()`)
- **Single artifact**: `{integration}/.lore/<path>` for artifact viewer (via `readArtifact()`)
- **Workers**: daemon endpoint `GET /workers` for WorkerPicker (via client-side fetch)

### Dependencies

- Uses: [commissions](./commissions.md) (`scanCommissions` for commission tab, `linked_artifacts` for associated commissions in artifact viewer)
- Uses: [meetings](./meetings.md) (`getActiveMeetingWorktrees` for active meeting scanning, meeting creation via WorkerPicker)
- Uses: [dependency-graph](./dependency-graph.md) (`buildDependencyGraph` for commission graph on commissions tab)
- Uses: [dashboard](./dashboard.md) (CommissionGraph component reused for compact dependency visualization)
- Uses: SSE helpers (first-turn consumption when creating a meeting from WorkerPicker)
- Uses: Daemon client (worker list fetch, meeting creation POST)
- Used by: Dashboard (sidebar "View" links navigate here)
- Used by: [commissions](./commissions.md) (commission detail view links back to project)
- Used by: [meetings](./meetings.md) (meeting view links back to project)

## Connected Features

| Feature | Relationship |
|---------|-------------|
| [commissions](./commissions.md) | Commissions tab lists all commissions; artifact viewer shows associated commissions; "Create Commission from Artifact" bridges artifacts to commissions |
| [meetings](./meetings.md) | Meetings tab lists all meetings; StartAudienceButton creates new meetings; active meeting worktrees are scanned for open meetings |
| [dashboard](./dashboard.md) | Sidebar links navigate from dashboard to project view; CommissionGraph component is reused |
| [dependency-graph](./dependency-graph.md) | Commission graph renders on commissions tab when edges exist |
| [workers-toolbox](./workers-toolbox.md) | WorkerPicker fetches worker roster from daemon |

## Implementation Status

| Layer | Status | Notes |
|-------|--------|-------|
| Backend API | Complete | Artifact write endpoint with auto-commit and dependency trigger |
| Frontend UI | Complete | Tabbed project view, hierarchical artifact tree, artifact viewer with edit, metadata sidebar |
| Tests | Complete | Part of the 1529 tests passing across the project |

## Notes

- The artifact write endpoint (`PUT /api/artifacts`) is one of the few Next.js API routes that does real work instead of proxying to the daemon. It writes files, runs git commands, and triggers daemon endpoints. Error handling for the commit and dependency check steps is non-fatal: a write succeeds even if the git commit or dependency check fails.
- `ArtifactContent` uses `writeArtifactContent()` from `lib/artifacts.ts`, which splices only the body portion of the markdown file, preserving the original frontmatter bytes exactly. This avoids the gray-matter `stringify()` reformatting problem documented in project retros.
- The WorkerPicker is rendered via `createPortal` to `document.body` to escape parent stacking contexts created by `backdrop-filter` on Panel and ProjectTabs components.
- Meeting list routing is deliberately asymmetric: open meetings go to the live meeting page, but requested meetings route to the dashboard (not the project view) because that's where the accept/decline/defer actions live.
- `ArtifactProvenance` includes a stubbed "Source information unavailable" line. Worker provenance tracking (which worker created or last modified an artifact) is planned but not yet implemented.
- The `TreeNodeRow` component in `ArtifactList.tsx` is defined at module scope (not inside the component function) to prevent React from re-creating it on every render, which would cause collapsible state to reset.
