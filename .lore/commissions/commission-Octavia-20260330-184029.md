---
title: "Commission: Plan: Token-efficient git MCP tools"
date: 2026-03-31
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write an implementation plan from the approved spec at `.lore/specs/infrastructure/token-efficient-git-tools.md`.\n\nRead the spec thoroughly, then read the current git-readonly toolbox implementation at `packages/guild-hall-git-readonly/` to understand what exists today.\n\nProduce a plan at `.lore/plans/token-efficient-git-tools.md` that covers:\n1. Phased implementation order (what to build first, dependencies between phases)\n2. Which existing tools get modified vs. new tools added\n3. File-level changes (what files are created, modified, deleted)\n4. Testing strategy per phase\n5. Review checkpoints (where Thorne should inspect before proceeding)\n\nGround every plan item in a specific REQ from the spec. If any REQ seems infeasible or underspecified during planning, call it out."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-31T01:40:29.356Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-31T01:40:29.357Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
