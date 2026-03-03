---
title: Meeting infrastructure convergence
date: 2026-03-02
status: draft
tags: [architecture, meetings, refactor, infrastructure, convergence, plan]
modules: [meeting-orchestrator, meeting-record, meeting-registry, meeting-handlers, activity-state-machine, workspace, commission-record, record-utils]
related:
  - .lore/specs/meeting-infrastructure-convergence.md
  - .lore/specs/guild-hall-meetings.md
  - .lore/specs/commission-layer-separation.md
  - .lore/specs/activity-state-machine.md
  - .lore/design/activity-state-machine.md
  - .lore/plans/extract-finalize-activity.md
  - .lore/plans/extract-query-runner.md
  - .lore/retros/in-process-commissions.md
  - .lore/retros/phase-5-git-integration-data-loss.md
---

# Plan: Meeting Infrastructure Convergence

## Spec Reference

**Spec**: `.lore/specs/meeting-infrastructure-convergence.md`

Requirements addressed:
- REQ-MIC-1: Shared YAML frontmatter utilities extracted → Step 1
- REQ-MIC-2: Utilities are domain-agnostic (raw strings, field names) → Step 1
- REQ-MIC-3: Commission record.ts delegates to shared utils, interface unchanged → Step 2
- REQ-MIC-4: Meeting record ops restructured on shared utils → Step 2
- REQ-MIC-5: Meetings use workspace.prepare() and workspace.finalize() → Step 5
- REQ-MIC-6: Shared merge conflict escalation function → Step 3
- REQ-MIC-7: Active session registry replaces ActivityMachine for meetings → Step 4
- REQ-MIC-8: Registry operations (register, deregister, lookup, has, count, listByProject) → Step 4
- REQ-MIC-9: Concurrent close guard → Step 4
- REQ-MIC-10: Cap enforcement uses registry count → Step 5
- REQ-MIC-11: Meeting orchestrator as explicit sequential steps → Step 5
- REQ-MIC-12: Artifact writes as explicit orchestrator steps → Step 5
- REQ-MIC-13: Public interface unchanged → Step 5
- REQ-MIC-14: Recovery scans state files, re-registers in registry → Step 6
- REQ-MIC-15: Stale worktree detection closes meeting → Step 6
- REQ-MIC-16: ActivityMachine class and types removed → Step 8
- REQ-MIC-17: meeting-handlers.ts removed → Step 8
- REQ-MIC-18: Activity state machine docs archived → Step 8
- REQ-MIC-19: All MTG-1 through MTG-30 behaviors preserved → Steps 5, 7
- REQ-MIC-20: All existing tests pass → Step 7
- REQ-MIC-21: Commission behavior unaffected → Steps 2, 9

## Decisions

Resolved during plan review. These override the original open questions.

1. **Directory structure**: Create `daemon/services/meeting/` to parallel `daemon/services/commission/`. Meeting-artifact-helpers.ts becomes `meeting/record.ts`. Meeting-session.ts becomes `meeting/orchestrator.ts`. Registry lives at `meeting/registry.ts`. This gives symmetric structure across both activity types.

2. **ActiveMeetingEntry ownership**: The type moves from meeting-handlers.ts (deleted in Step 8) into `daemon/services/meeting/registry.ts`, co-located with the data structure that holds entries.

3. **notes_summary moves to artifact body**: Instead of being a YAML frontmatter field, meeting notes are written as the markdown body (below the closing `---`). This simplifies the artifact format and eliminates the marker field question for `appendLogEntry`. The change is included in Step 2 since we're already restructuring meeting artifact I/O.

## Codebase Context

**Prerequisites completed.** Two prior plans extracted shared infrastructure that makes this convergence tractable:

