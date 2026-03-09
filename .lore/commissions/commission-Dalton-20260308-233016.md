---
title: "Commission: Fix review findings from Model Selection and Mail Reader"
date: 2026-03-09
status: completed
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix three defects identified by Thorne's reviews of Model Selection and Mail Reader Toolbox.\n\n**Fix 1: Commission routes missing `model` in `resourceOverrides` type**\nFile: `daemon/routes/commissions.ts` at lines 33 and 101.\nBoth POST `/commissions` and PUT `/commissions/:id` define `resourceOverrides` as `{ maxTurns?: number; maxBudgetUsd?: number }` without `model?: string`. Add `model?: string` to both type annotations.\n\n**Fix 2: Unhandled promise rejection in email factory background connect**\nFile: `packages/guild-hall-email/index.ts` at line 162.\n`void client.ensureConnected()` fires the background connect but nobody catches the rejection. When the connection fails, the rejection propagates to nobody, producing \"Unhandled error between tests\" and potentially crashing the daemon. Add `.catch(() => {})` since degraded state is already handled inside `ensureConnected()`. Add a test in `tests/packages/guild-hall-email/factory.test.ts` that verifies no unhandled rejection occurs when background connect fails.\n\n**Fix 3: Unconfigured stub handlers never tested**\nFile: `tests/packages/guild-hall-email/factory.test.ts`\nThe factory test verifies the unconfigured MCP server exists but never invokes a tool handler to verify the error message and `isError` flag. Add a test that calls a tool on the unconfigured server and asserts it returns `isError: true` with the \"Email toolbox is not configured\" message.\n\nRun tests after all three fixes to confirm no regressions."
dependencies: []
linked_artifacts:
  - daemon/routes/commissions.ts

  - packages/guild-hall-email/index.ts
  - tests/packages/guild-hall-email/factory.test.ts
  - packages/guild-hall-email/index.ts
  - tests/packages/guild-hall-email/factory.test.ts
activity_timeline:
  - timestamp: 2026-03-09T06:30:16.485Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T06:30:16.486Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-09T06:30:57.223Z
    event: status_failed
    reason: "Session error: Claude Code process exited with code 1"
  - timestamp: 2026-03-09T11:42:43.191Z
    event: status_pending
    reason: "Redispatched for retry"
    from: "failed"
    to: "pending"
  - timestamp: 2026-03-09T11:42:43.192Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-09T11:42:43.229Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-09T11:42:50.460Z
    event: progress_report
    reason: "Starting work on three defect fixes. Reading source files."
  - timestamp: 2026-03-09T11:47:44.720Z
    event: result_submitted
    reason: "All three defects fixed. Typecheck clean, 2127 tests pass, 0 failures.\n\n**Fix 1:** Added `model?: string` to `resourceOverrides` type in both POST `/commissions` (line 33) and PUT `/commissions/:id` (line 101) in `daemon/routes/commissions.ts`.\n\n**Fix 2:** Changed `void client.ensureConnected()` to `void client.ensureConnected().catch(() => {})` in `packages/guild-hall-email/index.ts` line 162. Added test verifying no unhandled rejection occurs when background connect fails.\n\n**Fix 3:** Added test that invokes `list_mailboxes` tool handler on the unconfigured MCP server and asserts `isError: true` with \"Email toolbox is not configured\" message. Used `McpServer.executeToolHandler` via `_registeredTools` to invoke the handler without a transport."
  - timestamp: 2026-03-09T11:47:49.626Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Starting work on three defect fixes. Reading source files."
projectName: guild-hall
---
All three defects fixed. Typecheck clean, 2127 tests pass, 0 failures.

**Fix 1:** Added `model?: string` to `resourceOverrides` type in both POST `/commissions` (line 33) and PUT `/commissions/:id` (line 101) in `daemon/routes/commissions.ts`.

**Fix 2:** Changed `void client.ensureConnected()` to `void client.ensureConnected().catch(() => {})` in `packages/guild-hall-email/index.ts` line 162. Added test verifying no unhandled rejection occurs when background connect fails.

**Fix 3:** Added test that invokes `list_mailboxes` tool handler on the unconfigured MCP server and asserts `isError: true` with "Email toolbox is not configured" message. Used `McpServer.executeToolHandler` via `_registeredTools` to invoke the handler without a transport.
