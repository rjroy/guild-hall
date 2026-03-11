---
title: Dashboard
date: 2026-03-01
status: current
tags: [dashboard, ui, server-component, overview]
modules: [web-app, web-dashboard, daemon-briefing, lib-artifacts, lib-daemon-client]
---

# Feature: Dashboard

## What It Does

The dashboard is the root page (`/`) of Guild Hall. It provides a workspace overview: a sidebar listing registered projects, an AI-generated briefing for the selected project, a dependency map of all commissions across projects, a feed of recent artifacts for the selected project, and a list of pending meeting requests with inline actions. The page is a server component that reads project state from integration worktrees at render time, with two client-side features (briefing and meeting request actions) that call through to the daemon.

## Capabilities

- **Project selection**: Click a project in the sidebar to filter the recent artifacts feed. Sets `?project=<name>` query parameter. Each project also links to its project view page.
- **Manager briefing**: AI-generated project status summary using the Guild Master's context and read-only tools. Fetches on project selection, cached on disk keyed by HEAD commit with 1-hour TTL (cache valid when either HEAD matches or within TTL; both must be stale to regenerate). Falls back to single-turn SDK or template-based summary.
- **Dependency map**: Cross-project view of all commissions. Renders as an SVG graph when inter-commission dependency edges exist, or a flat card list otherwise. Each node is colored by status and clickable to navigate to the commission detail view.
- **Recent artifacts**: Shows the 10 most recently modified `.lore/` artifacts for the selected project, sorted by file modification time. Meeting artifacts route intelligently: open meetings link to the live meeting view, requested meetings link to the project meetings tab, other artifacts link to the artifact viewer.
- **Pending audiences**: Lists meeting requests (status: "requested") across all projects. Each request card supports four actions: Open (accept + stream first turn + navigate to meeting), Quick Comment (create commission from agenda + decline meeting), Defer (set deferred_until date), and Ignore (decline).

## Layout

Five-zone CSS Grid:

```
+----------+------------------------+-------------+
| sidebar  |  briefing              | recent      |
|          +------------------------+ artifacts   |
|          |  depMap                |             |
+----------+------------------------+-------------+
|          |  audiences (spans center + right)    |
+----------+--------------------------------------+
```

Columns: 260px sidebar, flexible center, 320px right panel.

## Entry Points

| Entry | Type | Handler |
|-------|------|---------|
| `/` | Page | `web/app/page.tsx` (server component) |
| `GET /api/briefing/[projectName]` | Next.js API | `web/app/api/briefing/[projectName]/route.ts` -> daemon proxy |
| `GET /api/daemon/health` | Next.js API | `web/app/api/daemon/health/route.ts` -> daemon health check |
| `GET /briefing/:projectName` | Daemon | `daemon/routes/briefing.ts` -> briefing generator |

## Implementation

### Files Involved

| File | Role |
|------|------|
| `web/app/page.tsx` | Server component: reads config, scans commissions across all projects, scans meeting requests across all projects, fetches recent artifacts for selected project. Composes the five dashboard panels. |
| `web/app/page.module.css` | Five-zone grid layout definition. |
| `web/components/dashboard/WorkspaceSidebar.tsx` | Server component: project list with selection highlighting and "View" links to project pages. |
| `web/components/dashboard/ManagerBriefing.tsx` | Client component: fetches briefing from `/api/briefing/:name` on project selection, shows loading skeleton, relative timestamp, error state. |
| `web/components/dashboard/DependencyMap.tsx` | Server component: builds dependency graph from all commissions, renders SVG graph (via CommissionGraph) when edges exist, flat card list otherwise. Exports `sortCommissions` and `commissionHref` helpers. |
| `web/components/dashboard/CommissionGraph.tsx` | Client component: SVG rendering of dependency graph. Sugiyama-style layered layout via `layoutGraph()`. Nodes colored by status (gem fill/stroke colors), clickable for navigation. Supports compact mode and focal node highlighting. |
| `web/components/dashboard/RecentArtifacts.tsx` | Server component: displays recent artifacts with scroll icons, gem status indicators. `artifactHref()` routes meeting artifacts intelligently by status. |
| `web/components/dashboard/PendingAudiences.tsx` | Server component: renders MeetingRequestCard for each pending request. |
| `web/components/dashboard/MeetingRequestCard.tsx` | Client component: four actions (Open, Quick Comment, Defer, Ignore). Open accepts meeting, consumes SSE first-turn stream via `consumeFirstTurnSSE`, stores messages in sessionStorage, navigates to meeting view. Quick Comment creates a commission and declines the meeting. Defer shows date picker inline. |
| `daemon/routes/briefing.ts` | Thin route delegating to briefing generator. |
| `daemon/services/briefing-generator.ts` | Assembles project context via `buildManagerContext()`, generates briefing via multi-turn SDK (Guild Master, read-only tools), single-turn SDK, or template fallback. File-based cache at `~/.guild-hall/state/briefings/<project>.json` keyed by HEAD commit with 1-hour TTL. Cache valid when either HEAD matches or within TTL; both must be stale to regenerate. |
| `daemon/services/manager-context.ts` | Builds the manager's project context string (commissions by status, active meetings, pending requests, worker roster). Shared with the Guild Master worker's system prompt. |
| `lib/artifacts.ts` | `scanArtifacts`, `readArtifact`, `recentArtifacts`, `writeArtifactContent`. Recursive markdown scanning with frontmatter parsing, path traversal validation, body-only splicing. |
| `lib/daemon-client.ts` | Next.js proxy layer for daemon communication over Unix socket. `daemonFetch` (request/response), `daemonHealth` (health check), `daemonStream`/`daemonStreamAsync` (SSE streaming). |
| `lib/sse-helpers.ts` | SSE parsing utilities shared between MeetingRequestCard and WorkerPicker. `parseSSEBuffer`, `consumeFirstTurnSSE`, `storeFirstTurnMessages`. |
| `lib/dependency-graph.ts` | `buildDependencyGraph`, `layoutGraph`. Graph construction and Sugiyama-style layered layout. |
| `web/components/ui/DaemonStatus.tsx` | Client component: polls `/api/daemon/health` every 5 seconds, provides `isOnline` via DaemonContext. Shows fixed-position offline indicator. |
| `web/components/ui/DaemonContext.tsx` | React context providing `{ isOnline }` to client components that need to disable actions when the daemon is offline. |

