---
title: Remove ActivityMachine and dead code
date: 2026-03-02
status: pending
tags: [task]
source: .lore/plans/meeting-infrastructure-convergence.md
related: [.lore/specs/meeting-infrastructure-convergence.md]
sequence: 9
modules: [activity-state-machine, meeting-handlers]
---

# Task: Remove ActivityMachine and dead code

## What

**Delete files:**
- `daemon/lib/activity-state-machine.ts` (472 lines)
- `daemon/services/meeting-handlers.ts` (602 lines)
- `daemon/services/meeting-session.ts` (if still present after task 006 rename)
- `daemon/services/meeting-artifact-helpers.ts` (if still present after task 003 rename)
- `tests/daemon/lib/activity-state-machine.test.ts`
- `tests/daemon/services/meeting-handlers.test.ts`

**Remove types:** `ActivityMachine`, `ActivityMachineConfig`, `TransitionContext`, `TransitionResult`, `EnterHandler`, `ExitHandler`, `EnterHandlerResult`, `ArtifactOps`, `CleanupEvent`, `CleanupHook`. Remove any re-exports from index files.

**Grep verification.** Search the entire codebase for remaining references to:
- `activity-state-machine`
- `meeting-handlers`
- `meeting-session` (old path)
- `meeting-artifact-helpers` (old path)
- `ActivityMachine`, `TransitionContext`, `EnterHandler`, `ExitHandler`
- `ArtifactOps`, `ActivityMachineConfig`, `CleanupHook`, `CleanupEvent`, `EnterHandlerResult`
- `notes_summary` (final sweep)

Any remaining references are broken imports or stale comments that need removal. The in-process commission retro warns: stale references in tool descriptions, log messages, and comments survive type-checking. Check those too.

**Archive documents:**
- Move `.lore/specs/activity-state-machine.md` to `.lore/_archive/specs/activity-state-machine.md`
- Move `.lore/design/activity-state-machine.md` to `.lore/_archive/design/activity-state-machine.md`

## Validation

- `daemon/lib/activity-state-machine.ts` does not exist.
- `daemon/services/meeting-handlers.ts` does not exist.
- `daemon/services/meeting-session.ts` does not exist.
- `daemon/services/meeting-artifact-helpers.ts` does not exist.
- `tests/daemon/lib/activity-state-machine.test.ts` does not exist.
- `tests/daemon/services/meeting-handlers.test.ts` does not exist.
- Grep for all listed type names returns zero hits across the codebase (excluding `.lore/_archive/`).
- `.lore/_archive/specs/activity-state-machine.md` exists.
- `.lore/_archive/design/activity-state-machine.md` exists.
- Full test suite passes: `bun test` with zero failures.

## Why

From `.lore/specs/meeting-infrastructure-convergence.md`:
- REQ-MIC-16: "The ActivityMachine class and its associated types are removed."
- REQ-MIC-17: "The meeting-handlers.ts file is removed."
- REQ-MIC-18: "The activity-state-machine spec and design documents are moved to the archive."

## Files

- `daemon/lib/activity-state-machine.ts` (delete)
- `daemon/services/meeting-handlers.ts` (delete)
- `daemon/services/meeting-session.ts` (delete if present)
- `daemon/services/meeting-artifact-helpers.ts` (delete if present)
- `tests/daemon/lib/activity-state-machine.test.ts` (delete)
- `tests/daemon/services/meeting-handlers.test.ts` (delete)
- `.lore/specs/activity-state-machine.md` (move to archive)
- `.lore/design/activity-state-machine.md` (move to archive)
