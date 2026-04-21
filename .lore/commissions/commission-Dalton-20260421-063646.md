---
title: "Commission: C3 — Gate 1 Fixes (M-1, m-2, m-3)"
date: 2026-04-21
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix all three actionable findings from Thorne's Gate 1 review. Findings artifact: `.lore/commissions/commission-Thorne-20260420-215649.md`. Read it in full before starting.\n\n**Scope: M-1, m-2, m-3.** m-1 is deferred to Phase 5 by plan design. m-4 is flagged for Phase 3 and is out of scope here.\n\n**M-1 — Add `requestSchema` and `responseSchema` to all four new operations:**\n- `system.config.project.list` (`daemon/routes/admin.ts:442-451`)\n- `meeting.session.meeting.list` (`daemon/routes/meetings.ts:582-592`)\n- `workspace.issue.list` (`daemon/routes/workspace-issue.ts:221-235`)\n- `workspace.issue.read` (`daemon/routes/workspace-issue.ts:236-250`)\n\nFor each op:\n- Declare a Zod `requestSchema` that matches the actual request shape. For global-scope no-arg ops, `z.object({})` is correct. For ops with query params, model them precisely (e.g., `workspace.issue.list` has `projectName` required + `status` optional).\n- Declare a Zod `responseSchema` matching the documented response shape from the plan.\n- Wire the schemas through the op registration so that malformed requests fail validation and responses can be asserted against the schema in tests.\n- Update the existing tests for each op to assert at least one case where the schema validates a valid response. Add at least one negative test per op where a malformed request is rejected with a structured error (where applicable — the no-arg ops still need a shape test on the response).\n\n**m-2 — Declare `parameters: []` explicitly on the two ops that currently omit it:**\n- `system.config.project.list`\n- `meeting.session.meeting.list`\n\nMatches the plan wording. Don't change neighboring ops; keep the change local to the ones the plan says are Phase 1.\n\n**m-3 — Add an inline comment on the `workspace.issue.list` and `workspace.issue.read` operation blocks explaining the three-segment hierarchy exception:**\n- Brief one-liner pointing to REQ-CLI-AGENT-22a. Saves the next reader a trip to the spec.\n\n**Guardrails:**\n- No scope creep. Do not touch ops outside the four new ones (the Major finding is scoped to them; the project-wide practice of omitting schemas stays unchanged outside this set).\n- Tests alongside fixes. Every new schema needs at least one assertion.\n- Run `bun run typecheck`, `bun run lint`, `bun test`, `bun run build` before submitting. All green.\n- Do not touch Phase 3+ files (`cli/resolve.ts`, `cli/index.ts`, `cli/format.ts`, `cli/commission-format.ts`, `daemon/routes/help.ts`).\n\nReport back with the files changed, schemas added, tests added, and verification output."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-04-21T13:36:46.736Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-21T13:36:46.738Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
