---
title: "Commission: Implement list_guild_capabilities base toolbox tool"
date: 2026-03-20
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the list_guild_capabilities base toolbox tool per the approved plan at `.lore/plans/workers/guild-capabilities-discovery.md`.\n\nExecute Steps 1 through 5 in order:\n\n1. Add optional `getWorkerIdentities` callback to `BaseToolboxDeps` and `GuildHallToolboxDeps`. Both interfaces, both optional. The callback type is `() => WorkerIdentity[]`.\n2. Wire `getWorkerIdentities` in the toolbox resolver (`daemon/services/toolbox-resolver.ts`). The callback is derived from `packages` inside the resolver, NOT threaded through from `app.ts`. This is simpler than the briefing tool's wiring: no production wiring step needed.\n3. Implement `makeListGuildCapabilitiesHandler` and register the `list_guild_capabilities` tool in `createBaseToolbox`. Export the handler factory. Follow the plan's handler code and tool description exactly.\n4. Trace the wiring end-to-end: resolver → deps → baseToolboxFactory → createBaseToolbox → handler. Confirm no link is missing.\n5. Write tests in `tests/daemon/base-toolbox.test.ts`: formatted roster, callback absent, empty array, tool registration, and caller-included-in-output (5 test cases).\n\nRead the plan for exact interface shapes, handler behavior, output format, and test expectations. The plan references specific files and line numbers — verify against actual code before implementing.\n\nKey constraints from the spec (REQ-DISC-1 through REQ-DISC-7):\n- No input parameters\n- No filtering by caller identity (all workers listed)\n- Output is readable text, not JSON\n- Only name, displayTitle, description exposed\n- Absent callback returns informational message, not empty list\n\nAll tests, typecheck, and lint must pass."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-20T03:52:26.400Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T03:52:26.401Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
