---
title: "Commission: Fix: Add memory budget visibility to read_memory tool"
date: 2026-03-20
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Implementation Task\n\nSmall fix from `.lore/issues/memory-budget-visibility.md`.\n\nWorkers have no visibility into how much of the 16,000-character memory budget they've used. Add a `budget_remaining` indicator to the `read_memory` tool response.\n\n### What to do\n\n1. In `daemon/services/base-toolbox.ts`, find the `read_memory` tool handler (`makeReadMemoryHandler`).\n2. After reading the memory content, calculate the current size vs. `DEFAULT_MEMORY_LIMIT` (already defined in the same file).\n3. Append a budget summary to the tool's response text. Something like:\n   ```\n   [Memory budget: 3,421 / 16,000 characters used (12,579 remaining)]\n   ```\n4. Write tests for the new behavior in the appropriate test file.\n5. Run `bun test` to confirm everything passes.\n\nThis is a small, self-contained change. The memory injector and base toolbox already have all the data needed."
dependencies: []
linked_artifacts:
  - daemon/services/base-toolbox.ts

  - tests/daemon/base-toolbox.test.ts
  - tests/daemon/memory-access-control.test.ts
  - tests/lib/workspace-scoping.test.ts
  - tests/daemon/base-toolbox.test.ts
  - tests/daemon/memory-access-control.test.ts
  - tests/lib/workspace-scoping.test.ts
activity_timeline:
  - timestamp: 2026-03-20T23:48:51.932Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T23:48:51.933Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-20T23:48:51.980Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-20T23:49:01.967Z
    event: progress_report
    reason: "Reading base-toolbox.ts to understand the read_memory handler."
  - timestamp: 2026-03-20T23:53:44.037Z
    event: progress_report
    reason: "Implementation complete. 4 files changed, all tests pass (3,197/3,197). Pre-commit hook fails due to sandbox restrictions (EROFS on /tmp, EPERM on Unix sockets) — these are environment issues unrelated to the change. Commit is staged and ready."
  - timestamp: 2026-03-20T23:53:59.038Z
    event: result_submitted
    reason: "Added memory budget indicator to `read_memory` tool response. Workers now see `[Memory budget: X / 16,000 characters used (Y remaining)]` after every read — empty, full file, and section reads.\n\n**Files changed:**\n- `daemon/services/base-toolbox.ts` — Calculate budget from content length vs `DEFAULT_MEMORY_LIMIT`, append to all non-error responses\n- `tests/daemon/base-toolbox.test.ts` — 3 new tests (full file budget, section budget, empty memory budget) + fixed exact match assertion\n- `tests/daemon/memory-access-control.test.ts` — Fixed exact match assertion (`toBe` → `toContain`)\n- `tests/lib/workspace-scoping.test.ts` — Fixed 2 exact match assertions (`toBe` → `toContain`)\n\n**Verification:** 3,197 tests pass, 0 failures. Typecheck clean. Commit staged but hook blocked by sandbox (EROFS/EPERM on /tmp — pre-existing environment restriction, not related to this change)."
  - timestamp: 2026-03-20T23:54:09.149Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Implementation complete. 4 files changed, all tests pass (3,197/3,197). Pre-commit hook fails due to sandbox restrictions (EROFS on /tmp, EPERM on Unix sockets) — these are environment issues unrelated to the change. Commit is staged and ready."
projectName: guild-hall
---
Added memory budget indicator to `read_memory` tool response. Workers now see `[Memory budget: X / 16,000 characters used (Y remaining)]` after every read — empty, full file, and section reads.

**Files changed:**
- `daemon/services/base-toolbox.ts` — Calculate budget from content length vs `DEFAULT_MEMORY_LIMIT`, append to all non-error responses
- `tests/daemon/base-toolbox.test.ts` — 3 new tests (full file budget, section budget, empty memory budget) + fixed exact match assertion
- `tests/daemon/memory-access-control.test.ts` — Fixed exact match assertion (`toBe` → `toContain`)
- `tests/lib/workspace-scoping.test.ts` — Fixed 2 exact match assertions (`toBe` → `toContain`)

**Verification:** 3,197 tests pass, 0 failures. Typecheck clean. Commit staged but hook blocked by sandbox (EROFS/EPERM on /tmp — pre-existing environment restriction, not related to this change).
