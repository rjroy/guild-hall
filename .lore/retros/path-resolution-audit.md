---
title: Path Resolution Audit
date: 2026-02-28
status: complete
tags: [audit, paths, worktrees, data-integrity]
modules: [lib-paths, daemon, next-app]
related: [_archive/issues/path-resolution-audit.md]
---

# Path Resolution Audit

References: `.lore/_archive/issues/path-resolution-audit.md`

## Methodology

Every call site that resolves a project path for reads or writes was traced across the codebase. Each was evaluated against the path selection rule:

- **Outside active work** (Next.js page loads, daemon route handlers serving UI, briefing generation): use `integrationWorktreePath()` or the `resolveCommission/MeetingBasePath()` dynamic resolver.
- **Inside a commission or meeting context** (SDK session, toolbox handlers, artifact writes during active work): use the activity worktree path (`worktreeDir`).

## Summary

**No path selection violations found.** The codebase consistently applies the correct path for each execution context. The Phase 5 migration to integration worktrees was thorough, and the toolbox composability refactor (Phase 3 of the toolbox plan) further improved path safety by centralizing write-path resolution into `resolveWritePath()` in `daemon/lib/toolbox-utils.ts`. One design decision (propose_followup writing to integration path) is intentional but easy to misread.

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

**Commission creation** (line ~1283):
`integrationWorktreePath(ghHome, projectName)` to write the new commission artifact. Correct: new commissions start on the integration worktree before dispatch creates an activity branch.

**scanPendingCommissions** (line ~434):
`integrationWorktreePath(ghHome, project.name)` to scan for pending commissions. Correct: pending commissions live on the integration worktree.

**checkDependencyTransitions** (line ~560):
`integrationWorktreePath(ghHome, projectName)` for scanning and resolving dependencies. Correct: dependencies are checked against the integration worktree (the shared branch).

**findProjectPathForCommission** (line ~739):
`integrationWorktreePath(ghHome, project.name)` to find the project containing a commission. Correct: artifact lookup searches the integration worktree.

**resolveArtifactBasePath** (line ~771):
Active commissions return `active.worktreeDir`; inactive return `integrationWorktreePath`. Correct: this is the daemon-internal version of the same pattern as `resolveCommissionBasePath` in lib/paths.ts.

**dispatchCommission** (line ~1420):
- Reads status from `found.integrationPath`. Correct (pre-dispatch, artifact is on integration worktree).
- Commits to `found.integrationPath`. Correct (ensures activity branch fork includes the commission).
- Creates worktree via `commissionWorktreePath`. Correct.
- Transitions to dispatched in `worktreeDir`. Correct (now in activity worktree).
- Reads artifact from `worktreeDir`. Correct.
- Passes `found.projectPath` to `runCommissionSession`. See note below.

