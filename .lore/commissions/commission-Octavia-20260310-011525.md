---
title: "Commission: Plan: Configurable system models"
date: 2026-03-10
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write an implementation plan for the \"System Model Defaults\" spec at `.lore/specs/infrastructure/system-model-defaults.md`.\n\nRead the spec thoroughly, then produce a plan that covers all requirements. Break the work into ordered steps suitable for commissioning to Dalton (implementation) and Sable (testing). Identify dependencies between steps.\n\nReference the spec's REQ IDs in the plan steps. Check the existing codebase to understand current model handling before planning changes.\n\nKey areas to investigate:\n- How models are currently configured (config.yaml, worker packages)\n- Where model selection happens in the daemon (commission creation, session preparation)\n- The toolbox resolver and session preparation pipeline\n\nOutput the plan to `.lore/plans/infrastructure/system-model-defaults.md` following the project's plan conventions."
dependencies: []
linked_artifacts:
  - .lore/plans/infrastructure/system-model-defaults.md

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-10T08:15:25.421Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T08:15:25.422Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-10T08:15:25.455Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-10T08:15:32.593Z
    event: progress_report
    reason: "Starting work: reading the spec and investigating current model handling in the codebase."
  - timestamp: 2026-03-10T08:18:07.157Z
    event: progress_report
    reason: "Codebase investigation complete. Writing the implementation plan now. Key findings: config schema already has models array; systemModels needs to be added. CompactionDeps and NotesGeneratorDeps need config? AppConfig added. BriefingGeneratorDeps already has config. createManagerPackage() needs an optional config param. QueryOptions already has env? field (local-model-support is implemented)."
  - timestamp: 2026-03-10T08:20:02.994Z
    event: result_submitted
    reason: "Implementation plan written to `.lore/plans/infrastructure/system-model-defaults.md`.\n\nThe plan covers all 10 REQ-SYS-MODEL requirements across 6 steps:\n\n**Step 1** (foundation): Add `SystemModels` interface to `lib/types.ts`, add `systemModels?: SystemModels` to `AppConfig`, and wire `systemModelsSchema` into `appConfigSchema` in `lib/config.ts` with `z.string().min(1)` per field.\n\n**Steps 2-5** (service changes, all depend on Step 1, independent of each other):\n- Step 2: Add `config?: AppConfig` to `CompactionDeps`, inline `resolveModel()` call before the SDK options, update both call sites in `daemon/app.ts` and `meeting/orchestrator.ts`\n- Step 3: Add `config?: AppConfig` to `NotesGeneratorDeps`, same inline resolution pattern, update call site in `meeting/orchestrator.ts`\n- Step 4: Briefing generator — one-liner change since `BriefingGeneratorDeps` already has `config`; `prepareSdkSession` handles resolution automatically\n- Step 5: `createManagerPackage(config?: AppConfig)` with optional param, pass `config` at the `daemon/app.ts` call site\n\n**Step 6**: Spec validation by fresh-context sub-agent.\n\nKey findings documented in the plan:\n- `QueryOptions` already has `env?` (local-model-support is implemented), so Steps 2 and 3 can set env vars for local models\n- Memory compaction failure on bad model name is non-fatal (consistent with existing behavior); meeting notes failure returns `{ success: false, reason }` (not a throw)\n- Briefing generator and Guild Master get free local model resolution through `prepareSdkSession`; compaction and meeting notes need inline `resolveModel()` calls\n- All existing callers remain backwards-compatible (optional config params throughout)"
  - timestamp: 2026-03-10T08:20:15.057Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Codebase investigation complete. Writing the implementation plan now. Key findings: config schema already has models array; systemModels needs to be added. CompactionDeps and NotesGeneratorDeps need config? AppConfig added. BriefingGeneratorDeps already has config. createManagerPackage() needs an optional config param. QueryOptions already has env? field (local-model-support is implemented)."
projectName: guild-hall
---
Implementation plan written to `.lore/plans/infrastructure/system-model-defaults.md`.

The plan covers all 10 REQ-SYS-MODEL requirements across 6 steps:

**Step 1** (foundation): Add `SystemModels` interface to `lib/types.ts`, add `systemModels?: SystemModels` to `AppConfig`, and wire `systemModelsSchema` into `appConfigSchema` in `lib/config.ts` with `z.string().min(1)` per field.

**Steps 2-5** (service changes, all depend on Step 1, independent of each other):
- Step 2: Add `config?: AppConfig` to `CompactionDeps`, inline `resolveModel()` call before the SDK options, update both call sites in `daemon/app.ts` and `meeting/orchestrator.ts`
- Step 3: Add `config?: AppConfig` to `NotesGeneratorDeps`, same inline resolution pattern, update call site in `meeting/orchestrator.ts`
- Step 4: Briefing generator — one-liner change since `BriefingGeneratorDeps` already has `config`; `prepareSdkSession` handles resolution automatically
- Step 5: `createManagerPackage(config?: AppConfig)` with optional param, pass `config` at the `daemon/app.ts` call site

**Step 6**: Spec validation by fresh-context sub-agent.

Key findings documented in the plan:
- `QueryOptions` already has `env?` (local-model-support is implemented), so Steps 2 and 3 can set env vars for local models
- Memory compaction failure on bad model name is non-fatal (consistent with existing behavior); meeting notes failure returns `{ success: false, reason }` (not a throw)
- Briefing generator and Guild Master get free local model resolution through `prepareSdkSession`; compaction and meeting notes need inline `resolveModel()` calls
- All existing callers remain backwards-compatible (optional config params throughout)
