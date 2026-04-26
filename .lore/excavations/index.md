---
title: Excavation Index
date: 2026-03-01
status: current
tags: [excavation, index, reference]
---

# Excavation Index

## System Overview

Guild Hall is a multi-agent workspace: a daemon owns all write operations and agent sessions, Next.js serves a read-heavy UI, a CLI manages project registration and git branch strategy, and worker packages define specialist AI agents.

Two processes run at runtime:
1. **Daemon** (`bun apps/daemon/index.ts`) on Unix socket (`~/.guild-hall/guild-hall.sock`), owns meetings, commissions, EventBus
2. **Next.js** (`next start web`) reads filesystem for pages, proxies writes to daemon

The CLI runs as short-lived one-shot processes interacting with git and config directly.

## Documented Features

| Feature | Spec | Excavated | Connected To |
|---------|------|-----------|--------------|
| Commissions | [commissions.md](../reference/commissions.md) | 2026-03-01 | workers-toolbox, dependency-graph, meetings, dashboard, project-view |
| Meetings | [meetings.md](../reference/meetings.md) | 2026-03-01 | workers-toolbox, commissions, dashboard, project-view |
| Dashboard | [dashboard.md](../reference/dashboard.md) | 2026-03-01 | commissions, meetings, dependency-graph, project-view, workers-toolbox |
| Project View | [project-view.md](../reference/project-view.md) | 2026-03-01 | commissions, meetings, dashboard, dependency-graph, workers-toolbox |
| Workers / Toolbox | [workers-toolbox.md](../reference/workers-toolbox.md) | 2026-03-01 | commissions, meetings, dashboard, project-view |
| CLI / Git Operations | [cli.md](../reference/cli.md) | 2026-03-01 | commissions, meetings, workers-toolbox |
| Infrastructure | [infrastructure.md](../reference/infrastructure.md) | 2026-03-01 | meetings, commissions, dashboard, project-view, workers-toolbox, cli |
| Dependency Graph | [dependency-graph.md](../reference/dependency-graph.md) | 2026-03-01 | commissions, dashboard, project-view |
| Artifact System | [artifacts.md](../reference/artifacts.md) | 2026-03-01 | dashboard, project-view, meetings, commissions |

## Feature Areas (Discovered)

These are the natural feature groupings identified from entry point analysis. Each will become one or more reference specs.

### Dashboard

| Entry Point | Type | Location | Notes |
|-------------|------|----------|-------|
| `/` | Page | `apps/web/app/page.tsx` | Projects sidebar, briefing, dependency map, recent artifacts, pending audiences. Query param: `?project=<name>` |

### Meetings

| Entry Point | Type | Location | Notes |
|-------------|------|----------|-------|
| `/projects/[name]/meetings/[id]` | Page | `apps/web/app/projects/[name]/meetings/[id]/page.tsx` | Live meeting view or ended state |
| `POST /meetings` | Daemon | `apps/daemon/routes/meetings.ts` | Create meeting, stream first turn (SSE) |
| `POST /meetings/:id/messages` | Daemon | `apps/daemon/routes/meetings.ts` | Send follow-up, stream response (SSE) |
| `DELETE /meetings/:id` | Daemon | `apps/daemon/routes/meetings.ts` | Close meeting, return notes |
| `POST /meetings/:id/interrupt` | Daemon | `apps/daemon/routes/meetings.ts` | Stop current generation |
| `POST /meetings/:id/accept` | Daemon | `apps/daemon/routes/meetings.ts` | Accept a meeting request, stream first turn |
| `POST /meetings/:id/decline` | Daemon | `apps/daemon/routes/meetings.ts` | Decline a meeting request |
| `POST /meetings/:id/defer` | Daemon | `apps/daemon/routes/meetings.ts` | Defer a meeting request with timestamp |
| `POST /api/meetings/[id]/quick-comment` | Next.js API | `apps/web/app/api/meetings/[meetingId]/quick-comment/route.ts` | Compound: create commission from meeting request + decline |

### Commissions

