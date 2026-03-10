---
title: "Commission: Local Model Support - Validation (Steps 4-6)"
date: 2026-03-10
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Steps 4, 5, and 6 of the Local Model Support plan at `.lore/plans/local-model-support.md`. Read the full plan first.\n\n**Step 4**: Package validation — widen `workerMetadataSchema` model field to accept any string, add `validatePackageModels()` function to `lib/packages.ts` that checks worker models against config. Add tests to `tests/lib/packages.test.ts`.\n\n**Step 5**: Commission orchestrator — update `isValidModel` call at dispatch to pass config, fix the model name regex in `updateCommission` from `(\\w+)` to `([^\\s]+)` to support hyphenated local model names. Add tests.\n\n**Step 6**: Manager toolbox — add `config` to `GuildHallToolServices` type in `daemon/lib/toolbox-utils.ts`, update both construction sites (commission orchestrator and meeting orchestrator), replace `isValidModel` runtime checks and Zod schema refine to use config-aware validation. Add tests.\n\nThe spec is at `.lore/specs/local-model-support.md`. Run tests after each step."
dependencies:
  - commission-Dalton-20260309-183331
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-10T01:33:40.712Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T01:39:37.414Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-10T01:53:38.908Z
    event: status_pending
    reason: "Redispatched for retry"
    from: "failed"
    to: "pending"
  - timestamp: 2026-03-10T01:53:38.909Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
