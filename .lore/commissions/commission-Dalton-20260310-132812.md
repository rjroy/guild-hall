---
title: "Commission: Fix scheduler catch-up firing new schedules immediately"
date: 2026-03-10
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Bug: Scheduler catch-up fires brand-new schedules immediately\n\nWhen a scheduled commission is created, the daemon's `catchUp()` method (called at startup and after the initial tick) can fire it immediately instead of waiting for the cron time.\n\n### Root cause\n\n`daemon/services/scheduler/index.ts`, `catchUp()` method (line 178):\n\nWhen a schedule has no `lastRun` (it's never fired), the code falls back to the artifact's `date` field as the reference date (line 224-227). It then computes `nextOccurrence(cron, lastRunDate)`. If that next occurrence is in the past relative to \"now\", catch-up treats it as a missed run and fires immediately.\n\nFor a brand-new schedule, this is wrong. A schedule that has never run can't have \"missed\" a run. The catch-up logic exists to recover schedules that were actively running when the daemon went down, not to retroactively fire schedules that haven't started yet.\n\n### Fix\n\nIn `catchUp()`, skip schedules where `metadata.lastRun` is falsy. If a schedule has never run, it has nothing to catch up on. The normal `tick()` loop will handle the first firing at the correct cron time.\n\nAround line 221 in the `catchUp()` method, after reading metadata:\n\n```typescript\n// A schedule that has never run can't have missed a run.\n// The normal tick loop will handle the first firing.\nif (!metadata.lastRun) continue;\n```\n\nThis replaces the current fallback logic at lines 221-227 that uses the artifact date field.\n\n### Tests\n\nAdd a test case to the scheduler tests that:\n1. Creates a schedule with no `lastRun` and a cron time in the future\n2. Calls `catchUp()`\n3. Verifies no commission was spawned\n4. Then calls `tick()` after advancing time past the cron time\n5. Verifies the commission IS spawned by the normal tick\n\nAlso verify the existing catch-up test still passes (a schedule WITH a `lastRun` that missed its window should still catch up).\n\n### Key files\n- `daemon/services/scheduler/index.ts` - `catchUp()` method"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-10T20:28:12.808Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T20:28:12.809Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
