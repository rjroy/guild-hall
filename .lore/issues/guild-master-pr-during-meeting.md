---
title: Guild Master cannot create PR while own meeting is active
date: 2026-03-06
status: resolved
tags: [bug, meetings, pr, guild-master, toolbox]
modules: [manager-toolbox, cli-rebase]
---

# Guild Master Cannot Create PR During Active Meeting

## What Happens

The Guild Master tries to create a PR via the `create_pr` tool and gets rejected with "Cannot create PR: active commissions or open meetings exist for this project." The Guild Master's own meeting is the meeting that triggers the block, so the user has to close the meeting before creating the PR, then reopen it to continue. This is unnecessary friction.

## Why the Guard Exists

The `hasActiveActivities()` check in `cli/rebase.ts:13` scans `~/.guild-hall/state/meetings/` for any open meeting whose `projectName` matches, then blocks PR creation (`daemon/services/manager/toolbox.ts:224`) and rebase operations. The intent is sound: don't merge the `claude` branch while there are uncommitted `.lore/` artifacts from an active meeting or commission that haven't been committed to their activity branch yet. Merging in that state could produce an integration branch that's missing in-progress work.

## Why It's Safe to Relax for the Guild Master

Guild Master meetings no longer produce project-scoped artifacts. After the project-scope changes, the Guild Master's meeting state lives in `~/.guild-hall/state/` (outside the project directory), and its conversation artifacts don't land in the project's `.lore/` directory. There are no git-tracked files on the integration branch that would conflict with or be orphaned by a PR merge.

The guard is still correct for worker meetings and commissions, which do write `.lore/` artifacts (meeting records, commission timelines, progress updates) into the project's integration worktree.

## Fix Direction

The `hasActiveActivities()` function in `cli/rebase.ts` needs to distinguish between meetings that produce project-scoped artifacts and meetings that don't. Two approaches:

1. **Filter by worker type.** The meeting state files already contain identity information. If the state includes the worker name or a flag indicating it's a Guild Master meeting, `hasActiveActivities()` can skip those entries. This is the simplest change but couples the check to worker identity rather than the actual concern (artifact presence).

2. **Filter by artifact presence.** Instead of checking whether a meeting exists, check whether the meeting has uncommitted artifacts on the integration branch. This is more precise (it answers the real question: "is there in-progress work that would be lost?") but requires inspecting the git state of the integration worktree rather than just reading state files.

Option 1 is the pragmatic fix. Option 2 is the correct fix. Either way, the change is localized to `hasActiveActivities()` in `cli/rebase.ts`, and both callers (the `create_pr` tool in the manager toolbox and the `rebase` CLI command) benefit automatically.
