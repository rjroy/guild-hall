---
title: "Commission: Triggered commissions Phase 2: Review (toolbox tools)"
date: 2026-03-21
status: completed
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the work from the commission that implemented `.lore/plans/commissions/triggered-commissions-tools.md`.\n\nRead the plan first. This adds `create_triggered_commission` and `update_trigger` tools to the Guild Master's manager toolbox.\n\nFocus areas:\n1. **DI wiring** — `triggerEvaluator` flows from `createProductionApp()` through the services bag to `ManagerToolboxDeps`. Lazy ref pattern matches `scheduleLifecycle`.\n2. **Route extension** — `type: \"triggered\"` handled in commission creation route with proper validation (match.type against SYSTEM_EVENT_TYPES, workerName against packages).\n3. **Create handler** — Delegates to route, then calls `registerTrigger()`. Failure after creation (registerTrigger fails) is handled gracefully.\n4. **Update handler** — Status transitions are correct. Subscription lifecycle (unregister on pause, register on resume, replace on field update). Combined status + field update ordering avoids double registration.\n5. **Tool schemas** — Zod schemas match the spec's parameter tables.\n6. **Shared constants** — `TRIGGER_STATUS_TRANSITIONS` extracted for reuse.\n7. **YAML serialization** — Match block writing via regex. `serializeTriggerMatchBlock` helper is testable."
dependencies:
  - commission-Dalton-20260321-155946
linked_artifacts:
  - .lore/plans/commissions/triggered-commissions-tools.md

