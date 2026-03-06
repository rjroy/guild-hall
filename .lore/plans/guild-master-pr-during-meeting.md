---
title: "Plan: Guild Master PR during meeting"
date: 2026-03-06
status: implemented
tags: [plan, meetings, pr, guild-master, toolbox]
modules: [cli-rebase, manager-toolbox]
related:
  - .lore/issues/guild-master-pr-during-meeting.md
  - .lore/plans/project-scoped-meetings.md
  - .lore/specs/project-scoped-meetings.md
---

# Plan: Guild Master PR During Meeting

## Problem

The `create_pr` tool and `rebase` CLI both call `hasActiveActivities()` (`cli/rebase.ts:13`) to block operations when open meetings or active commissions exist for the project. This guard is correct for activity-scoped meetings, which create their own git branch. Merging the integration branch while an activity branch is still open would orphan that branch's work.

The guard is wrong for project-scoped meetings. Project-scoped meetings (currently only the Guild Master) operate directly in the integration worktree. They don't create a separate branch. There is no un-merged branch to orphan, and there are no uncommitted artifacts on the integration branch that a PR would miss. The meeting's state lives in `~/.guild-hall/state/`, not in the project's `.lore/` directory. The result: the Guild Master cannot create a PR during its own meeting, forcing the user to close the meeting, create the PR, and reopen. See `.lore/issues/guild-master-pr-during-meeting.md` for the full description.

## Recommended Approach

**Filter by meeting scope, not by worker identity.**

The issue proposes two options: filter by worker type (option 1) or filter by artifact presence on the integration branch (option 2). A third option emerges from the codebase: filter by the `scope` field already present in meeting state files.

The `scope` field was added as part of the project-scoped meetings implementation (REQ-PSM-9). Every meeting state file written by `serializeMeetingState()` (`daemon/services/meeting/orchestrator.ts:200`) includes `scope: "project"` or `scope: "activity"`. The `hasActiveActivities()` function already reads these state files but ignores the `scope` field. Adding a scope check is the smallest possible change and directly addresses the real concern: meetings with their own git branch (`scope: "activity"`) block operations; meetings sharing the integration worktree (`scope: "project"`) do not.

This approach is better than filtering by worker identity because it matches the actual invariant (does this meeting have a separate branch?) rather than a proxy (is this the Guild Master?). If a future worker also uses project scope, it would automatically be handled correctly. It's simpler than option 2 (inspecting git state for uncommitted artifacts) because the scope field already captures the relevant information at meeting creation time.

**Backward compatibility.** State files written before the project-scoped meetings feature don't have a `scope` field. Absent scope should be treated as `"activity"` (the original behavior), matching the convention established in `recoverMeetings()` (`daemon/services/meeting/orchestrator.ts:1379`).

## Implementation Steps

### Step 1: Update `hasActiveActivities()` to skip project-scoped meetings

**File:** `cli/rebase.ts:47-70`

In the meeting state file loop, add `scope` to the parsed type and skip entries where `scope === "project"`. Absent scope defaults to `"activity"` (blocks operations, preserving existing behavior).

Current code (`cli/rebase.ts:57-62`):

```typescript
const state = JSON.parse(raw) as {
  projectName?: string;
  status?: string;
};
if (state.projectName === projectName && state.status === "open") {
  return true;
}
```

Updated code:

```typescript
const state = JSON.parse(raw) as {
  projectName?: string;
  status?: string;
  scope?: string;
};
if (
  state.projectName === projectName &&
  state.status === "open" &&
  state.scope !== "project"
) {
  return true;
}
```

This is the only production code change. Both callers (`makeCreatePrHandler` in `daemon/services/manager/toolbox.ts:224` and `rebaseProject`/`syncProject` in `cli/rebase.ts:94,212`) benefit automatically.

### Step 2: Update existing tests and add new ones

**File:** `tests/cli/rebase.test.ts`

The existing test "returns true when an open meeting exists" (line 207) writes a state file without a `scope` field. This test should continue to pass with the change because absent scope is treated as activity scope (blocking). No modification needed for this test.

Add three new tests to the `hasActiveActivities` describe block:

1. **"returns false when only project-scoped meetings are open"**: Write a meeting state file with `{ projectName: "my-project", status: "open", scope: "project" }`. Assert `hasActiveActivities()` returns `false`.

2. **"returns true when activity-scoped meetings are open"**: Write a meeting state file with `{ projectName: "my-project", status: "open", scope: "activity" }`. Assert `hasActiveActivities()` returns `true`.

3. **"returns true when both scopes exist and activity-scoped is open"**: Write two state files, one project-scoped and one activity-scoped, both open. Assert `hasActiveActivities()` returns `true` (the activity-scoped meeting still blocks).

**File:** `tests/daemon/services/manager-toolbox.test.ts`

The existing test "blocks when active activities exist" (line 556) uses a commission state file. Add a test: **"allows PR creation when only project-scoped meetings are open"**. Write a meeting state file with `scope: "project"` and verify the handler succeeds.

### Step 3: Verify rebase and sync behavior

**File:** `tests/cli/rebase.test.ts`

