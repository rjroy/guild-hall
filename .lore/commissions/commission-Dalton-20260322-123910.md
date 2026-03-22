---
title: "Commission: Fix: Thorne review findings from worker tool boundaries"
date: 2026-03-22
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix the two WARN findings from Thorne's review of the worker tool boundaries implementation. Review artifact: `.lore/reviews/worker-tool-boundaries-review.md`\n\n1. **git_log format parameter bypasses structured output.** When a user passes a custom `format` parameter to `git_log`, the tool returns raw git output instead of parsed structured objects. Either remove the `format` parameter (the tool should always return structured data per REQ-WTB-2), or ignore it and always use the internal format that produces parseable output.\n\n2. **git_show edge case on initial commits.** Handle the case where `git_show` is called on the initial commit (which has no parent, so the diff format differs). Ensure it doesn't error or return malformed data.\n\nRead the review artifact for full details. Run tests after fixing."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-22T19:39:10.679Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T19:39:10.681Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
