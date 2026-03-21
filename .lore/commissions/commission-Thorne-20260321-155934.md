---
title: "Commission: Triggered commissions Phase 1c: Review (trigger evaluator)"
date: 2026-03-21
status: completed
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the work from the commission that implemented Steps 5-6 of `.lore/plans/commissions/triggered-commissions-core.md`.\n\nRead the plan first. This is the trigger evaluator service and its production wiring. High-risk code.\n\nFocus areas:\n1. **Trigger evaluator** (`daemon/services/trigger-evaluator.ts`) — Does `initialize()` correctly scan and filter? Does the handler implement all safety checks (source exclusion, depth limit, approval downgrade)? Is async work truly fire-and-forget (doesn't block the router)? Does error handling log at warn without propagating?\n2. **Production wiring** (`daemon/app.ts`) — Is the trigger evaluator created after its dependencies? Is the lazy ref pattern correct? Is shutdown wired? No circular deps?\n3. **Test coverage** — The plan lists 25+ specific test cases for Step 5. Verify they're all covered. Watch for: source exclusion fail-open, depth computation from non-commission sources, approval downgrade timeline entry format.\n4. **Integration** — Does the trigger evaluator correctly use the record ops from Step 3 and template expansion from Step 4?"
dependencies:
  - commission-Dalton-20260321-155923
linked_artifacts:
  - daemon/services/trigger-evaluator.ts

  - daemon/app.ts
  - tests/daemon/services/trigger-evaluator.test.ts
  - tests/daemon/services/trigger-evaluator-service.test.ts
  - daemon/app.ts
  - tests/daemon/services/trigger-evaluator.test.ts
  - tests/daemon/services/trigger-evaluator-service.test.ts
activity_timeline:
  - timestamp: 2026-03-21T22:59:34.781Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T22:59:34.784Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-21T23:16:39.579Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-21T23:16:39.582Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-21T23:16:39.621Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-21T23:16:47.497Z
    event: progress_report
    reason: "Reading the implementation plan and source files for Steps 5-6 review."
  - timestamp: 2026-03-21T23:17:16.112Z
    event: progress_report
    reason: "All source files and tests read. Now analyzing findings against the plan's requirements."
  - timestamp: 2026-03-21T23:18:13.699Z
    event: result_submitted
    reason: "## Review: Trigger Evaluator (Steps 5-6)\n\nAll 34 tests pass. The implementation is solid and follows the plan closely. Below are the findings, ordered by severity.\n\n---\n\n### DEFECT: Unused constant `COMMISSION_SOURCE_EVENTS`\n\n**File:** `daemon/services/trigger-evaluator.ts:103`\n\n```typescript\nconst COMMISSION_SOURCE_EVENTS = new Set([\"commission_status\", \"commission_result\"]);\n```\n\nThis constant is declared but never referenced. The `extractSourceInfo` function uses direct string comparisons (`event.type === \"commission_status\"`) instead. The constant is dead code. It will trigger a lint warning and confuses readers who expect it to be the source of truth for the commission-sourced check.\n\n**Action:** Remove the constant, or refactor `extractSourceInfo` to use it.\n\n---\n\n### DEFECT: `last_triggered` timestamp inconsistency in state mutation\n\n**File:** `daemon/services/trigger-evaluator.ts:270-288`\n\nThe handler calls `new Date().toISOString()` twice in sequence with different captures:\n\n```typescript\n// Line 272: Written to artifact via recordOps\nlast_triggered: new Date().toISOString(),\n\n// Line 287: Mutated into the in-memory triggerData\ntriggerData.trigger.last_triggered = new Date().toISOString();\n```\n\nThese two calls produce different timestamps (milliseconds apart). The artifact says one time; the in-memory state says another. This is unlikely to cause a functional bug since `last_triggered` is informational, but it's sloppy and would fail an equality assertion if anyone ever checks consistency between the artifact and in-memory state.\n\n**Action:** Capture `const now = new Date().toISOString()` once and use it in both places.\n\n---\n\n### WARN: `dispatchCommission` cast bypasses branded type safety\n\n**File:** `daemon/services/trigger-evaluator.ts:263`\n\n```typescript\nawait commissionSession.dispatchCommission(spawnedId as unknown as CommissionId);\n```\n\nThe double cast (`as unknown as CommissionId`) circumvents the branded ID system that exists specifically to prevent accidental mixing of string IDs. `createCommission` returns `{ commissionId: string }` rather than `{ commissionId: CommissionId }`, forcing this escape hatch. The fix is upstream (the return type of `createCommission` should use the branded type), but this cast should at minimum have a comment explaining why the compiler is wrong, per the project's TypeScript quality rule on non-null assertions and casts.\n\n**Action:** Add a comment explaining the cast, or (better) fix `createCommission`'s return type.\n\n---\n\n### WARN: `readTriggerArtifact` reads `prompt` as a string but trigger artifacts quote it in YAML\n\n**File:** `daemon/services/trigger-evaluator.ts:94`\n\nThe `makeTriggerArtifact` test helper wraps the prompt in double quotes in the YAML:\n\n```yaml\nprompt: \"Review commission {{commissionId}}\"\n```\n\ngray-matter strips the quotes, so this works correctly in tests. But if a real trigger artifact is written with an unquoted prompt containing colons (e.g., `prompt: Review this: {{commissionId}}`), gray-matter will fail to parse it. This is a known project lesson (CLAUDE.md: \"YAML frontmatter values containing colons must be quoted\"), but `readTriggerArtifact` doesn't validate or warn on parse failure for this field. The `readTriggerArtifact` function catches the absence of `trigger.match` but not a completely failed parse.\n\n**Action:** No code change needed if all writers quote the prompt field. Document the constraint or add a defensive check.\n\n---\n\n### Production Wiring (Step 6): Clean\n\n**File:** `daemon/app.ts:562-574`\n\nThe trigger evaluator is wired correctly:\n\n1. **Dependency ordering:** Created after the Event Router (line 548) and commission orchestrator (line 348). All dependencies exist at creation time.\n2. **Initialization:** `await triggerEvaluator.initialize()` is called inline after creation (line 574). Startup waits for the scan to complete.\n3. **Shutdown:** `triggerEvaluator.shutdown()` is the first call in the shutdown handler (line 635). Clean ordering.\n4. **No circular deps:** The trigger evaluator depends on `commissionSession` (downstream) and `eventRouter` (downstream). Neither depends back on the trigger evaluator.\n\nThe plan specified a lazy ref pattern (`triggerEvaluatorRef`) for the manager toolbox, but the implementation skips this. That's correct for Steps 5-6. The toolbox wiring is in the separate plan. However, when that plan is implemented, someone will need to add the ref and thread it through. No action needed now.\n\n---\n\n### Test Coverage Checklist\n\nThe plan lists 25 specific test cases for Step 5. Here's the coverage map:\n\n| Plan test case | Test file | Status |\n|---|---|---|\n| Active triggers register during initialize() | `trigger-evaluator-service.test.ts:276` | Covered |\n| Paused triggers do not register | `:291` | Covered |\n| Completed triggers do not register | `:305` | Covered (plan says \"paused/completed\"; both tested separately) |\n| Matching event fires handler, creates commission | `:335` | Covered |\n| Non-matching event does not fire | `:354` | Covered |\n| Template variables expand in prompt | `:371` | Covered |\n| triggered_by written with correct fields | `:388` | Covered |\n| Depth computed from source triggered_by.depth | `:413` | Covered |\n| Depth defaults to 1 when no triggered_by | `:435` | Covered |\n| Depth is 1 for non-commission sources | `:454` | Covered |\n| Source exclusion skips on self-match | `:473` | Covered |\n| Source exclusion allows different trigger | `:493` | Covered |\n| Source exclusion fail-open on unreadable artifact | `:512` | Covered |\n| Depth limit downgrades auto to confirm | `:535` | Covered |\n| Depth limit appends timeline entry | `:559` | Covered |\n| approval: auto calls create + dispatch | `:584` | Covered |\n| approval: confirm calls create only | `:603` | Covered |\n| Omitted approval defaults to confirm | `:621` | Covered |\n| Trigger state updated after firing | `:642` | Covered |\n| Failures log at warn, don't propagate | `:668` | Covered |\n| No active triggers = inert | `:319` | Covered |\n| registerTrigger adds dynamically | `:712` | Covered |\n| unregisterTrigger removes dynamically | `:730` | Covered |\n| Multiple triggers fire independently | `:756` | Covered |\n| shutdown removes all subscriptions | `:784` | Covered |\n\nAll 25 plan-specified test cases are covered. The implementation also includes `readTriggerArtifact` unit tests (8 additional tests in the template expansion file) for a total of 34 tests.\n\n---\n\n### Summary\n\nTwo defects (dead constant, timestamp inconsistency), two warnings (branded type cast, YAML quoting fragility). The trigger evaluator's safety checks (source exclusion, depth limit, approval downgrade, fire-and-forget async, error isolation) are all implemented correctly and tested. Production wiring is clean. No missing test coverage against the plan."
  - timestamp: 2026-03-21T23:18:23.602Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All source files and tests read. Now analyzing findings against the plan's requirements."
projectName: guild-hall
---
## Review: Trigger Evaluator (Steps 5-6)

All 34 tests pass. The implementation is solid and follows the plan closely. Below are the findings, ordered by severity.

---

### DEFECT: Unused constant `COMMISSION_SOURCE_EVENTS`

**File:** `daemon/services/trigger-evaluator.ts:103`

```typescript
const COMMISSION_SOURCE_EVENTS = new Set(["commission_status", "commission_result"]);
```

This constant is declared but never referenced. The `extractSourceInfo` function uses direct string comparisons (`event.type === "commission_status"`) instead. The constant is dead code. It will trigger a lint warning and confuses readers who expect it to be the source of truth for the commission-sourced check.

**Action:** Remove the constant, or refactor `extractSourceInfo` to use it.

---

### DEFECT: `last_triggered` timestamp inconsistency in state mutation

**File:** `daemon/services/trigger-evaluator.ts:270-288`

The handler calls `new Date().toISOString()` twice in sequence with different captures:

```typescript
// Line 272: Written to artifact via recordOps
last_triggered: new Date().toISOString(),

// Line 287: Mutated into the in-memory triggerData
triggerData.trigger.last_triggered = new Date().toISOString();
```

These two calls produce different timestamps (milliseconds apart). The artifact says one time; the in-memory state says another. This is unlikely to cause a functional bug since `last_triggered` is informational, but it's sloppy and would fail an equality assertion if anyone ever checks consistency between the artifact and in-memory state.

**Action:** Capture `const now = new Date().toISOString()` once and use it in both places.

---

### WARN: `dispatchCommission` cast bypasses branded type safety

**File:** `daemon/services/trigger-evaluator.ts:263`

```typescript
await commissionSession.dispatchCommission(spawnedId as unknown as CommissionId);
```

The double cast (`as unknown as CommissionId`) circumvents the branded ID system that exists specifically to prevent accidental mixing of string IDs. `createCommission` returns `{ commissionId: string }` rather than `{ commissionId: CommissionId }`, forcing this escape hatch. The fix is upstream (the return type of `createCommission` should use the branded type), but this cast should at minimum have a comment explaining why the compiler is wrong, per the project's TypeScript quality rule on non-null assertions and casts.

**Action:** Add a comment explaining the cast, or (better) fix `createCommission`'s return type.

---

### WARN: `readTriggerArtifact` reads `prompt` as a string but trigger artifacts quote it in YAML

**File:** `daemon/services/trigger-evaluator.ts:94`

The `makeTriggerArtifact` test helper wraps the prompt in double quotes in the YAML:

```yaml
prompt: "Review commission {{commissionId}}"
```

gray-matter strips the quotes, so this works correctly in tests. But if a real trigger artifact is written with an unquoted prompt containing colons (e.g., `prompt: Review this: {{commissionId}}`), gray-matter will fail to parse it. This is a known project lesson (CLAUDE.md: "YAML frontmatter values containing colons must be quoted"), but `readTriggerArtifact` doesn't validate or warn on parse failure for this field. The `readTriggerArtifact` function catches the absence of `trigger.match` but not a completely failed parse.

**Action:** No code change needed if all writers quote the prompt field. Document the constraint or add a defensive check.

---

### Production Wiring (Step 6): Clean

**File:** `daemon/app.ts:562-574`

The trigger evaluator is wired correctly:

1. **Dependency ordering:** Created after the Event Router (line 548) and commission orchestrator (line 348). All dependencies exist at creation time.
2. **Initialization:** `await triggerEvaluator.initialize()` is called inline after creation (line 574). Startup waits for the scan to complete.
3. **Shutdown:** `triggerEvaluator.shutdown()` is the first call in the shutdown handler (line 635). Clean ordering.
4. **No circular deps:** The trigger evaluator depends on `commissionSession` (downstream) and `eventRouter` (downstream). Neither depends back on the trigger evaluator.

The plan specified a lazy ref pattern (`triggerEvaluatorRef`) for the manager toolbox, but the implementation skips this. That's correct for Steps 5-6. The toolbox wiring is in the separate plan. However, when that plan is implemented, someone will need to add the ref and thread it through. No action needed now.

---

### Test Coverage Checklist

The plan lists 25 specific test cases for Step 5. Here's the coverage map:

| Plan test case | Test file | Status |
|---|---|---|
| Active triggers register during initialize() | `trigger-evaluator-service.test.ts:276` | Covered |
| Paused triggers do not register | `:291` | Covered |
| Completed triggers do not register | `:305` | Covered (plan says "paused/completed"; both tested separately) |
| Matching event fires handler, creates commission | `:335` | Covered |
| Non-matching event does not fire | `:354` | Covered |
| Template variables expand in prompt | `:371` | Covered |
| triggered_by written with correct fields | `:388` | Covered |
| Depth computed from source triggered_by.depth | `:413` | Covered |
| Depth defaults to 1 when no triggered_by | `:435` | Covered |
| Depth is 1 for non-commission sources | `:454` | Covered |
| Source exclusion skips on self-match | `:473` | Covered |
| Source exclusion allows different trigger | `:493` | Covered |
| Source exclusion fail-open on unreadable artifact | `:512` | Covered |
| Depth limit downgrades auto to confirm | `:535` | Covered |
| Depth limit appends timeline entry | `:559` | Covered |
| approval: auto calls create + dispatch | `:584` | Covered |
| approval: confirm calls create only | `:603` | Covered |
| Omitted approval defaults to confirm | `:621` | Covered |
| Trigger state updated after firing | `:642` | Covered |
| Failures log at warn, don't propagate | `:668` | Covered |
| No active triggers = inert | `:319` | Covered |
| registerTrigger adds dynamically | `:712` | Covered |
| unregisterTrigger removes dynamically | `:730` | Covered |
| Multiple triggers fire independently | `:756` | Covered |
| shutdown removes all subscriptions | `:784` | Covered |

All 25 plan-specified test cases are covered. The implementation also includes `readTriggerArtifact` unit tests (8 additional tests in the template expansion file) for a total of 34 tests.

---

### Summary

Two defects (dead constant, timestamp inconsistency), two warnings (branded type cast, YAML quoting fragility). The trigger evaluator's safety checks (source exclusion, depth limit, approval downgrade, fire-and-forget async, error isolation) are all implemented correctly and tested. Production wiring is clean. No missing test coverage against the plan.
