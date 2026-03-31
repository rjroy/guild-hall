---
title: "Commission: Build: Token-efficient git tools — Phase 4"
date: 2026-03-31
status: blocked
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 4 of the plan at `.lore/plans/infrastructure/token-efficient-git-tools.md`.\n\n**First:** Read Thorne's review at `.lore/reviews/token-efficient-git-tools-phase3.md`. Address ALL findings before starting Phase 4 work.\n\n**Phase 4 (Steps 6-8):** Diff mode parameters — add `diff` parameter to `git_show` (`none`/`stat`/`full`), add `stat` parameter to `git_diff`, restructure `git_show` handler into three branches, update existing tests for the breaking change (default response now has `stat` instead of `diff`).\n\n**Step 8:** Run a sub-agent to validate every REQ-TEG-* requirement against the implementation. The sub-agent reads the spec and reviews the code. This step is mandatory per the plan.\n\nAll changes in `daemon/services/git-readonly-toolbox.ts` and tests in `tests/daemon/services/git-readonly-toolbox.test.ts`.\n\nFollow the plan precisely for parameter schemas, response shapes, and test updates."
dependencies:
  - commission-Thorne-20260330-195734
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-31T02:57:40.799Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-31T03:02:26.323Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
