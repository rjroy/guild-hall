---
title: "Commission: Memory redesign: Phases 1-2 (parser + tool rewrite)"
date: 2026-03-18
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phases 1 and 2 from `.lore/plans/infrastructure/memory-single-file-redesign.md`.\n\n**Phase 1:** Create `daemon/services/memory-sections.ts` with `parseMemorySections` and `renderMemorySections`. Write tests at `tests/daemon/services/memory-sections.test.ts`. Pure string manipulation, round-trip fidelity required.\n\n**Phase 2:** Rewrite `read_memory` and add `edit_memory` in `base-toolbox.ts`. This includes:\n- `memoryScopeFile` helper for single-file paths (REQ-MEM-1)\n- Per-scope mutex (REQ-MEM-22)\n- `read_memory` rewrite: remove `path` param, add optional `section`, track `readScopes` per toolbox (REQ-MEM-13-15, REQ-MEM-27)\n- `edit_memory` with upsert/append/delete operations (REQ-MEM-7-12)\n- Read-before-write guard: reject `edit_memory` if `read_memory` not called for that scope (REQ-MEM-27)\n- `write_memory` deprecation alias (spec decision 6)\n- Atomic writes via temp-file-then-rename\n- Budget warning when file exceeds 16k (REQ-MEM-11)\n- Full test coverage per Step 2.6\n\nRead the plan carefully for all test cases. The spec is at `.lore/specs/infrastructure/memory-single-file-redesign.md`.\n\nRun typecheck, lint, and `bun test` before submitting."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T13:32:48.084Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T13:32:48.086Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