- `extract-finalize-activity` unified the commit-merge-cleanup sequence in `daemon/lib/git.ts`. Both commissions and meetings already call `finalizeActivity()`. This plan migrates meetings from calling it directly to calling it through `workspace.finalize()`.
- `extract-query-runner` separated SDK query execution from meeting-session.ts into `daemon/services/query-runner.ts`. This reduced meeting-session.ts from ~1519 to ~1282 lines and separated meeting lifecycle from SDK mechanics.

**Current file map:**

| File | Lines | Role in this plan |
|------|-------|-------------------|
| `daemon/lib/activity-state-machine.ts` | 472 | Deleted in Step 8 |
| `daemon/services/meeting-handlers.ts` | 602 | Deleted in Step 8 |
| `daemon/services/meeting-session.ts` | 1282 | Becomes `daemon/services/meeting/orchestrator.ts` in Step 5 |
| `daemon/services/meeting-artifact-helpers.ts` | 143 | Becomes `daemon/services/meeting/record.ts` in Step 2 |
| `daemon/services/commission/record.ts` | 262 | Delegates to shared utils in Step 2 |
| `daemon/services/workspace.ts` | 303 | Unchanged (already activity-agnostic) |

**Target structure after completion:**

```
daemon/services/commission/
  record.ts          (delegates to shared utils)
  lifecycle.ts       (unchanged)
  orchestrator.ts    (delegates escalation to shared function)
daemon/services/meeting/
  record.ts          (new, from meeting-artifact-helpers.ts)
  registry.ts        (new)
  orchestrator.ts    (new, from meeting-session.ts)
daemon/lib/
  record-utils.ts    (new, shared YAML utilities)
  escalation.ts      (new, shared merge conflict escalation)
```

**Key patterns in the existing code:**

The ActivityMachine is a generic class parameterized by `<TStatus, TId, TEntry>`. Meetings configure it with a transition graph (requested/open/closed/declined), enter/exit handlers, and an ArtifactOps callback interface. The machine owns transition validation, per-entry locking, handler orchestration, and cleanup hook dispatch. This machinery is proportionate for commissions (10 states, re-dispatch, dependency cascades) but disproportionate for meetings (4 states, "active or not" runtime).

Meeting-session.ts maintains a parallel `trackedEntries` Map alongside the ActivityMachine's internal tracker. This exists because the machine's `get()` only returns active entries, but artifact path resolution needs to find inactive entries (requested, closed, declined) too. The registry subsumes both data structures.

Commission record.ts already has `replaceYamlField()` and `buildTimelineEntry()` as module-level functions. These are the extraction targets for shared utilities. The meeting counterparts live in meeting-artifact-helpers.ts with different implementations of the same regex patterns.

Merge conflict escalation is near-identical between meeting-handlers.ts (line 446) and commission/orchestrator.ts (line 585): both call `createMeetingRequest({projectName, workerName, reason})` wrapped in try/catch with a console.error fallback. Only the reason message template differs.

## Implementation Steps

### Step 1: Extract shared record utilities

**Files**: New `daemon/lib/record-utils.ts`; existing `daemon/services/commission/record.ts` (read, not modified yet)
**Addresses**: REQ-MIC-1, REQ-MIC-2
**Expertise**: None

Create `daemon/lib/record-utils.ts` with three domain-agnostic functions extracted from commission/record.ts:

1. `replaceYamlField(raw: string, fieldName: string, newValue: string): string` -- Replace a YAML field's value in raw frontmatter content. Current implementation lives in commission/record.ts (line 71). Move it verbatim.

2. `readYamlField(raw: string, fieldName: string): string | undefined` -- Read a single YAML field value from raw frontmatter content. New function. Regex matches `^fieldName: (.*)$` and returns the captured value (trimmed, quotes stripped). Returns undefined if field not found.

3. `appendLogEntry(raw: string, entry: string, marker?: string): string` -- Append a log entry to a YAML array in frontmatter content. Extracted from the `appendTimeline` implementation in commission/record.ts (line 107). When `marker` is provided (a field name string), insert the entry before that field. When `marker` is omitted or null, insert before the closing `---` delimiter of the frontmatter block. Commission uses `marker: "current_progress"` (entry goes between the timeline array and the current_progress field). Meetings omit the marker (entry goes at the end of the meeting_log array, just before `---`).

