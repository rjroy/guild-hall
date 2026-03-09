---
title: "Commission: Implement Model Selection"
date: 2026-03-09
status: completed
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the Model Selection plan at `.lore/plans/model-selection.md`. The plan has 12 steps covering the full feature: valid models constant, package metadata, activation wiring, session prep overrides, commission orchestrator, manager toolbox, briefing generator refactor, manager posture, UI display, and worker package updates.\n\nKey guidance from the plan:\n- Follow the step ordering in the Delegation Guide section. Steps 1-5 are sequential. Steps 6-8 can parallel after Step 5. Step 11 is independent after Step 2.\n- REQ-MODEL-4 is critical: the model list must be defined as a single constant (`VALID_MODELS`), not duplicated across validation sites.\n- REQ-MODEL-9 resolution order: commission override > worker default > fallback \"opus\".\n- The briefing generator (Step 8) should use `resourceOverrides.model` instead of the current post-preparation spread hack.\n- Step 10 (UI): follow existing CSS Modules patterns. Worker roster display (REQ-MODEL-18) can be deferred if no roster view exists yet.\n- Step 12 (spec validation): launch a fresh-context sub-agent to verify all REQ-MODEL requirements.\n\nCheck the Open Questions section for verification notes, especially REQ-MODEL-10 (scheduled commission spawner copy mechanism).\n\nRun all tests before completing. Use `/lore-development:implement` to orchestrate the work."
dependencies: []
linked_artifacts:
  - .lore/specs/model-selection.md

  - .lore/brainstorm/model-selection.md
  - .lore/issues/local-model-support.md
  - .lore/retros/unified-sdk-runner.md
  - .lore/retros/in-process-commissions.md
  - .lore/retros/worker-dispatch.md
  - .lore/retros/phase-4-commissions.md
  - .lore/retros/worker-domain-plugins.md
  - .lore/retros/coverage-di-factories.md
  - .lore/retros/meeting-infrastructure-convergence.md
  - .lore/research/claude-agent-sdk-ref-typescript.md
  - .lore/brainstorm/model-selection.md
  - .lore/issues/local-model-support.md
  - .lore/retros/unified-sdk-runner.md
  - .lore/retros/in-process-commissions.md
  - .lore/retros/worker-dispatch.md
  - .lore/retros/phase-4-commissions.md
  - .lore/retros/worker-domain-plugins.md
  - .lore/retros/coverage-di-factories.md
  - .lore/retros/meeting-infrastructure-convergence.md
  - .lore/research/claude-agent-sdk-ref-typescript.md
