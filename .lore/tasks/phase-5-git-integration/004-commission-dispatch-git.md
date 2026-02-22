---
title: "Commission dispatch creates activity branch and worktree"
date: 2026-02-22
status: pending
tags: [task, commission, dispatch, worktree, sparse-checkout]
source: .lore/plans/phase-5-git-integration.md
related:
  - .lore/specs/guild-hall-commissions.md
  - .lore/specs/guild-hall-system.md
sequence: 4
modules: [daemon-commission-session]
---

# Task: Commission Dispatch Git Integration

## What

Replace `fs.mkdtemp()` with git worktree creation in `dispatchCommission()`. Update `createCommission()` to write artifacts to the integration worktree. Update artifact path resolution throughout the commission session.

This is the largest single refactor in Phase 5. It touches the core dispatch flow and cascades to every artifact helper call.

**CommissionSessionDeps update:** Add `gitOps?: GitOps` to the deps interface.

**dispatchCommission() changes:**

Replace `fs.mkdtemp()` (around line 574) with:
1. Derive branch name via `commissionBranchName(commissionId)`
2. Derive worktree path via `commissionWorktreePath(ghHome, projectName, commissionId)`
3. Create activity branch from `claude`: `git.createBranch(projectPath, branchName, "claude")`
4. Create activity worktree: `git.createWorktree(projectPath, worktreeDir, branchName)`
5. Configure sparse checkout if worker declares `checkoutScope: "sparse"`: `git.configureSparseCheckout(worktreeDir, [".lore/"])`

**createCommission() path change:**

Currently writes artifact to `commissionArtifactPath(project.path, commissionId)`. Must write to the integration worktree instead: `commissionArtifactPath(integrationPath, commissionId)`.

**Cascading artifact path resolution:**

Every call to `commissionArtifactPath` and other artifact helpers must use the correct base path:
- `createCommission()`: integration worktree (artifact created on claude branch)
- `dispatchCommission()`: activity worktree (after worktree creation)
- `handleExit()`: activity worktree
- `handleFailure()`: activity worktree
- `cancelCommission()`: activity worktree
- `reportProgress()`: activity worktree
- `addUserNote()`: integration worktree for pending, activity worktree for active

Add `resolveArtifactBasePath(commissionId, projectName)` helper that checks the `activeCommissions` Map and returns the activity worktree for active commissions, integration worktree otherwise.

**findProjectPathForCommission() update:**

Search integration worktrees (not `project.path`) for commission artifacts. Return `{ projectPath, projectName, integrationPath }`.

**State file update:** Replace `tempDir` with `worktreeDir`, add `branchName`.

**Worker config:** `workingDirectory` now points to activity worktree path. No schema change needed.

## Validation

**CRITICAL: No real git operations in these tests.** Tests inject a mock `gitOps` that records calls and simulates directory creation. Real git operations only happen in Task 001's tests (in `/tmp/`). Running real git commands from tests in the project worktree is what caused the Phase 5 data loss. The mock should track call order, arguments, and simulate success/failure, never call actual git.

Test cases:
- `dispatchCommission`: calls `createBranch` with correct branch name
- `dispatchCommission`: calls `createWorktree` with correct path
- `dispatchCommission`: sparse checkout configured for sparse-scope workers
- `dispatchCommission`: no sparse-checkout call for full-scope workers
- `createCommission`: writes artifact to integration worktree path (not project.path)
- Worker config receives `worktreeDir` as `workingDirectory`
- State file contains `worktreeDir` and `branchName`
- `findProjectPathForCommission` searches integration worktrees
- `resolveArtifactBasePath` returns activity worktree for active commissions, integration for others
- All existing commission tests still pass with the git DI injection

Run `bun test tests/daemon/commission-session.test.ts` and `bun run typecheck`.

## Why

From `.lore/specs/guild-hall-commissions.md`:
- REQ-COM-31: Commission git: branch naming, squash-merge on completion, commit-preserve on failure
- REQ-COM-32: Commission checkout scope follows worker declaration

From `.lore/specs/guild-hall-system.md`:
- REQ-SYS-22: Activity branches
- REQ-SYS-29a: Per-activity worktrees

From `.lore/retros/sse-streaming-bug-fix.md`: "When a system has two ID namespaces for the same concept, the boundary where they meet is highest-risk." Branch names derived from CommissionId must be tested at each boundary.

## Files

- `daemon/services/commission-session.ts` (major modify)
- `tests/daemon/commission-session.test.ts` (major modify)
- `daemon/app.ts` (modify: pass gitOps to commission session)
