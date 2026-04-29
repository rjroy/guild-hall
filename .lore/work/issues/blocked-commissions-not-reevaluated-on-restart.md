---
title: Blocked commissions don't re-evaluate dependencies on daemon restart
date: 2026-04-18
status: open
tags: [bug, commissions, recovery, dependency-resolution]
modules: [commission-orchestrator, daemon-startup]
related:
  - .lore/retros/meeting-cleanup-2026-03-10.md
---

# Blocked Commissions Don't Re-evaluate Dependencies on Daemon Restart

## What Happens

When the daemon starts, blocked commissions whose dependencies have already been satisfied stay stuck in `blocked` status. They will not transition to `pending` until some other event triggers `checkDependencyTransitions()` for their project (a new commission completes, a new commission is created, or a manual operation kicks the scheduler).

Originally identified during the Local Model Support session (2026-03-09). Re-verified against current code 2026-04-18 — the gap is still present.

## Verified Locations (2026-04-18)

**Startup sequence:** `apps/daemon/app.ts:413`
```ts
await commissionSession.recoverCommissions();
```

**Recovery function:** `apps/daemon/services/commission/orchestrator.ts:768` (`recoverCommissions`)
- Scans `~/.guild-hall/state/commissions/*.json`
- Transitions in-process commissions to `failed` (process lost on restart)
- Scans for orphaned worktrees, transitions to `failed`
- Does **not** call `checkDependencyTransitions()`

**Dependency re-evaluation function:** `apps/daemon/services/commission/orchestrator.ts:651` (`checkDependencyTransitions`)
- Currently invoked at lines 469, 1560, 1589 — all inside event paths (commission completion, manual nudge endpoints).
- Never invoked during startup recovery.

## Why It Matters

A blocked commission that became unblockable while the daemon was down has no way to learn about it on restart. Concrete failure mode: dependency completes near shutdown → daemon restarts → blocked commission's dependency is satisfied in artifacts but the orchestrator never re-checks → commission sits idle until the user notices and pokes it (e.g. by creating an unrelated commission in the same project, which triggers `checkDependencyTransitions` as a side effect).

This is silent. There is no error, no log warning, nothing in the UI to indicate the commission is stuck rather than legitimately waiting. The longer the gap between restart and the next commission event, the longer the dead time.

## Fix Direction

Add a per-project `checkDependencyTransitions` pass after `recoverCommissions()` in the daemon startup sequence. Pseudocode:

```ts
await commissionSession.recoverCommissions();
for (const project of config.projects) {
  await commissionSession.checkDependencyTransitions(project.name);
}
```

The function is already exposed on the lifecycle (line 1712: `checkDependencyTransitions,` in the returned object) and accessible as `commissionSession.checkDependencyTransitions(projectName)`.

## Verification After Fix

- Add an integration test: create two commissions where B depends on A, mark A complete in the artifact while the daemon is down (simulate by stopping the daemon, manually editing the artifact, restarting), then verify B transitions from `blocked` to `pending` on startup without any other intervention.
- Manual repro pre-fix: same setup, observe B stays `blocked` until a third commission is dispatched.

## Notes for the Fix

- Calling `checkDependencyTransitions` per project at startup is idempotent — if no commissions are blocked, it's a cheap no-op. Safe to add unconditionally.
- Order matters: must run **after** `recoverCommissions()` so any commissions that get transitioned to `failed` during recovery don't re-trigger blocked-commission re-evaluation against stale state.
- If a project has many blocked commissions and many dependencies, the pass could be slow. Not expected to matter in practice (commissions are typically few per project), but worth noting if startup latency becomes a concern later.
