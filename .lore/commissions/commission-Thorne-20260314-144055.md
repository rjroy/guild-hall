---
title: "Commission: Research triage: agent-memory-systems"
date: 2026-03-14
status: completed
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Triage the research document `.lore/research/agent-memory-systems.md` against the current state of the Guild Hall codebase and its specs.\n\nAnswer three questions:\n\n1. **Was this research used?** Look at the current implementation. Did concepts, patterns, or decisions from this research make it into the codebase? Cite specific files or patterns if so.\n\n2. **Is there still something to learn from it?** Does the research contain insights, patterns, or recommendations that haven't been applied yet but could be valuable going forward?\n\n3. **Is the research invalid given our current direction?** Compare the research's assumptions and recommendations against the specs in `.lore/specs/` and the current implementation. Did we deliberately go a different direction? A research item that's simply \"not yet implemented\" is different from one where we chose the opposite approach.\n\nBased on your answers, classify this research as exactly one of:\n- **FUTURE** — Not yet used, but still relevant and valuable for upcoming work.\n- **PRESENT** — Actively informing current implementation or decisions.\n- **PAST** — No longer of benefit. We either absorbed what we needed or went a different direction.\n\nWrite your classification and reasoning as a note on this commission. Be specific and cite evidence."
dependencies: []
linked_artifacts:
  - .lore/research/agent-memory-systems.md