activity_timeline:
  - timestamp: 2026-03-21T22:59:57.030Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T22:59:57.033Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-21T23:28:56.388Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-21T23:28:56.390Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-21T23:28:56.435Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-21T23:29:20.868Z
    event: progress_report
    reason: "Reading the plan and identifying changed files. Now reading all modified source files in parallel."
  - timestamp: 2026-03-21T23:30:03.079Z
    event: progress_report
    reason: "Read all implementation files. Now examining the existing patterns for comparison (writeStatusAndTimeline signature, escapeYamlValue, match regex pattern) and checking route validation gaps."
  - timestamp: 2026-03-21T23:30:42.401Z
    event: progress_report
    reason: "Finished reading all implementation and test code. Now compiling findings across all seven focus areas from the commission prompt."
  - timestamp: 2026-03-21T23:31:02.420Z
    event: progress_report
    reason: "Compiling final review findings. Writing the review report now."
  - timestamp: 2026-03-21T23:32:18.788Z
    event: result_submitted
    reason: "# Review: Triggered Commissions Toolbox Tools\n\n**Scope:** Plan `.lore/plans/commissions/triggered-commissions-tools.md`, implementation commit `e2e2e84`.\n**Files changed:** 9 files (+615 test lines, +322 toolbox lines, +122 orchestrator lines, +18 route lines, +7 app wiring lines, +2 toolbox-utils lines, +6 meeting orchestrator lines).\n\n---\n\n## Requirement Coverage\n\n| Requirement | Status | Evidence |\n|-------------|--------|----------|\n| REQ-TRIG-25a: `create_triggered_commission` tool | **Satisfied** | `makeCreateTriggeredCommissionHandler` at toolbox.ts:1066. Schema matches spec parameter table. |\n| REQ-TRIG-25b: `update_trigger` tool | **Satisfied** | `makeUpdateTriggerHandler` at toolbox.ts:1168. Schema matches spec parameter table. |\n| REQ-TRIG-25c: DI patterns match scheduled commission tools | **Satisfied** | Same `make*Handler(deps: ManagerToolboxDeps)` pattern. Lazy ref wiring matches `scheduleLifecycleRef`. |\n| REQ-TRIG-25d: Dynamic registration without restart | **Satisfied** | Create handler calls `registerTrigger()` post-route. Update handler manages unregister/register lifecycle. |\n\n---\n\n## Findings\n\n### DEFECT-1: Route does not validate `match.type` or `workerName` (WARN)\n\n**File:** `daemon/routes/commissions.ts:103-117`\n**What:** The route accepts any `match.type` value and any `workerName` string without validation. It delegates to the orchestrator, which also does not validate `match.type` against `SYSTEM_EVENT_TYPES`. Compare with the `scheduled` path where `cron` is validated at the route level.\n\n**Why it matters:** The plan (Step 2) explicitly calls for the route to validate `match.type` against `SYSTEM_EVENT_TYPES` and return 400 on invalid type. The route also should validate `workerName` against packages. Currently, only the toolbox handler performs these validations (toolbox.ts:1081, 1092-1108). If the route is called directly (not through the toolbox), invalid triggers get created and committed to the branch without complaint.\n\n**Impact:** A direct API call to the route can create a trigger artifact with a bogus event type. The trigger evaluator would register it, but it would never fire (no events match an invalid type). No runtime crash, but a confusing orphaned artifact.\n\n**What to do:** Add `match.type` validation at the route level or in `createTriggeredCommission` in the orchestrator. The handler's client-side validation is a nice UX addition, but the route is the trust boundary.\n\n### DEFECT-2: Prompt regex replacement matches only double-quoted prompts (WARN)\n\n**File:** `daemon/services/manager/toolbox.ts:1279`\n**What:** The regex `/^prompt: \".*\"$/m` matches `prompt: \"some text\"` but will fail if the prompt value contains a newline (multi-line YAML scalar) or if the value is single-quoted or unquoted. The `escapeYamlValue` function escapes for double quotes, but the regex assumes the original value is also a single-line double-quoted string.\n\n**Why it matters:** If a prompt was originally written with a YAML block scalar (`prompt: |`) or contains characters that cause gray-matter to serialize differently, the regex won't match and the update silently does nothing. The file gets written back unchanged for the prompt field while the caller gets `updated: true`.\n\n**Impact:** Narrow failure mode. All trigger artifacts created by the orchestrator use double-quoted prompts (orchestrator.ts:1575), so the regex will match artifacts created by the system. Hand-edited artifacts or artifacts touched by gray-matter's reformatter could break this. Same risk profile as the existing `update_schedule` handler's prompt regex.\n\n**What to do:** This is acceptable as-is given the established pattern, but note that the existing fragility is now replicated in a second handler.\n\n### DEFECT-3: Match block regex assumes specific YAML indentation structure (WARN)\n\n**File:** `daemon/services/manager/toolbox.ts:1262`\n**What:** The regex `/^  match:\\n(?:    .+\\n)+/m` requires exactly 2-space indent for `match:` and 4-space indent for its children. It relies on the serialization format produced by `createTriggeredCommission` in the orchestrator.\n\n**Why it matters:** If the match block has no children lines (just `  match:\\n` followed by a non-indented line), the regex won't match (`+` requires at least one `    .+\\n` line). A match with only `type` on a separate line works, but if someone hand-edits and puts match properties inline (`match: { type: \"x\" }`), the replacement fails silently.\n\nThe `serializeTriggerMatchBlock` helper is correctly tested and always produces the expected format. The fragility is on the read side, not the write side.\n\n**Impact:** Same risk profile as DEFECT-2. System-generated artifacts will always match. Hand-edited ones might not.\n\n**What to do:** No action required given the established pattern. The risk is documented in the plan's Risk Notes section.\n\n### OBSERVATION-1: `serializeTriggerMatchBlock` does not quote YAML-special values\n\n**File:** `daemon/services/manager/toolbox.ts:1317-1331`\n**What:** Field values in the `fields` sub-block are written bare: `${key}: ${value}`. If a value contains a colon (e.g., `status: \"completed: yes\"`), a hash, or starts with a YAML-special character (`[`, `{`, `*`, `&`, etc.), the resulting YAML is invalid.\n\n**Why it matters:** The spec defines `fields` as `Record<string, string>` with glob patterns. Glob patterns typically don't contain YAML-special characters, so real-world risk is low. But the function is exported and tested in isolation. A defensible implementation would quote values.\n\nThe orchestrator's `createTriggeredCommission` (orchestrator.ts:1562) has the same issue: field values are unquoted.\n\n**What to do:** Consider quoting field values in both `serializeTriggerMatchBlock` and the orchestrator's match block generation. Low priority.\n\n### OBSERVATION-2: Combined status + field update: unregister happens even for `paused→active` with fields\n\n**File:** `daemon/services/manager/toolbox.ts:1286-1290`\n**What:** When `status: \"active\"` is combined with field updates and the trigger was paused, the status transition skips registration (line 1224, correct optimization). Then the field update path (line 1287-1289) runs `unregisterTrigger` followed by `registerTrigger`. The `unregisterTrigger` call on a commission that has no active subscription is a no-op (the trigger evaluator uses a map lookup), so this is harmless. But it's worth noting.\n\nThe test at line 1498-1536 correctly verifies the net outcome: exactly one `registerTrigger` call. It does not check for the spurious `unregisterTrigger` call, which is fine since the plan explicitly acknowledges this ordering.\n\n**Impact:** None. The unregister on a non-subscribed trigger is a no-op.\n\n### OBSERVATION-3: `recordOps!` non-null assertion in update handler\n\n**File:** `daemon/services/manager/toolbox.ts:1189, 1200, 1219, 1227, 1235`\n**What:** `deps.recordOps!` is asserted non-null five times. The `ManagerToolboxDeps` interface declares `recordOps` as optional. The scheduled commission tools use the same pattern (`deps.recordOps!`). If `recordOps` is undefined at runtime, this throws a TypeError with no contextual error message.\n\n**Impact:** In practice, `recordOps` is always provided by the `managerToolboxFactory` (toolbox.ts:1725). The assertion matches the established pattern. Not a defect, but worth noting that a future refactoring that removes `recordOps` from the services bag would surface as a cryptic runtime error in the trigger tools.\n\n### OBSERVATION-4: Orchestrator's `createTriggeredCommission` does not validate `match.type`\n\n**File:** `daemon/services/commission/orchestrator.ts:1507-1607`\n**What:** Connected to DEFECT-1. The orchestrator validates `projectName` and `workerName` but trusts `match.type` as-is. The handler validates before calling the route, but the orchestrator is the business logic layer and should enforce its own invariants.\n\n---\n\n## DI Wiring Assessment\n\nThe wiring path is complete and correct:\n\n1. `daemon/app.ts:349` — `triggerEvaluatorRef` created as lazy ref\n2. `daemon/app.ts:365` — passed to commission orchestrator deps\n3. `daemon/app.ts:385` — passed to meeting session deps\n4. `daemon/app.ts:580` — `.current` set after trigger evaluator construction\n5. `daemon/services/commission/orchestrator.ts:1993, 2255` — dereferenced in both inline services bag construction sites\n6. `daemon/services/meeting/orchestrator.ts:509` — dereferenced in meeting services bag\n7. `daemon/lib/toolbox-utils.ts:31` — `GuildHallToolServices.triggerEvaluator` field added\n8. `daemon/services/manager/toolbox.ts:1727` — `managerToolboxFactory` reads from `ctx.services`\n9. `daemon/services/manager/toolbox.ts:109` — `ManagerToolboxDeps.triggerEvaluator` field added\n\nThe pattern matches `scheduleLifecycle` exactly. The lazy ref ensures the trigger evaluator is available by the time any toolbox runs (sessions start after daemon initialization).\n\n## Tool Schema Assessment\n\nBoth Zod schemas match the spec's parameter tables exactly. `match.type` is `z.string()` (not restricted to `SYSTEM_EVENT_TYPES` at schema level, validated in handler logic). `approval` uses `z.enum([\"auto\", \"confirm\"])`. `maxDepth` uses `z.number()`. `dependencies` uses `z.array(z.string())`. All optionals marked correctly.\n\n## Shared Constants Assessment\n\n`TRIGGER_STATUS_TRANSITIONS` is exported at toolbox.ts:1061 with comment \"Exported for reuse by the future daemon route (Phase 3).\" The transitions match the spec (active↔paused, active→completed, paused→completed; completed and failed are terminal).\n\n## YAML Serialization Assessment\n\n`serializeTriggerMatchBlock` is isolated and well-tested (3 tests covering type-only, with projectName, and with fields). The orchestrator duplicates the match serialization logic instead of calling the helper (orchestrator.ts:1556-1565 vs toolbox.ts:1317-1331). This is a minor duplication; the orchestrator might not have access to the toolbox's export, and it's building the entire template string inline. Not a defect, but future changes to match serialization would need two-site updates.\n\n## Test Coverage Assessment\n\n615 lines of new tests covering:\n- `TRIGGER_STATUS_TRANSITIONS` (4 tests)\n- `serializeTriggerMatchBlock` (3 tests)\n- `makeCreateTriggeredCommissionHandler` (7 tests: success path, registerTrigger call, invalid match type, unknown worker, route failure, registerTrigger failure, full options passthrough)\n- `makeUpdateTriggerHandler` (10 tests: type rejection, all 6 status transitions including terminal states, field update with subscription replacement, approval update, paused field update without subscription, combined status+field, return value)\n- Route tests (3 tests: success, missing match 400, defaults)\n\nCoverage is thorough. One gap: no test for the prompt update path in `makeUpdateTriggerHandler` when the artifact has the expected format (the paused-field-update test covers prompt but doesn't verify the regex replacement worked on the file content, only that the file was written).\n\n---\n\n## Summary\n\nThe implementation is solid. DI wiring is complete, tool schemas match the spec, subscription lifecycle management is correct, and the combined status+field optimization avoids double registration as designed.\n\nThe one finding that warrants action is **DEFECT-1**: the route and orchestrator accept any `match.type` without validating against `SYSTEM_EVENT_TYPES`. The handler validates, but the route is the trust boundary. The plan explicitly called for route-level validation in Step 2, but the implementation deferred it to the handler only. This means direct API calls bypass the validation."
  - timestamp: 2026-03-21T23:32:25.676Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Compiling final review findings. Writing the review report now."
