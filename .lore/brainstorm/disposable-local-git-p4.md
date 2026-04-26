---
title: "Disposable local git as P4 isolation layer"
date: 2026-03-23
status: resolved
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

The P4 boundaries are human-operated. Guild Hall never touches P4. A standalone adapter CLI handles the bookend operations.

**The cycle:**

1. User runs `p4 sync` to get current depot state
2. User tells the adapter to initialize (or re-initialize) the git workspace
3. Adapter creates a fresh git repo, applies the `.gitignore` whitelist, makes tracked files writable (P4 sets everything read-only after sync), commits baseline
4. User registers the project with Guild Hall (`guild-hall register`) if not already done
5. User works in Guild Hall normally: commissions, meetings, worktrees, three-tier branching. No P4 awareness.
6. User asks the adapter to "submit work." The adapter derives the change manifest from git, copies changed files into the P4 workspace, runs `p4 reconcile`, and creates a shelve.
7. User creates a P4 Swarm review from the shelve (standard P4 workflow)
8. User syncs P4 and runs the adapter's reset. Fresh cycle.

**Critical constraint:** `p4 sync` must not happen mid-cycle. The cycle is atomic from the user's perspective. Drift is prevented by workflow, not detected by tooling.

## What This Buys

- **Zero Guild Hall code changes.** Real git, real worktrees, real three-tier branching. The daemon's `git.ts` and `git-admin.ts` work without modification.
- **Minimal P4 server load.** Two server interactions per cycle: sync at start, shelve at end. Everything in between is local disk.
- **No admin access needed.** `p4 sync`, `p4 shelve`, and `git init` are all user-level operations.
- **No protocol bridge.** No git-p4, no LFS incompatibility, no history conversion. The git repo has no P4 history in it at all.
- **Works with binary assets in P4.** Git never needs to push or bridge to P4. The `.git` directory is disposable.

## Why Pure Bookends Are Sufficient

The adapter is two operations: **init** (create git repo from P4 workspace) and **submit** (create P4 shelve from git changes). Guild Hall sees a git repo. P4 sees a shelf. Neither knows the other exists.

The natural concern: does losing mid-cycle P4 awareness miss anything? Three things are invisible during work:

- **Exclusive locks.** If another developer `p4 lock`s a file the commission is editing, you don't find out until `p4 reconcile` at submit. But reconcile surfaces it, and the human resolves it.
- **Critical submits.** If someone lands a breaking change to a dependency, the commission works against stale code. But this is the same risk any developer takes between syncs, and the cycle is short.
- **P4 filetypes.** `p4 reconcile` infers file types. Studios with custom typemap rules might get wrong inferences on new files. A deployment note, not a design gap.

All three surface at the submit bookend. None are silent failures. The human is in the loop at exactly the moment they'd need to be. Mid-cycle P4 awareness would require polling, lock checking, and depot monitoring, all to solve problems that are already solved by keeping the cycle short and the scope narrow.

The bookend is where the P4 problems live, and it's where the P4 answers live too. There's no gap in the middle that the adapter needs to fill.

## Scoping: The "Guild Hall Spec"

A full `git add .` on a 100GB workspace would create a massive `.git` directory. That's wasteful when commissions only touch source code.

A `.gitignore` that restricts tracking to specific directories solves this. Call it a "guild hall spec" for the workspace: it defines which directories are in scope for AI work, and everything else is invisible to git.

The `.gitignore` uses a whitelist model: deny everything, then permit specific paths.

```gitignore
# Nothing tracked by default
*

# Allow these directories (each parent in the chain must be listed)
!/Source/
!/Source/Runtime/
!/Source/Runtime/MyFeature/**
!/Config/
```

This is an access boundary, not just a performance optimization. Anything git tracks, commissions can modify. Studios with proprietary engine modifications or NDA-covered platform code should treat this file as an access control list.

**Gotcha:** Git's negation rules require each parent directory in the chain to be un-ignored separately. `!/Source/Runtime/MyFeature/**` won't work unless `!/Source/` and `!/Source/Runtime/` are also present.

**Guidance:** Start narrow, expand only when a commission fails because it couldn't reach something it needed. Each expansion is a conscious decision about what AI is allowed to touch.

The studio defines this file once based on their depot layout. It's the only configuration artifact the approach needs.

**Writable files:** P4 sets all files read-only after sync. The adapter's init step must chmod tracked files writable, or commissions fail. This is part of bootstrap, not optional.

## Edge Cases

### Drift During Work

Drift is prevented by workflow: no `p4 sync` mid-cycle. The cycle stays atomic. At submit time, `p4 reconcile` surfaces whatever P4 finds. The human reviews the shelve in Swarm before it lands.

The adapter records the baseline P4 changelist at init. At submit, it can check whether any commission-touched file was also submitted by another developer since the baseline. If so, flag those files and block auto-shelve. The human decides: merge manually, discard the commission's changes to that file, or re-cycle.

Revision-level detection is sufficient. Content-level three-way merge is a future concern if studios find the manual step painful at scale.

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

## Resolved Questions

These were open questions in the original brainstorm. Resolved in meeting 2026-03-25.

1. **Conflict detection:** Revision-level check at submit time. The adapter records the baseline P4 changelist at init. At submit, it queries whether commission-touched files were also submitted since baseline. Flag conflicts, block auto-shelve, human resolves. The workflow prevents drift by keeping `p4 sync` out of the middle of a cycle.

2. **Always reset?** Yes. Always destroy `.git` and re-init after a cycle. The simplicity is worth more than the time saved detecting whether the repo is still fresh. One mental model: sync, init, work, submit, done.

3. **Scope granularity:** Whitelist model (`*` deny all, then explicit exceptions). Start narrow, expand only when a commission fails because it couldn't reach something. Treat the `.gitignore` as an access boundary, not just performance tuning. Studios with proprietary or NDA-covered code need to think about this as access control.

4. **P4 triggers and review tools:** Composes cleanly. `p4 reconcile` + `p4 shelve` produces a standard shelf. Swarm reviews it normally. Triggers fire normally. The provenance of the edits (git worktree vs. IDE) is invisible to P4. Studio-specific trigger quirks (e.g., triggers that expect `p4 edit` before modification) are a deployment note, not a design concern.

5. **Separate tool?** Yes. The adapter lives inside the guild-hall repo at `lib/p4-adapter/` (a colocated, self-contained module). It has its own entry point and tests. No imports from `apps/daemon/` or `apps/web/`, and neither imports from it. Colocated, not coupled. Guild Hall remains "git is the world." The adapter is the only thing that knows P4 exists.

## Next Steps

The adapter's entire surface is two commands. Everything else is either Guild Hall's existing behavior or the user's existing P4 workflow.

- **Specify `init`:** Given a P4 workspace directory and a `.gitignore` whitelist, create a git repo with a baseline commit. Make tracked files writable. Record the baseline P4 changelist number.
- **Specify `submit`:** Given a git repo created by `init`, derive the change manifest (`git diff --name-status`), copy changed files to the P4 workspace, run `p4 reconcile`, create a shelve. Check for conflicts against the recorded baseline changelist. (Reset is just `init` again.)
- **Decide the rename case:** Git's heuristic rename detection vs. P4's explicit `p4 move`. Current leaning: treat renames as delete + add (conservative, loses P4 rename history, avoids misattribution).
- **Consider whether the whitelist `.gitignore` concept** ("what can AI touch") is a general Guild Hall feature beyond P4. Any large repo benefits from a scope boundary for AI work.
