---
title: "Commission: Review: CLI commission commands (all phases)"
date: 2026-03-24
status: completed
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the CLI commission commands implementation covering all four phases from the plan.\n\n**Spec**: `.lore/specs/commissions/cli-commission-commands.md` (21 REQs: REQ-CLI-COM-1 through REQ-CLI-COM-21)\n**Plan**: `.lore/plans/commissions/cli-commission-commands.md`\n\n**Files to review**:\n- `daemon/routes/commissions.ts` (operation parameters + list filtering)\n- `cli/resolve.ts` (buildQueryString empty-string skip)\n- `cli/commission-format.ts` (new: formatter registry + formatters)\n- `cli/index.ts` (formatter registry integration + 429 error handler)\n- `cli/format.ts` (if modified)\n- All new and modified test files under `tests/cli/` and `tests/daemon/routes/`\n\n**Review checklist**:\n- All 21 REQs are addressed (noting REQ-CLI-COM-14 is preemptive, continue/save routes don't exist yet)\n- Operation parameter arrays match what route handlers actually check\n- Parameter order follows natural command phrasing (REQ-CLI-COM-2)\n- List filtering is server-side with combined status+worker intersection\n- buildQueryString empty-string skip doesn't break existing GET operations\n- Formatter registry correctly intercepts before generic formatResponse\n- JSON mode bypasses all custom formatting (REQ-CLI-COM-20, REQ-CLI-COM-21)\n- Detail formatter section ordering matches spec example\n- Action confirmation includes forward-compatible continue/save paths\n- No new daemon routes created (continue/save belong to halted continuation spec)\n- Terminal width handling for list table TITLE column"
dependencies:
  - commission-Dalton-20260323-220040
linked_artifacts:
  - daemon/routes/commissions.ts

  - cli/resolve.ts
  - cli/commission-format.ts
  - cli/index.ts
  - cli/format.ts
  - tests/cli/commission-format.test.ts
  - tests/cli/resolve.test.ts
  - tests/cli/cli-error-handling.test.ts
  - tests/daemon/routes/commissions-operations.test.ts
  - tests/daemon/routes/commissions-read.test.ts
  - cli/resolve.ts
  - cli/commission-format.ts
  - cli/index.ts
  - cli/format.ts
  - tests/cli/commission-format.test.ts
  - tests/cli/resolve.test.ts
  - tests/cli/cli-error-handling.test.ts
  - tests/daemon/routes/commissions-operations.test.ts
  - tests/daemon/routes/commissions-read.test.ts
activity_timeline:
  - timestamp: 2026-03-24T05:00:50.981Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T05:00:50.982Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-24T05:09:00.465Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-24T05:09:00.468Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-24T05:09:00.514Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-24T05:09:06.866Z
    event: progress_report
    reason: "Starting review. Reading spec, plan, and implementation files."
  - timestamp: 2026-03-24T05:09:51.310Z
    event: progress_report
    reason: "Read all source files, spec, plan, and tests. Beginning detailed requirement-by-requirement analysis."
  - timestamp: 2026-03-24T05:11:13.129Z
    event: progress_report
    reason: "All files read. Compiling findings by severity."
  - timestamp: 2026-03-24T05:12:03.575Z
    event: result_submitted
    reason: "# Review: CLI Commission Commands (21 REQs across 4 Phases)\n\n## Verdict\n\nClean implementation. All 21 requirements are addressed. No blocking defects. Two WARN-level findings and three observations.\n\n---\n\n## Requirement Coverage\n\nAll 21 REQs verified against the implementation:\n\n| REQ | Status | Evidence |\n|-----|--------|----------|\n| REQ-CLI-COM-1 (parameter completeness) | **PASS** | All six gaps from the spec table fixed. `create` has 4 params, `note` has `content`, `abandon` has `reason`, `schedule update` has `status`, `trigger update` has `status` + optional `projectName`. Verified each against its route handler. |\n| REQ-CLI-COM-2 (parameter order) | **PASS** | `create`: projectName, workerName, title, prompt. `abandon`: commissionId, reason. `note`: commissionId, content. Schedule/trigger update: commissionId, status. All match spec's natural command phrasing. |\n| REQ-CLI-COM-3 (list filtering) | **PASS** | `commissions.ts:450-459`: reads `status` and `worker` from query, filters after `scanCommissions`. Combined filters are intersection. Empty strings treated as absent (truthy check). |\n| REQ-CLI-COM-4 (list params declared) | **PASS** | `commissions.ts:628-632`: `projectName` required query, `status`/`worker` optional query. `buildQueryString` skips empty strings at `resolve.ts:103`. |\n| REQ-CLI-COM-5 (server-side filtering) | **PASS** | Filtering in route handler, not CLI. |\n| REQ-CLI-COM-6 (list table format) | **PASS** | `commission-format.ts:80-138`. Columns: ID, STATUS, WORKER, TITLE. Uses `workerDisplayTitle`. Terminal width truncation for TITLE. |\n| REQ-CLI-COM-7 (list JSON passthrough) | **PASS** | `index.ts:178` checks `!jsonMode` before custom formatters. |\n| REQ-CLI-COM-8 (detail format) | **PASS** | `commission-format.ts:189-242`. Section ordering matches spec: header → schedule → trigger → progress → result → timeline. Empty sections omitted. Timeline: last 5, most recent first. |\n| REQ-CLI-COM-9 (detail JSON passthrough) | **PASS** | Same JSON bypass as list. |\n| REQ-CLI-COM-10 (action confirmation) | **PASS** | `commission-format.ts:52-67`. dispatch/redispatch use response body `commissionId`. Others use positional arg. Forward-compatible for continue/save. |\n| REQ-CLI-COM-11 (daemon not running) | **PASS** | `index.ts:70-76`, existing behavior. |\n| REQ-CLI-COM-12 (404 not found) | **PASS** | Generic error handler at `index.ts:171-175` prints daemon's `Commission not found: <id>`. |\n| REQ-CLI-COM-13 (409 invalid transition) | **PASS** | Same handler, daemon's descriptive error message passes through. |\n| REQ-CLI-COM-14 (429 capacity) | **PASS** | `index.ts:167-170`. Preemptive, no route returns 429 yet. Correct message: \"At capacity, cannot continue commission. Try again later.\" |\n| REQ-CLI-COM-15 (stderr + exit 1) | **PASS** | All error paths use `console.error` + `process.exit(1)`. |\n| REQ-CLI-COM-15a (missing args) | **PASS** | `validateArgs` at `resolve.ts:134-149`. Names missing params, shows usage line with `<required>` and `[optional]`. |\n| REQ-CLI-COM-16 (primary operations) | **PASS** | list, read, dispatch, cancel, abandon all have parameters + custom formatting. continue/save forward-compatible. |\n| REQ-CLI-COM-17 (secondary operations) | **PASS** | create, redispatch, update, note, schedule update, trigger update, dependency check all have complete parameters. |\n| REQ-CLI-COM-18 (formatter interceptor) | **PASS** | `getCommissionFormatter` at `commission-format.ts:32-36`, used at `index.ts:179-183`. |\n| REQ-CLI-COM-19 (formatter registry) | **PASS** | `COMMISSION_FORMATTERS` map at `commission-format.ts:5-8`. |\n| REQ-CLI-COM-20 (JSON bypasses custom) | **PASS** | `index.ts:178`: `if (!jsonMode)` guards all custom formatting. |\n| REQ-CLI-COM-21 (JSON returns raw) | **PASS** | Falls through to `formatResponse(data, jsonMode)` which returns `JSON.stringify(data, null, 2)`. |\n\n---\n\n## Findings\n\n### WARN-1: No new daemon routes for continue/save\n\n**What**: No `POST /commission/run/continue` or `POST /commission/run/save` routes were created. \n**Where**: `daemon/routes/commissions.ts` (confirmed absent via grep).\n**Impact**: None. The spec constraint says \"This spec does not add new daemon route handlers.\" The plan explicitly documents this gap and the forward-compatible design. Two success criteria from the spec are deferred. This is the correct decision.\n\n### WARN-2: 429 handler position creates a silent discard for non-commission 429s\n\n**What**: The 429 handler at `cli/index.ts:167-170` fires for *any* 429 response, not just commission operations. The message says \"cannot continue commission\" regardless of which operation triggered it.\n**Where**: `cli/index.ts:167-170`.\n**Impact**: Low today (no route returns 429). When non-commission routes eventually return 429 for rate limiting, the error message will be misleading. The fix is trivial: either check the operation path before printing the commission-specific message, or use the daemon's error body instead.\n**Recommendation**: Defer until a route actually returns 429, but note this as a forward-compatibility concern.\n\n### WARN-3: No dedicated test for the 429 handler\n\n**What**: The `cli-error-handling.test.ts` tests 404 and 409 scenarios via Hono's test client, but no test exercises the 429 path at `cli/index.ts:167-170`.\n**Where**: `tests/cli/cli-error-handling.test.ts:139-204`.\n**Impact**: The 429 handler is 3 lines of code and clearly correct by inspection, but the plan specified testing it in Phase 4. The test file has a comment acknowledging it's preemptive (\"The 429 handler is preemptive (no route currently returns 429)\"), which is fair. However, since the handler exists, a test proving it fires on a mocked 429 response would be trivial to add and would complete the Phase 4 test matrix.\n\n---\n\n## Observations (not actionable, for context)\n\n1. **List separator line capped at TITLE.length + 20 = 25 chars** (`commission-format.ts:125`). The separator under TITLE is shorter than the actual content width. This is a visual choice, not a spec violation. The spec example shows a separator roughly matching content width, but doesn't mandate it.\n\n2. **`CommissionDetailResponse` interface** (`commission-format.ts:158-176`) doesn't include `maxDepth` or `lastSpawnedId` from the route's `triggerInfo`/`scheduleInfo`. These fields exist in the JSON response but the formatter doesn't display them. This is intentional: the interface describes what the formatter needs, not the full response shape.\n\n3. **Test file naming**: Filter tests live in `commissions-read.test.ts` rather than a separate `commissions-filter.test.ts`. This is fine; the tests are grouped by describe block and the file is about read routes, which filtering is part of.\n\n---\n\n## Checklist Results\n\n| Checklist item | Result |\n|----------------|--------|\n| All 21 REQs addressed | Yes (REQ-CLI-COM-14 preemptive, continue/save forward-compatible) |\n| Operation parameters match route handlers | Yes, verified all six |\n| Parameter order follows natural phrasing | Yes |\n| List filtering is server-side with intersection | Yes |\n| buildQueryString empty-string skip safe globally | Yes (only affects optional trailing params) |\n| Formatter registry intercepts before generic | Yes |\n| JSON mode bypasses custom formatting | Yes |\n| Detail formatter section ordering matches spec | Yes |\n| Action confirmation forward-compatible | Yes (continue/save in action paths set) |\n| No new daemon routes for continue/save | Correct, none created |\n| Terminal width handling for TITLE | Yes, with 80-char fallback |"
  - timestamp: 2026-03-24T05:12:10.803Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All files read. Compiling findings by severity."
projectName: guild-hall
---
# Review: CLI Commission Commands (21 REQs across 4 Phases)

## Verdict

Clean implementation. All 21 requirements are addressed. No blocking defects. Two WARN-level findings and three observations.

---

## Requirement Coverage

All 21 REQs verified against the implementation:

| REQ | Status | Evidence |
|-----|--------|----------|
| REQ-CLI-COM-1 (parameter completeness) | **PASS** | All six gaps from the spec table fixed. `create` has 4 params, `note` has `content`, `abandon` has `reason`, `schedule update` has `status`, `trigger update` has `status` + optional `projectName`. Verified each against its route handler. |
| REQ-CLI-COM-2 (parameter order) | **PASS** | `create`: projectName, workerName, title, prompt. `abandon`: commissionId, reason. `note`: commissionId, content. Schedule/trigger update: commissionId, status. All match spec's natural command phrasing. |
| REQ-CLI-COM-3 (list filtering) | **PASS** | `commissions.ts:450-459`: reads `status` and `worker` from query, filters after `scanCommissions`. Combined filters are intersection. Empty strings treated as absent (truthy check). |
| REQ-CLI-COM-4 (list params declared) | **PASS** | `commissions.ts:628-632`: `projectName` required query, `status`/`worker` optional query. `buildQueryString` skips empty strings at `resolve.ts:103`. |
| REQ-CLI-COM-5 (server-side filtering) | **PASS** | Filtering in route handler, not CLI. |
| REQ-CLI-COM-6 (list table format) | **PASS** | `commission-format.ts:80-138`. Columns: ID, STATUS, WORKER, TITLE. Uses `workerDisplayTitle`. Terminal width truncation for TITLE. |
| REQ-CLI-COM-7 (list JSON passthrough) | **PASS** | `index.ts:178` checks `!jsonMode` before custom formatters. |
| REQ-CLI-COM-8 (detail format) | **PASS** | `commission-format.ts:189-242`. Section ordering matches spec: header → schedule → trigger → progress → result → timeline. Empty sections omitted. Timeline: last 5, most recent first. |
| REQ-CLI-COM-9 (detail JSON passthrough) | **PASS** | Same JSON bypass as list. |
| REQ-CLI-COM-10 (action confirmation) | **PASS** | `commission-format.ts:52-67`. dispatch/redispatch use response body `commissionId`. Others use positional arg. Forward-compatible for continue/save. |
| REQ-CLI-COM-11 (daemon not running) | **PASS** | `index.ts:70-76`, existing behavior. |
| REQ-CLI-COM-12 (404 not found) | **PASS** | Generic error handler at `index.ts:171-175` prints daemon's `Commission not found: <id>`. |
| REQ-CLI-COM-13 (409 invalid transition) | **PASS** | Same handler, daemon's descriptive error message passes through. |
| REQ-CLI-COM-14 (429 capacity) | **PASS** | `index.ts:167-170`. Preemptive, no route returns 429 yet. Correct message: "At capacity, cannot continue commission. Try again later." |
| REQ-CLI-COM-15 (stderr + exit 1) | **PASS** | All error paths use `console.error` + `process.exit(1)`. |
| REQ-CLI-COM-15a (missing args) | **PASS** | `validateArgs` at `resolve.ts:134-149`. Names missing params, shows usage line with `<required>` and `[optional]`. |
| REQ-CLI-COM-16 (primary operations) | **PASS** | list, read, dispatch, cancel, abandon all have parameters + custom formatting. continue/save forward-compatible. |
| REQ-CLI-COM-17 (secondary operations) | **PASS** | create, redispatch, update, note, schedule update, trigger update, dependency check all have complete parameters. |
| REQ-CLI-COM-18 (formatter interceptor) | **PASS** | `getCommissionFormatter` at `commission-format.ts:32-36`, used at `index.ts:179-183`. |
| REQ-CLI-COM-19 (formatter registry) | **PASS** | `COMMISSION_FORMATTERS` map at `commission-format.ts:5-8`. |
| REQ-CLI-COM-20 (JSON bypasses custom) | **PASS** | `index.ts:178`: `if (!jsonMode)` guards all custom formatting. |
| REQ-CLI-COM-21 (JSON returns raw) | **PASS** | Falls through to `formatResponse(data, jsonMode)` which returns `JSON.stringify(data, null, 2)`. |

---

## Findings

### WARN-1: No new daemon routes for continue/save

**What**: No `POST /commission/run/continue` or `POST /commission/run/save` routes were created. 
**Where**: `daemon/routes/commissions.ts` (confirmed absent via grep).
**Impact**: None. The spec constraint says "This spec does not add new daemon route handlers." The plan explicitly documents this gap and the forward-compatible design. Two success criteria from the spec are deferred. This is the correct decision.

### WARN-2: 429 handler position creates a silent discard for non-commission 429s

**What**: The 429 handler at `cli/index.ts:167-170` fires for *any* 429 response, not just commission operations. The message says "cannot continue commission" regardless of which operation triggered it.
**Where**: `cli/index.ts:167-170`.
**Impact**: Low today (no route returns 429). When non-commission routes eventually return 429 for rate limiting, the error message will be misleading. The fix is trivial: either check the operation path before printing the commission-specific message, or use the daemon's error body instead.
**Recommendation**: Defer until a route actually returns 429, but note this as a forward-compatibility concern.

### WARN-3: No dedicated test for the 429 handler

**What**: The `cli-error-handling.test.ts` tests 404 and 409 scenarios via Hono's test client, but no test exercises the 429 path at `cli/index.ts:167-170`.
**Where**: `tests/cli/cli-error-handling.test.ts:139-204`.
**Impact**: The 429 handler is 3 lines of code and clearly correct by inspection, but the plan specified testing it in Phase 4. The test file has a comment acknowledging it's preemptive ("The 429 handler is preemptive (no route currently returns 429)"), which is fair. However, since the handler exists, a test proving it fires on a mocked 429 response would be trivial to add and would complete the Phase 4 test matrix.

---

## Observations (not actionable, for context)

1. **List separator line capped at TITLE.length + 20 = 25 chars** (`commission-format.ts:125`). The separator under TITLE is shorter than the actual content width. This is a visual choice, not a spec violation. The spec example shows a separator roughly matching content width, but doesn't mandate it.

2. **`CommissionDetailResponse` interface** (`commission-format.ts:158-176`) doesn't include `maxDepth` or `lastSpawnedId` from the route's `triggerInfo`/`scheduleInfo`. These fields exist in the JSON response but the formatter doesn't display them. This is intentional: the interface describes what the formatter needs, not the full response shape.

3. **Test file naming**: Filter tests live in `commissions-read.test.ts` rather than a separate `commissions-filter.test.ts`. This is fine; the tests are grouped by describe block and the file is about read routes, which filtering is part of.

---

## Checklist Results

| Checklist item | Result |
|----------------|--------|
| All 21 REQs addressed | Yes (REQ-CLI-COM-14 preemptive, continue/save forward-compatible) |
| Operation parameters match route handlers | Yes, verified all six |
| Parameter order follows natural phrasing | Yes |
| List filtering is server-side with intersection | Yes |
| buildQueryString empty-string skip safe globally | Yes (only affects optional trailing params) |
| Formatter registry intercepts before generic | Yes |
| JSON mode bypasses custom formatting | Yes |
| Detail formatter section ordering matches spec | Yes |
| Action confirmation forward-compatible | Yes (continue/save in action paths set) |
| No new daemon routes for continue/save | Correct, none created |
| Terminal width handling for TITLE | Yes, with 80-char fallback |
