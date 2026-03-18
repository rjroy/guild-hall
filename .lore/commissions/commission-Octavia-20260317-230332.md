---
title: "Commission: Plan: Memory system single-file redesign"
date: 2026-03-18
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Create an implementation plan for `.lore/specs/infrastructure/memory-single-file-redesign.md`.\n\nRead the spec first, then produce a phased plan at `.lore/plans/infrastructure/memory-single-file-redesign.md`.\n\nKey context:\n- The spec has 27 REQs covering storage, section parser, edit_memory, read_memory, injection, compaction removal, concurrency, migration, and guidance update\n- Current implementation lives in: `daemon/services/memory-injector.ts`, `daemon/services/memory-compaction.ts`, `daemon/services/base-toolbox.ts`\n- The `MEMORY_GUIDANCE` constant needs updating\n- Migration from multi-file to single-file is auto-triggered on first read\n- REQ-MEM-27 adds a read-before-write guard (per-session tracking)\n\nInclude phases, verification steps, delegation guide, and review strategy. Follow the existing plan format used in other `.lore/plans/` files."
dependencies: []
linked_artifacts:
  - .lore/plans/infrastructure/memory-single-file-redesign.md

activity_timeline:
  - timestamp: 2026-03-18T06:03:32.696Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T06:03:32.697Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-18T06:03:32.738Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-18T06:04:22.598Z
    event: progress_report
    reason: "Read the spec (27 REQs), current implementation (3 files), and existing plan conventions. Now gathering test surface and dependency information before drafting."
  - timestamp: 2026-03-18T06:05:06.576Z
    event: progress_report
    reason: "Completed full dependency analysis. Mapped all call sites for triggerCompaction (sdk-runner.ts, meeting/orchestrator.ts, app.ts), loadMemories, needsCompaction, memoryScopeDir, and the base-toolbox tools. Drafting the phased plan now."
  - timestamp: 2026-03-18T06:11:18.258Z
    event: result_submitted
    reason: "Created implementation plan at `.lore/plans/infrastructure/memory-single-file-redesign.md`.\n\nFive phases covering all 27 REQs from the spec:\n- **Phase 1:** Section parser (REQ-MEM-2, 5, 6) - pure utility, no dependencies\n- **Phase 2:** `edit_memory` and `read_memory` rewrite (REQ-MEM-1, 3, 7-15, 22, 27) - tools, mutex, read-before-write guard, `write_memory` deprecation alias\n- **Phase 3:** Injection rewrite (REQ-MEM-16-19, 26) - `loadMemories` reads single files, `needsCompaction` removed from return type, type propagation across 7 consumer files, `MEMORY_GUIDANCE` update\n- **Phase 4:** Migration (REQ-MEM-4, 23-25) - auto-migrate legacy directories on first read, `MEMORY.md` excluded from sections\n- **Phase 5:** Compaction removal (REQ-MEM-20-21) - delete `memory-compaction.ts`, clean stale references\n\nIncludes delegation guide (single-agent for Phases 1-2, sequential phases), review strategy (4 review points plus final spec-reviewer pass), risk assessment, and complete files-modified table (20 files: 3 new, 2 deleted, 15 modified).\n\nRan plan-reviewer agent. Three findings addressed: REQ-MEM-4 coverage added to Phase 4, budget test strengthened to assert no section truncation, atomic write mechanism made explicit in Step 2.4."
  - timestamp: 2026-03-18T06:11:23.679Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Completed full dependency analysis. Mapped all call sites for triggerCompaction (sdk-runner.ts, meeting/orchestrator.ts, app.ts), loadMemories, needsCompaction, memoryScopeDir, and the base-toolbox tools. Drafting the phased plan now."
projectName: guild-hall
---
Created implementation plan at `.lore/plans/infrastructure/memory-single-file-redesign.md`.

Five phases covering all 27 REQs from the spec:
- **Phase 1:** Section parser (REQ-MEM-2, 5, 6) - pure utility, no dependencies
- **Phase 2:** `edit_memory` and `read_memory` rewrite (REQ-MEM-1, 3, 7-15, 22, 27) - tools, mutex, read-before-write guard, `write_memory` deprecation alias
- **Phase 3:** Injection rewrite (REQ-MEM-16-19, 26) - `loadMemories` reads single files, `needsCompaction` removed from return type, type propagation across 7 consumer files, `MEMORY_GUIDANCE` update
- **Phase 4:** Migration (REQ-MEM-4, 23-25) - auto-migrate legacy directories on first read, `MEMORY.md` excluded from sections
- **Phase 5:** Compaction removal (REQ-MEM-20-21) - delete `memory-compaction.ts`, clean stale references

Includes delegation guide (single-agent for Phases 1-2, sequential phases), review strategy (4 review points plus final spec-reviewer pass), risk assessment, and complete files-modified table (20 files: 3 new, 2 deleted, 15 modified).

Ran plan-reviewer agent. Three findings addressed: REQ-MEM-4 coverage added to Phase 4, budget test strengthened to assert no section truncation, atomic write mechanism made explicit in Step 2.4.
