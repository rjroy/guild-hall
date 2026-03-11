---
title: "Commission: Review: Scheduled Commissions gap fills"
date: 2026-03-09
status: completed
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the fixes from commission `commission-Dalton-20260309-114142` (Complete Scheduled Commissions: fix all review findings). These are the nine items from your previous review that were left unfinished.\n\n**Previous review:** `commission-Thorne-20260309-111553`\n**Plan:** `.lore/plans/commissions/guild-hall-scheduled-commissions.md`\n**Spec:** `.lore/specs/commissions/guild-hall-scheduled-commissions.md`\n\n**What was fixed:**\n\n1. **Duplicate register() throws** — Added `isTracked()` guard before both `register()` call sites in `scheduler/index.ts`. Verify the guard is in both paths (auto-completion at :438 area and failure transition at :143 area).\n\n2. **resource_overrides not carried through** — Replaced `readArtifactField()` calls with a new `readResourceOverrides()` method matching 2-space-indented fields. Verify `model`, `maxTurns`, and `maxBudgetUsd` all propagate correctly to spawned commissions (REQ-SCOM-11, REQ-MODEL-10).\n\n3. **previous_run_outcome** — Added `getSpawnedCommissionStatus()` helper. Verify the `commission_spawned` timeline entry includes `previous_run_outcome` per REQ-SCOM-16.\n\n4. **escalation_created timeline** — Changed `spawned_id` to `stuck_commission_id`, added `running_since`. Verify field names match the spec.\n\n5. **UI schedule creation** — Added `createScheduledCommission()` to `CommissionSessionForRoutes` interface and orchestrator. POST `/commissions` route calls it for `type: \"scheduled\"`. Verify full parity with the manager toolbox's `create_scheduled_commission` (REQ-SCOM-21): cron, repeat, resource_overrides including model all written to the artifact.\n\n6. **Action buttons** — Rewrote `CommissionScheduleActions.tsx` with functional Pause/Resume/Complete. Added `POST /commissions/:id/schedule-status` daemon route and Next.js API proxy. Verify buttons are wired end-to-end: client component -> Next.js API route -> daemon route -> schedule lifecycle transition.\n\n7. **Next expected run** — Computed from cron + last_run. Verify it displays correctly in the schedule info section.\n\n8. **Recent Runs** — Filters for `sourceSchedule` match, sorted by date, limited to 10. Verify each entry links to the spawned commission detail view.\n\n9. **Human-readable cron** — `describeCron()` with pattern lookup table. Verify it handles common expressions (daily, weekly, monthly, every N minutes).\n\n**Files changed:**\n- `daemon/services/scheduler/index.ts` (fixes 1-4)\n- `daemon/services/commission/orchestrator.ts` (fix 5)\n- `daemon/routes/commissions.ts` (fixes 5-6)\n- `web/app/api/commissions/[commissionId]/schedule-status/route.ts` (new)\n- `web/components/commission/CommissionScheduleActions.tsx` (fix 6)\n- `web/components/commission/CommissionScheduleActions.module.css` (fix 6)\n- `web/components/commission/CommissionScheduleInfo.tsx` (fixes 7-9)\n- `web/components/commission/CommissionScheduleInfo.module.css` (fixes 7-9)\n- `web/components/commission/CommissionView.tsx` (extended interface)\n- `web/app/projects/[name]/commissions/[id]/page.tsx` (fixes 7-9)\n- `tests/daemon/routes/commissions.test.ts`\n- `tests/daemon/services/scheduler/scheduler.test.ts`\n- 4 additional test files\n\n**Review focus:** Verify all nine items are actually complete this time, not partially done or stubbed. Check that the new route and API proxy follow existing patterns. Confirm 2262 tests pass."
dependencies: []
linked_artifacts:
  - .lore/commissions/commission-Dalton-20260309-114142.md

  - daemon/services/scheduler/index.ts
  - daemon/services/commission/orchestrator.ts
  - daemon/routes/commissions.ts
  - web/app/api/commissions/[commissionId]/schedule-status/route.ts
  - web/components/commission/CommissionScheduleActions.tsx
  - web/components/commission/CommissionScheduleInfo.tsx
  - web/app/projects/[name]/commissions/[id]/page.tsx
  - daemon/services/scheduler/index.ts
  - daemon/services/commission/orchestrator.ts
  - daemon/routes/commissions.ts
  - web/app/api/commissions/[commissionId]/schedule-status/route.ts
  - web/components/commission/CommissionScheduleActions.tsx
  - web/components/commission/CommissionScheduleInfo.tsx
  - web/app/projects/[name]/commissions/[id]/page.tsx
