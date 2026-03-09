---
title: "Commission: Implement Mail Reader Toolbox"
date: 2026-03-09
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the Mail Reader Toolbox plan at `.lore/plans/guild-hall-mail-reader-toolbox.md`. The plan has 6 steps building the first real domain toolbox package: package scaffold, JMAP client, HTML-to-text utility, tool implementations, factory wiring, and spec validation.\n\nKey guidance from the plan:\n- Step 1 validates the resolver integration before building JMAP logic. The integration test should point at the real `packages/guild-hall-email/` directory.\n- Step 2 (JMAP client): Do NOT copy the `using` array from the research template verbatim. Only use `jmap:core` and `jmap:mail` (REQ-EMT-11). Inject `fetchFn` for test DI.\n- The `ToolboxFactory` return type is synchronous. All async work (JMAP session fetch) must happen inside tool handlers, not the factory itself. Use the cached-promise pattern.\n- Step 4 tools: `search_emails` uses request batching (`Email/query` + `Email/get` with `#ids` back-reference). Clamp limit to 100. `read_email` fetches body values with `fetchTextBodyValues: true, fetchHTMLBodyValues: true`.\n- Step 5 factory has three states: unconfigured (no token), connected, degraded. All three return a server with the same four tools but different handler behavior.\n- This is the first real domain toolbox. The resolver code is tested with fixtures but never loaded a real package. Watch for edge cases.\n- Step 6 (spec validation) is not optional. Launch a sub-agent to check all 25 REQ-EMT requirements.\n\nResearch context: `.lore/research/fastmail-jmap-integration.md`\nSpec: `.lore/specs/guild-hall-mail-reader-toolbox.md`\nRetros to consult: `.lore/retros/worker-domain-plugins.md`\n\nRun all tests before completing. Use `/lore-development:implement` to orchestrate the work."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-09T04:35:45.655Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T04:35:45.656Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
