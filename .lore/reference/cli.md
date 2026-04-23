---
title: CLI and Git Operations
date: 2026-03-01
status: current
tags: [cli, git, registration, rebase, sync, branch-strategy, worktrees]
modules: [cli, daemon-lib-git, lib-config, lib-paths]
---

# Feature: CLI and Git Operations

## What It Does

The CLI is a set of short-lived bun scripts for managing Guild Hall's project registry and git branch strategy. It handles project registration (validating paths, creating the `claude/main` branch, setting up the integration worktree), rebasing `claude/main` onto the project's default branch, smart post-merge syncing that detects merged PRs and resets or rebases accordingly, and validating the config file. The CLI runs as one-shot processes that exit after completing their operation, unlike the long-lived daemon. All git operations go through a shared `GitOps` interface that strips inherited git environment variables to prevent cross-repo contamination.

## Capabilities

- **Register project**: Validates that the project path exists and contains `.git/` and `.lore/` directories, rejects duplicate names, detects the default branch, creates the `claude/main` branch from HEAD if it doesn't exist, creates an integration worktree and activity worktree root directory, then appends the project to `config.yaml`.
- **Rebase**: Rebases `claude/main` onto the project's default branch. Skips projects with active commissions or meetings (checked by scanning state files). Operates on one project or all registered projects. Aborts and leaves the repo clean if rebase conflicts.
- **Sync**: Smart post-merge synchronization that replaces unconditional rebase. Fetches from origin, then uses a multi-step decision tree: (1) if `claude/main` is behind origin, check for PR marker match or tree equality and reset; (2) if `claude/main` is ahead, noop; (3) if diverged, check PR marker for exact match (reset) or tip advancement (rebaseOnto), then try tree equality (reset), then fall back to merge+compact. Falls back to local rebase when no remote is available. Runs under a per-project mutex via `withProjectLock`.
- **Validate**: Reads `config.yaml` (Zod schema validation happens in `readConfig`), then checks each registered project's path for existence, `.git/`, and `.lore/`. Reports all issues before exiting with an appropriate exit code.

## Entry Points

| Entry | Type | Handler |
|-------|------|---------|
| `guild-hall register <name> <path>` | CLI | `apps/cli/index.ts` -> `apps/cli/register.ts:register()` |
| `guild-hall rebase [name]` | CLI | `apps/cli/index.ts` -> `apps/cli/rebase.ts:rebase()` |
| `guild-hall sync [name]` | CLI | `apps/cli/index.ts` -> `apps/cli/rebase.ts:sync()` |
| `guild-hall validate` | CLI | `apps/cli/index.ts` -> `apps/cli/validate.ts:validate()` |

All commands are invoked via `bun run guild-hall <command>`.

## Implementation

### Files Involved

| File | Role |
|------|------|
| `apps/cli/index.ts` | Entry point: `#!/usr/bin/env bun`, switch/case routing for register/rebase/sync/validate/help commands, top-level error catch with `process.exit(1)`. |
| `apps/cli/register.ts` | `register(name, projectPath, homeOverride?, gitOps?)`: validates path, rejects duplicates, detects default branch, creates `claude/main` branch, creates integration worktree and activity worktree root, writes config. Git setup runs before config write so failures leave config untouched. |
| `apps/cli/rebase.ts` | Contains `hasActiveActivities()` (scans commission + meeting state files), `rebaseProject()` (single project rebase with active-activity guard), `rebase()` (CLI entry, one or all), `syncProject()` (smart sync under project lock), `sync()` (CLI entry, one or all), `readPrMarker()`, `removePrMarker()`. Exports `SyncResult` type with five variants: reset, rebase, merge, skip, noop. |
| `apps/cli/validate.ts` | `validate(homeOverride?)`: reads config (Zod validation via `readConfig()`), checks each project path for existence + `.git/` + `.lore/`, reports all issues, returns exit code 0 (valid) or 1 (issues). |
| `apps/daemon/lib/git.ts` | `CLAUDE_BRANCH = "claude/main"`, `cleanGitEnv()` (strips `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE`), `runGit()` (buffer-drain pattern via `Response.text()`), `GitOps` interface (28 methods), `createGitOps()` implementation, `finalizeActivity()` (shared squash-merge flow for commissions and meetings), `resolveSquashMerge()` (auto-resolves `.lore/` conflicts with `--theirs`, aborts on non-`.lore/` conflicts). |
| `apps/daemon/lib/project-lock.ts` | `withProjectLock()`: per-project cooperative mutex using a `Map<string, Promise>` chain. Serializes git operations on the same project, allows different projects to run concurrently. Error-resilient: rejections don't block queued operations. |
| `lib/config.ts` | `readConfig()` (YAML parse + Zod validation, returns `{projects:[]}` if file missing), `writeConfig()` (YAML serialize + write, creates parent dir), `getProject()` (convenience lookup). Exports `projectConfigSchema` and `appConfigSchema` Zod schemas. |
| `lib/paths.ts` | Path resolution functions: `getGuildHallHome()` (3 strategies: homeOverride, `GUILD_HALL_HOME` env, `~/.guild-hall/`), `getConfigPath()`, `integrationWorktreePath()`, `activityWorktreeRoot()`, `commissionWorktreePath()`, `meetingWorktreePath()`, `commissionBranchName()`, `meetingBranchName()`, `briefingCachePath()`, `resolveCommissionBasePath()`, `resolveMeetingBasePath()`. |

