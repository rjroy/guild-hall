---
title: "ProjFS as lazy worktree population for P4-backed repos"
date: 2026-03-25
status: open
tags: [projfs, windows, worktrees, performance, p4-integration, isolation, virtual-filesystem]
modules: [daemon, p4-adapter]
related:
  - .lore/research/windows-projfs-evaluation.md
  - .lore/brainstorm/disposable-local-git-p4.md
  - .lore/specs/infrastructure/p4-adapter.md
---

# Brainstorm: ProjFS as Lazy Worktree Population

## Context

The P4 adapter creates a disposable git repo from a Perforce workspace. For the EOS SDK, that workspace is 148,973 files and 1.88GB after paring down to the minimum. The `p4-adapter init` step takes 20 minutes. That's painful but it's once per cycle.

The real problem: `git worktree add` takes 3 minutes. Every commission creates a worktree. Every meeting creates a worktree. A typical day has 60+ commissions (brainstorm, design, spec, plan, 5 implementation phases, review, fix-the-review, repeat across features). That's 3 hours of dead time per day, just waiting for files to materialize on disk.

Sparse checkout doesn't help for development commissions. Dalton needs the full source tree accessible for context, not just `.lore/`. And even non-development workers (Octavia writing specs, Thorne reviewing) need to grep across the codebase to understand what they're documenting or reviewing. "Have fewer files" isn't an option. 149K is the minimum for a real SDK codebase.

The ProjFS research (`.lore/research/windows-projfs-evaluation.md`) evaluated ProjFS against three hypothetical use cases and correctly found it was the wrong tool for all three. But it asked the wrong question. It asked "can ProjFS replace worktrees?" (no) instead of "can ProjFS make worktree population instant?" (yes, probably).

## The Core Idea: Virtual Worktrees

Instead of `git worktree add` writing 149K files to disk, create the worktree structure without checking out files, then use a ProjFS provider to project the git tree as virtual entries.

**The sequence today:**
1. `git worktree add <path> <branch>` (writes 149K files, 3 minutes)
2. Commission starts
3. Commission finishes, worktree deleted

**The proposed sequence:**
1. `git worktree add --no-checkout <path> <branch>` (instant, creates worktree metadata only)
2. ProjFS provider projects the git tree for that branch into the worktree path (instant, no disk writes)
3. All 149K files appear in directory listings, with correct sizes and timestamps
4. Commission starts immediately
5. Files hydrate on first read (provider serves blob content from git object store)
6. Modified files become "full files" that git tracks normally
7. Commission finishes, worktree deleted (all hydrated files go with it)

A spec commission might hydrate 50 files. A development commission might hydrate 500. A review might hydrate 200. None of them pay the 149K-file tax.

## Why the Research's Objections Don't Apply Here

The research raised five objections to ProjFS. All five were evaluated against "ProjFS as worktree replacement." Against "ProjFS as lazy worktree population," they dissolve:

| Research objection | Why it doesn't apply |
|---|---|
| "Hydration makes files permanent" | Correct, but 200 hydrated files out of 149K is a 99.8% reduction in disk writes. The worktree is disposable anyway. |
| "ProjFS cannot intercept writes" | Doesn't matter. Writes go to hydrated files. Git tracks them normally. The provider doesn't need write interception. |
| "No dehydration API" | Doesn't matter. Worktrees are disposable. `rm -rf` after the commission cleans everything up. |
| "Provider must stay running" | Real cost, but the Guild Hall daemon is already a long-running process. The provider is a managed subprocess. |
| "Git still needs a real working directory" | `git status` needs to stat every file, but ProjFS placeholders return metadata (size, mtime) from stat calls without hydrating content. VFS for Git proved this: `git status` on 3.5M virtual files ran in 4-5 seconds. |

The one objection that survives in a different form: **git status on 149K placeholders**. Even with ProjFS serving stat metadata efficiently, git still walks its index and stats every tracked file. VFS for Git handled this with a custom FSMonitor hook that told git which files had changed, so git only checked those. Without FSMonitor integration, `git status` on 149K placeholders is fast (stat calls on placeholders are cheap) but not instant.

