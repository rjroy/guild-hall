---
title: "Validate implementation against spec requirements"
date: 2026-02-22
status: pending
tags: [task, validation, spec-review]
source: .lore/plans/phase-5-git-integration.md
related:
  - .lore/specs/guild-hall-system.md
  - .lore/specs/guild-hall-commissions.md
  - .lore/specs/guild-hall-meetings.md
  - .lore/specs/guild-hall-workers.md
sequence: 10
modules: [guild-hall-core, guild-hall-ui]
---

# Task: Validate Implementation Against Spec

## What

Launch a fresh-context sub-agent that reads the Phase 5 scope from `.lore/plans/implementation-phases.md`, the System, Workers, Commissions, and Meetings specs, and reviews the implementation for completeness. The agent flags any Phase 5 requirements not met.

This is not a code review (that happens per-task via review agents). This is a requirement coverage check: does the implementation satisfy every REQ listed in the plan's Spec Reference section?

## Validation

The agent checks every item on this list. If any fails, the item becomes a follow-up fix before Phase 5 is declared complete.

Checklist:
- Every REQ listed in the plan's Spec Reference section is implemented
- Integration worktrees created at `~/.guild-hall/projects/<name>/` on `claude` branch
- Activity worktrees created at `~/.guild-hall/worktrees/<project>/<activity>/` on activity branches
- Branch naming: `claude/commission/<id>`, `claude/meeting/<id>`
- Sparse checkout configured for workers declaring `checkoutScope: "sparse"`
- Commission dispatch: creates branch and worktree, worker receives worktreeDir
- Commission completion: squash-merge to claude, worktree and branch removed
- Commission failure/cancellation: partial work committed, worktree removed, branch preserved
- Commission re-dispatch: new branch with attempt suffix, old branch preserved
- Meeting open: creates branch and worktree
- Meeting close: squash-merge to claude, worktree and branch removed
- Meeting decline: no git operations
- Next.js reads from integration worktree
- Active commission/meeting detail views read from activity worktree
- Artifact editing writes to integration worktree
- Claude branch rebase utility exists and runs on daemon startup
- Workers never access master branch or user's working directory
- Production wiring: `createProductionApp` includes gitOps and passes it to sessions
- State files contain worktreeDir and branchName
- All git operation failures are caught and logged (don't crash daemon/session)
- Tests exist and pass for all modified modules
- CLAUDE.md accurately reflects Phase 5 changes

Run `bun test` (full suite) and verify all tests pass. Run `bun run typecheck`. Run `bun run build` to verify production build succeeds.

## Why

From `.lore/retros/worker-dispatch.md`: "Spec validation catches requirement compliance but misses integration gaps. Runtime testing is the only thing that catches 'never actually connected.'"

This task exists to catch requirements that were implemented individually but not wired together, or requirements that were missed entirely.

## Files

- No file changes expected. This task produces findings that may result in fixes to any Phase 5 file.
- `CLAUDE.md` (modify: update Phase 5 status and documentation)
