---
title: "Plan: Project-Scoped Meetings"
date: 2026-03-04
status: executed
tags: [meetings, git, guild-master, integration-worktree]
modules: [meeting-orchestrator, meeting-registry, workspace, manager-worker]
related:
  - .lore/specs/meetings/project-scoped-meetings.md
  - .lore/specs/meetings/guild-hall-meetings.md
  - .lore/specs/meetings/meeting-infrastructure-convergence.md
  - .lore/retros/meeting-infrastructure-convergence.md
---

# Plan: Project-Scoped Meetings

## Spec Reference

**Spec**: `.lore/specs/meetings/project-scoped-meetings.md`
**Design**: N/A (spec is detailed enough to serve as design)

Requirements addressed:

- REQ-PSM-1: Meeting scope determines git isolation model -> Steps 1, 3
- REQ-PSM-2: Scope determined by worker package metadata -> Steps 1, 3
- REQ-PSM-3: Project-scoped creation skips workspace provisioning -> Step 4
- REQ-PSM-4: Artifact written once to integration worktree -> Step 4
- REQ-PSM-5: Project-scoped close skips finalization, commits directly -> Step 5
- REQ-PSM-6: Cleanup is a no-op for project scope -> Step 6
- REQ-PSM-7: Direct commit serialized with project lock -> Step 5
- REQ-PSM-8: Commission merges need no coordination -> No code change (inherent)
- REQ-PSM-9: State file includes scope field -> Steps 2, 7
- REQ-PSM-10: Recovery skips worktree existence check for project scope -> Step 7
- REQ-PSM-11: Toolbox tools work naturally with integration worktree -> Step 4 (verified by tests)
- REQ-PSM-12: SDK session workspaceDir set to integration worktree -> Step 4 (inherent from worktreeDir)
- REQ-PSM-13: WorkerMetadata gains meetingScope field -> Step 1
- REQ-PSM-14: Scope resolved at creation time, immutable -> Steps 3, 4
- REQ-PSM-15: Multiple project-scoped meetings allowed -> No code change (inherent from design)
- REQ-PSM-16: Cap counts both scopes equally -> No code change (registry already counts all entries)
- REQ-PSM-17: Activity-scoped meetings unchanged -> All steps (verified by existing tests passing)
- REQ-PSM-18: Meeting requests work regardless of scope -> Step 4

## Codebase Context

### Key Files

| File | Role | Changes Expected |
|------|------|-----------------|
| `lib/types.ts` | WorkerMetadata type definition | Add `meetingScope` field |
| `apps/daemon/services/manager/worker.ts` | Guild Master package factory | Add `meetingScope: "project"` to metadata |
| `apps/daemon/services/meeting/registry.ts` | ActiveMeetingEntry type | Add `scope` field |
| `apps/daemon/services/meeting/orchestrator.ts` | Meeting lifecycle orchestration | Scope-aware branching in create, accept, close, cleanup, recovery |
| `apps/daemon/services/workspace.ts` | Git workspace provisioning | No changes (skipped for project scope) |
| `apps/daemon/tests/meeting-session.test.ts` | Meeting orchestrator tests | New test cases for project-scoped flows |

### Patterns to Follow

- **DI factory pattern**: The orchestrator uses `createMeetingSession(deps)` with injected dependencies. Tests pass mocks via this interface. New test cases follow the same pattern.
- **Lock serialization**: `withProjectLock(projectName, fn)` serializes integration worktree writes. Project-scoped close commits use this.
- **State file format**: JSON files in `~/.guild-hall/state/meetings/`. New `scope` field with backward-compatible default.
- **ActiveMeetingEntry**: The entry type in the registry carries runtime state. Adding `scope` here avoids re-deriving it from worker metadata on every operation.
- **Event emission**: `meeting_started` and `meeting_ended` events are unchanged; scope is not an external API surface per REQ-PSM-5 step 6.

### Integration Points