activity_timeline:
  - timestamp: 2026-03-14T21:40:55.191Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-14T21:43:16.026Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-14T21:43:16.059Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-14T21:43:25.370Z
    event: progress_report
    reason: "Reading the research document and gathering implementation context."
  - timestamp: 2026-03-14T21:43:45.718Z
    event: progress_report
    reason: "Read core memory implementation files. Now checking briefing system and how memory is wired into session activation."
  - timestamp: 2026-03-14T21:44:24.386Z
    event: progress_report
    reason: "Analysis complete. Writing classification and findings."
  - timestamp: 2026-03-14T21:45:05.821Z
    event: result_submitted
    reason: "## Classification: PRESENT\n\nThe research is actively informing current implementation decisions. Significant portions have been absorbed into the codebase, and the remaining recommendations are consistent with the project's direction.\n\n---\n\n### 1. Was this research used?\n\nYes. The research's core recommendations map directly to what was built.\n\n**Three-scope memory model.** The research analyzes scoping models across five frameworks and concludes that per-project, per-worker, and global scopes are the right decomposition (Section 2). Guild Hall implements exactly this: `memoryScopeDir()` in `daemon/services/memory-injector.ts:154-168` resolves `global`, `project`, and `worker` scopes under `~/.guild-hall/memory/`. The research's assessment that \"per-project is the highest-value scope\" and that \"global memory is the most dangerous scope\" (Section 2, Synthesis) is reflected in the budget allocation order in `loadMemories()` (memory-injector.ts:226-237), where global is processed first and gets whatever budget it needs, but project and worker scopes consume the remainder. This means global can't crowd out project/worker memory.\n\n**Flat files over vector stores.** The research explicitly recommends skipping vector stores, knowledge graphs, and LLM-based automatic extraction (Section 6, \"What to Skip\"), arguing that \"the corpus is too small\" and \"keyword search or full-text injection is sufficient.\" Guild Hall follows this exactly: memory is plain markdown files, read via `readMemoryDir()` (memory-injector.ts:59-87), sorted by mtime, and injected whole into the system prompt.\n\n**Inject-at-activation retrieval.** The research identifies three retrieval patterns (Section 3) and recommends \"inject everything at session start\" for Guild Hall's scale. This is what `prepareSdkSession()` does in `daemon/lib/agent-sdk/sdk-runner.ts:385-396`: it calls `loadMemories()` during session preparation and includes the resulting `memoryBlock` in the system prompt.\n\n**Memory compaction as consolidation mechanism.** The research discusses CrewAI's automatic consolidation (cosine similarity >= 0.85 triggers LLM merge decisions) and Mem0's dynamic forgetting. Guild Hall's `memory-compaction.ts` implements a simpler version of the same idea: when the memory budget is exceeded, an SDK session summarizes all files into `_compacted.md` and removes the originals. This is fire-and-forget (`triggerCompaction` in memory-compaction.ts:224-242), triggered when `needsCompaction` is true after `loadMemories()`.\n\n**The `read_memory`/`write_memory` tool design.** The research notes Claude Code's `auto-memory` as the most effective pattern (Section 4) and identifies that explicit `read_memory`/`write_memory` tools are \"escape hatches, not the primary mechanism\" (Section 6). Guild Hall ships both tools in `base-toolbox.ts:149-183` as part of every worker's toolbox, matching the research's recommendation to keep them available but not rely on spontaneous use.\n\n**Memory guidance text.** The `MEMORY_GUIDANCE` constant in `memory-injector.ts:21-31` closely mirrors Claude Code's auto-memory guidance pattern described in the research (Section 4): it tells workers what to save, what to skip, and what scopes exist.\n\n---\n\n### 2. Is there still something to learn from it?\n\nYes. Two concrete recommendations from the research have not been implemented.\n\n**Commission outcomes as automatic memory writes (Section 6, Component 2).** The research's central \"minimum viable\" recommendation is that `submit_result` should automatically extract key findings into project memory. Currently, `makeSubmitResultHandler()` in `daemon/services/commission/toolbox.ts:122-136` writes to the commission artifact and fires the `onResult` callback, but nothing feeds commission outcomes into the memory system. The research argues this eliminates the \"no natural trigger to write\" failure mode and gives subsequent commissions automatic context about what other workers have already done. This is the single highest-value unimplemented recommendation.\n\n**Briefing enrichment from commission outcomes (Section 6, Component 1).** The research notes that the existing briefing system should be enhanced to incorporate commission outcomes, not just codebase state. Currently, `briefing-generator.ts` counts commissions by status but doesn't surface their findings or decisions. The research suggests this would make the briefing function as \"readable memory\" that gives every worker a richer shared starting context.\n\nBoth recommendations are consistent with the current architecture and would be incremental additions, not redesigns.\n\n---\n\n### 3. Is the research invalid given our current direction?\n\nNo. The research's assumptions and recommendations are aligned with Guild Hall's actual direction.\n\n- The research assumes flat files over databases. Guild Hall uses flat files.\n- The research assumes three scopes (global, project, worker). Guild Hall implements three scopes.\n- The research assumes inject-at-activation over on-demand retrieval. Guild Hall injects at activation.\n- The research recommends against real-time cross-agent memory sharing, noting workers run independently on bounded commissions. This matches Guild Hall's commission model exactly.\n- The research recommends deferring per-worker learning until workers accumulate genuine expertise. Guild Hall has the tool available but doesn't force its use, matching this.\n\nNo spec or design decision contradicts the research. The daemon application boundary spec (`.lore/specs/infrastructure/daemon-application-boundary.md`) would be the natural home for a requirement that commission completion triggers memory extraction, and it doesn't currently address this, leaving room for the research's recommendation.\n\n---\n\n### Summary\n\nThe research has been substantially absorbed. The scoping model, storage approach, retrieval pattern, compaction mechanism, and tool design all reflect its recommendations. The two unimplemented recommendations (automatic commission outcome extraction and briefing enrichment) remain viable and valuable for future work. Nothing in the research conflicts with the project's chosen direction."
  - timestamp: 2026-03-14T21:45:10.751Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Analysis complete. Writing classification and findings."
projectName: guild-hall
---
## Classification: PRESENT

The research is actively informing current implementation decisions. Significant portions have been absorbed into the codebase, and the remaining recommendations are consistent with the project's direction.

---

### 1. Was this research used?

Yes. The research's core recommendations map directly to what was built.

**Three-scope memory model.** The research analyzes scoping models across five frameworks and concludes that per-project, per-worker, and global scopes are the right decomposition (Section 2). Guild Hall implements exactly this: `memoryScopeDir()` in `daemon/services/memory-injector.ts:154-168` resolves `global`, `project`, and `worker` scopes under `~/.guild-hall/memory/`. The research's assessment that "per-project is the highest-value scope" and that "global memory is the most dangerous scope" (Section 2, Synthesis) is reflected in the budget allocation order in `loadMemories()` (memory-injector.ts:226-237), where global is processed first and gets whatever budget it needs, but project and worker scopes consume the remainder. This means global can't crowd out project/worker memory.

