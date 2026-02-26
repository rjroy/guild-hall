---
title: "Plan: Commission and Meeting Artifact State Ownership"
date: 2026-02-26
status: draft
tags: [architecture, git, commissions, meetings, state-management, worktrees, refactor]
modules: [commission-session, commission-artifact-helpers, meeting-session, meeting-artifact-helpers, daemon-routes, git]
related:
  - .lore/issues/commission-meeting-state-ownership.md
  - .lore/specs/guild-hall-system.md
  - .lore/specs/guild-hall-commissions.md
  - .lore/specs/guild-hall-meetings.md
  - .lore/design/process-architecture.md
  - .lore/design/pr-strategy.md
---

# Plan: Commission and Meeting Artifact State Ownership

## Goal

Enforce the ownership model already defined in REQ-SYS-26b, REQ-SYS-26c, REQ-COM-12, and REQ-MTG-2a. The specs are clear; the implementation has gaps. This plan closes those gaps without redesigning anything.

**What "done" looks like:**
- All commission and meeting artifact writes route to the activity worktree when a commission/meeting is active, and to the integration worktree otherwise. No write path bypasses this rule.
- The completion sequence commits both the activity worktree and the integration worktree before merging.
- Non-`.lore/` merge conflicts abort the merge, fail the commission, and create a Guild Master meeting request describing the conflict. Cleanup halts.
- State files are removed after successful merge + cleanup.
- State file schema holds pointer-only fields; any content fields identified during the audit are moved to the artifact.

## Codebase Context

### What exists and is correct

`lib/paths.ts` provides `resolveCommissionBasePath()` and `resolveMeetingBasePath()`. Both check the state file: if status is dispatched/in_progress (commission) or open (meeting) and a worktreeDir is recorded, they return the activity worktree path; otherwise they return the integration worktree path. This is the intended routing mechanism.

Artifact helpers in `commission-artifact-helpers.ts` and `meeting-artifact-helpers.ts` take a pre-resolved `projectPath` parameter. They own no routing logic; they operate on whatever path they're given. This is intentional.

The squash-merge helper (`resolveSquashMerge`) in `commission-session.ts` already:
- Commits all work on the activity worktree before merging
- Calls `squashMergeNoCommit` (which can detect conflicts without committing)
- Auto-resolves `.lore/`-only conflicts with `--theirs` (activity wins)
- Aborts and returns `false` for non-`.lore/` conflicts
- Removes the activity branch and worktree on success

`daemon/lib/git.ts` already has `squashMergeNoCommit`, `listConflictedFiles`, `resolveConflictsTheirs`, `mergeAbort`, and `commitAll`.

### What's missing or broken

**Gap 1 — Write path audit (unknown):** The primary commission lifecycle path (commission-session.ts using `commission.worktreeDir`) looks correct. But routes in `daemon/routes/commissions.ts` and IPC callbacks may write directly to the integration worktree by constructing paths themselves rather than calling `resolveCommissionBasePath`. This needs auditing.

**Gap 2 — Integration worktree not committed before merge:** The completion flow writes status and timeline updates to the integration worktree (`updateCommissionStatus`, `appendTimelineEntry` on `integrationWorktreePath`) and then immediately calls `squashMergeNoCommit`. If those writes are not committed first, the merge runs on top of uncommitted changes, which can cause git to refuse or produce incorrect results. Step 2 from the issue's intended model ("commit all uncommitted changes on `claude/main`") is not confirmed to exist.

**Gap 3 — No Guild Master escalation on conflict:** When `resolveSquashMerge` returns `false` (non-`.lore/` conflict), the commission currently transitions to "failed" with no user notification beyond a log line. The issue requires creating a Guild Master meeting request describing the conflict so the user knows manual resolution is needed.

**Gap 4 — State files never deleted:** After successful merge + cleanup, state files persist in `~/.guild-hall/state/commissions/` and `~/.guild-hall/state/meetings/` indefinitely. REQ-SYS-26b says remove them after cleanup.

**Gap 5 — State file schema drift:** The meeting state file holds `workerName`, `packageName`, `closedAt`. Active commission configs (`.config.json`) hold the full prompt, dependencies, and all worker bootstrap fields. Some of these may be in the wrong file. The pointer-only schema should hold: `{ commissionId, worktreePath, sessionId?, branchName, pid? }`. Anything beyond that needs to either move to the artifact or be justified as genuinely system-local.

### Key integration point for conflict escalation

