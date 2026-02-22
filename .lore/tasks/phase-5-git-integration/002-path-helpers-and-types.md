---
title: "Path helpers and type updates for worktrees and branches"
date: 2026-02-22
status: pending
tags: [task, paths, types]
source: .lore/plans/phase-5-git-integration.md
related:
  - .lore/specs/guild-hall-system.md
sequence: 2
modules: [lib-paths, daemon-types]
---

# Task: Path Helpers and Type Updates

## What

Add worktree path resolution and branch naming functions to `lib/paths.ts`. Update `ActiveCommission` and `ActiveMeeting` types to replace `tempDir` with `worktreeDir` and add `branchName`.

**lib/paths.ts additions (6 functions):**

- `integrationWorktreePath(ghHome, projectName)`: `<ghHome>/projects/<projectName>`
- `activityWorktreeRoot(ghHome, projectName)`: `<ghHome>/worktrees/<projectName>`
- `commissionWorktreePath(ghHome, projectName, commissionId)`: `<ghHome>/worktrees/<projectName>/commission-<commissionId>`
- `meetingWorktreePath(ghHome, projectName, meetingId)`: `<ghHome>/worktrees/<projectName>/meeting-<meetingId>`
- `commissionBranchName(commissionId, attempt?)`: `claude/commission/<id>` or `claude/commission/<id>-<attempt>` when attempt > 1
- `meetingBranchName(meetingId)`: `claude/meeting/<id>`

**ActiveCommission type (commission-session.ts):** Rename `tempDir: string` to `worktreeDir: string`. Add `branchName: string`. This is a cascading rename through the file and its tests.

**ActiveMeeting type (meeting-session.ts):** Rename `tempDir: string` to `worktreeDir: string`. Add `branchName: string`. Same cascading rename.

**Important:** The `tempDir` -> `worktreeDir` rename is a find-and-replace within each session file and its test file. The field still means "the directory where the worker runs." The semantic change (git worktree instead of temp dir) is implemented in subsequent tasks. This task only changes the field name and adds the new `branchName` field.

## Validation

Test cases for path helpers:
- All 6 functions return correct paths for sample inputs
- Branch names contain commission/meeting IDs correctly
- Attempt suffix applied for attempt > 1, absent for attempt 1 or undefined
- No path traversal possible via crafted IDs (note: IDs are validated at creation time via `isValidPackageName`)

For type renames:
- All existing tests still pass after `tempDir` -> `worktreeDir` rename
- TypeScript typecheck passes (`bun run typecheck`)
- Run `bun test` for the full suite to catch any missed references

## Why

From `.lore/specs/guild-hall-system.md`:
- REQ-SYS-28: Integration worktree per project under `~/.guild-hall/projects/`
- REQ-SYS-29a: Per-activity worktrees under `~/.guild-hall/worktrees/`, cleanup after squash-merge

Branch naming convention from REQ-COM-31 and REQ-MTG-25.

## Files

- `lib/paths.ts` (modify)
- `daemon/services/commission-session.ts` (modify: type rename only)
- `daemon/services/meeting-session.ts` (modify: type rename only)
- `tests/lib/paths.test.ts` (modify: add new tests)
- `tests/daemon/commission-session.test.ts` (modify: rename tempDir references)
- `tests/daemon/meeting-session.test.ts` (modify: rename tempDir references)
