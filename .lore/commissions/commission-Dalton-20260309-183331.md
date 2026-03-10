---
title: "Commission: Local Model Support - Core Types and SDK Runner (Steps 1-3)"
date: 2026-03-10
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Steps 1, 2, and 3 of the Local Model Support plan at `.lore/plans/local-model-support.md`. Read the full plan first.\n\n**Step 1**: Config schema — add `ModelDefinition` type to `lib/types.ts`, add `models?: ModelDefinition[]` to `AppConfig`, add `modelDefinitionSchema` and wire into `appConfigSchema` in `lib/config.ts` with cross-field validation (name collisions with built-ins, duplicates, valid URL check). Add tests to `tests/lib/config.test.ts`.\n\n**Step 2**: Model resolution — add `ResolvedModel` type, `resolveModel()` function, and update `isValidModel()` to accept optional config in `lib/types.ts`. The return type changes from type predicate to `boolean`. Add tests.\n\n**Step 3**: SDK session env injection — add `env` to `SdkQueryOptions`, add `checkReachability` to `SessionPrepDeps`, update `prepareSdkSession` to resolve models and inject env vars for local models. Add `defaultCheckReachability` function. Include the mail reader timeline gap fix noted in the plan's resolved questions (add `mail_reader_failed` timeline event in `mail/orchestrator.ts` catch block). Add tests.\n\nThe spec is at `.lore/specs/local-model-support.md`. Reference it for requirement details. Run tests after each step."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-10T01:33:31.889Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T01:33:31.890Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
