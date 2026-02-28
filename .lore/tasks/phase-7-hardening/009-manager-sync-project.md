---
title: Manager sync_project Tool
date: 2026-02-23
status: complete
tags: [task]
source: .lore/plans/foundation/phase-7-hardening.md
sequence: 9
modules: [guild-hall-core]
---

# Task: Manager sync_project Tool

## What

Add a sixth tool to the manager-exclusive toolbox in `daemon/services/manager-toolbox.ts`: `sync_project`.

This lets the user say "I merged the PR" in a meeting and the manager handles the sync without a daemon restart.

1. The tool accepts a `projectName` parameter.
2. It calls the same logic as `guild-hall sync` CLI (`syncProject()` from `cli/rebase.ts`).
3. Returns a summary of what happened: PR detected and synced, claude reset, or "no merged PR found."
4. Wrap in `withProjectLock()` to avoid concurrent git operations.

`syncProject()` in `cli/rebase.ts` already does PR marker detection and tree comparison. If it isn't directly importable from the daemon (e.g., it has CLI-specific dependencies), extract the core logic into a shared module that both the CLI and daemon can import.

All git operations use `cleanGitEnv()`.

## Validation

- Manager calls `sync_project` with a valid project name: `syncProject()` logic executes, returns summary.
- PR was merged: sync detects the merged PR, resets claude, returns descriptive summary.
- No merged PR: returns "no merged PR found."
- Invalid project name: returns an error message (project not registered).
- Tool is only available to the manager (gated by `isManager` in toolbox resolver).
- Operation is serialized via `withProjectLock()`.
- Unit tests with mocked git operations and config: successful sync, no-PR case, invalid project.

## Why

Deferred from ideas (2026-02-23). The manager needs to handle post-merge sync without requiring a daemon restart. Currently, `guild-hall sync` is CLI-only.

## Files

- `daemon/services/manager-toolbox.ts` (modify: add sync_project tool)
- `cli/rebase.ts` (modify if needed: extract shared logic)
- `tests/daemon/manager-sync-project.test.ts` (create)