activity_timeline:
  - timestamp: 2026-03-09T19:43:50.703Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T19:43:50.704Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-09T19:43:50.742Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-09T19:44:06.554Z
    event: progress_report
    reason: "Starting review of nine fixes from commission-Dalton-20260309-114142. Reading spec, previous review, and all changed files."
  - timestamp: 2026-03-09T19:44:25.107Z
    event: progress_report
    reason: "Core implementation files reviewed. Now reading test files and CSS modules to verify completeness."
  - timestamp: 2026-03-09T19:45:33.987Z
    event: progress_report
    reason: "All 2262 tests pass. Code review of all nine fixes complete. Compiling final findings."
  - timestamp: 2026-03-09T19:46:48.324Z
    event: result_submitted
    reason: "## Review: commission-Dalton-20260309-114142 (Fix All Review Findings)\n\n### Disposition\n\nSeven of nine items are fully resolved. Two items have test coverage gaps that weaken verification but the implementations appear correct. All 2262 tests pass.\n\n### Item-by-item verdict\n\n**1. Duplicate register() throws — FIXED**\n`isTracked()` guard present in both paths: auto-completion at `scheduler/index.ts:448` and failure transition at `:143`. Both check before calling `register()`. Correct.\n\n**2. resource_overrides not carried through — FIXED**\n`readResourceOverrides()` at `scheduler/index.ts:483-498` matches 2-space-indented fields under the `resource_overrides:` block. `maxTurns`, `maxBudgetUsd`, and `model` all propagate to `createCommission()` at `:387-394`. The regex patterns (`/^ {2}maxTurns: (.+)$/m`, etc.) match the 2-space indentation that `createScheduledCommission` in `orchestrator.ts:1326` writes. REQ-SCOM-11 and REQ-MODEL-10 satisfied.\n\n**3. previous_run_outcome — FIXED**\n`getSpawnedCommissionStatus()` helper at `scheduler/index.ts:529-547` reads the status of the previous spawned commission. Used at `:411-418` to populate the timeline entry. The `previous_run_outcome` field is conditionally included in the timeline extras at `:426-428`, matching REQ-SCOM-16.\n\n**4. escalation_created timeline — FIXED**\nField names changed to `stuck_commission_id` and `running_since` at `scheduler/index.ts:325-327`. Matches the spec (REQ-SCOM-16). The extra fields are passed to `appendTimeline()` correctly.\n\n**5. UI schedule creation — FIXED**\n`createScheduledCommission()` added to `CommissionSessionForRoutes` interface at `orchestrator.ts:117-127`. Implementation at `:1279-1378` writes cron, repeat, resource_overrides, and model to the artifact. POST `/commissions` route at `commissions.ts:67-77` routes `type: \"scheduled\"` requests to `createScheduledCommission()`, passing all fields including `resourceOverrides`. Full parity with manager toolbox. REQ-SCOM-21 satisfied.\n\n**6. Action buttons — FIXED**\n`CommissionScheduleActions.tsx` is a functional component with Pause/Resume/Complete buttons. Calls `POST /api/commissions/:id/schedule-status` which proxies to daemon route `POST /commissions/:id/schedule-status` at `commissions.ts:248-280`. The daemon route calls `updateScheduleStatus()` on the orchestrator at `orchestrator.ts:1385-1451`, which delegates to the `ScheduleLifecycle`. Full end-to-end wiring: client component → Next.js API proxy → daemon route → schedule lifecycle transition. REQ-SCOM-23 satisfied.\n\n**7. Next expected run — FIXED**\nComputed at `page.tsx:147-153` using `nextOccurrence(cronExpr, referenceDate)` from the cron wrapper. Displayed in `CommissionScheduleInfo.tsx:27-28` and `:63-64`. Correct.\n\n**8. Recent Runs — FIXED**\nPopulated at `page.tsx:189-199`: filters `allCommissions` for matching `sourceSchedule`, sorts by date descending, limits to 10. Displayed in `CommissionScheduleInfo.tsx:67-89` with `Link` components routing to `/projects/:name/commissions/:id`. Each entry shows commission ID, status, and date. Correct.\n\n**9. Human-readable cron — FIXED**\n`describeCron()` at `page.tsx:25-61` with a 13-entry pattern lookup table covering every-minute, 5/15/30-minute intervals, hourly, daily, weekdays, weekly, monthly, and annual. Falls back to a basic field parser for daily/weekday patterns not in the table, then returns the raw cron expression. Correct for common expressions.\n\n### Findings\n\n**F1. No test for the `POST /commissions/:id/schedule-status` daemon route.** (commissions.test.ts)\nThe daemon route at `commissions.ts:248-280` has no corresponding test. Every other route in this file has test coverage. The mock session includes `updateScheduleStatus` at `commissions.test.ts:92-95`, so the test infrastructure is ready. The gap means incorrect HTTP status codes for edge cases (e.g., `409` for invalid transitions, `404` for missing commissions) are unverified.\nImpact: Test coverage gap on a new route. The route works (manual review confirms the pattern is consistent), but there's no automated verification.\n\n**F2. No test for `previous_run_outcome` in timeline entries.** (scheduler.test.ts)\nThe test at `:430-432` verifies the `commission_spawned` timeline entry exists but does not assert on the `extra` argument contents. The `previous_run_outcome` field was the #3 defect in the previous review. The fix is implemented correctly (confirmed by code review), but the test doesn't verify it.\nImpact: Regression risk. If someone removes the `getSpawnedCommissionStatus` call, no test will catch it.\n\n**F3. Escalation timeline test doesn't verify extra fields.** (scheduler.test.ts:596-600)\nThe test at `:597-600` verifies an `escalation_created` timeline entry exists but doesn't assert that the `extra` argument contains `stuck_commission_id` and `running_since`. This was defect #4 in the previous review.\nImpact: Same pattern as F2. The fix is correct but the test could silently regress.\n\n**F4. `describeCron()` lives in the page component, not a shared utility.** (page.tsx:25-61)\nThis function is co-located with the server component page, making it untestable without rendering the page. The pattern lookup table and fallback logic would benefit from unit tests (e.g., does `\"0 14 * * *\"` produce `\"Daily at 14:00\"`?). The function has a minor gap: the fallback at `:52-60` only handles `min === \"0\"` cases, so `\"30 9 * * *\"` returns the raw expression.\nImpact: No tests on cron description logic. Minor UX gap for non-standard cron expressions (falls back to raw cron, which is acceptable but not ideal).\n\n**F5. Next.js API proxy doesn't set `Content-Type` header on proxied request.** (schedule-status/route.ts:11-18)\nCompare with the abandon route at `abandon/route.ts:17-23`: the schedule-status proxy passes `headers: { \"Content-Type\": \"application/json\" }` on the `daemonFetch` call, while the abandon proxy does not. Both approaches work because `daemonFetch` likely sets it, but the patterns are inconsistent. Neither approach is wrong.\nImpact: Cosmetic inconsistency. Both work. Noting for completeness.\n\n### What's working well\n\n- All nine previously identified defects and spec gaps have implementations addressing them.\n- The `readResourceOverrides()` regex approach correctly handles the 2-space indentation that the artifact writer produces. The prior `readArtifactField()` approach would have matched top-level fields and missed indented ones. Fixed precisely.\n- The orchestrator's `createScheduledCommission()` and `updateScheduleStatus()` are clean additions that follow existing patterns (worker validation, project validation, cron validation via `isValidCron`, git commit under project lock).\n- The schedule-status route follows the same pattern as other routes: Zod-less body parsing, error-to-HTTP-status mapping, consistent JSON responses.\n- The `CommissionView.tsx` cleanly branches between schedule and one-shot views using the `commissionType` prop, sharing the timeline and notes components.\n- 2262 tests pass."
  - timestamp: 2026-03-09T19:46:54.744Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All 2262 tests pass. Code review of all nine fixes complete. Compiling final findings."
