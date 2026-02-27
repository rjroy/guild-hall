---
title: "Commission: Audit: projectPath vs integrationPath usage across codebase"
date: 2026-02-27
status: pending
tags: [commission]
worker: Researcher
workerDisplayTitle: "Guild Researcher"
prompt: "Audit every call site in the codebase that resolves a project path for reads or writes. For each, determine whether it's using the correct path given its execution context (daemon route handler, commission worker, meeting session, Next.js page load).

## Context

The project has a three-tier branch strategy with integration worktrees per project and activity worktrees per commission/meeting. The path selection rule is:
- Outside active work (Next.js page loads, daemon route handlers serving UI): use `integrationWorktreePath()` or `projectPath`
- Inside a commission or meeting context: use the activity worktree path

A violation means reads could miss changes on the activity branch, and writes could land in the wrong tree, corrupting the branching model.

## What to Audit

1. Every call to path resolution functions in `lib/paths.ts`: `integrationWorktreePath()`, `activityWorktreeRoot()`, `commissionWorktreePath()`, `meetingWorktreePath()`, `resolveCommissionBasePath()`, `resolveMeetingBasePath()`, `projectLorePath()`
2. Every place a `projectPath` or similar variable is used for file reads or writes in `daemon/services/` and `daemon/routes/`
3. Every place Next.js server components resolve paths for reading artifacts, meetings, commissions

## Deliverable

Write your findings to `.lore/audits/path-resolution-audit.md`. For each call site:
- File and line number
- Which path it uses
- Whether it's correct given the execution context
- If incorrect, what the fix should be

Also note whether type-level guards (branded path types) could prevent future regressions.

Reference the issue: `.lore/issues/path-resolution-audit.md`"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-02-27T22:11:27.692Z
    event: created
    reason: "Commission created"
current_progress: ""
result_summary: ""
projectName: guild-hall
---
