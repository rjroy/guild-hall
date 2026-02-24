---
title: Dependency Auto-Transitions
date: 2026-02-23
status: complete
tags: [task]
source: .lore/plans/phase-7-hardening.md
related: [.lore/specs/guild-hall-commissions.md]
sequence: 4
modules: [guild-hall-core]
---

# Task: Dependency Auto-Transitions

## What

Implement `checkDependencyTransitions(projectName, deps)` in `daemon/services/commission-session.ts` (or a new helper in `daemon/services/commission-artifact-helpers.ts`).

The function:
1. Scans all commission artifacts for the project from the integration worktree.
2. For each `blocked` commission: checks if all dependency artifact paths exist in the integration worktree. If yes, transitions to `pending`.
3. For each `pending` commission: checks if any dependency artifact was removed. If yes, transitions to `blocked`.
4. Emits `commission_status` events for each transition.
5. After transitioning `blocked -> pending`, triggers the FIFO auto-dispatch check from task 002 (the newly-pending commission might be dispatchable).

This is existence checking only ("does the file exist at this path?"). Use `fs.existsSync` or equivalent against the integration worktree path for each dependency.

**Trigger points** (call `checkDependencyTransitions()` after):
- Squash-merge completes (commission close, meeting close): artifacts appeared on `claude` branch.
- Artifact write via the editing API (`PUT /api/artifacts`).
- Commission failure/cancellation (if cleanup removes artifacts).

## Validation

- Blocked commission with all dependencies now present: auto-transitions to `pending`, `commission_status` event emitted.
- Pending commission with a dependency removed: auto-transitions to `blocked`, `commission_status` event emitted.
- Blocked-to-pending transition triggers FIFO auto-dispatch check (commission dispatches if capacity available).
- Commission with no dependencies: never transitions to `blocked`, stays in its current state.
- Dependency checking uses integration worktree path, not activity worktree.
- Trigger points fire correctly: after squash-merge, after artifact edit API, after commission failure.
- Unit tests with temp directories and mocked commission artifacts covering: all-deps-satisfied transition, missing-dep transition, no-deps case, FIFO dispatch trigger.

## Why

From `.lore/specs/guild-hall-commissions.md`:
- REQ-COM-7: "Dependency checking runs when artifacts are created or removed in the workspace. When all of a blocked commission's dependency artifacts exist, it auto-transitions to pending. When a pending commission loses a dependency artifact, it auto-transitions to blocked. This is existence checking ('does the file exist?'), not content validation."

## Files

- `daemon/services/commission-session.ts` (modify: add `checkDependencyTransitions()`)
- `daemon/services/commission-artifact-helpers.ts` (modify: helper for dependency path resolution)
- `daemon/routes/commissions.ts` (modify: trigger after squash-merge and failure)
- `app/api/artifacts/route.ts` (modify: trigger after artifact write)
- `tests/daemon/dependency-auto-transitions.test.ts` (create)