projectName: guild-hall
---
## Review: commission-Dalton-20260309-114142 (Fix All Review Findings)

### Disposition

Seven of nine items are fully resolved. Two items have test coverage gaps that weaken verification but the implementations appear correct. All 2262 tests pass.

### Item-by-item verdict

**1. Duplicate register() throws — FIXED**
`isTracked()` guard present in both paths: auto-completion at `scheduler/index.ts:448` and failure transition at `:143`. Both check before calling `register()`. Correct.

**2. resource_overrides not carried through — FIXED**
`readResourceOverrides()` at `scheduler/index.ts:483-498` matches 2-space-indented fields under the `resource_overrides:` block. `maxTurns`, `maxBudgetUsd`, and `model` all propagate to `createCommission()` at `:387-394`. The regex patterns (`/^ {2}maxTurns: (.+)$/m`, etc.) match the 2-space indentation that `createScheduledCommission` in `orchestrator.ts:1326` writes. REQ-SCOM-11 and REQ-MODEL-10 satisfied.

**3. previous_run_outcome — FIXED**
`getSpawnedCommissionStatus()` helper at `scheduler/index.ts:529-547` reads the status of the previous spawned commission. Used at `:411-418` to populate the timeline entry. The `previous_run_outcome` field is conditionally included in the timeline extras at `:426-428`, matching REQ-SCOM-16.

