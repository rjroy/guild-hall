---
title: Path Resolution Audit
date: 2026-02-27
status: complete
tags: [audit, paths, worktrees, data-integrity]
modules: [lib-paths, daemon, next-app]
related: [issues/path-resolution-audit.md]
---

# Path Resolution Audit

References: `.lore/issues/path-resolution-audit.md`

## Methodology

Every call site that resolves a project path for reads or writes was traced across the codebase. Each was evaluated against the path selection rule:

- **Outside active work** (Next.js page loads, daemon route handlers serving UI, briefing generation): use `integrationWorktreePath()` or the `resolveCommission/MeetingBasePath()` dynamic resolver.
- **Inside a commission or meeting context** (SDK session, toolbox handlers, artifact writes during active work): use the activity worktree path (`worktreeDir`).

## Summary

**No path selection violations found.** The codebase consistently applies the correct path for each execution context. The Phase 5 migration to integration worktrees was thorough. Several areas are worth documenting as structurally fragile (rely on caller discipline rather than type-level enforcement), and one design decision (propose_followup writing to integration path) is intentional but easy to misread.

---

## Next.js Server Components (Page Loads)

All Next.js pages read from the integration worktree, with dynamic resolution for active commission/meeting detail views. This is correct.

### `app/page.tsx` (Dashboard)

| Line | Path Used | Verdict |
|------|-----------|---------|
| 31 | `integrationWorktreePath(ghHome, selectedConfig.name)` | Correct. Dashboard reads artifacts from integration worktree. |
| 38-39 | `integrationWorktreePath(ghHome, project.name)` for `scanCommissions` | Correct. Commission list on dashboard reads from integration worktree. |
| 46-47 | `integrationWorktreePath(ghHome, project.name)` for `scanMeetingRequests` | Correct. Meeting requests exist on integration worktree (created by propose_followup or createMeetingRequest). |

### `app/projects/[name]/page.tsx` (Project View)

| Line | Path Used | Verdict |
|------|-----------|---------|
| 33-34 | `integrationWorktreePath(ghHome, projectName)` for main artifacts and commissions | Correct. Project view reads from integration worktree. |
| 43-46 | `getActiveMeetingWorktrees(ghHome, projectName)` to scan open meeting worktrees | Correct. Open meetings haven't been squash-merged yet, so their artifacts only exist in activity worktrees. The code merges both sources and deduplicates. |
| 62 | `scanCommissions(lorePath, projectName)` using `lorePath` from integration worktree | Correct. |

### `app/projects/[name]/commissions/[id]/page.tsx` (Commission Detail)

| Line | Path Used | Verdict |
|------|-----------|---------|
| 65-66 | `resolveCommissionBasePath(ghHome, projectName, id)` | Correct. This dynamic resolver checks the state file: active (dispatched/in_progress) commissions resolve to their activity worktree, all others to the integration worktree. Shows live progress for active commissions. |
| 87-89 | `integrationWorktreePath(ghHome, projectName)` for dependency graph (`scanCommissions`) | Correct. The dependency graph is a cross-commission view; it should use the integration worktree (not individual activity worktrees). |

### `app/projects/[name]/meetings/[id]/page.tsx` (Meeting Detail)

| Line | Path Used | Verdict |
|------|-----------|---------|
| 80-81 | `resolveMeetingBasePath(ghHome, projectName, id)` | Correct. Same dynamic resolver pattern as commissions. Open meetings resolve to their activity worktree; closed/declined meetings to integration worktree. |

### `app/projects/[name]/artifacts/[...path]/page.tsx` (Artifact Detail)

| Line | Path Used | Verdict |
|------|-----------|---------|
| 25-26 | `integrationWorktreePath(ghHome, projectName)` | Correct. General artifact viewing reads from integration worktree. An artifact being modified by an active commission won't show the commission's in-progress changes here, which is the intended behavior (changes are isolated until merge). |

---

## Next.js API Routes

### `app/api/artifacts/route.ts` (PUT /api/artifacts)

| Line | Path Used | Verdict |
|------|-----------|---------|
| 41-42 | `integrationWorktreePath(ghHome, projectName)` for writes | Correct. The Phase 1 artifact editor writes directly to the integration worktree with auto-commit. This is the documented exception (VIEW-38). |

### `app/api/meetings/[meetingId]/quick-comment/route.ts` (POST)