**runCommissionSession** (line ~1013):
The `projectPath` parameter receives `found.projectPath` (the user's original project directory). After the toolbox composability refactor, path handling changed here. The session now builds a `GuildHallToolboxDeps` context with `contextId`, `contextType`, `projectName`, and `guildHallHome`. Individual toolbox factories derive their write paths internally via `resolveWritePath()` rather than receiving pre-resolved paths. The session still passes `projectPath` for git operations and activation context.

**handleCompletion** (line ~1592):
Writes to `commission.worktreeDir` for active commission. Correct.

**syncStatusToIntegration** (line ~785):
`integrationWorktreePath(ghHome, commission.projectName)`. Correct: explicit sync to integration after merge.

**updateCommissionFn** (line ~1349):
`resolveArtifactBasePath(commissionId, found.projectName)`. Correct: pending commissions resolve to integration worktree.

**addUserNote** (line ~2051):
`resolveArtifactBasePath(commissionId, found.projectName)`. Correct: writes to whichever worktree the commission currently lives in.

**recoverDeadCommission** (line ~2224):
`integrationWorktreePath(ghHome, projectName)` for writing failed status. Correct: after recovery, the activity worktree is being cleaned up, so the integration worktree gets the final status.

### `daemon/services/meeting-session.ts`

**declineMeeting** (line ~324):
`integrationWorktreePath(ghHome, projectName)`. Correct: declined meetings are on the integration worktree (they were never opened/branched, or this is closing a request).

**acceptMeetingRequest** (line ~758):
Reads from `integrationWorktreePath` before branching, then writes to `worktreeDir` after creating the activity worktree. Correct.

**createMeeting** (line ~957):
Creates worktree, then writes artifact to `worktreeDir`. Correct.

**buildActivatedQueryOptions** (line ~477):
After the toolbox composability refactor, this function builds a `GuildHallToolboxDeps` context with `contextId`, `contextType`, `projectName`, and `guildHallHome`. It passes `contextFactories` (an array of `ToolboxFactory` functions) to `resolveToolSet()`. The meeting toolbox factory derives write paths internally via `resolveWritePath()`. The `propose_followup` tool is a special case: it writes to the integration worktree (not the activity worktree) so meeting requests are visible on the dashboard immediately.

**closeMeeting** (line ~1329):
- Notes generation: passes `meeting.worktreeDir`. Correct.
- Artifact updates: all use `meeting.worktreeDir`. Correct.
- Squash-merge target: `integrationWorktreePath(ghHome, meeting.projectName)`. Correct.

**recoverMeetings** (line ~1229):
Lost worktrees are closed on `integrationWorktreePath`. Correct: the activity worktree is gone, so the integration worktree is the only place to record the closure.

**createMeetingRequest** (line ~1585):
Writes to `integrationWorktreePath`. Correct: meeting requests need to be visible on the dashboard immediately.

### `daemon/lib/toolbox-utils.ts` (New: Composability Refactor)

Centralized path utilities extracted during the toolbox composability refactor:

**`resolveWritePath(guildHallHome, projectName, contextId, contextType)`** (line ~66):
The canonical write-path resolver for all toolbox handlers. Checks if the activity worktree exists via `fs.access()`. If accessible, returns the activity worktree path; if it throws, falls back to the integration worktree path. This replaced the scattered `worktreeDir ?? projectPath` fallback patterns that previously existed in each toolbox.

Also contains `validateContainedPath()`, `formatTimestamp()`, and `escapeYamlValue()`, deduplicated from their former locations in base-toolbox, meeting-toolbox, manager-toolbox, and commission-artifact-helpers.

### `daemon/services/toolbox-types.ts` (New: Composability Refactor)

Defines the unified interface all toolbox factories conform to:

```
GuildHallToolboxDeps { guildHallHome, projectName, contextId, contextType, workerName }
ToolboxFactory = (deps: GuildHallToolboxDeps) => ToolboxOutput
```

Path resolution is no longer the resolver's responsibility. Each factory receives IDs and derives paths internally (via `resolveWritePath()` or `integrationWorktreePath()`). Service handles (eventBus, gitOps, etc.) are bound via partial application before factory registration, not passed through the generic interface.

### `daemon/services/toolbox-resolver.ts`

Factory-driven assembly (line ~40). The resolver receives pre-bound `ToolboxFactory` functions as `contextFactories`, builds a `GuildHallToolboxDeps` from context, and calls each factory. No path resolution logic lives here. Correct: path decisions are pushed to the individual factories that understand their write semantics.

### `daemon/services/commission-toolbox.ts`

All three tool handlers (`report_progress`, `submit_result`) call `resolveWritePath(deps.guildHallHome, deps.projectName, deps.contextId, "commission")` to determine where to write. The internal `CommissionToolboxDeps` holds `guildHallHome`, `projectName`, `contextId`, and `eventBus`. The public adapter `createCommissionToolboxFactory(eventBus)` binds the EventBus and returns a `ToolboxFactory`. Correct: writes land in the activity worktree when active, integration worktree otherwise.

### `daemon/services/meeting-toolbox.ts`

`link_artifact` and `summarize_progress` call `resolveWritePath(deps.guildHallHome, deps.projectName, deps.contextId, "meeting")`. Correct.

`propose_followup` is the intentional exception: it writes to `integrationWorktreePath()` directly (not the activity worktree) so meeting requests are visible on the dashboard immediately. This is documented in comments within the handler.

The public adapter `meetingToolboxFactory` is a direct pass-through since meeting tools need no extra service deps.

### `daemon/services/manager-toolbox.ts`

`makeAddCommissionNoteHandler` uses `resolveCommissionBasePath(deps.guildHallHome, deps.projectName, args.commissionId)`. Correct: dynamic resolution ensures notes go to the right worktree based on commission status. The public adapter `createManagerToolboxFactory(services)` binds CommissionSession, EventBus, GitOps, and getProjectConfig via closure.

### `daemon/services/notes-generator.ts`

**generateMeetingNotes** (line ~105):
Receives `projectPath` from caller. Called from `closeMeeting` with `meeting.worktreeDir`. Correct: reads linked artifacts from the activity worktree where the meeting was running.

### `daemon/services/briefing-generator.ts`

**generateBriefing** (line ~173):
`integrationWorktreePath(deps.guildHallHome, projectName)` for building manager context. Correct: briefings summarize the project state from the integration worktree.

### `daemon/services/meeting-artifact-helpers.ts` and `commission-artifact-helpers.ts`

Both accept `projectPath` as a parameter and document that callers are responsible for passing the correct path (PATH OWNERSHIP comments). Since the toolbox composability refactor, the primary callers are toolbox handlers that resolve paths via `resolveWritePath()`, reducing the risk of incorrect path injection.

### `daemon/app.ts`

**createProductionApp** (line ~101):
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

1. **Artifact helper functions rely on caller discipline.** Both `meeting-artifact-helpers.ts` and `commission-artifact-helpers.ts` accept a bare `projectPath: string` parameter. No type-level distinction between path kinds exists. The toolbox composability refactor reduced risk here: the primary callers are now toolbox handlers that resolve paths via `resolveWritePath()`, so the "caller discipline" gap is narrower. But the helpers themselves remain unguarded.

2. **`runCommissionSession` receives `found.projectPath` (user's project dir).** This is correct today because it's only used for git operations and activation context. Toolbox writes now go through `resolveWritePath()` in each factory, so the old risk of adding direct file I/O using this parameter is lower. Still worth noting as a raw string in the session scope.

3. **`notes-generator.ts` trusts its caller for path correctness.** It receives `projectPath` and uses it to read linked artifacts. Today the only caller (`closeMeeting`) passes `meeting.worktreeDir`, which is correct. A future caller passing the wrong path would read stale data.

4. **`resolveWritePath()` fallback is silent.** If `fs.access()` fails on the activity worktree (e.g., it was cleaned up mid-session), `resolveWritePath()` silently falls back to the integration worktree. This is the intended behavior for recovery scenarios, but a race condition during normal operation could cause a write to land on the integration worktree instead of the activity worktree without any error signal.

### Previously Identified, Now Resolved

- ~~**`MeetingToolboxDeps.projectPath` fallback.**~~ The old `worktreeDir ?? projectPath` fallback in individual tool handlers has been replaced by `resolveWritePath()`, which derives paths from IDs rather than relying on a pre-resolved `worktreeDir` field being set. If the activity worktree doesn't exist, the fallback is to the integration worktree (not the user's project dir).

---

## Recommendation: Branded Path Types

The original audit proposed branded types for compile-time path safety. The toolbox composability refactor changed the calculus: toolbox handlers no longer receive pre-resolved path strings. They receive IDs (`contextId`, `contextType`, `projectName`, `guildHallHome`) and call `resolveWritePath()` internally.

**What branded types would still protect:**
- Artifact helper functions (`meeting-artifact-helpers.ts`, `commission-artifact-helpers.ts`) that accept bare `projectPath: string`
- Session-level code in `commission-session.ts` and `meeting-session.ts` that passes paths to non-toolbox functions (notes generator, git merge targets, recovery writes)
- `resolveArtifactBasePath` return value, which callers must handle correctly

**What branded types would NOT help with:**
- Toolbox handlers, which now derive paths from IDs via `resolveWritePath()`. The path kind is determined by the function, not the caller.

**Revised recommendation:** Lower priority than before. The most dangerous path boundary (toolbox writes) is now protected by `resolveWritePath()`. Branded types would still help at the session/helper layer, but the risk surface is smaller. Consider if new features add more path-sensitive call sites.
