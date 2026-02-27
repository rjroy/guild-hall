---
title: "Commission: Close duplicate-tool-notifications issue"
date: 2026-02-27
status: pending
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
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-02-27T19:16:08.409Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-02-27T19:16:08.525Z
    event: manager_dispatched
    reason: "Guild Master dispatched commission \"Close duplicate-tool-notifications issue\""
current_progress: ""
result_summary: ""
projectName: guild-hall
---
