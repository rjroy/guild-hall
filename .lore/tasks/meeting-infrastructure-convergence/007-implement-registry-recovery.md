---
title: Implement registry-based recovery
date: 2026-03-02
status: pending
tags: [task]
source: .lore/plans/meeting-infrastructure-convergence.md
related: [.lore/specs/meeting-infrastructure-convergence.md]
sequence: 7
modules: [meeting-orchestrator, meeting-registry]
---

# Task: Implement registry-based recovery

## What

Rewrite `recoverMeetings` in `daemon/services/meeting/orchestrator.ts` to use the registry instead of `machine.registerActive()`.

**Recovery flow:**
1. Scan state files in `~/.guild-hall/state/meetings/`.
2. For each state file: parse JSON, skip if project no longer in config.
3. Check worktree existence: if `worktreeDir` doesn't exist on disk, close the meeting (write artifact status "closed", append log "Stale worktree detected on recovery", emit event, delete state file). Do not register.
4. For valid open meetings: create `ActiveMeetingEntry` from state file data, call `registry.register(meetingId, entry)`. Do not re-run open setup (worktree already exists, no `workspace.prepare` call).

SDK session is lost on reboot. The entry's `sdkSessionId` is null. When the user sends a message, `sendMessage` starts a fresh session with context injection (existing behavior per REQ-MTG-12).

## Validation

- After recovery with valid state files: registry contains the recovered entries.
- After recovery with stale worktree (state file exists, worktree directory doesn't): meeting artifact status is "closed", meeting log has "Stale worktree detected on recovery", state file is deleted, entry is NOT in registry.
- After recovery with project removed from config: state file is skipped, no error.
- Recovery does not call `workspace.prepare()` (worktree already exists).
- Recovered entries have `sdkSessionId: null`.
- Tests in `tests/daemon/services/meeting/recovery.test.ts`.

## Why

From `.lore/specs/meeting-infrastructure-convergence.md`:
- REQ-MIC-14: "Meeting crash recovery scans machine-local state files and re-registers open meetings in the active session registry."
- REQ-MIC-15: "If a state file references a worktree that no longer exists, recovery closes the meeting."

## Files

- `daemon/services/meeting/orchestrator.ts` (modify: recoverMeetings function)
- `tests/daemon/services/meeting/recovery.test.ts` (create)
