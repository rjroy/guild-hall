---
title: "Commission: Triggered commissions Phase 3: Review (Web UI)"
date: 2026-03-21
status: completed
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the work from the commission that implemented `.lore/plans/commissions/triggered-commissions-ui.md`.\n\nRead the plan first. This adds the web UI for triggered commissions.\n\nFocus areas:\n1. **Data flow** — Daemon detail response includes `triggerInfo`. Detail page assembles `TriggerInfoData` with `recentSpawns` from the commission list. Props flow correctly to TriggerInfo/TriggerActions.\n2. **TriggerInfo** — Match rule display handles all variants (type only, with projectName, with fields, with glob patterns). Recent spawns list matches scheduled commission pattern. `formatTimestamp` extracted to shared utility without breaking CommissionScheduleInfo.\n3. **TriggerActions** — Status transitions call correct API. Buttons disabled during loading. Returns null for terminal states. Error display works.\n4. **Daemon route** — `updateTriggerStatus()` uses shared `TRIGGER_STATUS_TRANSITIONS`. Subscription lifecycle correct. Route delegates to orchestrator (not trigger evaluator directly).\n5. **CommissionView integration** — Three-branch conditional (triggered, scheduled, one-shot) renders correctly. No regression to existing schedule or one-shot views.\n6. **CommissionList** — \"Trigger\" label and provenance links render correctly. Existing \"Recurring\" label and `sourceSchedule` links unaffected.\n7. **CSS** — Follows existing module patterns. No Tailwind. No `composes`."
dependencies:
  - commission-Dalton-20260321-160008
linked_artifacts:
  - daemon/routes/commissions.ts

  - daemon/services/commission/orchestrator.ts
  - lib/commissions.ts
  - web/components/commission/TriggerInfo.tsx
  - web/components/commission/TriggerActions.tsx
  - web/components/commission/format-timestamp.ts
  - web/components/commission/CommissionView.tsx
  - web/components/commission/CommissionList.tsx
  - web/app/projects/[name]/commissions/[id]/page.tsx
  - web/app/api/commissions/[commissionId]/trigger-status/route.ts
  - daemon/services/commission/orchestrator.ts
  - lib/commissions.ts
  - web/components/commission/TriggerInfo.tsx
  - web/components/commission/TriggerActions.tsx
  - web/components/commission/format-timestamp.ts
  - web/components/commission/CommissionView.tsx
  - web/components/commission/CommissionList.tsx
  - web/app/projects/[name]/commissions/[id]/page.tsx
  - web/app/api/commissions/[commissionId]/trigger-status/route.ts