| Entry Point | Type | Location | Notes |
|-------------|------|----------|-------|
| `/projects/[name]/commissions/[id]` | Page | `apps/web/app/projects/[name]/commissions/[id]/page.tsx` | Commission detail with timeline, dependency graph |
| `POST /commissions` | Daemon | `apps/daemon/routes/commissions.ts` | Create commission |
| `POST /commissions/check-dependencies` | Daemon | `apps/daemon/routes/commissions.ts` | Trigger dependency auto-transitions |
| `PUT /commissions/:id` | Daemon | `apps/daemon/routes/commissions.ts` | Update pending commission |
| `POST /commissions/:id/dispatch` | Daemon | `apps/daemon/routes/commissions.ts` | Dispatch to worker |
| `DELETE /commissions/:id` | Daemon | `apps/daemon/routes/commissions.ts` | Cancel commission |
| `POST /commissions/:id/redispatch` | Daemon | `apps/daemon/routes/commissions.ts` | Re-dispatch failed/cancelled |
| `POST /commissions/:id/note` | Daemon | `apps/daemon/routes/commissions.ts` | User adds note |

### Project View

| Entry Point | Type | Location | Notes |
|-------------|------|----------|-------|
| `/projects/[name]` | Page | `apps/web/app/projects/[name]/page.tsx` | Tabs: artifacts, commissions, meetings. Query params: `?tab=`, `?newCommission=true`, `?dep=` |
| `/projects/[name]/artifacts/[...path]` | Page | `apps/web/app/projects/[name]/artifacts/[...path]/page.tsx` | Catch-all artifact viewer for deep paths |
| `PUT /api/artifacts` | Next.js API | `apps/web/app/api/artifacts/route.ts` | Write artifact + auto-commit + check-dependencies (not a proxy, does real work) |

### Infrastructure (Daemon)

| Entry Point | Type | Location | Notes |
|-------------|------|----------|-------|
| `GET /health` | Daemon | `apps/daemon/routes/health.ts` | Active meetings, commissions, uptime |
| `GET /events` | Daemon | `apps/daemon/routes/events.ts` | SSE event stream (EventBus subscription) |
| `GET /workers` | Daemon | `apps/daemon/routes/workers.ts` | List discovered worker packages |
| `GET /briefing/:projectName` | Daemon | `apps/daemon/routes/briefing.ts` | AI-generated project status briefing |

### CLI

| Entry Point | Type | Location | Notes |
|-------------|------|----------|-------|
| `guild-hall register <name> <path>` | CLI | `apps/cli/register.ts` | Register project: validate, create `claude` branch, setup integration worktree, write config |
| `guild-hall rebase [name]` | CLI | `apps/cli/rebase.ts` | Rebase `claude` onto default branch |
| `guild-hall sync [name]` | CLI | `apps/cli/rebase.ts` | Smart sync: fetch, detect merged PRs, rebase |
| `guild-hall validate` | CLI | `apps/cli/validate.ts` | Validate config.yaml and project paths |

### Workers

| Package | Location | Notes |
|---------|----------|-------|
| Guild Master | `apps/daemon/services/manager-worker.ts` | Built-in manager, exclusive toolbox, coordination posture |
| guild-hall-developer | `packages/guild-hall-developer/index.ts` | Uses shared activation pattern |
| guild-hall-researcher | `packages/guild-hall-researcher/index.ts` | Uses shared activation pattern |
| guild-hall-reviewer | `packages/guild-hall-reviewer/index.ts` | Uses shared activation pattern |
| guild-hall-writer | `packages/guild-hall-writer/index.ts` | Uses shared activation pattern |
| Shared activation | `packages/shared/worker-activation.ts` | Builds system prompt, sets model to opus |

### Cross-Cutting

| Concern | Location | Notes |
|---------|----------|-------|
| EventBus | `apps/daemon/services/` | Set-based pub/sub, SSE to browser |
| Daemon client | `lib/daemon-client` | Next.js proxy layer to daemon socket |
| Config | `lib/config` | `~/.guild-hall/config.yaml` project registry |
| Git operations | `apps/daemon/lib/git.ts` | Worktree management, branch strategy |
| Toolbox resolver | `apps/daemon/services/` | Name-based registry, DI factory |
| Types | `lib/types.ts` (shared), `daemon/` (daemon-specific) | Type boundary between layers |

## Absorbed Subsystems

The following were discovered during excavation but documented as subsections of their parent features rather than standalone specs:

- **Query Runner, Briefing Generator, Daemon Client, SSE Helpers** -> [Infrastructure](../reference/infrastructure.md)
- **Transcript System** (transcript recording, notes generation, message parsing) -> [Meetings](../reference/meetings.md)
- **Artifact Grouping** (tree construction, directory grouping) -> [Artifact System](../reference/artifacts.md)

## Next Steps

All discovered features have been documented. Run the verification checklist (Step 7 of the excavation process) to confirm coverage before declaring excavation complete.
