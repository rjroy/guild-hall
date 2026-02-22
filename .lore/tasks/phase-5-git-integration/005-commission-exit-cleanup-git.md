---
title: "Commission exit replaces temp dir cleanup with git operations"
date: 2026-02-22
status: pending
tags: [task, commission, exit, squash-merge, cleanup]
source: .lore/plans/phase-5-git-integration.md
related:
  - .lore/specs/guild-hall-commissions.md
sequence: 5
modules: [daemon-commission-session]
---

# Task: Commission Exit + Cleanup Git Integration

## What

Replace `fs.rm(tempDir)` with git operations in `handleExit()`, `handleFailure()`, and `cancelCommission()`. Four exit outcomes, each with different git behavior.

**Completion (handleExit, clean+result):**
1. `git.commitAll(worktreeDir, "Commission completed: <id>")` to capture any uncommitted changes
2. `git.squashMerge(integrationPath, branchName, "Commission: <id>")` to merge activity into claude
3. `git.removeWorktree(projectPath, worktreeDir)` to clean up
4. `git.deleteBranch(projectPath, branchName)` to remove the activity branch

**Failure (handleExit no result, handleFailure):**
1. `git.commitAll(worktreeDir, "Partial work preserved: <reason>")` to save partial results
2. `git.removeWorktree(projectPath, worktreeDir)` to clean up
3. Branch is NOT deleted (preserved for inspection)

**Cancellation (cancelCommission):**
Same as failure: commit partial work, remove worktree, preserve branch.

**Error handling:** All git cleanup operations are wrapped in try/catch with logging. Git failures must not crash the commission session or prevent status transitions. The commission status transition and event emission happen regardless of git cleanup success. This matches the existing pattern where `fs.rm(tempDir)` errors are caught and warned.

## Validation

**CRITICAL: No real git operations in these tests.** All git calls go through the mock `gitOps` injected via DI. Real git operations only happen in Task 001's tests (in `/tmp/`). Running real git commands from tests in the project worktree is what caused the Phase 5 data loss.

Test cases:
- Completion: `commitAll`, `squashMerge`, `removeWorktree`, `deleteBranch` all called in correct order
- Failure: `commitAll` called (partial results), `removeWorktree` called, `deleteBranch` NOT called
- Cancellation: same as failure (commit, remove worktree, preserve branch)
- Git cleanup failure: logged warning, commission status transition still completes
- Squash-merge conflict: logged as error, commission still transitions to completed
- `commitAll` returns false (nothing to commit): no error, flow continues normally

Run `bun test tests/daemon/commission-session.test.ts` and `bun run typecheck`.

## Why

From `.lore/specs/guild-hall-commissions.md`:
- REQ-COM-31: "squash-merge on completion, commit-preserve on failure"
- REQ-COM-14a: Partial result preservation via git

From `.lore/retros/phase-5-git-integration-data-loss.md` (lesson applied indirectly): git operations can fail in unexpected ways. Defensive error handling on all git cleanup paths.

## Files

- `daemon/services/commission-session.ts` (modify: exit/failure/cancel handlers)
- `tests/daemon/commission-session.test.ts` (modify: add git operation assertions)
