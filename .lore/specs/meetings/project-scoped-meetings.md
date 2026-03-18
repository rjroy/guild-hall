---
title: Project-Scoped Meetings
date: 2026-03-03
status: implemented
tags: [architecture, meetings, git, integration-worktree, guild-master]
modules: [meeting-session, meeting-handlers, workspace, meeting-toolbox]
related:
  - .lore/specs/meetings/guild-hall-meetings.md
  - .lore/specs/meetings/meeting-infrastructure-convergence.md
  - .lore/specs/infrastructure/guild-hall-system.md
  - .lore/design/process-architecture.md
req-prefix: PSM
---

# Spec: Project-Scoped Meetings

## Overview

All meetings currently get their own activity worktree: a new branch forked from `claude/main`, a dedicated worktree directory, and a squash-merge back on close. This model gives each meeting an isolated snapshot of the project, which is correct for workers that write to project files. But it creates a visibility gap for the Guild Master: commission results that merge to `claude/main` during a meeting are invisible until the meeting closes and a new one starts.

Project-scoped meetings solve this by running directly in the project's integration worktree (`~/.guild-hall/projects/<name>/`) instead of creating an isolated activity worktree. The meeting sees the live state of `claude/main`. When commissions merge during the meeting, the Guild Master's next file read reflects the result immediately.

This is safe because the Guild Master's toolbox does not write to project source files. Its tools (create_commission, dispatch_commission, cancel_commission, create_pr, initiate_meeting, add_commission_note, sync_project, summarize_progress, etc.) write to state directories and commission/meeting artifacts, not source code. The only project file the meeting infrastructure writes is the meeting artifact itself (`.lore/meetings/<meeting-id>.md`), and no commission touches meeting artifacts, so write contention is effectively zero.

Depends on: [Spec: Guild Hall Meetings](guild-hall-meetings.md) for the meeting lifecycle (REQ-MTG-1 through REQ-MTG-30). [Spec: Meeting Infrastructure Convergence](meeting-infrastructure-convergence.md) for the orchestrator and registry model. [Spec: Guild Hall System](guild-hall-system.md) for integration worktree ownership (REQ-SYS-22, REQ-SYS-29a).

## Entry Points

- Guild Master meeting created by user through the UI (from [Spec: guild-hall-views](guild-hall-views.md))
- Guild Master meeting request accepted by user (from [Spec: guild-hall-meetings](guild-hall-meetings.md), REQ-MTG-24)
- Any meeting where the worker declares project scope (future extension)

## Requirements

### Meeting Scope

- REQ-PSM-1: Meetings have a scope that determines their git isolation model. Two scopes exist:
  - **activity** (default): The meeting gets its own activity branch and worktree, forked from `claude/main`. This is the existing behavior defined by REQ-MTG-25 through REQ-MTG-27. The meeting sees a snapshot from when it started, and changes to `claude/main` (from commission merges or other meetings) are invisible.
  - **project**: The meeting operates directly in the project's integration worktree (`~/.guild-hall/projects/<name>/`). No activity branch or worktree is created. The meeting sees the live state of `claude/main`, including commission results that merge during the meeting.

- REQ-PSM-2: The scope is determined by the worker package. The Guild Master worker declares project scope. All other workers default to activity scope. The scope is resolved from the worker's package metadata at meeting creation time, not configured per-meeting by the user.

  **Assumption:** Only the Guild Master qualifies for project scope today. The mechanism is designed as a worker-level declaration rather than a hardcoded check against the manager package name, so that future workers with similar properties (no project file writes, coordination-only posture) can opt in without modifying the meeting infrastructure. The worker metadata schema gains an optional `meetingScope` field; absence means "activity."

### Project-Scoped Lifecycle

- REQ-PSM-3: The meeting creation flow for project-scoped meetings skips workspace provisioning entirely. No activity branch is created. No worktree is created. No sparse checkout is configured. The meeting's `worktreeDir` is set to the integration worktree path (`~/.guild-hall/projects/<name>/`), and `branchName` is set to the empty string.

- REQ-PSM-4: The meeting artifact is written directly to the integration worktree's `.lore/meetings/` directory at creation time, following the same format as activity-scoped meetings (REQ-MTG-1, REQ-MTG-2). Since there is no activity branch to fork, the artifact does not need to be written twice (once to integration for the branch fork, once to the activity worktree). A single write suffices.

- REQ-PSM-5: The meeting close flow for project-scoped meetings skips workspace finalization. No squash-merge is performed. No worktree is removed. No branch is deleted. The close flow:
  1. Aborts any active SDK generation
  2. Generates meeting notes from the transcript
  3. Writes notes, updates status to "closed," and appends a log entry to the meeting artifact (which is already in the integration worktree)
  4. Commits the meeting artifact changes directly to `claude/main` using `commitAll` on the integration worktree, serialized under the project lock
  5. Deletes the state file
  6. Emits the `meeting_ended` event
  7. Deregisters from the registry

  The commit in step 4 is necessary because the artifact was modified (status change, notes, log entry) and those changes need to persist on `claude/main`. This is a simple `git add -A && git commit` on the integration worktree, not a squash-merge.

