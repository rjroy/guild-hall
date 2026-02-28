---
title: Create the manager-exclusive system toolbox
date: 2026-02-23
status: complete
tags: [task]
source: .lore/plans/foundation/phase-6-guild-master.md
related: [.lore/specs/guild-hall-workers.md]
sequence: 2
modules: [daemon-services]
---

# Task: Create the Manager-Exclusive System Toolbox

## What

Create `daemon/services/manager-toolbox.ts` as an MCP server following the same factory pattern as `commission-toolbox.ts` and `meeting-toolbox.ts`.

**ManagerToolboxDeps interface:**
- `integrationPath: string` (integration worktree for artifact writes)
- `projectName: string`
- `guildHallHome: string`
- `commissionSession: CommissionSessionForRoutes` (for create/dispatch)
- `gitOps: GitOps` (for PR creation)
- `projectRepoPath: string` (for git operations)
- `defaultBranch: string` (PR target branch)

**Four tools:**

1. **create_commission** `(title, workerName, prompt, dependencies?, resourceOverrides?, dispatch?)`: Creates a commission via `commissionSession.createCommission()`. If `dispatch: true` (default), immediately dispatches via `commissionSession.dispatchCommission()`. Appends a `"manager_dispatched"` timeline entry. Returns commission ID and dispatch status.

2. **dispatch_commission** `(commissionId)`: Dispatches an existing pending commission via `commissionSession.dispatchCommission()`.

3. **create_pr** `(title, body?)`: Placeholder handler that returns "PR creation not yet implemented." Full implementation in Task 10 (PR Implementation). The tool definition and schema are complete; only the handler is deferred.

4. **initiate_meeting** `(workerName, reason, referencedArtifacts?)`: Creates a meeting request artifact in the integration worktree with status "requested", matching the format used by `propose_followup` from meeting-toolbox. Returns the artifact path.

**MCP server:** `createManagerToolbox(deps: ManagerToolboxDeps): McpSdkServerConfigWithInstance`. Server name: `"guild-hall-manager"`.

**Error handling:** All tool handlers catch errors from underlying calls and return `isError: true` with the error message. Tool failures do not crash the meeting session.

## Validation

- create_commission calls `commissionSession.createCommission` with correct parameters
- create_commission with `dispatch: true` calls `dispatchCommission` after creation
- create_commission with `dispatch: false` creates only, does not dispatch
- create_commission appends `"manager_dispatched"` timeline entry on dispatch
- dispatch_commission calls `commissionSession.dispatchCommission` with the given ID
- create_pr returns a "not implemented" message (placeholder)
- initiate_meeting writes a meeting request artifact to the integration worktree
- initiate_meeting artifact has status "requested" and correct frontmatter format (worker, reason, referenced artifacts)
- All tool handlers: errors from underlying services return `isError: true`, do not propagate as exceptions
- MCP server name is `"guild-hall-manager"`
- All tests pass, linting clean, commit created (triggers pre-commit hook validation)

## Why

From `.lore/specs/guild-hall-workers.md`:
- REQ-WKR-25: "The manager has capabilities beyond other workers, provided through a manager-specific system toolbox: commission creation, worker dispatch, PR management, meeting initiation."
- REQ-WKR-26: "The manager's toolbox is a system toolbox, not a domain toolbox. Other workers do not have access."
- REQ-WKR-27: "The manager uses a dispatch-with-review model. It can dispatch commissions immediately without waiting for user approval."

## Files

- `daemon/services/manager-toolbox.ts` (create)
- `tests/daemon/services/manager-toolbox.test.ts` (create)
