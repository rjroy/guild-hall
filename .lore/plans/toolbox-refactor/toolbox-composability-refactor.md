---
title: "Toolbox Composability Refactor"
date: 2026-02-27
status: executed
tags: [plan, refactor, toolbox]
related:
  - specs/guild-hall-workers.md
  - plans/implementation-phases.md
---

# Toolbox Composability Refactor

## Goal

Replace the four snowflake toolbox implementations with a composable system built on a generic interface. Enable domain toolboxes (the "Phase 3" TODO in toolbox-resolver.ts that was never completed) as a natural consequence of the generic design.

## Current State

Four toolboxes, each with bespoke deps interfaces:

| Toolbox | Tools | Scope |
|---------|-------|-------|
| Base (3 tools) | read_memory, write_memory, record_decision | Always present |
| Meeting (3 tools) | link_artifact, propose_followup, summarize_progress | Meeting sessions |
| Commission (3 tools) | report_progress, submit_result, log_question | Commission sessions |
| Manager (7 tools) | create/dispatch/cancel commission, create_pr, initiate_meeting, add_note, sync_project | Manager role only |

The toolbox-resolver assembles them via an if/else tree. Adding a new toolbox means editing the resolver.

## Findings

### Dead Code
- `guildHallHome` declared but never used in MeetingToolboxDeps and CommissionToolboxDeps
- Duplicated utilities across files: `validateContainedPath` (base + meeting), `formatTimestamp` (meeting + manager), `escapeYamlValue` (manager + commission-artifact-helpers)

### Path Confusion
Three path concepts exist but are named inconsistently and passed as raw strings:

| Concept | Base | Meeting | Commission | Manager |
|---------|------|---------|------------|---------|
| Project repo | - | `projectPath` (fallback) | - | `projectRepoPath` |
| Integration worktree | - | `integrationPath` | - | `integrationPath` |
| Activity worktree | - | `worktreeDir` | `projectPath` (misleading) | - |

All three are derivable from `guildHallHome` + `projectName` + `contextType` + `contextId`. Tools should not receive raw paths; they should receive IDs and derive paths via helpers.

The write target (`artifactWritePath`) should be computed internally:
```
writePath = isWorktreeValid() ? worktreePath : integrationPath
```

### Same Concept, Different Names
- `contextId` (base) vs `meetingId` (meeting) vs `commissionId` (commission): same value
- `contextType` (base) vs implied by which toolbox you're in: same concept

### Redundant DI Seams (Manager)
- `configPath` and `getProjectConfig()` are two levels of DI for the same lookup. Collapse to `getProjectConfig()` only; production wiring provides the real implementation.
- `defaultBranch` is stored in project config. Derivable from `getProjectConfig()`.
- `projectRepoPath` is `project.path` from config. Derivable from `getProjectConfig()`.

### Service Handles are System Toolboxes
Manager deps include `commissionSession`, `eventBus`, `gitOps`. These are daemon-level services injected as capabilities. Same shape as toolbox injection, just not exposed as MCP tools. The composable system should inject these through the same mechanism rather than special-casing them.

### Commission Callbacks (Back-to-Front)
`onProgress`, `onResult`, `onQuestion` are callbacks from toolbox to session. The session creates the toolbox, then the toolbox calls back into the session. Circular dependency that needs a dedicated pass to untangle.

## Phases

### Phase 1: Deduplicate shared utilities
- Extract `validateContainedPath`, `formatTimestamp`, `escapeYamlValue` to a common module
- Replace inline copies in base-toolbox, meeting-toolbox, manager-toolbox
- No behavioral changes, tests should continue passing
- Dead fields (`guildHallHome` in meeting/commission deps) get resolved in Phase 2

### Phase 2: Normalize deps to shared context
- Define path helper functions that derive paths from IDs (integrationPath, worktreePath, projectRepoPath)
- Add `isWorktreeValid()` helper for write-path resolution
- Collapse redundant manager DI seams (`configPath` + `getProjectConfig()` + `defaultBranch` + `projectRepoPath` into `getProjectConfig()`)
- Unify naming: `contextId`/`contextType` everywhere, not `meetingId`/`commissionId`
- Dead fields from current deps interfaces disappear naturally as all toolboxes adopt the shared context

### Phase 3: Extract generic toolbox factory interface
- Define `GuildHallToolboxDeps` (the shared context all toolboxes receive)
- Define the factory signature: `(deps: GuildHallToolboxDeps) => McpSdkServerConfigWithInstance`
- Migrate all four toolboxes to the generic interface
- Handle toolbox-specific extras (commission's `wasResultSubmitted`, manager's service handles) through the generic mechanism

### Phase 4: Untangle commission callbacks
- Redesign the notification flow between commission session and commission toolbox
- Remove the circular dependency where session creates toolbox and toolbox calls back into session

### Phase 5: Make the resolver data-driven
- Replace the if/else tree with composable toolbox selection
- Enable domain toolboxes (external packages providing MCP tools)
- Complete the "Phase 3 TODO" in toolbox-resolver.ts that was never finished

## Resolved Questions

**How does toolbox-specific state (`wasResultSubmitted`) flow back to the caller?**
EventBus + sidecar state on ActiveCommission. The commission toolbox emits `commission_result` events via EventBus after file writes (`commission-toolbox.ts`). The commission session subscribes to those events and updates `commission.resultSubmitted = true` on its tracking object (`commission-session.ts`). The toolbox also keeps a local closure flag to prevent double-calls within a single MCP session.

**Should service handles become injectable "system toolboxes"?**
No. They remain separate, bound via partial application before factory registration. `createCommissionToolboxFactory(eventBus)` and `createManagerToolboxFactory(services)` capture service dependencies in closures and return standard `ToolboxFactory` functions. The generic `GuildHallToolboxDeps` contains only ID/path context (contextId, contextType, projectName, guildHallHome). The resolver never touches service handles.

**What does `isWorktreeValid()` check?**
Absorbed into `resolveWritePath()` in `daemon/lib/toolbox-utils.ts`. Calls `fs.access()` on the worktree directory. If accessible, uses the worktree path; if it throws, falls back to the integration path. "Valid" = directory exists and is accessible.
