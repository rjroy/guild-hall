---
title: Memory Access Control
date: 2026-02-23
status: complete
tags: [task]
source: .lore/plans/foundation/phase-7-hardening.md
related: [.lore/specs/guild-hall-system.md]
sequence: 5
modules: [guild-hall-core]
---

# Task: Memory Access Control

## What

Enforce memory scope ownership rules so worker memory is private to its owner.

**Prerequisite plumbing** (propagate identity into base toolbox):
1. Add `workerName: string` and `projectName: string` to `BaseToolboxDeps`.
2. In `toolbox-resolver.ts` `resolveToolSet()`, pass `context.workerName` and extract project name from `context.projectPath` when calling `createBaseToolbox()`.
3. Propagate `workerName` and `projectName` into the `makeReadMemoryHandler` and `makeWriteMemoryHandler` factories.

**Enforce ownership** (modify `daemon/services/base-toolbox.ts`):
4. For `scope: "worker"`: The tool currently accepts an arbitrary worker name in the path. Change this so the tool always uses the current worker's name from `deps.workerName`. A worker cannot specify a different worker name.
5. For `scope: "project"`: Use `deps.projectName` to resolve the project memory path. Fix the "unknown" fallback (line 50) so project scope always targets the correct project.
6. For `scope: "global"`: No change. Any worker can read/write global memory.
7. Remove the `workerName` parameter from the worker scope tool input schema. The scope is implicit from the activation context.

Update tool descriptions so workers understand the access model: worker scope reads/writes their own memory only, project scope targets the active project, global scope is shared.

This is a behavioral change to existing tools. Run existing memory tool tests before and after to verify nothing breaks unexpectedly.

## Validation

- Worker A reads worker scope: reads from `~/.guild-hall/memory/workers/A/`, not a user-specified path.
- Worker A cannot read Worker B's memory: no parameter allows specifying a different worker name.
- Project scope uses the active project name, not "unknown" or a user-specified name.
- Global scope: any worker reads/writes `~/.guild-hall/memory/global/` as before.
- `workerName` parameter is removed from worker scope tool input schema.
- Tool descriptions updated to explain the access model.
- `BaseToolboxDeps` includes `workerName` and `projectName`.
- `toolbox-resolver.ts` passes identity through to base toolbox creation.
- Unit tests: worker reads own memory (succeeds), worker cannot specify another worker's name (parameter not in schema), project scope uses correct project name.

## Why

From `.lore/specs/guild-hall-system.md`:
- REQ-SYS-19: "Worker memory is read/write only by its owner."
- REQ-SYS-20: "Any worker can read and write global memory and project memory for the active workspace. Worker memory is read/write only by its owner."
- REQ-SYS-21: "Memory files are plain text or markdown."

## Files

- `daemon/services/base-toolbox.ts` (modify: enforce ownership, remove workerName param)
- `daemon/services/toolbox-resolver.ts` (modify: pass workerName/projectName)
- `tests/daemon/memory-access-control.test.ts` (create)
