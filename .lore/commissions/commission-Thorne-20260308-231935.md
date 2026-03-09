---
title: "Commission: Review: Implement Model Selection"
date: 2026-03-09
status: dispatched
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the completed work from commission `commission-Dalton-20260308-211627` (Implement Model Selection).\n\n**What changed:** Added model selection throughout the stack. Workers declare a default model in `package.json`, commissions can override via `resource_overrides.model`, and the UI displays the effective model. Resolution order: commission override > worker default > fallback \"opus\".\n\n**Plan:** `.lore/plans/model-selection.md`\n**Spec:** `.lore/specs/model-selection.md`\n\n**Implementation covered 12 steps:**\n1. `VALID_MODELS` constant, `ModelName` type, `isValidModel` guard in `lib/types.ts`\n2. `model?: ModelName` in `WorkerMetadata` interface and `workerMetadataSchema` Zod validation in `lib/packages.ts`\n3. `model` added to `ActivationContext`, wired through `activateWorkerWithSharedPattern` in `packages/shared/worker-activation.ts`\n4. Manager activation in `daemon/services/manager/worker.ts` updated (metadata + activation)\n5. `SessionPrepSpec.resourceOverrides.model` added in `daemon/lib/agent-sdk/sdk-runner.ts`, three-tier resolution wired\n6. Commission orchestrator (`daemon/services/commission/orchestrator.ts`) reads/writes/validates model in `resource_overrides`. `CommissionMeta` in `lib/commissions.ts` updated.\n7. Manager toolbox `create_commission` tool schema updated with model validation in `daemon/services/manager/toolbox.ts`\n8. Briefing generator refactored to use `resourceOverrides.model` instead of post-preparation spread in `daemon/services/briefing-generator.ts`\n9. Manager posture updated with model routing guidance in `daemon/services/manager/worker.ts`\n10. UI: Commission view shows effective model with \"(override)\" annotation. Meeting view shows worker default model. Worker roster deferred (no view exists).\n11. All five worker `package.json` files updated with `\"model\": \"opus\"`\n\n**Review focus:**\n1. REQ-MODEL-4: Verify model list is defined once as `VALID_MODELS`, not duplicated across validation sites. Check that `isValidModel` is used everywhere (Zod schemas, orchestrator dispatch validation, manager toolbox).\n2. REQ-MODEL-9: Verify three-tier resolution order in `prepareSdkSession`: `spec.resourceOverrides?.model ?? activation.model` (with activation fallback to \"opus\").\n3. Production wiring: The most repeated retro lesson in this codebase. Verify `daemon/app.ts` / `createProductionApp()` passes model through. Tests with mocks can pass while production is broken.\n4. Five-concerns boundary: `sdk-runner.ts` should have zero new imports from git, workspace, artifacts, or activity-type-specific modules. Model resolution happens before `prepareSdkSession`, not inside it.\n5. Briefing generator: Verify Sonnet default is preserved after the refactor from direct spread to `resourceOverrides.model`.\n6. Commission orchestrator: Validate model read/write/update in YAML artifacts, and that invalid model names are rejected during dispatch.\n7. Test coverage: New tests for each step. Fixture values should match production data shapes.\n8. Check all 18 REQ-MODEL requirements against the implementation."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-09T06:19:35.106Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T06:19:35.107Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
