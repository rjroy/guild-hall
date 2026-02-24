---
title: Concurrency Hardening
date: 2026-02-23
status: complete
tags: [task]
source: .lore/plans/phase-7-hardening.md
related: [.lore/specs/guild-hall-meetings.md, .lore/specs/guild-hall-commissions.md]
sequence: 8
modules: [guild-hall-core]
---

# Task: Concurrency Hardening

## What

Fix two deferred concurrency issues using the existing `withProjectLock()` from `daemon/lib/project-lock.ts`.

**Meeting accept TOCTOU fix** (deferred from Phase 3):

The concurrent meeting cap check reads file state, then creates the meeting. Two concurrent accepts can both pass the check. Fix by wrapping `createMeeting()` and `acceptMeetingRequest()` in `withProjectLock()` in `daemon/services/meeting-session.ts`. The lock serializes both creation and acceptance so the cap check and meeting creation are atomic.

**Squash-merge conflict handling** (deferred from Phase 5):

When two concurrent commissions for the same project complete and both try to squash-merge back to `claude`, the second merge may conflict. `withProjectLock()` already serializes git operations, so merges happen sequentially. The risk is the second merge encountering a conflict on files that both commissions modified.

Handle this in `daemon/services/commission-session.ts` (the squash-merge path):
1. Attempt the squash-merge.
2. If merge conflicts are detected, check if all conflicted files are in `.lore/`.
3. For `.lore/` conflicts: accept the incoming changes (the commission's version), since each commission produces distinct artifacts. If both modified the same artifact (rare), prefer the newer commit.
4. For non-`.lore/` conflicts: mark the commission as `failed` with reason "merge conflict" and preserve the branch for manual resolution.
5. Log the conflict resolution for auditability.

All git operations use `cleanGitEnv()`.

## Validation

- Two concurrent meeting accepts for the same project: only one succeeds when at cap, the other receives a cap-reached error. Not both succeed.
- `createMeeting()` and `acceptMeetingRequest()` both acquire `withProjectLock()`.
- Squash-merge with no conflicts: proceeds as before.
- Squash-merge with `.lore/` conflicts only: resolved automatically by accepting incoming changes. Conflict resolution logged.
- Squash-merge with non-`.lore/` conflicts: commission marked `failed` with reason "merge conflict", branch preserved.
- Squash-merge with mixed conflicts (`.lore/` and non-`.lore/`): commission marked `failed` (non-`.lore/` conflict takes precedence).
- Unit tests: concurrent cap enforcement via lock, merge conflict detection and classification, `.lore/` auto-resolution, non-`.lore/` failure path.

## Why

Deferred from Phase 3 plan: "TOCTOU file locking on concurrent meeting accept."
Deferred from Phase 5 plan: "Squash-merge conflict handling between concurrent commissions."

From `.lore/specs/guild-hall-meetings.md`:
- REQ-MTG-28: "Per-project concurrent meeting cap (default: 5)." The cap must be enforced atomically.

From `.lore/specs/guild-hall-commissions.md`:
- REQ-COM-14: "Clean exit with submitted result: transition to completed. Squash-merge the commission branch back to claude." The merge must handle conflicts gracefully.

## Files

- `daemon/services/meeting-session.ts` (modify: wrap create/accept in withProjectLock)
- `daemon/services/commission-session.ts` (modify: conflict detection and resolution in squash-merge)
- `daemon/lib/project-lock.ts` (verify: no changes needed, just extended usage)
- `tests/daemon/concurrency-hardening.test.ts` (create)
