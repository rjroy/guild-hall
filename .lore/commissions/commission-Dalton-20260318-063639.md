---
title: "Commission: Memory redesign: Phases 3-5 (injection, migration, compaction removal)"
date: 2026-03-18
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phases 3, 4, and 5 from `.lore/plans/infrastructure/memory-single-file-redesign.md`.\n\n**Phase 3:** Rewrite `loadMemories` for single-file reads (REQ-MEM-16-19). Remove `needsCompaction` from return type (REQ-MEM-17). Update `MEMORY_GUIDANCE` (REQ-MEM-26). Update all consumers: `sdk-runner.ts`, `manager/context.ts`, `meeting/orchestrator.ts`, `app.ts`. Rewrite injection tests. Update mock return types in sdk-runner, briefing-generator, commission orchestrator, mail orchestrator, and integration-commission tests.\n\n**Phase 4:** Implement `migrateIfNeeded` for auto-migration of legacy directories (REQ-MEM-23-25). Wire into `loadMemories` and `read_memory`. Write migration tests at `tests/daemon/services/memory-migration.test.ts`.\n\n**Phase 5:** Delete `memory-compaction.ts` and its test files (REQ-MEM-20). Deprecate `systemModels.memoryCompaction` config field (REQ-MEM-21). Grep for and remove all stale references.\n\nThe plan has detailed file-by-file change lists for each phase. The spec is at `.lore/specs/infrastructure/memory-single-file-redesign.md`.\n\nRun typecheck, lint, and full `bun test` before submitting."
dependencies:
  - commission-Dalton-20260318-063628
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T13:36:39.486Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T13:36:39.488Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-18T13:47:13.839Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-18T13:47:13.841Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
