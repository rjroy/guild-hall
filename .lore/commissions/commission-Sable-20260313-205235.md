---
title: "Commission: Fix two failing daemon-offline API route tests"
date: 2026-03-14
status: completed
type: one-shot
tags: [commission]
worker: Sable
workerDisplayTitle: "Guild Breaker"
prompt: "## Task\n\nFix two failing tests:\n\n```\n(fail) PUT /api/artifacts > returns 503 when daemon is offline [2.00ms]\n(fail) POST /api/meetings/[meetingId]/quick-comment > returns 503 when daemon is offline [1.00ms]\n```\n\nThese test the web API routes' behavior when the daemon is unreachable. They expect 503 responses.\n\n## Steps\n\n1. Find the test files (likely in `tests/api/artifacts-route.test.ts` and `tests/api/quick-comment.test.ts` or similar)\n2. Understand why they're failing - likely the DAB migration changed the proxy behavior or route structure\n3. Fix the root cause, whether it's in the test expectations or the actual route handlers\n4. Run the full test suite to confirm no regressions"
dependencies: []
linked_artifacts:
  - tests/api/artifacts-route.test.ts

  - tests/api/quick-comment.test.ts
  - tests/api/quick-comment.test.ts
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
  - timestamp: 2026-03-14T03:52:35.402Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-14T03:52:41.739Z
    event: progress_report
    reason: "Starting: Finding test files for PUT /api/artifacts and POST /api/meetings/[meetingId]/quick-comment, investigating why they're failing to return 503 when daemon is offline."
  - timestamp: 2026-03-14T03:54:05.351Z
    event: progress_report
    reason: "Analyzing test failures: artifacts test fails with JSON parse error at line 45 (after daemon check), quick-comment test gets 404 instead of 503. Both suggest the daemon is running and returning responses rather than being offline. The issue is that tests need to mock daemon being unreachable."
  - timestamp: 2026-03-14T03:55:28.624Z
    event: progress_report
    reason: "Fixed both failing tests by adding proper test setup. Tests now pass: PUT /api/artifacts returns 503 when daemon is offline, POST /api/meetings/[meetingId]/quick-comment returns 503 when daemon is offline. Full test suite: 2624 pass, 0 fail."
  - timestamp: 2026-03-14T03:56:30.721Z
    event: result_submitted
    reason: "Fixed two failing API route tests by adding proper daemon offline test setup.\n\n## Root Cause\nThe tests were expecting 503 \"Daemon is not running\" responses, but the daemon was actually running on the socket. When daemonFetch() successfully connected to the daemon, it returned actual daemon responses (e.g., 404 for non-existent projects) instead of DaemonError objects, breaking the test expectations.\n\n## Solution\nAdded beforeEach/afterEach hooks to both test files (following the pattern already in tests/api/commissions.test.ts):\n- Temporarily point GUILD_HALL_HOME to a temp directory without a daemon socket\n- This causes daemonFetch() to fail with ENOENT when trying to connect\n- daemonFetch() returns a DaemonError\n- Route handlers detect the error with isDaemonError() and return 503\n\n## Changes\n- tests/api/artifacts-route.test.ts: Added setup/teardown hooks with tmpdir isolation\n- tests/api/quick-comment.test.ts: Added setup/teardown hooks with tmpdir isolation\n\n## Verification\n- Both test files now pass (9 tests total)\n- Specific failing tests now pass:\n  - PUT /api/artifacts > returns 503 when daemon is offline ✓\n  - POST /api/meetings/[meetingId]/quick-comment > returns 503 when daemon is offline ✓\n- Full test suite: 2624 tests pass, 0 fail\n- No regressions introduced"
  - timestamp: 2026-03-14T03:56:35.996Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Fixed both failing tests by adding proper test setup. Tests now pass: PUT /api/artifacts returns 503 when daemon is offline, POST /api/meetings/[meetingId]/quick-comment returns 503 when daemon is offline. Full test suite: 2624 pass, 0 fail."
projectName: guild-hall
---
Fixed two failing API route tests by adding proper daemon offline test setup.

## Root Cause
The tests were expecting 503 "Daemon is not running" responses, but the daemon was actually running on the socket. When daemonFetch() successfully connected to the daemon, it returned actual daemon responses (e.g., 404 for non-existent projects) instead of DaemonError objects, breaking the test expectations.

## Solution
Added beforeEach/afterEach hooks to both test files (following the pattern already in tests/api/commissions.test.ts):
- Temporarily point GUILD_HALL_HOME to a temp directory without a daemon socket
- This causes daemonFetch() to fail with ENOENT when trying to connect
- daemonFetch() returns a DaemonError
- Route handlers detect the error with isDaemonError() and return 503

## Changes
- tests/api/artifacts-route.test.ts: Added setup/teardown hooks with tmpdir isolation
- tests/api/quick-comment.test.ts: Added setup/teardown hooks with tmpdir isolation

## Verification
- Both test files now pass (9 tests total)
- Specific failing tests now pass:
  - PUT /api/artifacts > returns 503 when daemon is offline ✓
  - POST /api/meetings/[meetingId]/quick-comment > returns 503 when daemon is offline ✓
- Full test suite: 2624 tests pass, 0 fail
- No regressions introduced
