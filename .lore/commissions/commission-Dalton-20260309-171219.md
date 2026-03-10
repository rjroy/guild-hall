---
title: "Commission: Fix: meeting request page reads from integration branch instead of worktree"
date: 2026-03-10
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix a bug where re-opening a meeting request page shows stale status because the UI reads the meeting artifact from the integration branch, not the active meeting's worktree.\n\n## The Problem\n\nWhen a meeting is active, its artifact lives in an activity worktree (under `~/.guild-hall/worktrees/<project>/`). But the Next.js UI reads artifacts from the integration worktree (`~/.guild-hall/projects/<project>/`), which has the old/stale version. So when a user navigates back to a meeting request page during an active meeting, they see outdated status.\n\n## Investigation Steps\n\n1. Read how the meeting request page renders:\n   - `web/app/projects/[name]/artifacts/[...path]/page.tsx` (the catch-all artifact route)\n   - Any meeting-specific page components\n   - Check if there's a dedicated meeting route or if meetings go through the artifact catch-all\n\n2. Read how the artifact file path is resolved:\n   - Where does the page compute the filesystem path to read?\n   - Does it always use the integration worktree path?\n   - Check `lib/paths.ts` for `integrationWorktreePath` and `meetingWorktreePath`\n\n3. Read how the daemon resolves write paths for meetings:\n   - `daemon/lib/toolbox-utils.ts` has `resolveWritePath()` that checks worktree first, falls back to integration\n   - The read side (Next.js) should mirror this logic\n\n4. Understand the meeting lifecycle:\n   - When does the artifact get written to the worktree vs integration branch?\n   - When does the worktree get merged back?\n   - What state does the meeting artifact show on each branch at each phase?\n\n5. Check if there's existing daemon state that tracks active meetings:\n   - `daemon/services/meeting/registry.ts` has `MeetingRegistry`\n   - The daemon knows which meetings are active and their worktree paths\n   - Could the UI query the daemon to resolve the correct read path?\n\n## Fix Direction\n\nThe Next.js read side needs to check for an active meeting worktree before falling back to the integration branch. This mirrors what `resolveWritePath()` does for the daemon. Options:\n\n- **Option A:** The artifact page checks if a worktree exists for the artifact path and reads from there first.\n- **Option B:** The artifact page queries the daemon for the correct read path when the artifact is a meeting.\n- **Option C:** A more general solution where all artifact reads check for an active worktree first.\n\nChoose the approach that's simplest and most consistent with existing patterns. Fix it, add tests, run typecheck/lint/tests."
dependencies: []
linked_artifacts:
  - web/app/projects/[name]/artifacts/[...path]/page.tsx

  - tests/lib/paths.test.ts
  - tests/lib/paths.test.ts
activity_timeline:
  - timestamp: 2026-03-10T00:12:19.409Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T00:12:19.409Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-10T00:12:19.441Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-10T00:12:27.471Z
    event: progress_report
    reason: "Starting investigation: reading artifact page, path resolution, and daemon write path logic."
  - timestamp: 2026-03-10T00:15:20.041Z
    event: result_submitted
    reason: "Fixed stale artifact display on meeting/commission pages by updating the catch-all artifact route to resolve the correct read path.\n\n**Root cause:** `web/app/projects/[name]/artifacts/[...path]/page.tsx` always read from `integrationWorktreePath` (the `claude` branch checkout). Active meetings and commissions write to their own activity worktrees, so the integration copy is stale until the worktree merges back.\n\n**Fix:** The artifact page now detects meeting and commission paths and calls `resolveMeetingBasePath()` or `resolveCommissionBasePath()` respectively. These check daemon state files (`~/.guild-hall/state/meetings/*.json` and `~/.guild-hall/state/commissions/*.json`) for active sessions with worktree directories. Falls back to integration worktree for inactive/closed artifacts. This mirrors the daemon's `resolveWritePath()` logic.\n\nCommission scanning for the sidebar still reads from the integration worktree (complete set).\n\n**Tests added:** 12 new tests for `resolveCommissionBasePath` and `resolveMeetingBasePath` covering dispatched, in_progress, completed, missing state file, and missing worktreeDir cases.\n\n**Verification:** Typecheck clean, lint clean, 2311 tests pass (0 failures)."
  - timestamp: 2026-03-10T00:15:25.447Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Starting investigation: reading artifact page, path resolution, and daemon write path logic."
projectName: guild-hall
---
Fixed stale artifact display on meeting/commission pages by updating the catch-all artifact route to resolve the correct read path.

**Root cause:** `web/app/projects/[name]/artifacts/[...path]/page.tsx` always read from `integrationWorktreePath` (the `claude` branch checkout). Active meetings and commissions write to their own activity worktrees, so the integration copy is stale until the worktree merges back.

**Fix:** The artifact page now detects meeting and commission paths and calls `resolveMeetingBasePath()` or `resolveCommissionBasePath()` respectively. These check daemon state files (`~/.guild-hall/state/meetings/*.json` and `~/.guild-hall/state/commissions/*.json`) for active sessions with worktree directories. Falls back to integration worktree for inactive/closed artifacts. This mirrors the daemon's `resolveWritePath()` logic.

Commission scanning for the sidebar still reads from the integration worktree (complete set).

**Tests added:** 12 new tests for `resolveCommissionBasePath` and `resolveMeetingBasePath` covering dispatched, in_progress, completed, missing state file, and missing worktreeDir cases.

**Verification:** Typecheck clean, lint clean, 2311 tests pass (0 failures).
