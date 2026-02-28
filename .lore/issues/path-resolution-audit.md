---
title: Audit projectPath vs integrationPath usage across codebase
date: 2026-02-25
status: resolved
tags: [bug, paths, worktrees, data-integrity]
modules: [lib-paths, daemon, next-app]
related: [.lore/commissions/commission-Researcher-20260227-141127.md]
---

# Audit projectPath vs integrationPath Usage

## What Happened

At least one instance was found where code inside an active commission or meeting context was using `projectPath` (the raw project directory) instead of `integrationPath` (the activity worktree). This raises the question of whether other call sites have the same problem.

## Why It Matters

The path selection rule is simple but critical: outside active work, use `projectPath`; inside a commission or meeting, use `integrationPath`. A violation means reads could miss changes on the activity branch, and writes could land in the wrong tree entirely. Either corrupts the branching model that Phase 5 depends on.

## Fix Direction

1. Audit every call site that resolves a project path for reads or writes.
2. For each, confirm it's using the correct path given its execution context (daemon route handler, commission worker, meeting session, Next.js page load).
3. Fix violations. Consider whether a helper or type-level guard could prevent future regressions (e.g., branded path types that distinguish the two).

## Resolution

Comprehensive audit completed via commission-Researcher-20260227-141127 (50+ call sites across 5 Next.js pages, 2 API routes, 8 daemon services, 2 CLI tools, 3 shared lib modules). No path selection violations found. The Phase 5 integration worktree migration was thorough and consistent.

Four structural fragility points identified (not bugs, but areas where future changes could introduce violations):
1. Artifact helper functions accept bare `string` paths with no type distinction between integration/activity/project paths
2. `runCommissionSession` receives the user's project dir, correct today but would be wrong if anyone adds direct file I/O with it
3. `notes-generator.ts` trusts its caller to provide the correct path
4. `MeetingToolboxDeps.projectPath` fallback could corrupt the branching model if `worktreeDir` invariant breaks

Branded path types (`IntegrationPath`, `ActivityPath`, `ProjectPath`) recommended as preventive measure if the path layer continues to evolve. Full audit written to `.lore/retros/path-resolution-audit.md`.
