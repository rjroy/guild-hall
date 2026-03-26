---
title: "Windows ProjFS as Guild Hall Isolation Mechanism"
status: active
date: 2026-03-25
tags: [projfs, windows, isolation, worktrees, virtual-filesystem, perforce, game-studio]
related: [.lore/research/perforce-isolation-models.md, .lore/brainstorm/disposable-local-git-p4.md]
---

# Windows ProjFS as Guild Hall Isolation Mechanism

## Summary

Windows Projected File System (ProjFS) is a real, documented, production-grade Windows API. Microsoft built it to solve a specific problem (virtualizing the 270GB Windows git repo), and it works for that problem. But it does not solve Guild Hall's isolation problems, and attempting to use it would introduce significant complexity for marginal benefit. The disposable-git approach from the brainstorm is a better fit for P4 integration, and git worktrees remain the right isolation primitive for branch-per-commission work.

ProjFS is not a dead end in the sense of being abandoned. Microsoft continues to maintain the managed API and the kernel driver ships with Windows. But it is a dead end for Guild Hall's use cases. The mismatch is fundamental, not incidental.

---

## What ProjFS Is

ProjFS is a Windows kernel minifilter (not a full filesystem) that lets a user-mode "provider" application project hierarchical data into the filesystem. Files appear in directory listings but don't exist on disk until accessed. On first read, ProjFS invokes the provider's callback to supply the data, which gets written to disk ("hydrated"). After hydration, the file is real and ProjFS is no longer involved.

### API Surface

The provider implements callbacks; ProjFS invokes them when the filesystem needs data.

**Required callbacks:**
- `StartDirectoryEnumerationCallback` / `GetDirectoryEnumerationCallback` / `EndDirectoryEnumerationCallback` - directory listing
- `GetPlaceholderInfoCallback` - file metadata (size, timestamps) when a file is first accessed
- `GetFileDataCallback` - file content when a file is opened for reading

**Optional callbacks (notifications):**
- `PRJ_NOTIFICATION_FILE_OPENED` / `FILE_OVERWRITTEN` / `NEW_FILE_CREATED` etc.
- Three "pre" callbacks that can block operations: `PRJ_NOTIFICATION_PRE_DELETE`, `PRJ_NOTIFICATION_PRE_RENAME`, `PRJ_NOTIFICATION_PRE_SET_HARDLINK`
- No pre-callback for reads or writes. You cannot intercept or block a write.

**Provider-initiated operations:**
- `PrjMarkDirectoryAsPlaceholder` - mark directories for projection
- `PrjWritePlaceholderInfo` / `PrjWritePlaceholderInfo2` - supply file metadata
- `PrjWriteFileData` - supply file content
- `PrjDeleteFile` - remove a projected item
- `PrjUpdateFileIfNeeded` - update a placeholder to reflect new backing data

**File states (lifecycle):**
1. **Virtual** - exists only in enumeration results, no disk footprint
2. **Placeholder** - metadata on disk (size, timestamps), content not yet materialized
3. **Hydrated placeholder** - full content on disk, ProjFS still tracks it
4. **Full file** - modified by the user; ProjFS no longer manages it (a "dirty" file)
5. **Tombstone** - deleted locally; ProjFS hides it from enumeration

Once a file is hydrated, it stays hydrated. There is no dehydration API. The provider cannot reclaim disk space without deleting and re-projecting the file, which loses any local modifications.

### Platform Requirements

- Windows 10 version 1809 (October 2018 Update) or later
- Must be explicitly enabled: `Enable-WindowsOptionalFeature -Online -FeatureName Client-ProjFS -NoRestart`
- Enabling requires administrator privileges (one-time)
- NTFS required for symlink support; non-symlink operations work on ReFS
- The feature ships with Windows; no additional downloads needed

### Maturity

**Verified:** ProjFS is a stable, documented Win32 API. Microsoft ships it in Windows and maintains the managed API wrapper (168 stars, 38 forks, 9 open issues on GitHub, NuGet package targets up to .NET 10). The native C API is part of the Windows SDK. Documentation was last updated March 2025.

**Verified:** The managed API was rewritten from C++/CLI to pure C# P/Invoke (no C++ toolchain required, NativeAOT compatible). This is a sign of continued investment in the API surface, not just maintenance.