- `buildMeetingPrepSpec()` already sets `workspaceDir: meeting.worktreeDir`. When `worktreeDir` is the integration path, the SDK session naturally sees `claude/main` content. No changes needed.
- `resolveWritePath()` in `apps/daemon/lib/toolbox-utils.ts` computes the activity worktree path from `meetingWorktreePath(guildHallHome, projectName, contextId)` and checks if it exists via `fs.access()`. For project-scoped meetings, the activity worktree path won't exist (no worktree is created), so the fallback to the integration worktree fires. This is correct behavior but depends on the fallback path, not on `worktreeDir`. Tests should verify this explicitly.
- `generateMeetingNotes()` receives `worktreeDir` and reads the transcript and linked artifacts from it. Works identically for either scope.
- `commitAll()` in `apps/daemon/lib/git.ts` stages and commits. Used by `workspace.finalize()` internally, and will be called directly for project-scoped close.

## Implementation Steps

### Step 1: Add meetingScope to Worker Metadata and Guild Master Package

**Files**: `lib/types.ts`, `apps/daemon/services/manager/worker.ts`
**Addresses**: REQ-PSM-2, REQ-PSM-13

Add `meetingScope?: "project" | "activity"` to the `WorkerMetadata` interface. This is an optional field; absence means `"activity"`.

In `createManagerPackage()`, add `meetingScope: "project"` to the Guild Master's metadata object.

**Tests**: Unit test that `createManagerPackage()` returns metadata with `meetingScope: "project"`. Unit test that a worker without `meetingScope` defaults to `"activity"` during scope resolution (tested in Step 3).

### Step 2: Add scope to ActiveMeetingEntry and State Serialization

**Files**: `apps/daemon/services/meeting/registry.ts`, `apps/daemon/services/meeting/orchestrator.ts`
**Addresses**: REQ-PSM-1, REQ-PSM-9

Add `scope: "project" | "activity"` to the `ActiveMeetingEntry` type.

Update `serializeMeetingState()` to include the `scope` field in the serialized JSON.

Update the recovery state type in `recoverMeetings()` to read `scope` from the state file, defaulting to `"activity"` when absent (backward compatibility with pre-existing state files).

**Tests**: Verify `serializeMeetingState()` includes `scope`. Verify state files without `scope` field are treated as `"activity"` during recovery.

### Step 3: Add Scope Resolution Helper

**Files**: `apps/daemon/services/meeting/orchestrator.ts`
**Addresses**: REQ-PSM-2, REQ-PSM-14

Add a helper function inside `createMeetingSession()`:

```typescript
function resolveMeetingScope(workerPkg: DiscoveredPackage): "project" | "activity" {
  if ("meetingScope" in workerPkg.metadata) {
    return (workerPkg.metadata as WorkerMetadata).meetingScope ?? "activity";
  }
  return "activity";
}
```

This function is called once at meeting creation time. The resolved scope is stored on the `ActiveMeetingEntry` and never re-derived.

**Tests**: Scope resolution returns `"project"` for the Guild Master package, `"activity"` for a worker without `meetingScope`, `"activity"` for a worker with `meetingScope: "activity"`.

### Step 4: Branch createMeeting and acceptMeetingRequest for Project Scope

**Files**: `apps/daemon/services/meeting/orchestrator.ts`
**Addresses**: REQ-PSM-3, REQ-PSM-4, REQ-PSM-12, REQ-PSM-14, REQ-PSM-18

#### createMeeting Changes

After finding the worker package and generating the meeting ID (inside the lock), resolve scope. Store it on the entry.

After the lock, branch on `entry.scope`:

- **activity** (existing path): `provisionWorkspace()`, write artifact to activity worktree, setup transcript/state.
- **project**: Skip `provisionWorkspace()`. Set `entry.worktreeDir` to the integration worktree path (`integrationWorktreePathFn(ghHome, projectName)`). Set `entry.branchName` to `""`. Set `entry.status` to `"open"`. The artifact was already written to the integration worktree inside the lock (existing code at line 773). Skip the second artifact write by changing the guard at line 826 from `if (workerPkg)` to `if (workerPkg && entry.scope === "activity")`. Setup transcript/state as normal.

The artifact is written once (inside the lock) for project scope, satisfying REQ-PSM-4. The `worktreeDir` being the integration path means `buildMeetingPrepSpec()` sets `workspaceDir` to the integration path, satisfying REQ-PSM-12.

#### acceptMeetingRequest Changes

