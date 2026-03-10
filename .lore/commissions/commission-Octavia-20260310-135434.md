---
title: "Commission: Brainstorm sandbox integration for Guild Hall workers"
date: 2026-03-10
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Brainstorm how sandboxed execution environments could be integrated into Guild Hall to eliminate risk from workers with Bash access (currently Dalton, Sable, and Octavia herself).\n\n**Context:** Guild Hall runs commission and meeting sessions via the Claude Agent SDK. Workers like Dalton (developer) and Sable (test engineer) have Bash tool access and execute in git worktrees. Currently the system relies on constrained prompts and git isolation to limit blast radius, but there's no hard sandbox boundary. The user wants zero failure chance, not \"probably fine.\"\n\n**Research input:** Read the completed research commission from Verity at `.lore/commissions/commission-Verity-20260310-124605.md` for findings on Claude Agent SDK sandbox capabilities.\n\n**Brainstorm these dimensions:**\n\n1. **Where sandboxes fit in the architecture** — Which sessions need sandboxing? All commissions? Only Bash-capable workers? Meetings too? What about the Guild Master?\n\n2. **Integration points** — The daemon creates SDK sessions in `daemon/services/commission/` (Layer 3: session) and `daemon/services/meeting/`. Where would sandbox configuration be injected? What changes to the session preparation pipeline?\n\n3. **What sandboxes protect against** — Enumerate the actual risks: accidental `rm -rf`, writing outside worktree, installing system packages, network access to internal services, reading secrets from the host filesystem. Be specific about what's currently unprotected.\n\n4. **Trade-offs and constraints** — Performance overhead, platform requirements (Docker? Firecracker?), development vs production differences, impact on the existing DI/testing patterns, git worktree access from inside a sandbox.\n\n5. **Incremental adoption path** — How could this be rolled out without rewriting the session infrastructure? What's the minimum viable sandbox that reduces risk meaningfully?\n\n6. **Open questions** — What do we not yet know that would block implementation?\n\nOutput a brainstorm artifact to `.lore/brainstorm/`. This is exploratory — capture possibilities and trade-offs, don't converge on a solution."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-10T20:54:34.960Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T20:54:34.961Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