activity_timeline:
  - timestamp: 2026-03-09T04:16:27.088Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T04:16:27.090Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-09T04:16:27.123Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-09T04:16:34.271Z
    event: progress_report
    reason: "Starting Model Selection implementation. Reading the plan file first."
  - timestamp: 2026-03-09T04:17:54.141Z
    event: progress_report
    reason: "Completed search of all .lore/ directories. Found the model-selection spec and brainstorm, the local-model-support issue, 7 relevant retros (unified-sdk-runner, in-process-commissions, worker-dispatch, worker-domain-plugins, phase-4-commissions, coverage-di-factories, meeting-infrastructure-convergence), and SDK research docs. Compiling findings now."
  - timestamp: 2026-03-09T04:18:56.671Z
    event: result_submitted
    reason: "## Related Learnings\n\n### From Specs\n\n**[Model Selection](file:///home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260308-211627/.lore/specs/model-selection.md)** (`.lore/specs/model-selection.md`)\nRelevance: This is the governing spec. 18 requirements (REQ-MODEL-1 through REQ-MODEL-18). Key points: model in `package.json` `guildHall` key, validation against `opus`/`sonnet`/`haiku` constant, resolution order is commission `resource_overrides.model` > worker package `model` > fallback `opus`. Briefing generator refactored to use `SessionPrepSpec.resourceOverrides.model` instead of a one-off spread. Meetings and mail always use worker default (no override). Manager posture gets convergence/divergence guidance. UI displays model in commission view, meeting view, and roster.\n\n### From Brainstorms\n\n**[Model Selection Architecture](file:///home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260308-211627/.lore/brainstorm/model-selection.md)** (`.lore/brainstorm/model-selection.md`)\nExplored: Seven ideas evaluated. Critical implementation finding: `ActivationResult.model` field and SDK runner model passthrough **already exist**. The SDK runner at `daemon/lib/agent-sdk/sdk-runner.ts:327` already does `...(activation.model ? { model: activation.model } : {})`. The hardcoded `\"opus\"` lives in two places: `packages/shared/worker-activation.ts:111` (roster workers) and `daemon/services/manager/worker.ts:164` (Guild Master). The briefing generator already overrides to Sonnet at `daemon/services/briefing-generator.ts:401`. Worker variants (`extends` mechanism) explicitly deferred as premature. Model override goes through `resource_overrides` alongside `maxTurns`/`maxBudgetUsd`.\n\n### From Issues\n\n**[Support Local Models via Ollama](file:///home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260308-211627/.lore/issues/local-model-support.md)** (`.lore/issues/local-model-support.md`)\nRelevance: The valid model list is designed to expand. This issue describes how local models would need a model definition shape with base URL and auth override, not just a name string. The spec's REQ-MODEL-4 (\"single constant, not repeated across validation sites\") and REQ-MODEL-3's constraint (\"the list will grow\") are directly motivated by this issue. Design validation so the model list is easy to extend without architectural changes.\n\n### From Retros\n\n**[Unified SDK Runner](file:///home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260308-211627/.lore/retros/unified-sdk-runner.md)** (`.lore/retros/unified-sdk-runner.md`)\nKey insight: `prepareSdkSession` is the shared infrastructure that all session types (commission, meeting, mail, briefing) flow through. Memory compaction was silently broken for commissions before this unification. Any model override should go through `prepareSdkSession`'s `resourceOverrides`, not be applied ad-hoc in each orchestrator. The five-concerns boundary held after this refactor: sdk-runner has zero imports from git, workspace, artifacts, or activity-type-specific modules. Don't break this.\n\n**[In-Process Commission Migration](file:///home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260308-211627/.lore/retros/in-process-commissions.md)** (`.lore/retros/in-process-commissions.md`)\nKey insight: Fresh-eyes review found `queryFn` wasn't wired in `createProductionApp()`. The DI wiring gap pattern: everything works in tests because tests inject mocks, but production code needs someone to create real dependencies. When adding model to `SessionPrepSpec.resourceOverrides`, verify the production wiring in `daemon/app.ts` passes it through. The `queryFn!` non-null assertion in app.ts is a known rough edge.\n\n**[Worker Dispatch Production Gaps](file:///home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260308-211627/.lore/retros/worker-dispatch.md)** (`.lore/retros/worker-dispatch.md`)\nKey insight: DI factory codebases need an explicit \"production wiring\" step in every plan. If the plan creates `createX(deps)` factories and tests them with mocks, the plan must also say \"wire the real deps in production.\" This is the single most repeated lesson in the retro archive. For model selection, the production wiring step is: after adding `model` to `SessionPrepSpec.resourceOverrides`, confirm `createProductionApp()` and the commission orchestrator's call to `prepareSdkSession` actually pass the model through.\n\n**[Phase 4 - Commissions](file:///home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260308-211627/.lore/retros/phase-4-commissions.md)** (`.lore/retros/phase-4-commissions.md`)\nKey insight: Worker packages must handle all activation contexts. When adding model to `WorkerMetadata`, update the shared activation (`packages/shared/worker-activation.ts`) and the manager activation (`daemon/services/manager/worker.ts`). Both are callsites. Also: 1032 tests passed and 33/33 spec requirements validated, but the system didn't work end-to-end. Spec validation catches capability, not assembly. Runtime testing is mandatory after implementation.\n\n**[Worker Domain Plugins](file:///home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260308-211627/.lore/retros/worker-domain-plugins.md)** (`.lore/retros/worker-domain-plugins.md`)\nKey insight: No production wiring changes were needed for domain plugins because the existing DI seams (`prepareSdkSession` already receives `packages` and `workerMeta`) absorbed the new capability. Model selection should follow the same pattern: the existing `prepareSdkSession` interface should absorb model without requiring new DI seams. Also: test fixture values drifted from production behavior. When testing model resolution, use fixture values that match what the upstream producer (package validation, commission artifact parsing) actually creates.\n\n**[Coverage DI Factories](file:///home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260308-211627/.lore/retros/coverage-di-factories.md)** (`.lore/retros/coverage-di-factories.md`)\nKey insight: The DI factory pattern (`createX(deps)` with default instance for production) is the standard in this codebase. Any new validation or resolution logic for model names should follow this pattern for testability. Backward compatibility through additive exports (new alongside existing) prevents breaking changes.\n\n**[Meeting Infrastructure Convergence](file:///home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260308-211627/.lore/retros/meeting-infrastructure-convergence.md)** (`.lore/retros/meeting-infrastructure-convergence.md`)\nKey insight: A delegation guide in the plan (which reviewer at which step) catches more bugs than ad-hoc review. For model selection, the risk concentrations are: (1) the `resource_overrides` resolution logic in `prepareSdkSession` (needs silent-failure-hunter), (2) package validation schema changes (needs type-design-analyzer), and (3) commission artifact schema changes (needs spec compliance review).\n\n### From Research\n\n**[Claude Agent SDK Reference](file:///home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260308-211627/.lore/research/claude-agent-sdk-ref-typescript.md)** (`.lore/research/claude-agent-sdk-ref-typescript.md`)\nRelevance: The SDK's `ClaudeCodeOptions.model` field accepts a string and defaults from CLI. Subagent `model` accepts `\"sonnet\" | \"opus\" | \"haiku\" | \"inherit\"`. The session has a `setModel()` method (streaming input mode only) and `supportedModels()` for discovery. The `ResultMessage` includes `modelUsage: { [modelName: string]: ModelUsage }` for cost tracking per model. These are the actual SDK types the implementation must align with.\n\n---\n\n### Consolidated Pitfalls to Watch\n\n1. **Production wiring gap** (repeated in 3 retros): After adding model to types, schemas, and test mocks, verify the real wiring in `daemon/app.ts` / `createProductionApp()` passes it through. Tests with injected mocks will pass even if production is broken.\n\n2. **Two hardcoded callsites**: `packages/shared/worker-activation.ts:111` and `daemon/services/manager/worker.ts:164`. Both must be updated. Missing one means half the workers ignore the model field silently.\n\n3. **Existing plumbing works**: `ActivationResult.model`, `prepareSdkSession`, and the SDK runner's model passthrough are already in place. This is a wiring change, not a new capability. Don't over-engineer it.\n\n4. **Briefing generator override pattern**: Already overrides model at `daemon/services/briefing-generator.ts:401` via a direct spread. The refactoring to use `SessionPrepSpec.resourceOverrides.model` is a cleanup, not new behavior. Verify the Sonnet default is preserved.\n\n5. **Test fixtures must match production data shapes**: When testing model resolution, use values that match what package validation and commission artifact parsing actually produce (retro lesson from worker-domain-plugins).\n\n6. **Model list extensibility**: REQ-MODEL-4 requires a single constant. The local-model-support issue shows why: the list will grow to include Ollama model names, base URLs, and auth overrides. Design the constant so adding entries doesn't require changing validation logic.\n\n7. **Five-concerns boundary**: sdk-runner has zero imports from git, workspace, artifacts, or activity-type-specific modules. Model resolution should happen before `prepareSdkSession` is called (in the orchestrator or activation layer), not inside the runner itself."
  - timestamp: 2026-03-09T04:20:11.145Z
    event: progress_report
    reason: "Context gathered. Starting Phase 1: Define VALID_MODELS constant and ModelName type in lib/types.ts."
  - timestamp: 2026-03-09T04:20:58.941Z
    event: progress_report
    reason: "Step 1 complete: VALID_MODELS constant, ModelName type, and isValidModel type guard added to lib/types.ts. All 30 tests pass including the 6 new tests covering valid models, invalid inputs, and array length."
  - timestamp: 2026-03-09T04:23:17.749Z
    event: progress_report
    reason: "Steps 1-2 complete. VALID_MODELS constant, ModelName type, WorkerMetadata.model field, and Zod schema validation all in place with tests. Moving to Step 3: shared activation wiring."
  - timestamp: 2026-03-09T04:24:12.003Z
    event: progress_report
    reason: "Step 11 complete: Added \"model\": \"opus\" to all five worker package.json files (writer, developer, researcher, reviewer, test-engineer). Field placed after identity, before domainToolboxes/domainPlugins. All 63 package tests pass."
  - timestamp: 2026-03-09T04:25:15.086Z
    event: progress_report
    reason: "All three changes complete and verified. Added `model?: string` to ActivationContext, wired it through `activateWorkerWithSharedPattern` with \"opus\" fallback, added two tests for explicit model and default behavior. All 18 tests pass."
  - timestamp: 2026-03-09T04:27:16.910Z
    event: progress_report
    reason: "Step 4 complete. Added `model: \"opus\" as ModelName` to Guild Master metadata in `createManagerPackage()`, wired `context.model ?? \"opus\"` in `activateManager()`, and added 3 tests covering metadata model value, context model override, and backwards-compatible default. All 34 tests pass."
  - timestamp: 2026-03-09T04:27:35.684Z
    event: progress_report
    reason: "Steps 1-4 and 11 complete. Foundation chain done (VALID_MODELS, WorkerMetadata.model, shared activation, manager activation, worker packages). Starting Step 5: SessionPrepSpec resourceOverrides model wiring."
  - timestamp: 2026-03-09T04:29:35.015Z
    event: progress_report
    reason: "Step 5 implementation complete. All three changes made in sdk-runner.ts and four new tests added (plus one existing test still passing). All 51 tests pass."
  - timestamp: 2026-03-09T04:30:44.106Z
    event: progress_report
    reason: "Steps 1-5 and 11 complete. The full model resolution chain is wired: VALID_MODELS → WorkerMetadata → ActivationContext → SessionPrepSpec → SDK options, with three-tier override (commission > worker > fallback). Now dispatching Steps 6-8 in parallel (commission orchestrator, manager toolbox, briefing generator)."
  - timestamp: 2026-03-09T04:33:25.984Z
    event: progress_report
    reason: "Step 8 complete. Refactored briefing generator to use resourceOverrides.model instead of post-preparation spread hack. All 24 tests pass including new model override test."
  - timestamp: 2026-03-09T04:33:38.409Z
    event: progress_report
    reason: "Step 7 complete: Added model to the manager toolbox's create_commission tool. Changes: (1) imported isValidModel from lib/types, (2) added model field with Zod validation (refine using isValidModel) to resourceOverrides in the tool schema, (3) updated tool description to mention model override, (4) updated handler args type to include model, (5) updated mock session type in tests, (6) added test for model passthrough. All 41 tests pass, typecheck clean."
  - timestamp: 2026-03-09T04:34:39.336Z
    event: progress_report
    reason: "Step 6 implementation complete. All changes made to lib/commissions.ts (CommissionMeta type + parseCommissionData), daemon/services/commission/orchestrator.ts (CommissionSessionForRoutes interface, createCommission, updateCommission, dispatchCommission with isValidModel validation), and tests. All 52 orchestrator tests pass (including 8 new model selection tests), 16 commissions lib tests pass, and typecheck is clean."
  - timestamp: 2026-03-09T04:35:14.843Z
    event: progress_report
    reason: "Steps 6-8 complete in parallel. Commission orchestrator reads/writes/validates model in resource_overrides. Manager toolbox accepts model in create_commission schema. Briefing generator uses resourceOverrides.model path. Moving to Steps 9 and 10."
  - timestamp: 2026-03-09T04:35:59.233Z
    event: progress_report
    reason: "Step 9 complete. Appended model selection guidance to MANAGER_POSTURE in daemon/services/manager/worker.ts. All 34 existing tests pass."
  - timestamp: 2026-03-09T04:38:49.629Z
    event: progress_report
    reason: "All three parts of Step 10 (model display in UI) are complete. Commission view shows the effective model with \"(override)\" annotation when the commission overrides the worker default. Meeting view shows the worker's default model. Worker roster (Part 3) was deferred because no roster view exists. TypeScript typecheck passes clean."
  - timestamp: 2026-03-09T04:39:28.164Z
    event: progress_report
    reason: "Steps 1-11 complete. All implementation phases done. Manager posture has model guidance. UI shows model in commission and meeting views. Worker roster display deferred (no roster view exists). Running full test suite and spec validation next."
  - timestamp: 2026-03-09T04:41:58.729Z
    event: progress_report
    reason: "All implementation files have been read and analyzed. Preparing final validation report for REQ-MODEL-1 through REQ-MODEL-18."
  - timestamp: 2026-03-09T04:44:32.928Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All implementation files have been read and analyzed. Preparing final validation report for REQ-MODEL-1 through REQ-MODEL-18."
