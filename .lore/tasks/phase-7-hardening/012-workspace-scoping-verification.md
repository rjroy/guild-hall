---
title: Workspace Scoping Verification
date: 2026-02-23
status: complete
tags: [task]
source: .lore/plans/phase-7-hardening.md
related: [.lore/specs/guild-hall-system.md]
sequence: 12
modules: [guild-hall-core]
---

# Task: Workspace Scoping Verification

## What

Write verification tests confirming that workspace scoping holds across all primitives. Workspace scoping is already implicit in the per-project patterns throughout the codebase. This task verifies the boundary.

Create `tests/lib/workspace-scoping.test.ts` with four test cases:

1. **Commission scoping**: Register two projects. Create a commission in project A. Verify it does not appear in project B's commission list.

2. **Memory scoping**: Memory written to project A's scope is not visible when reading project B's scope.

3. **Dependency scoping**: Dependency checking for project A's commissions only looks at project A's artifacts, not project B's.

4. **Manager cross-workspace awareness**: The manager's context injection includes all projects. Cross-workspace awareness flows through the manager, not through direct primitive relationships.

Use temp directories with mocked project registrations. These are verification tests, not new features.

## Validation

- All four test cases pass.
- Commission in project A is invisible to project B's scan.
- Project A's memory writes are isolated from project B's reads.
- Dependency checking for project A does not examine project B's artifacts.
- Manager context includes information from all registered projects.

## Why

From `.lore/specs/guild-hall-system.md`:
- REQ-SYS-15: "All primitive relationships are scoped to a workspace. A worker's artifact consumption, toolbox bindings, meeting contexts, and commission assignments are per-workspace. Cross-workspace coordination flows through the memory model, not through direct primitive relationships."

## Files

- `tests/lib/workspace-scoping.test.ts` (create)