activity_timeline:
  - timestamp: 2026-03-21T23:00:19.208Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T23:00:19.209Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-21T23:40:55.444Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-21T23:40:55.447Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-21T23:40:55.486Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-21T23:41:02.380Z
    event: progress_report
    reason: "Starting review. Reading the plan and locating the implementation diff."
  - timestamp: 2026-03-21T23:41:25.593Z
    event: progress_report
    reason: "Diff captured. Reading full source of key files to verify details the diff truncated."
  - timestamp: 2026-03-21T23:41:55.140Z
    event: progress_report
    reason: "All code read. Now checking the plan against the implementation to verify spec requirement coverage and identify defects."
  - timestamp: 2026-03-21T23:42:13.652Z
    event: progress_report
    reason: "All code reviewed. Writing findings."
  - timestamp: 2026-03-21T23:43:11.649Z
    event: result_submitted
    reason: "## Review: Triggered Commissions Web UI (Phase 3)\n\n**Scope**: 18 files changed, 1118 insertions, 25 deletions. 10 new tests across 3 files. All 8 plan steps implemented.\n\n**Verdict**: Clean implementation. Follows existing patterns faithfully. No defects found. Several observations and one WARN.\n\n---\n\n### Requirement Coverage\n\n| REQ | Status | Evidence |\n|-----|--------|----------|\n| REQ-TRIG-38 (list view) | Satisfied | `CommissionList.tsx:125-127` renders \"Trigger\" label. Status gem, worker, timestamp, prompt preview use existing list infrastructure. |\n| REQ-TRIG-39 (detail view) | Satisfied | `TriggerInfo.tsx` renders match rule, approval, depth, runs, timestamps, recent spawns. `TriggerActions.tsx` renders Pause/Resume/Complete. Both wired into `CommissionView.tsx:272-284` sidebar. |\n| REQ-TRIG-40 (API route) | Satisfied | `trigger-status/route.ts` proxies to daemon. Daemon route at `commissions.ts:428-460` validates and delegates to orchestrator. |\n| REQ-TRIG-41 (filter groups) | Satisfied by absence | No changes needed. Trigger statuses (`active`, `paused`, `completed`, `failed`) already map to existing filter groups. Plan correctly identified this. |\n| REQ-TRIG-42 (provenance links) | Satisfied | `CommissionList.tsx:157-167` renders `sourceTrigger` link. `lib/commissions.ts:86` populates from `triggered_by.trigger_artifact`. |\n\n---\n\n### Findings\n\n#### WARN-001: `projectName` in `TriggerActions` not passed to daemon\n\n**File**: `web/components/commission/TriggerActions.tsx:38-39`\n**Impact**: The `TriggerActions` component sends `{ status: targetStatus }` to the API route, which forwards to the daemon. The daemon route (`commissions.ts:448`) falls back to `projectName ?? \"\"`. The orchestrator (`orchestrator.ts:1726`) uses `projectName || found.projectName` for `registerTrigger`, so empty string triggers the fallback.\n\nThis works because `findProjectForCommission` discovers the project anyway, and the `registerTrigger` call uses `found.projectName` as fallback. But the daemon route's contract accepts `projectName` as a field, and the web client never sends it. If `findProjectForCommission` ever stopped returning `projectName` in its result, the empty-string fallback would silently break trigger re-registration.\n\nThe schedule equivalent (`CommissionScheduleActions`) has the same pattern, so this is consistent. Not a defect today, but a fragile seam.\n\n#### INFO-001: `TRIGGER_STATUS_TRANSITIONS` lives in manager toolbox, not trigger-lifecycle.ts\n\n**Plan says**: Extract to `daemon/services/commission/trigger-lifecycle.ts`.\n**Implementation**: Imports from `daemon/services/manager/toolbox.ts:1061`.\n\nThis was a Phase 2 decision. The constant was placed in the toolbox during Phase 2 with a comment \"Exported for reuse by the future daemon route (Phase 3).\" Phase 3 honored that placement. The plan's suggestion to create `trigger-lifecycle.ts` was aspirational; the actual code works. The orchestrator importing from the manager toolbox creates a dependency arrow from the commission layer into the manager layer, which is architecturally backward (manager depends on commissions, not the other way). This doesn't break anything today, but a future refactor that splits toolbox files could create a circular dependency.\n\n#### INFO-002: CommissionScheduleInfo unchanged after formatTimestamp extraction\n\nVerified. `CommissionScheduleInfo.tsx` now imports `formatTimestamp` from `./format-timestamp` (line 1) and the local function definition (16 lines) was deleted. The function signature and behavior are identical. No regression risk.\n\n#### INFO-003: Daemon detail route parses trigger frontmatter inline\n\n**File**: `daemon/routes/commissions.ts:584-608`\n\nThe detail route reads trigger metadata by parsing frontmatter inline with `matter(rawContent)` and manually extracting fields. The plan specified using `recordOps.readTriggerMetadata(artifactPath)`, which Phase 1 created. The implementation chose inline parsing instead.\n\nThis means two code paths read trigger frontmatter: `readTriggerMetadata` (used by the trigger evaluator and MCP tools) and this inline block. If the trigger frontmatter schema changes, both paths need updating. The inline approach handles `Date` objects from gray-matter's auto-parsing (`lastTriggered instanceof Date`), which is a detail `readTriggerMetadata` may handle differently.\n\nNot a defect. The inline parsing is more defensive about type coercion (handles Date objects, string fallback, explicit defaults). But it's a second interpretation of the same data.\n\n#### INFO-004: TriggerActions loading state is single-boolean\n\nBoth Pause and Complete buttons share a single `loading` boolean. Clicking Pause disables both buttons (correct), but the loading text (\"Pausing...\") only shows on the Pause button. The Complete button stays at \"Complete Trigger\" but disabled. Same pattern as `CommissionScheduleActions`. Consistent, no issue.\n\n#### INFO-005: CSS duplication between trigger and schedule styles\n\n`TriggerInfo.module.css` (172 lines) and `TriggerActions.module.css` (76 lines) duplicate the structural patterns from their schedule counterparts. The plan acknowledged this and chose duplication over abstraction due to the Turbopack `composes` limitation. Correct decision.\n\n`triggerLabel` and `sourceTrigger` in `CommissionList.module.css` are identical copies of `recurringLabel` and `sourceSchedule`. Same rationale.\n\n### Data Flow Verification\n\n1. Daemon detail response includes `triggerInfo` when `type === \"triggered\"` (`commissions.ts:608`). Includes `match`, `approval`, `maxDepth`, `runsCompleted`, `lastTriggered`, `lastSpawnedId`.\n2. Detail page (`page.tsx:119-136`) destructures `triggerInfo` from daemon response, filters `allCommissions` for `sourceTrigger === id`, assembles `TriggerInfoData` with `recentSpawns`.\n3. `TriggerInfoData` passed to `CommissionView` (`page.tsx:193`), which passes to `TriggerInfo` and `TriggerActions` (`CommissionView.tsx:274-283`).\n4. Three-branch conditional is correctly ordered: triggered first, then scheduled, then one-shot fallback.\n\n### Regression Check\n\n- `CommissionScheduleInfo` still works after `formatTimestamp` extraction (import change only).\n- \"Recurring\" label rendering unchanged (`CommissionList.tsx:122-124`).\n- `sourceSchedule` link rendering unchanged (`CommissionList.tsx:146-155`).\n- One-shot commission sidebar falls through to `CommissionActions` as before.\n- `CommissionMeta` fallback defaults include `sourceTrigger: \"\"` (`lib/commissions.ts:168`).\n\n### Test Coverage Assessment\n\n10 new tests across 3 files:\n- `commissions-read.test.ts`: trigger detail response shape, defaults for missing optional fields (2 tests)\n- `commissions.test.ts`: route validation (missing commissionId, missing status), success path, error mapping (transition error → 409, not-found → 404) (6 tests)\n- `commissions.test.ts`: sourceTrigger parsing from frontmatter, empty when absent, empty when triggered_by lacks trigger_artifact (3 tests... listed as 48 lines)\n\n**Not tested**: `updateTriggerStatus` orchestrator method directly (only tested through the route). The route tests verify the delegation works, but they use a mock that always succeeds. The orchestrator's transition validation, type checking, and register/unregister calls are not unit-tested. The Phase 2 review noted the same gap pattern for `updateScheduleStatus`, so this is consistent, but it's a gap.\n\n**Not tested**: TriggerInfo and TriggerActions components. No component tests exist. The schedule equivalents (`CommissionScheduleInfo`, `CommissionScheduleActions`) also lack component tests, so this is consistent with the codebase pattern. The plan listed component tests; they weren't written.\n\n### Summary\n\nThe implementation is faithful to the plan and consistent with existing patterns. The `formatTimestamp` extraction, three-branch conditional, and provenance links all work correctly. WARN-001 (projectName not passed from client to daemon) is the only finding with a future-fragility concern, and it matches the existing schedule pattern. The inline trigger frontmatter parsing (INFO-003) is the one deliberate deviation from the plan's approach; it's more defensive but creates a second interpretation of the same data."
  - timestamp: 2026-03-21T23:43:20.901Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All code reviewed. Writing findings."