Update the `rebaseProject` test "skips when active meeting exists" (line 334): this test writes a meeting state file without a scope field, so it should still pass (absent scope defaults to activity, still blocked). Add a companion test: **"proceeds when only project-scoped meetings are open"** that writes a state file with `scope: "project"` and verifies the rebase executes.

The `syncProject` test "skips when active activities exist" (line 528) uses a commission state file, not a meeting, so it's unaffected.

## File Change Summary

| File | Change | New? |
|------|--------|------|
| `cli/rebase.ts` | Add `scope` check to meeting loop in `hasActiveActivities()` | No |
| `tests/cli/rebase.test.ts` | Add 4 tests for scope-aware meeting filtering | No |
| `tests/daemon/services/manager-toolbox.test.ts` | Add 1 test for PR creation with project-scoped meeting | No |

## Test Strategy

### Existing tests that must continue passing

- `tests/cli/rebase.test.ts`: All existing `hasActiveActivities` tests (7 tests). The "returns true when an open meeting exists" test writes a state file without `scope`, which should still block (backward compat).
- `tests/cli/rebase.test.ts`: All `rebaseProject` tests (5 tests). The "skips when active meeting exists" test is unaffected (no scope field = activity scope).
- `tests/cli/rebase.test.ts`: All `syncProject` tests (10 tests). The skip test uses a commission, not a meeting.
- `tests/daemon/services/manager-toolbox.test.ts`: The existing "blocks when active activities exist" test for `create_pr` uses a commission state file and should continue passing.

### New tests needed

| Test file | Test | Purpose |
|-----------|------|---------|
| `tests/cli/rebase.test.ts` | project-scoped meeting doesn't block | Core behavior: `scope: "project"` is ignored |
| `tests/cli/rebase.test.ts` | activity-scoped meeting blocks | Explicit `scope: "activity"` blocks |
| `tests/cli/rebase.test.ts` | mixed scopes, activity still blocks | Both scopes present, activity wins |
| `tests/cli/rebase.test.ts` | project-scoped meeting doesn't block rebase | `rebaseProject` proceeds with project-scoped meeting |
| `tests/daemon/services/manager-toolbox.test.ts` | PR creation allowed with project-scoped meeting | End-to-end through the manager toolbox |

### Integration verification

The `syncProject` function also calls `hasActiveActivities()` (line 212). A project-scoped meeting being open should no longer block sync. This is correct behavior: sync resets or rebases the integration branch, and a project-scoped meeting's uncommitted changes (if any) are on the same worktree. If the user syncs while a Guild Master meeting is open, uncommitted changes would remain in the working tree. This is an acceptable state because:

1. Sync is typically called between work sessions, not mid-conversation.
2. The Guild Master's meeting changes are committed on close, which happens after sync.
3. The alternative (blocking sync) creates the same friction as blocking PR creation.

No additional handling is needed, but this should be noted for reviewer awareness.

## Edge Cases and Risks

**Absent scope in old state files.** State files written before the project-scoped meetings feature (pre-March 2026) don't include `scope`. The code treats absent scope as activity scope, which preserves the original blocking behavior. This matches the convention in `recoverMeetings()` (line 1379) and carries no risk.

**Guild Master with uncommitted changes during PR creation.** If the Guild Master meeting has made changes to the integration worktree that aren't committed yet (mid-conversation file writes), the PR would include whatever is committed but not the uncommitted changes. This is fine: uncommitted work is uncommitted work. The commit happens when the meeting closes. If the user wants those changes in the PR, they close the meeting first, which commits and then the changes are on claude/main.

**Multiple project-scoped workers.** Currently only the Guild Master has `meetingScope: "project"`. If a future worker declares project scope, it would automatically pass through the guard. This is correct by design: any project-scoped meeting operates in the integration worktree and doesn't create a branch to orphan.

**Concurrent project-scoped meeting and activity-scoped meeting.** If both are open, the activity-scoped meeting still blocks. This is correct: the activity branch exists and could be orphaned.

**Commission check is unchanged.** The commission loop in `hasActiveActivities()` (lines 18-44) is not modified. Active commissions still block PR creation and rebase unconditionally. Commissions always create activity branches, so this is correct.

## Implementation Order

1. **Step 1**: Production code change (one condition added to `cli/rebase.ts`).
2. **Step 2**: Tests for `hasActiveActivities()` scope behavior.
3. **Step 3**: Tests for `rebaseProject` and `makeCreatePrHandler` with project-scoped meetings.

All steps can be done in a single commit. The change is small enough that phased delivery adds no value.

## Resolution

Implemented exactly as planned on 2026-03-06. One production code change in `cli/rebase.ts`: added `scope?: string` to the parsed meeting state type and a `state.scope !== "project"` condition to the meeting loop in `hasActiveActivities()`. Absent scope defaults to activity scope (blocking), preserving backward compatibility with pre-existing state files.

Five new tests added:
- `tests/cli/rebase.test.ts`: project-scoped meeting doesn't block (3 tests covering project-only, explicit activity, and mixed scopes)
- `tests/cli/rebase.test.ts`: project-scoped meeting doesn't block rebase (1 test in `rebaseProject` block)
- `tests/daemon/services/manager-toolbox.test.ts`: PR creation allowed with project-scoped meeting (1 test)

All 1787 tests pass, including the existing "returns true when an open meeting exists" test (no scope field = activity scope, still blocks).
