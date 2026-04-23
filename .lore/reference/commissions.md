---
title: Commissions
date: 2026-03-01
status: current
tags: [commissions, async-work, state-machine, lifecycle]
modules: [daemon-services, daemon-routes, lib-commissions, web-commission]
---

# Feature: Commissions

## What It Does

Commissions are async work items that get dispatched to AI workers. A user creates a commission with a title, prompt, worker assignment, and optional dependencies, then dispatches it. The daemon runs an SDK session in-process, the worker does the work in an isolated git worktree, and the result gets squash-merged back to the `claude` branch. The user watches progress in real time via SSE and can cancel, re-dispatch, or add notes.

## Capabilities

- **Create commission**: Title, worker, prompt, optional dependencies and resource overrides (max turns, max budget USD)
- **Dispatch**: Sends the commission to its assigned worker. If at capacity, queues it (FIFO auto-dispatch when slots open)
- **Cancel**: Stops an active commission, preserves partial work on the activity branch
- **Re-dispatch**: Retry a failed or cancelled commission on a fresh branch (attempt suffix)
- **Add user note**: Append a note to an in-flight commission's timeline
- **Update pending**: Edit prompt, dependencies, or resource overrides before dispatch
- **Dependency tracking**: Commissions can depend on artifact paths. Blocked commissions auto-transition to pending when dependencies are satisfied
- **Live monitoring**: SSE events stream status changes, progress reports, questions, and result submissions to the browser

## State Machine

```
pending     -> dispatched, blocked, cancelled, abandoned
blocked     -> pending, cancelled, abandoned
dispatched  -> in_progress, failed, cancelled
in_progress -> completed, failed, cancelled
completed   -> failed  (merge conflict path)
failed      -> pending, abandoned
cancelled   -> pending, abandoned
abandoned   -> (terminal)
```

**Status groups** (for UI sort order): idle (pending, blocked), active (dispatched, in_progress), failed (failed, cancelled), completed.

**Auto-transitions:**
- `pending <-> blocked`: Dependency check scans artifact existence. Triggered after merge success and after artifact writes via the Next.js API.
- `pending -> dispatched`: Auto-dispatch queue. When an active commission completes/fails/cancels, the daemon scans pending commissions (oldest first) and dispatches any that fit under capacity limits.

**Capacity:** Per-project limit (default 3, configurable via `commissionCap` in config) and global limit (default 10, `maxConcurrentCommissions`).

## Commission Artifact

Each commission is a markdown file at `{project}/.lore/commissions/{commissionId}.md` with YAML frontmatter. The ID format is `commission-{workerName}-{YYYYMMDD}-{HHMMSS}`.

Frontmatter fields:
- `title`, `status`, `worker`, `workerDisplayTitle`, `prompt`
- `dependencies: []` (artifact paths, e.g. `commissions/other-commission.md`, `specs/foo.md`)
- `linked_artifacts: []` (paths to artifacts produced or referenced during work)
- `resource_overrides: { maxTurns, maxBudgetUsd }`
- `activity_timeline:` (append-only list of timestamped events)
- `current_progress:` (latest progress report, replace-latest)
- `result_summary:` (final result from submit_result)

The artifact file is the source of truth. The daemon manipulates it via regex/string operations (not gray-matter stringify) to avoid reformatting noise.

## Git Infrastructure

Each dispatched commission gets:
1. Its pending artifact committed to the integration worktree (so the activity branch includes it)
2. An activity branch forked from `claude` (e.g. `commission-developer-20260301-120000`)
3. An activity worktree at `~/.guild-hall/worktrees/{project}/{commissionId}/`
4. Optional sparse checkout (`.lore/` only) for workers with `checkoutScope: "sparse"`

On completion: squash-merge into `claude` via `finalizeActivity()` under a project lock. On failure/cancel: partial work committed, worktree removed, branch preserved. On merge conflict (non-.lore/ files): escalated to Guild Master via meeting request, commission transitions to failed.

Re-dispatch increments the attempt counter, creating a new branch with suffix (e.g. `commission-xxx-2`).

## Machine-Local State

State files at `~/.guild-hall/state/commissions/{commissionId}.json` track active commissions across daemon restarts. Fields: commissionId, projectName, workerName, status, worktreeDir, branchName.

**Crash recovery** on daemon startup:
1. State files for active commissions (dispatched/in_progress): transition to failed via the machine (commits partial work, cleans up worktree)
2. Orphaned worktrees (commission naming pattern, no state file): synthetic entry, transition to failed

## Entry Points

