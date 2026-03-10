---
title: Multi-Agent Memory Systems
date: 2026-03-09
status: open
tags: [memory, multi-agent, research, architecture]
---

# Multi-Agent Memory Systems

Research into how multi-agent AI systems handle memory, focused on practical patterns that could inform a redesign of Guild Hall's memory tools.

## 1. Memory Patterns in Multi-Agent Systems

Five frameworks examined: CrewAI, AutoGen, LangGraph, MetaGPT, and Mem0. Each takes a meaningfully different approach. The patterns cluster into three models.

### The Unified Memory Model (CrewAI)

CrewAI replaced separate short-term, long-term, entity, and external memory types with a single `Memory` class. An LLM analyzes content when saving, inferring scope, categories, and importance. Retrieval uses composite scoring that blends semantic similarity, recency, and importance.

Key features:
- **Hierarchical scopes** that grow organically (e.g., `/project/alpha/decisions`, `/agent/researcher/findings`). No upfront schema required.
- **Automatic consolidation**: when a new memory is similar to an existing one (cosine similarity >= 0.85), the LLM decides whether to merge, update, or keep both.
- **Memory slices**: read-only views across multiple disjoint scopes. An agent can see its own scope plus shared project knowledge without write access to shared areas.

Storage: ChromaDB (vector, for short-term/entity) + SQLite (structured, for long-term task results). Recently migrated to LanceDB as default.

