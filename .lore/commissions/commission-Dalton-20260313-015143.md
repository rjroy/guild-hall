---
title: "Commission: DAB Phase 4: CLI as Daemon Client"
date: 2026-03-13
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Task\n\nImplement Phase 4 of the Daemon Application Boundary migration: make CLI commands call daemon API routes instead of performing direct filesystem and git operations.\n\n## Plan Reference\n\nRead `.lore/plans/infrastructure/daemon-application-boundary.md`, Phase 4 section. Read `.lore/specs/infrastructure/daemon-application-boundary.md` for REQ-DAB-4.\n\n## CRITICAL: Follow the sub-step order\n\nThe plan specifies a strict implementation order to prevent circular dependencies (Risk R4). Do not rearrange these steps.\n\n### Step 1: Move shared logic to daemon service\n\nCreate `daemon/services/git-admin.ts` (or similar) containing `syncProject()`, `hasActiveActivities()`, and the rebase logic currently in `cli/rebase.ts`. These functions already operate on paths and git ops that the daemon has access to.\n\n### Step 2: Update daemon imports\n\nChange `daemon/services/manager/toolbox.ts` (which imports from `@/cli/rebase`) to import from the new daemon service. Update `daemon/app.ts` if it references CLI code. Run tests to confirm the daemon builds without any `@/cli/` imports.\n\n### Step 3: Create daemon admin routes\n\nAdd these to `daemon/routes/admin.ts`:\n- `POST /admin/register-project` — owns the full registration sequence (fs/git ops + config write + reload)\n- `GET /admin/validate` — validates config and project paths\n- `POST /admin/rebase` — rebase with project locking\n- `POST /admin/sync` — sync project (manager toolbox already has this logic via `sync_project`)\n\n### Step 4: Slim the CLI\n\nReplace CLI command internals with `daemonFetch()` calls. Each command becomes a thin script: parse args, call daemon, print result. CLI commands check daemon health first and give a clear error if daemon isn't running.\n\nLeave `migrate-content` as-is (one-time migration script).\n\n## Validation\n\n- CLI commands work correctly with daemon running.\n- CLI commands fail clearly with daemon offline (health check first).\n- `cli/rebase.ts` no longer exports functions imported by daemon code. Grep the daemon directory to confirm zero `@/cli/` imports.\n- Run full test suite before declaring complete.\n- Standing rule (REQ-DAB-14): confirm no new client-side authority paths."
dependencies:
  - commission-Dalton-20260313-015126
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-13T08:51:43.509Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-13T08:51:43.509Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-13T09:41:02.594Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-13T09:41:02.597Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
