---
title: "Commission: Fix: Thorne review findings from worker tool boundaries"
date: 2026-03-22
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix the two WARN findings from Thorne's review of the worker tool boundaries implementation. Review artifact: `.lore/reviews/worker-tool-boundaries-review.md`\n\n1. **git_log format parameter bypasses structured output.** When a user passes a custom `format` parameter to `git_log`, the tool returns raw git output instead of parsed structured objects. Either remove the `format` parameter (the tool should always return structured data per REQ-WTB-2), or ignore it and always use the internal format that produces parseable output.\n\n2. **git_show edge case on initial commits.** Handle the case where `git_show` is called on the initial commit (which has no parent, so the diff format differs). Ensure it doesn't error or return malformed data.\n\nRead the review artifact for full details. Run tests after fixing."
dependencies: []
linked_artifacts:
  - daemon/services/git-readonly-toolbox.ts

  - tests/daemon/services/git-readonly-toolbox.test.ts
  - tests/daemon/services/git-readonly-toolbox.test.ts
activity_timeline:
  - timestamp: 2026-03-22T19:39:10.679Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T19:39:10.681Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-22T19:39:10.724Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-22T19:39:44.463Z
    event: progress_report
    reason: "Read review artifact and source files. Fixing WARN-1 (remove format parameter from git_log) and WARN-2 (handle initial commit in git_show)."
  - timestamp: 2026-03-22T19:41:19.153Z
    event: result_submitted
    reason: "Fixed both WARN findings from Thorne's review:\n\n**WARN-1 (git_log format bypass):** Removed the `format` parameter from `git_log`. The tool now always uses the internal format string and returns structured commit objects. Added a test asserting the schema has no `format` property.\n\n**WARN-2 (git_show initial commit):** Replaced `git diff ref~1 ref` with `git diff-tree --root -p ref`. The `--root` flag makes diff-tree produce a full diff for root commits (no parent) instead of failing. Added a test verifying the diff-tree args and correct output for initial commits.\n\n3369 tests pass, 0 fail. Typecheck clean."
  - timestamp: 2026-03-22T19:41:25.244Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Read review artifact and source files. Fixing WARN-1 (remove format parameter from git_log) and WARN-2 (handle initial commit in git_show)."
projectName: guild-hall
---
Fixed both WARN findings from Thorne's review:

**WARN-1 (git_log format bypass):** Removed the `format` parameter from `git_log`. The tool now always uses the internal format string and returns structured commit objects. Added a test asserting the schema has no `format` property.

**WARN-2 (git_show initial commit):** Replaced `git diff ref~1 ref` with `git diff-tree --root -p ref`. The `--root` flag makes diff-tree produce a full diff for root commits (no parent) instead of failing. Added a test verifying the diff-tree args and correct output for initial commits.

3369 tests pass, 0 fail. Typecheck clean.
