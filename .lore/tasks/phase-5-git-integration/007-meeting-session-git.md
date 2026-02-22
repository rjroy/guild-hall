---
title: "Meeting session git lifecycle: branch, worktree, squash-merge"
date: 2026-02-22
status: pending
tags: [task, meeting, worktree, squash-merge, sparse-checkout]
source: .lore/plans/phase-5-git-integration.md
related:
  - .lore/specs/guild-hall-meetings.md
  - .lore/specs/guild-hall-system.md
sequence: 7
modules: [daemon-meeting-session, daemon-app]
---

# Task: Meeting Session Git Integration

## What

Add git worktree lifecycle to meeting sessions. Meetings follow the same pattern as commissions but with simpler lifecycle (no dispatch/re-dispatch, no failure branch preservation).

**MeetingSessionDeps update:** Add `gitOps?: GitOps` to the deps type.

**createMeeting() changes:**
Replace `fs.mkdtemp()` with:
1. Create activity branch: `git.createBranch(project.path, meetingBranchName(meetingId), "claude")`
2. Create activity worktree: `git.createWorktree(project.path, worktreeDir, branchName)`
3. Configure sparse checkout if worker declares `checkoutScope: "sparse"`
4. Write meeting artifact to the activity worktree (not project.path)

**acceptMeetingRequest() changes:**
Same pattern as createMeeting: create branch, create worktree, configure checkout. The meeting artifact already exists on `claude` (created by `propose_followup`); the activity branch inherits it.

**closeMeeting() changes:**
Replace `fs.rm(meeting.tempDir)` with:
1. `git.commitAll(worktreeDir, "Meeting closed: <id>")`
2. `git.squashMerge(integrationPath, branchName, "Meeting: <id>")`
3. `git.removeWorktree(project.path, worktreeDir)`
4. `git.deleteBranch(project.path, branchName)`

**declineMeeting():** No git operations needed (per MTG-25: "Decline: no branch or worktree created"). The artifact update goes to the integration worktree directly.

**Session recovery (recoverMeetings):**
Replace temp dir recreation with worktree verification. If worktree is gone (reboot, manual cleanup), the meeting is unrecoverable. Mark as closed with a note about the lost worktree. Unlike temp dirs which are trivially recreated, a worktree requires the activity branch to still exist.

**Meeting artifact helpers path change:**
During an active meeting, artifact helpers receive the activity worktree path (not project.path, not integration worktree). On close, squash-merge propagates to integration worktree.

For meeting requests created by `propose_followup`: write to integration worktree directly (not activity worktree). This is an exception so the dashboard sees the request before the meeting closes.

**startSession() changes:**
Update `cwd` and `additionalDirectories` to use `meeting.worktreeDir`. The user's working directory should NOT be accessible to workers (SYS-25).

**daemon/app.ts update:** Pass `gitOps` to meeting session deps in `createProductionApp`.

## Validation

**CRITICAL: No real git operations in these tests.** All git calls go through mock `gitOps` injected via DI. Real git operations only happen in Task 001's tests (in `/tmp/`). Running real git commands from tests in the project worktree is what caused the Phase 5 data loss.

Test cases:
- `createMeeting`: creates branch, creates worktree, configures sparse checkout
- `closeMeeting`: commits, squash-merges, removes worktree, deletes branch
- `declineMeeting`: no git operations called
- `acceptMeetingRequest`: creates branch and worktree from existing artifact
- Session recovery: existing worktree preserved; missing worktree causes meeting to close with warning
- Meeting artifact written to activity worktree during session
- Worker SDK uses `worktreeDir` as cwd
- `propose_followup` writes request artifact to integration worktree (not activity worktree)
- Git cleanup failures are caught and logged (don't crash session)
- All existing meeting tests still pass with git DI injection

Run `bun test tests/daemon/meeting-session.test.ts` and `bun run typecheck`.

## Why

From `.lore/specs/guild-hall-meetings.md`:
- REQ-MTG-25: Meeting git: branch naming, squash-merge on close, no branch on decline
- REQ-MTG-26: Meeting checkout scope follows worker declaration
- REQ-MTG-27: Artifacts committed to meeting branch, squash-merged on close

From `.lore/specs/guild-hall-system.md`:
- REQ-SYS-25: Workers never touch master or user's working directory

## Files

- `daemon/services/meeting-session.ts` (major modify)
- `daemon/services/meeting-toolbox.ts` (modify: propose_followup writes to integration worktree)
- `daemon/app.ts` (modify: pass gitOps to meeting session)
- `tests/daemon/meeting-session.test.ts` (major modify)
