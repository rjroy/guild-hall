---
title: "Commission: Research: Guild Hall worktree flow in Perforce environments"
date: 2026-03-23
status: dispatched
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research how Guild Hall's git-based isolation model could work in a Perforce (P4) environment. The user works at a large game studio using Perforce and cannot dictate anything to P4 admins.\n\n## Context\n\nGuild Hall uses a three-tier git branch strategy for isolation:\n- `master` (protected) / `claude` (integration) / activity branches (per-commission, per-meeting)\n- Each active session gets its own git worktree with sparse checkout\n- Worktrees are cheap, isolated, and disposable\n- `daemon/lib/git.ts` owns all git operations\n- `daemon/services/git-admin.ts` handles rebase/sync\n\nKey properties this provides:\n1. **Isolation**: Each commission/meeting works in its own directory without affecting others\n2. **Cheap branching**: Creating a branch + worktree is near-instant\n3. **Sparse checkout**: Workers only see files relevant to their task\n4. **Integration flow**: Work merges up through branches (activity → claude → master)\n5. **Rollback**: Easy to discard failed work (delete branch + worktree)\n6. **Parallel work**: Multiple commissions run simultaneously in separate worktrees\n\n## Research Questions\n\n1. **Git-on-Perforce layering**: Can `git-p4` or similar tools provide a local git layer over a Perforce depot? What are the limitations? Does this preserve the worktree model? What about submitting changes back to P4?\n\n2. **Native Perforce approaches**: P4 has workspaces, streams, shelves, and changelists. Could any combination approximate the isolation model? Specifically:\n   - Can multiple P4 workspaces serve as \"worktrees\"?\n   - Can P4 streams approximate the branch strategy?\n   - Can shelved changelists serve as the integration layer?\n   - What are the costs (disk, server load, admin permissions needed)?\n\n3. **Hybrid approaches**: Are there other tools or patterns (e.g., P4 virtual streams, task streams, git-fusion) that bridge the gap?\n\n4. **Constraint: No admin access**: The user cannot request P4 admin changes. What can a regular P4 user do unilaterally? Can they create workspaces, streams, shelves without admin help?\n\n5. **Feasibility assessment**: For each viable approach, assess:\n   - How close it gets to the current worktree model\n   - What Guild Hall code would need to change\n   - What limitations or compromises exist\n   - Performance characteristics (P4 repos at game studios are massive, often 100GB+)\n\nWrite findings to `.lore/research/perforce-isolation-models.md` with clear sections for each approach, a comparison matrix, and a recommendation."
dependencies: []
linked_artifacts: []

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-23T04:57:12.066Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-23T04:57:12.069Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