projectName: guild-hall
---
# Review: Triggered Commissions Toolbox Tools

**Scope:** Plan `.lore/plans/commissions/triggered-commissions-tools.md`, implementation commit `e2e2e84`.
**Files changed:** 9 files (+615 test lines, +322 toolbox lines, +122 orchestrator lines, +18 route lines, +7 app wiring lines, +2 toolbox-utils lines, +6 meeting orchestrator lines).

---

## Requirement Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| REQ-TRIG-25a: `create_triggered_commission` tool | **Satisfied** | `makeCreateTriggeredCommissionHandler` at toolbox.ts:1066. Schema matches spec parameter table. |
| REQ-TRIG-25b: `update_trigger` tool | **Satisfied** | `makeUpdateTriggerHandler` at toolbox.ts:1168. Schema matches spec parameter table. |
| REQ-TRIG-25c: DI patterns match scheduled commission tools | **Satisfied** | Same `make*Handler(deps: ManagerToolboxDeps)` pattern. Lazy ref wiring matches `scheduleLifecycleRef`. |
| REQ-TRIG-25d: Dynamic registration without restart | **Satisfied** | Create handler calls `registerTrigger()` post-route. Update handler manages unregister/register lifecycle. |

---

## Findings

### DEFECT-1: Route does not validate `match.type` or `workerName` (WARN)

