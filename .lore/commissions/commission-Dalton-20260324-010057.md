---
title: "Commission: Fix: Thorne review findings from triggered UX and CLI commands"
date: 2026-03-24
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix the WARN findings from two Thorne reviews.\n\n**From Triggered Commission Creation UX review:**\n\nWARN-1: Match summary code tokens use `.fieldHint` class (muted color), making them indistinguishable from surrounding text. The `.templateVarHint code` rule uses brass color for contrast, but `.matchSummary code` has no equivalent rule.\n\nFix: Add a `.matchSummary code` rule in `CommissionForm.module.css` with `color: var(--color-brass)` to match the template var hint styling. File: `web/components/commission/CommissionForm.module.css`.\n\n**From CLI Commission Commands review:**\n\nWARN-2: The 429 handler at `cli/index.ts:167-170` fires for ANY 429 response, not just commission operations. The message \"At capacity, cannot continue commission. Try again later.\" is misleading for non-commission 429s.\n\nFix: Instead of a hardcoded commission-specific message, use the daemon's error body (same pattern as 404/409 handling). If the response body has an `error` field, print that. Only fall back to the generic message if there's no error body. This makes the handler work correctly for any future 429 source.\n\nWARN-3: No test for the 429 handler in `tests/cli/cli-error-handling.test.ts`.\n\nFix: Add a test that mocks a 429 response and verifies the error message is printed to stderr. Follow the existing 404/409 test patterns in that file.\n\nAll tests must pass: `bun test`"
dependencies: []
linked_artifacts:
  - web/components/commission/CommissionForm.module.css

  - cli/index.ts
  - tests/cli/cli-error-handling.test.ts
  - cli/index.ts
  - tests/cli/cli-error-handling.test.ts
activity_timeline:
  - timestamp: 2026-03-24T08:00:57.574Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T08:00:57.578Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-24T08:00:57.626Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-24T08:01:15.430Z
    event: progress_report
    reason: "Read all three files. Applying fixes for WARN-1 (CSS), WARN-2 (429 handler), and WARN-3 (429 test)."
  - timestamp: 2026-03-24T08:02:31.448Z
    event: result_submitted
    reason: "Fixed all three WARN findings:\n\n**WARN-1** (CSS): Added `.matchSummary code` rule in `CommissionForm.module.css` with `color: var(--color-brass)`, `font-family: var(--font-code)`, and `margin-right: 0.4em` to match the `.templateVarHint code` styling. Code tokens in match summaries now have brass contrast instead of inheriting the muted parent color.\n\n**WARN-2** (429 handler): Removed the hardcoded commission-specific 429 branch in `cli/index.ts`. The 429 status now falls through to the generic error-body handler that reads `errObj.error` from the response JSON, same as 404/409. Any future 429 source will display the daemon's actual error message.\n\n**WARN-3** (429 test): Added a test in `tests/cli/cli-error-handling.test.ts` that verifies a 429 response with an error body surfaces the error field, confirming the generic handler works for this status code.\n\n3360 tests pass, 0 failures. Typecheck has one pre-existing error in `tests/lib/plugin-metadata.test.ts` (unrelated, confirmed on base branch)."
  - timestamp: 2026-03-24T08:02:36.260Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Read all three files. Applying fixes for WARN-1 (CSS), WARN-2 (429 handler), and WARN-3 (429 test)."
projectName: guild-hall
---
Fixed all three WARN findings:

**WARN-1** (CSS): Added `.matchSummary code` rule in `CommissionForm.module.css` with `color: var(--color-brass)`, `font-family: var(--font-code)`, and `margin-right: 0.4em` to match the `.templateVarHint code` styling. Code tokens in match summaries now have brass contrast instead of inheriting the muted parent color.

**WARN-2** (429 handler): Removed the hardcoded commission-specific 429 branch in `cli/index.ts`. The 429 status now falls through to the generic error-body handler that reads `errObj.error` from the response JSON, same as 404/409. Any future 429 source will display the daemon's actual error message.

**WARN-3** (429 test): Added a test in `tests/cli/cli-error-handling.test.ts` that verifies a 429 response with an error body surfaces the error field, confirming the generic handler works for this status code.

3360 tests pass, 0 failures. Typecheck has one pre-existing error in `tests/lib/plugin-metadata.test.ts` (unrelated, confirmed on base branch).
