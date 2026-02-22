---
title: "Git operations library with DI-injectable interface"
date: 2026-02-22
status: pending
tags: [task, git, subprocess, di-factory]
source: .lore/plans/phase-5-git-integration.md
related:
  - .lore/specs/guild-hall-system.md
  - .lore/retros/phase-5-git-integration-data-loss.md
  - .lore/retros/phase-4-commissions.md
sequence: 1
modules: [daemon-lib-git]
---

# Task: Git Operations Library

## What

Create `daemon/lib/git.ts` with the `GitOps` interface and `createGitOps()` factory. This wraps all git subprocess calls behind a DI-injectable interface so consuming code (commission session, meeting session, registration, rebase) can be tested with mocks.

The `GitOps` interface exposes: `createBranch`, `branchExists`, `deleteBranch`, `createWorktree`, `removeWorktree`, `configureSparseCheckout`, `commitAll`, `squashMerge`, `hasUncommittedChanges`, `rebase`, `currentBranch`, `listWorktrees`, `initClaudeBranch`.

The internal `runGit(cwd, args)` helper uses `Bun.spawn` with `stdout: "pipe"` and `stderr: "pipe"`. Both streams must be actively consumed via `new Response(proc.stdout).text()` to avoid pipe blocking (Phase 4 retro lesson).

**Critical: `cleanGitEnv()`.** Every `Bun.spawn` call must strip `GIT_DIR`, `GIT_WORK_TREE`, and `GIT_INDEX_FILE` from the environment. Without this, git subprocesses spawned during pre-commit hooks inherit these variables and operate on the hook's repository instead of the intended one. This was the root cause of the data loss in the first Phase 5 attempt. The `cleanGitEnv()` function creates a copy of `process.env` with these three keys deleted and passes it as `env` to `Bun.spawn`.

Key implementation details from the plan:
- `createBranch`: `git branch <name> <base>` (no checkout)
- `createWorktree`: `git worktree add <path> <branch>` (branch must exist)
- `removeWorktree`: `git worktree remove <path> --force`
- `configureSparseCheckout`: `git -C <path> sparse-checkout init --cone` then `git -C <path> sparse-checkout set <paths>`
- `squashMerge`: `git merge --squash <branch>` then `git commit -m <msg>` in target worktree
- `commitAll`: `git add -A && git commit -m <msg>`, returns false if nothing to commit (`git status --porcelain` is empty)
- `rebase`: `git rebase <ontoRef>`, aborts and throws on conflict
- `initClaudeBranch`: `git branch claude` from HEAD, no-op if exists

## Validation

**CRITICAL: Test isolation.** Tests use real temporary git repos created via `git init` in `/tmp/` (via `fs.mkdtemp`). ALL test repos, worktrees, and branches must live entirely in `/tmp/`, completely outside the project worktree. This is the exact scenario that caused the data loss: the first Phase 5 attempt created test worktrees inside the project directory, and when the pre-commit hook ran, `GIT_DIR` leaked from the hook into the test's git subprocesses, corrupting the real worktree's config and HEAD. The test helper `git()` function must use `cleanGitEnv()` (same as production `runGit()`) to strip `GIT_DIR`, `GIT_WORK_TREE`, and `GIT_INDEX_FILE` before every subprocess call. Verify this by adding a test that explicitly sets `GIT_DIR` to a fake path and confirms operations still target the temp repo.

This is the one place where real git operations are tested. All other tasks mock `GitOps`.

Test cases:
- `createBranch`: branch visible in `git branch --list`
- `branchExists`: true for existing, false for missing
- `deleteBranch`: branch removed
- `createWorktree`: directory created, on correct branch
- `removeWorktree`: directory removed, worktree unlisted
- `configureSparseCheckout`: only specified paths checked out
- `commitAll`: commits changes, returns true; returns false when clean
- `squashMerge`: produces single commit on target branch with all source changes
- `squashMerge` conflict: throws with clear error
- `hasUncommittedChanges`: true with changes, false when clean
- `rebase`: branch moved to new base
- `rebase` conflict: aborts and throws
- `initClaudeBranch`: creates branch, no-op when exists
- `runGit` error handling: non-zero exit throws with stderr
- `cleanGitEnv`: with `GIT_DIR` set, operations still target the intended repo (not the hook's repo)

Run `bun test tests/daemon/lib/git.test.ts` and verify all pass.

## Why

From `.lore/specs/guild-hall-system.md`:
- REQ-SYS-22: Three-tier branch strategy (master/claude/activity) requires branch creation, worktree management, and squash-merge operations.
- REQ-SYS-29: Worktree checkout scope requires sparse-checkout configuration.

This is the foundation for all subsequent git integration work. Every other task mocks this interface.

From `.lore/retros/phase-5-git-integration-data-loss.md`: "Git subprocesses spawned during hooks inherit GIT_DIR, GIT_WORK_TREE, and GIT_INDEX_FILE. Any code that shells out to git must strip these variables."

From `.lore/retros/phase-4-commissions.md`: "Bun.spawn with stdout: 'pipe' allocates a pipe but doesn't capture output. You must actively read from proc.stdout."

## Files

- `daemon/lib/git.ts` (create)
- `tests/daemon/lib/git.test.ts` (create)