### Data

- **Config**: `~/.guild-hall/config.yaml` (YAML, Zod-validated, project registry and app settings)
- **PR markers**: `~/.guild-hall/state/pr-pending/<projectName>.json` (written by manager toolbox's `create_pr`, consumed by `syncProject`)
- **Commission state files**: `~/.guild-hall/state/commissions/<id>.json` (scanned by `hasActiveActivities`)
- **Meeting state files**: `~/.guild-hall/state/meetings/<id>.json` (scanned by `hasActiveActivities`)
- **Integration worktrees**: `~/.guild-hall/projects/<name>/` (created by `register`, used as `claude/main` checkout)
- **Activity worktree root**: `~/.guild-hall/worktrees/<name>/` (created by `register`)

### Git Branch Strategy

Three tiers of branches:

1. **Default branch** (`main`/`master`): The project's upstream branch. Guild Hall never writes to it directly.
2. **Integration branch** (`claude/main`): Guild Hall's working branch. All AI-produced artifacts land here. The integration worktree is a persistent checkout of this branch at `~/.guild-hall/projects/<name>/`. The branch name uses `claude/main` instead of `claude` because git refs are filesystem paths: a file at `refs/heads/claude` would block creating `refs/heads/claude/meeting/...` as a directory.
3. **Activity branches** (`claude/commission/<id>`, `claude/meeting/<id>`): Short-lived branches forked from `claude/main` for individual commissions and meetings. Each gets its own worktree with sparse checkout (`.lore/` only). On completion, work is squash-merged back to `claude/main` via `finalizeActivity()`.

The sync command handles the lifecycle: after a PR from `claude/main` is merged to the default branch, `syncProject` detects the merge (via PR marker or tree comparison) and resets `claude/main` to the new remote tip.

### Dependencies

- Uses: `lib/config.ts` (config read/write)
- Uses: `lib/paths.ts` (path resolution)
- Uses: `apps/daemon/lib/git.ts` (`GitOps` interface, `CLAUDE_BRANCH`)
- Uses: `apps/daemon/lib/project-lock.ts` (`withProjectLock` for sync serialization)
- Uses: `apps/daemon/services/manager-toolbox.ts` (`PrMarker` type import)
- Used by: [workers-toolbox](./workers-toolbox.md) (manager toolbox's `sync_project` delegates to `syncProject()`)
- Used by: Daemon startup (may invoke sync on boot)

## Connected Features

| Feature | Relationship |
|---------|-------------|
| [workers-toolbox](./workers-toolbox.md) | Manager toolbox's `sync_project` tool delegates to `syncProject()`. Manager's `create_pr` writes PR markers that `syncProject` consumes. |
| [commissions](./commissions.md) | Commission sessions use `GitOps` for worktree/branch management and `finalizeActivity()` for squash-merge on completion. `hasActiveActivities` checks commission state to guard rebase/sync. |
| [meetings](./meetings.md) | Meeting sessions use `GitOps` for worktree/branch management and `finalizeActivity()` for squash-merge on close. `hasActiveActivities` checks meeting state to guard rebase/sync. |

## Implementation Status

| Layer | Status | Notes |
|-------|--------|-------|
| Backend API | N/A | CLI is not served via HTTP |
| CLI | Complete | All four commands implemented with DI for testability |
| Tests | Complete | Part of the 1529 tests passing across the project |

## Notes

- **DI throughout**: All CLI functions accept optional `homeOverride` and `gitOps` parameters, making them fully testable without touching real git repos. Tests use `fs.mkdtemp()` temp directories and inject mock `GitOps` implementations.
- **Sync decision tree**: The `syncProject` function handles six distinct scenarios: already current (noop), `claude/main` ahead of remote (noop, PR not yet merged), behind with PR marker match (reset), behind with tree equality (reset, marker missing), diverged with PR marker (reset or rebaseOnto depending on whether tip advanced), diverged without marker (merge+compact or tree-equality reset). The merge+compact fallback (merge origin into claude, soft-reset to origin, recommit) is needed because rebase would try to replay already-squash-merged commits and conflict.
- **`cleanGitEnv()` is critical**: Pre-commit hooks set `GIT_DIR`, `GIT_WORK_TREE`, and `GIT_INDEX_FILE`. Without stripping these, any git subprocess spawned during a hook targets the hook's repo instead of the intended one. This caused data loss in Phase 5.
- **Buffer-drain pattern**: `runGit()` consumes both stdout and stderr via `Response.text()` before awaiting `proc.exited`. Without this, large git output fills the pipe buffer and deadlocks the process. Learned in Phase 4.
- **Register is atomic on config**: Git setup (branch creation, worktree creation) runs entirely before `writeConfig()`. If any git operation fails, the config file stays untouched and the project is not registered.
- **`--no-verify` on internal commits**: Activity worktrees use sparse checkout (`.lore/` only), so project pre-commit hooks (linters, tests) would fail on the incomplete repo. `commitAll` and `squashMerge` pass `--no-verify` because these are internal Guild Hall commits, not user commits.
- **`resolveSquashMerge` auto-resolution**: `.lore/` conflicts are auto-resolved with `--theirs` (the activity branch's version wins). Non-`.lore/` conflicts cause the merge to abort, and the branch is preserved for manual resolution or Guild Master escalation.
