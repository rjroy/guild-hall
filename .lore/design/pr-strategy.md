---
title: "PR Creation and Post-Merge Sync Strategy"
date: 2026-02-23
status: implemented
tags: [design, git, pr, squash-merge, branch-recovery]
modules: [daemon-lib-git, cli]
related:
  - .lore/brainstorm/squash-merge-branch-recovery.md
  - .lore/specs/guild-hall-system.md
  - .lore/retros/phase-5-git-integration-data-loss.md
---

# PR Creation and Post-Merge Sync Strategy

## Problem

Guild Hall's three-tier branch strategy produces squash-merges at two boundaries:

```
activity branches  --squash-->  claude/main  --squash (PR)-->  master
```

After a PR from `claude/main` is squash-merged into `master`, the two branches share content but not history. Git sees them as diverged. Rebasing `claude/main` onto `master` (per REQ-SYS-24) replays commits that already exist in `master`, producing conflicts or noise. Activity branches rooted on the old `claude/main` become orphaned.

The brainstorm (`.lore/brainstorm/squash-merge-branch-recovery.md`) analyzed six options. This document selects a strategy, validates the git mechanics, and specifies the implementation.

## Decision: Reset After Merge, Block During Active Work

The selected strategy combines elements of Option A (prevent while active) and a variant of Option E (reset to match master) from the brainstorm. It does not use Option C (merge instead of rebase), despite the brainstorm's initial lean toward it.

### Why Not Option C (Merge Instead of Rebase)

Option C replaces the rebase in REQ-SYS-24 with `git merge master` into `claude/main`. This preserves activity branch merge bases, but it creates a deeper problem: `claude/main` accumulates merge commits alongside the squash-merged activity commits, and the divergence between `claude/main` and `master` grows with every PR cycle. The tree content is the same after a merge, but git's commit graph gets progressively more complex. PR diffs against `master` start showing commits from previous PR cycles because the merge base calculation includes all the accumulated merge history. Within two or three PR cycles, the PR diff becomes noisy, and the hosting platform's merge behavior becomes unpredictable.

The brainstorm's counter-argument was "PRs are squash-merged, so noise doesn't reach master." True, but the PR creation experience degrades: the diff the user reviews on GitHub contains commits they already approved. That's confusing and undermines the review step that REQ-WKR-28 relies on (the user must be able to meaningfully review PRs).

### Why Reset

After a squash-merge, `claude/main` and `master` have identical tree content but different commit histories. The cleanest reconciliation is to make `claude/main` point at `master`'s HEAD. This is what `git reset --hard origin/<default-branch>` does inside the integration worktree. One command, no conflicts, no accumulated noise. The history of `claude/main` is disposable because all meaningful history lives in `master` (via the squash-merged PR commits) and in the `.lore/` artifacts (decisions, notes, timelines).

The cost is that any work on `claude/main` that wasn't included in the PR is lost. This is acceptable because:

1. The manager creates PRs, and the `create_pr` tool can ensure `claude/main` is fully represented in the PR.
2. The pre-PR safety check prevents creating a PR while activities are in flight, so no un-merged activity work should exist on `claude/main` at PR time.
3. If the user merges a partial PR (excluding some commits), those commits are the user's responsibility. Guild Hall warns, not prevents.

### Why Block During Active Work

Activity branches fork from `claude/main`. After a reset, those branches' merge base with the new `claude/main` is wrong. Squash-merging them back would produce conflicts or duplicate changes.

Options B (rebase activities onto new claude/main) and E (snapshot/replay) from the brainstorm could recover, but both are complex and fragile. Rebase conflicts are unattended (the activity's worker process can't resolve them). Snapshot/replay requires stopping workers, destroying their SDK sessions, and restarting, which loses conversational context that may not be recoverable.

The simplest solution: don't create the problem. Block PR creation while any commission is dispatched/in_progress or any meeting is open for that project. The manager's `create_pr` tool checks `hasActiveActivities()` and refuses to proceed, returning an error that explains what's blocking. The user can cancel stale activities or wait for them to complete.

This is Option A from the brainstorm. The brainstorm's concern was "long-running commissions or idle meetings could block PRs indefinitely." This is real but manageable: the manager can surface this in its briefing ("PR blocked by 2 active commissions, consider cancelling stale work"), and the user always has the option to cancel activities manually.

## Mechanism 1: Post-Merge Sync

After the user merges a PR on their hosting platform, `claude/main` must be reconciled with `master`. The daemon handles this automatically.

### Detection

The daemon detects a merged PR by comparing commit ancestry, not by querying the hosting platform. This avoids a dependency on `gh` for read operations and works with any git hosting.

