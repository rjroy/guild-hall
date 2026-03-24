---
title: "Commission: Triggered commission creation UX"
date: 2026-03-24
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the triggered commission creation UX per the approved plan at `.lore/plans/ui/triggered-commission-creation-ux.md`.\n\nThe plan covers Steps 1-5:\n1. State and type toggle expansion in CommissionForm.tsx\n2. Trigger section JSX, CSS, and new `trigger-form-data.ts` utility file\n3. Template hints, max depth, match summary\n4. Validation, submission, and dependency wiring\n5. Tests (new `trigger-form-data.test.ts` + additions to `commission-form.test.tsx`)\n\nRead the full plan before starting. It contains exact file locations, line numbers, code snippets, and REQ mappings. The spec is at `.lore/specs/ui/triggered-commission-creation-ux.md`.\n\nKey constraints:\n- Extract `trigger-form-data.ts` into `web/components/commission/` (EVENT_TYPE_FIELDS, buildMatchSummaryParts, buildTriggerPayloadFields)\n- No daemon or API proxy changes\n- Array index is fine as React key for field pattern rows (no UUID generators)\n- Approval radios use `name=\"trigger-approval\"` (not `name=\"commission-type\"`)\n- Ensure `useCallback` dependency array includes all trigger state variables\n- All tests must pass: `bun test`"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-24T04:58:44.889Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T04:58:44.891Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
