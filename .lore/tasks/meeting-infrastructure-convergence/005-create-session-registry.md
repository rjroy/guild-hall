---
title: Create active session registry
date: 2026-03-02
status: pending
tags: [task]
source: .lore/plans/meeting-infrastructure-convergence.md
related: [.lore/specs/meeting-infrastructure-convergence.md]
sequence: 5
modules: [meeting-registry]
---

# Task: Create active session registry

## What

Create `daemon/services/meeting/registry.ts` exporting a `MeetingRegistry` class and the `ActiveMeetingEntry` type.

**ActiveMeetingEntry type:** Relocated from `daemon/services/meeting-handlers.ts`. Contains: `meetingId`, `projectName`, `workerName`, `packageName`, `sdkSessionId`, `worktreeDir`, `branchName`, `abortController`, `status`. Co-located with the registry because the registry is the sole owner of these entries at runtime.

**Data structure:** Internal `Map<MeetingId, ActiveMeetingEntry>` plus a `Set<MeetingId>` for the concurrent close guard.

**Operations:**
- `register(id, entry)` -- Add to map. Throws if ID already registered.
- `deregister(id)` -- Remove from map, clear close-in-progress flag. No-op if not registered (idempotent).
- `get(id)` -- Look up by ID. Returns undefined if not found.
- `has(id)` -- Check if registered.
- `countForProject(projectName)` -- Count active meetings for a project.
- `listForProject(projectName)` -- List active meetings for a project.

**Concurrent close guard:**
- `acquireClose(id)` -- Returns true if close acquired (no close in progress). Returns false if close already in progress. Adds to set on success.
- `releaseClose(id)` -- Removes from set. Also called by `deregister` for safety.

The registry is NOT a state machine. No transition graph, no handler dispatch, no ArtifactOps callbacks, no cleanup hooks, no per-entry promise-chain locking.

**Note:** This task creates the registry and its type definition. `meeting-handlers.ts` still has its own copy of `ActiveMeetingEntry` at this point. The old copy is removed in task 009 when meeting-handlers.ts is deleted. The orchestrator rewrite (task 006) imports from the new location.

After implementation, run `type-design-analyzer` agent to verify the registry's type design doesn't leak state machine semantics.

## Validation

- `MeetingRegistry` class exists at `daemon/services/meeting/registry.ts`.
- `ActiveMeetingEntry` type is exported from the same file.
- `register` throws on duplicate ID.
- `deregister` is idempotent (no error on double-deregister).
- `countForProject` only counts entries matching the specified project.
- `listForProject` returns entries only for the specified project.
- `acquireClose` returns false on second call for same ID (rejects concurrent close).
- `releaseClose` clears the flag so a subsequent `acquireClose` succeeds.
- `deregister` clears any close-in-progress flag for the deregistered entry.
- No methods named `transition`, `inject`, `onCleanup`, or anything resembling state machine operations.
- Unit tests in `tests/daemon/services/meeting/registry.test.ts`.

## Why

From `.lore/specs/meeting-infrastructure-convergence.md`:
- REQ-MIC-7: "The ActivityMachine is replaced for meetings with an active session registry."
- REQ-MIC-8: "The registry provides these operations: Register, Deregister, Look up, Check active, Count, List."
- REQ-MIC-9: "The registry provides a concurrent close guard."
- REQ-MIC-10: "Cap enforcement uses the registry's count."

## Files

- `daemon/services/meeting/registry.ts` (create)
- `tests/daemon/services/meeting/registry.test.ts` (create)