All three functions operate on raw content strings. No `fs` imports, no file I/O, no knowledge of commission or meeting artifact schemas.

**Tests**: Unit tests in `tests/daemon/lib/record-utils.test.ts`. Test with real artifact content samples from both commission and meeting formats. Verify edge cases: field not found throws (replaceYamlField), field not found returns undefined (readYamlField), empty log section (appendLogEntry), append with marker, append without marker (before closing `---`).

### Step 2: Wire shared utils into commission and meeting record layers

**Files**: `daemon/services/commission/record.ts`; new `daemon/services/meeting/record.ts` (from meeting-artifact-helpers.ts + relocated functions from meeting-session.ts)
**Addresses**: REQ-MIC-3, REQ-MIC-4
**Expertise**: None

**Commission side (additive, no interface change):** In commission/record.ts, replace the local `replaceYamlField` function with an import from `@/daemon/lib/record-utils`. Replace the inline append-before-marker logic in `appendTimeline` with a call to the shared `appendLogEntry`. The `buildTimelineEntry()` helper stays in commission/record.ts because it formats commission-specific field names (`event`, `reason`, optional `extra`). The `CommissionRecordOps` interface and all method signatures are unchanged.

**Meeting side (restructure and relocate):** Three sub-tasks:

First, create the `daemon/services/meeting/` directory. Move `daemon/services/meeting-artifact-helpers.ts` to `daemon/services/meeting/record.ts`. Update all import paths that reference the old location.

Second, relocate `writeNotesToArtifact` and `writeMeetingArtifact` from meeting-session.ts (lines 1201 and 227 respectively) into `daemon/services/meeting/record.ts`. These are currently internal functions in the session module but belong with the other artifact I/O operations.

Third, wire the shared utilities and implement the notes_summary-to-body change. The meeting-specific operations after restructuring:
- `readArtifactStatus(basePath, meetingId)` reads the artifact file, calls `readYamlField(raw, "status")`, returns the value.
- `updateArtifactStatus(basePath, meetingId, newStatus)` reads the artifact file, calls `replaceYamlField(raw, "status", newStatus)`, writes back.
- `appendMeetingLog(basePath, meetingId, event, reason)` reads the artifact, builds a meeting-specific log entry string (timestamp, event, reason), calls `appendLogEntry(raw, entry)` with no marker (appends before the closing `---`), writes back.
- `writeNotesToArtifact(basePath, meetingId, notes)` reads the artifact, replaces the markdown body (everything after the closing frontmatter `---`) with the notes content, writes back. This is a body replacement, not a YAML field operation. No shared utility needed; it's a simple string splice.
- `writeMeetingArtifact(basePath, meetingId, workerName, prompt, status)` writes a complete new file. Remove `notes_summary` from the YAML frontmatter template. The body starts empty and gets filled by `writeNotesToArtifact` when the meeting closes.

Path resolution logic (deriving artifact path from basePath + meetingId) stays in this file. It's meeting-specific.

**Artifact format change (notes_summary to body):** The meeting artifact template changes from:

```yaml
---
...
meeting_log:
  - timestamp: ...
    event: ...
    reason: ...
notes_summary: ""
---
```

To:

```yaml
---
...
meeting_log:
  - timestamp: ...
    event: ...
    reason: ...
---
```

The notes content (previously in `notes_summary`) lives below the closing `---` as the markdown body. The UI already parses frontmatter with gray-matter and renders the body with react-markdown, so the notes will display as the artifact's content section. Any UI code that reads `notes_summary` from frontmatter metadata must be updated to read from the parsed body instead.

