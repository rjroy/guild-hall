---
title: "Commission: Review: Implement Model Selection"
date: 2026-03-09
status: completed
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the completed work from commission `commission-Dalton-20260308-211627` (Implement Model Selection).\n\n**What changed:** Added model selection throughout the stack. Workers declare a default model in `package.json`, commissions can override via `resource_overrides.model`, and the UI displays the effective model. Resolution order: commission override > worker default > fallback \"opus\".\n\n**Plan:** `.lore/plans/model-selection.md`\n**Spec:** `.lore/specs/model-selection.md`\n\n**Implementation covered 12 steps:**\n1. `VALID_MODELS` constant, `ModelName` type, `isValidModel` guard in `lib/types.ts`\n2. `model?: ModelName` in `WorkerMetadata` interface and `workerMetadataSchema` Zod validation in `lib/packages.ts`\n3. `model` added to `ActivationContext`, wired through `activateWorkerWithSharedPattern` in `packages/shared/worker-activation.ts`\n4. Manager activation in `daemon/services/manager/worker.ts` updated (metadata + activation)\n5. `SessionPrepSpec.resourceOverrides.model` added in `daemon/lib/agent-sdk/sdk-runner.ts`, three-tier resolution wired\n6. Commission orchestrator (`daemon/services/commission/orchestrator.ts`) reads/writes/validates model in `resource_overrides`. `CommissionMeta` in `lib/commissions.ts` updated.\n7. Manager toolbox `create_commission` tool schema updated with model validation in `daemon/services/manager/toolbox.ts`\n8. Briefing generator refactored to use `resourceOverrides.model` instead of post-preparation spread in `daemon/services/briefing-generator.ts`\n9. Manager posture updated with model routing guidance in `daemon/services/manager/worker.ts`\n10. UI: Commission view shows effective model with \"(override)\" annotation. Meeting view shows worker default model. Worker roster deferred (no view exists).\n11. All five worker `package.json` files updated with `\"model\": \"opus\"`\n\n**Review focus:**\n1. REQ-MODEL-4: Verify model list is defined once as `VALID_MODELS`, not duplicated across validation sites. Check that `isValidModel` is used everywhere (Zod schemas, orchestrator dispatch validation, manager toolbox).\n2. REQ-MODEL-9: Verify three-tier resolution order in `prepareSdkSession`: `spec.resourceOverrides?.model ?? activation.model` (with activation fallback to \"opus\").\n3. Production wiring: The most repeated retro lesson in this codebase. Verify `daemon/app.ts` / `createProductionApp()` passes model through. Tests with mocks can pass while production is broken.\n4. Five-concerns boundary: `sdk-runner.ts` should have zero new imports from git, workspace, artifacts, or activity-type-specific modules. Model resolution happens before `prepareSdkSession`, not inside it.\n5. Briefing generator: Verify Sonnet default is preserved after the refactor from direct spread to `resourceOverrides.model`.\n6. Commission orchestrator: Validate model read/write/update in YAML artifacts, and that invalid model names are rejected during dispatch.\n7. Test coverage: New tests for each step. Fixture values should match production data shapes.\n8. Check all 18 REQ-MODEL requirements against the implementation."
dependencies: []
linked_artifacts:
  - lib/types.ts

  - lib/packages.ts
  - lib/commissions.ts
  - packages/shared/worker-activation.ts
  - daemon/services/manager/worker.ts
  - daemon/lib/agent-sdk/sdk-runner.ts
  - daemon/services/commission/orchestrator.ts
  - daemon/services/manager/toolbox.ts
  - daemon/services/briefing-generator.ts
  - daemon/app.ts
  - daemon/routes/commissions.ts
  - web/app/projects/[name]/commissions/[id]/page.tsx
  - web/app/projects/[name]/meetings/[id]/page.tsx
  - lib/packages.ts
  - lib/commissions.ts
  - packages/shared/worker-activation.ts
  - daemon/services/manager/worker.ts
  - daemon/lib/agent-sdk/sdk-runner.ts
  - daemon/services/commission/orchestrator.ts
  - daemon/services/manager/toolbox.ts
  - daemon/services/briefing-generator.ts
  - daemon/app.ts
  - daemon/routes/commissions.ts
  - web/app/projects/[name]/commissions/[id]/page.tsx
  - web/app/projects/[name]/meetings/[id]/page.tsx
