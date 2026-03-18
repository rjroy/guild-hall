---
title: "Commission: Memory redesign: Phases 3-5 (injection, migration, compaction removal)"
date: 2026-03-18
status: abandoned
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phases 3, 4, and 5 from `.lore/plans/infrastructure/memory-single-file-redesign.md`.\n\n**Phase 3:** Rewrite `loadMemories` for single-file reads (REQ-MEM-16-19). Remove `needsCompaction` from return type (REQ-MEM-17). Update `MEMORY_GUIDANCE` (REQ-MEM-26). Update all consumers: `sdk-runner.ts`, `manager/context.ts`, `meeting/orchestrator.ts`, `app.ts`. Rewrite injection tests. Update mock return types in sdk-runner, briefing-generator, commission orchestrator, mail orchestrator, and integration-commission tests.\n\n**Phase 4:** Implement `migrateIfNeeded` for auto-migration of legacy directories (REQ-MEM-23-25). Wire into `loadMemories` and `read_memory`. Write migration tests at `tests/daemon/services/memory-migration.test.ts`.\n\n**Phase 5:** Delete `memory-compaction.ts` and its test files (REQ-MEM-20). Deprecate `systemModels.memoryCompaction` config field (REQ-MEM-21). Grep for and remove all stale references.\n\nThe plan has detailed file-by-file change lists for each phase. The spec is at `.lore/specs/infrastructure/memory-single-file-redesign.md`.\n\nRun typecheck, lint, and full `bun test` before submitting."
dependencies:
  - commission-Thorne-20260318-063256
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T13:33:07.586Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T13:33:07.589Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-18T13:36:19.989Z
    event: status_cancelled
    reason: "Commission cancelled by user"
    from: "blocked"
    to: "cancelled"
  - timestamp: 2026-03-18T13:38:33.834Z
    event: status_abandoned
    reason: "supersceded by other commissions."
    from: "cancelled"
    to: "abandoned"
current_progress: ""
projectName: guild-hall
---
