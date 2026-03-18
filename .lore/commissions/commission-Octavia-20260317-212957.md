---
title: "Commission: Plan: Refactor guild-hall-email to export operationFactory"
date: 2026-03-18
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Prepare a plan to refactor the `guild-hall-email` package to export both `toolboxFactory` (existing) and `operationFactory` (new), with shared underlying implementation.\n\nUse the `/lore-development:prep-plan` skill.\n\n**Goal:** The email package currently has all its logic embedded directly in MCP tool handlers. Refactor so that:\n1. Core logic (JMAP client calls, data formatting) lives in shared functions\n2. `toolboxFactory` wraps those functions in MCP tool format (returns `ToolResult` content blocks)\n3. `operationFactory` wraps those same functions in REST handler format (returns JSON via `OperationHandlerResult`)\n4. Both factories are exported from `packages/guild-hall-email/index.ts`\n\nThis establishes the pattern for how all future domain toolbox packages expose both surfaces from shared internals.\n\n**Key files to examine:**\n- `packages/guild-hall-email/index.ts` (current toolboxFactory)\n- `packages/guild-hall-email/tools.ts` (current tool handler implementations)\n- `packages/guild-hall-email/jmap-client.ts` (JMAP client)\n- `daemon/services/operation-types.ts` (OperationFactory, OperationFactoryDeps, PackageOperation, etc.)\n- `daemon/services/operations-loader.ts` (how the daemon discovers and loads operationFactory)\n- `daemon/routes/package-operations.ts` (how package operations become REST routes)\n- `tests/daemon/services/operations-loader.test.ts` (loader tests)\n- `tests/daemon/routes/package-operations.test.ts` (route tests)\n\n**Design constraint:** The two factories call the same underlying code. The MCP adapter and REST adapter are thin. The package author decides which capabilities appear on which surface (they don't have to be 1:1).\n\nSave the plan to `.lore/plans/infrastructure/email-operation-factory-refactor.md`."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T04:29:57.430Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T04:29:57.431Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
