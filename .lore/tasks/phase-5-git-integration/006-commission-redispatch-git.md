---
title: "Commission re-dispatch creates new branch preserving old"
date: 2026-02-22
status: pending
tags: [task, commission, redispatch, branch-naming]
source: .lore/plans/phase-5-git-integration.md
related:
  - .lore/specs/guild-hall-commissions.md
sequence: 6
modules: [daemon-commission-session]
---

# Task: Commission Re-dispatch Git Integration

## What

Update `redispatchCommission()` to create a new branch with an attempt number suffix while preserving the old branch.

**Branch naming for re-dispatches:**
- First dispatch: `claude/commission/<id>` (no suffix)
- Second dispatch: `claude/commission/<id>-2`
- Third: `claude/commission/<id>-3`, etc.

**Attempt counting:** Derive the attempt number from the commission artifact's timeline. Count the number of `status_dispatched` entries (each dispatch/redispatch adds one). The first dispatch has count 0 before it adds its entry, so no suffix. The re-dispatch dispatch entry makes count 1, which produces suffix `-2`.

Add `getDispatchAttempt(basePath, commissionId)` helper that reads the artifact and counts `status_dispatched` entries via regex.

**redispatchCommission() update:**
1. Find project via `findProjectPathForCommission`
2. Verify status is failed or cancelled
3. Count previous dispatch attempts
4. Reset status to pending
5. Dispatch with new branch name using attempt suffix

The old branch from the previous attempt stays for reference (it was already preserved by the failure/cancel handler in Task 005).

## Validation

**CRITICAL: No real git operations in these tests.** All git calls go through mock `gitOps`. Real git only in Task 001 (in `/tmp/`).

Test cases:
- Redispatch: old branch preserved, new branch created with attempt suffix
- Redispatch attempt counting: correct branch names for sequential re-dispatches (first `-2`, second `-3`)
- Timeline preserved across re-dispatches (append-only)
- Redispatch from failed: succeeds
- Redispatch from cancelled: succeeds
- Redispatch from other states: rejected with error

Run `bun test tests/daemon/commission-session.test.ts` and `bun run typecheck`.

## Why

From `.lore/specs/guild-hall-commissions.md`:
- REQ-COM-30: "Re-dispatch creates new branch, preserves old"

## Files

- `daemon/services/commission-session.ts` (modify: redispatch function)
- `lib/paths.ts` (used: `commissionBranchName` with attempt parameter)
- `tests/daemon/commission-session.test.ts` (modify: add redispatch git tests)
