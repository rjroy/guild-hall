---
title: "Commission maxTurns abandons partial work with no recovery path"
description: "When a commission hits maxTurns, the session ends with no clear recovery mechanism or distinction from other failures"
date: 2026-03-14
status: resolved
tags: [commission, maxTurns, recovery, UX]
---

## Problem

When a commission hits `maxTurns`, the session ends and the worktree is removed. Partial work is technically preserved on the activity branch (as a final commit), but the user:

1. **Doesn't know maxTurns was the reason.** The failure message is generic: "Session completed without submitting result". The actual limit reached (`outcome.reason = "maxTurns"`) is ignored by `handleSessionCompletion`.

2. **Has no affordance to inspect or resume.** The worktree is deleted, requiring manual `git checkout` of the preserved branch to see what happened. There's no "view partial work" or "retry" option.

3. **Can't distinguish two very different failure modes:** "Ran out of turns on complex work with meaningful progress" vs. "Got stuck in a loop and burned all turns." Both fail with the same message.

## Why This Matters

Commissions doing substantial work—large refactors, migrations, complex implementations—can accumulate meaningful progress before hitting the turn limit. That work is actually preserved on the branch (via `workspace.preserveAndCleanup`), but the UX makes it invisible and unrecoverable.

A user expecting to resume the work, or at least inspect what was done, gets a cryptic failure with no path forward. The investment in that commission is lost from the user's perspective, even if the branch technically exists.

## Current Behavior (Observed)

- `drainSdkSession()` correctly sets `outcome.reason` to `"maxTurns"` when turn limit is reached (daemon/lib/agent-sdk/sdk-runner.ts:245-246)
- `handleSessionCompletion()` ignores `outcome.reason` entirely; the decision is based only on `resultSubmitted`
- If no result was submitted before maxTurns, the commission fails via `failAndCleanup()` with reason "Session completed without submitting result"
- `failAndCleanup()` calls `preserveAndCleanup()`, which commits partial work to the activity branch and deletes the worktree
- The commission artifact is marked `failed` with the generic reason

## Unclear

The correct behavior is not obvious. Some dimensions to consider:

**On preserving work:**
- Should partial commits already on the branch survive maxTurns failure? (Currently: yes, implicitly.)
- Should uncommitted changes be auto-committed with a clear marker? (Currently: yes, via preserveAndCleanup.)
- Should the preserved branch be discoverable in the UI without manual git commands?

**On recovery and resumption:**
- Should the commission be retryable, resuming from where it left off?
- If retryable, does it resume the branch, or create a fresh worktree?
- Does a resume increment turn count, or reset it?
- Should there be a UX indicator that a commission is resumable?

**On diagnosis and reflection:**
- Should the failure message include `outcome.reason` ("maxTurns" vs "no result submitted") to guide recovery?
- Should the commission show estimated coverage ("30 of N planned tasks completed before limit")?

**On lifecycle state machine:**
- Is "failed due to maxTurns" the right terminal state, or should it be "halted" or "paused"?
- Does "maxTurns" require its own state, or is it a variant of "failed"?

**On behavioral nuance:**
- Is it acceptable to treat "looped and burned turns" the same as "made real progress and hit limit"?
- Or should "stuck in a loop" (same file changed repeatedly, same errors) be detectable and handled differently?

## Surface Manifestations

- `outcome.reason` field in `SdkRunnerOutcome` is computed but never read
- Failure reason for maxTurns commissions is indistinguishable from "no result submitted for other reasons"
- Worktree is deleted, making manual inspection unintuitive
- No UI affordance to view, resume, or understand the preserved branch
- Commission status shows "failed" without indicating partial work is preserved

## Related Code

- `daemon/lib/agent-sdk/sdk-runner.ts:245-251` — `drainSdkSession` sets `outcome.reason`
- `daemon/services/commission/orchestrator.ts:509-550` — `handleSessionCompletion` ignores `outcome.reason`
- `daemon/services/commission/orchestrator.ts:694-709` — `preserveAndCleanup` commits and removes worktree
