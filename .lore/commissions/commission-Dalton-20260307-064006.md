---
title: "Commission: Fix D1 and G1 from Checkpoint 1 Review"
date: 2026-03-07
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix two items from Thorne's review of the worker-to-worker communication foundation (commission-Thorne-20260307-062528).\n\n**D1: Add typed fields to `GuildHallToolboxDeps` for mail toolbox parameters.**\n\nThe mail toolbox registry factory at `daemon/services/mail/toolbox.ts:116,124` reads `mailFilePath` and `commissionId` from `deps.config.settings` using `as string` casts against a generic `Record<string, unknown>`. If either is missing, they default to `\"\"`.\n\nFix: Add `mailFilePath?: string` and `commissionId?: string` as typed optional fields on `GuildHallToolboxDeps` in `daemon/services/toolbox-types.ts`. Update the mail toolbox registry factory to read from these typed fields instead of the untyped settings bag. Keep `createMailToolboxWithCallbacks()` as-is (it already takes typed params).\n\n**G1: Add toolbox resolver integration tests for mail context type.**\n\nThe plan required two tests that are missing:\n1. `resolveToolSet()` with `contextType: \"mail\"` returns a toolbox that includes `guild-hall-mail` (or whatever the mail toolbox server name is)\n2. `resolveToolSet()` with `contextType: \"mail\"` does NOT return the commission toolbox\n\nAdd these tests in the appropriate toolbox-resolver test file.\n\n**Validate:** `bun run typecheck` passes. All tests pass."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-07T14:40:06.484Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-07T14:40:06.485Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