`createMeeting` in `meeting-session.ts` accepts a `status: "requested"` argument to create a meeting request artifact without opening a session. Commission-session currently has no reference to meeting-session. To call it during conflict handling, commission-session needs either:
- A `createMeetingRequest` callback injected via `CommissionSessionDeps`
- Or a thin shared function extracted to a helper that both services can call

The manager-toolbox pattern (injecting meetingSession as a dep) is the right model. Adding a `createMeetingRequestFn` callback to `CommissionSessionDeps` keeps commission-session decoupled from meeting-session while allowing testing via a stub.

## Implementation Steps

### Step 1: Audit commission artifact write paths

**Files:** `daemon/routes/commissions.ts`, `daemon/services/commission-session.ts`, `daemon/services/commission-toolbox.ts`

Trace every call to any function from `commission-artifact-helpers.ts`. For each call, confirm that the `projectPath` argument is either:
- `commission.worktreeDir` (when commission is active: dispatched or in_progress), or
- `resolveCommissionBasePath(...)` result, or
- The integration worktree path for pre-dispatch operations (create, prompt edit)

Flag any call that constructs the path independently or hardcodes the integration worktree path for post-dispatch operations. Fix flagged calls to use the correct path.

**Document findings:** Add a comment block at the top of each audited function or section listing what was checked and the outcome. This is the evidence the validation sub-agent (Step 8) reads. "No changes needed" is a valid finding -- but it must be written down, not implied by silence.

**Expected outcome:** Either "all paths are correct" or a small set of targeted fixes.

### Step 2: Audit meeting artifact write paths

**Files:** `daemon/services/meeting-session.ts`, `daemon/services/meeting-toolbox.ts`, `daemon/routes/meetings.ts`

Same audit as Step 1 for meeting artifacts. Confirm every artifact helper call routes to the activity worktree when status is "open" and to the integration worktree for requested/closed/declined operations. Same documentation requirement: comment block per audited section.

### Step 3: Audit and narrow state file schemas

**Files:** `daemon/services/commission-session.ts` (state file writes/reads), `daemon/services/meeting-session.ts` (state file writes/reads), and the Zod schemas for each

