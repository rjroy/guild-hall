---
title: "Commission: Fix: commission tab sorting and status gems"
date: 2026-03-09
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix the commission tab's broken status gems and sorting. The full plan is at `.lore/plans/commission-status-gem-and-sort-fix.md`. Follow it step by step.\n\nFive fixes in order:\n\n1. **CSS filter values** (`web/app/globals.css`) — The hue-rotate math is wrong. `--gem-active` shows red instead of green. Replace the three filter values with corrected rotations. Visually verify if possible.\n\n2. **Add `sleeping` to `statusToGem`** (`lib/types.ts`) — Add `\"sleeping\"` to `ACTIVE_STATUSES` so sleeping commissions get a green gem instead of falling through to the blue default.\n\n3. **Add `sleeping` and `abandoned` to `STATUS_GROUP`** (`lib/commissions.ts`) — `sleeping` goes in group 1 (active), `abandoned` goes in group 2 (terminal negative). Both are currently missing and fall through to group 9.\n\n4. **Add `sleeping` to `extractRelevantDate`** (`lib/commissions.ts`) — Map `sleeping` to `status_sleeping` timeline event so the displayed timestamp is correct.\n\n5. **Tests** — Add `sleeping`, `abandoned`, and other missing commission statuses to test cases in `tests/lib/types.test.ts` (statusToGem) and `tests/lib/commissions.test.ts` (sortCommissions).\n\nRead the full plan for exact code, color math, and sort group rationale. Run typecheck, lint, and tests when done."
dependencies: []
linked_artifacts:
  - web/app/globals.css

  - lib/types.ts
  - lib/commissions.ts
  - tests/lib/types.test.ts
  - tests/lib/commissions.test.ts
  - lib/types.ts
  - lib/commissions.ts
  - tests/lib/types.test.ts
  - tests/lib/commissions.test.ts
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
  - timestamp: 2026-03-09T22:45:45.006Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-09T22:45:52.229Z
    event: progress_report
    reason: "Starting commission: reading the plan and relevant source files."
  - timestamp: 2026-03-09T22:46:18.573Z
    event: progress_report
    reason: "All source files read. Implementing fixes 1-5 in order."
  - timestamp: 2026-03-09T22:47:57.778Z
    event: result_submitted
    reason: "All five fixes applied. Typecheck, lint, and 2303 tests pass.\n\n1. **CSS filter values** (`web/app/globals.css`) — Corrected hue-rotate values for blue (240°) base gem: `--gem-active` -120° (green), `--gem-pending` -195° (amber), `--gem-blocked` +120° (red). Added comment explaining the math.\n\n2. **`sleeping` in `statusToGem`** (`lib/types.ts`) — Added `\"sleeping\"` to `ACTIVE_STATUSES`. Sleeping commissions now show a green gem.\n\n3. **`sleeping`/`abandoned` in `STATUS_GROUP`** (`lib/commissions.ts`) — Added `sleeping: 1` (active group, floats to top) and `abandoned: 2` (terminal negative, same as failed/cancelled).\n\n4. **`sleeping` in `extractRelevantDate`** (`lib/commissions.ts`) — Mapped `sleeping` → `status_sleeping` so the displayed timestamp reflects when the commission entered sleeping state, not creation.\n\n5. **Tests** — Added 7 commission-specific `statusToGem` cases to `tests/lib/types.test.ts` (dispatched, in_progress, sleeping, completed, failed, cancelled, blocked). Added a `sortCommissions` describe block to `tests/lib/commissions.test.ts` with 4 tests covering sleeping/abandoned sort order."
  - timestamp: 2026-03-09T22:48:03.341Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All source files read. Implementing fixes 1-5 in order."
projectName: guild-hall
---
All five fixes applied. Typecheck, lint, and 2303 tests pass.

1. **CSS filter values** (`web/app/globals.css`) — Corrected hue-rotate values for blue (240°) base gem: `--gem-active` -120° (green), `--gem-pending` -195° (amber), `--gem-blocked` +120° (red). Added comment explaining the math.

2. **`sleeping` in `statusToGem`** (`lib/types.ts`) — Added `"sleeping"` to `ACTIVE_STATUSES`. Sleeping commissions now show a green gem.

3. **`sleeping`/`abandoned` in `STATUS_GROUP`** (`lib/commissions.ts`) — Added `sleeping: 1` (active group, floats to top) and `abandoned: 2` (terminal negative, same as failed/cancelled).

4. **`sleeping` in `extractRelevantDate`** (`lib/commissions.ts`) — Mapped `sleeping` → `status_sleeping` so the displayed timestamp reflects when the commission entered sleeping state, not creation.

5. **Tests** — Added 7 commission-specific `statusToGem` cases to `tests/lib/types.test.ts` (dispatched, in_progress, sleeping, completed, failed, cancelled, blocked). Added a `sortCommissions` describe block to `tests/lib/commissions.test.ts` with 4 tests covering sleeping/abandoned sort order.