**Verified:** CVE-2025-62464 was a ProjFS local privilege escalation (buffer over-read in kernel). Microsoft patched it. The existence of a CVE means the kernel driver is receiving security scrutiny and fixes, which is a positive signal for production use.

---

## How VFS for Git Used ProjFS

VFS for Git (formerly GVFS) was the reference ProjFS provider. It projected a complete git working directory where files appeared present but were fetched from a remote Git server only on access.

**What it solved:**
- Clone time: from 12+ hours to minutes (only metadata downloaded initially)
- Checkout time: from 2-3 hours to 30 seconds
- Status time: from 10 minutes to 4-5 seconds
- The Windows repo: 270GB, 3.5 million files

**How it worked:**
1. Provider reads the git index (tree metadata) and projects all paths as virtual files
2. Directory enumeration callbacks return file names and sizes from the index
3. On file open, `GetFileDataCallback` fetches the blob from a GVFS cache server or remote
4. Hydrated files are real on disk; subsequent reads bypass ProjFS entirely
5. Modified files become "full files" and git tracks them normally
6. `git status` only examines hydrated/modified files, not the full tree

**Key architectural insight:** VFS for Git's provider was a git-aware process that understood tree objects, blob hashes, and the GVFS protocol. It was not a generic filesystem adapter. The provider logic was tightly coupled to git's object model.

### VFS for Git Is Deprecated

**Verified:** VFS for Git is in maintenance mode (critical security updates only). Microsoft replaced it with Scalar, which uses git sparse-checkout instead of filesystem virtualization. The transition happened because:

1. Apple deprecated the kernel features needed for a macOS port (the Office team needed cross-platform)
2. Sparse-checkout in core git became good enough for most large-repo problems
3. ProjFS virtualization was complex to maintain and had edge cases (ghost files after Windows Updates, unwanted hydration from Explorer)

Scalar is now built into git (v2.38+). It's a thin shell around `git sparse-checkout`, `git maintenance`, and GVFS protocol features. Microsoft's message is clear: they invested in making core git handle large repos rather than maintaining a virtualization layer.