activity_timeline:
  - timestamp: 2026-03-09T06:19:35.106Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T06:19:35.107Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-09T06:19:35.142Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-09T06:19:45.919Z
    event: progress_report
    reason: "Starting review of commission-Dalton-20260308-211627 (Model Selection). Reading spec, plan, and all implementation files."
  - timestamp: 2026-03-09T06:20:42.950Z
    event: progress_report
    reason: "Read all 12 implementation files. Now examining UI components, test files, and checking for REQ-MODEL-4 compliance (no duplicated model lists)."
  - timestamp: 2026-03-09T06:21:53.984Z
    event: progress_report
    reason: "All code read. Analysis complete across all 12 implementation steps, test files, UI components, production wiring, and five-concerns boundary. Compiling final findings report now."
  - timestamp: 2026-03-09T06:24:02.830Z
    event: progress_report
    reason: "Found a defect in daemon/routes/commissions.ts: resourceOverrides type annotations are missing model field. Compiling full findings report now."
  - timestamp: 2026-03-09T06:24:46.873Z
    event: result_submitted
    reason: "## Review: Model Selection (commission-Dalton-20260308-211627)\n\n### Findings\n\n**DEFECT: Commission routes missing `model` in `resourceOverrides` type**\nFile: `daemon/routes/commissions.ts:33` and `101`\n\nBoth the POST `/commissions` and PUT `/commissions/:id` endpoints define `resourceOverrides` as `{ maxTurns?: number; maxBudgetUsd?: number }` without `model?: string`. The orchestrator and interface both accept model, but the HTTP route type annotations are stale. At runtime, JSON parsing passes model through untyped, so the feature works by accident. But the type gap means TypeScript won't catch errors at the route layer, and anyone reading the route code would conclude model isn't supported through the REST API.\n\nFix: Add `model?: string` to both `resourceOverrides` type annotations in `daemon/routes/commissions.ts`.\n\n---\n\n**OBSERVATION: Duplicate `mailContext` block in worker-activation.ts**\nFile: `packages/shared/worker-activation.ts:37-70`\n\n`buildSystemPrompt` has an identical `if (context.mailContext)` block at lines 37-52 and 54-70. Mail workers receive the mail protocol instructions twice in their system prompt. Pre-existing, not introduced by this commission. Impact: wasted tokens and potentially confusing instructions in every mail reader session.\n\n---\n\n**OBSERVATION: `memory-compaction.ts:291` and `notes-generator.ts:163` use bare `model: \"sonnet\"` strings**\n\nThese are single-turn SDK calls that don't flow through `prepareSdkSession`, so they can't use `resourceOverrides`. They bypass the `VALID_MODELS` type system. If the model list changes (the local-model-support issue), these locations need manual updates. Not a spec violation (these aren't \"validation sites\" per REQ-MODEL-4), but an inconsistency with the briefing generator's refactored path.\n\n---\n\n### Requirement Checklist\n\n| REQ | Status | Evidence |\n|-----|--------|----------|\n| REQ-MODEL-1 | SATISFIED | All 5 worker `package.json` files have `\"model\": \"opus\"` in guildHall key |\n| REQ-MODEL-2 | SATISFIED | `createManagerPackage()` at `worker.ts:87` includes `model: \"opus\" as ModelName` |\n| REQ-MODEL-3 | SATISFIED | `VALID_MODELS` at `types.ts:48`, rejected via `isValidModel` in 3 validation sites |\n| REQ-MODEL-4 | SATISFIED | Single `VALID_MODELS` constant, `isValidModel` used in packages.ts, toolbox.ts, orchestrator.ts |\n| REQ-MODEL-5 | SATISFIED | Both activation functions read from `context.model`, hardcoded \"opus\" removed |\n| REQ-MODEL-6 | SATISFIED | `context.model ?? \"opus\"` in both `worker-activation.ts:111` and `worker.ts:177` |\n| REQ-MODEL-7 | SATISFIED | `CommissionMeta.resource_overrides` includes `model?: string` at `commissions.ts:28` |\n| REQ-MODEL-8 | SATISFIED | `sdk-runner.ts:314`: `spec.resourceOverrides?.model ?? activation.model` |\n| REQ-MODEL-9 | SATISFIED | Three-tier chain: `resourceOverrides.model` > `activation.model` > `\"opus\"` fallback |\n| REQ-MODEL-10 | N/A | Scheduled commissions don't exist in the codebase yet. `createCommission` accepts model in `resource_overrides`, so the spawner will work when built, provided it passes the full object. |\n| REQ-MODEL-11 | SATISFIED | Meetings pass no `resourceOverrides.model` to `prepareSdkSession` |\n| REQ-MODEL-12 | SATISFIED | Mail sessions pass no `resourceOverrides.model` to `prepareSdkSession` |\n| REQ-MODEL-13 | SATISFIED | `briefing-generator.ts:384` uses `resourceOverrides: { maxTurns: 200, model: \"sonnet\" }`. Post-prep spread removed. |\n| REQ-MODEL-14 | SATISFIED | `MANAGER_POSTURE` includes Model Selection section with haiku/sonnet/opus guidance |\n| REQ-MODEL-15 | SATISFIED | Posture text: \"use the worker's default unless the task clearly fits a different tier\" |\n| REQ-MODEL-16 | SATISFIED | Commission page resolves effective model, passes to `CommissionHeader` with \"(override)\" annotation |\n| REQ-MODEL-17 | SATISFIED | Meeting page resolves worker model via `discoverPackages`, passes to `MeetingHeader` |\n| REQ-MODEL-18 | DEFERRED | No worker roster view exists. Acknowledged in the plan and commission notes. |\n\n### Focus Area Results\n\n1. **REQ-MODEL-4 (single constant):** Clean. `VALID_MODELS` is the sole source. All validation uses `isValidModel`.\n2. **REQ-MODEL-9 (three-tier resolution):** Clean. Chain verified: `sdk-runner.ts:314` > `worker-activation.ts:111` > fallback \"opus\".\n3. **Production wiring:** Clean. No new DI seams needed. Model flows through existing `WorkerMetadata`, `ActivationContext`, and `SessionPrepSpec.resourceOverrides`. `createProductionApp()` passes `prepDeps` and `packages` through unchanged.\n4. **Five-concerns boundary:** Clean. `sdk-runner.ts` imports only SDK types, shared types, event-bus, toolbox-utils, event-translator, and logging. Zero imports from git, workspace, artifacts, or activity-type modules.\n5. **Briefing generator:** Clean. Sonnet default preserved via `resourceOverrides.model: \"sonnet\"`. Test confirms final options include `model: \"sonnet\"`.\n6. **Commission orchestrator:** Clean. Model is written (create), read (dispatch), validated (dispatch rejects invalid), and updated (preserves existing when updating other fields). Eight new tests cover these paths.\n7. **Test coverage:** Solid. Tests exist for every step: types (6), packages (3), shared activation (2), manager activation (3), sdk-runner (5), orchestrator (8), manager toolbox (1), briefing generator (1). Fixture values use production-plausible data.\n\n### Summary\n\nThe implementation is well-structured. 16 of 18 requirements are satisfied, 1 is correctly deferred (roster view), and 1 is not applicable (scheduled commissions don't exist yet). The single defect is the commission routes' stale type annotations for `resourceOverrides`, which should be a quick fix. The duplicate mail context block is a pre-existing issue worth cleaning up separately."
  - timestamp: 2026-03-09T06:26:08.584Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Found a defect in daemon/routes/commissions.ts: resourceOverrides type annotations are missing model field. Compiling full findings report now."