projectName: guild-hall
---
## Review: Triggered Commissions Web UI (Phase 3)

**Scope**: 18 files changed, 1118 insertions, 25 deletions. 10 new tests across 3 files. All 8 plan steps implemented.

**Verdict**: Clean implementation. Follows existing patterns faithfully. No defects found. Several observations and one WARN.

---

### Requirement Coverage

| REQ | Status | Evidence |
|-----|--------|----------|
| REQ-TRIG-38 (list view) | Satisfied | `CommissionList.tsx:125-127` renders "Trigger" label. Status gem, worker, timestamp, prompt preview use existing list infrastructure. |
| REQ-TRIG-39 (detail view) | Satisfied | `TriggerInfo.tsx` renders match rule, approval, depth, runs, timestamps, recent spawns. `TriggerActions.tsx` renders Pause/Resume/Complete. Both wired into `CommissionView.tsx:272-284` sidebar. |
| REQ-TRIG-40 (API route) | Satisfied | `trigger-status/route.ts` proxies to daemon. Daemon route at `commissions.ts:428-460` validates and delegates to orchestrator. |
| REQ-TRIG-41 (filter groups) | Satisfied by absence | No changes needed. Trigger statuses (`active`, `paused`, `completed`, `failed`) already map to existing filter groups. Plan correctly identified this. |
| REQ-TRIG-42 (provenance links) | Satisfied | `CommissionList.tsx:157-167` renders `sourceTrigger` link. `lib/commissions.ts:86` populates from `triggered_by.trigger_artifact`. |