On daemon startup (and optionally on a periodic check or user-triggered CLI command):

```
git fetch origin
```

Then compare:

```
git merge-base --is-ancestor claude/main origin/<default-branch>
```

If `claude/main` is an ancestor of `origin/<default-branch>`, master has moved ahead (either the user pushed changes or a PR was merged). In either case, `claude/main` needs to catch up.

But we also need to distinguish "user pushed independent changes" from "our PR was merged." The difference matters because:

- User pushed independent changes: rebase `claude/main` onto `master` (existing behavior, REQ-SYS-24). The commits on `claude/main` are new work that master doesn't have.
- Our PR was merged: reset `claude/main` to `master`. The commits on `claude/main` are already in master via the squash.

Detection heuristic: after fetching, compare the tree (content) of `claude/main` with the tree of `origin/<default-branch>`:

```
git diff --quiet claude/main origin/<default-branch> -- .lore/
```

If the `.lore/` directories are identical (or nearly so, modulo timestamps), this is a post-PR-merge state: the squash commit on master contains the same content as `claude/main`. Reset is safe.

If there are meaningful differences in `.lore/`, `claude/main` has work that master doesn't. Use rebase (existing behavior).

This heuristic isn't perfect. Edge case: the user pushes changes to `.lore/` on master independently. But this violates REQ-SYS-25 (workers never touch master, users interact through PRs), so it's outside the designed workflow.

A more robust approach: record the `claude/main` commit that was used to create the PR. Store it in a marker file (e.g., `~/.guild-hall/state/pr-pending/<project>.json` with `{ claudeMainTip: "<sha>", prUrl: "<url>", createdAt: "<timestamp>" }`). After fetch, if `claude/main` still points at that SHA and `origin/<default-branch>` is ahead, the PR was merged. Reset. If `claude/main` has moved (new activity was merged in), something changed since the PR was created, and the daemon should warn rather than auto-reset.

### Sync Procedure

When the daemon determines a reset is needed:

1. Verify no active activities: `hasActiveActivities(ghHome, projectName)`. If any are active, log a warning and skip. The user must resolve active work before sync can proceed.

2. Fetch from remote:
   ```
   git fetch origin
   ```

3. Reset `claude/main` in the integration worktree:
   ```
   git reset --hard origin/<default-branch>
   ```
   This is safe because:
   - The integration worktree is at `~/.guild-hall/projects/<name>/`, owned by Guild Hall.
   - No user files live here. The worktree is a Guild Hall-managed checkout.
   - `git reset --hard` in a worktree updates that worktree's HEAD and working tree without affecting the main repo's HEAD or other worktrees.

4. Clean up the PR marker file if it exists.

5. Log the sync: `[sync] Reset claude/main to origin/<default-branch> for "<project>" after PR merge`.

### Git Mechanics Validation

