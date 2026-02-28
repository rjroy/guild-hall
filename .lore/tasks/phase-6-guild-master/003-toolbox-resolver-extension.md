---
title: Wire manager toolbox into activation flow
date: 2026-02-23
status: complete
tags: [task]
source: .lore/plans/foundation/phase-6-guild-master.md
related: [.lore/specs/guild-hall-workers.md]
sequence: 3
modules: [daemon-services, daemon-app]
---

# Task: Wire Manager Toolbox into Activation Flow

## What

Connect the manager toolbox (Task 2) to the existing toolbox resolver and meeting session so the manager gets its exclusive tools when activated.

**toolbox-resolver.ts changes:**

Add `isManager?: boolean` and `managerToolboxDeps?: ManagerToolboxDeps` to `ToolboxResolverContext`. In `resolveToolSet()`, after the context toolbox slot (step 2), add a conditional injection:

```
if (context.isManager && context.managerToolboxDeps) {
  mcpServers.push(createManagerToolbox(context.managerToolboxDeps));
}
```

Manager gets: base + meeting + manager-exclusive + domain + built-in tools. Other workers get: base + meeting/commission + domain + built-in (unchanged).

**meeting-session.ts changes:**

Add `commissionSession?: CommissionSessionForRoutes` to `MeetingSessionDeps`. In `startSession()`, detect the manager by `workerPkg.name === MANAGER_PACKAGE_NAME`, build `ToolboxResolverContext` with `isManager` flag and `managerToolboxDeps` populated from meeting/project state.

Handle the `path: ""` built-in worker in `activateWorker()`: when `workerPkg.path === ""` and `workerPkg.name === MANAGER_PACKAGE_NAME`, dynamically import and call `activateManager()` instead of loading from filesystem.

**daemon/app.ts production wiring changes:**

1. Reverse creation order: create `commissionSession` first, then `meetingSession` (passing `commissionSession` in its deps).
2. `recoverMeetings()` stays immediately after `meetingSession` creation.
3. Import `createManagerPackage()`, create the synthetic package, prepend to packages list.
4. Pass `allPackages` (manager + discovered) to meeting session, worker routes, and the app factory.

## Validation

- `resolveToolSet` with `isManager: true`: result includes manager toolbox MCP server
- `resolveToolSet` with `isManager: false` (or omitted): result does NOT include manager toolbox
- Manager tools appear in the resolved `allowedTools` whitelist (`mcp__guild-hall-manager__*`)
- Non-manager worker with meeting context: no manager tools in resolved set
- Meeting session identifies the manager by package name comparison
- `activateWorker()` handles `path: ""` for the built-in manager without attempting filesystem import
- `activateWorker()` throws for unknown built-in workers (`path: ""` but not manager)
- Production app includes manager in the packages list passed to routes and sessions
- Production wiring creates `commissionSession` before `meetingSession`
- `recoverMeetings()` still runs after meeting session creation
- All tests pass, linting clean, commit created (triggers pre-commit hook validation)

## Why

From `.lore/specs/guild-hall-workers.md`:
- REQ-WKR-26: "The manager's toolbox is a system toolbox, not a domain toolbox. Other workers do not have access to commission creation, dispatch, or PR management tools. These capabilities are exclusive to the manager."

Retro lesson (worker-dispatch.md): "DI factory codebases need an explicit 'production wiring' step in every plan." This task is that step for the manager integration.

## Files

- `daemon/services/toolbox-resolver.ts` (modify)
- `daemon/services/meeting-session.ts` (modify)
- `daemon/app.ts` (modify)
- `tests/daemon/services/toolbox-resolver.test.ts` (modify)
- `tests/daemon/services/meeting-session.test.ts` (modify)