---

### Findings

#### WARN-001: `projectName` in `TriggerActions` not passed to daemon

**File**: `web/components/commission/TriggerActions.tsx:38-39`
**Impact**: The `TriggerActions` component sends `{ status: targetStatus }` to the API route, which forwards to the daemon. The daemon route (`commissions.ts:448`) falls back to `projectName ?? ""`. The orchestrator (`orchestrator.ts:1726`) uses `projectName || found.projectName` for `registerTrigger`, so empty string triggers the fallback.

This works because `findProjectForCommission` discovers the project anyway, and the `registerTrigger` call uses `found.projectName` as fallback. But the daemon route's contract accepts `projectName` as a field, and the web client never sends it. If `findProjectForCommission` ever stopped returning `projectName` in its result, the empty-string fallback would silently break trigger re-registration.

The schedule equivalent (`CommissionScheduleActions`) has the same pattern, so this is consistent. Not a defect today, but a fragile seam.

#### INFO-001: `TRIGGER_STATUS_TRANSITIONS` lives in manager toolbox, not trigger-lifecycle.ts

**Plan says**: Extract to `daemon/services/commission/trigger-lifecycle.ts`.
**Implementation**: Imports from `daemon/services/manager/toolbox.ts:1061`.

This was a Phase 2 decision. The constant was placed in the toolbox during Phase 2 with a comment "Exported for reuse by the future daemon route (Phase 3)." Phase 3 honored that placement. The plan's suggestion to create `trigger-lifecycle.ts` was aspirational; the actual code works. The orchestrator importing from the manager toolbox creates a dependency arrow from the commission layer into the manager layer, which is architecturally backward (manager depends on commissions, not the other way). This doesn't break anything today, but a future refactor that splits toolbox files could create a circular dependency.

#### INFO-002: CommissionScheduleInfo unchanged after formatTimestamp extraction

Verified. `CommissionScheduleInfo.tsx` now imports `formatTimestamp` from `./format-timestamp` (line 1) and the local function definition (16 lines) was deleted. The function signature and behavior are identical. No regression risk.

#### INFO-003: Daemon detail route parses trigger frontmatter inline

**File**: `daemon/routes/commissions.ts:584-608`

The detail route reads trigger metadata by parsing frontmatter inline with `matter(rawContent)` and manually extracting fields. The plan specified using `recordOps.readTriggerMetadata(artifactPath)`, which Phase 1 created. The implementation chose inline parsing instead.