After finding the worker package (inside the lock), resolve scope. Store it on the entry.

After the lock, branch on `entry.scope`:

- **activity** (existing path): `provisionWorkspace()`, update artifact on activity worktree.
- **project**: Skip `provisionWorkspace()`. Set `entry.worktreeDir` to the integration worktree path. Set `entry.branchName` to `""`. Update artifact status on the integration worktree (the artifact is already there since requests are written to integration).

**Tests**:
- Project-scoped `createMeeting`: verify no `workspace.prepare()` call, `worktreeDir` equals integration path, `branchName` is empty, artifact written once, SDK session receives integration path as `workspaceDir`.
- Project-scoped `acceptMeetingRequest`: same verifications.
- Activity-scoped meetings: existing tests continue to pass unchanged.

### Step 5: Branch closeMeeting for Project Scope

**Files**: `apps/daemon/services/meeting/orchestrator.ts`
**Addresses**: REQ-PSM-5, REQ-PSM-7

In `closeMeeting()`, after generating notes and writing the close artifact (steps 1-3, which work as-is since `meeting.worktreeDir` is either the activity or integration worktree), restructure the finalization conditional.

The existing guard at line 1061 is:
```typescript
if (meeting.worktreeDir && meeting.branchName) {
  // workspace.finalize() ...
} else {
  // warning log about missing worktree/branch
}
```

For project-scoped meetings, `branchName` is `""` (falsy), so this guard falls into the else branch and logs a misleading warning. Restructure to:

```typescript
if (meeting.scope === "project") {
  // Direct commit to integration worktree under project lock
  await withProjectLock(meeting.projectName, async () => {
    await git.commitAll(
      meeting.worktreeDir,
      `Meeting closed: ${meetingId as string}`,
    );
  });
  // Project scope: no merge failure path, no escalation, no branch preservation.
  // The close is always clean. Still check dependency transitions.
  if (deps.commissionSession) {
    try {
      await deps.commissionSession.checkDependencyTransitions(meeting.projectName);
    } catch (err: unknown) {
      console.warn(
        `[meeting] Dependency transition check failed after close for "${meetingId as string}":`,
        errorMessage(err),
      );
    }
  }
} else if (meeting.worktreeDir && meeting.branchName) {
  // Activity scope: existing workspace.finalize() path (unchanged)
  // ... squash-merge, merge result handling, escalation ...
} else {
  // Existing warning for missing worktree/branch info
}
```

After the scope-specific finalization, the remaining close steps are the same for both scopes: delete state file, emit `meeting_ended`, deregister. The `merged` flag is only relevant to the activity scope path.

**Tests**:
- Project-scoped close: verify no `workspace.finalize()` call, `commitAll()` called on integration path under project lock, state file deleted, event emitted, meeting deregistered.
- Concurrent close: two project-scoped meetings closing simultaneously both succeed (serialized by project lock).

### Step 6: Update cleanupFailedEntry for Project Scope

**Files**: `apps/daemon/services/meeting/orchestrator.ts`
**Addresses**: REQ-PSM-6

In `cleanupFailedEntry()`, gate the worktree removal on scope:

```typescript
async function cleanupFailedEntry(entry: ActiveMeetingEntry, projectPath: string): Promise<void> {
  registry.deregister(entry.meetingId);
  if (entry.worktreeDir && entry.scope === "activity") {
    try {
      const workspace = await getWorkspace();
      await workspace.removeWorktree(entry.worktreeDir, projectPath);
    } catch (err: unknown) {
      console.warn(
        `[meeting] Failed to clean up worktree for "${entry.meetingId as string}":`,
        errorMessage(err),
      );
    }
  }
}
```

For project scope, only the deregister happens. The integration worktree is never touched.

**Tests**: Failed project-scoped creation calls deregister but not `workspace.removeWorktree()`.

### Step 7: Update recoverMeetings for Project Scope

**Files**: `apps/daemon/services/meeting/orchestrator.ts`
**Addresses**: REQ-PSM-9, REQ-PSM-10

In `recoverMeetings()`, read the `scope` field from the state file. Default to `"activity"` when absent.

Gate the worktree existence check on scope:

