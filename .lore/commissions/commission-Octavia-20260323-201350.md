---
title: "Commission: Prepare implementation plan for CLI Commission Commands spec"
date: 2026-03-24
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Prepare an implementation plan for `.lore/specs/commissions/cli-commission-commands.md` (status: approved, 21 requirements, REQ-CLI-COM-1 through REQ-CLI-COM-21).\n\nThe plan should live at `.lore/plans/commissions/cli-commission-commands.md`.\n\nKey context:\n- The CLI is a thin daemon client. Operations are discovered via `GET /help/operations`. See `cli/resolve.ts` and `cli/format.ts`.\n- Commission operations are registered in `daemon/routes/commissions.ts` via the OperationsRegistry.\n- The spec has three main areas: (1) fixing incomplete parameter declarations in operation definitions, (2) adding server-side list filtering by status/worker, (3) adding commission-specific output formatting in the CLI.\n- The spec explicitly separates primary operations (list, read, dispatch, continue, save, cancel, abandon) from secondary ones (create, redispatch, update, note, schedule/trigger updates).\n\nRead the spec thoroughly, then read the current implementation files (`cli/resolve.ts`, `cli/format.ts`, `cli/index.ts`, `daemon/routes/commissions.ts`) to understand the current state. The plan should identify phases, map requirements to implementation steps, and call out any risks or dependencies between the three areas.\n\nFollow the project's plan format conventions (check existing plans in `.lore/plans/` for structure)."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-24T03:13:50.749Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T03:13:50.750Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