**File:** `daemon/routes/commissions.ts:103-117`
**What:** The route accepts any `match.type` value and any `workerName` string without validation. It delegates to the orchestrator, which also does not validate `match.type` against `SYSTEM_EVENT_TYPES`. Compare with the `scheduled` path where `cron` is validated at the route level.

**Why it matters:** The plan (Step 2) explicitly calls for the route to validate `match.type` against `SYSTEM_EVENT_TYPES` and return 400 on invalid type. The route also should validate `workerName` against packages. Currently, only the toolbox handler performs these validations (toolbox.ts:1081, 1092-1108). If the route is called directly (not through the toolbox), invalid triggers get created and committed to the branch without complaint.

**Impact:** A direct API call to the route can create a trigger artifact with a bogus event type. The trigger evaluator would register it, but it would never fire (no events match an invalid type). No runtime crash, but a confusing orphaned artifact.

**What to do:** Add `match.type` validation at the route level or in `createTriggeredCommission` in the orchestrator. The handler's client-side validation is a nice UX addition, but the route is the trust boundary.

### DEFECT-2: Prompt regex replacement matches only double-quoted prompts (WARN)

**File:** `daemon/services/manager/toolbox.ts:1279`
**What:** The regex `/^prompt: ".*"$/m` matches `prompt: "some text"` but will fail if the prompt value contains a newline (multi-line YAML scalar) or if the value is single-quoted or unquoted. The `escapeYamlValue` function escapes for double quotes, but the regex assumes the original value is also a single-line double-quoted string.

