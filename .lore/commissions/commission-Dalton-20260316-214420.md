---
title: "Commission: Halted commission: Fix D1 and Q1 from review, amend spec for D2"
date: 2026-03-17
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Task\n\nAddress findings from Thorne's review at `.lore/reviews/commission-halted-implementation.md`.\n\n## Fixes needed\n\n**D1 (defect): `updateCommission` rejects halted status**\n\nAt `daemon/services/commission/orchestrator.ts`, the `updateCommission` method only allows updates on `pending` commissions. Add `halted` to the allowed statuses so users can adjust `resource_overrides.maxTurns` before continuing a halted commission. This was called out in the plan (Open Questions #2) but missed during implementation.\n\n**Q1 (gap): `CommissionMeta` doesn't expose `halt_count`**\n\nAdd `halt_count` as an optional number field to `CommissionMeta` in `lib/commissions.ts` and parse it in `parseCommissionData`. Two one-line changes.\n\n**D2 (spec amendment): Remove `by {actor}` from save result_summary**\n\nThe spec at `.lore/specs/commissions/commission-halted-continuation.md` REQ-COM-44 says the result_summary should include `by {actor}`. Actor identity isn't available at the orchestrator layer without new plumbing. Amend REQ-COM-44 to match the current implementation: `\"Partial work saved (commission was halted at {turnsUsed} turns). Last progress: {lastProgress}\"`. Remove the `by {actor}` from the spec text.\n\n## Verification\n\n- `bun test`\n- `bun run typecheck`\n- `bun run lint`\n"
dependencies: []
linked_artifacts:
  - daemon/services/commission/orchestrator.ts

  - lib/commissions.ts
  - .lore/specs/commissions/commission-halted-continuation.md
  - tests/daemon/services/commission/orchestrator.test.ts
  - tests/lib/commissions.test.ts
  - lib/commissions.ts
  - .lore/specs/commissions/commission-halted-continuation.md
  - tests/daemon/services/commission/orchestrator.test.ts
  - tests/lib/commissions.test.ts
activity_timeline:
  - timestamp: 2026-03-17T04:44:20.287Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-17T04:44:20.289Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-17T04:44:20.329Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-17T04:44:28.346Z
    event: progress_report
    reason: "Starting work on three review findings: D1 (updateCommission status check), Q1 (halt_count in CommissionMeta), D2 (spec amendment)."
  - timestamp: 2026-03-17T04:47:18.150Z
    event: result_submitted
    reason: "All three review findings addressed:\n\n**D1**: `updateCommission` now accepts both `pending` and `halted` statuses. Error message updated to reflect both. Test added for updating a halted commission's maxTurns.\n\n**Q1**: `halt_count` added as optional number field to `CommissionMeta` interface, parsed in `parseCommissionData`. Two tests added (present and absent cases).\n\n**D2**: REQ-COM-44 spec text amended to remove `by {actor}`, matching the implementation.\n\nVerification: 2868 tests pass, typecheck clean, lint clean."
  - timestamp: 2026-03-17T04:47:29.593Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Starting work on three review findings: D1 (updateCommission status check), Q1 (halt_count in CommissionMeta), D2 (spec amendment)."
projectName: guild-hall
---
All three review findings addressed:

**D1**: `updateCommission` now accepts both `pending` and `halted` statuses. Error message updated to reflect both. Test added for updating a halted commission's maxTurns.

**Q1**: `halt_count` added as optional number field to `CommissionMeta` interface, parsed in `parseCommissionData`. Two tests added (present and absent cases).

**D2**: REQ-COM-44 spec text amended to remove `by {actor}`, matching the implementation.

Verification: 2868 tests pass, typecheck clean, lint clean.
