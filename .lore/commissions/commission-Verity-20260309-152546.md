---
title: "Commission: Research: AI agent memory systems"
date: 2026-03-09
status: completed
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research how multi-agent AI systems handle memory. The goal is to inform a redesign of Guild Hall's memory tools, which currently go unused because they're not useful enough.\n\nQuestions to answer:\n\n1. **What memory patterns exist in multi-agent systems?** Look at frameworks like CrewAI, AutoGen, LangGraph, MetaGPT, and others. How do they handle shared vs private memory? Short-term vs long-term? Per-agent vs cross-agent?\n\n2. **What scoping models work?** Is memory best scoped per-worker, per-project, cross-project, or all of the above? What are the trade-offs? When does shared memory help vs create noise?\n\n3. **What storage and retrieval patterns are effective?** Flat files vs vector stores vs structured knowledge graphs? How do agents decide what to remember and what to forget? Is explicit \"remember this\" better than automatic extraction?\n\n4. **What does Claude Code itself do?** Look at how CLAUDE.md, auto-memory, and the memory directory work. What's effective about that pattern and what's missing for multi-agent use?\n\n5. **What fails?** Common pitfalls in agent memory: context pollution, stale memories, memory bloat, retrieval noise. What causes memory systems to go unused (like ours)?\n\n6. **What's the minimum viable memory system?** If you had to pick one pattern that delivers the most value with the least complexity, what would it be?\n\nOutput a research document to `.lore/research/agent-memory-systems.md` with findings organized by these questions. Include links to sources. Focus on practical patterns over theoretical frameworks."
dependencies: []
linked_artifacts:
  - .lore/research/agent-memory-systems.md

activity_timeline:
  - timestamp: 2026-03-09T22:25:46.028Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T22:25:46.029Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-09T22:25:46.090Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-09T22:26:00.200Z
    event: progress_report
    reason: "Starting research on multi-agent memory systems. First step: check existing research and understand Guild Hall's current memory tools before looking externally."
  - timestamp: 2026-03-09T22:26:56.435Z
    event: progress_report
    reason: "Guild Hall's current memory design understood (3 scopes: global/project/worker, plain files, MCP tools, all empty/unused). Now researching external frameworks in parallel: CrewAI, AutoGen, LangGraph, MetaGPT, and Claude Code's own memory patterns."
  - timestamp: 2026-03-09T22:28:57.006Z
    event: progress_report
    reason: "All external research complete. Covered: CrewAI (unified memory, hierarchical scopes, composite scoring), LangGraph (checkpointing, namespace stores, short/long-term split), AutoGen (teachability, memo-based vector DB), MetaGPT (global message pool, role-based subscriptions), Mem0 (graph memory, intelligent filtering, consolidation), Claude Code (CLAUDE.md + auto-memory + subagent persistent memory), failure modes (context pollution, bloat, stale memory, contradiction), and the Intrinsic Memory Agents paper. Now synthesizing into the research document."
  - timestamp: 2026-03-09T22:32:13.840Z
    event: result_submitted
    reason: "Research document complete at `.lore/research/agent-memory-systems.md`. Covers six questions:\n\n1. **Memory patterns**: Six distinct patterns documented across CrewAI (unified memory with hierarchical scopes), LangGraph (checkpointed state with namespace stores), MetaGPT (global message pool with role-based subscriptions), AutoGen (teachability memos), Mem0 (triple-backend universal layer), and the Intrinsic Memory Agents paper (heterogeneous per-agent structured memory).\n\n2. **Scoping models**: Per-project is the highest-value scope. Per-agent adds value only when roles accumulate expertise across many invocations. Global memory is highest-risk for stale context.\n\n3. **Storage and retrieval**: At Guild Hall's scale, flat files beat vector stores. The key question isn't storage format but what triggers memory writes and how memories reach context at the right time. Composite scoring (semantic similarity + recency + importance) is the proven retrieval pattern, but injection at session start works when the corpus is small.\n\n4. **Claude Code**: Three systems (CLAUDE.md, auto-memory, session memory) plus new subagent persistent memory. CLAUDE.md is the most effective pattern in the landscape: human-curated, version-controlled, explicitly loaded. Missing for multi-agent: no cross-agent sharing, no write coordination, no structured handoff.\n\n5. **Failure modes**: Five documented (context pollution, bloat, stale memories, cross-agent contamination, economic unsustainability) plus a diagnosis of why Guild Hall's memory goes unused: no natural write trigger, no immediate read benefit, tools too generic, no curation.\n\n6. **Minimum viable system**: Project-scoped curated memory + automatic capture from commission outcomes. When `submit_result` fires, extract and index findings. When workers activate, inject recent project outcomes into context. Memory writes become a byproduct of existing work, not a separate action."
  - timestamp: 2026-03-09T22:32:19.243Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All external research complete. Covered: CrewAI (unified memory, hierarchical scopes, composite scoring), LangGraph (checkpointing, namespace stores, short/long-term split), AutoGen (teachability, memo-based vector DB), MetaGPT (global message pool, role-based subscriptions), Mem0 (graph memory, intelligent filtering, consolidation), Claude Code (CLAUDE.md + auto-memory + subagent persistent memory), failure modes (context pollution, bloat, stale memory, contradiction), and the Intrinsic Memory Agents paper. Now synthesizing into the research document."
projectName: guild-hall
---
Research document complete at `.lore/research/agent-memory-systems.md`. Covers six questions:

1. **Memory patterns**: Six distinct patterns documented across CrewAI (unified memory with hierarchical scopes), LangGraph (checkpointed state with namespace stores), MetaGPT (global message pool with role-based subscriptions), AutoGen (teachability memos), Mem0 (triple-backend universal layer), and the Intrinsic Memory Agents paper (heterogeneous per-agent structured memory).

2. **Scoping models**: Per-project is the highest-value scope. Per-agent adds value only when roles accumulate expertise across many invocations. Global memory is highest-risk for stale context.

3. **Storage and retrieval**: At Guild Hall's scale, flat files beat vector stores. The key question isn't storage format but what triggers memory writes and how memories reach context at the right time. Composite scoring (semantic similarity + recency + importance) is the proven retrieval pattern, but injection at session start works when the corpus is small.

4. **Claude Code**: Three systems (CLAUDE.md, auto-memory, session memory) plus new subagent persistent memory. CLAUDE.md is the most effective pattern in the landscape: human-curated, version-controlled, explicitly loaded. Missing for multi-agent: no cross-agent sharing, no write coordination, no structured handoff.

5. **Failure modes**: Five documented (context pollution, bloat, stale memories, cross-agent contamination, economic unsustainability) plus a diagnosis of why Guild Hall's memory goes unused: no natural write trigger, no immediate read benefit, tools too generic, no curation.

6. **Minimum viable system**: Project-scoped curated memory + automatic capture from commission outcomes. When `submit_result` fires, extract and index findings. When workers activate, inject recent project outcomes into context. Memory writes become a byproduct of existing work, not a separate action.