| Entry | Type | Handler |
|-------|------|---------|
| POST /commissions | Daemon | `apps/daemon/routes/commissions.ts` -> `commissionSession.createCommission()` |
| POST /commissions/check-dependencies | Daemon | `apps/daemon/routes/commissions.ts` -> `commissionSession.checkDependencyTransitions()` |
| PUT /commissions/:id | Daemon | `apps/daemon/routes/commissions.ts` -> `commissionSession.updateCommission()` |
| POST /commissions/:id/dispatch | Daemon | `apps/daemon/routes/commissions.ts` -> `commissionSession.dispatchCommission()` |
| DELETE /commissions/:id | Daemon | `apps/daemon/routes/commissions.ts` -> `commissionSession.cancelCommission()` |
| POST /commissions/:id/redispatch | Daemon | `apps/daemon/routes/commissions.ts` -> `commissionSession.redispatchCommission()` |
| POST /commissions/:id/note | Daemon | `apps/daemon/routes/commissions.ts` -> `commissionSession.addUserNote()` |
| /projects/[name]/commissions/[id] | Page | `apps/web/app/projects/[name]/commissions/[id]/page.tsx` |
| /api/commissions/* | Next.js API | Proxy routes to daemon |

## Implementation

### Files Involved

| File | Role |
|------|------|
| `apps/daemon/routes/commissions.ts` | Thin route layer, validates input, delegates to session |
| `apps/daemon/services/commission-session.ts` | Orchestration core: CRUD, SDK runner, queue, dependency transitions |
| `apps/daemon/services/commission-handlers.ts` | State machine graph, enter/exit handler implementations |
| `apps/daemon/services/commission-artifact-helpers.ts` | Read/write commission artifact frontmatter (regex ops) |
| `apps/daemon/services/commission-capacity.ts` | Concurrent limit checks (pure functions) |
| `apps/daemon/services/commission-recovery.ts` | Crash recovery: state files + orphaned worktrees |
| `apps/daemon/services/commission-sdk-logging.ts` | SDK message formatting for console |
| `apps/daemon/services/commission-toolbox.ts` | Commission-context MCP tools (see Workers/Toolbox feature) |
| `lib/commissions.ts` | Read-only scanning/parsing for Next.js server components |
| `lib/paths.ts` | Path resolution (integration worktree, commission worktree, branch names) |
| `apps/web/app/projects/[name]/commissions/[id]/page.tsx` | Server component: reads artifact, builds dependency graph neighborhood |
| `apps/web/components/commission/CommissionView.tsx` | Client wrapper: SSE subscription, live status/timeline/artifact updates |
| `apps/web/components/commission/CommissionActions.tsx` | Action buttons (dispatch, cancel, re-dispatch) per status |
| `apps/web/components/commission/CommissionForm.tsx` | Create commission form (fetches workers, POSTs to API) |
| `apps/web/components/commission/CommissionList.tsx` | Server component: sorted list with gem indicators |
| `apps/web/components/commission/CommissionHeader.tsx` | Title, status, worker badge |
| `apps/web/components/commission/CommissionTimeline.tsx` | Chronological event list |
| `apps/web/components/commission/CommissionPrompt.tsx` | Prompt display |
| `apps/web/components/commission/CommissionLinkedArtifacts.tsx` | Links to produced artifacts |
| `apps/web/components/commission/CommissionNotes.tsx` | User note input form |
| `apps/web/components/commission/NeighborhoodGraph.tsx` | Dependency graph visualization (see Dependency Graph feature) |

### Data

- **Commission artifacts**: `{project}/.lore/commissions/{commissionId}.md` (markdown + YAML frontmatter)
- **State files**: `~/.guild-hall/state/commissions/{commissionId}.json` (machine-local, ephemeral)
- **Config**: `~/.guild-hall/config.yaml` (commissionCap per project, maxConcurrentCommissions global)

### Dependencies

- Uses: [workers/toolbox](./workers-toolbox.md) (commission toolbox provides report_progress, submit_result)
- Uses: [dependency-graph](./dependency-graph.md) (neighborhood visualization on commission detail page)
- Uses: EventBus (SSE event delivery to browser)
- Uses: ActivityMachine (generic state machine shared with meetings)
- Uses: Git operations (worktree creation, sparse checkout, squash-merge, branch management)
- Used by: Dashboard (pending commissions count, dependency map)
- Used by: Project View (commissions tab)

## Connected Features

| Feature | Relationship |
|---------|-------------|
| [workers-toolbox](./workers-toolbox.md) | Commission toolbox provides tools to workers during active sessions |
| [dependency-graph](./dependency-graph.md) | Visualizes commission-to-commission dependencies |
| [meetings](./meetings.md) | Merge conflict escalation creates Guild Master meeting requests |
| Dashboard | Shows pending commissions and dependency map |
| Project View | Commissions tab lists all commissions for a project |

## Implementation Status

| Layer | Status | Notes |
|-------|--------|-------|
| Backend API | Complete | All 8 routes implemented, capacity management, dependency transitions, crash recovery |
| Frontend UI | Complete | Create form, detail view with SSE, actions, timeline, linked artifacts, notes |
| Tests | Complete | 1529 tests pass across the project (coverage includes commission lifecycle, handlers, capacity, recovery) |

## Notes

- The "queue" is not a data structure. It's readdir + sort by creation date. Auto-dispatch scans all projects' pending commissions when capacity opens.
- Artifact writes use regex/string replacement to avoid gray-matter's YAML reformatting (same lesson as meeting artifacts).
- The ActivityMachine releases its lock before running enter handlers, enabling the re-entrant completed -> failed transition for merge conflicts.
- Commission sessions run in-process (not as separate processes). They don't survive daemon restarts. Recovery always transitions interrupted commissions to failed.
- The `syncStatusToIntegration` function copies terminal status back to the integration worktree so the artifact is visible after the activity worktree is cleaned up.