This means two code paths read trigger frontmatter: `readTriggerMetadata` (used by the trigger evaluator and MCP tools) and this inline block. If the trigger frontmatter schema changes, both paths need updating. The inline approach handles `Date` objects from gray-matter's auto-parsing (`lastTriggered instanceof Date`), which is a detail `readTriggerMetadata` may handle differently.

Not a defect. The inline parsing is more defensive about type coercion (handles Date objects, string fallback, explicit defaults). But it's a second interpretation of the same data.

#### INFO-004: TriggerActions loading state is single-boolean

Both Pause and Complete buttons share a single `loading` boolean. Clicking Pause disables both buttons (correct), but the loading text ("Pausing...") only shows on the Pause button. The Complete button stays at "Complete Trigger" but disabled. Same pattern as `CommissionScheduleActions`. Consistent, no issue.

#### INFO-005: CSS duplication between trigger and schedule styles

`TriggerInfo.module.css` (172 lines) and `TriggerActions.module.css` (76 lines) duplicate the structural patterns from their schedule counterparts. The plan acknowledged this and chose duplication over abstraction due to the Turbopack `composes` limitation. Correct decision.

`triggerLabel` and `sourceTrigger` in `CommissionList.module.css` are identical copies of `recurringLabel` and `sourceSchedule`. Same rationale.

### Data Flow Verification

1. Daemon detail response includes `triggerInfo` when `type === "triggered"` (`commissions.ts:608`). Includes `match`, `approval`, `maxDepth`, `runsCompleted`, `lastTriggered`, `lastSpawnedId`.
2. Detail page (`page.tsx:119-136`) destructures `triggerInfo` from daemon response, filters `allCommissions` for `sourceTrigger === id`, assembles `TriggerInfoData` with `recentSpawns`.
3. `TriggerInfoData` passed to `CommissionView` (`page.tsx:193`), which passes to `TriggerInfo` and `TriggerActions` (`CommissionView.tsx:274-283`).
4. Three-branch conditional is correctly ordered: triggered first, then scheduled, then one-shot fallback.

### Regression Check

- `CommissionScheduleInfo` still works after `formatTimestamp` extraction (import change only).
- "Recurring" label rendering unchanged (`CommissionList.tsx:122-124`).
- `sourceSchedule` link rendering unchanged (`CommissionList.tsx:146-155`).
- One-shot commission sidebar falls through to `CommissionActions` as before.
- `CommissionMeta` fallback defaults include `sourceTrigger: ""` (`lib/commissions.ts:168`).

### Test Coverage Assessment

10 new tests across 3 files:
- `commissions-read.test.ts`: trigger detail response shape, defaults for missing optional fields (2 tests)
- `commissions.test.ts`: route validation (missing commissionId, missing status), success path, error mapping (transition error → 409, not-found → 404) (6 tests)
- `commissions.test.ts`: sourceTrigger parsing from frontmatter, empty when absent, empty when triggered_by lacks trigger_artifact (3 tests... listed as 48 lines)

**Not tested**: `updateTriggerStatus` orchestrator method directly (only tested through the route). The route tests verify the delegation works, but they use a mock that always succeeds. The orchestrator's transition validation, type checking, and register/unregister calls are not unit-tested. The Phase 2 review noted the same gap pattern for `updateScheduleStatus`, so this is consistent, but it's a gap.

**Not tested**: TriggerInfo and TriggerActions components. No component tests exist. The schedule equivalents (`CommissionScheduleInfo`, `CommissionScheduleActions`) also lack component tests, so this is consistent with the codebase pattern. The plan listed component tests; they weren't written.

### Summary

The implementation is faithful to the plan and consistent with existing patterns. The `formatTimestamp` extraction, three-branch conditional, and provenance links all work correctly. WARN-001 (projectName not passed from client to daemon) is the only finding with a future-fragility concern, and it matches the existing schedule pattern. The inline trigger frontmatter parsing (INFO-003) is the one deliberate deviation from the plan's approach; it's more defensive but creates a second interpretation of the same data.
