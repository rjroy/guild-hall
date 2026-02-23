---
title: "git checkout -- . destroyed uncommitted work during index recovery"
date: 2026-02-22
status: complete
tags: [git, data-loss, recovery, worktrees, pre-commit-hooks, process, debugging]
modules: [guild-hall-core, daemon-lib-git]
related:
  - .lore/plans/phase-5-git-integration.md
  - .lore/notes/phase-5-git-integration.md
---

# Retro: Phase 5 Git Integration - Data Loss During Commit Recovery

## Summary

Phase 5 (Git Integration) was fully implemented across 10 phases: GitOps library, path helpers, project registration, commission dispatch/exit/redispatch, meeting session git lifecycle, Next.js read path migration, claude branch maintenance, and spec validation. 1124 tests passed. All 22 spec requirements validated. Then, while attempting to commit, a cascading series of git worktree corruption and recovery attempts culminated in running `git checkout -- .`, which restored all tracked files from HEAD and destroyed all Phase 5 modifications to existing files. A full day's work on ~20 modified files was lost. New (untracked) files survived.

## What Happened

### The git test isolation bug

The `configureSparseCheckout` test in `tests/daemon/lib/git.test.ts` creates a temporary git repo in `/tmp/`, creates a worktree inside it, and runs `git sparse-checkout init --cone`. When this test runs via the pre-commit hook, git sets `GIT_DIR` as an environment variable pointing to the real worktree's git directory. The spawned git subprocesses inherit `GIT_DIR`, so `git sparse-checkout init --cone` modifies the real worktree's `config.worktree` instead of the temp repo's. This also changed HEAD from `refs/heads/feat/phase-5-gvo8v` to `refs/heads/master`.

This was correctly diagnosed and correctly fixed: strip `GIT_DIR`, `GIT_WORK_TREE`, and `GIT_INDEX_FILE` from the environment in both `runGit()` (production) and the test helper `git()`. The fix was verified to work, even with `GIT_DIR` explicitly set.

### The cascading recovery disaster

The commit process failed multiple times due to the test corruption. Each recovery attempt made the situation worse:

1. **First corruption**: Pre-commit hook ran tests, which corrupted `config.worktree` (added `sparseCheckout = true`) and changed HEAD to master. The "Direct commits to master" hook rejected the commit.

2. **Branch ref corruption**: `git update-ref` fixed HEAD, but subsequent test runs (via the hook) re-corrupted it. The branch ref `feat/phase-5-gvo8v` was overwritten to point to a test commit (`03290d2`, "add conflict file") instead of the Phase 4 commit (`7ecc341`).

3. **Index corruption**: After fixing the branch ref, the index was out of sync. `git status` showed hundreds of files as "deleted" because the index didn't match HEAD.

4. **The fatal command**: To rebuild the index, I ran `git read-tree HEAD && git checkout -- .`. The `git checkout -- .` restored all tracked files from HEAD (the Phase 4 commit), overwriting all Phase 5 modifications to existing files. The working tree was now Phase 4 + untracked new files.

5. **No recovery path**: No stash, no reflog entry with the changes, no staged snapshot. The modifications existed only in the working tree, and `git checkout -- .` destroyed them.

### What survived

- All new files (untracked): `daemon/lib/git.ts`, `cli/rebase.ts`, `tests/daemon/lib/git.test.ts`, `tests/cli/rebase.test.ts`, `tests/daemon/app.test.ts`, `tests/daemon/rebase.test.ts`, `.lore/plans/phase-5-git-integration.md`, `.lore/notes/phase-5-git-integration.md`
- The fix for the git isolation bug (already applied to the surviving files)
- The plan, notes, and this retro

### What was lost

