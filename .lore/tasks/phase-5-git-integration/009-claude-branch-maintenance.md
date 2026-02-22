---
title: "Claude branch rebase utility and CLI command"
date: 2026-02-22
status: pending
tags: [task, rebase, cli, daemon-startup]
source: .lore/plans/phase-5-git-integration.md
related:
  - .lore/specs/guild-hall-system.md
sequence: 9
modules: [daemon-app, cli]
---

# Task: Claude Branch Maintenance

## What

Add a rebase utility to keep the `claude` branch current with `master`. Create a CLI command for manual rebase. Wire rebase into daemon startup.

**Rebase utility function:**

Create `rebaseClaudeOntoMaster(projectPath, projectName, ghHome, gitOps)` that rebases the integration worktree onto master. Safety constraint: only rebase if no active commissions or meetings exist for the project (rebase while activities are running would cause branch conflicts).

**Daemon startup rebase (daemon/app.ts):**

After worktree verification (Task 003), for each project:
1. Check for active activities (via state files)
2. If none, rebase claude onto master
3. Log success or failure
4. On failure (conflict), log warning and continue. User resolves manually.

**CLI rebase command (cli/rebase.ts, new):**

```
bun run guild-hall rebase [project-name]
```

Rebases `claude` onto `master` for the specified project, or all projects if no name given. Accepts `gitOps` parameter for testability.

**CLI index update (cli/index.ts):**

Add the `rebase` subcommand to the CLI entry point.

## Validation

**CRITICAL: No real git operations in these tests.** All git calls go through mock `gitOps`. Real git only in Task 001 (in `/tmp/`).

Test cases:
- Rebase succeeds: claude branch integrates master's changes
- Rebase with no changes: no-op (no error)
- Rebase conflict: error thrown, integration worktree unchanged (rebase aborted)
- Daemon startup: rebase called for each project with no active activities
- Daemon startup: rebase skipped for projects with active commissions/meetings
- CLI rebase: calls rebase for specified project
- CLI rebase: calls rebase for all projects when no name given

Run `bun test tests/daemon/rebase.test.ts tests/cli/rebase.test.ts` and `bun run typecheck`.

## Why

From `.lore/specs/guild-hall-system.md`:
- REQ-SYS-23: PR from claude to master, squash-merged (infrastructure only; manager triggers in Phase 6)
- REQ-SYS-24: Claude rebases onto master when user pushes

From `.lore/plans/phase-5-git-integration.md`, Open Question 1: "Skip rebase if any activities are active for the project. The rebase happens on the next daemon restart when no activities are running."

## Files

- `cli/rebase.ts` (create)
- `cli/index.ts` (modify: add rebase subcommand)
- `daemon/app.ts` (modify: add startup rebase)
- `tests/cli/rebase.test.ts` (create)
- `tests/daemon/rebase.test.ts` (create)