```typescript
const scope = (state as { scope?: string }).scope === "project" ? "project" : "activity";

if (scope === "activity") {
  // Existing worktree existence check (lines 1331-1355)
  try {
    await fs.access(worktreeDir);
  } catch {
    // ... stale worktree handling ...
    continue;
  }
}
// For project scope, skip the check entirely. The integration worktree is always present.
```

Set the `scope` field on the recovered `ActiveMeetingEntry`.

**Tests**:
- Recovery with project-scoped state file: no `fs.access()` check on worktreeDir, meeting re-registered.
- Recovery with state file missing `scope` field: treated as activity scope, existing behavior unchanged.
- Recovery with project-scoped meeting whose project was removed from config: meeting skipped (existing behavior).

### Step 8: Tests

**Files**: `apps/daemon/tests/meeting-session.test.ts` (extend existing), possibly a new `apps/daemon/tests/meeting-session-project-scope.test.ts` if the existing file is already large
**Addresses**: All REQ-PSM requirements via AI Validation section of the spec

The spec's AI Validation section defines these test scenarios:

1. **Scope resolution test**: Guild Master resolves to project; others default to activity; missing field defaults to activity.
2. **Project-scoped creation test**: No branch, no worktree, `worktreeDir` = integration path, `branchName` = "", artifact written once.
3. **Project-scoped close test**: No squash-merge, no worktree removal, artifact committed under project lock. State file deleted. Event emitted. Meeting deregistered.
4. **Live visibility test**: Create project-scoped meeting, simulate file appearing in integration worktree (as if from commission merge), verify the meeting's `workspaceDir` (which is the integration path) reflects the change.
5. **Failed creation cleanup test**: Register, simulate failure, verify deregister but no worktree removal.
6. **Recovery test**: Project-scoped state file, meeting re-registered without worktree check.
7. **Backward compatibility test**: State files without `scope` treated as activity.
8. **Concurrent close test**: Two project-scoped meetings, both close under project lock, no corruption.
9. **Mixed scope test**: One project-scoped + one activity-scoped meeting. Both count toward cap. Both function independently.
10. **Toolbox test**: `link_artifact`, `summarize_progress`, `propose_followup` work when `worktreeDir` is the integration path.

Test infrastructure: Use the existing mock patterns from `apps/daemon/tests/meeting-session.test.ts`:
- Mock `queryFn` with canned SDK messages
- Mock `activateFn` returning standard `ActivationResult`
- Mock `gitOps` tracking calls (especially `commitAll`, `createBranch`, `createWorktree`)
- Mock `workspace` with `prepare`/`finalize`/`removeWorktree` tracking
- Temp directory via `fs.mkdtemp()` for state files and artifacts

Create a `MANAGER_WORKER_META` fixture that includes `meetingScope: "project"` (mirroring `createManagerPackage()`). The existing `WORKER_META` fixture stays as-is (no `meetingScope`, defaults to activity).

### Step 9: Validate Against Spec

Launch a sub-agent that reads the spec at `.lore/specs/meetings/project-scoped-meetings.md`, reviews the implementation, and flags any requirements not met. This step is not optional.

## Delegation Guide

Steps requiring specialized review:

- **Step 5 (closeMeeting branching)**: Use `pr-review-toolkit:silent-failure-hunter` to review the close flow for silent failures, especially around the project lock commit and error handling paths. The close flow is where the most things can go wrong.
- **Step 7 (recovery)**: Use `pr-review-toolkit:silent-failure-hunter` for the recovery path. Silent failures in recovery are the worst kind: they look healthy on startup but leave meetings in limbo.
- **Step 8 (tests)**: Use `pr-review-toolkit:pr-test-analyzer` to verify test coverage is adequate before declaring done.
- **Step 9 (validation)**: Use `lore-development:plan-reviewer` for fresh-context validation that the implementation matches the spec.

## Open Questions

None. The spec is detailed enough to implement directly. The simplest interpretation has been chosen throughout:
- Scope is stored on the entry (not re-derived) for simplicity.
- The direct commit at close uses the existing `git.commitAll()` rather than introducing new git helpers.
- No new API surface (scope is internal lifecycle concern per spec constraints).
