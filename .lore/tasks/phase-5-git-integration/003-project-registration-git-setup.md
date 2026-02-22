---
title: "Project registration creates claude branch and integration worktree"
date: 2026-02-22
status: pending
tags: [task, registration, worktree, claude-branch]
source: .lore/plans/phase-5-git-integration.md
related:
  - .lore/specs/guild-hall-system.md
sequence: 3
modules: [cli-register, daemon-app]
---

# Task: Project Registration Git Setup

## What

Update `cli/register.ts` to initialize git integration when registering a project. Update `daemon/app.ts` (`createProductionApp`) to verify integration worktrees on startup.

**cli/register.ts changes:**

After existing validation and before writing to config.yaml, add three git operations:
1. Create `claude` branch from project's current HEAD (if it doesn't exist): `git.initClaudeBranch(resolved)`
2. Create integration worktree at `~/.guild-hall/projects/<name>/` on the `claude` branch: `git.createWorktree(resolved, integrationPath, "claude")`
3. Ensure `~/.guild-hall/worktrees/<name>/` directory exists for future activity worktrees

Add `gitOps?: GitOps` parameter to `register()` as the DI seam. Default to `createGitOps()`.

Config.yaml is NOT written until git setup succeeds. If git operations fail, the error propagates to the user and registration aborts.

**daemon/app.ts changes (`createProductionApp`):**

At startup, after loading config, verify integration worktrees exist for all registered projects. If missing (user deleted `~/.guild-hall/projects/` or fresh install after config.yaml restore), recreate them. Log the recreation.

If recreation fails, log the error and skip the project (don't crash the daemon). The project will be non-functional but the daemon stays up.

Add `gitOps?: GitOps` to `createProductionApp` options. Default to `createGitOps()`.

## Validation

Test cases:
- Register: creates claude branch, creates integration worktree at correct path
- Register: existing claude branch is a no-op (idempotent)
- Register: creates worktree directory structure
- Register: git failure prevents config write (no partial registration)
- Daemon startup: missing integration worktree is recreated
- Daemon startup: recreation failure is logged, daemon continues for other projects
- Daemon startup: existing worktrees are untouched

**CRITICAL: No real git operations in these tests.** Tests inject mock `gitOps`. Real git operations only happen in Task 001's tests (in `/tmp/`). Running real git commands from tests in the project worktree is what caused the Phase 5 data loss. The mock should track calls and simulate success/failure.

Run `bun test tests/cli/register.test.ts tests/daemon/app.test.ts` and verify all pass. Run `bun run typecheck`.

## Why

From `.lore/specs/guild-hall-system.md`:
- REQ-SYS-22: Claude branch must exist for the three-tier strategy
- REQ-SYS-28: Integration worktree per project under `~/.guild-hall/projects/`

From `.lore/retros/worker-dispatch.md`: "DI factory codebases need an explicit 'production wiring' step." The `gitOps` parameter on `createProductionApp` is that wiring.

From `.lore/retros/mcp-pid-files.md`: "Per-entity checks, not bulk cleanup." Worktree verification is per-project at startup.

## Files

- `cli/register.ts` (modify)
- `daemon/app.ts` (modify)
- `tests/cli/register.test.ts` (modify)
- `tests/daemon/app.test.ts` (create or modify)
