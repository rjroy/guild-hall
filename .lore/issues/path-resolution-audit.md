---
title: Audit projectPath vs integrationPath usage across codebase
date: 2026-02-25
status: open
tags: [bug, paths, worktrees, data-integrity]
modules: [lib-paths, daemon, next-app]
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