**Tests**: Run all existing commission tests. They must pass with no modifications. Write tests for the restructured meeting record operations, including: writeNotesToArtifact produces notes in the body (not frontmatter), appendMeetingLog appends before closing `---`, writeMeetingArtifact produces an artifact without notes_summary in frontmatter. Commission isolation test: verify `CommissionRecordOps` produces identical output before and after delegation.

### Step 3: Extract shared merge conflict escalation

**Files**: New `daemon/lib/escalation.ts`; `daemon/services/commission/orchestrator.ts` (delegates); `daemon/services/meeting-handlers.ts` (not yet, consumed in Step 5)
**Addresses**: REQ-MIC-6
**Expertise**: None

Create `daemon/lib/escalation.ts` with a single function:

```
escalateMergeConflict(opts: {
  activityType: "commission" | "meeting";
  activityId: string;
  branchName: string;
  projectName: string;
  createMeetingRequest: (params: { projectName: string; workerName: string; reason: string }) => Promise<void>;
  managerPackageName: string;
}): Promise<void>
```

The function builds the reason string (parameterized by activityType and activityId), calls `createMeetingRequest`, and wraps in try/catch with console.error on failure. The reason template includes the activity type, ID, branch name, and instructions for manual resolution.

Wire into commission/orchestrator.ts immediately: replace the inline escalation block (lines 585-607) with a call to `escalateMergeConflict`. Meeting wiring happens in Step 5 when the orchestrator is rewritten.

**Tests**: Unit test for `escalateMergeConflict` with both activity types. Verify the reason message contains the activity ID and branch name. Verify `createMeetingRequest` failure is caught and logged, not thrown. Run existing commission tests to confirm no behavioral change.

### Step 4: Create active session registry

**Files**: New `daemon/services/meeting/registry.ts`
**Addresses**: REQ-MIC-7, REQ-MIC-8, REQ-MIC-9, REQ-MIC-10
**Expertise**: Type design review (type-design-analyzer agent)

Create `daemon/services/meeting/registry.ts` exporting a `MeetingRegistry` class and the `ActiveMeetingEntry` type. Not a state machine. No transition graph, no handler dispatch, no ArtifactOps callbacks. A typed Map with lifecycle operations.

**ActiveMeetingEntry type:** Relocated from meeting-handlers.ts. Contains: `meetingId`, `projectName`, `workerName`, `packageName`, `sdkSessionId`, `worktreeDir`, `branchName`, `abortController`, `status`. The type is co-located with the registry because the registry is the sole owner of these entries at runtime.

**Data structure:**

The registry holds `ActiveMeetingEntry` values keyed by `MeetingId`. An additional `Set<MeetingId>` tracks meetings with a close in progress (the concurrent close guard).

**Operations (REQ-MIC-8):**

- `register(id: MeetingId, entry: ActiveMeetingEntry): void` -- Add to the map. Throws if ID already registered (no silent overwrites).
- `deregister(id: MeetingId): void` -- Remove from the map and clear any close-in-progress flag. No-op if not registered (idempotent deregister is safer than throwing, since cleanup paths may double-deregister).
- `get(id: MeetingId): ActiveMeetingEntry | undefined` -- Look up by ID.
- `has(id: MeetingId): boolean` -- Check if registered.
- `countForProject(projectName: string): number` -- Count active meetings for a project (cap enforcement, REQ-MIC-10).
- `listForProject(projectName: string): ActiveMeetingEntry[]` -- List active meetings for a project.

**Concurrent close guard (REQ-MIC-9):**

- `acquireClose(id: MeetingId): boolean` -- Returns true if close was acquired (no close in progress). Returns false if a close is already in progress. Adds to the close-in-progress set on success.
- `releaseClose(id: MeetingId): void` -- Removes from the close-in-progress set. Called after close completes (success or failure). Also called by `deregister` for safety.

The guard prevents the race between a user-initiated close and an error-triggered close from executing cleanup twice. This carries forward the terminal state guard lesson from the in-process commission retro.

