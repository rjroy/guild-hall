---
title: Meeting infrastructure convergence
date: 2026-03-02
status: resolved
tags: [architecture, meetings, refactor, infrastructure, convergence]
modules: [meeting-session, meeting-handlers, meeting-artifact-helpers, activity-state-machine, workspace]
related:
  - .lore/specs/commission-layer-separation.md
  - .lore/specs/guild-hall-meetings.md
  - daemon/lib/activity-state-machine.ts
  - daemon/services/meeting-session.ts
  - daemon/services/meeting-handlers.ts
  - daemon/services/meeting-artifact-helpers.ts
---

# Brainstorm: Meeting Infrastructure Convergence

## Context

After the commission layer separation, the commission and meeting systems do many of the same things in different ways. The meeting code predates the commission refactor and still uses the monolithic pattern: ActivityMachine with enter/exit handlers that mix state transitions with git operations, artifact writes, and session management.

The problem isn't that meetings need five layers. It's that both systems implement the same plumbing (artifact I/O, workspace lifecycle, merge conflict escalation, state file management) independently. Meetings should converge on the infrastructure commissions already got right, without being forced into a structural pattern that doesn't fit.

## Ideas Explored

### The ActivityMachine is overkill for meetings

Meeting runtime states are really just "active or not." The full state picture:

- **requested**: artifact on disk. No worktree, no session, no daemon tracking. The daemon doesn't know about it until the user acts.
- **open**: the only state with runtime resources. Worktree exists, SDK session running, user interacting.
- **closed**: terminal. Worktree merged and removed, session aborted, state file deleted.
- **declined**: terminal. Nothing was ever provisioned. Just a status write to disk.

The runtime lifecycle is **open -> closed**. "Requested" and "declined" are artifact statuses, not runtime states.

The ActivityMachine provides 11-step transition execution, re-entrant transition detection, per-entry promise-chain locking, cleanup state classification, and enter/exit handler orchestration. Meetings use this for what amounts to "is there an active session or not."

**Replace with an active session registry:**

- `open(id, entry)`: provision worktree, start session, add to registry
- `close(id)`: generate notes, merge, cleanup, remove from registry
- `get(id)` / `has(id)`: lookup

Artifact status writes (requested, open, closed, declined) happen through the shared record layer as part of these operations. No state machine ceremony.

"Requested -> open" becomes: read artifact, verify status, provision workspace, write "open", register. A function, not a state transition.

"Requested -> declined" becomes: read artifact, verify status, write "declined". Registry not involved.

### Converge the infrastructure, keep orchestrators separate (Option 1)

Instead of applying the five-layer pattern to meetings, extract shared infrastructure:

1. **Shared artifact I/O**: Commission `record.ts` has the raw-byte-preservation technique for YAML frontmatter. Meeting `meeting-artifact-helpers.ts` does similar work with different function signatures. Converge to one implementation.

2. **Shared workspace**: Already extracted to `workspace.ts` for commissions. Meeting handlers still inline branch creation, worktree setup, sparse checkout, and squash-merge in enter-open/enter-closed. Meetings should use workspace.ts.

3. **Shared merge conflict escalation**: Both escalate to Guild Master. Two implementations.

4. **Shared state file management**: Both write recovery state to `~/.guild-hall/state/`. Different formats, different cleanup paths.

5. **Simple meeting lifecycle**: Replace ActivityMachine usage with an active session registry. The meeting orchestrator (currently `meeting-session.ts`) becomes cleaner without state machine routing.

### What's legitimately different (leave separate)

- **Session model**: Fire-and-forget (commissions) vs multi-turn with resume/renewal/transcript (meetings). This should be different.
- **Signal contract**: Commissions need in-progress signals because the executor runs unattended. Meetings don't; the user is present.
- **Toolbox shape**: Commission tools report through signals. Meeting tools write directly to artifacts.
- **State graph complexity**: 8 states with dependency tracking (commissions) vs active/not-active (meetings).

### Why not the full five-layer pattern for meetings?

Considered and rejected for now. The five-layer pattern solved a specific problem in commissions: the executor (Layers 3+4) was entangled with the lifecycle (Layer 2) through shared structs and direct artifact writes. The hard boundary (executor never writes artifacts) was the key insight.

Meetings don't have that problem. There's no unattended executor. The user drives the session. The artifact writes happen at well-defined moments (open, close, tool calls). The entanglement in meeting code is with shared infrastructure, not with layer boundaries.

If a sharp edge remains after infrastructure convergence, a meeting-specific decomposition can follow. But it would be shaped by meetings' actual needs, not by mirroring commissions.

## Open Questions

- What does the shared artifact I/O layer look like? Is it generic enough to serve both commission and meeting frontmatter formats, or is it a shared utility with format-specific wrappers?
- Does `workspace.ts` need changes to serve meetings, or can meetings just call it as-is?
- The ActiveMeetingEntry struct mixes identity and runtime state (same problem commissions had with ActiveCommissionEntry). Does convergence naturally split this, or is it a separate concern?
- Recovery: meetings currently use `registerActive()` on the ActivityMachine for crash recovery. An active session registry needs its own recovery story. Simpler (scan state files, re-register open meetings) but needs explicit design.
- What happens to the ActivityMachine after meetings stop using it? Dead code, or does something else need it?

## Next Steps

Spec the infrastructure convergence: shared record ops, meeting workspace migration, active session registry replacing ActivityMachine for meetings. Keep the scope tight: converge plumbing, simplify meeting lifecycle, don't restructure what doesn't need it.