| Line | Path Used | Verdict |
|------|-----------|---------|
| 46-51 | `integrationWorktreePath(ghHome, projectName)` to read meeting request artifact | Correct. Meeting requests live on the integration worktree. The quick-comment route reads from there to extract worker and linked_artifacts before creating a commission via daemon. |

---

## Daemon Services

### `daemon/services/commission-session.ts`

This is the most path-intensive file. It handles creation, dispatch, active session management, completion/merge, recovery, and dependency checking.

**Commission creation** (line 1297):
`integrationWorktreePath(ghHome, projectName)` to write the new commission artifact. Correct: new commissions start on the integration worktree before dispatch creates an activity branch.

**scanPendingCommissions** (line 442):
`integrationWorktreePath(ghHome, project.name)` to scan for pending commissions. Correct: pending commissions live on the integration worktree.

**checkDependencyTransitions** (line 559):
`integrationWorktreePath(ghHome, projectName)` for scanning and resolving dependencies. Correct: dependencies are checked against the integration worktree (the shared branch). Comment on line 556-557 explicitly documents this.

**findProjectPathForCommission** (line 741):
`integrationWorktreePath(ghHome, project.name)` to find the project containing a commission. Correct: artifact lookup searches the integration worktree.

**resolveArtifactBasePath** (line 769):
Active commissions return `active.worktreeDir`; inactive return `integrationWorktreePath`. Correct: this is the daemon-internal version of the same pattern as `resolveCommissionBasePath` in lib/paths.ts.

**dispatchCommission** (lines 1447-1599):
- Line 1448: reads status from `found.integrationPath`. Correct (pre-dispatch, artifact is on integration worktree).
- Line 1478: commits to `found.integrationPath`. Correct (ensures activity branch fork includes the commission).
- Line 1486: creates worktree via `commissionWorktreePath`. Correct.
- Lines 1493-1498: transitions to dispatched in `worktreeDir`. Correct (now in activity worktree).
- Lines 1500-1506: reads artifact from `worktreeDir`. Correct.
- Line 1588: passes `found.projectPath` to `runCommissionSession`. See note below.

