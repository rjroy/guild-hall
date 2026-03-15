---
title: "Commission: Specify: Commission status read tool for manager toolbox"
date: 2026-03-15
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a specification for a commission status read tool in the manager toolbox.\n\n**Problem:** The Guild Master creates and dispatches commissions through MCP tools (`create_commission`, `dispatch_commission`, `cancel_commission`, `abandon_commission`) but has no corresponding tool to check their status. To find out what happened, the Guild Master would have to read raw artifact files and interpret frontmatter, which breaks the abstraction. The tooling should be symmetrical: create through a tool, check through a tool.\n\n**Task:** Create a spec at `.lore/specs/commissions/commission-status-tool.md` using the `/lore-development:specify` skill.\n\n**Context to read first:**\n- `.lore/specs/commissions/guild-hall-commissions.md` — commission system spec, lifecycle states\n- `packages/guild-hall-manager/` — the manager toolbox package where the tool will live\n- `daemon/services/commission/` — commission service layers, particularly how status and artifacts are managed\n- Look at how existing manager tools (create, dispatch, cancel, abandon) are implemented for patterns\n\n**What the tool should do:**\n- Accept an optional commission ID. If provided, return status for that specific commission. If omitted, return a summary of recent/active commissions.\n- Return: current state, worker, title, creation time, and result summary (if complete/failed).\n- Follow the same patterns as the existing manager toolbox tools.\n- The tool name should fit the existing naming convention in the manager toolbox.\n\n**Requirements should cover:**\n1. Tool definition (name, parameters, return shape)\n2. Single commission lookup by ID\n3. List mode (recent/active commissions when no ID given)\n4. What data is returned in each mode\n5. How it reads from commission artifacts (which service layer, which functions)\n6. Error cases (commission not found, invalid ID)\n7. Registration in the manager toolbox alongside existing tools\n\nKeep the spec tight. This is a straightforward read tool, not a new subsystem."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-15T05:01:35.127Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-15T05:01:35.129Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
