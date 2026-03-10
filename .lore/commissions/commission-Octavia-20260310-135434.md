---
title: "Commission: Brainstorm sandbox integration for Guild Hall workers"
date: 2026-03-10
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Brainstorm how sandboxed execution environments could be integrated into Guild Hall to eliminate risk from workers with Bash access (currently Dalton, Sable, and Octavia herself).\n\n**Context:** Guild Hall runs commission and meeting sessions via the Claude Agent SDK. Workers like Dalton (developer) and Sable (test engineer) have Bash tool access and execute in git worktrees. Currently the system relies on constrained prompts and git isolation to limit blast radius, but there's no hard sandbox boundary. The user wants zero failure chance, not \"probably fine.\"\n\n**Research input:** Read the completed research commission from Verity at `.lore/commissions/commission-Verity-20260310-124605.md` for findings on Claude Agent SDK sandbox capabilities.\n\n**Brainstorm these dimensions:**\n\n1. **Where sandboxes fit in the architecture** — Which sessions need sandboxing? All commissions? Only Bash-capable workers? Meetings too? What about the Guild Master?\n\n2. **Integration points** — The daemon creates SDK sessions in `daemon/services/commission/` (Layer 3: session) and `daemon/services/meeting/`. Where would sandbox configuration be injected? What changes to the session preparation pipeline?\n\n3. **What sandboxes protect against** — Enumerate the actual risks: accidental `rm -rf`, writing outside worktree, installing system packages, network access to internal services, reading secrets from the host filesystem. Be specific about what's currently unprotected.\n\n4. **Trade-offs and constraints** — Performance overhead, platform requirements (Docker? Firecracker?), development vs production differences, impact on the existing DI/testing patterns, git worktree access from inside a sandbox.\n\n5. **Incremental adoption path** — How could this be rolled out without rewriting the session infrastructure? What's the minimum viable sandbox that reduces risk meaningfully?\n\n6. **Open questions** — What do we not yet know that would block implementation?\n\nOutput a brainstorm artifact to `.lore/brainstorm/`. This is exploratory — capture possibilities and trade-offs, don't converge on a solution."
dependencies: []
linked_artifacts:
  - .lore/brainstorm/sandboxed-execution.md

activity_timeline:
  - timestamp: 2026-03-10T20:54:34.960Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T20:54:34.961Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-10T20:54:34.997Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-10T20:54:43.861Z
    event: progress_report
    reason: "Starting brainstorm on sandboxed execution environments. Reading Verity's research findings and the session infrastructure code."
  - timestamp: 2026-03-10T20:56:21.852Z
    event: progress_report
    reason: "Research phase complete. Read Verity's sandbox research, the SDK runner, commission orchestrator, meeting orchestrator, and worker tool declarations. Now have full picture of the architecture. Beginning brainstorm artifact draft."
  - timestamp: 2026-03-10T20:59:10.941Z
    event: progress_report
    reason: "Brainstorm artifact written to .lore/brainstorm/sandboxed-execution.md. Covers all six requested dimensions: where sandboxes fit, integration points, risk enumeration, trade-offs, incremental adoption path, and open questions. Preparing to submit result."
  - timestamp: 2026-03-10T20:59:28.801Z
    event: result_submitted
    reason: "Created brainstorm artifact at `.lore/brainstorm/sandboxed-execution.md` covering sandboxed execution environments for Guild Hall worker sessions.\n\n**Key findings across six dimensions:**\n\n1. **Where sandboxes fit:** Bash-capable commission workers (Dalton, Sable) are the primary candidates. Commissions are higher risk than meetings because they're unsupervised. Non-Bash workers have a smaller but real attack surface through Write/Edit/Read tools that the SDK sandbox doesn't cover.\n\n2. **Integration points:** The SDK sandbox injects at `prepareSdkSession` (sdk-runner.ts:384-398) as a new `sandbox` field on `SdkQueryOptions`. For Bash-capable workers, this is a configuration change. Container isolation would be a deeper architectural change affecting how the daemon spawns sessions and how EventBus communication works.\n\n3. **Risk enumeration:** Documented 7 specific risk categories (filesystem destruction, secret reading, writing outside worktree, network access, process modification, git corruption) with which tools enable each and what the SDK sandbox does/doesn't cover. The critical gap: SDK sandbox only covers Bash. Read/Write/Edit need separate enforcement via `canUseTool` or settings-based permission rules.\n\n4. **Trade-offs:** bubblewrap overhead is negligible, Docker is acceptable, gVisor's I/O overhead (10-200x) is problematic for build-heavy workers. Platform dependency on bubblewrap+socat is manageable. Git worktree symlinks and nested sandbox in Docker are the trickiest constraints.\n\n5. **Incremental adoption path:** Four phases. Phase 1 (SDK sandbox for Bash workers) is small effort, no breaking changes, eliminates catastrophic failures. Phase 2 (canUseTool for non-Bash tools) covers the full tool surface. Phase 3 (network restrictions) prevents exfiltration. Phase 4 (container isolation) is the heavy lift, only needed if OS-level sandbox is insufficient.\n\n6. **Open questions:** 8 specific blockers identified, including whether filesystem restrictions can be set programmatically, what canUseTool receives as arguments, sandbox interaction with plugins/MCP, and git worktree symlink handling."
  - timestamp: 2026-03-10T20:59:36.132Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Brainstorm artifact written to .lore/brainstorm/sandboxed-execution.md. Covers all six requested dimensions: where sandboxes fit, integration points, risk enumeration, trade-offs, incremental adoption path, and open questions. Preparing to submit result."
projectName: guild-hall
---
Created brainstorm artifact at `.lore/brainstorm/sandboxed-execution.md` covering sandboxed execution environments for Guild Hall worker sessions.

**Key findings across six dimensions:**

1. **Where sandboxes fit:** Bash-capable commission workers (Dalton, Sable) are the primary candidates. Commissions are higher risk than meetings because they're unsupervised. Non-Bash workers have a smaller but real attack surface through Write/Edit/Read tools that the SDK sandbox doesn't cover.

2. **Integration points:** The SDK sandbox injects at `prepareSdkSession` (sdk-runner.ts:384-398) as a new `sandbox` field on `SdkQueryOptions`. For Bash-capable workers, this is a configuration change. Container isolation would be a deeper architectural change affecting how the daemon spawns sessions and how EventBus communication works.

3. **Risk enumeration:** Documented 7 specific risk categories (filesystem destruction, secret reading, writing outside worktree, network access, process modification, git corruption) with which tools enable each and what the SDK sandbox does/doesn't cover. The critical gap: SDK sandbox only covers Bash. Read/Write/Edit need separate enforcement via `canUseTool` or settings-based permission rules.

4. **Trade-offs:** bubblewrap overhead is negligible, Docker is acceptable, gVisor's I/O overhead (10-200x) is problematic for build-heavy workers. Platform dependency on bubblewrap+socat is manageable. Git worktree symlinks and nested sandbox in Docker are the trickiest constraints.

5. **Incremental adoption path:** Four phases. Phase 1 (SDK sandbox for Bash workers) is small effort, no breaking changes, eliminates catastrophic failures. Phase 2 (canUseTool for non-Bash tools) covers the full tool surface. Phase 3 (network restrictions) prevents exfiltration. Phase 4 (container isolation) is the heavy lift, only needed if OS-level sandbox is insufficient.

6. **Open questions:** 8 specific blockers identified, including whether filesystem restrictions can be set programmatically, what canUseTool receives as arguments, sandbox interaction with plugins/MCP, and git worktree symlink handling.
