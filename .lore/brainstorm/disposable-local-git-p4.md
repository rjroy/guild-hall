---
title: "Disposable local git as P4 isolation layer"
date: 2026-03-23
status: open
tags: [perforce, git, isolation, game-studio, disposable-git, p4-integration]
related: [.lore/research/perforce-isolation-models.md]
---

# Brainstorm: Disposable Local Git as P4 Isolation Layer

## Context

The Perforce isolation research (`.lore/research/perforce-isolation-models.md`) evaluated four approaches to replicating Guild Hall's git isolation model on Perforce. All four have a problem the research didn't weight heavily enough: **P4 server load**.

Game studio P4 servers are already under strain. Any approach that increases server traffic during commission work (multiple workspaces syncing, task stream operations, repeated shelving) adds load to a system that can't absorb it. That constraint kills Approaches 1, 2, and 4 from the research.

Approach 3 (git-p4) avoids server load during work but requires converting P4 history into git history. For an Unreal Engine depot (100GB+, 100M+ commits), the initial clone is measured in days, not hours. And git-p4 submit is incompatible with Git LFS, which means binary assets can't round-trip. Dead on arrival for game studio scale.

The question that prompted this brainstorm: what if Guild Hall doesn't need P4 to participate in isolation at all?

## The Idea: P4 as Bookends, Git as the Workspace

Instead of making P4 act like git or bridging the two at the protocol level, treat P4 as two bookend operations around a disposable git repo.

**Bootstrap:**
```
p4 sync                    # Get current depot state
git init                   # Create a fresh local git repo
git add .                  # Commit everything as the baseline
git commit -m "p4 sync baseline"
```

**Work:**
Guild Hall operates against this git repo. Commissions, meetings, worktrees, three-tier branching, sparse checkout, the entire isolation model works unchanged. No P4 awareness needed. No Guild Hall code changes.

**Submit (replaces "create PR"):**
```
# Derive change manifest from git
git diff --name-status <baseline>..<final>

# Integrate changes back to P4
p4 sync                    # Catch up to depot head
# Copy changed files from git over the synced workspace
p4 reconcile               # Let P4 detect adds/edits/deletes
p4 shelve                  # Save for human review
```

**Reset (after shelve is committed by a human):**
```
rm -rf .git
p4 sync
git init
# Fresh cycle
```

## What This Buys

- **Zero Guild Hall code changes.** Real git, real worktrees, real three-tier branching. The daemon's `git.ts` and `git-admin.ts` work without modification.
- **Minimal P4 server load.** Two server interactions per cycle: sync at start, shelve at end. Everything in between is local disk.
- **No admin access needed.** `p4 sync`, `p4 shelve`, and `git init` are all user-level operations.
- **No protocol bridge.** No git-p4, no LFS incompatibility, no history conversion. The git repo has no P4 history in it at all.
- **Works with binary assets in P4.** Git never needs to push or bridge to P4. The `.git` directory is disposable.

## Scoping: The "Guild Hall Spec"

A full `git add .` on a 100GB workspace would create a massive `.git` directory. That's wasteful when commissions only touch source code.

A `.gitignore` that restricts tracking to specific directories solves this. Call it a "guild hall spec" for the workspace: it defines which directories are in scope for AI work, and everything else is invisible to git.

```gitignore
# Ignore everything by default
/*

# Track only code directories
!/Source/
!/Config/
!/Scripts/
```

This is functionally equivalent to sparse checkout but enforced by ignore rules. Commissions can only touch what git tracks. That's a feature: it's the scope boundary for AI work at the studio.

The studio defines this file once based on their depot layout. It's the only configuration artifact the approach needs.

## Edge Cases

### Drift During Work (the hard one)

Between `git init` and shelve, other developers submit to P4. The git repo is frozen at the sync point. At shelve time, the changes are based on a stale depot revision.

The "integrate back" step handles this partially: `p4 sync` before shelving catches up to head, then the git-side changes are copied over the synced workspace. But this is a manual rebase. If someone else edited the same file, the git version silently overwrites their changes.

