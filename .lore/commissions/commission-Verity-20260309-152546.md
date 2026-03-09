---
title: "Commission: Research: AI agent memory systems"
date: 2026-03-09
status: dispatched
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research how multi-agent AI systems handle memory. The goal is to inform a redesign of Guild Hall's memory tools, which currently go unused because they're not useful enough.\n\nQuestions to answer:\n\n1. **What memory patterns exist in multi-agent systems?** Look at frameworks like CrewAI, AutoGen, LangGraph, MetaGPT, and others. How do they handle shared vs private memory? Short-term vs long-term? Per-agent vs cross-agent?\n\n2. **What scoping models work?** Is memory best scoped per-worker, per-project, cross-project, or all of the above? What are the trade-offs? When does shared memory help vs create noise?\n\n3. **What storage and retrieval patterns are effective?** Flat files vs vector stores vs structured knowledge graphs? How do agents decide what to remember and what to forget? Is explicit \"remember this\" better than automatic extraction?\n\n4. **What does Claude Code itself do?** Look at how CLAUDE.md, auto-memory, and the memory directory work. What's effective about that pattern and what's missing for multi-agent use?\n\n5. **What fails?** Common pitfalls in agent memory: context pollution, stale memories, memory bloat, retrieval noise. What causes memory systems to go unused (like ours)?\n\n6. **What's the minimum viable memory system?** If you had to pick one pattern that delivers the most value with the least complexity, what would it be?\n\nOutput a research document to `.lore/research/agent-memory-systems.md` with findings organized by these questions. Include links to sources. Focus on practical patterns over theoretical frameworks."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-09T22:25:46.028Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T22:25:46.029Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
