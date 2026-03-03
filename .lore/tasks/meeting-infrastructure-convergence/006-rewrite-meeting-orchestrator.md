---
title: Rewrite meeting orchestrator
date: 2026-03-02
status: pending
tags: [task]
source: .lore/plans/meeting-infrastructure-convergence.md
related: [.lore/specs/meeting-infrastructure-convergence.md]
sequence: 6
modules: [meeting-orchestrator, meeting-session, meeting-registry, workspace, escalation, meeting-record]
---

# Task: Rewrite meeting orchestrator

## What

Rename `daemon/services/meeting-session.ts` to `daemon/services/meeting/orchestrator.ts`. Replace its dependency on ActivityMachine + meeting-handlers with direct use of the registry, workspace.ts, meeting record ops, and shared escalation. Update all import paths that reference the old location.

**This is the assembly step. Do not split this task.** All foundations (shared utils, record ops, escalation, registry) get wired together here. Production wiring in `daemon/app.ts` is part of this task, not a separate step.

**Dependency changes:**
- Remove: imports of ActivityMachine, MeetingHandlerDeps, createMeetingGraph, all handler types
- Remove: `trackedEntries` parallel Map (registry subsumes it)
- Remove: inline `writeNotesToArtifact` and `writeMeetingArtifact` (moved to meeting/record.ts in task 003)
- Add: `MeetingRegistry` from `@/daemon/services/meeting/registry`
- Add: `WorkspaceOps` from `@/daemon/services/workspace`
- Add: `escalateMergeConflict` from `@/daemon/lib/escalation`
- Add: `MeetingSessionDeps` gains `workspace: WorkspaceOps` and `registry: MeetingRegistry`
- Keep: query-runner, transcript ops, generateMeetingNotes, event bus, state file ops

**Public interface unchanged.** All ten methods returned by `createMeetingSession()`:
- `acceptMeetingRequest`, `createMeeting`, `createMeetingRequest`
- `sendMessage`, `closeMeeting`, `recoverMeetings`
- `declineMeeting`, `deferMeeting`, `interruptTurn`
- `getActiveMeetings`, `getOpenMeetingsForProject`

`createMeetingRequest` is the entry point called by commission orchestrator's merge conflict escalation. Do not break it.

**Open flow (createMeeting and acceptMeetingRequest):**
1. Verify cap: `registry.countForProject(projectName) < cap`.
2. Provision workspace: `workspace.prepare(...)`.
3. Write artifact: For accept, call `updateArtifactStatus` + `appendMeetingLog`. For create, call `writeMeetingArtifact`.
4. Register: `registry.register(meetingId, entry)`.
5. Create transcript: `createTranscript` + `appendUserTurn`.
6. Start SDK session.
7. Emit event.

If any step after registration fails: deregister, remove worktree, propagate error. No zombie entries.

**Close flow (closeMeeting):**
1. Acquire close guard: `registry.acquireClose(meetingId)`.
2. Abort SDK: `entry.abortController.abort()`.
3. Generate notes.
4. Write notes to body: `writeNotesToArtifact(worktreeDir, meetingId, notes)`.
5. Update artifact status + append log.
6. Finalize workspace: `workspace.finalize(...)`.
7. Handle merge result: if not merged, call `escalateMergeConflict(...)`.
8. Deregister: `registry.deregister(meetingId)`.
9. Delete state file. Always, regardless of merge result.
10. Emit event.

**Decline flow:** Write artifact status "declined" + append log. Emit event. No workspace interaction.

**Defer flow:** Same as current behavior.

**Cap enforcement:** `registry.countForProject(projectName)` replaces the parallel `trackedEntries` Map check.

**Production wiring:** In `daemon/app.ts` (`createProductionApp`):
- Create `MeetingRegistry` instance (singleton for daemon process).
- Pass `WorkspaceOps` instance (already exists as production dependency) and `MeetingRegistry` to `createMeetingSession`.
- Update `MeetingSessionDeps` interface to include `workspace` and `registry`.

After implementation, run `silent-failure-hunter` agent on the orchestrator. Multiple failure paths (failed open cleanup, close guard rejection, merge conflict escalation) must either propagate or handle explicitly. No silent swallowing.

## Validation

- `daemon/services/meeting-session.ts` no longer exists. Replaced by `daemon/services/meeting/orchestrator.ts`.
- No imports of `ActivityMachine`, `MeetingHandlerDeps`, `createMeetingGraph`, or handler types remain in meeting code.
- No `trackedEntries` Map exists. Registry is the single source of truth.
- Public interface: all ten methods exist with unchanged signatures and return types.
- Open flow provisions workspace via `workspace.prepare()`, not inlined git calls.
- Close flow finalizes via `workspace.finalize()`, not direct `finalizeActivity()` call.
- Close flow calls `escalateMergeConflict()` on non-merged result.
- Failed open after registration: entry is deregistered, worktree removed, error propagated.
- Close guard prevents double cleanup (second close returns rejection, not double execution).
- Cap enforcement uses `registry.countForProject()`.
- `createProductionApp` in `daemon/app.ts` creates and injects `MeetingRegistry` and `WorkspaceOps`.
- Existing route-level tests (`tests/api/meetings-actions.test.ts`, `tests/daemon/routes/meetings.test.ts`) pass with import path updates.
- New orchestrator flow tests cover open, close, decline, and defer paths.

## Why

From `.lore/specs/meeting-infrastructure-convergence.md`:
- REQ-MIC-5: "Meetings use workspace.ts for workspace provisioning."
- REQ-MIC-10: "Cap enforcement uses the registry's count."
- REQ-MIC-11: "The meeting orchestrator drives meeting lifecycle as explicit sequential steps."
- REQ-MIC-12: "Artifact status writes and meeting log appends happen as explicit steps."
- REQ-MIC-13: "The meeting orchestrator's public interface does not change."

## Files

- `daemon/services/meeting-session.ts` (rename to `daemon/services/meeting/orchestrator.ts`)
- `daemon/services/meeting/orchestrator.ts` (major restructure)
- `daemon/app.ts` (modify: production wiring)
- `daemon/routes/meetings.ts` (modify: import path update)
- `tests/api/meetings-actions.test.ts` (modify: import path update)
- `tests/daemon/routes/meetings.test.ts` (modify: import path update)
