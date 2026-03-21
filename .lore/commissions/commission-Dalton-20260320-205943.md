---
title: "Commission: Implement: Worker sub-agents Phase 1 (type foundations)"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 1 of the worker sub-agents plan at `.lore/plans/infrastructure/worker-sub-agents.md`.\n\n**Read the plan AND the spec** (`.lore/specs/infrastructure/worker-sub-agents.md`) before starting.\n\n**Phase 1: Type Foundations** (Steps 1-5)\n\n1. Add `subAgentModel?: string` to `WorkerMetadata` in `lib/types.ts` (REQ-SUBAG-1)\n2. Add `subAgentModel` to `workerMetadataSchema` in `lib/packages.ts` (REQ-SUBAG-4)\n3. Extend `validatePackageModels` to validate `subAgentModel`: \"inherit\" and VALID_MODELS pass, local models rejected, invalid names rejected with descriptive error (REQ-SUBAG-2, REQ-SUBAG-3, REQ-SUBAG-29)\n4. Add `\"subagent\"` to `ContextTypeName` and register it in `createContextTypeRegistry()` with no toolbox factory and `stateSubdir: \"subagents\"` (REQ-SUBAG-13, REQ-SUBAG-14)\n5. Tests: validation passes for \"sonnet\", \"inherit\", and omitted. Rejects invalid names and local model names. Context type registry has \"subagent\" entry.\n\nRun `bun run typecheck && bun test` after implementation. Commit when all pass."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T03:59:43.833Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T03:59:43.835Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
