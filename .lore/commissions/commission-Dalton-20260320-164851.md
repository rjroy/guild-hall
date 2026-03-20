---
title: "Commission: Fix: Add memory budget visibility to read_memory tool"
date: 2026-03-20
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Implementation Task\n\nSmall fix from `.lore/issues/memory-budget-visibility.md`.\n\nWorkers have no visibility into how much of the 16,000-character memory budget they've used. Add a `budget_remaining` indicator to the `read_memory` tool response.\n\n### What to do\n\n1. In `daemon/services/base-toolbox.ts`, find the `read_memory` tool handler (`makeReadMemoryHandler`).\n2. After reading the memory content, calculate the current size vs. `DEFAULT_MEMORY_LIMIT` (already defined in the same file).\n3. Append a budget summary to the tool's response text. Something like:\n   ```\n   [Memory budget: 3,421 / 16,000 characters used (12,579 remaining)]\n   ```\n4. Write tests for the new behavior in the appropriate test file.\n5. Run `bun test` to confirm everything passes.\n\nThis is a small, self-contained change. The memory injector and base toolbox already have all the data needed."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-20T23:48:51.932Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T23:48:51.933Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
