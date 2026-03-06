---
title: "Commission: Issue: Guild Master Should Create PRs During Active Meetings"
date: 2026-03-06
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the approved plan at `.lore/plans/guild-master-pr-during-meeting.md`. This plan fixes the bug described in `.lore/issues/guild-master-pr-during-meeting.md`.\n\n**Read the plan thoroughly before starting.** It contains 3 implementation steps with exact code changes, file paths with line numbers, and a test strategy.\n\nThe fix is a single condition added to `hasActiveActivities()` in `cli/rebase.ts` to skip project-scoped meetings. Five new tests cover the behavior.\n\n**Key rules:**\n- The only production code change is in `cli/rebase.ts` (one condition in the meeting loop)\n- Absent `scope` in old state files defaults to activity scope (blocking), preserving backward compatibility\n- Tests go in `tests/cli/rebase.test.ts` and `tests/daemon/services/manager-toolbox.test.ts`\n- Run the full existing test suite after your changes to verify nothing breaks\n\n**When all steps are implemented and tests pass, update the plan file's status from \"draft\" to \"implemented\" and add a Resolution section summarizing what was done.**"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-06T19:32:14.417Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-06T19:32:14.417Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