- REQ-PSM-6: The cleanup flow for project-scoped meetings is a no-op. There is no worktree to remove and no branch to delete. The integration worktree is a permanent fixture of the project's Guild Hall installation. If `cleanupFailedEntry` is called for a project-scoped meeting (due to an error after registration), it deregisters from the registry but does not attempt to remove the worktree.

### Artifact Commit Serialization

- REQ-PSM-7: The direct commit at meeting close (REQ-PSM-5, step 4) must be serialized with other operations on the integration worktree using `withProjectLock`. Commission squash-merges, other meeting close commits, and sync operations all contend for the same integration worktree. The project lock prevents concurrent git operations from corrupting the index.

- REQ-PSM-8: Commission merges that occur while the meeting is open do not require coordination with the meeting session. The meeting's file reads are non-transactional: each tool call or file read sees whatever is on disk at that moment. If a commission merges between two consecutive file reads in the same meeting turn, the second read sees the post-merge state. This is the desired behavior, not a race condition.

  **Assumption:** The Guild Master does not hold file handles open across tool calls. The Agent SDK's tool execution model (one tool call at a time, sequential within a turn) means each tool invocation reads fresh state.

### State File and Recovery

- REQ-PSM-9: Project-scoped meetings use the same state file format as activity-scoped meetings (`~/.guild-hall/state/meetings/<meeting-id>.json`). The state file includes the meeting's scope so recovery can distinguish project-scoped meetings from activity-scoped ones. The `worktreeDir` field points to the integration worktree path (not an activity worktree), and `branchName` is empty.

  New field in state file:
  - `scope`: `"project"` or `"activity"`. Absent in state files written before this feature; absence means `"activity"` (backward compatible).

- REQ-PSM-10: Recovery for project-scoped meetings is simpler than for activity-scoped meetings. There is no worktree existence check (the integration worktree is always present). Recovery re-registers the meeting in the active session registry with a null SDK session ID (as it does today for all recovered meetings). The "stale worktree" recovery path (REQ-MIC-15) does not apply.

### Meeting Toolbox Behavior

- REQ-PSM-11: The meeting toolbox tools (`link_artifact`, `propose_followup`, `summarize_progress`) operate the same way for project-scoped meetings. `link_artifact` and `summarize_progress` write to the meeting artifact, which is in the integration worktree. `propose_followup` writes to the integration worktree (as it already does). The `resolveWritePath` function, which currently falls back from activity worktree to integration worktree, will naturally resolve to the integration worktree for project-scoped meetings since the `worktreeDir` is the integration worktree.

### SDK Session Configuration

- REQ-PSM-12: The SDK session's `workspaceDir` (the directory the agent's tools operate on) is set to the integration worktree path for project-scoped meetings. This means the agent's file read/write tools see the live `claude/main` content. For activity-scoped meetings, `workspaceDir` continues to be the activity worktree.

### Scope Declaration in Worker Metadata

- REQ-PSM-13: The worker metadata schema (`WorkerMetadata` in `lib/types.ts`) gains an optional `meetingScope` field:
  ```typescript
  meetingScope?: "project" | "activity";
  ```
  When absent, defaults to `"activity"`. The Guild Master's package metadata sets `meetingScope: "project"`.

- REQ-PSM-14: The scope is resolved at meeting creation time from the worker's package metadata. The orchestrator reads `meetingScope` from the worker's metadata and branches into the project-scoped or activity-scoped creation flow accordingly. The scope is immutable for the lifetime of the meeting.

### Concurrent Meetings on the Integration Worktree

- REQ-PSM-15: Multiple project-scoped meetings can be active simultaneously for the same project, subject to the existing per-project meeting cap (REQ-MTG-28). Since project-scoped meetings do not create exclusive resources (no branch, no worktree), there is no resource contention between concurrent project-scoped meetings beyond the standard project lock for commits.

  **Assumption:** Only the Guild Master qualifies for project scope today, and users typically run one Guild Master meeting at a time. But the design does not artificially restrict concurrent project-scoped meetings. If two project-scoped meetings both modify meeting artifacts and close simultaneously, the project lock serializes their commits.

- REQ-PSM-16: Project-scoped meetings coexist with activity-scoped meetings. The cap counts both types equally. A project with cap 5 could have 1 project-scoped meeting and 4 activity-scoped meetings running simultaneously.

### Behavioral Preservation

- REQ-PSM-17: All meeting behaviors defined in the meetings spec (REQ-MTG-1 through REQ-MTG-30) are preserved for activity-scoped meetings. This feature is additive: it introduces an alternative lifecycle path, not a replacement. Existing meetings continue to work identically.

