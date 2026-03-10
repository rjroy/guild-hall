---
title: "Commission: Implement system model defaults"
date: 2026-03-10
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Follow the implementation plan at `.lore/plans/system-model-defaults.md` exactly. Complete Steps 1 through 5 in order.\n\n**Step 1**: Add `SystemModels` interface and `systemModelsSchema` to `lib/types.ts` and `lib/config.ts`. Add tests to `tests/lib/config.test.ts`.\n\n**Step 2**: Wire configurable model into memory compaction (`daemon/services/memory-compaction.ts`), threading `config` through call sites in `daemon/app.ts` and `daemon/services/meeting/orchestrator.ts`. Add tests.\n\n**Step 3**: Wire configurable model into meeting notes (`daemon/services/meeting/notes-generator.ts`), threading `config` through the call site in `daemon/services/meeting/orchestrator.ts`. Add tests.\n\n**Step 4**: Wire configurable model into briefing generator (`daemon/services/briefing-generator.ts`). No DI change needed since `BriefingGeneratorDeps` already has `config`. Add tests.\n\n**Step 5**: Wire configurable model into Guild Master (`daemon/services/manager/worker.ts`), passing `config` from `daemon/app.ts`. Add tests.\n\nThe plan has detailed code examples and test cases for each step. Follow the spec requirements (REQ-SYS-MODEL-1 through REQ-SYS-MODEL-10) and the verification checklist at the bottom of the plan.\n\nKey constraints:\n- Step 1 must complete before Steps 2-5 (type dependency)\n- Local model resolution: compaction and notes must resolve inline via `resolveModel()`; briefing and guild-master flow through `prepareSdkSession`\n- All `config` parameters are optional to preserve backwards compatibility\n- Run `bun test` at the end to confirm no regressions"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-10T08:28:22.337Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T08:28:22.338Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