**Possible mitigations:**
- Run a pre-shelve diff check: compare the git-changed files against the depot versions. If any file was also modified in P4 since the baseline sync, flag it for manual review before shelving.
- Keep the cycle short. The longer between sync and shelve, the more drift accumulates. Commissions that complete in hours have less exposure than ones that run for days.
- Scope the guild hall spec narrowly. If AI work only touches `Source/Runtime/MyFeature/`, the overlap surface with other developers is small.

This edge case could warrant its own brainstorm. The core question: how much conflict detection can be automated in the integrate-back step without making it fragile?

### Integrate-Back Translation

P4 requires explicit `p4 edit`, `p4 add`, `p4 delete` per file before shelving. A script can derive this from `git diff --name-status`:

| Git status | P4 operation |
|-----------|-------------|
| `A` (added) | `p4 add` |
| `M` (modified) | `p4 edit` |
| `D` (deleted) | `p4 delete` |
| `R` (renamed) | `p4 move` (or `p4 delete` + `p4 add`) |

Renames are the tricky case. P4 tracks them differently than git, and git's rename detection is heuristic (similarity threshold). A conservative approach: treat renames as delete + add. Loses P4 rename history but avoids misattribution.

This translation is messy but bounded. It's a script, not an architecture change.

### .git and P4 Coexistence

The workspace directory contains both `.git/` and P4 metadata (`.p4config`, workspace state). Each system needs to ignore the other:

- `.p4ignore`: add `.git/`, `.gitignore`
- `.gitignore`: add `.p4config`, `.p4ignore`, any P4 workspace metadata

Straightforward but easy to forget. Should be part of the bootstrap step.

### Active Worktrees at Reset

Deleting `.git` destroys all worktrees that reference it. This is a workflow constraint, not a technical one: all commissions and meetings must be resolved before the reset step. Guild Hall already enforces this before PR creation (you can't create a PR with active worktrees), so the constraint is inherited, not new.

## Comparison to Researched Approaches

| | Approaches 1/2/4 | Approach 3 (git-p4) | This approach |
|---|---|---|---|
| **P4 server load during work** | Continuous | None (local git) | None (local git) |
| **Initial setup cost** | First sync | Clone (days) | First sync + git init (minutes) |
| **Binary asset support** | Works | Blocked (LFS submit) | Works (excluded from git by scope) |
| **Guild Hall code changes** | Significant | Minimal | None |
| **Branch isolation** | Varies (none to real) | Full git | Full git |
| **Integration flow** | Lossy | Full git | Full git locally, shelf for P4 |
| **Drift handling** | Native P4 merge | git-p4 sync | Manual (pre-shelve reconcile) |
| **History preservation** | P4 native | Converted | None (disposable) |
| **Admin required** | Varies | No | No |

The main trade-off: this approach gains zero code changes and zero server load at the cost of no P4 history for in-progress work and a manual drift-reconciliation step.

## Open Questions

1. **How much conflict detection can the integrate-back script automate?** Comparing file timestamps or P4 revisions between baseline sync and current head could flag files that both the commission and other developers touched. Is that sufficient, or does it need content-level diffing?

2. **Is the reset step always necessary?** If no one else submitted to the tracked directories, the git repo is still valid. The reset is a "re-sync with the world" operation. Could Guild Hall detect when a reset is needed vs. when the existing repo is still fresh?

3. **What's the right granularity for the guild hall spec?** Too broad (all of `Source/`) and git tracks too much. Too narrow (one feature directory) and commissions can't touch shared code. The studio needs to define this, but what guidance would help them get it right?

4. **Does the disposable git approach compose with P4 triggers or review tools?** Some studios have P4 triggers that validate shelves (style checks, build verification). The shelve from this workflow should look like any other shelve to P4, but that assumption needs verification.

5. **Could the bootstrap and integrate-back steps be a Guild Hall "P4 adapter" that lives outside the daemon?** A CLI tool or shell script that wraps the bookend operations, keeping Guild Hall itself completely P4-unaware. The adapter is the only thing that knows P4 exists.

## Next Steps

- Brainstorm the drift/conflict detection problem in more depth. That's the edge case with the most risk and the most design space.
- Sketch the integrate-back script. Even a pseudocode version would clarify how messy the rename and delete cases actually are.
- Consider whether the "guild hall spec" (the `.gitignore` that scopes AI work) is a general concept that applies beyond P4. It's essentially a "what can AI touch" boundary for any large repo.