**Flat files over vector stores.** The research explicitly recommends skipping vector stores, knowledge graphs, and LLM-based automatic extraction (Section 6, "What to Skip"), arguing that "the corpus is too small" and "keyword search or full-text injection is sufficient." Guild Hall follows this exactly: memory is plain markdown files, read via `readMemoryDir()` (memory-injector.ts:59-87), sorted by mtime, and injected whole into the system prompt.

**Inject-at-activation retrieval.** The research identifies three retrieval patterns (Section 3) and recommends "inject everything at session start" for Guild Hall's scale. This is what `prepareSdkSession()` does in `daemon/lib/agent-sdk/sdk-runner.ts:385-396`: it calls `loadMemories()` during session preparation and includes the resulting `memoryBlock` in the system prompt.

**Memory compaction as consolidation mechanism.** The research discusses CrewAI's automatic consolidation (cosine similarity >= 0.85 triggers LLM merge decisions) and Mem0's dynamic forgetting. Guild Hall's `memory-compaction.ts` implements a simpler version of the same idea: when the memory budget is exceeded, an SDK session summarizes all files into `_compacted.md` and removes the originals. This is fire-and-forget (`triggerCompaction` in memory-compaction.ts:224-242), triggered when `needsCompaction` is true after `loadMemories()`.

**The `read_memory`/`write_memory` tool design.** The research notes Claude Code's `auto-memory` as the most effective pattern (Section 4) and identifies that explicit `read_memory`/`write_memory` tools are "escape hatches, not the primary mechanism" (Section 6). Guild Hall ships both tools in `base-toolbox.ts:149-183` as part of every worker's toolbox, matching the research's recommendation to keep them available but not rely on spontaneous use.

**Memory guidance text.** The `MEMORY_GUIDANCE` constant in `memory-injector.ts:21-31` closely mirrors Claude Code's auto-memory guidance pattern described in the research (Section 4): it tells workers what to save, what to skip, and what scopes exist.

---

### 2. Is there still something to learn from it?

Yes. Two concrete recommendations from the research have not been implemented.

**Commission outcomes as automatic memory writes (Section 6, Component 2).** The research's central "minimum viable" recommendation is that `submit_result` should automatically extract key findings into project memory. Currently, `makeSubmitResultHandler()` in `daemon/services/commission/toolbox.ts:122-136` writes to the commission artifact and fires the `onResult` callback, but nothing feeds commission outcomes into the memory system. The research argues this eliminates the "no natural trigger to write" failure mode and gives subsequent commissions automatic context about what other workers have already done. This is the single highest-value unimplemented recommendation.

**Briefing enrichment from commission outcomes (Section 6, Component 1).** The research notes that the existing briefing system should be enhanced to incorporate commission outcomes, not just codebase state. Currently, `briefing-generator.ts` counts commissions by status but doesn't surface their findings or decisions. The research suggests this would make the briefing function as "readable memory" that gives every worker a richer shared starting context.

Both recommendations are consistent with the current architecture and would be incremental additions, not redesigns.

---

### 3. Is the research invalid given our current direction?

No. The research's assumptions and recommendations are aligned with Guild Hall's actual direction.

- The research assumes flat files over databases. Guild Hall uses flat files.
- The research assumes three scopes (global, project, worker). Guild Hall implements three scopes.
- The research assumes inject-at-activation over on-demand retrieval. Guild Hall injects at activation.
- The research recommends against real-time cross-agent memory sharing, noting workers run independently on bounded commissions. This matches Guild Hall's commission model exactly.
- The research recommends deferring per-worker learning until workers accumulate genuine expertise. Guild Hall has the tool available but doesn't force its use, matching this.

No spec or design decision contradicts the research. The daemon application boundary spec (`.lore/specs/infrastructure/daemon-application-boundary.md`) would be the natural home for a requirement that commission completion triggers memory extraction, and it doesn't currently address this, leaving room for the research's recommendation.

---

### Summary

The research has been substantially absorbed. The scoping model, storage approach, retrieval pattern, compaction mechanism, and tool design all reflect its recommendations. The two unimplemented recommendations (automatic commission outcome extraction and briefing enrichment) remain viable and valuable for future work. Nothing in the research conflicts with the project's chosen direction.
