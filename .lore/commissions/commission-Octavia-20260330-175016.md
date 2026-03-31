---
title: "Commission: Spec: Token-efficient git MCP tools"
date: 2026-03-31
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec for improving the guild hall's git MCP tools based on the research and brainstorming already done.\n\nRead these two documents first:\n- `.lore/brainstorm/improve-token-perf-git-tools.md`\n- `.lore/research/token-efficient-git-tools.md`\n\nThen produce a spec at `.lore/specs/infrastructure/token-efficient-git-tools.md` that proposes viable, concrete changes to the existing git-readonly MCP toolbox. The spec should:\n\n1. Ground recommendations in the research findings and brainstorm conclusions\n2. Define clear requirements (REQ IDs) for each proposed change\n3. Stay within the architectural constraint that git-readonly is a toolbox package providing MCP tools to workers\n4. Distinguish between changes that modify existing tools vs. new tools\n5. Consider impact on token budgets (the whole point of this work)\n6. Call out what's out of scope or deferred\n\nThe existing git-readonly toolbox lives in `packages/guild-hall-git-readonly/`. Read its current implementation to understand what's there today before proposing changes."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-31T00:50:16.431Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-31T00:50:16.433Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