**What this means for ProjFS:** The primary, most complex ProjFS provider ever built has been retired. ProjFS itself is still maintained (it's a Windows component), but its flagship use case moved to a non-ProjFS solution. This is not a signal of ProjFS being broken, but it is a signal that even Microsoft found the virtualization approach too complex relative to alternatives.

---

## Evaluation Against Guild Hall Use Cases

### Use Case 1: Replace Git Worktrees for Branch Isolation

**Current approach:** Each commission/meeting gets its own git worktree with sparse checkout on a dedicated branch. Worktrees are cheap, isolated, and disposable.

**What a ProjFS replacement would require:**
A provider that projects different branch views of the same git repo into separate directory trees. When Commission A accesses `/worktree-a/src/foo.ts`, the provider serves the blob from branch A. When Commission B accesses `/worktree-b/src/foo.ts`, it serves from branch B.

**Why this doesn't work:**

1. **Hydration makes files permanent.** Once Commission A reads `foo.ts`, it's a real file on disk. If Commission A then modifies it, it becomes a "full file" and ProjFS loses control. This is exactly what git worktrees already do, except worktrees do it without a running provider process, without kernel callbacks, and without the hydration state machine.

2. **ProjFS cannot intercept writes.** When a commission writes to a file, ProjFS has no callback. The file just becomes a "full file." The provider gets a post-notification but cannot redirect the write. Git worktrees handle writes natively because each worktree is a real directory with a real index.

3. **No dehydration.** After a commission finishes and its files are hydrated, there's no way to reclaim the disk space without deleting and re-projecting. Worktrees are deleted with `rm -rf`.

4. **The provider must stay running.** A ProjFS provider is a user-mode process. If it crashes or exits, projected files become inaccessible (they show up in enumeration but can't be opened). Git worktrees are static filesystem state that survives process death.

5. **Git still needs a real working directory.** Even if files are projected, `git add`, `git commit`, and `git diff` operate on real files. Git doesn't know about ProjFS states. The moment git touches a file, it hydrates. After hydration, you have... a worktree, but with extra complexity.

**Verdict:** ProjFS adds a provider process, a kernel minifilter, hydration state management, and a crash-sensitivity failure mode, all to arrive at the same end state as `git worktree add`. The complexity is additive, not substitutive.

### Use Case 2: Replace or Improve the Disposable Git P4 Adapter

**Current approach (from brainstorm):** `p4 sync` → adapter creates disposable git repo over P4 workspace → Guild Hall works normally → adapter derives changes and creates P4 shelve.

**What ProjFS could theoretically do:**
Project a virtual view of the P4 workspace files so that git operates on projected files rather than copies. Files would appear present but only hydrate when git or the commission reads them.

**Why this is a poor fit:**

1. **The adapter doesn't copy files.** The brainstorm's `init` step creates a git repo *in the P4 workspace directory*. The `.gitignore` whitelist controls what git tracks. There's no file copying or duplication. ProjFS would be virtualizing access to files that are already present on disk. That's not what ProjFS is for.

2. **P4 files are read-only.** After `p4 sync`, files are read-only. The adapter's `init` step chmod's them writable. ProjFS cannot substitute for this because ProjFS cannot intercept writes. A commission writing to a projected file would still need the underlying file to be writable.

3. **The scope boundary is already solved.** The `.gitignore` whitelist in the brainstorm already limits what git sees. ProjFS projection could do the same thing (only project in-scope files), but `.gitignore` is simpler, understood by every git tool, and doesn't require a running provider.

4. **Hydration defeats the purpose.** If ProjFS projects P4 workspace files and git hydrates them on `git add` or `git status`, the files are now real on disk, which is the same state as having a git repo in the P4 workspace. Zero benefit after the first access.

**Where ProjFS *could* help (a narrow case):** If the P4 workspace is enormous (100GB+) and the git repo's `.gitignore` whitelist is insufficient (e.g., because the in-scope directory also contains large binaries), ProjFS could project only source files into a separate directory and git would operate there. But this is a deployment optimization, not an architectural one, and the `.gitignore` approach is simpler.

**Verdict:** The disposable git approach already avoids the problems ProjFS would solve. Adding ProjFS would introduce a Windows-only runtime dependency (provider process, kernel feature) to optimize a step that takes minutes and happens once per cycle.

### Use Case 3: Provide the Scope Boundary

**Current approach (from brainstorm):** `.gitignore` whitelist (deny everything, permit specific paths).

**What ProjFS could do:** Project only in-scope files into a directory. Git would see exactly the files it should track, no `.gitignore` gymnastics.

**Tradeoffs:**

| | `.gitignore` whitelist | ProjFS projection |
|---|---|---|
| **Complexity** | One file, standard git | Running provider process, kernel feature |
| **Portability** | Any OS | Windows only |
| **Failure mode** | Static; survives reboots | Provider crash = no files visible |
| **Git compatibility** | Native | Git doesn't know about ProjFS states |
| **Maintenance** | Edit a text file | Modify provider code |
| **Parent directory gotcha** | Yes (each parent must be un-ignored) | No (projection is explicit) |

The parent directory gotcha in `.gitignore` is a real annoyance (documented in the brainstorm), but it's a one-time configuration cost, not a recurring operational burden. ProjFS eliminates it at the cost of a dramatically more complex runtime.

**Verdict:** ProjFS is a sledgehammer for a thumbtack problem. The scope boundary is a configuration concern, not a runtime virtualization concern.

---

## Hard Constraints

### Windows Lock-in

ProjFS is Windows-only. There is no Linux or macOS equivalent from Microsoft. GitHub created `libprojfs` (a Linux equivalent) but it was tightly coupled to VFS for Git and appears to have stalled when VFS for Git was deprecated.

Guild Hall currently runs on Windows. But the architecture (Bun, TypeScript, git) is platform-neutral. Using ProjFS would introduce the first hard Windows dependency in the isolation layer. The disposable-git brainstorm explicitly avoids platform-specific code.

### Provider Complexity

Writing a ProjFS provider requires:
- Understanding the file state machine (virtual → placeholder → hydrated → full → tombstone)
- Implementing sorted directory enumeration (ProjFS requires case-insensitive sort order)
- Handling concurrent access from multiple processes (git, editors, the commission's Claude Code process)
- Managing the provider lifecycle (start before work, keep alive during work, clean up after)
- Handling edge cases: Explorer hydrating files on right-click, antivirus scanners triggering hydration, Windows Updates causing ghost files

The ProjFS-Managed-API README notes the API "requires some experience with complex filesystem flows and their callbacks." VFS for Git, the reference provider, was a large C# application with years of development and dedicated engineering support.

### Performance

ProjFS is designed for high-speed backing stores. Its design goal is making remote data appear local with no progress indicators. For Guild Hall's use cases, the backing store would be the local filesystem (git objects or P4 workspace files), so latency wouldn't be an issue. But hydration is one-way: once files are on disk, ProjFS adds no performance benefit. The cost is pure overhead (minifilter in the I/O path for every file operation under the virtualization root).

### Security Surface

ProjFS operates at the user/kernel boundary. CVE-2025-62464 demonstrated that the minifilter's handling of provider callbacks can have security implications. For a development tool, this is manageable. But it's another component in the trust chain that git worktrees don't require.

---

## Third-Party Adoption

**Verified:** Third-party adoption outside Microsoft is minimal.

Known ProjFS users/projects:
- **VFS for Git** (Microsoft, deprecated)
- **ProjFS-SFTP** (GitHub user expeehaa, projects remote SFTP filesystem locally, hobby project)
- **Pavel Yosifovich's Object Manager provider** (tutorial/demo, projects Windows Object Manager as filesystem)
- **Huntress** (security research, explored ProjFS as a canary/detection mechanism)
- **ShellBoost** (commercial SDK, offers ProjFS integration as one of several virtual filesystem options)

**Not using ProjFS:** Most developers building user-mode virtual filesystems on Windows use Dokan (FUSE-like, mature, cross-platform design) or WinFsp (FUSE for Windows, well-maintained). These provide full filesystem semantics including write interception, which ProjFS does not.

The community is small enough that meaningful ProjFS questions on Stack Overflow or GitHub Issues are answered by the same 2-3 Microsoft engineers. This isn't a thriving ecosystem.

---

## Comparison: ProjFS vs. Current Approaches

| Dimension | Git Worktrees (current) | ProjFS Provider | Disposable Git (brainstorm) |
|---|---|---|---|
| **Branch isolation** | Native | Would need to reimplement | Native (real git) |
| **Disk footprint** | Full worktree copy (mitigated by sparse checkout) | Virtual until accessed, then same as worktree | Same as worktree (within `.gitignore` scope) |
| **Running process required** | No | Yes (provider must stay alive) | No |
| **Crash behavior** | Files remain on disk | Files become inaccessible | Files remain on disk |
| **Platform** | Any | Windows only | Any |
| **Git compatibility** | Native | Git unaware of ProjFS states | Native |
| **Complexity** | Low (git built-in) | High (kernel minifilter, state machine, callbacks) | Low (git + shell script) |
| **P4 integration** | N/A | Marginal benefit (files already on disk) | Clean bookend model |
| **Maintenance burden** | None (git upstream) | Provider code + ProjFS feature updates + OS update testing | Adapter CLI (two commands) |

---

## Confidence Levels

**Verified against source code or official documentation:**
- ProjFS API surface, file states, callback model (Microsoft Learn docs, updated March 2025)
- VFS for Git deprecated in favor of Scalar (GitHub repo, Microsoft blog posts)
- ProjFS requires Windows 10 1809+, must be explicitly enabled with admin privileges
- No write interception callback exists (confirmed in ProjFS-Managed-API issue #30)
- Hydration is one-way; no dehydration API
- Managed API targets .NET 8/9/10, actively maintained (NuGet 2.0.0)
- CVE-2025-62464 patched (Windows security update)

**Inferred from architecture and documentation, not tested:**
- A Guild Hall ProjFS provider projecting branch views would arrive at the same disk state as worktrees after hydration
- The disposable-git adapter's `.gitignore` scope boundary is simpler than ProjFS projection for this specific use case
- Provider crash behavior (files inaccessible) based on ProjFS documentation, not tested directly

**Gaps:**
- No first-hand performance benchmarks of ProjFS minifilter overhead on I/O-heavy git operations
- VFS for Git's specific failure modes (ghost files after Windows Updates) could not be independently reproduced; sourced from GitHub issue #70
- libprojfs (GitHub's Linux equivalent) status is unclear; the repo exists but may be unmaintained

---

## Assessment

### Is ProjFS worth pursuing for Guild Hall? No.

ProjFS solves a specific problem well: making a massive remote data store appear as a local filesystem with on-demand materialization. VFS for Git proved this for 270GB git repos. But Guild Hall's isolation needs are different:

- **Branch isolation** is a git concern, not a filesystem concern. ProjFS doesn't understand branches.
- **Scope boundaries** are a configuration concern. `.gitignore` handles it.
- **P4 integration** is a bookend concern. The disposable-git approach keeps P4 at the edges.

Every path to using ProjFS in Guild Hall either arrives at the same end state as the current approach (real files on disk, git operating normally) or requires building a complex provider that reimplements what git already does.

### Is ProjFS a dead end? No, but it's the wrong tool.

ProjFS is maintained, documented, and production-quality. If Guild Hall needed to project data from a remote source into the filesystem (e.g., an S3-backed artifact store that appears as local files), ProjFS would be a reasonable option. But that's not what the isolation layer does.

### Should it be watched? Only for one scenario.

If Guild Hall ever needs to support truly massive P4 workspaces (100GB+ of in-scope source code, not binaries) where even the `.gitignore`-scoped git repo is too large to copy, ProjFS could project only the files a commission actually touches into a lightweight working directory. This is a performance optimization for an extreme scale scenario, not an architectural change. And it would only be relevant on Windows.

That scenario is speculative. The disposable-git brainstorm's scope boundary (`.gitignore` whitelist) is designed to prevent exactly this problem by keeping the in-scope set small.

---

## References

- [ProjFS Official Documentation (Microsoft Learn)](https://learn.microsoft.com/en-us/windows/win32/projfs/projected-file-system)
- [ProjFS Programming Guide](https://learn.microsoft.com/en-us/windows/win32/projfs/projfs-programming-guide)
- [ProjFS Provider Overview](https://learn.microsoft.com/en-us/windows/win32/projfs/provider-overview)
- [ProjFS API Reference](https://learn.microsoft.com/en-us/windows/win32/api/_projfs/)
- [ProjFS-Managed-API (GitHub)](https://github.com/microsoft/ProjFS-Managed-API)
- [Microsoft.Windows.ProjFS NuGet Package v2.0.0](https://www.nuget.org/packages/Microsoft.Windows.ProjFS)
- [VFS for Git (GitHub, maintenance mode)](https://github.com/microsoft/VFSForGit)
- [The Story of Scalar (GitHub Blog)](https://github.blog/open-source/git/the-story-of-scalar/)
- [Scalar Repository (GitHub)](https://github.com/microsoft/scalar)
- [VFS for Git Wikipedia](https://en.wikipedia.org/wiki/Virtual_File_System_for_Git)
- [Introducing Scalar (Azure DevOps Blog)](https://devblogs.microsoft.com/devops/introducing-scalar/)
- [ProjFS Internals Deep Dive (Huntress, Feb 2025)](https://www.huntress.com/blog/windows-projected-file-system-mechanics)
- [Pavel Yosifovich ProjFS Tutorial](https://scorpiosoftware.net/2024/02/20/projected-file-system/)
- [ProjFS-SFTP (GitHub)](https://github.com/expeehaa/ProjFS-SFTP)
- [WinVFS Sample Provider (GitHub)](https://github.com/erikmav/WinVFS)
- [ProjFS Write Interception Limitation (Issue #30)](https://github.com/microsoft/ProjFS-Managed-API/issues/30)
- [ProjFS Ghost Files After Updates (Issue #70)](https://github.com/microsoft/ProjFS-Managed-API/issues/70)
- [CVE-2025-62464 (ProjFS Privilege Escalation)](https://windowsforum.com/threads/cve-2025-62464-windows-projfs-local-privilege-escalation-and-patch-guide.393138/)
- [libprojfs (GitHub's Linux ProjFS equivalent)](https://github.com/github/libprojfs)
- [Dokan/Dokany (FUSE for Windows)](https://github.com/dokan-dev/dokany)
