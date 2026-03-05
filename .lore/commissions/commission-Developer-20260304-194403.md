---
title: "Commission: Plan: Project-Scoped Meetings Implementation"
date: 2026-03-05
status: completed
tags: [commission]
worker: Developer
workerDisplayTitle: "Guild Developer"
prompt: "Run /lore-development:prep-plan to create an implementation plan for the Project-Scoped Meetings feature.\n\n## Context\n\nThe spec is at `.lore/specs/project-scoped-meetings.md`. Read it thoroughly first. This feature enables the Guild Master to run meetings directly in the project's integration worktree instead of creating isolated activity branches. The spec covers 17 requirements (REQ-PSM-1 through REQ-PSM-18).\n\nKey points to keep in mind while planning:\n- This is specifically for the Guild Master worker. The meeting system doesn't need to be generalized for arbitrary workers to use project scope, but don't go out of your way to prevent it either. Keep it simple.\n- The Guild Master declares `meetingScope: \"project\"` in its worker metadata. The meeting lifecycle branches on this.\n- Project-scoped meetings skip workspace provisioning (no branch, no worktree, no sparse checkout) and skip finalization (no squash-merge). Close commits directly to `claude/main` under the project lock.\n- Activity-scoped meetings must be completely unchanged.\n- State file gains a `scope` field for recovery (backward-compatible, absent = \"activity\").\n\n## Decision Authority\n\nYou have full authority to make implementation decisions using your best judgment. You will not be interacting with a user during this commission. Make choices, document your reasoning in the plan, and move forward. If something in the spec is ambiguous, pick the simplest interpretation that satisfies the requirements."
dependencies: []
linked_artifacts:
  - .lore/specs/project-scoped-meetings.md

  - .lore/specs/guild-hall-meetings.md
  - .lore/specs/meeting-infrastructure-convergence.md
  - .lore/specs/guild-hall-system.md
  - .lore/retros/meeting-infrastructure-convergence.md
  - .lore/retros/in-process-commissions.md
  - .lore/retros/unified-sdk-runner.md
  - .lore/retros/phase-5-git-integration-data-loss.md
  - .lore/retros/path-resolution-audit.md
  - .lore/brainstorm/meeting-infrastructure-convergence.md
  - .lore/reference/meetings.md
  - .lore/diagrams/meeting-lifecycle.md
activity_timeline:
  - timestamp: 2026-03-05T03:44:03.334Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-05T03:44:03.336Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-05T03:44:03.368Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-05T03:44:09.557Z
    event: progress_report
    reason: "Starting commission: reading the spec and invoking /lore-development:prep-plan to create an implementation plan for Project-Scoped Meetings."
current_progress: "Starting commission: reading the spec and invoking /lore-development:prep-plan to create an implementation plan for Project-Scoped Meetings."
result_summary: "Completed search of .lore/ for all prior work related to Project-Scoped Meetings. Found 12 directly relevant documents across specs, retros, brainstorms, reference docs, and diagrams. The spec itself already exists at .lore/specs/project-scoped-meetings.md with 18 requirements."
projectName: guild-hall
---
