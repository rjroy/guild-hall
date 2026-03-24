---
title: "Commission: Triggered commission creation UX"
date: 2026-03-24
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the triggered commission creation UX per the approved plan at `.lore/plans/ui/triggered-commission-creation-ux.md`.\n\nThis adds \"Trigger\" as a third commission type in CommissionForm, with event type selection, approval mode, project filter, field pattern rows, template variable hints, max chain depth, and match summary.\n\n**Read the plan first.** It has exact file locations, line numbers, and code examples for all 5 implementation steps. Follow the delegation table: Steps 1-5 are yours.\n\nKey decisions from the plan:\n- Extract `trigger-form-data.ts` into `web/components/commission/` for pure-function logic (EVENT_TYPE_FIELDS mapping, buildMatchSummaryParts, buildTriggerPayloadFields)\n- Use array index as React key for field pattern rows (no UUID generator needed)\n- CSS classes mirror existing `.scheduleFields` pattern\n- No daemon or API proxy changes\n\n**Tests (Step 5):** Create `tests/components/trigger-form-data.test.ts` for the pure functions. Add triggered payload and canSubmit tests to the existing `tests/components/commission-form.test.tsx`. The plan details exact test cases.\n\nRun all tests before declaring complete: `bun test tests/components/commission-form.test.tsx tests/components/trigger-form-data.test.ts`\n\nAlso run typecheck and lint: `bun run typecheck && bun run lint`"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-24T04:01:06.520Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T04:01:06.523Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
