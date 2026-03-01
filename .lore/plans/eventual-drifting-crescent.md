---
title: Extract finalizeActivity to unify commission and meeting git cleanup
status: draft
---

# Extract finalizeActivity

## Context

Commission and meeting sessions duplicate the same git finalization sequence: commit work in the activity worktree, squash-merge to integration (under project lock), then either clean up (merge succeeded) or preserve the branch and escalate (merge failed). The commission version lives in `handleCompletion` (~60 lines), the meeting version in `closeMeeting` (~60 lines). They diverge in log prefixes and one behavioral detail: commissions transition to "failed" on merge conflict, meetings stay "closed". The escalation-to-Guild-Master block is nearly verbatim in both.

This is the "general tool" identified in the DDP analysis: the git operation after a work item ends is not commission-specific or meeting-specific.

## Approach

Create `finalizeActivity` in `daemon/lib/git.ts` (alongside the existing `resolveSquashMerge` it wraps). This function handles the full commit-merge-cleanup-or-preserve sequence. Both callers replace their inline versions with a single call.

### `finalizeActivity` signature

```typescript
export interface FinalizeActivityResult {
  merged: boolean;      // true if squash-merge succeeded
  preserved: boolean;   // true if branch was preserved (failure path)
}

export async function finalizeActivity(
  git: GitOps,
  opts: {
    activityId: string;
    worktreeDir: string;
    branchName: string;
    projectPath: string;
    integrationPath: string;
    commitMessage: string;       // e.g. "Commission completed: <id>" or "Meeting closed: <id>"
    logPrefix: string;           // e.g. "commission" or "closeMeeting"
    commitLabel: string;         // e.g. "Commission" or "Meeting"
    lockFn: <T>(fn: () => Promise<T>) => Promise<T>;  // withProjectLock bound to project
  },
): Promise<FinalizeActivityResult>
```

**What it does:**
1. `git.commitAll(worktreeDir, commitMessage)` - commit any uncommitted work
2. Under `lockFn`: `git.commitAll(integrationPath, ...)` then `resolveSquashMerge(...)`
3. If merge succeeded: `git.removeWorktree`, `git.deleteBranch` -> `{ merged: true, preserved: false }`
4. If merge failed: `git.removeWorktree` (remove worktree but keep branch) -> `{ merged: false, preserved: true }`

**What it does NOT do** (caller-specific concerns):
- Emit events (commission emits `commission_status`, meeting has no equivalent)
- Transition artifact status (commissions go to "failed" on conflict, meetings stay "closed")
- Escalate to Guild Master (both do it, but with different reason strings referencing their context)
- Write/delete state files (different state file formats)
- Check dependency transitions or enqueue auto-dispatch (commission-only)

### Why escalation stays with the callers

The escalation text includes activity-specific context ("Commission X failed to merge" vs "Meeting X completed but could not merge"). Extracting it would require either string templates or a callback, neither of which simplifies the code. Both callers are ~8 lines of escalation. Leave it.

## Changes

### 1. Add `finalizeActivity` to `daemon/lib/git.ts`

~40 lines. Uses the existing `resolveSquashMerge` internally.

### 2. Simplify commission `handleCompletion` merge-success path

Replace lines 1357-1402 (commit, lock, merge, remove worktree, delete branch, delete state file) with:
```typescript
const result = await finalizeActivity(git, { ... });
if (result.merged) {
  await fs.unlink(commissionStatePath(commissionId)).catch(() => {});
  // ... emit, sync, delete from map, check deps, enqueue
}
```

### 3. Simplify commission `preserveAndCleanupWorktree`

This function (lines 560-591) is now the failure-path subset of `finalizeActivity`. Replace calls to it in `cleanupAfterTermination` with `finalizeActivity` passing the same params. `preserveAndCleanupWorktree` can be deleted.

Wait, actually no. `cleanupAfterTermination` is the non-success path. It doesn't attempt a merge. It just commits partial work and removes the worktree. `finalizeActivity` always attempts the merge. These are genuinely different operations:

- **Success path**: commit, merge, delete worktree + branch (or preserve on conflict)
- **Failure/cancel path**: commit partial work, delete worktree, keep branch

`finalizeActivity` is the success path. `preserveAndCleanupWorktree` is the failure path. Both commission and meeting need both. Let me check whether meeting has a failure-path equivalent...

Meeting always runs the merge path (line 1131-1189), even though the meeting is "closed" regardless. It never takes a preserve-without-merge path. So meetings only need `finalizeActivity`.

For commissions: `handleCompletion` success path uses `finalizeActivity`. `cleanupAfterTermination` (failure/cancel) keeps using `preserveAndCleanupWorktree` as-is.

### Revised changes

### 1. Add `finalizeActivity` to `daemon/lib/git.ts` (~40 lines)

### 2. Simplify commission `handleCompletion` merge path

Replace the inline commit-lock-merge-cleanup block (lines 1357-1402) with a `finalizeActivity` call. Keep the merge-conflict handling (status transition, escalation) as post-processing on `result.merged === false`.

### 3. Simplify meeting `closeMeeting` merge path

Replace the inline commit-lock-merge-cleanup block (lines 1131-1189) with a `finalizeActivity` call. Keep the escalation as post-processing on `result.merged === false`.

### 4. Delete nothing

`preserveAndCleanupWorktree` stays for the failure/cancel path (commission-only, no merge attempt). `resolveSquashMerge` stays as the inner merge primitive.

## Files

| File | Change |
|------|--------|
| `daemon/lib/git.ts` | Add `finalizeActivity`, export it |
| `daemon/services/commission-session.ts` | Use `finalizeActivity` in `handleCompletion` |
| `daemon/services/meeting-session.ts` | Use `finalizeActivity` in `closeMeeting` |

## Verification

```bash
bun run lint
bun run typecheck
bun test
```

All 1551 tests pass unchanged. The refactoring changes internal implementation, not behavior.
