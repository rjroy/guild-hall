---
title: "Normalize Toolbox Deps"
date: 2026-02-27
status: complete
tags: [plan, refactor, toolbox]
modules: [base-toolbox, meeting-toolbox, commission-toolbox, manager-toolbox, toolbox-resolver]
related:
  - plans/toolbox-composability-refactor.md
  - plans/implementation-phases.md
---

# Normalize Toolbox Deps

## Context

Phase 1 extracted shared utilities. Now we normalize the four bespoke deps interfaces so they share a common vocabulary and derive paths from IDs instead of receiving pre-computed strings. This sets up Phase 3 (generic factory interface) by making the deps shapes converge.

## Changes

### 1. Add `resolveWritePath()` helper

**File:** `daemon/lib/toolbox-utils.ts`

Add an async function that resolves the write target for a toolbox:
```
async resolveWritePath(guildHallHome, projectName, contextId, contextType) =>
  worktree exists? → worktree path : integration path
```

Uses existing helpers from `lib/paths.ts`:
- `integrationWorktreePath(ghHome, projectName)`
- `commissionWorktreePath(ghHome, projectName, contextId)` (when contextType is "commission")
- `meetingWorktreePath(ghHome, projectName, contextId)` (when contextType is "meeting")

Worktree validity check: `fs.access(worktreePath)`. If the directory exists, it's valid. No git-level checks needed for write-path resolution.

### 2. Collapse manager DI seams

**File:** `daemon/services/manager-toolbox.ts`

Remove from `ManagerToolboxDeps`:
- `configPath` (unused in all tests, redundant with `getProjectConfig`)
- `defaultBranch` (derivable from `getProjectConfig()`)
- `projectRepoPath` (derivable from `getProjectConfig()`)

Make `getProjectConfig` required (not optional). The two handlers that use these values (`makeCreatePrHandler`, `makeSyncProjectHandler`) call `getProjectConfig(projectName)` to get `path` and `defaultBranch` at invocation time.

The `integrationPath` field also becomes derivable: `integrationWorktreePath(guildHallHome, projectName)`. Remove it from the deps, derive it internally.

**Updated `ManagerToolboxDeps`:**
```typescript
interface ManagerToolboxDeps {
  projectName: string;
  guildHallHome: string;
  commissionSession: CommissionSessionForRoutes;
  eventBus: EventBus;
  gitOps: GitOps;
  getProjectConfig: (name: string) => Promise<ProjectConfig | undefined>;
}
```

**Files also affected:**
- `daemon/services/manager-toolbox.ts` handlers: `makeCreatePrHandler` and `makeSyncProjectHandler` call `getProjectConfig(deps.projectName)` for `path` and `defaultBranch`. `makeInitiateMeetingHandler` and `makeCreateCommissionHandler` derive `integrationPath` from `integrationWorktreePath(deps.guildHallHome, deps.projectName)`.
- `tests/daemon/services/manager-toolbox.test.ts`: `makeDeps()` drops `integrationPath`, `projectRepoPath`, `defaultBranch`, `configPath`. Adds required `getProjectConfig`. Tests that verify `defaultBranch` usage inject it via the `getProjectConfig` return value.
- `tests/daemon/services/manager-sync-project.test.ts`: Already provides `getProjectConfig`, just remove the other three fields from `makeDeps()`.

### 3. Normalize meeting-toolbox deps

**File:** `daemon/services/meeting-toolbox.ts`

Replace the three-path dance with IDs + derivation:

**Current:**
```typescript
interface MeetingToolboxDeps {
  projectPath: string;
  integrationPath?: string;
  worktreeDir?: string;
  meetingId: string;
  workerName: string;
  guildHallHome?: string;
}
```

**New:**
```typescript
interface MeetingToolboxDeps {
  guildHallHome: string;
  projectName: string;
  contextId: string;        // was meetingId
  workerName: string;
}
```

Handlers derive paths internally:
- `link_artifact` and `summarize_progress`: use `resolveWritePath()` at invocation time
- `propose_followup`: uses `integrationWorktreePath()` (always writes to integration, needs to be visible before merge)

The `make*Handler` functions change from receiving raw paths to receiving the four atomic IDs and deriving paths. This changes handler signatures but not behavior.

**Tests:** `tests/daemon/meeting-toolbox.test.ts` updates handler construction to pass IDs instead of paths. Tests set up the same temp directory structure but the handlers derive paths from IDs.

### 4. Normalize commission-toolbox deps

**File:** `daemon/services/commission-toolbox.ts`

**Current:**
```typescript
interface CommissionToolboxDeps {
  projectPath: string;      // actually the activity worktree
  commissionId: string;
  guildHallHome?: string;   // dead field
  onProgress: (summary: string) => void;
  onResult: (summary: string, artifacts?: string[]) => void;
  onQuestion: (question: string) => void;
}
```

**New:**
```typescript
interface CommissionToolboxDeps {
  guildHallHome: string;
  projectName: string;
  contextId: string;        // was commissionId
  onProgress: (summary: string) => void;
  onResult: (summary: string, artifacts?: string[]) => void;
  onQuestion: (question: string) => void;
}
```

Handlers derive the write path via `resolveWritePath()` instead of receiving `projectPath`.

**Tests:** `tests/daemon/commission-toolbox.test.ts` updates to pass IDs. Tests must set up temp dirs at the paths that `resolveWritePath()` will resolve to (the worktree path for active commissions, or integration path as fallback).

### 5. Normalize base-toolbox deps

**File:** `daemon/services/base-toolbox.ts`

Rename `contextId`/`contextType` fields (already correct names, no change needed). Make `guildHallHome` required (remove the optional + fallback pattern, callers always provide it).

**Current:**
```typescript
interface BaseToolboxDeps {
  contextId: string;
  contextType: "meeting" | "commission";
  workerName: string;
  projectName: string;
  guildHallHome?: string;   // optional with fallback
}
```

**New:**
```typescript
interface BaseToolboxDeps {
  contextId: string;
  contextType: "meeting" | "commission";
  workerName: string;
  projectName: string;
  guildHallHome: string;    // required
}
```

Remove `defaultGuildHallHome()` fallback function.

### 6. Update toolbox-resolver and call sites

**File:** `daemon/services/toolbox-resolver.ts`

`ToolboxResolverContext` shrinks. Remove `projectPath`, `integrationPath`, `workingDirectory`. All toolboxes now derive paths from `guildHallHome` + `projectName` + `contextId` + `contextType`.

The `managerToolboxDeps` field shrinks too (no more `integrationPath`, `projectRepoPath`, `defaultBranch`).

**Files:** `daemon/services/meeting-session.ts`, `daemon/services/commission-session.ts`

Call sites simplify. No more inline `integrationWorktreePath()` calls or `project?.path ?? projectPath` fallbacks when constructing deps. The toolboxes derive what they need.

**File:** `tests/daemon/toolbox-resolver.test.ts`

Update `testContext()` and `makeManagerToolboxDeps()` to match new interfaces.

## Execution Order

1. Add `resolveWritePath()` to `daemon/lib/toolbox-utils.ts`
2. Collapse manager DI seams (self-contained in manager-toolbox + its tests)
3. Normalize base-toolbox deps (smallest change, make `guildHallHome` required)
4. Normalize commission-toolbox deps (IDs instead of paths)
5. Normalize meeting-toolbox deps (IDs instead of paths)
6. Update toolbox-resolver and call sites
7. Typecheck + full test suite

## Verification

- `bun run typecheck` passes
- `bun test` passes (1533+ tests)
- No behavioral changes: all tools write to the same paths, just derived differently
