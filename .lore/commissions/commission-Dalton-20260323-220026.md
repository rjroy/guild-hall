---
title: "Commission: CLI commission commands: parameters and error handling (Phases 1 + 4)"
date: 2026-03-24
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phases 1 and 4 from the approved plan at `.lore/plans/commissions/cli-commission-commands.md`.\n\nThe spec is at `.lore/specs/commissions/cli-commission-commands.md`.\n\n**Phase 1: Operation Parameter Completeness**\n\nFix the `parameters` arrays in six operation definitions in `daemon/routes/commissions.ts`. The plan has exact changes for each operation (create, note, abandon, schedule update, trigger update, list). Parameter order follows the spec's natural command phrasing (REQ-CLI-COM-2). No route handler changes in this phase.\n\n**Phase 4: Error Formatting**\n\nAdd a 429-specific message to the error handler in `cli/index.ts` (one line of code). The existing error flow already handles 404, 409, and daemon-not-running cases. Add tests verifying each error scenario.\n\nKey constraints:\n- Do NOT create `continue` or `save` routes. Those belong to the halted continuation spec.\n- Phase 1 is metadata only (operation definitions), no route handler logic changes.\n- Phase 4's 429 handler is preemptive (no route currently returns 429, but it prevents a gap later).\n- All tests must pass: `bun test`"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-24T05:00:26.895Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T05:00:26.896Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
