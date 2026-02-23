---
title: Build and inject manager context at activation
date: 2026-02-23
status: pending
tags: [task]
source: .lore/plans/phase-6-guild-master.md
related: [.lore/specs/guild-hall-system.md, .lore/specs/guild-hall-workers.md]
sequence: 4
modules: [daemon-services, lib-types]
---

# Task: Build and Inject Manager Context at Activation

## What

Create `daemon/services/manager-context.ts` with `buildManagerContext()` that assembles a markdown-formatted system state summary for the manager's system prompt.

**Function signature:**

```typescript
export async function buildManagerContext(deps: {
  packages: DiscoveredPackage[];
  projectName: string;
  integrationPath: string;
  guildHallHome: string;
}): Promise<string>
```

**Context sections assembled:**

1. **Available Workers**: All workers except the manager itself. Name, description, capabilities (checkout scope, built-in tools).
2. **Commission Status**: Scan `integrationPath/.lore/commissions/` using `scanCommissions()` from `lib/commissions.ts`. Group by status: active (dispatched/in_progress) with title, worker, progress; pending with title and dependencies; recently completed (last 5) with title and result summary; failed with title and failure reason.
3. **Active Meetings**: Read state files from `~/.guild-hall/state/meetings/` for this project. List open meetings with worker name.
4. **Pending Meeting Requests**: Scan `integrationPath/.lore/meetings/` for status "requested" using `scanMeetingRequests()` from `lib/meetings.ts`. List worker, reason, referenced artifacts.

**Size bound**: Truncate to 8000 chars, prioritizing recent/active items over completed/archived.

**ActivationContext update (lib/types.ts):**

Add `managerContext?: string` to the `ActivationContext` interface. This is an optional field, populated only for manager activation.

**Meeting session integration:**

In `startSession()`, when `isManager` is true, call `buildManagerContext()` before activation and set `activationContext.managerContext`. The `activateManager()` function (Task 1) already includes this in the system prompt.

## Validation

- `buildManagerContext` includes worker list and excludes the manager itself
- Commission statuses grouped correctly (active, pending, completed, failed)
- Active meetings listed with worker names
- Pending meeting requests listed with reason and artifacts
- Context bounded to 8000 chars (test with large inputs, verify truncation prefers recent/active)
- Empty project (no commissions, no meetings) produces minimal but valid context
- `ActivationContext.managerContext` is optional and does not affect non-manager activation
- Manager's assembled system prompt includes the context string when present
- Manager's system prompt works without context (undefined managerContext)
- All tests pass, linting clean, commit created (triggers pre-commit hook validation)

## Why

From `.lore/specs/guild-hall-system.md`:
- REQ-SYS-16: "The manager is a distinguished worker whose posture is coordination. It knows the other workers, their capabilities, active workspaces, and the commission graph."

From `.lore/specs/guild-hall-workers.md`:
- REQ-WKR-24: "Its posture is coordination: it knows all registered workers and their capabilities, all active workspaces and their commission graphs, and the state of in-progress work."

## Files

- `daemon/services/manager-context.ts` (create)
- `lib/types.ts` (modify: add `managerContext` to `ActivationContext`)
- `daemon/services/meeting-session.ts` (modify: call `buildManagerContext` for manager)
- `tests/daemon/services/manager-context.test.ts` (create)