**What the registry does NOT do:**
- No transition validation (no state graph)
- No handler dispatch (no enter/exit handlers)
- No artifact operations (no ArtifactOps interface)
- No cleanup hooks (no onCleanup registration)
- No per-entry promise-chain locking (concurrent close guard is simpler and sufficient)

**Tests**: `tests/daemon/services/meeting/registry.test.ts`. Register, deregister, lookup, cap count. Concurrent close guard rejects second close attempt. Verify duplicate register throws. Verify deregister is idempotent. Verify countForProject only counts the specified project. Verify no state machine semantics leak (no transition methods exist).

### Step 5: Rewrite meeting orchestrator with explicit sequential flows

**Files**: `daemon/services/meeting-session.ts` → `daemon/services/meeting/orchestrator.ts` (major restructure and rename)
**Addresses**: REQ-MIC-5, REQ-MIC-10, REQ-MIC-11, REQ-MIC-12, REQ-MIC-13
**Expertise**: Silent failure review (silent-failure-hunter agent)

This is the core step. Rename meeting-session.ts to `daemon/services/meeting/orchestrator.ts` and replace its dependency on ActivityMachine + meeting-handlers with direct use of the registry (Step 4), workspace.ts (existing), meeting record ops (Step 2), and shared escalation (Step 3). Update all import paths that reference the old location.

**Dependency changes:**
- Remove: imports of ActivityMachine, MeetingHandlerDeps, createMeetingGraph, all handler types
- Remove: `trackedEntries` parallel Map (registry subsumes it)
- Remove: inline `writeNotesToArtifact` and `writeMeetingArtifact` (moved to meeting/record.ts in Step 2)
- Add: MeetingRegistry from `@/daemon/services/meeting/registry`
- Add: WorkspaceOps from `@/daemon/services/workspace`
- Add: escalateMergeConflict from `@/daemon/lib/escalation`
- Add: MeetingSessionDeps gains `workspace: WorkspaceOps` and `registry: MeetingRegistry`
- Keep: query-runner, transcript ops, generateMeetingNotes, event bus, state file ops

**Public interface unchanged (REQ-MIC-13).** These methods keep their current signatures and return types:
- `acceptMeetingRequest`, `createMeeting`, `createMeetingRequest`
- `sendMessage`, `closeMeeting`, `recoverMeetings`
- `declineMeeting`, `deferMeeting`, `interruptTurn`
- `getActiveMeetings`, `getOpenMeetingsForProject`

All ten methods returned by `createMeetingSession()` (meeting-session.ts line 1269). `createMeetingRequest` is particularly important: it is the entry point called by the commission orchestrator's merge conflict escalation path.

**Open flow (createMeeting and acceptMeetingRequest, REQ-MIC-11):**

1. Verify cap: `registry.countForProject(projectName) < cap`. If at cap, reject.
2. Provision workspace: `workspace.prepare({ projectPath, baseBranch: claudeBranch, activityBranch: branchName, worktreeDir, checkoutScope, sparsePatterns })`.
3. Write artifact: For accept, call `updateArtifactStatus` + `appendMeetingLog` on the activity worktree. For create, call `writeMeetingArtifact`.
4. Register: `registry.register(meetingId, entry)`.
5. Create transcript: `createTranscript` + `appendUserTurn`.
6. Start SDK session: `startSdkSession(entry, prompt)`.
7. Emit event: `eventBus.emit({ type: "meeting_started", ... })`.

**Failure handling after registration:** If any step after Step 4 (register) fails, the orchestrator must deregister, clean up the workspace (remove worktree), and propagate the error. A failed open must not leave a zombie entry consuming a cap slot.

**Close flow (closeMeeting, REQ-MIC-11):**

