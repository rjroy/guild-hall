---
title: "Commission: Research: Windows ProjFS as alternative to git worktrees and disposable git P4 adapter"
date: 2026-03-25
status: completed
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research **Windows Projected File System (ProjFS)** and evaluate whether it could serve as an alternative isolation mechanism for Guild Hall, replacing or complementing git worktrees.\n\n**Context you need to read first:**\n- `.lore/brainstorm/disposable-local-git-p4.md` — the current approach for P4 integration (disposable local git as isolation layer)\n- `.lore/research/perforce-isolation-models.md` — prior research on P4 isolation approaches\n\n**What ProjFS is (starting point):**\nWindows ProjFS (also called Windows Projection File System) is a Windows API that lets a provider project a virtual filesystem that appears as real files/directories to applications. Files are materialized on demand. Microsoft uses this in VFS for Git (formerly GVFS) to handle massive repos like the Windows OS repo.\n\n**Research questions:**\n\n1. **What is ProjFS exactly?** API surface, capabilities, maturity, Windows version requirements. Is it a stable, documented, production-ready API? What's the current state (is Microsoft still investing in it)?\n\n2. **How does VFS for Git use ProjFS?** This is the reference implementation. What problems does it solve? How does it handle materialization, hydration, and write-back? What are its limitations?\n\n3. **Could ProjFS replace git worktrees for Guild Hall isolation?** Currently Guild Hall uses git worktrees (one per commission/meeting) for branch isolation. Could a ProjFS provider project different branch views without creating full worktree copies? What would the provider need to do? What are the constraints?\n\n4. **Could ProjFS replace or improve the disposable git P4 adapter?** The brainstorm describes creating a disposable git repo over a P4 workspace. Could ProjFS project a virtual view of the P4 workspace that git operates on, avoiding the copy/chmod/reconcile dance? Or does it solve a different problem entirely?\n\n5. **Could ProjFS provide the scope boundary?** The brainstorm describes a `.gitignore` whitelist to limit what git tracks. Could ProjFS project only the in-scope files, making the boundary invisible to git?\n\n6. **What are the hard constraints?** Windows-only (Guild Hall currently runs on Windows but should it be locked in?). Performance characteristics. Complexity of writing a ProjFS provider. Any known gotchas from VFS for Git's experience.\n\n7. **Is anyone else using ProjFS outside of Microsoft?** Third-party adoption, open-source providers, community health.\n\n**What I need from you:**\nA research artifact in `.lore/research/` that maps the ProjFS landscape, evaluates it against Guild Hall's specific isolation needs (both git worktree replacement and P4 adapter alternative), and gives a clear recommendation on whether this is worth pursuing, a dead end, or something to watch. Be honest about gaps — if the documentation is thin or the API is abandoned, say so."
dependencies: []
linked_artifacts:
  - .lore/research/windows-projfs-evaluation.md

activity_timeline:
  - timestamp: 2026-03-25T16:15:22.744Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-25T16:15:22.749Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-25T16:15:27.336Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-25T16:15:41.593Z
    event: progress_report
    reason: "Starting research. Reading existing context documents (disposable-local-git-p4.md brainstorm and perforce-isolation-models.md research), then will conduct external research on ProjFS."
  - timestamp: 2026-03-25T16:17:03.842Z
    event: progress_report
    reason: "External research complete. Gathered ProjFS API surface, VFS for Git architecture and deprecation, Scalar replacement, third-party adoption landscape, implementation gotchas, and security concerns. Now synthesizing findings into research artifact."
  - timestamp: 2026-03-25T16:19:50.972Z
    event: result_submitted
    reason: "Completed ProjFS research and evaluation. The artifact at `.lore/research/windows-projfs-evaluation.md` covers all seven research questions.\n\n**Bottom line:** ProjFS is a real, maintained, production-quality Windows API, but it's the wrong tool for Guild Hall's isolation needs. Three key findings:\n\n1. **Cannot replace git worktrees.** ProjFS hydration is one-way (files become real on first read), there's no write interception, and the provider must stay running. After git touches projected files, you end up with the same disk state as a worktree but with a kernel minifilter and provider process in the loop. Complexity is additive, not substitutive.\n\n2. **Cannot improve the disposable-git P4 adapter.** The brainstorm's approach already avoids file duplication (git repo lives in the P4 workspace directory). ProjFS would virtualize access to files that are already on disk. The `.gitignore` whitelist handles scope boundaries more simply than filesystem projection.\n\n3. **Even Microsoft moved away from ProjFS for git.** VFS for Git (the flagship ProjFS provider) is deprecated. Microsoft replaced it with Scalar, which uses sparse-checkout instead of filesystem virtualization. The signal: even with dedicated engineering, the virtualization approach was too complex relative to simpler alternatives.\n\nThe one speculative scenario where ProjFS could matter: truly massive in-scope source trees (100GB+) where even scoped git is too large. The `.gitignore` whitelist is designed to prevent that scenario. Not worth pursuing now; only worth watching if scale demands it."
  - timestamp: 2026-03-25T16:19:56.705Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "External research complete. Gathered ProjFS API surface, VFS for Git architecture and deprecation, Scalar replacement, third-party adoption landscape, implementation gotchas, and security concerns. Now synthesizing findings into research artifact."
projectName: guild-hall
---
Completed ProjFS research and evaluation. The artifact at `.lore/research/windows-projfs-evaluation.md` covers all seven research questions.

**Bottom line:** ProjFS is a real, maintained, production-quality Windows API, but it's the wrong tool for Guild Hall's isolation needs. Three key findings:

1. **Cannot replace git worktrees.** ProjFS hydration is one-way (files become real on first read), there's no write interception, and the provider must stay running. After git touches projected files, you end up with the same disk state as a worktree but with a kernel minifilter and provider process in the loop. Complexity is additive, not substitutive.

2. **Cannot improve the disposable-git P4 adapter.** The brainstorm's approach already avoids file duplication (git repo lives in the P4 workspace directory). ProjFS would virtualize access to files that are already on disk. The `.gitignore` whitelist handles scope boundaries more simply than filesystem projection.

3. **Even Microsoft moved away from ProjFS for git.** VFS for Git (the flagship ProjFS provider) is deprecated. Microsoft replaced it with Scalar, which uses sparse-checkout instead of filesystem virtualization. The signal: even with dedicated engineering, the virtualization approach was too complex relative to simpler alternatives.

The one speculative scenario where ProjFS could matter: truly massive in-scope source trees (100GB+) where even scoped git is too large. The `.gitignore` whitelist is designed to prevent that scenario. Not worth pursuing now; only worth watching if scale demands it.
