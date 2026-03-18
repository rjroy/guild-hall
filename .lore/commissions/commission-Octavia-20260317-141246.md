---
title: "Commission: Brainstorm: Commission outcomes to project memory"
date: 2026-03-17
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Expand on Proposal 1 from `.lore/brainstorm/whats-next-2026-03-17.md` — \"Commission Outcomes to Project Memory.\"\n\nThe user has open questions about direction and wants exploration, not implementation. Produce a brainstorm artifact that covers:\n\n1. **What gets extracted?** The `submit_result` summary is free-form text. What structure should the memory entry have? What's useful vs. noise for future workers?\n2. **Memory lifecycle.** These files accumulate. How do they age out? The memory compaction system exists but is session-scoped. Should commission outcome memories have a TTL? Should older ones be compacted into a summary?\n3. **Briefing interaction.** The briefing generator already scans `.lore/`. If outcomes are also in memory, workers get the same information twice through different paths. How should these interact? Should the briefing reference memory entries instead of scanning artifacts directly?\n4. **Failure cases.** What about partial completions (`save_commission`)? Cancelled commissions? Should those write memory entries with different signals?\n5. **Privacy/scope.** Should outcomes be visible to all workers or scoped somehow? The current memory system has global/project/worker scopes.\n\nRead the relevant source files: `daemon/services/commission/orchestrator.ts` (handleSessionCompletion, submit_result), `daemon/services/memory-injector.ts`, `daemon/services/briefing-generator.ts`, and `.lore/research/agent-memory-systems.md`. Ground the brainstorm in what actually exists."
dependencies: []
linked_artifacts:
  - .lore/brainstorm/commission-outcomes-to-memory.md

activity_timeline:
  - timestamp: 2026-03-17T21:12:46.587Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-17T21:12:46.588Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-17T21:12:46.628Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-17T21:12:54.485Z
    event: progress_report
    reason: "Reading source files: orchestrator.ts, memory-injector.ts, briefing-generator.ts, agent-memory-systems research, and the whats-next brainstorm."
  - timestamp: 2026-03-17T21:13:36.659Z
    event: progress_report
    reason: "All source files read. Now drafting the brainstorm artifact grounded in what exists: orchestrator completion flow, memory injector, briefing generator, memory compaction, and the agent-memory-systems research."
  - timestamp: 2026-03-17T21:16:36.578Z
    event: result_submitted
    reason: "Produced brainstorm artifact at `.lore/brainstorm/commission-outcomes-to-memory.md` exploring five open questions about auto-writing commission outcomes to project memory.\n\nKey leanings per question:\n1. **What gets extracted:** Mechanical extraction (Option A), no LLM call. Short entry with worker name, date, distilled result, artifact paths. Keep it concise to limit contamination risk.\n2. **Memory lifecycle:** No TTL. Let existing compaction handle it. Commission outcomes are just memory files with the same budget/compaction treatment as everything else.\n3. **Briefing interaction:** No change to briefing. Briefing scans artifacts for full project state (including pending/active). Memory entries serve other workers, not the briefing. Duplication in Guild Master context is harmless.\n4. **Failure cases:** Write entries for halted commissions (with clear \"halted\" signal) and domain-relevant failures. Skip cancelled and infrastructure failures. No entry for sleeping commissions.\n5. **Privacy/scope:** Project scope only. No cross-project, no worker-private entries from this feature. Existing write_memory tool covers worker scope if needed.\n\nSix open questions flagged for user decision before spec work begins."
  - timestamp: 2026-03-17T21:17:13.126Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All source files read. Now drafting the brainstorm artifact grounded in what exists: orchestrator completion flow, memory injector, briefing generator, memory compaction, and the agent-memory-systems research."
projectName: guild-hall
---
Produced brainstorm artifact at `.lore/brainstorm/commission-outcomes-to-memory.md` exploring five open questions about auto-writing commission outcomes to project memory.

Key leanings per question:
1. **What gets extracted:** Mechanical extraction (Option A), no LLM call. Short entry with worker name, date, distilled result, artifact paths. Keep it concise to limit contamination risk.
2. **Memory lifecycle:** No TTL. Let existing compaction handle it. Commission outcomes are just memory files with the same budget/compaction treatment as everything else.
3. **Briefing interaction:** No change to briefing. Briefing scans artifacts for full project state (including pending/active). Memory entries serve other workers, not the briefing. Duplication in Guild Master context is harmless.
4. **Failure cases:** Write entries for halted commissions (with clear "halted" signal) and domain-relevant failures. Skip cancelled and infrastructure failures. No entry for sleeping commissions.
5. **Privacy/scope:** Project scope only. No cross-project, no worker-private entries from this feature. Existing write_memory tool covers worker scope if needed.

Six open questions flagged for user decision before spec work begins.
