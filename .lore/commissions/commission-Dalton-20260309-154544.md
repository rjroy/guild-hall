---
title: "Commission: Fix: commission tab sorting and status gems"
date: 2026-03-09
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix the commission tab's broken status gems and sorting. The full plan is at `.lore/plans/commission-status-gem-and-sort-fix.md`. Follow it step by step.\n\nFive fixes in order:\n\n1. **CSS filter values** (`web/app/globals.css`) — The hue-rotate math is wrong. `--gem-active` shows red instead of green. Replace the three filter values with corrected rotations. Visually verify if possible.\n\n2. **Add `sleeping` to `statusToGem`** (`lib/types.ts`) — Add `\"sleeping\"` to `ACTIVE_STATUSES` so sleeping commissions get a green gem instead of falling through to the blue default.\n\n3. **Add `sleeping` and `abandoned` to `STATUS_GROUP`** (`lib/commissions.ts`) — `sleeping` goes in group 1 (active), `abandoned` goes in group 2 (terminal negative). Both are currently missing and fall through to group 9.\n\n4. **Add `sleeping` to `extractRelevantDate`** (`lib/commissions.ts`) — Map `sleeping` to `status_sleeping` timeline event so the displayed timestamp is correct.\n\n5. **Tests** — Add `sleeping`, `abandoned`, and other missing commission statuses to test cases in `tests/lib/types.test.ts` (statusToGem) and `tests/lib/commissions.test.ts` (sortCommissions).\n\nRead the full plan for exact code, color math, and sort group rationale. Run typecheck, lint, and tests when done."
dependencies: []
linked_artifacts: []

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-09T22:45:44.974Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T22:45:44.974Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
