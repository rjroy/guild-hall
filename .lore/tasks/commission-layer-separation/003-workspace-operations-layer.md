---
title: Implement Layer 3 - Workspace Operations
date: 2026-03-01
status: pending
tags: [task]
source: .lore/plans/commission-layer-separation.md
related:
  - .lore/specs/commission-layer-separation.md
  - .lore/design/commission-layer-separation.md
sequence: 3
modules: [workspace]
---

# Task: Implement Layer 3 - Workspace Operations

## What

Create `daemon/services/workspace.ts` implementing the `WorkspaceOps` interface from the design doc. Commission-agnostic: receives workspace configuration, returns workspace paths and operation results. No commission types in scope.

**Methods:**
- `prepare(config: WorkspaceConfig)` - create branch from baseBranch, create worktree, configure sparse checkout if specified. Returns `{ worktreeDir }`.
- `finalize(config)` - squash-merge activityBranch into baseBranch. Returns `FinalizeResult` (merged or preserved with reason). On merge conflict in non-.lore/ files: preserve branch, return `{ merged: false, preserved: true, reason }`.
- `preserveAndCleanup(config)` - commit uncommitted work, remove worktree, keep branch for recovery.
- `removeWorktree(worktreeDir)` - remove worktree only.

Calls into `daemon/lib/git.ts` for low-level primitives. All subprocess invocations use `cleanGitEnv()`.

This is new code. The current workspace logic is scattered across `commission-handlers.ts` interleaved with state transitions. The new module owns git sequencing as a coherent unit.

Introduce a `GitOps`-style interface or accept git operation functions as constructor parameters for testability. The current `daemon/lib/git.ts` exports functions, not an interface.

## Validation

- `prepare` calls createBranch, createWorktree, and configureSparseCheckout in correct order
- `finalize` calls squash-merge and returns correct result for success and conflict cases
- `preserveAndCleanup` commits, removes worktree, and preserves branch
- `cleanGitEnv()` is enforced on all git operations
- Layer 3 isolation test: no commission types imported (verify import graph)
- Error paths: prepare failure propagates, finalize conflict returns structured result
- Tests use mocked git operations via DI

## Why

From `.lore/specs/commission-layer-separation.md`:

- REQ-CLS-19: Layer 3 provisions and tears down workspaces. It is commission-agnostic: it receives workspace configuration and returns workspace paths and operation results.
- REQ-CLS-20: Layer 3 enforces `cleanGitEnv()` on all git subprocess invocations.
- REQ-CLS-21: Layer 3 does not know about commissions, state machines, or signals.

## Files

- `daemon/services/workspace.ts` (create)
- `tests/daemon/services/workspace.test.ts` (create)
