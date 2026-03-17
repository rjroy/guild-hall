---
title: "Commission: Brainstorm: Commission outcomes to project memory"
date: 2026-03-17
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Expand on Proposal 1 from `.lore/brainstorm/whats-next-2026-03-17.md` — \"Commission Outcomes to Project Memory.\"\n\nThe user has open questions about direction and wants exploration, not implementation. Produce a brainstorm artifact that covers:\n\n1. **What gets extracted?** The `submit_result` summary is free-form text. What structure should the memory entry have? What's useful vs. noise for future workers?\n2. **Memory lifecycle.** These files accumulate. How do they age out? The memory compaction system exists but is session-scoped. Should commission outcome memories have a TTL? Should older ones be compacted into a summary?\n3. **Briefing interaction.** The briefing generator already scans `.lore/`. If outcomes are also in memory, workers get the same information twice through different paths. How should these interact? Should the briefing reference memory entries instead of scanning artifacts directly?\n4. **Failure cases.** What about partial completions (`save_commission`)? Cancelled commissions? Should those write memory entries with different signals?\n5. **Privacy/scope.** Should outcomes be visible to all workers or scoped somehow? The current memory system has global/project/worker scopes.\n\nRead the relevant source files: `daemon/services/commission/orchestrator.ts` (handleSessionCompletion, submit_result), `daemon/services/memory-injector.ts`, `daemon/services/briefing-generator.ts`, and `.lore/research/agent-memory-systems.md`. Ground the brainstorm in what actually exists."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-17T21:12:46.587Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-17T21:12:46.588Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
