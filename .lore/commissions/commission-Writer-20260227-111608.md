---
title: "Commission: Close duplicate-tool-notifications issue"
date: 2026-02-27
status: completed
tags: [commission]
worker: Writer
workerDisplayTitle: "Guild Writer"
prompt: "Update the issue file `.lore/issues/duplicate-tool-notifications.md` to mark it as resolved.

Change the frontmatter `status` from `open` to `resolved`.

Add a \"## Resolution\" section at the bottom explaining:
- The fix was implemented in commission-Developer-20260226-200936 but lost when the worktree was destroyed during a pre-commit hook before commit.
- The full diff is preserved in project memory (`commission-Developer-20260226-200936-result.md`) for re-application.
- Root cause: the SDK emits content blocks twice when `includePartialMessages` is enabled (once via stream events, once in the finalized assistant message). The fix suppresses the assistant message path entirely and adds tool use ID matching for accurate result-to-request correlation.
- All changes were verified (1572 tests passing, typecheck clean) before the worktree loss.

Keep the existing content intact. Only change the status and add the resolution section."
dependencies: []
linked_artifacts:
  - .lore/issues/duplicate-tool-notifications.md

activity_timeline:
  - timestamp: 2026-02-27T19:16:08.409Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-02-27T19:16:08.522Z
    event: status_dispatched
    reason: "Commission dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-02-27T19:16:08.523Z
    event: status_in_progress
    reason: "Commission session started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-02-27T19:16:15.561Z
    event: progress_report
    reason: "Reading the issue file to understand its current content before making changes."
  - timestamp: 2026-02-27T19:16:36.041Z
    event: result_submitted
    reason: "Updated `.lore/issues/duplicate-tool-notifications.md`: changed frontmatter status from `open` to `resolved` and added a \"## Resolution\" section explaining the fix implementation, worktree loss, preserved diff location, root cause (duplicate content blocks from `includePartialMessages`), and verification status."
  - timestamp: 2026-02-27T19:16:40.883Z
    event: status_completed
    reason: "Worker completed successfully"
    from: "in_progress"
    to: "completed"
current_progress: "Reading the issue file to understand its current content before making changes."
result_summary: "Updated `.lore/issues/duplicate-tool-notifications.md`: changed frontmatter status from `open` to `resolved` and added a \"## Resolution\" section explaining the fix implementation, worktree loss, preserved diff location, root cause (duplicate content blocks from `includePartialMessages`), and verification status."
projectName: guild-hall
---
