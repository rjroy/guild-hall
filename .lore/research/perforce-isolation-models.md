---
title: "Guild Hall Isolation Model on Perforce"
status: resolved
created: 2026-03-22
tags: [perforce, git, isolation, worktrees, game-studio]
---

# Guild Hall Isolation Model on Perforce

## Summary

Guild Hall's git isolation model — cheap disposable worktrees per commission, sparse checkout, three-tier branching — has no direct Perforce equivalent. The core mismatch is architectural: git branches are local and instant; Perforce branching is server-side and expensive at scale. Three viable paths exist for a user with no admin access. Two are partial approximations; one is the closest equivalent but requires careful scoping. None are cost-free.

---

## Context: What Guild Hall Needs

Before mapping approaches, the properties that matter:

| Property | Git implementation | Why it matters |
|---|---|---|
| **Isolation** | Separate worktree per commission | Workers don't conflict; failed work doesn't bleed |
| **Cheap branching** | Local branch + worktree, near-instant | Multiple parallel commissions; disposable |
| **Sparse checkout** | Only relevant subtree visible | Workers see less; faster sync on large repos |
| **Integration flow** | activity → claude → master | Graduated merge path; human review at each gate |
| **Rollback** | Delete branch + worktree | No trace of failed work |
| **Parallel work** | Each commission gets its own directory | Concurrent isolation without locking |

The constraint that makes this hard at game studios: P4 depots are often 100GB+ with large binary assets. Every P4 operation that touches the server is proportional to what's in the workspace view, not just what changed.

---

## What a Regular P4 User Can Do Without Admin

This is the hard constraint. A non-admin P4 user can:

- Create and delete **workspaces** (client specs) freely — no admin required
- Create **shelved changelists** — no admin required
- Create **task streams** — no admin required if the depot is a stream depot and the user has write access to a parent stream
- Create **sparse streams** — same requirement as task streams

A non-admin user **cannot**:
- Create a new depot (requires super/admin)
- Create a stream depot (requires super/admin)
- Modify the protections table
- Install or configure the Helix Core Git Connector server-side

If the existing depot is not a stream depot, task streams and sparse streams are unavailable entirely.

---

## Approach 1: Multiple P4 Workspaces as Worktrees

### How it works

Each commission gets its own named P4 workspace (client spec) with a dedicated root directory. The workspace view maps only the relevant subtree of the depot using exclusionary mappings (`-//depot/art/...`, `-//depot/binaries/...`). The commission syncs only what it needs, works in its root directory, and shelves its changes when done.

```
P4CLIENT=guild-commission-abc123  p4 client -o   # Create client spec
P4CLIENT=guild-commission-abc123  p4 sync //depot/code/...  # Sync only code subtree
# ... commission runs ...
P4CLIENT=guild-commission-abc123  p4 shelve       # Save work
p4 client -d guild-commission-abc123              # Delete when done
```

### Mapping to Guild Hall properties

| Property | Approximation | Gap |
|---|---|---|
| Isolation | Each workspace is a separate directory | Workspaces share the same depot view; no branch isolation |
| Cheap branching | Workspace creation is fast | First sync can be very slow (100GB+ repo, even with exclusions) |
| Sparse checkout | Exclusionary mappings narrow the view | Must know the subtree upfront; binary assets still download |
| Integration flow | No equivalent — shelves require manual unshelve + submit | No graduated merge path |
| Rollback | Delete workspace + local directory | Shelved CLs persist on server unless explicitly deleted |
| Parallel work | Multiple workspace roots give full directory isolation | No network isolation — all workspaces share the same file versions |

### Permissions required

None beyond normal P4 write access. Any user can create workspaces.

### Performance on large repos

First sync is the critical cost. A workspace view that maps `//depot/code/...` but excludes `//depot/art/...` will only sync code files. If the code subtree is 5GB of a 100GB depot, the first sync costs ~5GB of transfer. Subsequent syncs are incremental (only changed files). This is workable if subtrees are well-defined.

**Risk:** If a commission needs files from multiple subtrees, or if subtrees aren't cleanly separated, the exclusion mapping becomes complex. Workspace views can't exclude individual files, only directories.

### What Guild Hall code would need to change

`daemon/lib/git.ts` and `daemon/services/git-admin.ts` would need a parallel `daemon/lib/p4.ts` abstraction. All git commands (clone, branch, worktree add, merge, rebase) map to p4 commands (client create/modify, sync, shelve, unshelve). The integration flow (activity → claude → master) has no P4 equivalent; that layer would need to be redesigned or dropped.