**Why it matters:** If a prompt was originally written with a YAML block scalar (`prompt: |`) or contains characters that cause gray-matter to serialize differently, the regex won't match and the update silently does nothing. The file gets written back unchanged for the prompt field while the caller gets `updated: true`.

**Impact:** Narrow failure mode. All trigger artifacts created by the orchestrator use double-quoted prompts (orchestrator.ts:1575), so the regex will match artifacts created by the system. Hand-edited artifacts or artifacts touched by gray-matter's reformatter could break this. Same risk profile as the existing `update_schedule` handler's prompt regex.

**What to do:** This is acceptable as-is given the established pattern, but note that the existing fragility is now replicated in a second handler.

### DEFECT-3: Match block regex assumes specific YAML indentation structure (WARN)

**File:** `daemon/services/manager/toolbox.ts:1262`
**What:** The regex `/^  match:\n(?:    .+\n)+/m` requires exactly 2-space indent for `match:` and 4-space indent for its children. It relies on the serialization format produced by `createTriggeredCommission` in the orchestrator.

**Why it matters:** If the match block has no children lines (just `  match:\n` followed by a non-indented line), the regex won't match (`+` requires at least one `    .+\n` line). A match with only `type` on a separate line works, but if someone hand-edits and puts match properties inline (`match: { type: "x" }`), the replacement fails silently.

The `serializeTriggerMatchBlock` helper is correctly tested and always produces the expected format. The fragility is on the read side, not the write side.

**Impact:** Same risk profile as DEFECT-2. System-generated artifacts will always match. Hand-edited ones might not.

**What to do:** No action required given the established pattern. The risk is documented in the plan's Risk Notes section.

### OBSERVATION-1: `serializeTriggerMatchBlock` does not quote YAML-special values

**File:** `daemon/services/manager/toolbox.ts:1317-1331`
**What:** Field values in the `fields` sub-block are written bare: `${key}: ${value}`. If a value contains a colon (e.g., `status: "completed: yes"`), a hash, or starts with a YAML-special character (`[`, `{`, `*`, `&`, etc.), the resulting YAML is invalid.

**Why it matters:** The spec defines `fields` as `Record<string, string>` with glob patterns. Glob patterns typically don't contain YAML-special characters, so real-world risk is low. But the function is exported and tested in isolation. A defensible implementation would quote values.

The orchestrator's `createTriggeredCommission` (orchestrator.ts:1562) has the same issue: field values are unquoted.

**What to do:** Consider quoting field values in both `serializeTriggerMatchBlock` and the orchestrator's match block generation. Low priority.

### OBSERVATION-2: Combined status + field update: unregister happens even for `paused→active` with fields

**File:** `daemon/services/manager/toolbox.ts:1286-1290`
**What:** When `status: "active"` is combined with field updates and the trigger was paused, the status transition skips registration (line 1224, correct optimization). Then the field update path (line 1287-1289) runs `unregisterTrigger` followed by `registerTrigger`. The `unregisterTrigger` call on a commission that has no active subscription is a no-op (the trigger evaluator uses a map lookup), so this is harmless. But it's worth noting.

The test at line 1498-1536 correctly verifies the net outcome: exactly one `registerTrigger` call. It does not check for the spurious `unregisterTrigger` call, which is fine since the plan explicitly acknowledges this ordering.

**Impact:** None. The unregister on a non-subscribed trigger is a no-op.

### OBSERVATION-3: `recordOps!` non-null assertion in update handler

**File:** `daemon/services/manager/toolbox.ts:1189, 1200, 1219, 1227, 1235`
**What:** `deps.recordOps!` is asserted non-null five times. The `ManagerToolboxDeps` interface declares `recordOps` as optional. The scheduled commission tools use the same pattern (`deps.recordOps!`). If `recordOps` is undefined at runtime, this throws a TypeError with no contextual error message.

