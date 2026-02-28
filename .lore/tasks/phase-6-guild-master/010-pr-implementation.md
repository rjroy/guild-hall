---
title: Implement PR creation, push, and post-merge sync
date: 2026-02-23
status: complete
tags: [task]
source: .lore/plans/foundation/phase-6-guild-master.md
related: [.lore/specs/guild-hall-system.md, .lore/specs/guild-hall-workers.md]
sequence: 10
modules: [daemon-lib-git, daemon-services, cli]
---

# Task: Implement PR Creation, Push, and Post-Merge Sync

## What

Implement the PR creation mechanism based on the approved design from Task 9 (`.lore/design/pr-strategy.md`). Read the design document before implementing; the specifics below are the plan's anticipated direction and may be adjusted by the design.

**GitOps interface extension (daemon/lib/git.ts):**

Add four methods:
- `push(repoPath, branchName, remote?)`: `git push <remote> <branch>` with `cleanGitEnv()`.
- `createPullRequest(repoPath, baseBranch, headBranch, title, body)`: `gh pr create --base --head --title --body`. Returns `{ url }`. If `gh` is not available, return a clear error.
- `fetch(repoPath, remote?)`: `git fetch <remote>` with `cleanGitEnv()`.
- `resetHard(worktreePath, ref)`: `git reset --hard <ref>` in the worktree with `cleanGitEnv()`.

All git/gh subprocesses must use `cleanGitEnv()` (Phase 5 retro lesson).

**Manager toolbox update (daemon/services/manager-toolbox.ts):**

Replace the `create_pr` placeholder with the real handler:
1. Check for active commissions/meetings on the project (safety check per design).
2. Push `claude/main` to origin via `gitOps.push()`.
3. Call `gitOps.createPullRequest()`.
4. Return the PR URL.

**Post-merge sync (daemon startup or CLI):**

Based on the design document, add logic to detect and handle merged PRs:
1. `git fetch origin`
2. Compare `claude/main` tip with `origin/<default-branch>`.
3. If master is ahead and no activities are active, reset `claude/main` to master.
4. If activities are active, log a warning and skip.

This logic goes in daemon startup (via `createProductionApp`) and/or the `guild-hall rebase` CLI command, per the design.

**CLI update (cli/rebase.ts):**

Include the post-merge sync logic so users can manually trigger sync after merging a PR.

## Validation

- `push` calls `git push` with correct args and `cleanGitEnv()`
- `createPullRequest` calls `gh pr create` with correct args, returns URL
- `createPullRequest` when `gh` not installed: returns clear error message (not a crash)
- `create_pr` tool blocks when active activities exist (per design's safety check)
- `create_pr` tool succeeds when no activities are active
- `create_pr` tool pushes before creating PR
- Post-merge sync detects merged PR (master ahead of `claude/main`) and resets
- Post-merge sync skips when activities are active (logs warning)
- Post-merge sync is a no-op when `claude/main` is current with master
- All git subprocess calls use `cleanGitEnv()`
- CLI `rebase` command includes post-merge sync
- All tests pass, linting clean, commit created (triggers pre-commit hook validation)

## Why

From `.lore/specs/guild-hall-system.md`:
- REQ-SYS-23: "A pull request from `claude` to `master` is squash-merged, producing one commit per PR."

From `.lore/specs/guild-hall-workers.md`:
- REQ-WKR-25: "PR management: create pull requests from `claude` to `master` when work is ready for user review."

Retro lesson (phase-5-git-integration-data-loss.md): "Any code that shells out to git must call `cleanGitEnv()` to strip GIT_DIR, GIT_WORK_TREE, and GIT_INDEX_FILE."

## Files

- `daemon/lib/git.ts` (modify)
- `daemon/services/manager-toolbox.ts` (modify)
- `daemon/app.ts` (modify: post-merge sync at startup)
- `cli/rebase.ts` (modify)
- `tests/daemon/lib/git.test.ts` (modify)
- `tests/daemon/services/manager-toolbox.test.ts` (modify)