### Verdict

**Partial approximation.** Gets directory isolation and sparse sync. Loses branch isolation and graduated merge. Works without admin. The first sync cost is the main risk at game-studio depot sizes.

---

## Approach 2: Task Streams as Branches

### How it works

If the P4 depot uses streams (most modern Perforce setups do), a regular user can create task streams from a parent stream. Task streams are lightweight, server-side branches that track only files that differ from the parent — the rest are shadow tables that get cleaned up when the task stream is deleted.

```
p4 stream -t task //depot/streams/guild-commission-abc123 \
  -P //depot/streams/main
p4 client -S //depot/streams/guild-commission-abc123
p4 sync
# ... commission runs ...
p4 merge -S //depot/streams/guild-commission-abc123 \
  -r //depot/streams/main
p4 submit
p4 stream -d //depot/streams/guild-commission-abc123
```

### Mapping to Guild Hall properties

| Property | Approximation | Gap |
|---|---|---|
| Isolation | Full stream isolation — changes stay in the task stream | Limited to files that differ; parent files remain in sync |
| Cheap branching | Task streams create quickly; only modified files are branched | Only available if depot is a stream depot |
| Sparse checkout | Inherits parent stream's workspace view | Cannot narrow the view below what the parent exposes |
| Integration flow | `p4 merge` from task to parent approximates activity → claude | No second integration layer; one step only |
| Rollback | Delete the task stream | Server-side operation; cleaner than shelves |
| Parallel work | Multiple task streams give true branch isolation | Each needs its own workspace; sync cost applies |

### Hard constraints

- **Requires a stream depot.** Non-stream depots cannot use this approach. User cannot create a stream depot without admin.
- **Task streams should involve a small number of files.** Perforce documentation warns that if more than half the files in a branch are modified, task streams lose their lightweight advantage and should be converted to development streams. For commissions that touch many files, this is a real constraint.
- **Stream names cannot be reused.** After deletion, the name is gone forever. Commission IDs would need to be unique forever, not just for the active set.
- **No child streams.** The three-tier model (master / claude / activity) can only approximate two tiers with task streams (parent / task).

### What sparse streams change

Sparse streams (a newer Perforce feature) improve on task streams. They branch files only on edit, stay lightweight without requiring cleanup, support P4 Code Review, and can convert to development streams. The permission requirements are similar to task streams. If the organization's P4 server is recent enough (2023+) and sparse streams are enabled, they're the better choice within this approach.

### Permissions required

Creating task or sparse streams requires write access to the parent stream. This is typically granted to all developers. **However**, if `dm.protects.streamspec` is set to 1, the admin must have explicitly granted stream spec write permissions. Verify with `p4 protects -u <username>` before assuming access.

### Performance on large repos

Task/sparse streams only branch files that are edited — the rest remain as pointers to the parent. Sync cost is the parent stream's full workspace view the first time, but no extra cost for branching itself. If the parent stream's workspace view maps the full depot (common at studios that sync everything), the first sync is expensive regardless.

### What Guild Hall code would need to change

Similar to Approach 1, but the integration flow has a real P4 analogue: `p4 merge` from task stream to parent maps to the activity → claude merge. The master → claude layer has no equivalent since task streams don't support grandchild streams.

### Verdict

**Closest to the worktree model** if the depot uses streams and the user has stream write access. Branch isolation is real, not just directory isolation. Rollback is clean. The main losses are the three-tier integration hierarchy and the constraint on file count per task.

---

## Approach 3: Git-on-Perforce Layer (git-p4 or p4-fusion)

### How it works

`git-p4` (built into Git) clones a subset of the P4 depot into a local git repository, allowing full git operations locally. Changes are submitted back to P4 via `git p4 submit`.

### What git-p4 actually does

`git p4 clone //depot/code/...` pulls all changelists for that depot path into a local git history. This is a one-time full sync. After that, `git p4 sync` pulls new changes, and `git p4 submit` pushes local commits back as P4 changelists.

Once synced, the local git repo supports all standard git operations including branches, worktrees, and sparse checkout. Guild Hall would operate against the local git layer with no changes.

### The critical problems