**4. escalation_created timeline — FIXED**
Field names changed to `stuck_commission_id` and `running_since` at `scheduler/index.ts:325-327`. Matches the spec (REQ-SCOM-16). The extra fields are passed to `appendTimeline()` correctly.

**5. UI schedule creation — FIXED**
`createScheduledCommission()` added to `CommissionSessionForRoutes` interface at `orchestrator.ts:117-127`. Implementation at `:1279-1378` writes cron, repeat, resource_overrides, and model to the artifact. POST `/commissions` route at `commissions.ts:67-77` routes `type: "scheduled"` requests to `createScheduledCommission()`, passing all fields including `resourceOverrides`. Full parity with manager toolbox. REQ-SCOM-21 satisfied.

**6. Action buttons — FIXED**
`CommissionScheduleActions.tsx` is a functional component with Pause/Resume/Complete buttons. Calls `POST /api/commissions/:id/schedule-status` which proxies to daemon route `POST /commissions/:id/schedule-status` at `commissions.ts:248-280`. The daemon route calls `updateScheduleStatus()` on the orchestrator at `orchestrator.ts:1385-1451`, which delegates to the `ScheduleLifecycle`. Full end-to-end wiring: client component → Next.js API proxy → daemon route → schedule lifecycle transition. REQ-SCOM-23 satisfied.

**7. Next expected run — FIXED**
Computed at `page.tsx:147-153` using `nextOccurrence(cronExpr, referenceDate)` from the cron wrapper. Displayed in `CommissionScheduleInfo.tsx:27-28` and `:63-64`. Correct.

