---
title: "Commission: Fix: Thorne review findings from triggered UX and CLI commands"
date: 2026-03-24
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix the WARN findings from two Thorne reviews.\n\n**From Triggered Commission Creation UX review:**\n\nWARN-1: Match summary code tokens use `.fieldHint` class (muted color), making them indistinguishable from surrounding text. The `.templateVarHint code` rule uses brass color for contrast, but `.matchSummary code` has no equivalent rule.\n\nFix: Add a `.matchSummary code` rule in `CommissionForm.module.css` with `color: var(--color-brass)` to match the template var hint styling. File: `web/components/commission/CommissionForm.module.css`.\n\n**From CLI Commission Commands review:**\n\nWARN-2: The 429 handler at `cli/index.ts:167-170` fires for ANY 429 response, not just commission operations. The message \"At capacity, cannot continue commission. Try again later.\" is misleading for non-commission 429s.\n\nFix: Instead of a hardcoded commission-specific message, use the daemon's error body (same pattern as 404/409 handling). If the response body has an `error` field, print that. Only fall back to the generic message if there's no error body. This makes the handler work correctly for any future 429 source.\n\nWARN-3: No test for the 429 handler in `tests/cli/cli-error-handling.test.ts`.\n\nFix: Add a test that mocks a 429 response and verifies the error message is printed to stderr. Follow the existing 404/409 test patterns in that file.\n\nAll tests must pass: `bun test`"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-24T08:00:57.574Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T08:00:57.578Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
