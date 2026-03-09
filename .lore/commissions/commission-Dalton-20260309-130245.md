---
title: "Commission: Fix test gaps from Scheduled Commissions review"
date: 2026-03-09
status: completed
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix four test coverage gaps identified in Thorne's review of the Scheduled Commissions gap fills (commission-Thorne-20260309-124350).\n\n**F1: No test for POST /commissions/:id/schedule-status daemon route**\nFile: `tests/daemon/routes/commissions.test.ts`\nThe mock session already includes `updateScheduleStatus` at line 92-95, so the infrastructure is ready. Add tests covering:\n- Successful status transition (200)\n- Invalid transition (409)\n- Missing commission (404)\n- Follow the pattern of existing route tests in the same file.\n\n**F2: previous_run_outcome not asserted in timeline test**\nFile: `tests/daemon/services/scheduler/scheduler.test.ts`\nThe test at :430-432 verifies the `commission_spawned` timeline entry exists but doesn't assert on the `extra` argument contents. Assert that `previous_run_outcome` is present and correct. This was defect #3 in the original review and needs a regression guard.\n\n**F3: escalation_created timeline test doesn't verify extra fields**\nFile: `tests/daemon/services/scheduler/scheduler.test.ts:596-600`\nSame pattern as F2. Assert that the `extra` argument contains `stuck_commission_id` and `running_since`. This was defect #4 in the original review.\n\n**F4: Extract describeCron() to a testable utility and add tests**\n`describeCron()` currently lives in the page component at `web/app/projects/[name]/commissions/[id]/page.tsx:25-61`, making it untestable. Extract it to a shared utility (e.g., `lib/cron-utils.ts` or alongside the daemon cron wrapper). Add unit tests covering common patterns. Also fix the gap where `\"30 9 * * *\"` returns the raw expression instead of \"Daily at 09:30\" (the fallback only handles `min === \"0\"` cases).\n\nRun all tests after fixing."
dependencies: []
linked_artifacts:
  - tests/daemon/routes/commissions.test.ts

  - tests/daemon/services/scheduler/scheduler.test.ts
  - lib/cron-utils.ts
  - tests/lib/cron-utils.test.ts
  - web/app/projects/[name]/commissions/[id]/page.tsx
  - tests/daemon/services/scheduler/scheduler.test.ts
  - lib/cron-utils.ts
  - tests/lib/cron-utils.test.ts
  - web/app/projects/[name]/commissions/[id]/page.tsx
activity_timeline:
  - timestamp: 2026-03-09T20:02:45.629Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T20:02:45.630Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-09T20:02:45.666Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-09T20:02:52.566Z
    event: progress_report
    reason: "Starting work on four test coverage gaps. Reading source files to understand current state."
  - timestamp: 2026-03-09T20:06:05.723Z
    event: progress_report
    reason: "All four fixes implemented. F1: added 6 route tests for schedule-status endpoint. F2: strengthened timeline extra assertions and added previous_run_outcome test. F3: added stuck_commission_id and running_since assertions. F4: extracted describeCron() to lib/cron-utils.ts, fixed non-zero minute bug, added unit tests. Running full test suite now."
  - timestamp: 2026-03-09T20:06:51.969Z
    event: result_submitted
    reason: "Fixed all four test coverage gaps from Thorne's review. 2286 tests pass, types check clean.\n\n**F1: POST /commissions/:id/schedule-status route tests** — Added 6 tests to `tests/daemon/routes/commissions.test.ts`: successful 200 transition, 409 on skipped outcome, 409 on non-scheduled commission, 404 on missing commission, 400 on missing status field, 400 on invalid JSON.\n\n**F2: previous_run_outcome assertion** — Strengthened the existing timeline test in `tests/daemon/services/scheduler/scheduler.test.ts` to assert `spawned_id`, `run_number`, and absence of `previous_run_outcome` when no prior run exists. Added a new test that creates a completed prior commission and verifies `previous_run_outcome: \"completed\"` appears in the timeline extra.\n\n**F3: escalation_created extra fields** — Added assertions in the stuck-run escalation test for `stuck_commission_id` (matches the spawned ID) and `running_since` (valid ISO timestamp string).\n\n**F4: describeCron() extraction and bug fix** — Extracted from `web/app/projects/[name]/commissions/[id]/page.tsx` to `lib/cron-utils.ts`. Fixed the fallback logic: removed the `min === \"0\"` guard so non-zero minutes (e.g., `\"30 9 * * *\"`) produce \"Daily at 9:30\" instead of falling through to the raw expression. Added 13 unit tests in `tests/lib/cron-utils.test.ts` covering lookup table matches, generated descriptions, and fallback behavior."
  - timestamp: 2026-03-09T20:06:54.649Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All four fixes implemented. F1: added 6 route tests for schedule-status endpoint. F2: strengthened timeline extra assertions and added previous_run_outcome test. F3: added stuck_commission_id and running_since assertions. F4: extracted describeCron() to lib/cron-utils.ts, fixed non-zero minute bug, added unit tests. Running full test suite now."
projectName: guild-hall
---
Fixed all four test coverage gaps from Thorne's review. 2286 tests pass, types check clean.

**F1: POST /commissions/:id/schedule-status route tests** — Added 6 tests to `tests/daemon/routes/commissions.test.ts`: successful 200 transition, 409 on skipped outcome, 409 on non-scheduled commission, 404 on missing commission, 400 on missing status field, 400 on invalid JSON.

**F2: previous_run_outcome assertion** — Strengthened the existing timeline test in `tests/daemon/services/scheduler/scheduler.test.ts` to assert `spawned_id`, `run_number`, and absence of `previous_run_outcome` when no prior run exists. Added a new test that creates a completed prior commission and verifies `previous_run_outcome: "completed"` appears in the timeline extra.

**F3: escalation_created extra fields** — Added assertions in the stuck-run escalation test for `stuck_commission_id` (matches the spawned ID) and `running_since` (valid ISO timestamp string).

**F4: describeCron() extraction and bug fix** — Extracted from `web/app/projects/[name]/commissions/[id]/page.tsx` to `lib/cron-utils.ts`. Fixed the fallback logic: removed the `min === "0"` guard so non-zero minutes (e.g., `"30 9 * * *"`) produce "Daily at 9:30" instead of falling through to the raw expression. Added 13 unit tests in `tests/lib/cron-utils.test.ts` covering lookup table matches, generated descriptions, and fallback behavior.