1. Acquire close guard: `registry.acquireClose(meetingId)`. If false, reject (close already in progress).
2. Abort SDK: `entry.abortController.abort()`.
3. Generate notes: `generateMeetingNotes(meetingId, worktreeDir, workerName)`.
4. Write notes to body: `writeNotesToArtifact(worktreeDir, meetingId, notes)` writes notes as the artifact's markdown body.
5. Update artifact status: `updateArtifactStatus(worktreeDir, meetingId, "closed")` + `appendMeetingLog`.
6. Finalize workspace: `workspace.finalize({ activityBranch, worktreeDir, projectPath, integrationPath, activityId, commitMessage, commitLabel: "Meeting", lockFn })`.
7. Handle merge result: If not merged, call `escalateMergeConflict(...)`. Non-merged is a clean close with escalation, not an error.
8. Deregister: `registry.deregister(meetingId)`.
9. Delete state file: `deleteStateFile(meetingId)`. Always, regardless of merge result.
10. Emit event: `eventBus.emit({ type: "meeting_ended", ... })`.

State file is always deleted on close (REQ-MIC-11 explicitly states this). A non-merged result preserves the branch but still closes the meeting cleanly.

**Decline flow (declineMeeting, REQ-MIC-11):**

1. Write artifact status: `updateArtifactStatus` to "declined" + `appendMeetingLog`.
2. Emit event: `eventBus.emit({ type: "meeting_declined", ... })`.

No workspace interaction (no resources were provisioned for a declined meeting).

**Defer flow:** Same as current behavior, writes artifact status to reflect deferral.

**Cap enforcement (REQ-MIC-10):** The orchestrator checks `registry.countForProject(projectName)` before opening. This replaces the current pattern of checking a parallel `trackedEntries` Map.

**Production wiring:** The `MeetingRegistry` instance and `WorkspaceOps` instance must be created and injected in `daemon/app.ts` (`createProductionApp`). Add `workspace: WorkspaceOps` and `registry: MeetingRegistry` to the `MeetingSessionDeps` interface. The registry is a singleton for the daemon process. WorkspaceOps already exists as a production dependency; meetings need to receive it.

**Tests**: Rewrite tests that verify handler invocation through the ActivityMachine to instead verify the sequential steps in the new orchestrator. Test the failure-after-registration cleanup (zombie prevention). Test that close guard prevents double cleanup. Existing route-level tests (`tests/api/meetings-actions.test.ts`, `tests/daemon/routes/meetings.test.ts`) should pass with minimal changes (they test the public interface, which is unchanged).

### Step 6: Implement registry-based recovery

**Files**: `daemon/services/meeting/orchestrator.ts` (recoverMeetings function)
**Addresses**: REQ-MIC-14, REQ-MIC-15
**Expertise**: None

Rewrite `recoverMeetings` to use the registry instead of `machine.registerActive()`.

**Recovery flow (REQ-MIC-14):**

1. Scan state files in `~/.guild-hall/state/meetings/`.
2. For each state file: parse JSON, skip if project no longer in config.
3. Check worktree existence (REQ-MIC-15): If worktreeDir doesn't exist on disk, close the meeting (write artifact status "closed", append log "Stale worktree detected on recovery", emit event, delete state file). Do not register.
4. For valid open meetings: create `ActiveMeetingEntry` from state file data, call `registry.register(meetingId, entry)`. Do not re-run open setup (worktree already exists, no workspace.prepare call).

SDK session is lost on reboot. The entry's `sdkSessionId` is null. When the user sends a message, `sendMessage` will start a fresh session with context injection (existing behavior per REQ-MTG-12).