**Initial clone time.** For a large depot, the initial `git p4 clone` is prohibitive. Converting 1GB of P4 history takes significant time; game studios with 100GB+ depots and years of history have reported multi-day clone times. p4-fusion (Salesforce's alternative) is claimed to be ~100x faster, but still requires hours for large depots and is not available as a user-installable tool in most studio environments.

**LFS incompatibility with submit.** `git-p4` does not support `git p4 submit` when Git LFS is configured for large files. Game depot large binaries (textures, meshes, audio) are exactly the files that need LFS. This creates a fundamental mismatch: syncing works, submitting doesn't.

**Scope is a subtree, not the full depot.** `git p4 clone` can target a specific depot path (`//depot/code/...`), which makes it viable for code-only work. It cannot help if commissions need to touch binary assets.

**No admin required for git-p4.** It's a local operation using the user's existing P4 credentials. The P4 server sees it as normal syncs and submits.

**Helix Core Git Connector is different.** This is a server-side component that requires admin installation. It provides bidirectional Git/P4 sync but at the server level. Not available to a user who can't talk to admins.

### What Guild Hall code would need to change

Potentially nothing on the git layer — Guild Hall would see a normal git repo. The work is in bootstrap: cloning the relevant subtree into a local git repo, managing the git-p4 sync/submit boundary, and deciding what happens to binary assets that can't round-trip through git-p4.

### Verdict

**Viable only for code-only subtrees.** If commissions only touch source code (no assets), git-p4 to a narrowly-scoped depot path gives the full git worktree model with no Guild Hall changes. The binary asset problem eliminates it for most game studio commissions. Initial clone time is a one-time cost but can be days.

---

## Approach 4: Shelves as Integration Layer (No Branching)

### How it works

No streams, no branches. Each commission works in its own workspace, and completed work is shelved. A human operator unshelves into a "staging" workspace and reviews before submitting. This approximates a very flat version of the integration flow.

```
# Commission creates workspace and works
P4CLIENT=guild-commission-abc123  p4 sync ...
# ... commission runs ...
p4 shelve -c <pending_cl>          # Save work to shelf

# Human review and integration
p4 unshelve -s <cl_number> -c <staging_cl>
# Review, then:
p4 submit -c <staging_cl>
```

### Mapping to Guild Hall properties

| Property | Approximation | Gap |
|---|---|---|
| Isolation | Directory isolation only | No version isolation; workers see the same depot revision |
| Cheap branching | No branching at all | Replaced by shelved changelists |
| Sparse checkout | Workspace views with exclusions | Same as Approach 1 |
| Integration flow | Shelf → unshelve → submit approximates it | Single step, no graduated layers |
| Rollback | Delete the pending CL with its shelf | Clean; no branch metadata to clean up |
| Parallel work | Multiple workspaces give directory isolation | No protection against conflicting edits on same files |

### Key limitation

Shelved changelists are tied to a workspace. If two commissions shelve edits to the same file, the second unshelve will conflict. There's no merge — just a conflict that requires manual resolution. This makes parallel commissions on overlapping files risky.

### Permissions required

None beyond write access. Shelving is available to all users.

### Verdict

**Weakest approximation.** No branch isolation means parallel commissions that touch the same files will conflict at unshelve time. Appropriate only for commissions that operate on cleanly disjoint file sets.

---

## Comparison Matrix

| | Approach 1: Multi-Workspace | Approach 2: Task Streams | Approach 3: git-p4 | Approach 4: Shelves Only |
|---|---|---|---|---|
| **Branch isolation** | No | Yes | Yes (local git) | No |
| **Directory isolation** | Yes | Yes (per workspace) | Yes | Yes |
| **Sparse sync** | Yes (exclusion maps) | Inherits parent view | Yes (depot path scope) | Yes (exclusion maps) |
| **Integration flow** | Manual | One-tier merge | Full git merge | Manual unshelve |
| **Rollback** | Delete workspace | Delete stream | Delete branch | Delete CL |
| **Parallel work** | Safe (disjoint files) | Safe (branch isolation) | Safe (full git) | Risky (same file = conflict) |
| **Admin required** | No | No (if stream depot exists) | No | No |
| **Binary assets** | Works | Works | Blocked (LFS submit) | Works |
| **Initial cost** | First sync | First sync | Clone (hours-days) | First sync |
| **Guild Hall changes** | Significant | Significant | Minimal | Significant |
| **Feasibility** | Moderate | High (if streams available) | Low (binary assets) | Low |

---

## Guild Hall Code Impact

Any viable approach requires replacing `daemon/lib/git.ts` and `daemon/services/git-admin.ts` with P4 equivalents. The core operations that need mapping:

| Git operation | P4 equivalent (Approach 1) | P4 equivalent (Approach 2) |
|---|---|---|
| `git worktree add` | `p4 client` (create workspace) | `p4 stream -t task` + `p4 client` |
| `git sparse-checkout` | Workspace view with exclusions | Inherits stream workspace view |
| `git checkout -b` | (no equivalent) | `p4 stream -t task` |
| `git merge` | (no equivalent) | `p4 merge -S` |
| `git push` | `p4 submit` | `p4 submit` |
| `git worktree remove` | `p4 client -d` | `p4 stream -d` + `p4 client -d` |
| `git branch -D` | (no equivalent) | `p4 stream -d` |

The three-tier integration hierarchy (activity → claude → master) cannot be replicated without admin access. Approaches 1 and 4 lose it entirely. Approach 2 preserves one merge tier (task → parent).

---

## Confidence Levels

**Verified against documentation:**
- Workspace creation requires no admin (P4 Guide, workspace creation docs)
- Shelving requires no admin; can be unshelved by other users (P4 Guide, shelve docs)
- Task streams require write access to a parent stream, not admin, in most configurations (P4V User Guide, task streams)
- Sparse streams require a recent P4 server and offer advantages over task streams (P4 Guide 2025.2, sparse streams)
- git-p4 submit is incompatible with Git LFS (git-p4 documentation)
- Helix Core Git Connector requires server-side admin installation (Perforce product page)
- Creating a stream depot requires super/admin (P4 Admin guide)
- git-p4 is prohibitively slow for large depots; p4-fusion is faster but not user-installable (Sourcegraph blog, git-p4 docs)

**Inferred from architecture, not verified by direct test:**
- Task stream names cannot be reused — documented but not tested at scale for commission-volume ID churn
- Workspace sync cost with narrow exclusion mappings — depends on how studio's depot is structured; if art and code are mixed in the same directory tree, exclusions may not help much
- Whether a specific studio's P4 server has sparse streams enabled — depends on server version and admin configuration

**Gaps:**
- No verified data on what permissions `dm.protects.streamspec=1` actually requires at a typical studio
- No tested workflow for Guild Hall operating fully against a P4 backend; all analysis is design-level
- Performance numbers for sparse streams on game-studio-scale depots are not in the documentation

---

## What to Ask the Studio Admin (If Contact Becomes Possible)

Even with no ability to dictate changes, the following questions cost the admin nothing to answer and would significantly narrow the approach:

1. Is the primary depot a **stream depot** or a classic depot? (Determines whether task/sparse streams are available at all)
2. Is the server version recent enough to support **sparse streams** (2023+)?
3. Is `dm.protects.streamspec` set to 1? (Affects whether stream creation requires extra permission)
4. Are there existing **development streams** a user can branch task streams from?
5. What is the approximate size of the code subtree, excluding binary assets?

These answers determine whether Approach 2 is available and what the sync cost of any approach would be.

---

## References

- [Perforce Task Streams (P4V User Guide)](https://help.perforce.com/helix-core/server-apps/p4v/current/Content/P4V/streams.task.html)
- [Sparse Streams (P4 CLI Documentation 2025.2)](https://help.perforce.com/helix-core/server-apps/cmdref/current/Content/P4Guide/streams-sparse.html)
- [Shelve Changelists (Helix Core P4 Guide)](https://help.perforce.com/helix-core/server-apps/p4guide/current/Content/P4Guide/shelve-changelists.html)
- [git-p4 Documentation](https://git-scm.com/docs/git-p4)
- [Atlassian git-p4 workflow guide](https://www.atlassian.com/git/tutorials/git-p4)
- [Git vs Perforce: Salesforce/Sourcegraph scalability analysis](https://sourcegraph.com/blog/git-vs-perforce-salesforce-scalability-and-performance)
- [p4-fusion (Salesforce, fast P4→Git conversion)](https://github.com/salesforce/p4-fusion)
- [Migrating from Git Fusion to Helix Core Git Connector](https://portal.perforce.com/s/article/15211)
- [Perforce Workspace Management](https://help.perforce.com/helix-core/server-apps/p4guide/2024.2/Content/P4Guide/configuration.workspace.manage-workspaces.html)
- [Exclude files in workspace view](https://www.perforce.com/manuals/p4guide/Content/P4Guide/configuration.workspace_view.exclude.html)