**Impact:** In practice, `recordOps` is always provided by the `managerToolboxFactory` (toolbox.ts:1725). The assertion matches the established pattern. Not a defect, but worth noting that a future refactoring that removes `recordOps` from the services bag would surface as a cryptic runtime error in the trigger tools.

### OBSERVATION-4: Orchestrator's `createTriggeredCommission` does not validate `match.type`

**File:** `daemon/services/commission/orchestrator.ts:1507-1607`
**What:** Connected to DEFECT-1. The orchestrator validates `projectName` and `workerName` but trusts `match.type` as-is. The handler validates before calling the route, but the orchestrator is the business logic layer and should enforce its own invariants.

---

## DI Wiring Assessment

The wiring path is complete and correct:

1. `daemon/app.ts:349` — `triggerEvaluatorRef` created as lazy ref
2. `daemon/app.ts:365` — passed to commission orchestrator deps
3. `daemon/app.ts:385` — passed to meeting session deps
4. `daemon/app.ts:580` — `.current` set after trigger evaluator construction
5. `daemon/services/commission/orchestrator.ts:1993, 2255` — dereferenced in both inline services bag construction sites
6. `daemon/services/meeting/orchestrator.ts:509` — dereferenced in meeting services bag
7. `daemon/lib/toolbox-utils.ts:31` — `GuildHallToolServices.triggerEvaluator` field added
8. `daemon/services/manager/toolbox.ts:1727` — `managerToolboxFactory` reads from `ctx.services`
9. `daemon/services/manager/toolbox.ts:109` — `ManagerToolboxDeps.triggerEvaluator` field added

The pattern matches `scheduleLifecycle` exactly. The lazy ref ensures the trigger evaluator is available by the time any toolbox runs (sessions start after daemon initialization).

## Tool Schema Assessment

Both Zod schemas match the spec's parameter tables exactly. `match.type` is `z.string()` (not restricted to `SYSTEM_EVENT_TYPES` at schema level, validated in handler logic). `approval` uses `z.enum(["auto", "confirm"])`. `maxDepth` uses `z.number()`. `dependencies` uses `z.array(z.string())`. All optionals marked correctly.

## Shared Constants Assessment

`TRIGGER_STATUS_TRANSITIONS` is exported at toolbox.ts:1061 with comment "Exported for reuse by the future daemon route (Phase 3)." The transitions match the spec (active↔paused, active→completed, paused→completed; completed and failed are terminal).

## YAML Serialization Assessment

`serializeTriggerMatchBlock` is isolated and well-tested (3 tests covering type-only, with projectName, and with fields). The orchestrator duplicates the match serialization logic instead of calling the helper (orchestrator.ts:1556-1565 vs toolbox.ts:1317-1331). This is a minor duplication; the orchestrator might not have access to the toolbox's export, and it's building the entire template string inline. Not a defect, but future changes to match serialization would need two-site updates.

## Test Coverage Assessment

615 lines of new tests covering:
- `TRIGGER_STATUS_TRANSITIONS` (4 tests)
- `serializeTriggerMatchBlock` (3 tests)
- `makeCreateTriggeredCommissionHandler` (7 tests: success path, registerTrigger call, invalid match type, unknown worker, route failure, registerTrigger failure, full options passthrough)
- `makeUpdateTriggerHandler` (10 tests: type rejection, all 6 status transitions including terminal states, field update with subscription replacement, approval update, paused field update without subscription, combined status+field, return value)
- Route tests (3 tests: success, missing match 400, defaults)

Coverage is thorough. One gap: no test for the prompt update path in `makeUpdateTriggerHandler` when the artifact has the expected format (the paused-field-update test covers prompt but doesn't verify the regex replacement worked on the file content, only that the file was written).

---

## Summary

The implementation is solid. DI wiring is complete, tool schemas match the spec, subscription lifecycle management is correct, and the combined status+field optimization avoids double registration as designed.

The one finding that warrants action is **DEFECT-1**: the route and orchestrator accept any `match.type` without validating against `SYSTEM_EVENT_TYPES`. The handler validates, but the route is the trust boundary. The plan explicitly called for route-level validation in Step 2, but the implementation deferred it to the handler only. This means direct API calls bypass the validation.