**8. Recent Runs — FIXED**
Populated at `page.tsx:189-199`: filters `allCommissions` for matching `sourceSchedule`, sorts by date descending, limits to 10. Displayed in `CommissionScheduleInfo.tsx:67-89` with `Link` components routing to `/projects/:name/commissions/:id`. Each entry shows commission ID, status, and date. Correct.

**9. Human-readable cron — FIXED**
`describeCron()` at `page.tsx:25-61` with a 13-entry pattern lookup table covering every-minute, 5/15/30-minute intervals, hourly, daily, weekdays, weekly, monthly, and annual. Falls back to a basic field parser for daily/weekday patterns not in the table, then returns the raw cron expression. Correct for common expressions.

### Findings

**F1. No test for the `POST /commissions/:id/schedule-status` daemon route.** (commissions.test.ts)
The daemon route at `commissions.ts:248-280` has no corresponding test. Every other route in this file has test coverage. The mock session includes `updateScheduleStatus` at `commissions.test.ts:92-95`, so the test infrastructure is ready. The gap means incorrect HTTP status codes for edge cases (e.g., `409` for invalid transitions, `404` for missing commissions) are unverified.
Impact: Test coverage gap on a new route. The route works (manual review confirms the pattern is consistent), but there's no automated verification.

**F2. No test for `previous_run_outcome` in timeline entries.** (scheduler.test.ts)
The test at `:430-432` verifies the `commission_spawned` timeline entry exists but does not assert on the `extra` argument contents. The `previous_run_outcome` field was the #3 defect in the previous review. The fix is implemented correctly (confirmed by code review), but the test doesn't verify it.
Impact: Regression risk. If someone removes the `getSpawnedCommissionStatus` call, no test will catch it.

**F3. Escalation timeline test doesn't verify extra fields.** (scheduler.test.ts:596-600)
The test at `:597-600` verifies an `escalation_created` timeline entry exists but doesn't assert that the `extra` argument contains `stuck_commission_id` and `running_since`. This was defect #4 in the previous review.
Impact: Same pattern as F2. The fix is correct but the test could silently regress.

**F4. `describeCron()` lives in the page component, not a shared utility.** (page.tsx:25-61)
This function is co-located with the server component page, making it untestable without rendering the page. The pattern lookup table and fallback logic would benefit from unit tests (e.g., does `"0 14 * * *"` produce `"Daily at 14:00"`?). The function has a minor gap: the fallback at `:52-60` only handles `min === "0"` cases, so `"30 9 * * *"` returns the raw expression.
Impact: No tests on cron description logic. Minor UX gap for non-standard cron expressions (falls back to raw cron, which is acceptable but not ideal).

**F5. Next.js API proxy doesn't set `Content-Type` header on proxied request.** (schedule-status/route.ts:11-18)
Compare with the abandon route at `abandon/route.ts:17-23`: the schedule-status proxy passes `headers: { "Content-Type": "application/json" }` on the `daemonFetch` call, while the abandon proxy does not. Both approaches work because `daemonFetch` likely sets it, but the patterns are inconsistent. Neither approach is wrong.
Impact: Cosmetic inconsistency. Both work. Noting for completeness.

### What's working well

- All nine previously identified defects and spec gaps have implementations addressing them.
- The `readResourceOverrides()` regex approach correctly handles the 2-space indentation that the artifact writer produces. The prior `readArtifactField()` approach would have matched top-level fields and missed indented ones. Fixed precisely.
- The orchestrator's `createScheduledCommission()` and `updateScheduleStatus()` are clean additions that follow existing patterns (worker validation, project validation, cron validation via `isValidCron`, git commit under project lock).
- The schedule-status route follows the same pattern as other routes: Zod-less body parsing, error-to-HTTP-status mapping, consistent JSON responses.
- The `CommissionView.tsx` cleanly branches between schedule and one-shot views using the `commissionType` prop, sharing the timeline and notes components.
- 2262 tests pass.
