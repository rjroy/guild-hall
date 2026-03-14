---
title: "Commission: Fix two failing daemon-offline API route tests"
date: 2026-03-14
status: dispatched
type: one-shot
tags: [commission]
worker: Sable
workerDisplayTitle: "Guild Breaker"
prompt: "## Task\n\nFix two failing tests:\n\n```\n(fail) PUT /api/artifacts > returns 503 when daemon is offline [2.00ms]\n(fail) POST /api/meetings/[meetingId]/quick-comment > returns 503 when daemon is offline [1.00ms]\n```\n\nThese test the web API routes' behavior when the daemon is unreachable. They expect 503 responses.\n\n## Steps\n\n1. Find the test files (likely in `tests/api/artifacts-route.test.ts` and `tests/api/quick-comment.test.ts` or similar)\n2. Understand why they're failing - likely the DAB migration changed the proxy behavior or route structure\n3. Fix the root cause, whether it's in the test expectations or the actual route handlers\n4. Run the full test suite to confirm no regressions"
dependencies: []
linked_artifacts: []

resource_overrides:
  model: haiku

activity_timeline:
  - timestamp: 2026-03-14T03:52:35.314Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-14T03:52:35.318Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
