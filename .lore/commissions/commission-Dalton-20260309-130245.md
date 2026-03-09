---
title: "Commission: Fix test gaps from Scheduled Commissions review"
date: 2026-03-09
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix four test coverage gaps identified in Thorne's review of the Scheduled Commissions gap fills (commission-Thorne-20260309-124350).\n\n**F1: No test for POST /commissions/:id/schedule-status daemon route**\nFile: `tests/daemon/routes/commissions.test.ts`\nThe mock session already includes `updateScheduleStatus` at line 92-95, so the infrastructure is ready. Add tests covering:\n- Successful status transition (200)\n- Invalid transition (409)\n- Missing commission (404)\n- Follow the pattern of existing route tests in the same file.\n\n**F2: previous_run_outcome not asserted in timeline test**\nFile: `tests/daemon/services/scheduler/scheduler.test.ts`\nThe test at :430-432 verifies the `commission_spawned` timeline entry exists but doesn't assert on the `extra` argument contents. Assert that `previous_run_outcome` is present and correct. This was defect #3 in the original review and needs a regression guard.\n\n**F3: escalation_created timeline test doesn't verify extra fields**\nFile: `tests/daemon/services/scheduler/scheduler.test.ts:596-600`\nSame pattern as F2. Assert that the `extra` argument contains `stuck_commission_id` and `running_since`. This was defect #4 in the original review.\n\n**F4: Extract describeCron() to a testable utility and add tests**\n`describeCron()` currently lives in the page component at `web/app/projects/[name]/commissions/[id]/page.tsx:25-61`, making it untestable. Extract it to a shared utility (e.g., `lib/cron-utils.ts` or alongside the daemon cron wrapper). Add unit tests covering common patterns. Also fix the gap where `\"30 9 * * *\"` returns the raw expression instead of \"Daily at 09:30\" (the fallback only handles `min === \"0\"` cases).\n\nRun all tests after fixing."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-09T20:02:45.629Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T20:02:45.630Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