- REQ-PSM-18: Meeting requests (REQ-MTG-22 through REQ-MTG-24) work the same regardless of scope. A meeting request's scope is determined when the request is accepted and the meeting opens, based on the worker's metadata at that time.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Worker scope declaration | Other workers need project scope | [STUB: worker-scope-metadata] |
| Worktree read locking | Reads need consistency guarantees across multiple files | [STUB: read-consistency] |

## Success Criteria

- [ ] Guild Master meetings operate in the integration worktree (no activity branch or worktree created)
- [ ] Guild Master sees live commission results during a meeting (file reads reflect post-merge state)
- [ ] Meeting artifact is written once to the integration worktree, not twice
- [ ] Meeting close commits artifact changes directly to `claude/main` under the project lock
- [ ] No squash-merge, worktree removal, or branch deletion on close for project-scoped meetings
- [ ] Cleanup on failed creation deregisters from registry but does not remove integration worktree
- [ ] State file includes scope field; recovery handles project-scoped meetings (no worktree existence check)
- [ ] Worker metadata schema includes optional `meetingScope` field
- [ ] Meeting toolbox tools work correctly when `worktreeDir` is the integration worktree
- [ ] Activity-scoped meetings are unaffected (all existing behaviors preserved)
- [ ] Per-project meeting cap counts both scopes equally
- [ ] Concurrent project-scoped meeting closes are serialized by the project lock

## AI Validation

**Defaults:**
- Unit tests with mocked Agent SDK `query()`, filesystem, git operations, and time
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Scope resolution test: Guild Master worker resolves to project scope; other workers resolve to activity scope. Worker without `meetingScope` field defaults to activity.
- Project-scoped creation test: verify no branch created, no worktree created, `worktreeDir` set to integration path, `branchName` is empty string, artifact written once to integration worktree.
- Project-scoped close test: verify no squash-merge, no worktree removal, artifact committed directly to `claude/main` under project lock. State file deleted. Event emitted. Meeting deregistered.
- Live visibility test: create a project-scoped meeting, simulate a commission merge to `claude/main`, verify that subsequent file reads from the meeting's `workspaceDir` reflect the merged content.
- Failed creation cleanup test: register a project-scoped meeting, simulate failure after registration, verify deregister called but integration worktree not removed.
- Recovery test: simulate daemon restart with a project-scoped state file. Meeting re-registered without worktree existence check. SDK session is null (fresh session on next message).
- Backward compatibility test: state files without `scope` field are treated as activity-scoped. Existing recovery behavior unchanged.
- Concurrent close test: two project-scoped meetings closing simultaneously. Both commits succeed (serialized by project lock). No git corruption.
- Mixed scope test: one project-scoped meeting and one activity-scoped meeting for the same project. Both count toward cap. Both function independently.
- Toolbox test: `link_artifact`, `summarize_progress`, and `propose_followup` work correctly when `worktreeDir` is the integration worktree.

## Constraints

- No database. All meeting state is files.
- The integration worktree is never removed or recreated by meeting lifecycle operations.
- Project-scoped meetings do not provide read isolation. Files can change between reads within a single turn. This is a feature, not a bug.
- The `meetingScope` field in worker metadata is optional and backward-compatible. Workers without it get activity scope.
- This spec does not change meeting REST API contracts, SSE event shapes, or artifact format. The scope is an internal lifecycle concern, not an external API surface.
- Commission orchestrator code is not modified. Commission merges are unaware of active project-scoped meetings.

## Context

- [Spec: Guild Hall Meetings](guild-hall-meetings.md): The meeting behavioral contract. REQ-MTG-8 (meeting creation) and REQ-MTG-25 through REQ-MTG-27 (git integration) define the activity-scoped lifecycle that this spec provides an alternative to. All other meeting requirements carry forward unchanged.
- [Spec: Meeting Infrastructure Convergence](meeting-infrastructure-convergence.md): The orchestrator and registry model. REQ-MIC-5 (workspace.prepare/finalize) and REQ-MIC-11 (orchestrator flows) are the points where scope-aware branching integrates. Project-scoped meetings skip workspace.prepare() and workspace.finalize() entirely.
- [Spec: Guild Hall System](guild-hall-system.md): Integration worktree ownership (REQ-SYS-22), per-activity worktrees (REQ-SYS-29a), project lock for serializing integration worktree writes.
- [Design: Process Architecture](../design/process-architecture.md): Meeting sessions run in-process in the daemon. The workspace directory passed to the SDK session determines what the agent sees, regardless of scope.
- Discussion context: The Guild Master cannot write to project source files. Its toolbox tools write to state directories and artifacts. The meeting artifact is the only file the meeting infrastructure writes to the project, and no commission touches meeting artifacts. This combination makes project scope safe for the Guild Master without introducing write contention.
