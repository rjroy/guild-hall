---
title: "Commission: Specify mail reader toolbox from JMAP research"
date: 2026-03-08
status: dispatched
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "The research at `.lore/research/fastmail-jmap-integration.md` covers Fastmail's JMAP API, authentication, TypeScript implementation patterns, and feasibility for a Guild Hall toolbox.\n\nWrite a spec at `.lore/specs/guild-hall-mail-reader-toolbox.md` defining what a mail reader toolbox would be. The research covers the protocol and API surface; your job is to define the toolbox itself: what tools it exposes to workers, how it fits into the existing toolbox resolver pattern, token management, scope/permissions, and how workers would use it.\n\nKey context from the research:\n- JMAP is HTTP + JSON, no library needed (~200 lines of client wrapper)\n- API tokens via `Authorization: Bearer {token}`, requires Fastmail Individual plan ($6/mo)\n- The research recommends starting read-only to limit blast radius\n- Three implementation options were explored: custom toolbox package, wrap existing MCP server, or hybrid\n- Existing toolbox resolver pattern: `SYSTEM_TOOLBOX_REGISTRY` maps names to `ToolboxFactory` functions, factories receive `GuildHallToolboxDeps`\n\nReference the existing toolbox and worker specs (`.lore/specs/`) for conventions and REQ-ID format. The spec should cover: tool definitions, configuration, security model, which workers get access and how, and success criteria."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-08T17:32:16.239Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-08T17:37:22.983Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