`git reset --hard` in a worktree: Git worktrees share the same `.git` directory (via the `.git` file pointing to the main repo's `.git/worktrees/<name>/`). Running `git reset --hard <ref>` in a worktree updates that worktree's HEAD ref and checks out the ref's tree into the worktree's working directory. It does not affect the main repo's working tree or other worktrees. This is well-defined behavior and the correct primitive for this operation.

The integration worktree's branch is `claude/main`. After `git reset --hard origin/master`, `claude/main` points at the same commit as `origin/master`. The worktree's working directory matches. The branch ref update is visible to all worktrees sharing the repo (activity worktrees), but since we've verified no activities are active, no worktree is on `claude/main` except the integration worktree itself.

One subtlety: `git reset --hard origin/<default-branch>` moves the branch ref, not just HEAD. Since the integration worktree is checked out on `claude/main`, this moves `claude/main` to point at `origin/<default-branch>`'s commit. This is the desired outcome. If we needed to move the ref without checking out, `git update-ref refs/heads/claude/main origin/<default-branch>` would work, but `reset --hard` is better here because it also updates the working tree.

## Mechanism 2: Merge Strategy Compatibility

Guild Hall must work regardless of how the hosting platform merges the PR.

### Squash Merge

The primary case. GitHub's "Squash and merge" creates a single commit on `master` with the combined diff. `claude/main` and `master` share tree content but not commit ancestry. Reset handles this correctly.

### Rebase Merge

GitHub's "Rebase and merge" replays each commit from the PR branch onto `master` with new SHAs. The result is the same tree content on both branches, but `claude/main`'s commits have different SHAs than `master`'s replayed commits. Same problem as squash, same solution: reset.

### Merge Commit

GitHub's "Create a merge commit" adds a merge commit on `master` that joins the histories. In this case, `claude/main` is an ancestor of the merge commit on `master`. Technically, `git rebase` would work here (it would be a no-op since all commits are already reachable). But reset also works and is simpler to reason about. One strategy for all cases.

### Force Push / Amended PR

If the user force-pushes to `master` or amends the PR, the relationship between `claude/main` and `master` becomes unpredictable. Guild Hall doesn't attempt to handle this. The daemon logs a warning if it can't determine the relationship, and the user can run `guild-hall rebase` or manually resolve.

### Summary

Reset-after-merge works for all three standard merge strategies. Guild Hall doesn't need to detect which strategy was used.

## Mechanism 3: Active Activities During PR Merge

### Prevention (Primary)

The `create_pr` tool checks `hasActiveActivities()` before proceeding. If activities are active, the tool returns an error:

```
Cannot create PR: 2 active commissions and 1 open meeting on this project.
Active commissions: commission-Researcher-20260223-140000 (in_progress),
  commission-Implementer-20260223-141500 (dispatched)
Open meetings: meeting-20260223-143000 (Guild Master)
Complete or cancel these activities before creating a PR.
```

The manager sees this error and can present it to the user, suggest cancelling stale work, or wait.

### What If the User Merges Manually

The manager creates the PR, but the user merges it on their hosting platform. Guild Hall can't prevent the user from merging while activities are running. If this happens:

1. The daemon detects the merge on next startup (or periodic check).
2. It finds active activities and skips the sync, logging a warning:
   ```
   [sync] PR appears merged for "<project>" but 2 active activities exist.
   Cannot auto-sync claude/main. Resolve activities first, then run:
     guild-hall sync <project>
   ```
3. Active activities continue running in their activity worktrees. Their worktrees are on activity branches (`claude/commission/<id>`), not on `claude/main`, so the pending reset doesn't affect their working directories.
4. When the activities complete, they attempt to squash-merge back to `claude/main`. This will likely fail because `claude/main` has diverged (the PR was merged, changing master, but `claude/main` hasn't been reset yet). The squash-merge failure is caught and logged. The activity's result is preserved in its worktree and artifact, but the merge to `claude/main` is deferred.
5. Once all activities are resolved (completed, failed, or cancelled), the user runs `guild-hall sync <project>` (or restarts the daemon). The sync resets `claude/main`, and any deferred merges can be re-attempted manually.

This is the messy case, and it requires user intervention. The design accepts this: Guild Hall warns before PR creation, and if the user overrides the warning by merging manually, they accept the cleanup responsibility.

### Activity Branch Preservation

Activity branches are not deleted by the sync. `git reset --hard` on `claude/main` moves the branch ref but does not delete other branches. Activity branches (`claude/commission/<id>`, `claude/meeting/<id>`) remain intact with their original commits. After `claude/main` is reset, these branches' merge base with `claude/main` is wrong, but the work is preserved. Recovery options:

- **Completed activities**: Their work is already on `claude/main` (via earlier squash-merge). After reset, it's also on `master` (via the PR). The activity branch can be safely deleted.
- **Failed/cancelled activities**: Their branches are preserved for inspection (existing behavior). After reset, the user or manager can review the branch and decide whether to re-apply the work.
- **Orphaned active activities**: Their activity worktrees still function (checked out on the activity branch). The worker can complete its work. The squash-merge-back step will need special handling (see above).

**Race condition acknowledgment:** A completed commission's squash-merge to `claude/main` is part of the commission close lifecycle and runs before the commission is marked as no longer active. The `hasActiveActivities()` guard blocks PR creation while any commission is in `dispatched` or `in_progress` state. Since the squash-merge happens during the transition from `in_progress` to `completed`, the guard ensures all squash-merges complete before PR creation can proceed. The reset therefore only runs after all completed commission work is on `claude/main`.

## Mechanism 4: Edge Cases

### Daemon Down During PR Merge

The user merges a PR while the daemon is stopped. On next startup:

1. Daemon runs the startup sequence: verify worktrees, then sync/rebase.
2. The sync step fetches from origin, detects `master` is ahead.
3. If no activities are active, resets `claude/main`. Clean recovery.
4. If activities are active (their state files persist across daemon restarts), logs a warning and skips.

No special handling needed. The startup sequence already runs sync before any new work begins.

### Multiple PRs Merged in Sequence

The user creates PR #1, merges it, then creates PR #2 from new `claude/main` work, merges it, all while the daemon is down. On startup:

1. Fetch brings in all remote changes.
2. `origin/<default-branch>` points at the tip after both PRs.
3. `claude/main` points at wherever it was when the last PR was created.
4. Reset `claude/main` to `origin/<default-branch>`. Handles any number of merged PRs in one step.

This works because reset doesn't care about intermediate states. It sets `claude/main` to match the current remote tip.

### Concurrent Activity Completion During Sync

A commission completes (squash-merges to `claude/main`) at the same moment the daemon is running the sync procedure. This is a race condition.

Mitigation: the sync procedure holds a per-project lock. The squash-merge step in commission exit also acquires this lock. Only one operation modifies `claude/main` at a time. In practice, the daemon is single-threaded for git operations on a given project (commission exits are processed sequentially by the event loop), so this is coordination within the daemon, not between processes.

The lock can be a simple in-memory mutex per project name, held during the sync procedure and during the squash-merge step of activity completion.

### Remote Not Named "origin"

The `GitOps.detectDefaultBranch()` method already checks `refs/remotes/origin/HEAD`. If the remote isn't named `origin`, this fails and falls back to checking for `main`/`master` branches locally.

For the sync/fetch operations, the remote name matters. The design assumes `origin`. This is documented as a workflow assumption (see below). If a project uses a different remote name, the user can configure it. This requires a new optional field in the project config:

```yaml
projects:
  - name: my-project
    path: /path/to/repo
    defaultBranch: main
    remote: upstream  # optional, defaults to "origin"
```

Implementation can defer the config field to when a user actually needs it. For now, hardcode `origin` and document the assumption.

### No Remote Configured

Purely local repos (no `git remote`). `git fetch origin` fails. The sync step catches the error and falls back to the existing rebase behavior (rebase `claude/main` onto the local default branch). This maintains backward compatibility with local-only workflows where PRs aren't part of the process.

### PR Created but Not Yet Merged

The manager creates a PR (pushes `claude/main`, calls `gh pr create`). The PR sits open. New activity completes and squash-merges to `claude/main`. The PR on GitHub now shows additional commits. This is correct behavior: the PR is a living view of `claude/main` vs `master`. When the user merges, all accumulated work is included.

## Workflow Assumptions

These are explicit assumptions Guild Hall makes about the user's git workflow. Violating them doesn't crash the system, but the experience degrades.

1. **Remote is named `origin`.** Guild Hall fetches from and pushes to `origin`. Projects with different remote names will need manual intervention until a `remote` config field is added.

2. **`gh` CLI is installed and authenticated.** The `create_pr` tool shells out to `gh pr create`. If `gh` is missing, the tool returns a clear error asking the user to install it. Guild Hall does not make GitHub API calls directly; `gh` handles authentication and API interaction.

3. **One default branch per project.** Detected automatically (via `detectDefaultBranch`) or configured in `config.yaml`. Guild Hall does not support workflows with multiple protected branches (e.g., `main` + `release/*`).

4. **Users merge PRs on their hosting platform.** Guild Hall creates the PR; the user reviews and merges. Guild Hall never merges its own PRs. This is by design (REQ-WKR-28: actions affecting the protected branch require user action).

5. **Workers don't modify master.** REQ-SYS-25. The three-tier strategy depends on `master` being modified only by the user (directly or via PR merge).

6. **Activity-to-claude/main squash-merges happen before PR creation.** All completed activity work should be on `claude/main` before the manager creates a PR. The `create_pr` tool enforces this by checking for active activities.

7. **Internet connectivity for remote operations.** `git fetch`, `git push`, and `gh pr create` require network access. The daemon degrades gracefully when offline (skips fetch, sync falls back to local rebase).

## Implementation Notes for Step 10

### New GitOps Methods

```typescript
interface GitOps {
  // Existing methods unchanged...

  /** Fetch from a remote. Defaults to "origin". */
  fetch(repoPath: string, remote?: string): Promise<void>;

  /** Push a branch to a remote. Defaults to "origin". */
  push(repoPath: string, branchName: string, remote?: string): Promise<void>;

  /** Hard-reset the current branch in a worktree to a ref. */
  resetHard(worktreePath: string, ref: string): Promise<void>;

  /** Create a PR using gh CLI. Returns the PR URL. */
  createPullRequest(
    repoPath: string,
    baseBranch: string,
    headBranch: string,
    title: string,
    body: string,
  ): Promise<{ url: string; number: number }>;

  /** Compare two refs. Returns true if refA is an ancestor of refB. */
  isAncestor(repoPath: string, refA: string, refB: string): Promise<boolean>;

  /** Check if two refs have identical tree content. */
  treesEqual(repoPath: string, refA: string, refB: string): Promise<boolean>;
}
```

### create_pr Tool Flow

```
1. hasActiveActivities(ghHome, projectName) -> if true, return error
2. gitOps.fetch(repoPath, "origin")
3. gitOps.push(repoPath, CLAUDE_BRANCH, "origin")
4. gitOps.createPullRequest(repoPath, defaultBranch, CLAUDE_BRANCH, title, body)
5. Write PR marker: ~/.guild-hall/state/pr-pending/<project>.json
6. Return { url, number }
```

### Daemon Startup Sync (replaces current rebase)

```
for each project:
  1. git.fetch(repoPath, "origin")  // may fail if no remote; catch and skip
  2. if hasActiveActivities: log warning, skip sync
  3. remoteRef = `origin/${defaultBranch}`
  4. if git.isAncestor(iPath, CLAUDE_BRANCH, remoteRef):
     // master is ahead of claude/main
     if pr-marker exists AND pr-marker.claudeMainTip == current CLAUDE_BRANCH commit:
       // Confirmed post-PR-merge: reset
       git.resetHard(iPath, remoteRef)
       clean up PR marker
       log "[sync] Reset claude/main after PR merge (via marker)"
     else if git.treesEqual(repoPath, CLAUDE_BRANCH, remoteRef):
       // Likely post-PR-merge but no marker (daemon was down during create_pr):
       // reset with a warning log that the marker was missing
       git.resetHard(iPath, remoteRef)
       log "[sync] Reset claude/main after PR merge (marker missing, detected via tree comparison)"
     else:
       // User pushed independent changes: rebase (existing behavior)
       git.rebase(iPath, defaultBranch)
       log "[sync] Rebased claude/main onto <branch>"
  5. else if git.isAncestor(iPath, remoteRef, CLAUDE_BRANCH):
     // claude/main is ahead: nothing to do, PR not yet merged
     log "[sync] claude/main is ahead of <branch>, no sync needed"
  6. else:
     // Diverged: neither is ancestor of the other. Shouldn't happen in normal workflow.
     log warning, skip
```

**Detection heuristic priority:** The PR marker is the primary discriminator because it's a deterministic signal that a PR was created through Guild Hall. Tree comparison is a heuristic that could false-positive if the user independently reverts changes to match the remote state. By checking the marker first with its commit SHA match, we confirm Guild Hall's own PR creation path. Only if the marker is missing do we fall back to tree comparison as a best-effort recovery mechanism (when the daemon was stopped during `create_pr`).

### CLI sync Command

Expose the sync logic as a CLI command alongside the existing `rebase` command:

```bash
bun run guild-hall sync [project-name]  # runs fetch + smart sync
bun run guild-hall rebase [project-name] # existing: just rebase, no fetch
```

The `sync` command is the recommended post-merge recovery tool. `rebase` remains for backward compatibility and for cases where the user knows they just want a rebase.

### Per-Project Mutex

A simple in-memory lock to prevent concurrent modifications to `claude/main`:

```typescript
const projectLocks = new Map<string, Promise<void>>();

async function withProjectLock<T>(
  projectName: string,
  fn: () => Promise<T>,
): Promise<T> {
  const current = projectLocks.get(projectName) ?? Promise.resolve();
  const next = current.then(() => fn());
  projectLocks.set(projectName, next.catch(() => {}));
  return next;
}
```

The mutex chain pattern ensures sequential execution: each operation waits for the previous one to complete before running. The `.catch(() => {})` on the stored promise prevents unhandled rejections from blocking subsequent operations, but `next` (the returned promise) preserves errors for the caller to handle.

Used in: sync procedure, squash-merge on activity close, and PR creation.

## Open Questions Resolved

From the brainstorm's open questions:

**Does the manager control PR timing, or can the user merge manually?** The manager creates PRs. The user merges on their platform. Guild Hall can't prevent manual merges but warns about active activities before PR creation. If the user merges while activities are running, they accept cleanup responsibility.

**Could we use `git replace` or `git grafts`?** No. These are obscure, poorly supported by hosting platforms, and don't survive clones or fetches. Reset is simpler and more robust.

**Is there a case where we need rebase semantics on claude/main?** Yes, when the user pushes changes to master that aren't from a Guild Hall PR. The startup sync detects this case and uses rebase instead of reset. Both code paths are needed.

**Does the activity-to-claude/main squash-merge have the same problem?** Partially. When activity A is squash-merged to `claude/main`, activity B's merge base with `claude/main` shifts. But B was forked from `claude/main` before A's merge, so B's merge base is still valid (it's the commit B forked from). The squash-merge of B will include only B's changes, not A's. This is correct behavior. The problem only surfaces when `claude/main` itself is reset (not just advanced by a squash-merge), which is the PR-merge case that this design addresses.
