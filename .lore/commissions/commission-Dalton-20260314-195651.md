---
title: "Commission: Fix: update integration worktree status when accepting meeting request"
date: 2026-03-15
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Bug\n\nWhen a meeting request is accepted (activity scope), the integration worktree's meeting artifact still has `status: requested`. The web UI's MeetingList reads from the integration worktree, so the meeting appears as a non-clickable \"requested\" entry instead of a linkable \"open\" meeting. The user can't navigate back to the meeting after leaving the page.\n\n## Root Cause\n\n`daemon/services/meeting/orchestrator.ts`, function `acceptMeetingRequest`, lines ~776-780. The activity-scope branch updates status to \"open\" only on the **activity worktree**:\n\n```typescript\n// Activity scope: existing path (creates branch + worktree + sparse checkout)\nawait provisionWorkspace(entry, project.path);\n\n// Update artifact: status to \"open\" + log entry (on the activity worktree)\nawait updateArtifactStatus(entry.worktreeDir, meetingId, \"open\");\nawait appendMeetingLog(entry.worktreeDir, meetingId, \"opened\", \"User accepted meeting request\");\n```\n\nCompare with the project-scope branch (lines ~765-773) which correctly updates the integration worktree:\n\n```typescript\nentry.worktreeDir = integrationWorktreePathFn(ghHome, projectName);\n// ...\nawait updateArtifactStatus(entry.worktreeDir, meetingId, \"open\");\n```\n\nAnd compare with `createMeeting` (lines ~860-867) which writes `status: \"open\"` to the integration worktree before branching, so the integration copy is correct from the start.\n\n## Fix\n\nIn the activity-scope branch of `acceptMeetingRequest`, after `provisionWorkspace` and before or after updating the activity worktree, also update the integration worktree status:\n\n```typescript\nconst iPath = integrationWorktreePathFn(ghHome, projectName);\nawait updateArtifactStatus(iPath, meetingId, \"open\");\n```\n\nThe variable `iPath` is already computed earlier in the setup phase (line ~663) but is scoped inside the `withProjectLock` callback. You'll need to compute it again outside the lock, or pass it through the setup result. Computing it again is fine since `integrationWorktreePathFn` is a pure path computation.\n\n## Verification\n\n1. Write a test that:\n   - Creates a meeting request artifact with `status: requested` on the integration worktree\n   - Calls `acceptMeetingRequest`\n   - Reads the integration worktree artifact and verifies `status: open`\n2. Verify existing tests still pass\n3. Run the full test suite"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-15T02:56:51.763Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-15T02:56:51.766Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