projectName: guild-hall
---
## Related Learnings

### From Specs

**[Model Selection](file:///home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260308-211627/.lore/specs/model-selection.md)** (`.lore/specs/model-selection.md`)
Relevance: This is the governing spec. 18 requirements (REQ-MODEL-1 through REQ-MODEL-18). Key points: model in `package.json` `guildHall` key, validation against `opus`/`sonnet`/`haiku` constant, resolution order is commission `resource_overrides.model` > worker package `model` > fallback `opus`. Briefing generator refactored to use `SessionPrepSpec.resourceOverrides.model` instead of a one-off spread. Meetings and mail always use worker default (no override). Manager posture gets convergence/divergence guidance. UI displays model in commission view, meeting view, and roster.

### From Brainstorms

**[Model Selection Architecture](file:///home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260308-211627/.lore/brainstorm/model-selection.md)** (`.lore/brainstorm/model-selection.md`)
Explored: Seven ideas evaluated. Critical implementation finding: `ActivationResult.model` field and SDK runner model passthrough **already exist**. The SDK runner at `daemon/lib/agent-sdk/sdk-runner.ts:327` already does `...(activation.model ? { model: activation.model } : {})`. The hardcoded `"opus"` lives in two places: `packages/shared/worker-activation.ts:111` (roster workers) and `daemon/services/manager/worker.ts:164` (Guild Master). The briefing generator already overrides to Sonnet at `daemon/services/briefing-generator.ts:401`. Worker variants (`extends` mechanism) explicitly deferred as premature. Model override goes through `resource_overrides` alongside `maxTurns`/`maxBudgetUsd`.

### From Issues

**[Support Local Models via Ollama](file:///home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260308-211627/.lore/issues/local-model-support.md)** (`.lore/issues/local-model-support.md`)
Relevance: The valid model list is designed to expand. This issue describes how local models would need a model definition shape with base URL and auth override, not just a name string. The spec's REQ-MODEL-4 ("single constant, not repeated across validation sites") and REQ-MODEL-3's constraint ("the list will grow") are directly motivated by this issue. Design validation so the model list is easy to extend without architectural changes.

### From Retros

**[Unified SDK Runner](file:///home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260308-211627/.lore/retros/unified-sdk-runner.md)** (`.lore/retros/unified-sdk-runner.md`)
Key insight: `prepareSdkSession` is the shared infrastructure that all session types (commission, meeting, mail, briefing) flow through. Memory compaction was silently broken for commissions before this unification. Any model override should go through `prepareSdkSession`'s `resourceOverrides`, not be applied ad-hoc in each orchestrator. The five-concerns boundary held after this refactor: sdk-runner has zero imports from git, workspace, artifacts, or activity-type-specific modules. Don't break this.

**[In-Process Commission Migration](file:///home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260308-211627/.lore/retros/in-process-commissions.md)** (`.lore/retros/in-process-commissions.md`)
Key insight: Fresh-eyes review found `queryFn` wasn't wired in `createProductionApp()`. The DI wiring gap pattern: everything works in tests because tests inject mocks, but production code needs someone to create real dependencies. When adding model to `SessionPrepSpec.resourceOverrides`, verify the production wiring in `daemon/app.ts` passes it through. The `queryFn!` non-null assertion in app.ts is a known rough edge.

**[Worker Dispatch Production Gaps](file:///home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260308-211627/.lore/retros/worker-dispatch.md)** (`.lore/retros/worker-dispatch.md`)
Key insight: DI factory codebases need an explicit "production wiring" step in every plan. If the plan creates `createX(deps)` factories and tests them with mocks, the plan must also say "wire the real deps in production." This is the single most repeated lesson in the retro archive. For model selection, the production wiring step is: after adding `model` to `SessionPrepSpec.resourceOverrides`, confirm `createProductionApp()` and the commission orchestrator's call to `prepareSdkSession` actually pass the model through.

**[Phase 4 - Commissions](file:///home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260308-211627/.lore/retros/phase-4-commissions.md)** (`.lore/retros/phase-4-commissions.md`)
Key insight: Worker packages must handle all activation contexts. When adding model to `WorkerMetadata`, update the shared activation (`packages/shared/worker-activation.ts`) and the manager activation (`daemon/services/manager/worker.ts`). Both are callsites. Also: 1032 tests passed and 33/33 spec requirements validated, but the system didn't work end-to-end. Spec validation catches capability, not assembly. Runtime testing is mandatory after implementation.

**[Worker Domain Plugins](file:///home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260308-211627/.lore/retros/worker-domain-plugins.md)** (`.lore/retros/worker-domain-plugins.md`)
Key insight: No production wiring changes were needed for domain plugins because the existing DI seams (`prepareSdkSession` already receives `packages` and `workerMeta`) absorbed the new capability. Model selection should follow the same pattern: the existing `prepareSdkSession` interface should absorb model without requiring new DI seams. Also: test fixture values drifted from production behavior. When testing model resolution, use fixture values that match what the upstream producer (package validation, commission artifact parsing) actually creates.

**[Coverage DI Factories](file:///home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260308-211627/.lore/retros/coverage-di-factories.md)** (`.lore/retros/coverage-di-factories.md`)
Key insight: The DI factory pattern (`createX(deps)` with default instance for production) is the standard in this codebase. Any new validation or resolution logic for model names should follow this pattern for testability. Backward compatibility through additive exports (new alongside existing) prevents breaking changes.

**[Meeting Infrastructure Convergence](file:///home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260308-211627/.lore/retros/meeting-infrastructure-convergence.md)** (`.lore/retros/meeting-infrastructure-convergence.md`)
Key insight: A delegation guide in the plan (which reviewer at which step) catches more bugs than ad-hoc review. For model selection, the risk concentrations are: (1) the `resource_overrides` resolution logic in `prepareSdkSession` (needs silent-failure-hunter), (2) package validation schema changes (needs type-design-analyzer), and (3) commission artifact schema changes (needs spec compliance review).

### From Research

**[Claude Agent SDK Reference](file:///home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260308-211627/.lore/research/claude-agent-sdk-ref-typescript.md)** (`.lore/research/claude-agent-sdk-ref-typescript.md`)
Relevance: The SDK's `ClaudeCodeOptions.model` field accepts a string and defaults from CLI. Subagent `model` accepts `"sonnet" | "opus" | "haiku" | "inherit"`. The session has a `setModel()` method (streaming input mode only) and `supportedModels()` for discovery. The `ResultMessage` includes `modelUsage: { [modelName: string]: ModelUsage }` for cost tracking per model. These are the actual SDK types the implementation must align with.

---

### Consolidated Pitfalls to Watch

1. **Production wiring gap** (repeated in 3 retros): After adding model to types, schemas, and test mocks, verify the real wiring in `daemon/app.ts` / `createProductionApp()` passes it through. Tests with injected mocks will pass even if production is broken.

2. **Two hardcoded callsites**: `packages/shared/worker-activation.ts:111` and `daemon/services/manager/worker.ts:164`. Both must be updated. Missing one means half the workers ignore the model field silently.

3. **Existing plumbing works**: `ActivationResult.model`, `prepareSdkSession`, and the SDK runner's model passthrough are already in place. This is a wiring change, not a new capability. Don't over-engineer it.

4. **Briefing generator override pattern**: Already overrides model at `daemon/services/briefing-generator.ts:401` via a direct spread. The refactoring to use `SessionPrepSpec.resourceOverrides.model` is a cleanup, not new behavior. Verify the Sonnet default is preserved.

5. **Test fixtures must match production data shapes**: When testing model resolution, use values that match what package validation and commission artifact parsing actually produce (retro lesson from worker-domain-plugins).

6. **Model list extensibility**: REQ-MODEL-4 requires a single constant. The local-model-support issue shows why: the list will grow to include Ollama model names, base URLs, and auth overrides. Design the constant so adding entries doesn't require changing validation logic.

7. **Five-concerns boundary**: sdk-runner has zero imports from git, workspace, artifacts, or activity-type-specific modules. Model resolution should happen before `prepareSdkSession` is called (in the orchestrator or activation layer), not inside the runner itself.
