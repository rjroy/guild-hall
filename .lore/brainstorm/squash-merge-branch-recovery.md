---
title: Squash-merge branch recovery
date: 2026-02-22
status: resolved
tags: [git, branching, squash-merge, lifecycle, meetings, commissions]
modules: [guild-hall-core]
related:
  - .lore/specs/guild-hall-system.md
  - .lore/design/process-architecture.md
  - .lore/plans/implementation-phases.md
---

# Brainstorm: Squash-Merge Branch Recovery

## Naming Constraint

The spec (REQ-SYS-22) names the integration branch `claude` and activity branches `claude/commission/<id>`, `claude/meeting/<id>`. This is a git ref conflict: git stores refs as filesystem paths, so a branch named `claude` creates a file at `.git/refs/heads/claude`, which prevents creating `.git/refs/heads/claude/commission/...` (can't be both a file and a directory). The integration branch must be `claude/main` to coexist with the `claude/` namespace. This needs to be captured as a spec amendment.

## Problem

The git strategy (REQ-SYS-22 through SYS-25) has three tiers with squash-merges at each boundary:

```
activity branches  --squash-->  claude/main  --squash (PR)-->  master
```

The integration branch is `claude/main` (not `claude`) because `claude` as a bare ref conflicts with the `claude/` namespace used by activity branches (`claude/commission/<id>`, `claude/meeting/<id>`). Git can't have both a ref `claude` and refs under `claude/`.

Squash-merge destroys the commit-level relationship between source and target. After `claude/main` is squash-merged into `master`, the branch histories have diverged: `master` has one new commit with the combined changes, `claude/main` still has all the original commits. Git doesn't know they represent the same work.

Rebasing `claude/main` onto `master` (REQ-SYS-24) after a squash-merge is the painful case. Git tries to replay every commit from `claude/main` on top of `master`, which already contains those changes. Conflicts on every commit, or at minimum a wall of "already applied" noise.

This is a known git limitation, not a Guild Hall bug. But the branching model makes it our problem to solve.

## When This Hurts

The damage depends on what's alive when the squash-merge to `master` happens:

1. **Nothing active on `claude/main`.** Safest case. After squash-merge to `master`, delete `claude/main` and recreate it from `master`. Clean slate. No recovery needed.

2. **Active meetings or commissions on activity branches off `claude/main`.** The activity branches were created from `claude/main` at some point in time. After `claude/main` is rebased/recreated from `master`, those activity branches are orphaned: their merge base with the new `claude/main` is wrong, and merging them back will produce conflicts or duplicate changes.

3. **Uncommitted work on `claude/main` not yet in a PR.** After recreating `claude/main` from `master`, this work needs to be cherry-picked or reapplied. Possible but manual and error-prone.

## What If Scenarios

### Option A: Prevent cleanup while work is active

Don't merge `claude/main` to `master` while any meetings or commissions are open. The manager worker (Phase 6) creates PRs; it could refuse to create a PR while activities are in flight.

**Pros:** Eliminates the problem entirely. Simple rule.

**Cons:** Long-running commissions or idle meetings could block PRs indefinitely. A forgotten open meeting becomes a bottleneck. The user loses control of their merge cadence.

**Variant:** Warning instead of hard block. The manager warns "3 active commissions will need re-branching if you merge this PR" and lets the user decide.

### Option B: Rebase activity branches after claude is recreated

After squash-merge to `master` and recreation of `claude/main`:
1. For each active activity branch, `git rebase --onto new-claude/main old-claude/main-tip activity-branch`.
2. This replays only the activity's commits on top of the new `claude/main`.

**Pros:** Preserves active work. Automated by the daemon.

**Cons:** Rebase can still conflict if the activity branch touches files that changed in the squash-merged PR. Requires tracking the old `claude/main` tip before recreation (a ref or tag). The daemon needs to be git-savvy enough to do multi-branch rebasing, which is a meaningful chunk of complexity.

### Option C: Use merge instead of rebase for claude-to-master sync

Instead of rebasing `claude/main` onto `master` (REQ-SYS-24), merge `master` into `claude/main` after the squash-merge. This creates a merge commit on `claude/main` but doesn't rewrite history.

**Pros:** Activity branches are unaffected (their merge base with `claude/main` doesn't change). No orphaned branches. Simplest recovery.

**Cons:** `claude/main` accumulates merge commits, making its history noisier. The spec explicitly says rebase (REQ-SYS-24) to "stay current without diverging." Merge commits are divergence, just resolved divergence.

**Counter-argument:** `claude/main` is an integration branch, not a feature branch. Its history is noise by design (squash-merged activity commits). Adding merge commits doesn't meaningfully degrade it. And since `claude/main`-to-`master` PRs are themselves squash-merged (REQ-SYS-23), none of this noise reaches `master`.

### Option D: Don't squash-merge at the claude-to-master boundary

Use regular merge commits (or rebase-merge) for the `claude/main`-to-`master` PR. This preserves the commit relationship, making subsequent rebases of `claude/main` onto `master` clean.

**Pros:** The rebase problem disappears. Git knows which commits are already on `master`.

**Cons:** Contradicts REQ-SYS-23 (one commit per PR on `master`). The user's `master` history gets polluted with every activity's squash commit. The whole point of squash-merge at this tier was a clean `master` history.

### Option E: Snapshot and recreate

After squash-merge to `master`, snapshot the state of each active activity branch (as a patch or stash), delete `claude/main` and all activity branches, recreate `claude/main` from `master`, then replay each activity's changes as new branches.

**Pros:** Clean state guaranteed. No rebase gymnastics.

**Cons:** SDK sessions tied to those activities lose their git context. Commission workers running in worktrees pointed at old branches would need to be stopped and restarted. Meeting sessions would need to be re-associated with new worktrees. Basically: stop the world, reorganize, restart. Expensive.

### Option F: Hybrid, separate the sync from the squash

Two-step process:
1. Before creating the PR, rebase `claude/main` onto `master` (they're in sync now, no squash involved).
2. Squash-merge the PR into `master`.
3. After merge, `claude/main`'s HEAD and `master`'s HEAD have different SHAs but identical trees. Reset `claude/main` to `master` (`git reset --soft master` or `git update-ref`).

**Pros:** Activity branches still have a valid merge base with `claude/main` (step 1 didn't rewrite their history if they were branched before the rebase, but... wait, it did).

**Problem:** Step 1 rewrites `claude/main`'s history, which orphans activity branches anyway. This just moves the problem earlier.

## Current Thinking

Option C (merge instead of rebase) is the least disruptive and most honest about what `claude/main` is. The spec says rebase to avoid divergence, but the real goal is "`claude/main` stays current with master." Merge accomplishes that without rewriting history, which means activity branches are never orphaned.

The cost is merge commits on `claude/main`. But `claude/main` is a staging area, not a presentable history. Its purpose is to integrate activity work and feed PRs to `master`. PRs are squash-merged (REQ-SYS-23), so `master` stays clean regardless.

Option A (prevent cleanup while active) is worth considering as a safety net on top of whatever sync strategy we pick. Even with merge-based sync, a "are you sure? these activities are in flight" confirmation is good UX.

## Open Questions

- Does the manager worker (Phase 6) control PR timing, or can the user merge PRs manually? If the user merges manually, we can't enforce any "wait for activities to finish" policy.
- Could we use `git replace` or `git grafts` to teach git that the squash commit on `master` is the "same" as the commits on `claude/main`? Obscure, but it's what the feature exists for.
- Is there a case where we genuinely need rebase semantics (linear history on `claude/main`) rather than merge? What would break?
- The activity-to-`claude/main` squash-merge has the same problem in miniature: if two activity branches exist and one is squash-merged, the other's merge base is now wrong. Is this already handled, or does it compound?
