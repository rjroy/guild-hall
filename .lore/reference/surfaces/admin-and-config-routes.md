---
title: Admin and Config Routes
date: 2026-04-27
status: current
tags: [admin, config, routes, register, project-lifecycle]
modules: [daemon-routes]
---

# Admin and Config Routes

Four route files own the daemon's project-lifecycle and config surface: `admin.ts` (register, deregister, reload, rebase, sync, validate), `config.ts` (read application + project config, dependency graph), `models.ts` (model catalog), `git-lore.ts` (`.lore/`-scoped commit). Endpoint paths are documented in `daemon-client.md`; the per-operation parameters are in code.

## Reload only sets up *new* projects

`/system/config/application/reload` reads disk config, then for each project in the fresh config that isn't in the current in-memory list: ensures the integration worktree exists, runs `syncProject`. Existing projects' worktrees and syncs are untouched. The intent is "I added a project to config.yaml, pick it up without restarting the daemon" — not "reset everything from disk."

## In-memory config is mutated in place, never reassigned

The daemon's many references to `deps.config` hold the same `config.projects` array reference. Reload uses `arr.length = 0; arr.push(...newItems)` rather than `deps.config.projects = newItems`. Reassigning would orphan every component that captured the original reference — admin, briefing, heartbeat, commission orchestrator, meeting orchestrator all read project lists at runtime from this same array. The mutation discipline is load-bearing.

The same pattern applies to register / deregister / group: each modifies the array in place after writing config.yaml.

## Register order: validate → git → disk config → in-memory config

The order matters for failure recovery:

1. Path exists, is a directory, contains `.git/`. (`.lore/` is NOT required at register time.)
2. Reject duplicate names (409).
3. Detect default branch from the project repo.
4. Create the `claude/main` branch (`initClaudeBranch`).
5. Create the integration worktree at `~/.guild-hall/projects/<name>/`.
6. Create the activity worktrees root at `~/.guild-hall/worktrees/<name>/`.
7. Write the new project to `config.yaml` on disk.
8. Push the new project into the in-memory `config.projects` array.

A git setup failure (steps 4-6) leaves config.yaml untouched and the project unregistered. A disk-write failure (step 7) leaves git artifacts but no config record — the next register call with the same name will fail at step 5 (worktree already exists) but config.yaml will still have nothing. Recovery requires manually removing the worktree.

The in-memory update is last so it can't drift from disk if disk write fails.

## Deregister rejects when active activities exist

`hasActiveActivities` (from `git-admin`) returns true if any commission is `dispatched`/`in_progress` or any meeting is `open` with non-project scope. Deregister returns 409 when active. The user must cancel/close active work before removing the project.

## Deregister `clean` is best-effort

Without `clean: true`, deregister only removes the project from config (disk + in-memory). With `clean: true`, also removes the integration worktree (via `git worktree remove --force` then `rm -rf` fallback) and the activity worktrees root. Either filesystem failure pushes the path to `failedCleanup`; deregister still succeeds. The user can manually remove what's left.

The config is removed regardless of cleanup outcome — partial filesystem cleanup with stale config is the worse failure mode.

## Validate distinguishes issues from warnings

`/system/config/application/validate` walks every project:

- Path missing / not a directory / missing `.git/` → **issue**, returns `valid: false`.
- Missing `.lore/` → **warning**, still returns `valid: true`.

Validate is the only place `.lore/` absence is reported. Register doesn't check for it because brand-new projects often haven't created `.lore/` yet. The warning surface lets the user see "this project will work but has no lore yet."

## Project read enriches description from `.lore/vision.md`

`/system/config/project/read` parses the project's `.lore/vision.md`, extracts the first section body (everything between the first `#` heading and the next heading), and uses it as the `description` field on the response. The enrichment is **read-side only** — `config.yaml`'s description stays untouched, no write occurs. Vision changes immediately update what UI sees without requiring a config rewrite.

Missing vision.md or missing first-section body → falls through, returns the config description as-is.

## Application read returns the whole `AppConfig`

`/system/config/application/read` returns `deps.config` directly: projects, models, systemModels, channels, notifications, settings, all caps. Used by web UI for one-shot config fetch. No filtering, no sanitization — everything in `AppConfig` is meant to be readable.

## `/commission/dependency/project/graph` lives in `config.ts`

The route belongs conceptually to the dependency-graph subsystem (Area 16), but the implementation is small enough to ride alongside config reads — it just calls `scanCommissions` + `buildDependencyGraph`. Co-locating it here means `config.ts` is the only route that imports `commission`-namespaced operations, which is mildly confusing but keeps file count down.

## Model catalog does live reachability checks

`/system/models/catalog/list` returns built-in models without any checks (`opus`, `sonnet`, `haiku`). For each configured local model, it runs `fetch(baseUrl, { signal: AbortSignal.timeout(1000) })` and reports `reachable: true | false`. The check happens on every request — no cache. This means the catalog endpoint takes up to N seconds for N local models, all queried in parallel via `Promise.all`.

## `/workspace/git/lore/commit` is `.lore`-scoped

Uses `gitOps.commitLore`, which uses `git add -- .lore/` (not `-A`) and `--no-verify`. The status route (`/workspace/git/lore/status`) returns `{hasPendingChanges, fileCount}` for the integration worktree's `.lore/` only. The intent is the web UI's "lore-only commit" workflow — let the user commit lore edits without dragging unrelated working-tree changes into the same commit.

`{committed: false, message: "Nothing to commit"}` returns 200, not 304, even though it's a no-op. The route's caller (web UI) can decide what UX feedback to show.

## Description ownership: each route owns its own scope

`createGitLoreRoutes` registers `workspace.git.lore` description. The parent `workspace.git` is owned by `admin.ts` (which has `branch.rebase` and `integration.sync`). A comment in `git-lore.ts` flags this:

> Do NOT register "workspace.git" here — admin.ts already owns it.

The operations registry would otherwise have duplicate-key chaos at startup, since descriptions are merged across modules and the last write wins.