**runCommissionSession** (line 1015):
The `projectPath` parameter receives `found.projectPath` (the user's original project directory, e.g., `/home/user/Projects/my-project`). This is used for:
- Line 1046: `resolveToolSet({ projectPath, ... workingDirectory: commission.worktreeDir })`. The toolbox-resolver passes `projectPath` to the meeting/commission toolbox and `workingDirectory` to override writes. For commissions, the commission-toolbox receives `context.workingDirectory ?? context.projectPath` (line 102 of toolbox-resolver.ts), so writes correctly go to the activity worktree. The base toolbox doesn't use `projectPath` for file I/O.
- Line 1055: `integrationPath` for managerToolboxDeps is correctly resolved.
- Line 1061: `projectRepoPath: projectPath` for git operations (createBranch, etc.). This is the actual repo path, not a worktree. Correct for git operations that need the main repo.
- Line 1135: passed to `buildCommissionActivationContext`. Used for `ActivationContext.projectPath`, which workers can read but shouldn't write to directly (writes go through toolbox or the working directory).

**handleCompletion** (lines 1637-1654):
Writes to `commission.worktreeDir` for active commission. Correct.

**syncStatusToIntegration** (line 788):
`integrationWorktreePath(ghHome, commission.projectName)`. Correct: explicit sync to integration after merge.

**handleCompletion git cleanup** (line 1685):
`integrationWorktreePath(ghHome, commission.projectName)` for squash-merge target. Correct.

**updateCommissionFn** (line 1380):
`resolveArtifactBasePath(commissionId, found.projectName)`. Correct: pending commissions resolve to integration worktree.

**addUserNote** (line 2076):
`resolveArtifactBasePath(commissionId, found.projectName)`. Correct: writes to whichever worktree the commission currently lives in.

**recoverDeadCommission** (line 2246):
`integrationWorktreePath(ghHome, projectName)` for writing failed status. Correct: after recovery, the activity worktree is being cleaned up, so the integration worktree gets the final status.

### `daemon/services/meeting-session.ts`

**declineMeeting** (line 331):
`integrationWorktreePath(ghHome, projectName)`. Correct: declined meetings are on the integration worktree (they were never opened/branched, or this is closing a request).

**acceptMeetingRequest** (line 791):
Reads from `integrationWorktreePath` before branching, then writes to `worktreeDir` after creating the activity worktree. Correct.

**createMeeting** (line 1006):
Creates worktree, then writes artifact to `worktreeDir` (line 1024). Correct.

**buildActivatedQueryOptions** (lines 496-568):
- `integrationPath: integrationWorktreePath(ghHome, meeting.projectName)` for propose_followup. Correct.
- `workingDirectory: meeting.worktreeDir` for toolbox writes. Correct.
- `projectPath` passed as `project.path`. This is the user's project directory. Used for toolbox-resolver context, not direct writes.

**closeMeeting** (lines 1328-1420):
- Notes generation: passes `meeting.worktreeDir` (line 1345). Correct.
- Artifact updates: all use `meeting.worktreeDir` (lines 1367-1385). Correct.
- Squash-merge target: `integrationWorktreePath(ghHome, meeting.projectName)` (line 1417). Correct.

**recoverMeetings** (line 1290):
Lost worktrees are closed on `integrationWorktreePath`. Correct: the activity worktree is gone, so the integration worktree is the only place to record the closure.

**createMeetingRequest** (line 1604):
Writes to `integrationWorktreePath`. Correct: meeting requests need to be visible on the dashboard immediately.

### `daemon/services/toolbox-resolver.ts`

| Line | Path Used | Verdict |
|------|-----------|---------|
| 86 | `projectPath: context.projectPath` for meeting toolbox | Correct, but only used as fallback. The `worktreeDir` override takes precedence for writes. |
| 102 | `projectPath: context.workingDirectory ?? context.projectPath` for commission toolbox | Correct. `workingDirectory` is set to the activity worktree during dispatch. |

### `daemon/services/commission-toolbox.ts`

The `CommissionToolboxDeps.projectPath` comment (line 32-34) explicitly documents: "Must be the activity worktree path." The toolbox-resolver passes `workingDirectory ?? projectPath`, and for active commissions `workingDirectory` is always set. Correct.

### `daemon/services/meeting-toolbox.ts`

**makeLinkArtifactHandler** (line 88):
`worktreeDir ?? projectPath`. During active meetings, `worktreeDir` is set. Correct.

**makeProposeFollowupHandler** (line 194):
Receives `deps.integrationPath ?? deps.projectPath`. Writes meeting request to integration worktree so dashboard sees it immediately. Correct. This is an intentional design decision documented in the comment on lines 251-252.

**makeSummarizeProgressHandler** (line 214):
`worktreeDir ?? projectPath`. Correct.

### `daemon/services/notes-generator.ts`

**generateMeetingNotes** (line 105):
Receives `projectPath` from caller. Called from `closeMeeting` with `meeting.worktreeDir` (line 1345 of meeting-session.ts). Correct: reads linked artifacts from the activity worktree where the meeting was running.

### `daemon/services/briefing-generator.ts`

**generateBriefing** (line 173):
`integrationWorktreePath(deps.guildHallHome, projectName)` for building manager context. Correct: briefings summarize the project state from the integration worktree.

### `daemon/services/manager-toolbox.ts`

**makeAddCommissionNoteHandler** (line 453):
`resolveCommissionBasePath(deps.guildHallHome, deps.projectName, args.commissionId)`. Correct: dynamic resolution ensures notes go to the right worktree based on commission status.

### `daemon/services/meeting-artifact-helpers.ts` and `commission-artifact-helpers.ts`

Both accept `projectPath` as a parameter and document that callers are responsible for passing the correct path (PATH OWNERSHIP comment at lines 10-22 of meeting-artifact-helpers.ts). This is correct but structurally fragile (see recommendations).

### `daemon/app.ts`

**createProductionApp** (line 101):
`integrationWorktreePath(guildHallHome, project.name)` for verifying/recreating integration worktrees at startup. Correct.

---

## CLI

### `cli/register.ts`

| Line | Path Used | Verdict |
|------|-----------|---------|
| 72 | `integrationWorktreePath(ghHome, name)` | Correct. Creates the integration worktree directory during registration. |
| 77 | `activityWorktreeRoot(ghHome, name)` | Correct. Creates the activity worktree root directory. |

### `cli/rebase.ts`

| Line | Path Used | Verdict |
|------|-----------|---------|
| 102, 220 | `integrationWorktreePath(home, projectName)` | Correct. Rebase and sync operate on the integration worktree. |

---

## lib/ Modules (Shared by Next.js and Daemon)

### `lib/paths.ts`

The `resolveCommissionBasePath` and `resolveMeetingBasePath` functions read state files to dynamically resolve paths. They fall back to `integrationWorktreePath` when the state file is missing or the commission/meeting is inactive. This is correct and these are the only path functions that perform I/O.

### `lib/meetings.ts`

**getActiveMeetingWorktrees** (line 171): Scans state files for open meetings and returns their `worktreeDir` values. Called by the project page to merge active meeting artifacts with integration worktree artifacts. Correct.

**scanMeetings/scanMeetingRequests**: Accept `projectLorePath` as a parameter. The caller is responsible for passing the correct lore path. All callers in the codebase pass the integration worktree path, which is correct for these scanning functions.

### `lib/commissions.ts`

**scanCommissions**: Same pattern as meetings. Accepts `projectLorePath`, callers pass integration worktree lore path. Correct.

---

## Findings

### No Violations

Every call site uses the correct path for its execution context. The Phase 5 git integration was applied consistently.

### Structural Fragility Points

These are not bugs but areas where a future change could introduce a violation:

1. **Artifact helper functions rely on caller discipline.** Both `meeting-artifact-helpers.ts` and `commission-artifact-helpers.ts` accept a bare `projectPath: string` parameter. There is no type-level distinction between an integration worktree path, an activity worktree path, or a user project path. A future caller could pass the wrong one and the compiler wouldn't catch it. The `PATH OWNERSHIP` comment in meeting-artifact-helpers.ts (lines 10-22) documents this explicitly, which is good, but comments are not enforcement.

2. **`runCommissionSession` receives `found.projectPath` (user's project dir).** This is correct today because it's only used for git operations and as a fallback in activation context. But if anyone adds direct file I/O using this parameter, writes would land in the user's working tree instead of the activity worktree.

3. **`notes-generator.ts` trusts its caller for path correctness.** It receives `projectPath` and uses it to read linked artifacts. Today the only caller (`closeMeeting`) passes `meeting.worktreeDir`, which is correct. A future caller passing the wrong path would read stale data.

4. **`MeetingToolboxDeps.projectPath` fallback.** If `worktreeDir` is ever not set for an active meeting, `link_artifact` and `summarize_progress` would write to `projectPath` (the user's project dir). Today `worktreeDir` is always set for active meetings, but the fallback path could silently corrupt the branching model if that invariant breaks.

---

## Recommendation: Branded Path Types

The issue file asks whether type-level guards could prevent regressions. The answer is yes, branded types would catch the most common class of mistakes (passing the wrong kind of path to a function).

Proposed approach:

```typescript
// In lib/paths.ts
declare const IntegrationPathBrand: unique symbol;
declare const ActivityPathBrand: unique symbol;
declare const ProjectPathBrand: unique symbol;

export type IntegrationPath = string & { readonly [IntegrationPathBrand]: true };
export type ActivityPath = string & { readonly [ActivityPathBrand]: true };
export type ProjectPath = string & { readonly [ProjectPathBrand]: true };

// Path constructors return branded types
export function integrationWorktreePath(ghHome: string, projectName: string): IntegrationPath { ... }
export function commissionWorktreePath(...): ActivityPath { ... }
export function meetingWorktreePath(...): ActivityPath { ... }
```

Functions that accept only one kind of path would declare it in their signature:

```typescript
// Only accepts integration worktree paths
function scanPendingCommissions(integrationPath: IntegrationPath): ...

// Only accepts activity worktree paths
function createCommissionToolbox(deps: { projectPath: ActivityPath; ... }): ...

// Accepts either (e.g., resolveArtifactBasePath returns IntegrationPath | ActivityPath)
function commissionArtifactPath(basePath: IntegrationPath | ActivityPath, ...): ...
```

**Cost:** Moderate. Requires updating all function signatures and adding cast points where dynamic resolution occurs (e.g., `resolveArtifactBasePath`). The `resolveCommission/MeetingBasePath` functions in lib/paths.ts would need to return a union type.

**Benefit:** Compile-time prevention of the most dangerous class of path bugs. A developer accidentally passing `projectPath` where `worktreeDir` is expected would get a type error.

**Recommendation:** Worth doing if the project continues to add features that touch the path layer. Not urgent given the current audit shows no violations. Could be introduced incrementally, starting with the most dangerous boundaries (commission-toolbox, meeting-toolbox).