For commission state, map every field in `~/.guild-hall/state/commissions/<id>.json` and `<id>.config.json`:
- Is it pointer data (commissionId, worktreePath, pid, branchName, sessionId)? Keep.
- Is it content that belongs in the artifact (status beyond what's needed for recovery, timeline data, result data)? Identify these.
- Is it worker bootstrap data needed by the spawned process? The `.config.json` may legitimately need prompt, dependencies, etc. to bootstrap the worker -- in that case, this is a separate process bootstrap artifact, not the state file. Clarify whether this is already correctly separated or if fields are mixed.

For meeting state, same exercise for `~/.guild-hall/state/meetings/<id>.json`.

Narrow the schemas by removing any fields the audit finds as content drift. Update callers. If no content drift is found, document that the schemas are already pointer-only and close this gap.

**Note:** Be conservative. Fields like `projectName`, `workerName` may be needed for daemon recovery (to reconstruct meeting context on restart). Only remove fields that are definitively duplicated in the artifact.

### Step 4: Commit integration worktree before merge

**Files:** `daemon/services/commission-session.ts` (the commission completion handler that calls `resolveSquashMerge`), `daemon/services/meeting-session.ts` (the close meeting handler)

Before calling `squashMergeNoCommit` on the integration worktree, call `git.commitAll(integrationPath, "Pre-merge sync: <id>")` immediately before the merge. `commitAll` already checks for uncommitted changes and is a no-op if the tree is clean -- no new helper needed.

This must happen after any status/timeline writes to the integration worktree (e.g., `syncStatusToIntegration`) and before the `squashMergeNoCommit` call. Order: write → commit integration → commit activity → merge.

### Step 5: Guild Master meeting request on merge conflict

**Files:** `daemon/services/commission-session.ts`, `daemon/services/meeting-session.ts`, `daemon/types.ts` (if CommissionSessionDeps needs extension), `daemon/app.ts` (production wiring)

**Sub-step 5a — Add `createMeetingRequestFn` to deps**

Extend `CommissionSessionDeps` (and the parallel meeting type if needed) with:
```typescript
createMeetingRequestFn?: (params: {
  projectName: string;
  workerName: string;
  reason: string;
}) => Promise<void>;
```

The production implementation (wired in `daemon/app.ts`) calls `meetingSession.createMeeting(...)` with the manager worker as the target and `status: "requested"`. Tests pass a stub.

**Sub-step 5b — Wire conflict path to escalation**

In the commission completion handler, after `resolveSquashMerge` returns `false` (non-`.lore/` conflict):

Current behavior: transition commission to "failed", log, preserve branch.
Add: call `createMeetingRequestFn` with a description that includes the commission ID, the conflicted file list, and instructions for the user to resolve the conflict manually and then re-dispatch or clean up the branch.

The commission still transitions to "failed" (no new state). The Guild Master meeting request surfaces the conflict to the user. Branch and worktree are preserved as before.

**Sub-step 5c — Meeting conflict escalation**

When `closeMeeting` hits non-`.lore/` conflicts, the meeting still closes gracefully (unlike commissions, which fail). But the conflict is silently abandoned today. The behavior after this step:

1. Non-`.lore/` conflict detected during squash-merge
2. Merge aborted
3. Guild Master meeting request created describing the conflict (same `createMeetingRequestFn` as commissions, also injected into `MeetingSessionDeps`)
4. Meeting closes with status "closed" -- the merge just didn't happen
5. Activity branch is **not** preserved (meeting already closed, and the artifact changes were committed before the merge attempt)

The meeting request surfaces the unmerged changes to the user so they can manually apply or discard them.

Extend `MeetingSessionDeps` with a `createMeetingRequestFn` callback (same signature as the commission version). Wire it in `daemon/app.ts`.

### Step 6: State file removal after successful cleanup

**Files:** `daemon/services/commission-session.ts`, `daemon/services/meeting-session.ts`, `daemon/index.ts` (startup scan -- read before modifying)

**Prerequisite:** Before writing any deletion code, read `daemon/index.ts` startup recovery logic and confirm it handles missing state files gracefully. The startup scan walks state files to recover active commissions and meetings. If a state file is absent for a commission/meeting ID found in an artifact, the scan must skip it rather than error. Verify this is the current behavior. If the scan is not graceful, fix it first, then add the deletion.

In the commission completion handler, after:
1. Successful squash-merge
2. Activity worktree removed
3. Activity branch deleted

Add: remove the state file at `~/.guild-hall/state/commissions/<id>.json`.

Same for meetings: after successful merge + cleanup in `closeMeeting`, remove `~/.guild-hall/state/meetings/<id>.json`.

Completed commissions don't need state files because their status is readable from the artifact on the integration worktree. The state file is a runtime aid, not the source of truth for final status.

### Step 7: Tests

For each gap that required code changes, add or update tests:

- **Step 1/2 (write path routing):** If any callers were fixed, add unit tests that verify the corrected calls use the activity worktree path when the commission is in dispatched/in_progress state.
- **Step 4 (commit before merge):** Test that the completion handler calls `git.commitAll` on the integration worktree before `squashMergeNoCommit`, both when the tree is dirty (should commit) and when it's clean (should no-op).
- **Step 5 (conflict escalation):** Test that when `squashMergeNoCommit` indicates non-`.lore/` conflicts, `createMeetingRequestFn` is called with the correct parameters, and the commission still transitions to "failed".
- **Step 6 (state file removal):** Test that after successful merge + cleanup, the state file no longer exists.

### Step 8: Validate Against Goal

Launch a sub-agent with fresh context. Provide:
- This plan
- The issue file (`.lore/issues/commission-meeting-state-ownership.md`)
- The five gaps described in Codebase Context above

The sub-agent reads the implementation changes and confirms:
1. All five gaps have concrete resolutions in the implementation.
2. No new write path bypasses the routing logic.
3. Conflict handling creates a meeting request and still transitions to "failed".
4. State files are removed after successful cleanup.
5. The audit steps (1, 2, 3) produced documented findings, not just "no changes needed" without evidence.

## Delegation Guide

No steps require specialized expertise beyond the existing codebase patterns. Steps 1, 2, and 3 are audits -- they may produce either "no changes needed" or targeted fixes. Steps 4, 5, and 6 are discrete additions to existing lifecycle handlers.

Steps that touch git operations (Step 4) should be tested under the hook execution context (see CLAUDE.md lesson: git subprocesses spawned during hooks inherit `GIT_DIR` et al. -- `cleanGitEnv()` must be used).

## Open Questions

- **Step 3 (schema audit):** The `.config.json` bootstrap file for active commissions contains the full prompt, dependencies, and worker configuration. This is legitimately needed to bootstrap the worker process (it can't be read from the artifact at spawn time because the activity worktree may not exist yet). If this is already a separate file from the state `.json`, the schema is already correct and Step 3 only needs to verify the separation is clean.