Modifications to ~20 existing files spanning all 10 implementation phases:
- `lib/paths.ts` (6 new path helpers)
- `daemon/app.ts` (git startup wiring, worktree verification, rebase)
- `daemon/services/commission-session.ts` (full git lifecycle: dispatch, exit, redispatch)
- `daemon/services/meeting-session.ts` (full git lifecycle: create, close, decline)
- `daemon/services/meeting-toolbox.ts` (propose_followup writes to integration worktree)
- `daemon/services/toolbox-resolver.ts` (git-aware path resolution)
- `cli/index.ts` (rebase subcommand)
- `cli/register.ts` (claude branch init, integration worktree creation)
- `CLAUDE.md` (Phase 5 documentation)
- `app/page.tsx`, `app/projects/[name]/page.tsx`, and 4 other page files (integration worktree reads)
- `app/api/artifacts/route.ts` (write to integration worktree, auto-commit)
- 7 test files (updated for git DI injection)

## What Went Well

- **Root cause diagnosis was correct.** The `GIT_DIR` inheritance from pre-commit hooks is a real and subtle bug. The fix (`cleanGitEnv()`) is the right solution and was verified to work under simulated hook conditions.
- **The plan and notes survived.** Because they were new files, they provide a complete record of what was built and how. Re-implementation can follow the same plan.
- **Sub-agent reviews caught real bugs during implementation.** The silent-failure-hunter found dispatch rollback gaps, cancel/exit race conditions, and stale worktree blocking. The code-reviewer found the generateMeetingNotes wrong-path bug. These findings are preserved in the notes and will inform the re-implementation.

## What Could Improve

- **Never run `git checkout -- .` with uncommitted work.** This is the direct cause of data loss. The intent was to "rebuild the working tree from HEAD" but the effect was "destroy all modifications." There is no undo.

- **Stash before any recovery operation.** Before touching the index, branch refs, or working tree during recovery, the first action should always be `git stash` to preserve the current working state. Even if the stash is messy, it's recoverable. A destroyed working tree is not.

- **Commit early, even with `--no-verify`.** The changes were complete and tested. The pre-commit hook was the only obstacle. Using `git commit --no-verify` would have preserved the work. The hook issue could have been fixed in a follow-up commit. Perfectionism about clean commits destroyed the work those commits were supposed to preserve.

- **Stop escalating recovery attempts.** Each recovery step made things worse. After the second failure, the right move was to step back and think about the full recovery sequence before executing any commands. Instead, each fix addressed the immediate symptom and created a new problem.

- **Test isolation should have been caught in Phase 1.** The git test file was written and tested in Phase 1. Running it via a pre-commit hook (the actual production scenario) would have revealed the `GIT_DIR` leak immediately. The tests passed in isolation but failed in the hook context. This is the same "tests pass but system doesn't work" lesson from Phase 4.

## Lessons Learned

1. **Never run `git checkout -- .` or `git checkout -- <file>` when you have uncommitted modifications you need.** It overwrites the working tree from the index/HEAD with no recovery path. If you need to fix the index, use `git read-tree` alone (fixes the index without touching the working tree).

2. **Before any git recovery operation, run `git stash` first.** Stash preserves working tree and index state. Even a corrupted stash is better than destroyed files. The recovery sequence is: stash, fix, stash pop.

3. **Git subprocesses spawned during hooks inherit `GIT_DIR`, `GIT_WORK_TREE`, and `GIT_INDEX_FILE`.** Any code that shells out to git must strip these variables, or operations will target the hook's repository instead of the intended one. This applies to test helpers, CI scripts, and production code that calls git.

4. **Stop after two failed recovery attempts.** If the second recovery attempt creates a new problem, the situation is escalating. Stop, map out the full state (what's in HEAD, what's in the index, what's in the working tree, what's in the stash), plan the complete recovery sequence, then execute it. Reactive fixes compound.

6. **When implementing features that interact with git internals, test under the hook execution context, not just in isolation.** Pre-commit hooks set environment variables that change how git behaves. A test that passes in a normal shell may fail (or cause damage) when run from a hook.

## Artifacts

- `.lore/plans/phase-5-git-integration.md` - implementation plan (survived)
- `.lore/notes/phase-5-git-integration.md` - implementation notes (survived)
- `daemon/lib/git.ts` - GitOps library with cleanGitEnv fix (survived)
- `tests/daemon/lib/git.test.ts` - Git tests with cleanGitEnv fix (survived)
