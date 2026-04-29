---
title: Git Operations and Branch Strategy
date: 2026-04-27
status: current
tags: [git, branches, sync, worktrees, project-lock, squash-merge]
modules: [daemon-lib, git-admin]
---

# Git Operations and Branch Strategy

## Branch tiers

Three tiers, from outside-in:

- **Default branch** (`main`/`master`): the project's upstream branch. Guild Hall never writes here directly; PRs target it.
- **Integration branch** (`claude/main`): Guild Hall's working branch. AI-produced artifacts land here. The integration worktree is a persistent checkout of this branch under `~/.guild-hall/projects/<name>/`.
- **Activity branches** (`claude/commission/<id>`, `claude/meeting/<id>`): short-lived, forked from `claude/main`. Each gets its own worktree with sparse checkout (`.lore/` only). On completion, work is squash-merged back to `claude/main`.

The integration branch is named `claude/main`, not `claude`, because git refs are filesystem paths. A ref at `refs/heads/claude` exists as a file, which prevents creation of `refs/heads/claude/meeting/<id>` as a directory. The `/main` suffix is purely there to keep the namespace open below it.

## Every git subprocess strips inherited git env

`cleanGitEnv()` deletes `GIT_DIR`, `GIT_WORK_TREE`, and `GIT_INDEX_FILE` from `process.env` before spawning. Pre-commit hooks (this project's included) set these variables; any subprocess that inherits them targets the hook's repo, not the intended one. This caused data loss in Phase 5. The same stripping applies to non-git commands (`gh` for PR creation) — anything spawned from inside a hook context.

`runGit` and `runCmd` both consume stdout and stderr via `Response.text()` in `Promise.all` before awaiting `proc.exited`. Without the buffer drain, large output fills the pipe and deadlocks the subprocess (Phase 4). This is invisible at small output sizes; the deadlock surfaces only on long diffs or large clones.

## Internal commits use `--no-verify`

`commitAll`, `squashMerge`, and `commitLore` all pass `--no-verify`. Activity worktrees use sparse checkout (`.lore/` only); project pre-commit hooks (linters, tests, type checks) fail because the working tree is incomplete. These are internal Guild Hall commits — they round-trip through the integration branch and then through a real PR with full hooks before reaching `master`. Skipping verification on internal commits is correct, not a workaround.

`commitLore` is `.lore/`-scoped: `git add -- .lore/`, not `-A`. It exists separately from `commitAll` so callers can land lore-only changes from the web UI without touching anything outside the lore directory.

## Failed git operations clean up after themselves

`rebase`, `rebaseOnto`, and `merge` all wrap the underlying op. On failure they attempt the matching `--abort` (silently swallowing abort failures, since abort itself can fail when no rebase/merge was actually in progress) and then re-throw with context. The contract is: after a thrown rebase or merge, the worktree is clean. Callers don't need to add `try { abort } catch` themselves.

## `commitAll` returns boolean

`commitAll` checks `git status --porcelain` and returns `false` if there's nothing to commit. The caller decides whether "nothing changed" matters. This is why the orchestrators don't crash on a no-op turn.

## `detectDefaultBranch` is fall-through, not strict

Three sources, in order: remote HEAD (`symbolic-ref refs/remotes/origin/HEAD`), then `main` or `master` if either exists locally, then current HEAD. The function never throws — a brand-new repo on a custom branch still gets *something* back. Callers should not treat the result as authoritative for repos without a remote.

## `finalizeActivity` is the squash-merge protocol

The shared close-out path for commissions and meetings:

1. Commit any remaining work in the activity worktree (`commitAll`, no-op if clean).
2. Take the project lock.
3. Pre-merge sync the integration worktree (`commitAll` with a "Pre-merge sync" message, captures any out-of-band changes the user made).
4. Squash-merge the activity branch into integration via `resolveSquashMerge`.
5. On success: remove the worktree, delete the activity branch.
6. On failure (`merged: false`): remove the worktree but **preserve the branch** for manual resolution.

Caller-specific concerns — events, status transitions, escalation, state files — are NOT in `finalizeActivity`. Callers inspect the `{merged, preserved}` result and do their own post-processing. The function is deliberately mechanical so that commission and meeting orchestrators can share the git path without coupling lifecycle.

## `resolveSquashMerge` auto-resolves only `.lore/` conflicts

Try clean squash. On success, commit and return. On conflict:

- List conflicted files.
- Any non-`.lore/` path → abort merge, return false. The activity branch is preserved.
- All conflicts under `.lore/` → `checkout --theirs` for each, stage, commit. Return true.

The "theirs" semantics are non-obvious. `git merge --squash <activity-branch>` runs in the integration worktree, which makes integration "ours" and activity "theirs". So `--theirs` here picks the activity branch's version. Activity-branch lore wins on collisions, by design — the integration branch is a coordination point, the activity branch is where work actually happens.

## `syncProject` decision tree (under per-project lock)

1. Fetch from origin. If fetch fails (no remote, offline) → local rebase only.
2. If active activities (`hasActiveActivities`) → skip.
3. Detect target branch (config, fallback to `detectDefaultBranch`).
4. Compare ancestry between `claude/main` and `origin/<target>`:

   - **`claude` ancestor of remote, same tip** → noop (already current).
   - **`claude` ancestor of remote, different tip** (master advanced):
     - PR marker matches `claude` tip → `reset --hard` to remote, remove marker.
     - Trees equal but no marker → `reset --hard`, remove any marker. (Daemon was down during `create_pr`, or user pushed matching content.)
     - Otherwise → `rebase` onto remote. (User pushed independent changes.)
   - **Remote ancestor of `claude`** → noop (PR not yet merged).
   - **Diverged** (typical post-squash-merge state):
     - Marker tip matches current `claude` tip → `reset --hard`, remove marker.
     - Marker tip differs (e.g. meeting closed after PR was created) → `rebase --onto remote <marker-tip>` (replay only post-PR commits).
     - No marker, trees equal → `reset --hard`, remove any marker.
     - Else → **merge-and-compact**: `merge remote`, `reset --soft remote`, `commitAll`. The result is a single linear commit on top of remote containing all of `claude/main`'s unique work. Plain rebase would try to replay already-squash-merged commits and conflict; the merge resolves content correctly, and the soft-reset/recommit keeps `claude/main` linear and minimal.

The merge-and-compact path is the load-bearing fallback: it's how Guild Hall recovers from the divergence that squash-merge naturally creates without requiring user intervention. If even merge fails, the function throws and the user must resolve manually.

## PR markers are the link between `create_pr` and `syncProject`

`create_pr` (manager toolbox) writes `~/.guild-hall/state/pr-pending/<projectName>.json` with `claudeMainTip` set to the SHA at PR creation. `syncProject` reads it to recognize "this remote tip is the result of a PR we created" and pick reset over rebase.

`readPrMarker` returns `null` on any error (missing file, parse failure). `removePrMarker` swallows ENOENT — the marker is best-effort metadata, not a source of truth.

## `hasActiveActivities` scans state files

Reads `~/.guild-hall/state/commissions/*.json` (active iff status is `dispatched` or `in_progress`) and `~/.guild-hall/state/meetings/*.json` (active iff status is `open` AND scope ≠ `project`). The `scope !== "project"` exclusion lets project-scope meetings (briefing context, manager check-ins) coexist with sync — they don't hold worktrees the sync would clobber.

This lives outside the orchestrators because both the CLI and the daemon need it without pulling the orchestrator graph in.

## `withProjectLock` is in-process and error-resilient

A `Map<projectName, Promise<void>>` chain. Each call appends to the per-project promise; different projects run concurrently. The chain stores `next.catch(() => {})` so a rejection in one operation does not block subsequent queued ones — the original promise is returned to the caller (so they see the rejection) but the stored chain link always resolves to void.

Coordination is in-process only. The PID file guard prevents two daemons from running against the same `GUILD_HALL_HOME`, so cross-process locking is unnecessary. Tests use `clearProjectLocks()` for cleanup.
