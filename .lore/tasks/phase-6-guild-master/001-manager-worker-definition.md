---
title: Define the manager as a built-in worker
date: 2026-02-23
status: pending
tags: [task]
source: .lore/plans/phase-6-guild-master.md
related: [.lore/specs/guild-hall-workers.md, .lore/specs/guild-hall-system.md]
sequence: 1
modules: [daemon-services]
---

# Task: Define the Manager as a Built-In Worker

## What

Create `daemon/services/manager-worker.ts` with two exports:

1. `createManagerPackage()` returns a `DiscoveredPackage` with:
   - `name: "guild-hall-manager"`, `path: ""` (empty string signals built-in)
   - `metadata.type: "worker"`, identity (name: "Guild Master", description, displayTitle)
   - Posture: static system prompt establishing coordination role, dispatch-with-review model, deference rules (REQ-WKR-28)
   - `builtInTools: ["Read", "Glob", "Grep"]` (read-only; writes go through tools)
   - `checkoutScope: "sparse"`, `resourceDefaults: { maxTurns: 200 }`
   - `domainToolboxes: []`

2. `activateManager(context: ActivationContext): ActivationResult` assembles the system prompt from:
   - The static posture
   - `context.injectedMemory` (same as any worker)
   - `context.managerContext` (system state summary, populated by Task 4)
   - Returns `{ systemPrompt, tools: context.resolvedTools, resourceBounds }`

Export constants: `MANAGER_WORKER_NAME = "Guild Master"`, `MANAGER_PACKAGE_NAME = "guild-hall-manager"`.

The posture text should include:
- Role framing: coordination specialist for the project
- Capability framing: tools for commissions, dispatch, PRs, meetings
- Dispatch-with-review: create and dispatch immediately, user reviews after
- Deference: defer on scope changes, protected branch actions (PRs require user merge), domain knowledge gaps
- Working style: direct, present status, recommend, execute when authorized

## Validation

- `createManagerPackage()` returns a valid `DiscoveredPackage` matching the shape expected by `lib/packages.ts` validation schemas
- Package has `path: ""` (built-in indicator), `checkoutScope: "sparse"`, `resourceDefaults.maxTurns: 200`
- `activateManager()` includes posture, injected memory, and manager context in the assembled system prompt
- `activateManager()` passes through `context.resolvedTools` and `context.resourceBounds` unchanged
- Manager posture contains dispatch-with-review and deference instructions
- When `context.managerContext` is undefined, system prompt still includes posture and memory (graceful degradation for tasks before Task 4 is integrated)
- All tests pass, linting clean, commit created (triggers pre-commit hook validation)

## Why

From `.lore/specs/guild-hall-workers.md`:
- REQ-WKR-24: "The manager is a worker package that ships with Guild Hall. It is not a user-installed package. Its posture is coordination."
- REQ-WKR-28: "The manager defers to the user on: decisions that change project scope or direction, actions that affect the user's protected branch, questions requiring domain knowledge."
From `.lore/specs/guild-hall-system.md`:
- REQ-SYS-16: "The manager is a distinguished worker whose posture is coordination. It knows the other workers, their capabilities, active workspaces, and the commission graph."

## Files

- `daemon/services/manager-worker.ts` (create)
- `tests/daemon/services/manager-worker.test.ts` (create)
