---
title: Design PR creation strategy resolving squash-merge branch recovery
date: 2026-02-23
status: complete
tags: [task]
source: .lore/plans/foundation/phase-6-guild-master.md
related: [.lore/specs/guild-hall-system.md, .lore/brainstorm/squash-merge-branch-recovery.md]
sequence: 9
modules: [daemon-lib-git]
---

# Task: Design PR Creation Strategy Resolving Squash-Merge Branch Recovery

## What

Research spike and design document resolving the squash-merge branch recovery problem before implementing PR creation.

**Problem**: After `claude/main` is squash-merged into `master` via PR, the two branches diverge at the commit level despite having identical content. Rebasing `claude/main` onto `master` replays already-applied commits. Activity branches based on `claude/main` may be orphaned.

**Design document** (`.lore/design/pr-strategy.md`) must answer:

1. **After PR merge, how does `claude/main` sync with `master`?** The user merges on their hosting platform. The daemon must detect this and reconcile.

2. **What merge strategies does Guild Hall support?** Must work with squash-only, rebase-only, and merge-commit strategies.

3. **What about active activities during PR merge?** Activity branches based on `claude/main` may be orphaned. What happens to running commissions and open meetings?

4. **What workflow assumptions does Guild Hall make?** Document explicitly. Remote naming, branch detection, `gh` CLI availability.

**Research requirements**: Validate git mechanics (reset-after-squash, rebase-after-merge, branch preservation) via controlled testing or documentation review. The brainstorm (`.lore/brainstorm/squash-merge-branch-recovery.md`) analyzed six options and leans toward Option C (merge instead of rebase) with Option A (warn before PR if activities in flight) as a safety net.

**Likely direction** (from the plan, to be confirmed):
- After PR merge: `git fetch origin && git reset --hard origin/<default-branch>` on `claude/main`
- Safety: refuse PR creation while activities are in flight (warn/block)
- Detection on daemon startup: compare tips, reset if master is ahead and no activities active
- Assumption: remote is named `origin`, `gh` CLI installed and authenticated

**This task produces a design document only.** No code changes. Task 10 implements based on the approved design.

## Validation

- Design document exists at `.lore/design/pr-strategy.md`
- All four questions answered with specific mechanisms, not vague descriptions
- Git mechanics validated (reset-after-squash tested or cited from authoritative source)
- Active activity scenario addressed (what happens to running commissions/meetings)
- Workflow assumptions documented (remote naming, `gh` CLI, branch detection)
- The brainstorm's analysis (six options) is referenced and a decision is recorded with rationale
- Edge cases addressed: daemon was down during PR merge, multiple PRs merged in sequence, concurrent activity completion during sync
- Commit created with design document (triggers pre-commit hook validation, saves checkpoint)

## Why

From `.lore/specs/guild-hall-system.md`:
- REQ-SYS-23: "A pull request from `claude` to `master` is squash-merged, producing one commit per PR. The manager worker creates PRs when work is ready for review."

From `.lore/brainstorm/squash-merge-branch-recovery.md`: "Squash-merge destroys the commit-level relationship between source and target. After `claude/main` is squash-merged into `master`, the branch histories have diverged."

Retro lesson (phase-5-git-integration-data-loss.md): Git recovery operations compound when attempted reactively. Design the recovery mechanism upfront.

## Files

- `.lore/design/pr-strategy.md` (create)
