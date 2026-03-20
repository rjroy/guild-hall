---
title: "Commission: Implement project_briefing base toolbox tool"
date: 2026-03-20
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the project_briefing base toolbox tool per the approved plan at `.lore/plans/infrastructure/project-briefing-tool.md`.\n\nExecute Steps 1 through 5 in order:\n\n1. Add optional `getCachedBriefing` callback to `BaseToolboxDeps` and `GuildHallToolboxDeps`. Forward it through `baseToolboxFactory`.\n2. Wire `getCachedBriefing` through the toolbox resolver and production wiring in `daemon/app.ts`.\n3. Implement the `project_briefing` tool in `createBaseToolbox`, following the `read_memory` handler pattern. Export the handler factory for testing.\n4. Trace the production wiring end-to-end to verify the callback flows from `app.ts` → resolver → `GuildHallToolboxDeps` → `baseToolboxFactory` → `createBaseToolbox`.\n5. Write tests in `tests/daemon/base-toolbox.test.ts`: cache hit, cache miss (null), callback absent, and tool registration.\n\nRead the plan for exact interface shapes, handler behavior, and test expectations. The plan references specific files and line numbers. Verify against the actual code before implementing.\n\nAll tests, typecheck, and lint must pass."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-20T03:36:24.730Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T03:36:24.733Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
