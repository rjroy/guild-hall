---
title: Blocked commissions don't re-evaluate dependencies on daemon restart
status: open
tags: [bug, daemon, commissions, recovery]
date: 2026-03-10
---

## Problem

When the daemon restarts, `recoverCommissions()` calls `enqueueAutoDispatch()` for pending/dispatched commissions but does NOT call `checkDependencyTransitions()`. As a result, commissions that were in `blocked` status with now-satisfied dependencies remain stuck indefinitely until something else triggers re-evaluation.

## Context

Identified during the Local Model Support session (audience-Guild-Master-20260309-150548). The dependency path resolution bug was fixed in the same session (`commissionArtifactPath()` now resolves IDs correctly), but the recovery gap was explicitly flagged as not assigned.

The path resolution fix means dependencies are now evaluated correctly when something triggers them — but restart no longer triggers them for blocked commissions.

## Impact

Any commission that was blocked, waiting for a dependency, and whose dependency completed while the daemon was down will remain stuck after restart. Manual intervention (re-triggering the commission or restarting again with a code fix) is currently required.

## Fix

In `recoverCommissions()`, after calling `enqueueAutoDispatch()`, also call `checkDependencyTransitions()` for any commission in `blocked` status. This matches the behavior that happens in real-time when a commission completes.