Verified against: [CrewAI Memory docs](https://docs.crewai.com/en/concepts/memory), [DeepWiki: Memory Configuration](https://deepwiki.com/crewAIInc/crewAI/7.2-memory-configuration-and-storage)

### The Checkpointed State Model (LangGraph)

LangGraph treats memory as state. Short-term memory is the graph's execution state, persisted via thread-scoped checkpoints. Long-term memory lives in a separate `Store` interface with custom namespaces.

Key features:
- **Short-term memory**: the conversation thread's state, checkpointed after each graph step. Thread-scoped. Enables resume, replay, human-in-the-loop.
- **Long-term memory**: a `BaseStore` with hierarchical namespaces (like folders + filenames). Cross-thread. Supports semantic search.
- **Two write paths**: "hot path" (memory written during agent execution, immediately available, adds latency) and "background" (async, no latency, may miss reads).
- **Psychological taxonomy**: semantic memory (facts, preferences), episodic memory (past experiences, few-shot examples), procedural memory (instructions, rules).

Storage: pluggable backends (SQLite, Redis, Postgres, S3). Namespace-scoped, not agent-scoped by default. The developer designs the scoping model.

Verified against: [LangGraph Memory docs](https://docs.langchain.com/oss/python/langgraph/memory), [LangGraph Persistence guide (Towards AI, Jan 2026)](https://pub.towardsai.net/persistence-in-langgraph-deep-practical-guide-36dc4c452c3b)

### The Publish-Subscribe Model (MetaGPT)

MetaGPT uses a global message pool where agents publish structured outputs and subscribe to message types relevant to their roles. Memory is an emergent property of the message history, not a separate system.

Key features:
- **Global shared environment**: all messages from all agents are visible. No private memory by design.
- **Role-based subscriptions**: agents register interest in specific message types. A "tester" subscribes to code outputs; a "reviewer" subscribes to test results. The system dispatches matching messages automatically.
- **Pull over push**: agents proactively retrieve relevant context from the pool rather than receiving it passively. This reduces context pollution compared to broadcasting everything.

Storage: in-memory (session-scoped). No built-in persistence across sessions.

Verified against: [MetaGPT paper (ICLR 2024)](https://arxiv.org/html/2308.00352v6), [MetaGPT GitHub](https://github.com/FoundationAgents/MetaGPT)

### Additional Patterns

**AutoGen (Teachability)**: agents store user corrections as "memos" in a vector database (Pinecone, Weaviate). Memos are retrieved into context only when semantically relevant. The pattern is optimized for single-agent learning from human feedback, not cross-agent memory sharing. Multi-agent coordination flows through conversation history, not shared state.

Source: [AutoGen Teachability (Analytics Vidhya)](https://www.analyticsvidhya.com/blog/2025/12/autogen-teachable-agent/), [AutoGen memory management (Medium)](https://medium.com/@shmilysyg/memory-management-within-autogen-1-2-1e6303ba5d7a)

**Mem0 (Universal Memory Layer)**: positions itself as infrastructure that any framework can use. Stores each memory across three backends simultaneously: vector store (semantic search), key-value store (fast lookups), and graph database (relational queries). Added graph memory in January 2026 for capturing entity relationships. Implements intelligent filtering with priority scoring, dynamic forgetting of low-relevance entries, and automatic consolidation between short-term and long-term storage.

Source: [Mem0 research paper](https://arxiv.org/abs/2504.19413), [Mem0 graph memory blog](https://mem0.ai/blog/graph-memory-solutions-ai-agents)

**Intrinsic Memory Agents (research, 2025)**: each agent maintains its own structured JSON memory template with role-specific slots (e.g., `domain_expertise`, `current_position`, `proposed_solution`). Memory evolves intrinsically as the agent produces output. Updates synthesize previous memory with current output via prompted LLM operations. The result is heterogeneous memory: each agent remembers different things in different structures, aligned to their role. Achieved 38.6% improvement on PDDL benchmarks with superior token efficiency.

Source: [Intrinsic Memory Agents (arXiv 2508.08997)](https://arxiv.org/abs/2508.08997)

### Pattern Summary

| Pattern | Shared memory | Private memory | Persistence | Complexity |
|---------|--------------|----------------|-------------|------------|
| Unified (CrewAI) | Hierarchical scopes, slices | Scoped views | Vector DB + SQLite | High (LLM in save/recall loop) |
| Checkpointed (LangGraph) | Namespace stores | Thread-scoped state | Pluggable backends | Medium (developer designs scoping) |
| Pub-Sub (MetaGPT) | Global message pool | None by design | In-memory only | Low (messages are memory) |
| Teachability (AutoGen) | Not built-in | Per-agent memo DB | Vector DB | Low (human-to-agent only) |
| Universal Layer (Mem0) | Cross-agent, cross-session | User/agent/session scopes | Vector + KV + Graph | High (triple storage) |
| Intrinsic (research) | None (heterogeneous by design) | Structured JSON per agent | Session-scoped | Medium (LLM-driven updates) |


## 2. Scoping Models

The frameworks reveal four scoping levels, each with distinct trade-offs.

### Per-Agent (Private)

**What it is**: memory visible only to the agent that wrote it. AutoGen memos, CrewAI's scoped views, and the Intrinsic Memory Agents paper all use this pattern.

**When it helps**: accumulated expertise that's specific to a role. A code reviewer's knowledge of common antipatterns. A researcher's methodology notes. Things that would be noise to other agents.

**When it hurts**: when agents need to coordinate. Private memory means duplicated discovery. Agent A learns something Agent B needs, but B can't see it.

**Guild Hall parallel**: worker-scoped memory (`~/.guild-hall/memory/workers/<name>/`).

### Per-Project (Shared within a scope)

**What it is**: memory visible to all agents working on the same project. LangGraph's namespaced stores, CrewAI's crew-level memory, MetaGPT's global message pool.

**When it helps**: shared context about a specific codebase. Architecture decisions, API conventions, known bugs, deployment patterns. This is where most practical value lives: agents working on the same project need to know the same things about that project.

**When it hurts**: when the memory grows large and agents can't find what's relevant. MetaGPT's subscription model addresses this by letting agents filter by message type. CrewAI's composite scoring addresses it by ranking retrieval results.

**Guild Hall parallel**: project-scoped memory (`~/.guild-hall/memory/projects/<name>/`).

### Cross-Project (Global)

**What it is**: memory shared across all contexts. Mem0's user-level memory, CrewAI's root scope.

**When it helps**: user preferences, organizational standards, recurring patterns that apply everywhere. "Always use 2-space indentation" doesn't belong in project memory; it's a user-level preference.

**When it hurts**: most things that feel global are actually context-dependent. Coding standards vary by project. Architectural patterns that work in one codebase are wrong in another. Global memory is high-risk for stale and misleading context.

**Guild Hall parallel**: global memory (`~/.guild-hall/memory/global/`).

### Session-Scoped (Ephemeral)

**What it is**: memory that exists only during a single task execution. LangGraph's thread state, MetaGPT's message pool, standard conversation history.

**When it helps**: working memory for the current task. Intermediate results, current hypotheses, task-specific context. This is what context windows already provide.

**When it hurts**: it doesn't persist. Everything learned is lost when the session ends. This is the default state of most agent systems, and it's fine for many tasks.

**Guild Hall parallel**: conversation context within a commission or meeting session.

### Synthesis

The scoping question has a clear answer from the evidence: **per-project is the highest-value scope**. It's where the most actionable shared knowledge lives and where the cost of rediscovery is highest. Per-agent memory adds value for specialized roles but only when the role accumulates genuine expertise across many invocations. Global memory is the most dangerous scope because it creates the most opportunities for stale context to mislead.

Claude Code's auto-memory confirms this. The memory directory is per-project (scoped to git repo root). It doesn't try to maintain global memory across projects. The subagent persistent memory feature offers user, project, and local scopes, but the docs recommend `user` scope as the default, which is closer to per-role than per-project.


## 3. Storage and Retrieval Patterns

### Storage Approaches

**Flat files (Claude Code, current Guild Hall design)**: plain markdown, human-readable, editable, versionable. Zero infrastructure. Retrieval is linear scan or keyword search. Works when the memory corpus is small (under a few hundred entries). Breaks down when you need semantic similarity or the corpus exceeds what fits in a context window.

**Vector stores (CrewAI, AutoGen, Mem0)**: embeddings enable semantic search. Good for "find memories relevant to X." Requires an embedding model and a vector database. Adds infrastructure complexity. The failure mode is retrieval noise: too many vaguely-similar results diluting the useful ones.

**Structured databases (CrewAI long-term, LangGraph checkpoints)**: SQLite or Postgres for structured data (task results, quality scores, timestamps). Good for exact lookups and time-range queries. Not good for semantic similarity.

**Knowledge graphs (Mem0 graph memory)**: entities as nodes, relationships as edges. "User prefers coffee from Shop X, ordered last Tuesday, mentioned during morning routine discussion." Captures relational structure that vector search misses. Adds significant complexity.

**Hybrid (Mem0)**: vector + key-value + graph simultaneously. Maximum recall flexibility at maximum infrastructure cost.

### What Works for the Scale

Guild Hall's memory corpus will be small. Workers execute bounded commissions, not open-ended conversations. The volume of "things worth remembering" per project is likely in the dozens to low hundreds, not thousands. For this scale:

- Vector stores are overkill. The infrastructure cost exceeds the retrieval benefit.
- Knowledge graphs are overkill for the same reason.
- Flat files work if retrieval is guided.

The relevant question isn't "how do we store memories" but "how do we decide what to remember and how do we get the right memories into context at the right time."

### Remember vs. Forget

Two approaches from the literature:

**Explicit "remember this" (Claude Code, AutoGen Teachability)**: the user or agent explicitly marks something as worth remembering. Low noise because a human (or a prompted LLM) makes the decision. The failure mode is forgetting to remember: important context falls through because nobody explicitly saved it.

**Automatic extraction (CrewAI, Mem0)**: an LLM analyzes all agent output and extracts memories automatically. Higher coverage but higher noise. Requires consolidation to avoid bloat. CrewAI's consolidation threshold (0.85 cosine similarity) and Mem0's dynamic forgetting address this, but both add LLM calls to every save operation.

**The hybrid that works (Claude Code auto-memory)**: Claude decides what's worth remembering based on whether it would be useful in a future session. Not every session produces a memory. Not every correction gets saved. The LLM acts as a filter, not a funnel. This is the lowest-overhead approach that still captures meaningful knowledge.

### Retrieval Patterns

**Inject everything at session start (Claude Code CLAUDE.md)**: all instructions loaded into system prompt. Simple, reliable, no retrieval logic needed. Limited by context window. Works when the total memory fits comfortably.

**Retrieve on demand (CrewAI recall, Mem0 search)**: query the memory store when context is needed. Scales beyond context limits. Requires the agent to know when to look and what to look for.

**Subscribe to relevant types (MetaGPT)**: agent declares what kinds of information it cares about. Memory is pushed, not pulled. Good for multi-agent coordination where agents need to react to each other's outputs.

**Composite scoring (CrewAI)**: `score = semantic_weight * similarity + recency_weight * decay + importance_weight * importance`. Balances relevance, freshness, and significance. Addresses the "everything is equally weighted" problem that causes retrieval noise.


## 4. What Claude Code Does

Claude Code's memory system is the most directly relevant reference for Guild Hall because it solves a similar problem: persistent context for an AI coding agent across sessions.

### Three Memory Systems

1. **CLAUDE.md files**: human-written instructions loaded into every session's system prompt. Scoped to project (repo root), user (`~/.claude/CLAUDE.md`), and organization (managed policy). Team-shared via version control. Additional topic files via `.claude/rules/` with optional path-scoping (rules that only load when working with matching file patterns). Import syntax (`@path/to/file`) for composing from multiple sources.

2. **Auto-memory**: Claude writes notes for itself at `~/.claude/projects/<project>/memory/`. A `MEMORY.md` index (first 200 lines loaded every session) plus topic files read on demand. Claude decides what's worth remembering. All worktrees within the same git repo share one auto-memory directory. Machine-local, not shared.

3. **Session memory**: automatic background system that saves session summaries as structured markdown. No user interaction required.

Source: [Claude Code Memory docs](https://code.claude.com/docs/en/memory)

### Subagent Persistent Memory (February 2026)

The `memory` frontmatter field on subagent definitions gives each subagent its own persistent directory. Three scopes: `user` (cross-project, at `~/.claude/agent-memory/<name>/`), `project` (shareable via VCS, at `.claude/agent-memory/<name>/`), and `local` (project-specific, not VCS). Same MEMORY.md pattern: first 200 lines loaded, topic files on demand.

Source: [Claude Code Subagent docs](https://code.claude.com/docs/en/sub-agents)

### What's Effective

- **The CLAUDE.md pattern works because it's explicit and auditable.** The user writes it, reviews it, and can see exactly what the agent knows. No magic. No hidden state. This is the single most effective pattern in the entire landscape: a human-curated, version-controlled instruction file.
- **Auto-memory fills a real gap.** Corrections and discoveries that would otherwise be lost between sessions get captured. The 200-line limit on MEMORY.md is a practical constraint that prevents bloat.
- **Scope boundaries are clear.** Project memory stays with the project. User memory crosses projects. No ambiguity about what an agent can see.
- **Plain markdown is the right format at this scale.** Human-readable, editable, versionable. No infrastructure.

### What's Missing for Multi-Agent Use

- **No cross-agent memory sharing.** Each subagent's memory is private. Subagent A can't see what Subagent B learned. This is the same gap Guild Hall has.
- **No write coordination.** If two agents both discover the same thing, both write it. No consolidation, no dedup.
- **No structured handoff.** When one agent's work product should inform another agent's context, the handoff happens through the parent conversation, not through shared memory. This works for subagent chains but not for independent workers.
- **Memory is per-agent-name, not per-role.** Two instances of the same subagent share memory, but two different subagents doing related work (e.g., a reviewer and a debugger) can't share findings about the same codebase.


## 5. What Fails

### Context Pollution

**The problem**: irrelevant memories injected into context actively degrade response quality. Old project context bleeds into current work. A memory about a completed feature misleads the agent about current state.

**Why it happens**: most memory systems treat all stored information as equally valid indefinitely. There's no mechanism to distinguish "told you this a year ago, now stale" from "told you this yesterday, still current."

**How frameworks address it**: CrewAI's recency decay in composite scoring. Mem0's dynamic forgetting. LangGraph's namespace isolation (memories scoped to specific contexts don't leak into others).

Source: [The MEMORY.md Problem (DEV Community)](https://dev.to/anajuliabit/the-memorymd-problem-why-local-files-fail-at-scale-58ae), [Memory Engineering for AI Agents (O'Reilly)](https://www.oreilly.com/radar/why-multi-agent-systems-need-memory-engineering/)

### Memory Bloat

**The problem**: the memory store grows without control, and retrieval degenerates into noise. Every interaction produces memories, but nothing is ever deleted.

**Why it happens**: automatic extraction without corresponding automatic pruning. The system optimizes for recall (never miss anything) at the expense of precision (only return relevant things).

**How frameworks address it**: CrewAI's consolidation (merge similar memories above similarity threshold). Mem0's priority scoring and decay. Claude Code's 200-line MEMORY.md limit as a hard cap.

### Stale Memories and Contradiction

**The problem**: multiple conflicting memories coexist, and agent behavior becomes inconsistent across turns. The code was refactored, but old architectural memories remain.

**Why it happens**: append-only memory with no UPDATE operation. Information is added but never revised.

**How frameworks address it**: Mem0's update and consolidation pipeline. CrewAI's LLM-driven merge decision (when a new memory is similar to an existing one, the LLM decides: merge, replace, or keep both). Claude Code's manual curation (user edits MEMORY.md directly).

### Cross-Agent Contamination

**The problem**: in multi-agent systems, one agent's noisy output enters another's context as ground truth. Errors compound through each hop. Research from O'Reilly found that "interagent misalignment accounts for 36.9% of all failures" in multi-agent systems.

**Why it happens**: shared memory without quality gates. Agents write freely; other agents read uncritically.

**How frameworks address it**: MetaGPT's subscription model (agents only see message types they registered for). CrewAI's memory slices (read-only cross-scope views). The Intrinsic Memory Agents approach sidesteps it entirely by making memory heterogeneous and agent-private.

Source: [Why Multi-Agent Systems Need Memory Engineering (O'Reilly)](https://www.oreilly.com/radar/why-multi-agent-systems-need-memory-engineering/)

### Economic Unsustainability

**The problem**: multi-agent systems use roughly 15x tokens compared to equivalent single-agent interactions because agents re-retrieve information and re-explain context that should exist as shared state.

**Why it happens**: no shared memory means no shared context. Each agent starts from scratch, re-reads files, re-discovers patterns.

**How frameworks address it**: this is the core argument for shared project memory. One agent's discoveries become another agent's starting context.

### Why Memory Systems Go Unused

This is the most relevant failure mode for Guild Hall. The current memory tools exist but are empty. Based on the research, memory systems go unused when:

1. **There's no natural trigger to write.** If memory writing is a separate, deliberate action disconnected from the work, it doesn't happen. The agent finishes its task and moves on. Memory writing needs to be part of the workflow, not an afterthought.

2. **There's no immediate benefit to reading.** If the agent doesn't experience a tangible difference when memories exist vs. when they don't, the system has no gravity. The first memory written must produce a visible improvement in the next session.

3. **The scoping model doesn't match the work.** Guild Hall's three scopes (global, project, worker) are theoretically sound but practically disconnected from how commissions work. A commission produces findings. Those findings should be available to the next commission on the same project. But the current design requires the worker to explicitly write to project memory, and nothing prompts or incentivizes that.

4. **The tools are generic.** `read_memory` and `write_memory` are undifferentiated key-value operations. They don't encode what kind of thing is being remembered, why, or when it should be retrieved. Compare with Claude Code's auto-memory, where the system decides what's worth remembering based on the work itself.

5. **No one curates.** Without a human reviewing and pruning memories, the store either stays empty (no one writes) or becomes noise (everyone writes, no one edits). Claude Code's CLAUDE.md works because a human maintains it. Auto-memory works because the LLM filters aggressively and the 200-line cap forces curation.


## 6. Minimum Viable Memory System

Based on the evidence, the pattern that delivers the most value with the least complexity is what Claude Code already does, adapted for multi-agent use.

### The Pattern: Project-Scoped Curated Memory + Automatic Capture

Three components, in order of priority:

**Component 1: Project briefing as readable memory (already exists in Guild Hall)**

Guild Hall already generates project briefings from the codebase. This is read-only, project-scoped memory. It gives every worker a shared starting context about the project. The improvement opportunity: make briefings richer by incorporating commission outcomes, not just codebase state.

**Component 2: Commission outcomes as automatic memory writes**

When a commission completes with `submit_result`, the system should extract key findings and write them to project memory automatically. Not the full result summary, but a curated extract: what was learned, what was decided, what changed. This eliminates the "no natural trigger to write" failure mode. The worker doesn't need to remember to use `write_memory`; the system captures outcomes from the work it already does.

The closest analogue is CrewAI's long-term memory, which stores task results (descriptions, quality scores, suggestions) in SQLite automatically after task completion. But flat markdown is simpler and sufficient at Guild Hall's scale.

**Component 3: Worker-private learning (deferred)**

Per-worker memory matters only when a worker accumulates genuine expertise across many invocations. Guild Hall workers don't run often enough yet for this to matter. The Claude Code subagent `memory` frontmatter pattern is the right design when this becomes relevant: each worker gets a MEMORY.md that's loaded at activation.

### What to Skip

- **Vector stores**: the corpus is too small. Keyword search or full-text injection is sufficient.
- **Automatic extraction with LLM**: adds latency and cost for marginal benefit at this scale. Start with structured extraction from `submit_result`, which is already in a known format.
- **Global memory**: too high-risk for stale context. Project-scoped is where the value is.
- **Real-time cross-agent memory sharing**: workers run independently on bounded commissions. They don't need to see each other's memories mid-execution. They need to see outcomes from past commissions when starting new ones.

### Implementation Sketch

1. When a commission completes (`submit_result`), extract a structured summary: what the commission was, what was found/decided/built, what files were affected. Write to `.lore/commissions/` (already happens) and also to a project memory index.
2. When a worker activates for a new commission, inject recent commission outcomes for the same project into the system prompt alongside the briefing. The worker starts with context about what other workers have already done.
3. Keep the existing `read_memory` / `write_memory` tools for explicit use, but don't rely on workers using them spontaneously. They're escape hatches, not the primary mechanism.

The gravity comes from step 2: the worker immediately benefits from previous commissions' outcomes. The system writes memory (step 1) as a byproduct of work that's already happening. No behavioral change required from workers or users.

### What This Leaves Out

- Memory pruning and staleness detection. At low volume, manual curation by the user (editing `.lore/` files) is sufficient. This becomes a problem at scale.
- Cross-project learning. Low value until the same worker types run on many projects.
- Memory search. At the volumes Guild Hall operates at, injecting recent outcomes is better than making the worker search for relevant ones.

These are real gaps but not first-order problems. Solve the "memory is empty because no one writes to it" problem first. The retrieval and curation problems only matter after there's something to retrieve.


## Sources

### Framework Documentation
- [CrewAI Memory](https://docs.crewai.com/en/concepts/memory)
- [CrewAI Memory Configuration (DeepWiki)](https://deepwiki.com/crewAIInc/crewAI/7.2-memory-configuration-and-storage)
- [LangGraph Memory](https://docs.langchain.com/oss/python/langgraph/memory)
- [LangGraph Persistence (Towards AI)](https://pub.towardsai.net/persistence-in-langgraph-deep-practical-guide-36dc4c452c3b)
- [MetaGPT Paper](https://arxiv.org/html/2308.00352v6)
- [MetaGPT GitHub](https://github.com/FoundationAgents/MetaGPT)
- [AutoGen Teachability](https://www.analyticsvidhya.com/blog/2025/12/autogen-teachable-agent/)
- [Claude Code Memory](https://code.claude.com/docs/en/memory)
- [Claude Code Subagents](https://code.claude.com/docs/en/sub-agents)

### Research Papers
- [Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory](https://arxiv.org/abs/2504.19413)
- [Intrinsic Memory Agents: Heterogeneous Multi-Agent LLM Systems](https://arxiv.org/abs/2508.08997)

### Analysis and Commentary
- [AI Agent Memory: Comparative Analysis (DEV Community)](https://dev.to/foxgem/ai-agent-memory-a-comparative-analysis-of-langgraph-crewai-and-autogen-31dp)
- [Why Multi-Agent Systems Need Memory Engineering (O'Reilly)](https://www.oreilly.com/radar/why-multi-agent-systems-need-memory-engineering/)
- [The MEMORY.md Problem (DEV Community)](https://dev.to/anajuliabit/the-memorymd-problem-why-local-files-fail-at-scale-58ae)
- [Mem0 Graph Memory](https://mem0.ai/blog/graph-memory-solutions-ai-agents)
- [Memory in AI Agents (Oracle)](https://blogs.oracle.com/developers/agent-memory-why-your-ai-has-amnesia-and-how-to-fix-it)