**Tests**: `tests/daemon/services/meeting/recovery.test.ts`. Simulate daemon restart with state files on disk. Verify registry is populated. Simulate stale worktree (state file exists, worktree directory doesn't). Verify meeting is closed and state file deleted.

### Step 7: Rewrite meeting tests

**Files**: `tests/daemon/services/meeting-handlers.test.ts` (rewrite), new `tests/daemon/services/meeting/orchestrator.test.ts`, `tests/daemon/lib/activity-state-machine.test.ts` (pending deletion)
**Addresses**: REQ-MIC-20
**Expertise**: Test coverage review (pr-test-analyzer agent)

Three categories of test changes:

1. **Tests verifying external behavior (routes, SSE events, artifact format):** Unchanged. These test the public interface and should pass as-is after the orchestrator rewrite. Located in `tests/api/meetings-actions.test.ts` and `tests/daemon/routes/meetings.test.ts`. These tests will need import path updates to point at `daemon/services/meeting/orchestrator` instead of `daemon/services/meeting-session`.

2. **Tests verifying ActivityMachine internals (handler invocation, transition graph validation, ArtifactOps callbacks):** Rewritten. These currently live in `tests/daemon/services/meeting-handlers.test.ts`. Move from testing "handler X was called during transition Y" to testing "step X happened in sequence during flow Y." The assertions change from "machine.transition was called with (from, to)" to "workspace.prepare was called with config" and "registry.register was called with entry."

3. **Tests verifying ActivityMachine behavior (concurrent access, re-entrant transitions, per-entry locking):** Replaced with registry tests. The concurrent close guard test replaces the per-entry promise-chain locking test. Re-entrant transition tests are deleted (the registry doesn't have transitions).

**New test file:** Create `tests/daemon/services/meeting/orchestrator.test.ts` to test the restructured orchestrator flows (open, close, decline, defer). This file does not currently exist. The orchestrator tests currently embedded in meeting-handlers.test.ts need a new home that tests the sequential steps directly.

**UI impact from notes_summary change:** Any test or component that reads `notes_summary` from meeting artifact frontmatter must be updated to read from the parsed body. Search for `notes_summary` across the test suite and UI components.

The test file `tests/daemon/lib/activity-state-machine.test.ts` is deleted in Step 8 (not here). At this point, it should still exist but may have failures for tests that reference meeting-specific handlers. If so, skip or mark those tests pending; they'll be deleted with the file.

**Run the full test suite.** All 1706+ tests must pass. If any meeting test fails due to the restructuring, fix it here before proceeding.

### Step 8: Remove ActivityMachine and dead code

**Files**: Delete `daemon/lib/activity-state-machine.ts`, delete `daemon/services/meeting-handlers.ts`, delete `daemon/services/meeting-session.ts` (if not already removed by rename), delete `daemon/services/meeting-artifact-helpers.ts` (if not already removed by rename), delete `tests/daemon/lib/activity-state-machine.test.ts`, delete `tests/daemon/services/meeting-handlers.test.ts`
**Addresses**: REQ-MIC-16, REQ-MIC-17, REQ-MIC-18
**Expertise**: None

**Delete files:**
- `daemon/lib/activity-state-machine.ts` (472 lines)
- `daemon/services/meeting-handlers.ts` (602 lines)
- `daemon/services/meeting-session.ts` (if still present after Step 5 rename)
- `daemon/services/meeting-artifact-helpers.ts` (if still present after Step 2 rename)
- `tests/daemon/lib/activity-state-machine.test.ts`
- `tests/daemon/services/meeting-handlers.test.ts`

**Remove types:** `ActivityMachine`, `ActivityMachineConfig`, `TransitionContext`, `TransitionResult`, `EnterHandler`, `ExitHandler`, `EnterHandlerResult`, `ArtifactOps`, `CleanupEvent`, `CleanupHook`. If any of these are re-exported from index files, remove the re-exports.

**Grep verification (in-process commission retro lesson):** Search the entire codebase for any remaining imports of:
- `activity-state-machine`
- `meeting-handlers`
- `meeting-session` (old path, should now be `meeting/orchestrator`)
- `meeting-artifact-helpers` (old path, should now be `meeting/record`)
- `ActivityMachine`
- `TransitionContext`
- `EnterHandler`
- `ExitHandler`
- `ArtifactOps`
- `ActivityMachineConfig`
- `CleanupHook`
- `CleanupEvent`
- `EnterHandlerResult`
- `notes_summary` (should be absent from all code; notes now live in artifact body)

Any remaining references are broken imports that need to be removed.

**Archive documents (REQ-MIC-18):** Move `.lore/specs/activity-state-machine.md` and `.lore/design/activity-state-machine.md` to `.lore/_archive/specs/` and `.lore/_archive/design/` respectively. These become historical context, not active implementation targets. REQ-ASM-23 through REQ-ASM-27 are superseded by REQ-MIC-11 through REQ-MIC-15.

**Tests**: Run the full test suite. All tests must pass. The deleted test files should not cause failures (they're deleted, not referenced). If the test runner discovers tests by glob pattern, verify no phantom references remain.

### Step 9: Validate against spec

**Addresses**: REQ-MIC-19, REQ-MIC-20, REQ-MIC-21

Launch a sub-agent that reads the spec at `.lore/specs/meeting-infrastructure-convergence.md`, reviews the implementation, and flags any requirements not met. This step is not optional.

**Verification checklist:**

1. **Shared record utilities** exist at `daemon/lib/record-utils.ts` and are imported by both `daemon/services/commission/record.ts` and `daemon/services/meeting/record.ts`.
2. **Meetings use workspace.prepare()** for provisioning and **workspace.finalize()** for merge. No inlined git calls for branch/worktree/checkout in meeting code.
3. **Single merge conflict escalation function** at `daemon/lib/escalation.ts` called by both commission orchestrator and meeting orchestrator.
4. **ActivityMachine is not used by meetings.** No imports of ActivityMachine in `daemon/services/meeting/` or any meeting code.
5. **Active session registry** tracks open meetings with concurrent close guard at `daemon/services/meeting/registry.ts`.
6. **Meeting orchestrator** drives lifecycle as explicit steps (no enter/exit handler routing).
7. **Public interface unchanged.** All method signatures in `daemon/services/meeting/orchestrator.ts` match pre-refactor signatures.
8. **Crash recovery** works through the registry.
9. **ActivityMachine removed.** File does not exist. Types do not exist. No stale imports.
10. **meeting-handlers.ts removed.** File does not exist. No stale imports.
11. **All MTG behaviors preserved.** Run the full test suite. Compare SSE event shapes, artifact format, and state file format against the meetings spec. Note: `notes_summary` has moved from frontmatter to artifact body; verify the UI displays notes correctly.
12. **Commission behavior unaffected.** Run all commission tests. Verify commission record ops produce identical output.
13. **Dead code scan.** Grep for all ActivityMachine-associated type names and old file paths across the codebase. Zero hits expected.
14. **Directory structure.** Verify `daemon/services/meeting/` exists with `record.ts`, `registry.ts`, `orchestrator.ts`. Verify no orphaned files remain at old paths.

## Delegation Guide

Steps requiring specialized expertise:

- **Step 4 (Active Session Registry)**: After implementation, run `type-design-analyzer` agent to review the registry's type design. The registry is a new type with intentionally constrained operations; the reviewer should verify it doesn't leak state machine semantics.
- **Step 5 (Orchestrator Rewrite)**: After implementation, run `silent-failure-hunter` agent. The orchestrator has multiple failure paths (failed open cleanup, close guard rejection, merge conflict escalation). Each path must either propagate the error or handle it explicitly. No silent swallowing.
- **Step 7 (Test Rewrite)**: After implementation, run `pr-test-analyzer` agent to verify coverage of new code paths (registry operations, sequential orchestrator flows, recovery).
- **Step 9 (Validation)**: Run `code-reviewer` agent for a full pass. DI wiring gaps in `createProductionApp` are the highest-risk area (in-process commission retro lesson).

Consult `.lore/lore-agents.md` for the full agent registry.