### Data Sources

The dashboard reads from multiple sources at render time:

- **Config**: `~/.guild-hall/config.yaml` for project list (via `readConfig()`)
- **Commissions**: `{integration}/.lore/commissions/*.md` across all projects (via `scanCommissions()`)
- **Meeting requests**: `{integration}/.lore/meetings/*.md` filtered to status "requested" across all projects (via `scanMeetingRequests()`)
- **Recent artifacts**: `{integration}/.lore/**/*.md` for selected project (via `recentArtifacts()`)
- **Briefing**: daemon endpoint `GET /briefing/:name` with file-based cache (via client-side fetch)
- **Daemon health**: daemon endpoint `GET /health` (via polling)

All filesystem reads use the integration worktree path (`~/.guild-hall/projects/<name>/`), which is the `claude` branch checkout.

### Dependencies

- Uses: [commissions](./commissions.md) (`scanCommissions` for dependency map, commission links)
- Uses: [meetings](./meetings.md) (`scanMeetingRequests` for pending audiences, accept/decline/defer actions)
- Uses: [dependency-graph](./dependency-graph.md) (`buildDependencyGraph`, `layoutGraph` for SVG rendering)
- Uses: Daemon client (briefing proxy, health polling)
- Uses: Briefing generator (AI-generated project summaries via manager context)
- Uses: SSE helpers (first-turn consumption when accepting a meeting from the dashboard)

## Connected Features

| Feature | Relationship |
|---------|-------------|
| [commissions](./commissions.md) | DependencyMap renders all commissions; Quick Comment creates a commission from a meeting request |
| [meetings](./meetings.md) | PendingAudiences shows meeting requests; Open/Defer/Ignore actions call meeting daemon endpoints |
| Project View | Sidebar "View" links navigate to project pages |
| [dependency-graph](./dependency-graph.md) | CommissionGraph uses graph construction and layout algorithms |
| [workers-toolbox](./workers-toolbox.md) | Briefing generator uses manager context which includes worker roster |

## Implementation Status

| Layer | Status | Notes |
|-------|--------|-------|
| Backend API | Complete | Briefing route with SDK + template fallback, file-based cache |
| Frontend UI | Complete | Five-zone grid, all panels implemented, inline meeting actions |
| Tests | Complete | Part of the 1529 tests passing across the project |

## Notes

- The dashboard is a server component at the page level. It reads filesystem state at render time (commissions, meeting requests, artifacts). The two client components (ManagerBriefing, MeetingRequestCard) call through to the daemon for actions that require write operations.
- Meeting requests are sorted with active (no `deferred_until`) first, then by deferred date ascending, then by creation date descending.
- The briefing generator uses `buildManagerContext()` from `manager-context.ts`, the same context builder that provides the Guild Master worker's system prompt. This means the dashboard briefing reflects the same project state the Guild Master sees.
- The `artifactHref()` function in RecentArtifacts demonstrates how meeting artifacts need status-aware routing: open meetings go to the live chat view, requested meetings go to the meetings tab (where accept actions are available), while all other artifacts go to the generic artifact viewer.
- `DaemonStatus` wraps the entire app (in `layout.tsx`), polling health every 5 seconds. All action buttons across the app check `isOnline` to disable themselves when the daemon is unreachable. Children always render regardless of daemon state because server components read from the filesystem directly.
- The `daemonStream`/`daemonStreamAsync` functions in `daemon-client.ts` handle SSE proxying from the daemon's Unix socket to the browser. `daemonStreamAsync` waits for the HTTP connection to establish before resolving, allowing the Next.js API route to detect connection failures before committing to a streaming response.
