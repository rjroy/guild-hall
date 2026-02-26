---
title: Commission and meeting artifact state has no clear ownership rules
date: 2026-02-26
status: open
tags: [architecture, git, commissions, meetings, state-management, worktrees]
modules: [commission-session, commission-artifact-helpers, meeting-session, daemon-routes, git]
related: [.lore/design/process-architecture.md]
---

# Commission and Meeting Artifact State Has No Clear Ownership Rules

## What Happened

Commission and meeting artifacts can live in three places simultaneously with no enforced rules about which is authoritative:

1. **Global state JSON** (`~/.guild-hall/state/commissions/<id>.json`) -- holds lifecycle status, worktree path, session ID
2. **Integration worktree** (`~/.guild-hall/projects/<project>/.lore/commissions/<id>.md`) -- the `claude/main` view
3. **Activity worktree** (`~/.guild-hall/worktrees/<project>/commission-<id>/.lore/commissions/<id>.md`) -- the in-progress view

Nothing enforces which one to write to at each lifecycle stage, and there's no clear ownership transition when a commission moves from pending to dispatched to complete.

## Why It Matters

Unclear ownership produces silent data loss. A worker's progress entries, result, or timeline updates can end up in the wrong place and get dropped or overwritten during the merge back to `claude/main`. Merge conflicts are unhandled -- the system has no defined path for aborting and escalating. The longer a commission runs, the worse the divergence gets.

Meetings have the same problem and can live much longer.

## Intended Ownership Model

**Creation (pending):**
- Commission artifact is written to the integration worktree: `~/.guild-hall/projects/<project>/.lore/commissions/<id>.md`
- That change is committed to `claude/main` immediately
- No state file exists yet

**Dispatch:**
- Guild Hall creates an activity worktree at `~/.guild-hall/worktrees/<project>/commission-<id>/`
- Guild Hall creates a state file at `~/.guild-hall/state/commissions/<id>.json` as a thin system-local pointer only: `{ commissionId, worktreePath, sessionId? }`
- All subsequent writes to the commission artifact route to the activity worktree. The integration worktree copy is frozen until merge.

**Completion (success or failure):**
1. Commit all uncommitted changes on the activity worktree branch (--no-verify allowed)
2. Commit all uncommitted changes on `claude/main` (--no-verify allowed)
3. Merge the commission branch into `claude/main`
   - On conflict: abort the merge, create a Guild Master meeting request to the user, halt. Do not proceed with cleanup.
4. Remove the commission branch
5. Remove the state file

The state file is a pointer, not a content store. It holds no information that belongs in the artifact.

**Meetings:** identical flow. Subdirectories say `meetings` not `commissions`. Meetings can be long-lived but the lifecycle transitions are the same.

## Fix Direction

- Audit `commission-artifact-helpers.ts` and `meeting-artifact-helpers.ts`: all write paths must check whether an activity worktree exists and route there when dispatched
- Audit `commission-session.ts` and `meeting-session.ts`: ensure the state file is created only on dispatch and removed only after successful merge + cleanup
- Add conflict detection to the merge step and wire it to Guild Master meeting request creation
- The state file schema should be narrowed to pointer-only fields; any content that's drifted into it belongs in the artifact
- This is likely a significant refactor touching routes, session services, artifact helpers, and git operations