## The Search Hydration Problem

Claude Code's workers use ripgrep (via the Grep tool) for codebase search. A broad search like `rg "someFunction" --type ts .` opens every TypeScript file to check its contents. Each opened file hydrates. If the worktree has 50K `.ts` files, a single search writes 50K files to disk.

This doesn't eliminate ProjFS's value (50K is still better than 149K, and most searches are scoped by directory or file type), but it does erode it for development commissions that do broad searches early.

**Mitigation: `git grep`.**

`git grep` searches the git object store directly. It reads blobs from pack files without touching the working tree. Zero hydration. It's fast on local repos.

The problem: Claude Code's built-in Grep tool uses ripgrep internally. Guild Hall doesn't control how Claude Code implements its tools.

**Possible approaches:**

1. **Accept scoped hydration.** ripgrep with type filters and directory scoping hydrates a fraction of the tree. A search scoped to `Source/Runtime/MyFeature/` hydrates only files in that directory. Most searches are naturally scoped. Still a massive improvement over 149K upfront writes.

2. **Custom MCP search tool.** Guild Hall already provides MCP tools to workers via the toolbox system. A `git_grep` tool that wraps `git grep` and returns results in the same format as ripgrep would let workers search without hydration. Workers could use either tool depending on whether they need working-tree search (ripgrep, hydrates) or content search (git grep, no hydration). The limitation: Claude Code's built-in Grep tool would still hydrate if invoked directly, and there's no way to intercept or redirect it.

3. **Teach the provider to serve without hydrating.** This isn't how ProjFS works. `GetFileDataCallback` is supposed to call `PrjWriteFileData`, which writes to disk. The provider can't serve content without hydrating. However, the provider could track hydration patterns and pre-populate frequently-accessed directories in the background, amortizing the I/O cost.

Option 1 is realistic today. Option 2 is the right long-term answer but requires workers to prefer the custom tool over the built-in one. Option 3 is a misunderstanding of ProjFS's design and isn't viable.

**The honest assessment:** Search hydration means ProjFS doesn't reduce worktree population to zero disk writes. It reduces it from "all files upfront" to "files accessed during the commission." For most commissions, that's still a 90-99% reduction. For a development commission that does a broad search early, the reduction might be 60-70%. Still worth it at 60 commissions/day.

## Provider Architecture

### Option A: ProjFS on Top of Git Worktrees

Keep git's worktree infrastructure intact. The provider is an optimization layer.

```
git worktree add --no-checkout <path> <branch>
    |
    v
ProjFS provider reads git tree object for <branch>
    |
    v
Projects virtual entries into <path>
    |
    v
Commission runs, files hydrate on demand
    |
    v
git status/diff/add/commit work against the index
    (placeholders satisfy stat checks for unchanged files)
    |
    v
Worktree removed normally
```

**Advantages:**
- Git's index, staging area, and all tooling remain intact
- `git diff`, `git add`, `git commit` work as expected
- Incremental adoption: only the worktree creation path changes
- Fallback is trivial: if ProjFS fails, do a normal checkout

**Disadvantages:**
- Git still walks 149K index entries for status/diff (fast with placeholders, but not free)
- The index file itself is large (149K entries)
- Provider must keep the projected tree consistent with git's index

### Option B: ProjFS Without Git Worktrees

Skip `git worktree add` entirely. The provider projects a directory from the git object store. No git index, no worktree registration.

```
Provider creates <path>, projects tree from object store
    |
    v
Commission runs, reads/writes files directly
    |
    v
Daemon diffs <path> against known tree hash
    (only examines hydrated files, which are the only ones that could have changed)
    |
    v
Daemon creates git operations from diff
    (add/modify/delete, same translation as p4-adapter shelve)
```

**Advantages:**
- No git worktree overhead at all (no index, no checkout)
- Change detection is O(hydrated files) not O(all tracked files)
- The daemon already knows how to diff and translate changes (the p4-adapter shelve logic does this)
- Conceptually cleaner: the commission works on a projected view, the daemon manages the version control

