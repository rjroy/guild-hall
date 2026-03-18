---
title: Commission Status Tool
date: 2026-03-14
status: implemented
tags: [manager-toolbox, commissions, read-tool, guild-master]
modules: [guild-hall-manager, commissions]
related:
  - .lore/specs/commissions/guild-hall-commissions.md
  - .lore/specs/infrastructure/daemon-application-boundary.md
req-prefix: CST
---

# Spec: Commission Status Tool

## Overview

A read tool in the manager toolbox that lets the Guild Master check commission status without reading raw artifact files. The manager can create, dispatch, cancel, and abandon commissions through tools, but has no corresponding tool to check their status. This closes that gap. Single commission lookup by ID, or a summary of recent/active commissions when no ID is given.

## Entry Points

- Guild Master wants to know the current state of a specific commission it dispatched (from manager session)
- Guild Master needs an overview of active and recent commissions before deciding what to do next (from manager session)

## Requirements

### Tool Definition

- REQ-CST-1: The manager toolbox registers a tool named `check_commission_status`. It accepts an optional `commissionId` string parameter. When `commissionId` is provided, it returns detail for that commission. When omitted, it returns a summary list of commissions for the current project.

- REQ-CST-2: The tool description includes both operation IDs: `[operationId: commission.request.commission.read, commission.request.commission.list]`. Existing tools have one operationId each, but this tool backs two read routes through a single optional parameter. Both IDs appear in the static description string.

### Single Commission Mode

- REQ-CST-3: When `commissionId` is provided, the tool reads the commission artifact directly using `readCommissionMeta()` from `lib/commissions.ts`, resolving the artifact path via `resolveCommissionBasePath()` from `lib/paths`. For scheduled commissions, it additionally parses schedule metadata from the raw frontmatter using gray-matter (same approach as the existing read route in `daemon/routes/commissions.ts`).

- REQ-CST-4: The tool returns a JSON object with these fields:
  - `commissionId`: the commission identifier
  - `title`: commission title
  - `status`: current state (pending, blocked, dispatched, in_progress, completed, failed, cancelled, abandoned, sleeping)
  - `worker`: assigned worker name
  - `type`: "one-shot" or "scheduled"
  - `date`: creation date
  - `current_progress`: latest progress report (if any)
  - `result_summary`: result text (if completed or failed with partial result)
  - `linked_artifacts`: list of artifact paths produced (if any)

- REQ-CST-5: For scheduled commissions, the response additionally includes:
  - `schedule.cron`: cron expression
  - `schedule.runsCompleted`: number of completed runs
  - `schedule.lastRun`: ISO timestamp of last run (or null)
  - `schedule.nextRun`: ISO timestamp of next scheduled run (or null)

### List Mode

- REQ-CST-6: When `commissionId` is omitted, the tool reads all commissions using `scanCommissions()` from `lib/commissions.ts`, resolving the integration worktree path via `integrationWorktreePath()` from `lib/paths`.

- REQ-CST-7: The tool returns a JSON object with a `commissions` array. Each entry is a projection of `CommissionMeta` from `lib/commissions.ts`, keeping the same field names (mixed casing matches the source type). The projection includes:
  - `commissionId`
  - `title`
  - `status`
  - `worker`
  - `type`
  - `current_progress` (truncated to 200 characters if longer)
  - `result_summary` (truncated to 200 characters if longer)

  Other `CommissionMeta` fields (`prompt`, `dependencies`, `workerDisplayTitle`, `sourceSchedule`, `resource_overrides`, `date`, `relevantDate`, `linked_artifacts`, `projectName`) are omitted to keep the list compact. The full data is available through single-commission mode.

  The list is sorted by `sortCommissions()` from `lib/commissions.ts`: idle first (oldest first), then active, then failed, then completed (newest first).

- REQ-CST-8: List mode includes a `summary` object at the top level with counts by status group: `{ pending: N, active: N, failed: N, completed: N, total: N }`. Status-to-group mapping:
  - **pending**: pending, blocked
  - **active**: dispatched, in_progress, sleeping
  - **failed**: failed, cancelled
  - **completed**: completed, abandoned

  This follows the same grouping as `STATUS_GROUP` in `lib/commissions.ts` (groups 0, 1, 2, 3 respectively). The summary gives the Guild Master a quick picture without scanning every entry.

### Data Access

- REQ-CST-9: Unlike the write tools (which call daemon routes via `callRoute` per REQ-DAB-7), this read tool accesses commission data directly through `lib/commissions.ts`. The existing daemon read routes use GET with query parameters, but `callRoute` (`RouteCaller` type) only supports POST with JSON bodies. Extending the typed interface for a single read tool isn't worth the cost. Direct reads are the established pattern for read-only operations in the manager context: the briefing generator (`daemon/services/briefing-generator.ts`) already reads commission data this way.

- REQ-CST-10: The tool needs `guildHallHome` from `ManagerToolboxDeps` (already available) to resolve integration worktree paths via `integrationWorktreePath()`. No new dependencies are required.

### Error Handling

- REQ-CST-11: When a commission ID is provided but not found, the tool returns `isError: true` with a message: `Commission not found: {commissionId}`.

- REQ-CST-12: When the project is not registered or the commissions directory doesn't exist, list mode returns an empty commissions array and zeroed summary counts. This is not an error; a project with no commissions is a valid state.

### Registration

- REQ-CST-13: The tool is registered in `createManagerToolbox()` alongside the existing ten tools. It uses the same `tool()` helper from the Agent SDK, with a Zod schema defining the optional `commissionId` parameter.

- REQ-CST-14: The tool handler follows the existing pattern: a `makeCheckCommissionStatusHandler(deps)` factory function that returns an async handler, consistent with `makeCreateCommissionHandler`, `makeCancelCommissionHandler`, etc.

## Success Criteria

- [ ] `check_commission_status` tool is available in the manager toolbox
- [ ] Single commission lookup returns status, worker, title, date, progress, and result summary
- [ ] List mode returns sorted commission summaries with status counts
- [ ] Scheduled commissions include schedule metadata in single-commission mode
- [ ] Commission not found returns an error result, not a crash
- [ ] Empty project returns empty list, not an error

## AI Validation

**Defaults:**
- Unit tests with mocked filesystem
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Verify tool appears in the MCP server's tool list with correct schema
- Test both modes (with and without commissionId)
- Test with a mix of commission states to verify list mode sorting and summary counts
- Test scheduled commission metadata inclusion

## Constraints

- Read-only. This tool does not modify commission state.
- The manager toolbox file (`daemon/services/manager/toolbox.ts`) is already 1075 lines. The handler factory should be kept concise; most of the work is data reshaping, not business logic.
- The tool operates on the current project only (from `deps.projectName`). Cross-project commission queries are out of scope.

## Context

- [Spec: Guild Hall Commissions](.lore/specs/commissions/guild-hall-commissions.md): Commission lifecycle states, artifact format, commission toolbox.
- [Spec: Daemon Application Boundary](.lore/specs/infrastructure/daemon-application-boundary.md): REQ-DAB-7 (tools call daemon routes), REQ-DAB-11 (internal tools without routes).
- Existing daemon routes: `GET /commission/request/commission/list` and `GET /commission/request/commission/read` in `daemon/routes/commissions.ts`.
- Existing read functions: `scanCommissions()` and `readCommissionMeta()` in `lib/commissions.ts`.
- Manager toolbox pattern: `daemon/services/manager/toolbox.ts` shows the factory pattern, route calling, and tool registration.
