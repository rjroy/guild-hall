---
title: "Commission: Verify and fix Thorne review findings from triggered commissions"
date: 2026-03-22
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Thorne reviewed the triggered commissions implementation across four phases and surfaced findings. Check whether each was already addressed by a later phase's implementation. For any that remain unfixed, fix them.\n\n**Finding 1: Dead constant `COMMISSION_SOURCE_EVENTS`**\nFile: `daemon/services/trigger-evaluator.ts:103`\nA `Set` declared but never referenced. `extractSourceInfo` uses direct string comparisons instead.\nAction: Remove the constant, or refactor to use it.\n\n**Finding 2: `last_triggered` timestamp captured twice**\nFile: `daemon/services/trigger-evaluator.ts:270-288`\nTwo separate `new Date().toISOString()` calls produce different timestamps for the artifact write vs the in-memory state mutation.\nAction: Capture `const now = new Date().toISOString()` once and use it in both places.\n\n**Finding 3: gray-matter coerces `fields` values**\nFile: `daemon/services/commission/record.ts:378-400`\n`readTriggerMetadata` casts `trigger.match` directly. gray-matter will coerce `\"true\"` to boolean, `\"123\"` to number, breaking the `Record<string, string>` contract. `micromatch.isMatch(\"completed\", true as any)` would produce unpredictable behavior.\nAction: After parsing, coerce `fields` values to strings: `Object.fromEntries(Object.entries(match.fields).map(([k, v]) => [k, String(v)]))`.\n\n**Finding 4: Route doesn't validate `match.type`**\nFile: `daemon/routes/commissions.ts:103-117`\nThe commission creation route accepts any `match.type` without validation against `SYSTEM_EVENT_TYPES`. Only the toolbox handler validates. The route is the trust boundary.\nAction: Add `match.type` validation at the route level or in the orchestrator's `createTriggeredCommission`.\n\n**Finding 5: `dispatchCommission` double cast**\nFile: `daemon/services/trigger-evaluator.ts:263`\n`spawnedId as unknown as CommissionId` bypasses branded type safety with no explanatory comment.\nAction: Add a comment explaining why the cast is needed (createCommission returns string, not branded ID).\n\n**Finding 6: `TRIGGER_STATUS_TRANSITIONS` backward dependency**\nFile: `daemon/services/manager/toolbox.ts:1061` imported by `daemon/services/commission/orchestrator.ts`\nThe orchestrator (commission layer) imports from the manager toolbox (manager layer). This is architecturally backward.\nAction: Move `TRIGGER_STATUS_TRANSITIONS` to `daemon/services/commission/trigger-lifecycle.ts` (or similar commission-layer location). Update imports in both the toolbox and orchestrator.\n\nFor each finding: check the current code, determine if it's already fixed, and if not, fix it. Add tests for any behavioral changes (especially #3 and #4). Run `bun test` before declaring complete."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-22T00:27:57.056Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T00:27:57.058Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