**Disadvantages:**
- Loses git's index and staging area
- Tools that assume a git repo (Claude Code's git integration, any worker that runs `git log` or `git blame`) won't work
- The daemon must implement its own change detection, which git already does well
- Three-tier branching (master/claude/activity) depends on real git branches and real worktrees
- All of Guild Hall's existing git infrastructure (`daemon/lib/git.ts`, `daemon/services/git-admin.ts`) becomes irrelevant for these workspaces

### Assessment

Option A is the realistic path. It preserves everything that works and optimizes the one thing that's slow (worktree population). Option B is intellectually interesting but requires rebuilding version control infrastructure that already exists, and it breaks the "Guild Hall sees a git repo" abstraction that the entire system depends on.

Option B might be worth revisiting if git's index operations become the bottleneck after ProjFS eliminates the file-write bottleneck. But that's a second-order problem. Solve the 3-minute wall first.

## Implementation Shape

### The Provider

The ProjFS managed API is C# (.NET). The native API is C/C++. Neither is TypeScript. The provider must be a separate process.

**Technology choice:** C# with the managed API (`Microsoft.Windows.ProjFS` NuGet package). Reasons:
- The managed API was recently rewritten to pure C# P/Invoke (no C++ toolchain required)
- NuGet package targets .NET 8/9/10 (current, maintained)
- The provider is a thin process: receive tree data, serve blobs, respond to callbacks
- C# is a reasonable language for game studio environments (Unity, tools)
- .NET single-file publish creates a standalone executable (no runtime dependency on target machines)

**What the provider needs to do:**
1. Accept a "projection request" from the daemon: tree hash, worktree path, path to git repo (for object store access)
2. Start ProjFS virtualization on the worktree path
3. Enumerate: read git tree objects, return directory listings
4. Placeholder info: return file size and timestamps from tree/blob metadata
5. File data: read blob content from git object store, write via `PrjWriteFileData`
6. Tear down: stop virtualization when the commission ends

**Reading git objects:** The provider needs to read tree objects (for enumeration) and blob objects (for file content) from the git object store.

Options:
- **libgit2** (via LibGit2Sharp NuGet): mature C# bindings for git's object store. Can read trees, blobs, and resolve references without shelling out to git. This is the clean approach.
- **Shell out to `git cat-file`**: works but subprocess overhead per file read would be noticeable during burst hydration (ripgrep searching hundreds of files).
- **`git cat-file --batch`**: a single long-running process that accepts object hashes on stdin and returns content on stdout. Amortizes process creation. This is how VFS for Git's cache server worked internally.

LibGit2Sharp is the right choice. It's a direct API for reading git objects, avoids subprocess overhead, and handles pack files, loose objects, and alternates transparently.

### Daemon Integration

The daemon spawns the provider process when a worktree needs ProjFS projection. The communication channel could be:

- **Named pipe** (Windows): natural for Windows IPC, bidirectional, the daemon sends projection requests and teardown commands
- **stdin/stdout**: simpler, the daemon writes JSON commands to the provider's stdin, reads status from stdout
- **HTTP on localhost**: overkill for this use case

stdin/stdout is simplest for a managed subprocess. The daemon already spawns processes (git, p4) and manages their lifecycle.

**Lifecycle:**
1. Commission starts: daemon calls `git worktree add --no-checkout`
2. Daemon spawns provider process with: `{ repoPath, worktreePath, treeHash }`
3. Provider initializes ProjFS, signals ready
4. Commission runs (Claude Code SDK session)
5. Commission ends: daemon sends teardown command to provider
6. Provider stops ProjFS, exits
7. Daemon removes worktree

One provider process per active worktree. If 3 commissions run concurrently, 3 provider processes run. Each is lightweight (memory footprint is small when most files are virtual).

### Platform Strategy

ProjFS is Windows-only. The p4-adapter is designed for game studios, which are Windows-first. But Guild Hall itself is cross-platform.

**The approach:** ProjFS is an optimization, not a requirement. The daemon's worktree creation path checks:
1. Is this Windows?
2. Is ProjFS available? (the feature must be enabled)
3. Does the project exceed a file-count threshold? (no point in ProjFS for a 500-file repo)

If all three: use ProjFS path (`--no-checkout` + provider). Otherwise: normal `git worktree add`. The commission doesn't know or care which path was used. It sees a directory with files in it.

This keeps the Unix path unchanged and makes ProjFS a transparent acceleration layer.

## The `init` Problem (Separate but Related)

The 20-minute `p4-adapter init` is a separate problem from the 3-minute worktree creation, but ProjFS thinking informs a potential fix.

The init bottleneck is two operations that scan all 149K files:
- `attrib -R /S *.*` (remove read-only flags from entire workspace)
- `git add .` (walk entire directory tree, evaluate each path against `.gitignore`)

Both are O(all files) when they should be O(in-scope files). The fix doesn't require ProjFS:
1. Parse the `.gitignore` whitelist to compute the in-scope file list
2. `attrib -R` only those files
3. `git add` only those paths explicitly (not `.`)

This turns init from O(149K) to O(in-scope files). If the whitelist permits 5K source files, init goes from 20 minutes to maybe 2 minutes.

This is a code fix to `p4-adapter/init.ts`, not an architectural change. It should happen regardless of whether ProjFS is pursued.

## Open Questions

1. **Does `git status` behave well on ProjFS placeholders?** VFS for Git proved it works, but VFS for Git also had deep FSMonitor integration. A vanilla ProjFS provider without FSMonitor means git stats every placeholder on `git status`. How fast is that for 149K placeholders on NTFS? Needs benchmarking.

2. **How does Windows Defender interact with ProjFS?** Defender's real-time scanning could trigger hydration on file access. VFS for Git had documented issues with antivirus causing unwanted hydration. Is there an exclusion pattern that prevents Defender from scanning ProjFS placeholders without compromising security?

3. **Can the provider survive Claude Code's tool patterns?** Claude Code's Read tool reads one file (fine). Grep uses ripgrep (hydrates searched files). Glob uses fast file matching (directory enumeration only, no hydration). What about other tools? Does `Write` create a file that ProjFS tracks correctly? Does `Edit` (which reads then writes) hydrate then modify correctly?

4. **LibGit2Sharp + ProjFS compatibility.** LibGit2Sharp opens the git object store. ProjFS hooks into the filesystem. If both operate in the same worktree directory, are there conflicts? The provider reads from the `.git` object store (which is in the main repo, not the worktree), so probably no conflict. But needs verification.

5. **Concurrent providers.** Multiple commissions running simultaneously means multiple provider processes, each projecting a different branch into a different directory but all reading from the same git object store. LibGit2Sharp should handle concurrent readers, but this is a concurrency pattern that needs testing.

6. **The `git grep` tooling question.** Is it worth building a custom MCP tool for `git grep`, or is scoped ripgrep hydration acceptable? The answer depends on how workers actually search. If most searches are naturally directory-scoped (`rg "pattern" Source/Runtime/MyFeature/`), hydration is bounded. If workers frequently search the entire tree, hydration erodes ProjFS's benefit significantly.

7. **What's the engineering budget?** A ProjFS provider in C#, daemon integration for spawning and lifecycle, platform detection, and testing. This is real work. Is it justified by the P4 adapter use case alone, or does it need to benefit pure-git large repos too?

## Next Steps

- The `p4-adapter/init.ts` optimization (scoped attrib + scoped git add) should happen first. It's a straightforward code fix that cuts init time regardless of ProjFS.
- If ProjFS is pursued, a proof-of-concept provider that projects a single git tree into a directory would answer questions 1-5 above. The PoC doesn't need daemon integration; it just needs to demonstrate that `git status`, `git diff`, and `git add` work correctly against ProjFS-projected files from a git object store.
- The `git grep` MCP tool question (6) can be deferred until after the PoC reveals how much hydration actually occurs in practice.
