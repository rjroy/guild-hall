---
title: "Commission: Fix review findings from Model Selection and Mail Reader"
date: 2026-03-09
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix three defects identified by Thorne's reviews of Model Selection and Mail Reader Toolbox.\n\n**Fix 1: Commission routes missing `model` in `resourceOverrides` type**\nFile: `daemon/routes/commissions.ts` at lines 33 and 101.\nBoth POST `/commissions` and PUT `/commissions/:id` define `resourceOverrides` as `{ maxTurns?: number; maxBudgetUsd?: number }` without `model?: string`. Add `model?: string` to both type annotations.\n\n**Fix 2: Unhandled promise rejection in email factory background connect**\nFile: `packages/guild-hall-email/index.ts` at line 162.\n`void client.ensureConnected()` fires the background connect but nobody catches the rejection. When the connection fails, the rejection propagates to nobody, producing \"Unhandled error between tests\" and potentially crashing the daemon. Add `.catch(() => {})` since degraded state is already handled inside `ensureConnected()`. Add a test in `tests/packages/guild-hall-email/factory.test.ts` that verifies no unhandled rejection occurs when background connect fails.\n\n**Fix 3: Unconfigured stub handlers never tested**\nFile: `tests/packages/guild-hall-email/factory.test.ts`\nThe factory test verifies the unconfigured MCP server exists but never invokes a tool handler to verify the error message and `isError` flag. Add a test that calls a tool on the unconfigured server and asserts it returns `isError: true` with the \"Email toolbox is not configured\" message.\n\nRun tests after all three fixes to confirm no regressions."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-09T06:30:16.485Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T06:30:16.486Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
