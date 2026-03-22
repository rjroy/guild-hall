---
title: "Commission: Verify and fix Thorne review findings from triggered commissions"
date: 2026-03-22
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Thorne reviewed the triggered commissions implementation across four phases and surfaced findings. Check whether each was already addressed by a later phase's implementation. For any that remain unfixed, fix them.\n\n**Finding 1: Dead constant `COMMISSION_SOURCE_EVENTS`**\nFile: `daemon/services/trigger-evaluator.ts:103`\nA `Set` declared but never referenced. `extractSourceInfo` uses direct string comparisons instead.\nAction: Remove the constant, or refactor to use it.\n\n**Finding 2: `last_triggered` timestamp captured twice**\nFile: `daemon/services/trigger-evaluator.ts:270-288`\nTwo separate `new Date().toISOString()` calls produce different timestamps for the artifact write vs the in-memory state mutation.\nAction: Capture `const now = new Date().toISOString()` once and use it in both places.\n\n**Finding 3: gray-matter coerces `fields` values**\nFile: `daemon/services/commission/record.ts:378-400`\n`readTriggerMetadata` casts `trigger.match` directly. gray-matter will coerce `\"true\"` to boolean, `\"123\"` to number, breaking the `Record<string, string>` contract. `micromatch.isMatch(\"completed\", true as any)` would produce unpredictable behavior.\nAction: After parsing, coerce `fields` values to strings: `Object.fromEntries(Object.entries(match.fields).map(([k, v]) => [k, String(v)]))`.\n\n**Finding 4: Route doesn't validate `match.type`**\nFile: `daemon/routes/commissions.ts:103-117`\nThe commission creation route accepts any `match.type` without validation against `SYSTEM_EVENT_TYPES`. Only the toolbox handler validates. The route is the trust boundary.\nAction: Add `match.type` validation at the route level or in the orchestrator's `createTriggeredCommission`.\n\n**Finding 5: `dispatchCommission` double cast**\nFile: `daemon/services/trigger-evaluator.ts:263`\n`spawnedId as unknown as CommissionId` bypasses branded type safety with no explanatory comment.\nAction: Add a comment explaining why the cast is needed (createCommission returns string, not branded ID).\n\n**Finding 6: `TRIGGER_STATUS_TRANSITIONS` backward dependency**\nFile: `daemon/services/manager/toolbox.ts:1061` imported by `daemon/services/commission/orchestrator.ts`\nThe orchestrator (commission layer) imports from the manager toolbox (manager layer). This is architecturally backward.\nAction: Move `TRIGGER_STATUS_TRANSITIONS` to `daemon/services/commission/trigger-lifecycle.ts` (or similar commission-layer location). Update imports in both the toolbox and orchestrator.\n\nFor each finding: check the current code, determine if it's already fixed, and if not, fix it. Add tests for any behavioral changes (especially #3 and #4). Run `bun test` before declaring complete."
dependencies: []
linked_artifacts:
  - daemon/services/trigger-evaluator.ts

  - daemon/services/commission/record.ts
  - daemon/routes/commissions.ts
  - daemon/services/commission/trigger-lifecycle.ts
  - daemon/services/commission/orchestrator.ts
  - daemon/services/manager/toolbox.ts
  - tests/daemon/services/commission/record.test.ts
  - tests/daemon/routes/commissions.test.ts
  - tests/daemon/services/trigger-evaluator-service.test.ts
  - daemon/services/commission/record.ts
  - daemon/routes/commissions.ts
  - daemon/services/commission/trigger-lifecycle.ts
  - daemon/services/commission/orchestrator.ts
  - daemon/services/manager/toolbox.ts
  - tests/daemon/services/commission/record.test.ts
  - tests/daemon/routes/commissions.test.ts
  - tests/daemon/services/trigger-evaluator-service.test.ts
activity_timeline:
  - timestamp: 2026-03-22T00:27:57.056Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T00:27:57.058Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-22T00:27:57.100Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-22T00:28:04.378Z
    event: progress_report
    reason: "Reading source files to assess all six findings."
  - timestamp: 2026-03-22T00:28:52.348Z
    event: progress_report
    reason: "All six findings confirmed unfixed. Starting implementation: (1) remove dead constant, (2) deduplicate timestamp, (3) coerce fields to strings, (4) validate match.type at route, (5) add comment on double cast, (6) move TRIGGER_STATUS_TRANSITIONS to commission layer."
  - timestamp: 2026-03-22T00:33:24.779Z
    event: result_submitted
    reason: "All six findings from Thorne's review were confirmed unfixed and have been resolved:\n\n**Finding 1: Dead constant `COMMISSION_SOURCE_EVENTS`** — Removed the unused `Set` from `trigger-evaluator.ts:103`.\n\n**Finding 2: Duplicate timestamps** — Captured `const firedAt = new Date().toISOString()` once and used it for both the artifact write and the in-memory state mutation in `trigger-evaluator.ts`.\n\n**Finding 3: gray-matter field coercion** — Added string coercion for `match.fields` values in both `record.ts:readTriggerMetadata` and `trigger-evaluator.ts:readTriggerArtifact`. Values like `true` (boolean) and `123` (number) from gray-matter are now coerced back to strings via `String(v)`. Added tests in both `record.test.ts` and `trigger-evaluator-service.test.ts` that write unquoted YAML values and verify they survive as strings.\n\n**Finding 4: Route match.type validation** — Added `SYSTEM_EVENT_TYPES` validation at the route level in `commissions.ts` before `createTriggeredCommission` is called. Returns 400 for invalid or missing `match.type`. Added two tests: invalid type and missing type.\n\n**Finding 5: Double cast comment** — Added explanatory comment on the `spawnedId as unknown as CommissionId` cast explaining why it's needed.\n\n**Finding 6: Backward dependency** — Moved `TRIGGER_STATUS_TRANSITIONS` to new file `daemon/services/commission/trigger-lifecycle.ts`. Updated `orchestrator.ts` to import from the new location. Updated `toolbox.ts` to import and re-export for backward compatibility with existing test imports.\n\n**Verification:** Typecheck passes. Full test suite: 3342 pass, 0 fail across 145 files. 5 new tests added (2 for field coercion, 2 for route validation, plus existing TRIGGER_STATUS_TRANSITIONS tests continue to pass via re-export)."
  - timestamp: 2026-03-22T00:33:28.385Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All six findings confirmed unfixed. Starting implementation: (1) remove dead constant, (2) deduplicate timestamp, (3) coerce fields to strings, (4) validate match.type at route, (5) add comment on double cast, (6) move TRIGGER_STATUS_TRANSITIONS to commission layer."
projectName: guild-hall
---
All six findings from Thorne's review were confirmed unfixed and have been resolved:

**Finding 1: Dead constant `COMMISSION_SOURCE_EVENTS`** — Removed the unused `Set` from `trigger-evaluator.ts:103`.

**Finding 2: Duplicate timestamps** — Captured `const firedAt = new Date().toISOString()` once and used it for both the artifact write and the in-memory state mutation in `trigger-evaluator.ts`.

**Finding 3: gray-matter field coercion** — Added string coercion for `match.fields` values in both `record.ts:readTriggerMetadata` and `trigger-evaluator.ts:readTriggerArtifact`. Values like `true` (boolean) and `123` (number) from gray-matter are now coerced back to strings via `String(v)`. Added tests in both `record.test.ts` and `trigger-evaluator-service.test.ts` that write unquoted YAML values and verify they survive as strings.

**Finding 4: Route match.type validation** — Added `SYSTEM_EVENT_TYPES` validation at the route level in `commissions.ts` before `createTriggeredCommission` is called. Returns 400 for invalid or missing `match.type`. Added two tests: invalid type and missing type.

**Finding 5: Double cast comment** — Added explanatory comment on the `spawnedId as unknown as CommissionId` cast explaining why it's needed.

**Finding 6: Backward dependency** — Moved `TRIGGER_STATUS_TRANSITIONS` to new file `daemon/services/commission/trigger-lifecycle.ts`. Updated `orchestrator.ts` to import from the new location. Updated `toolbox.ts` to import and re-export for backward compatibility with existing test imports.

**Verification:** Typecheck passes. Full test suite: 3342 pass, 0 fail across 145 files. 5 new tests added (2 for field coercion, 2 for route validation, plus existing TRIGGER_STATUS_TRANSITIONS tests continue to pass via re-export).
