---
title: Fix meeting request accept failures
date: 2026-03-08
status: completed
tags: [bug-fix, meetings, git, observability]
modules: [manager-toolbox, workspace, meeting-orchestrator, meeting-routes]
related:
  - .lore/issues/meeting-request-accept-fails.md
  - .lore/specs/guild-hall-system.md
  - .lore/specs/meeting-infrastructure-convergence.md
  - .lore/specs/guild-hall-meetings.md
  - .lore/retros/meeting-infrastructure-convergence.md
  - .lore/retros/phase-5-git-integration-data-loss.md
---

# Plan: Fix Meeting Request Accept Failures

## Spec Reference

**Specs**:
- `.lore/specs/guild-hall-system.md` (REQ-SYS-26d)
- `.lore/specs/meeting-infrastructure-convergence.md` (REQ-MIC-11a, REQ-MIC-11b)
- `.lore/specs/guild-hall-meetings.md` (REQ-MTG-15, error logging cross-reference)

**Issue**: `.lore/issues/meeting-request-accept-fails.md`

Requirements addressed:
- REQ-SYS-26d: Integration worktree writes must be committed before returning success -> Step 1
- REQ-MIC-11a: Failed-open cleanup must delete empty orphaned branches -> Step 2
- REQ-MIC-11b: Lifecycle errors must be logged daemon-side -> Step 3

## Codebase Context

**Existing infrastructure (one new utility needed):**
- `daemon/lib/git.ts` provides `commitAll()`, `deleteBranch()`, `createBranch()`, and `cleanGitEnv()`. All git subprocess calls already use `cleanGitEnv()` internally.
- `commitAll()` is used by project-scoped meeting close (REQ-PSM-5) for the same purpose: committing directly to the integration worktree.
- Step 2 requires a new `hasCommitsBeyond(repoPath, baseBranch, branch)` method on `GitOps` (see below).

**Files to change:**
- `daemon/services/manager/toolbox.ts` (lines 307-391): `makeInitiateMeetingHandler` writes with `fs.writeFile()`, no git operations.
- `daemon/services/meeting/orchestrator.ts` (lines 339-353): `cleanupFailedEntry` removes worktree but never calls `deleteBranch()`.
- `daemon/services/meeting/orchestrator.ts` (lines 574-749): `acceptMeetingRequest` catch block yields error events without logging.
- `daemon/routes/meetings.ts` (lines 137-164): accept route streams errors without logging.

**Not in scope:** `daemon/services/workspace.ts` is listed in the issue's "Files involved" but is not modified here. The fix is upstream: committing before branching (Step 1) removes the condition that causes `workspace.prepare()` to create a branch pointing at state that lacks the artifact. The branch-then-worktree sequence in `prepare()` is correct when the committed state is correct.

**REQ-SYS-26d scope boundary:** Project-scope `updateArtifactStatus` writes during meeting acceptance are covered by the close-path commit (project-scoped meetings commit via `commitAll` on close, REQ-PSM-5). Step 1 addresses the gap specific to meeting request artifacts created by the manager toolbox outside of any activity context.

**Constraint from retros:** The meeting infrastructure convergence retro warns that refactored code reproduces the error handling patterns of the source. When fixing the logging gap, audit adjacent lifecycle methods for the same pattern.

## Implementation Steps

### Step 1: Commit artifact on integration worktree after writing

**Files**: `daemon/services/manager/toolbox.ts`
**Addresses**: REQ-SYS-26d

In `makeInitiateMeetingHandler`, after the `fs.writeFile()` call that creates the meeting request artifact, commit it to `claude/main` using `commitAll()` on the integration worktree path. The commit must be serialized under the project lock, since it writes to the integration worktree (same pattern as project-scoped meeting close, REQ-PSM-7). `commitAll()` already uses `cleanGitEnv()` internally, so no additional environment handling is needed.

The commit message should identify the artifact: "Add meeting request: {meetingId}".

### Step 2: Delete empty orphaned branches on failed open

**Files**: `daemon/services/meeting/orchestrator.ts`
**Addresses**: REQ-MIC-11a

In `cleanupFailedEntry`, after removing the worktree, check whether the activity branch has any commits beyond the branch point. If none, delete it with `deleteBranch()`. If it has commits, leave it (work worth preserving per existing intent).

The branch-point check must go through a new `GitOps` method (`hasCommitsBeyond(repoPath, baseBranch, branch)`) so it gets `cleanGitEnv()` automatically. Internally this runs `git log --oneline <baseBranch>..<branch>` and returns true if output is non-empty. Add this method to `daemon/lib/git.ts` alongside the existing `deleteBranch()`.

`cleanupFailedEntry` already has access to `entry.branchName`. When `entry.branchName` is `""` (project-scoped meetings), skip branch deletion entirely. This aligns with REQ-PSM-6 (project-scoped cleanup only deregisters).

### Step 3: Log lifecycle errors daemon-side

**Files**: `daemon/services/meeting/orchestrator.ts`, `daemon/routes/meetings.ts`
**Addresses**: REQ-MIC-11b

Add `console.error` in the catch blocks of the meeting orchestrator's lifecycle generators before yielding error events. `console.error` writes to stderr, which systemd/journald captures.

Audit all lifecycle generators in the orchestrator (`acceptMeetingRequest`, `createMeeting`, `closeMeeting`) for the same pattern of yielding errors without logging. The convergence retro predicted this: "refactors faithfully reproduce the error handling patterns of the source code." Fix all instances, not just the accept path.

The route-level logging in `daemon/routes/meetings.ts` is secondary. The orchestrator is the right place for structured error context (meeting ID, project name, operation). The route can add a catch-all `console.error` for unexpected failures that escape the generator.

### Step 4: Tests

**Files**: Test files adjacent to the changed modules

**For Step 1 (commit on write):**
- After calling the `initiate_meeting` tool handler, verify `git status` on the integration worktree shows no untracked meeting request files.
- Verify a commit exists with the meeting request artifact.

**For Step 2 (orphaned branch cleanup):**
- Simulate a failed open that leaves an orphaned empty branch. Call `cleanupFailedEntry`. Verify the branch no longer exists.
- Simulate a failed open where the branch has commits beyond the base. Call `cleanupFailedEntry`. Verify the branch still exists.
- Verify that project-scoped entries (empty `branchName`) skip branch deletion.

**For Step 3 (error logging):**
- Spy on `console.error`. Trigger a lifecycle failure. Verify `console.error` was called with the meeting ID and error details.

### Step 5: Validate against specs

Launch a sub-agent that reads the three updated spec requirements (REQ-SYS-26d, REQ-MIC-11a, REQ-MIC-11b) and reviews the implementation against them. This step is not optional.

## Delegation Guide

No specialized expertise needed. All changes are internal daemon plumbing using existing git utilities. Code review should verify:
- Step 1: The commit is under project lock and uses the same pattern as project-scoped meeting close.
- Step 2: The branch-point check correctly distinguishes empty branches from branches with work.
- Step 3: All lifecycle error paths are covered, not just the accept path.

## Open Questions

None. The spec requirements are clear and the infrastructure exists.