projectName: guild-hall
---
## Review: Model Selection (commission-Dalton-20260308-211627)

### Findings

**DEFECT: Commission routes missing `model` in `resourceOverrides` type**
File: `daemon/routes/commissions.ts:33` and `101`

Both the POST `/commissions` and PUT `/commissions/:id` endpoints define `resourceOverrides` as `{ maxTurns?: number; maxBudgetUsd?: number }` without `model?: string`. The orchestrator and interface both accept model, but the HTTP route type annotations are stale. At runtime, JSON parsing passes model through untyped, so the feature works by accident. But the type gap means TypeScript won't catch errors at the route layer, and anyone reading the route code would conclude model isn't supported through the REST API.

Fix: Add `model?: string` to both `resourceOverrides` type annotations in `daemon/routes/commissions.ts`.

---

**OBSERVATION: Duplicate `mailContext` block in worker-activation.ts**
File: `packages/shared/worker-activation.ts:37-70`

`buildSystemPrompt` has an identical `if (context.mailContext)` block at lines 37-52 and 54-70. Mail workers receive the mail protocol instructions twice in their system prompt. Pre-existing, not introduced by this commission. Impact: wasted tokens and potentially confusing instructions in every mail reader session.

---

**OBSERVATION: `memory-compaction.ts:291` and `notes-generator.ts:163` use bare `model: "sonnet"` strings**

