---
title: "Commission: Halted commission: Fix D1 and Q1 from review, amend spec for D2"
date: 2026-03-17
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Task\n\nAddress findings from Thorne's review at `.lore/reviews/commission-halted-implementation.md`.\n\n## Fixes needed\n\n**D1 (defect): `updateCommission` rejects halted status**\n\nAt `daemon/services/commission/orchestrator.ts`, the `updateCommission` method only allows updates on `pending` commissions. Add `halted` to the allowed statuses so users can adjust `resource_overrides.maxTurns` before continuing a halted commission. This was called out in the plan (Open Questions #2) but missed during implementation.\n\n**Q1 (gap): `CommissionMeta` doesn't expose `halt_count`**\n\nAdd `halt_count` as an optional number field to `CommissionMeta` in `lib/commissions.ts` and parse it in `parseCommissionData`. Two one-line changes.\n\n**D2 (spec amendment): Remove `by {actor}` from save result_summary**\n\nThe spec at `.lore/specs/commissions/commission-halted-continuation.md` REQ-COM-44 says the result_summary should include `by {actor}`. Actor identity isn't available at the orchestrator layer without new plumbing. Amend REQ-COM-44 to match the current implementation: `\"Partial work saved (commission was halted at {turnsUsed} turns). Last progress: {lastProgress}\"`. Remove the `by {actor}` from the spec text.\n\n## Verification\n\n- `bun test`\n- `bun run typecheck`\n- `bun run lint`\n"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-17T04:44:20.287Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-17T04:44:20.289Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
