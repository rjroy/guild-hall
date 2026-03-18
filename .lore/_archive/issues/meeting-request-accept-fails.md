---
title: Meeting request accept fails when artifact is uncommitted on integration worktree
date: 2026-03-08
status: resolved
tags: [bug-fix, meetings, git]
severity: blocking
---

## Symptoms

Clicking "Open" on a pending meeting request in the dashboard fails with:

```
git branch failed (exit 128): fatal: a branch named 'claude/meeting/meeting-request-...' already exists
```

On first attempt the actual error is different (file not found or similar), but cleanup leaves an orphaned branch. Subsequent attempts fail on branch creation.

## Confirmed root cause

The `initiate_meeting` tool (manager toolbox) writes the meeting request artifact directly to the integration worktree filesystem but never commits it. The file sits as untracked:

```
$ git -C ~/.guild-hall/projects/guild-hall status --short
?? .lore/meetings/meeting-request-20260308-122732-....md
```

When the accept flow runs `provisionWorkspace`, it branches from `claude/main` (committed state), which doesn't include the file. Then `updateArtifactStatus` tries to read the artifact from the activity worktree and fails because the file doesn't exist there.

## Secondary issue: orphaned branches on failure

`cleanupFailedEntry` removes the worktree but does not delete the branch created by `workspace.prepare()`. This is intentional (branches may contain work worth preserving), but for meeting accept failures where no work was done, the orphaned branch blocks all retry attempts.

## Tertiary issue: no daemon logging for accept failures

The accept route streams errors directly through SSE without logging them. The error path in `acceptMeetingRequest` yields `{ type: "error" }` events that go to the SSE stream but never hit `console.error`. This made diagnosis harder since journalctl showed nothing.

## Files involved

- `daemon/services/manager/toolbox.ts` - `makeInitiateMeetingHandler` (writes file, no commit)
- `daemon/services/workspace.ts` - `prepare()` (creates branch then worktree, no rollback)
- `daemon/services/meeting/orchestrator.ts` - `acceptMeetingRequest`, `provisionWorkspace`, `cleanupFailedEntry`
- `daemon/routes/meetings.ts` - accept route (no error logging)
- `daemon/services/meeting/record.ts` - `updateArtifactStatus` (reads from worktree, fails if file missing)

## To unblock manually

```bash
# Commit the meeting request on the integration worktree
cd ~/.guild-hall/projects/guild-hall
git add .lore/meetings/meeting-request-20260308-122732-*.md
git commit -m "Add meeting request artifact"

# Delete the orphaned branch
git -C ~/Projects/guild-hall branch -D claude/meeting/meeting-request-20260308-122732-discuss-open-questions-from-the-model-se

# Then click Open again
```

## Open questions

- Should the initiate_meeting tool commit after writing? Or should the accept flow commit uncommitted integration worktree files before branching?
- Should cleanupFailedEntry delete the branch when no commits were made on it beyond the base?
- Is the lack of daemon-side error logging for the accept route intentional or an oversight?