These are single-turn SDK calls that don't flow through `prepareSdkSession`, so they can't use `resourceOverrides`. They bypass the `VALID_MODELS` type system. If the model list changes (the local-model-support issue), these locations need manual updates. Not a spec violation (these aren't "validation sites" per REQ-MODEL-4), but an inconsistency with the briefing generator's refactored path.

---

### Requirement Checklist

| REQ | Status | Evidence |
|-----|--------|----------|
| REQ-MODEL-1 | SATISFIED | All 5 worker `package.json` files have `"model": "opus"` in guildHall key |
| REQ-MODEL-2 | SATISFIED | `createManagerPackage()` at `worker.ts:87` includes `model: "opus" as ModelName` |
| REQ-MODEL-3 | SATISFIED | `VALID_MODELS` at `types.ts:48`, rejected via `isValidModel` in 3 validation sites |
| REQ-MODEL-4 | SATISFIED | Single `VALID_MODELS` constant, `isValidModel` used in packages.ts, toolbox.ts, orchestrator.ts |
| REQ-MODEL-5 | SATISFIED | Both activation functions read from `context.model`, hardcoded "opus" removed |
| REQ-MODEL-6 | SATISFIED | `context.model ?? "opus"` in both `worker-activation.ts:111` and `worker.ts:177` |
| REQ-MODEL-7 | SATISFIED | `CommissionMeta.resource_overrides` includes `model?: string` at `commissions.ts:28` |
| REQ-MODEL-8 | SATISFIED | `sdk-runner.ts:314`: `spec.resourceOverrides?.model ?? activation.model` |
| REQ-MODEL-9 | SATISFIED | Three-tier chain: `resourceOverrides.model` > `activation.model` > `"opus"` fallback |
| REQ-MODEL-10 | N/A | Scheduled commissions don't exist in the codebase yet. `createCommission` accepts model in `resource_overrides`, so the spawner will work when built, provided it passes the full object. |
| REQ-MODEL-11 | SATISFIED | Meetings pass no `resourceOverrides.model` to `prepareSdkSession` |
| REQ-MODEL-12 | SATISFIED | Mail sessions pass no `resourceOverrides.model` to `prepareSdkSession` |
| REQ-MODEL-13 | SATISFIED | `briefing-generator.ts:384` uses `resourceOverrides: { maxTurns: 200, model: "sonnet" }`. Post-prep spread removed. |
| REQ-MODEL-14 | SATISFIED | `MANAGER_POSTURE` includes Model Selection section with haiku/sonnet/opus guidance |
| REQ-MODEL-15 | SATISFIED | Posture text: "use the worker's default unless the task clearly fits a different tier" |
| REQ-MODEL-16 | SATISFIED | Commission page resolves effective model, passes to `CommissionHeader` with "(override)" annotation |
| REQ-MODEL-17 | SATISFIED | Meeting page resolves worker model via `discoverPackages`, passes to `MeetingHeader` |
| REQ-MODEL-18 | DEFERRED | No worker roster view exists. Acknowledged in the plan and commission notes. |

### Focus Area Results

1. **REQ-MODEL-4 (single constant):** Clean. `VALID_MODELS` is the sole source. All validation uses `isValidModel`.
2. **REQ-MODEL-9 (three-tier resolution):** Clean. Chain verified: `sdk-runner.ts:314` > `worker-activation.ts:111` > fallback "opus".
3. **Production wiring:** Clean. No new DI seams needed. Model flows through existing `WorkerMetadata`, `ActivationContext`, and `SessionPrepSpec.resourceOverrides`. `createProductionApp()` passes `prepDeps` and `packages` through unchanged.
4. **Five-concerns boundary:** Clean. `sdk-runner.ts` imports only SDK types, shared types, event-bus, toolbox-utils, event-translator, and logging. Zero imports from git, workspace, artifacts, or activity-type modules.
5. **Briefing generator:** Clean. Sonnet default preserved via `resourceOverrides.model: "sonnet"`. Test confirms final options include `model: "sonnet"`.
6. **Commission orchestrator:** Clean. Model is written (create), read (dispatch), validated (dispatch rejects invalid), and updated (preserves existing when updating other fields). Eight new tests cover these paths.
7. **Test coverage:** Solid. Tests exist for every step: types (6), packages (3), shared activation (2), manager activation (3), sdk-runner (5), orchestrator (8), manager toolbox (1), briefing generator (1). Fixture values use production-plausible data.

### Summary

The implementation is well-structured. 16 of 18 requirements are satisfied, 1 is correctly deferred (roster view), and 1 is not applicable (scheduled commissions don't exist yet). The single defect is the commission routes' stale type annotations for `resourceOverrides`, which should be a quick fix. The duplicate mail context block is a pre-existing issue worth cleaning up separately.
