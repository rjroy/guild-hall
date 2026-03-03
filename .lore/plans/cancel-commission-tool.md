---
title: "Plan: cancel_commission manager tool"
date: 2026-02-26
status: executed
tags: [manager-toolbox, commissions, cancellation, mcp-tools]
modules: [manager-toolbox, commission-session]
related: [.lore/specs/guild-hall-commissions.md, .lore/specs/guild-hall-workers.md, .lore/plans/foundation/phase-6-guild-master.md]
---

# Plan: cancel_commission Manager Tool

## Goal

Add a `cancel_commission` tool to the Guild Master's manager-exclusive toolbox so the manager can cancel commissions directly instead of asking the user to do it from the UI. This closes a parity gap: the user can cancel via the UI, but the manager currently cannot cancel via tool, which breaks coordination flow (the manager identifies stale work blocking a PR but can't act on it).

The spec already supports this. REQ-COM-5 defines "cancelled" as "User or manager explicitly cancelled the commission." REQ-COM-6 lists valid cancel transitions: pending, blocked, and in_progress can all transition to cancelled. The implementation should reuse the existing `cancelCommission()` method, which handles SIGTERM with 30s grace then SIGKILL (REQ-COM-15).

## Codebase Context

**Manager toolbox** (`daemon/services/manager-toolbox.ts`): Currently defines 6 tools via an MCP server factory `createManagerToolbox(deps)`. Each tool follows a consistent pattern: a `make*Handler(deps)` factory function returning a `ToolResult`, registered with the MCP server via `server.tool(name, description, schema, handler)`. Error handling wraps calls in try/catch, returning `{ isError: true }` with a descriptive message. Success returns JSON via `{ content: [{ type: "text", text: JSON.stringify(...) }] }`.

**ManagerToolboxDeps** already includes `commissionSession: CommissionSessionForRoutes`, which exposes `cancelCommission(commissionId)`. No new dependencies needed.

**Cancellation flow** (`daemon/services/commission-session.ts`, `cancelCommission()` method): Sends SIGTERM, starts 30s grace timer, sends SIGKILL if process doesn't exit. Updates artifact status and timeline, emits `commission_status` event, syncs to integration worktree, commits partial results, removes activity worktree (preserves branch), cleans up from active map, triggers dependency check and auto-dispatch. Currently hardcodes `reason: "Commission cancelled by user"` in three places: the `transitionCommission()` call (artifact timeline), the `eventBus.emit()` call (SSE event), and the `syncStatusToIntegration()` call (integration worktree).

**Route handler** (`daemon/routes/commissions.ts`, DELETE endpoint): Calls `cancelCommission(commissionId)` and translates errors to HTTP status codes: 404 for "not found", 409 for invalid transition, 500 for other errors.

**Toolbox resolver** (`daemon/services/toolbox-resolver.ts`): Gates manager tools via `isManager` flag. No resolver changes needed for adding a tool to the existing MCP server.

**Tests** (`tests/daemon/services/manager-toolbox.test.ts`): Each tool has tests for success and error paths using mock `CommissionSessionForRoutes`. Test pattern: call the handler factory with mock deps, invoke the returned handler, assert on the JSON response structure.

## Implementation Steps

### Step 1: Thread `reason` through `cancelCommission()`

**Files**: `daemon/services/commission-session.ts`

Add an optional `reason` parameter to `cancelCommission()` with a default value of `"Commission cancelled by user"` (preserving current behavior). Pass it through to the three places that use it:

1. The `transitionCommission()` call that writes the artifact timeline entry
2. The `eventBus.emit()` call that broadcasts the SSE event
3. The `syncStatusToIntegration()` call that updates the integration worktree

This is backwards compatible: the DELETE route handler calls `cancelCommission(commissionId)` with no reason, so it gets the default. The new manager tool will pass `"Commission cancelled by manager"` or the manager's stated reason.

Update the `CommissionSessionForRoutes` interface to add the optional `reason` parameter to `cancelCommission`. This is required for the TypeScript compiler to accept the new signature.

### Step 2: Add `cancel_commission` tool to manager toolbox

**Files**: `daemon/services/manager-toolbox.ts`

Add a `makeCancelCommissionHandler(deps)` factory function following the established pattern. Parameters:

- `commissionId` (string, required): ID of the commission to cancel
- `reason` (string, optional): Why the manager is cancelling. Defaults to `"Commission cancelled by manager"`.

Handler logic:
1. Call `deps.commissionSession.cancelCommission(commissionId, reason)`
2. Return success JSON: `{ commissionId, status: "cancelled" }`
3. Catch errors: return `{ isError: true }` with the error message (matching the pattern from `dispatch_commission` which has the same error shapes: not-found and invalid-transition)

Register the tool with the MCP server alongside the existing 6 tools. Use description text that communicates valid cancel states and the SIGTERM/SIGKILL behavior, following the level of detail in existing tool descriptions.

### Step 3: Add tests

**Files**: `tests/daemon/services/manager-toolbox.test.ts`

Add a `describe("cancel_commission")` block with tests matching the existing tool test patterns:

1. **Success case**: Mock `cancelCommission` resolving successfully. Verify handler returns JSON with `{ commissionId, status: "cancelled" }`.
2. **With custom reason**: Mock `cancelCommission` resolving. Verify it's called with the provided reason string.
3. **Commission not found**: Mock `cancelCommission` throwing "not found in active commissions". Verify handler returns `isError: true` with descriptive message.
4. **Invalid transition**: Mock `cancelCommission` throwing "Invalid commission transition". Verify handler returns `isError: true`.
5. **Default reason**: Call without reason parameter. Verify `cancelCommission` is called with `"Commission cancelled by manager"`.

Also add a test for the `reason` parameter in `tests/daemon/commission-session.test.ts`. Note: commission-session tests are integration-style with heavier setup (mock process spawning, event bus, git ops). Follow the existing test patterns in that file.

6. **Custom reason flows through**: Dispatch a commission, cancel with a custom reason string, verify the emitted event includes that reason.

### Step 4: Validate

Run `bun test` to verify all existing tests pass and new tests pass. Run `bun run typecheck` to verify no type errors.

## Delegation Guide

No specialized expertise needed. This is a straightforward addition following established patterns. All changes are in the daemon layer (TypeScript, MCP tools, unit tests).

Consult `.lore/lore-agents.md` for available agents. The `code-simplifier` agent is useful after implementation to verify the new code matches existing patterns. The `silent-failure-hunter` agent could review the error handling in the new tool handler.

## Open Questions

None. The path is well-defined by existing patterns and spec requirements.
