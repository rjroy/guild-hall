---
title: Memory Retention Prompt Design
date: 2026-03-20
status: current
tags: [memory, prompt-design, triage, haiku, commissions, meetings, research]
related:
  - .lore/brainstorm/commission-outcomes-to-memory.md
  - .lore/research/agent-memory-systems.md
---

# Memory Retention Prompt Design

Research into how to design the triage prompt that decides what to extract from commission outcomes and meeting summaries for project memory. The load-bearing question: what should the prompt tell the LLM to remember?

## 1. How Existing Systems Decide What to Remember

### Mem0: Three-Prompt Pipeline

Mem0's architecture uses three distinct prompts, each with a specific role. The source code is public ([mem0/configs/prompts.py](https://github.com/mem0ai/mem0/blob/main/mem0/configs/prompts.py)).

**Extraction prompt.** Instructs the LLM to extract facts from messages. Specifies seven information categories:

1. Personal preferences (likes, dislikes, specific preferences)
2. Important personal details (names, relationships, dates)
3. Plans and intentions (upcoming events, goals)
4. Wellness preferences (health, fitness, dietary)
5. Professional info (job details, skills, career)
6. Miscellaneous details (anything else noteworthy)
7. Entity relationships (who knows whom, organizational structure)

The key design choice: the extraction prompt strictly separates user messages from assistant messages. Facts are extracted from user input only; assistant responses provide context but never generate memories. This prevents the system from memorizing its own output.

**Update prompt.** Compares extracted facts against existing memories and returns one of four actions per fact: ADD (genuinely new), UPDATE (existing topic, new detail), DELETE (contradicts stored memory), or NONE (already captured). Updates must include `old_memory` for traceability. The prompt includes concrete examples of each case to calibrate the model's judgment.

**Graph extraction prompt.** Separately extracts entity relationships as subject-predicate-object triples with context fields. This captures relational structure that flat facts miss.

Source: [Mem0 Custom Update Memory Prompt docs](https://docs.mem0.ai/open-source/features/custom-update-memory-prompt), [Mem0 prompts.py](https://github.com/mem0ai/mem0/blob/main/mem0/configs/prompts.py)

Confidence: **Verified against source code.**

### Amazon Bedrock AgentCore: Conservative Memory Manager

Amazon's memory system prompt ([Bedrock AgentCore docs](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-system-prompt.html)) is the most explicit about decision criteria. Two phases:

**Extraction phase.** The prompt says: "You are a long-term memory extraction agent supporting a lifelong learning system." Key rules:
- Extract ONLY from user messages; assistant messages are supporting context
- If the conversation contains no relevant or noteworthy information, return an empty list
- Do NOT extract from prior conversation history (use it solely for context)
- Avoid duplicate extractions

The output schema is deliberately simple: each memory is a standalone fact stated as a simple sentence.

**Consolidation phase.** The prompt describes itself as "a conservative memory manager that preserves existing information while carefully integrating new facts." Three operations:
- **AddMemory**: Only when the fact introduces "entirely new information not covered by existing memories"
- **UpdateMemory**: "Preserve existing information while adding new details. Combine information coherently without losing specificity."
- **SkipMemory**: When information already exists in sufficient detail

Critical rules include: preserve timestamps and specific details from original memory; maintain semantic accuracy; never generalize or change meaning; only enhance when new information genuinely adds value.

Confidence: **Verified against documentation.** The exact prompt text is published.

### LangMem (LangChain): Schema-Driven Extraction

LangMem ([conceptual guide](https://langchain-ai.github.io/langmem/concepts/conceptual_guide/), [semantic memory guide](https://langchain-ai.github.io/langmem/guides/extract_semantic_memories/)) takes a different approach: instead of telling the LLM what categories to look for, it provides Pydantic schemas that define the shape of memories. The LLM fills in the schema or returns nothing.

Three memory types serve as the taxonomy:
1. **Semantic memory** (facts and knowledge): user preferences, technical requirements, team structure, decisions
2. **Episodic memory** (past experiences): summaries of interactions, what happened and what the outcome was
3. **Procedural memory** (behavior and instructions): learned rules, policies, adjustments to agent behavior

Two storage patterns:
- **Collections**: unbounded sets of memories, searched at retrieval time (good for facts)
- **Profiles**: fixed-schema records, always loaded (good for user preferences, project config)

The extraction instruction is simple: "Extract user preferences and any other useful information." The schema does the heavy lifting. A `Triple` schema (subject, predicate, object, context) produces knowledge-graph-style memories. A `Preference` schema produces preference records. The system supports multiple schemas simultaneously.

Source: [LangMem SDK docs](https://langchain-ai.github.io/langmem/), [DeepWiki analysis](https://deepwiki.com/langchain-ai/langmem/2.1-semantic-memory)

Confidence: **Verified against documentation.**

### Letta (MemGPT): Self-Editing Memory

Letta's approach ([docs](https://docs.letta.com/advanced/memory-management/), [blog](https://www.letta.com/blog/agent-memory)) is fundamentally different: the agent manages its own memory through tool calls during execution, not through a post-hoc extraction step.

Core memory blocks have labels, descriptions, values, and character limits. The agent uses `core_memory_append` and `core_memory_replace` to update them. The system prompt instructs the agent on when and how to use these tools, but the agent decides what's worth storing in the moment.

Four memory tiers:
1. **Message buffer**: recent conversation turns (working memory)
2. **Core memory**: labeled blocks always in context (key facts, persona, goals)
3. **Recall memory**: full interaction history, searchable
4. **Archival memory**: explicitly formulated knowledge in external storage

The key insight: Letta doesn't have a separate triage step. Memory management is woven into the agent loop itself. The tradeoff: this requires a capable model (not Haiku-tier) and adds latency to every turn.

Source: [Letta memory management docs](https://docs.letta.com/advanced/memory-management/)

Confidence: **Verified against documentation.**

### Claude Code: Three-Layer Memory

Claude Code's memory ([docs](https://code.claude.com/docs/en/memory)) has three layers:

1. **CLAUDE.md files**: human-written instructions, always loaded. The most effective memory mechanism in the entire landscape because it's explicit, auditable, and version-controlled.
2. **Auto-memory**: Claude writes notes for itself in `~/.claude/projects/<project>/memory/`. A `MEMORY.md` index (first 200 lines loaded) plus topic files. Claude decides what's worth remembering based on whether it would be useful in a future session.
3. **Session memory**: automatic background summaries of sessions.

The auto-memory decision is opaque (no public prompt template), but the observed behavior: corrections, debugging insights, build commands, architecture notes, code style preferences, and workflow habits get saved. Routine Q&A does not.

The 200-line limit on `MEMORY.md` is a hard cap that forces curation. Claude is expected to move detailed notes into topic files and keep the index concise. This is a structural constraint that prevents bloat without requiring explicit pruning logic.

Source: [Claude Code Memory docs](https://code.claude.com/docs/en/memory), [Claude API Memory tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool)

Confidence: **Verified against documentation.** The internal auto-memory prompt is not published.

### Claude API Memory Tool

The API-level memory tool ([docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool)) is client-side: Claude makes tool calls, the application handles storage. The system prompt guidance is minimal:

```
IMPORTANT: ALWAYS VIEW YOUR MEMORY DIRECTORY BEFORE DOING ANYTHING ELSE.
MEMORY PROTOCOL:
1. Use the `view` command of your `memory` tool to check for earlier progress.
2. ... (work on the task) ...
   - As you make progress, record status / progress / thoughts etc in your memory.
ASSUME INTERRUPTION: Your context window might be reset at any moment, so you risk
losing any progress that is not recorded in your memory directory.
```

The prompt treats memory as working state (progress tracking) rather than knowledge extraction. This is appropriate for its use case (long-running agent sessions) but different from our triage scenario (post-hoc extraction from completed work).

Confidence: **Verified against documentation.** Exact prompt text is published.

### Windsurf Cascade: Opaque Auto-Save

Windsurf's Cascade ([docs](https://docs.windsurf.com/windsurf/cascade/memories)) can "automatically generate and store memories if it encounters context that it believes is useful to remember." The decision criteria are not documented. The docs recommend using Rules (`.windsurf/rules/`) or `AGENTS.md` for durable, controllable context instead of relying on auto-memories.

Confidence: **Black box.** No prompt or criteria published.

### Cursor: No Persistent Memory

Cursor does not persist memory across conversations. It relies on project files as context and `.cursor/rules/` for persistent instructions. Community "memory bank" patterns exist but are user-maintained, not system-driven.

Source: [Cursor community forum](https://forum.cursor.com/t/memory-bank-feature-for-your-cursor/71979)

Confidence: **Verified against documentation.**


## 2. Taxonomy of What to Remember

Across systems and research, the categories of memory-worthy information cluster into a consistent taxonomy. The naming varies but the substance converges.

### The Psychological Taxonomy (LangGraph, academic literature)

From cognitive science, adapted for LLMs:

| Type | What it captures | Example |
|------|-----------------|---------|
| **Semantic** | Facts, knowledge, relationships | "The API uses JWT tokens for auth" |
| **Episodic** | Events, experiences, outcomes | "The auth migration took 3 commissions and the first two failed due to missing test fixtures" |
| **Procedural** | Rules, behaviors, instructions | "Always run typecheck before committing in this project" |

Source: [LangGraph Memory docs](https://docs.langchain.com/oss/python/langgraph/memory), LangMem conceptual guide, "Memory in the Age of AI Agents" survey ([arXiv 2512.13564](https://arxiv.org/abs/2512.13564))

### The Functional Taxonomy (recent research, 2025-2026)

From "Anatomy of Agentic Memory" ([arXiv 2602.19320](https://arxiv.org/html/2602.19320v1)):

| Type | What it captures | Storage pattern |
|------|-----------------|-----------------|
| **Lightweight semantic** | Independent textual units, facts | Vector-indexed text chunks |
| **Entity-centric** | Structured records about people, tools, systems | Attribute-value pairs per entity |
| **Episodic and reflective** | Temporal sequences with consolidation | Episode summaries, reflection outputs |
| **Structured and hierarchical** | Multi-tier organized knowledge | Graphs, tiered storage layers |

### The Practitioner Taxonomy (Mem0, observed in production systems)

What production memory systems actually extract:

| Category | What it captures | Extraction signal |
|----------|-----------------|-------------------|
| **Preferences** | How the user/project likes things done | Corrections, style choices, configuration |
| **Facts** | Verifiable statements about the domain | Declarations, discoveries, measurements |
| **Relationships** | Who/what connects to who/what | Team structure, dependency graphs, integration points |
| **Decisions** | Choices made with rationale | "We chose X because Y" |
| **Plans and intentions** | What's coming next | Goals, roadmap items, next steps |
| **Failures and lessons** | What went wrong and what was learned | Error patterns, workarounds, root causes |

### Synthesis: What Categories Matter for Guild Hall

Mapping these taxonomies to our two input types (commission outcomes and meeting summaries):

**From commission outcomes (work logs):**

| Category | Signal in the data | Example |
|----------|-------------------|---------|
| **Architectural decisions** | Changes to specs, designs, or system structure | "Event router uses pub/sub, not direct calls" |
| **New capabilities** | Features built, tools added, APIs created | "Workers can now send mail to each other" |
| **Discovered constraints** | Things that didn't work, unexpected limitations | "Bun's mock.module() causes infinite loops" |
| **Process patterns** | How the work was done, what approach worked | "Phased migration with per-phase test verification is the safe path for large refactors" |
| **Open questions** | Problems identified but not resolved | "Package distribution model has four competing approaches" |
| **Dependency changes** | New packages, removed packages, API changes | "Switched from flux-dev to nano-banana-pro model" |

**From meeting summaries (conversation records):**

| Category | Signal in the data | Example |
|----------|-------------------|---------|
| **Decisions with rationale** | Things the user decided, and why | "CHANGELOG is release-time, not continuous" |
| **Feedback and corrections** | User correcting worker behavior | "Don't downgrade review findings" |
| **Priority shifts** | What matters more or less now | "Performance testing elevated to full project" |
| **Status updates** | State of ongoing work | "Dashboard selection model completed" |
| **New work items** | Things to do that emerged from discussion | "Need comprehensive terminology sweep" |
| **User preferences** | How the user wants things done | "Use commission dependencies for automatic chaining" |


## 3. Domain Specificity vs. Generic Prompts

### The Evidence

**Domain changes what matters.** The "Codified Context" paper ([arXiv 2602.20478](https://arxiv.org/html/2602.20478v1)) found that specialized agents with pre-loaded domain knowledge produce significantly fewer errors than generic agents. Three-tier loading (hot memory always loaded, domain specialists invoked per task, cold memory retrieved on demand) outperforms flat injection.

**But the categories are more stable than they look.** Across Mem0's personal assistant use case, LangMem's coding assistant use case, Bedrock's enterprise use case, and Letta's open-ended agent use case, the same high-level categories appear: facts, decisions, preferences, relationships, failures. The specifics change (a creative writing project cares about character arcs; a software project cares about API contracts) but the extraction categories don't.

**Layered approaches exist in practice.** Mem0 supports `custom_fact_extraction_prompt` that overrides the default extraction categories while keeping the update/consolidation logic unchanged. LangMem uses schemas that define the shape of memories per domain. Amazon Bedrock's extraction prompt is generic but the consolidation prompt is parameterized.

### What This Means for Guild Hall

A single generic prompt can work across project types if it describes categories abstractly enough that the LLM can instantiate them for any domain. "Decisions made with rationale" applies to software architecture, creative writing plot choices, and email triage priorities equally. "Discovered constraints" applies to API limitations, narrative rules, and inbox patterns.

The alternative, domain-specific prompts per project type, adds complexity without clear evidence of proportional improvement. The systems that use domain overlays (Mem0, LangMem) do so because they serve many independent users with wildly different use cases. Guild Hall serves one user with a small number of project types.

**Recommendation** (presenting as option, not conclusion): Start with a single generic prompt. If specific project types consistently produce bad extractions (too much noise or missed signals), add a project-type overlay that adjusts the categories. The brainstorm already identified this as the likely path.


## 4. What a Good Triage Prompt Looks Like

### Patterns That Work

**Explicit "do not remember" examples.** Every effective memory prompt defines both what to extract and what to skip. Mem0's extraction prompt says "Do not include information from assistant or system messages." Bedrock says "If the conversation contains no relevant or noteworthy information, return an empty list." Without explicit skip criteria, the model defaults to extracting everything.

**Concrete examples per category.** The Mem0 update prompt includes examples like: "If memory contains 'Likes cheese pizza' and the new fact is 'Loves cheese pizza,' return NONE because they convey the same information." This calibrates the model's sensitivity threshold.

**Conservative by default.** Bedrock's consolidation prompt describes itself as a "conservative memory manager." The Amazon approach explicitly says: use SkipMemory "when information already exists in sufficient detail or when new information doesn't add meaningful value." This is the right bias for a triage system. False negatives (skipping something worth remembering) are cheaper than false positives (writing noise that pollutes future context).

**Structured output schema.** All effective systems return structured data, not free text. Mem0 returns `{id, text, event, old_memory}`. Bedrock returns `{fact, operation, update_id}`. LangMem returns populated Pydantic models. Structure prevents the model from writing essay-length memories or vague summaries.

**Standalone facts, not context-dependent fragments.** Bedrock specifies: each memory should be "a standalone personal fact, stated in a simple sentence." LangMem's Triple schema enforces this through structure (subject + predicate + object). Memories that require context to interpret ("the issue we discussed" rather than "authentication middleware needs to handle token refresh") are useless when retrieved later.

### Anti-Patterns That Produce Noise

**"Extract everything important."** Too vague. The model has no calibration for what "important" means in this context. Every system that works well provides categories, examples, or schemas.

**No deduplication against existing memory.** If the prompt doesn't show what's already in memory, every commission will re-extract the same project facts. Mem0 and Bedrock both compare against existing memories before deciding to add.

**Mixing working state with durable knowledge.** The Claude API memory tool prompt ("record status / progress / thoughts") is designed for in-session working memory. A triage prompt for post-hoc extraction should explicitly exclude transient state: "Do not extract information about the process of doing the work. Extract what was learned, decided, or built."

**No empty-result path.** If the prompt doesn't explicitly allow "nothing worth remembering," the model will strain to find something. Most commissions (routine bug fixes, simple feature additions) probably don't produce memory-worthy outcomes.

### A Structural Template

Based on the patterns above, the effective structure for a triage prompt is:

1. **Role statement**: What the model is doing (triage filter, not scribe)
2. **Input description**: What it's looking at (commission outcome or meeting notes)
3. **Categories to look for**: What kinds of information are worth extracting
4. **Skip criteria**: What to explicitly ignore
5. **Examples**: Both positive (extract this) and negative (skip this)
6. **Existing memory**: What's already stored (to prevent duplication)
7. **Output schema**: The exact structure of a memory entry
8. **Empty-result path**: How to signal "nothing worth remembering"


## 5. Draft Framework for the Guild Hall Triage Prompt

This section translates the research findings into a concrete framework. Not the final prompt (that belongs in the spec), but the bones.

### Categories to Extract

Based on the taxonomy analysis in section 2, filtered for what matters at project scope:

| Category | Description | Extract when... | Skip when... |
|----------|-------------|-----------------|--------------|
| **Decisions** | Choices made, with rationale | The outcome records a design choice, technology selection, or approach change | The work followed an existing plan without deviation |
| **Discoveries** | Things learned that weren't known before | A constraint, bug, or behavior was found that future work needs to know about | The discovery is already documented in a spec or retro |
| **Capabilities** | New things the system can do | A feature, tool, or integration was built | The feature is a minor internal refactoring with no user-facing change |
| **Failures** | What went wrong and why | The commission halted or failed with a root cause worth noting | The failure was transient (rate limit, timeout) with no lasting lesson |
| **Process** | How the work should be done going forward | A lesson about workflow, approach, or coordination emerged | The process note is specific to one commission and won't generalize |
| **Status changes** | State of ongoing work items | An issue was resolved, a spec was approved, a blocker was cleared | The status is already reflected in the artifact frontmatter |
| **User direction** | Explicit preferences or corrections from the user | The user stated how they want something done | The direction is already captured in CLAUDE.md or worker memory |

### Skip Criteria

These should be explicit in the prompt:

- **Routine completions.** "Built feature X per spec" with no surprises, deviations, or lessons. The artifact exists; the memory adds nothing.
- **Transient failures.** Rate limits, network errors, timeout-and-retry patterns. Unless the failure revealed a systemic issue.
- **Process details.** How many turns it took, which files were read, what tools were used. This is execution log, not knowledge.
- **Already-documented information.** If the commission created or updated a spec, design, or retro, the knowledge lives there. Memory should point to artifacts, not duplicate them.
- **Assistant-generated content.** Don't memorize what the LLM said. Memorize what the user decided, what was discovered, what changed.

### Output Schema

A memory entry for the project memory system. Each entry maps to an `edit_memory` upsert or append operation.

```
{
  "action": "skip" | "write",
  "section": string,       // section name in project memory (e.g., "Architecture", "Open Issues", "Process")
  "operation": "upsert" | "append",  // replace section or add to it
  "content": string        // the memory text, standalone and self-contained
}
```

If `action` is `"skip"`, the other fields are absent. This is the empty-result path.

If `operation` is `"append"`, the content is added to an existing section. If `"upsert"`, the section is replaced. Append is safer for accumulating facts; upsert is appropriate when a status or state changes.

### Existing Memory Injection

The prompt must include current project memory so the model can deduplicate. Without this, every commission that touches the same architectural area will re-extract the same facts. Bedrock and Mem0 both provide existing memories as context for the update decision.

The cost: loading project memory into the triage call's context. At Guild Hall's scale (project memory is small, typically under 16K chars), this is affordable. If memory grows large, a section-relevant subset could be injected instead.

### Concrete Example: What a Triage Call Sees

**Input (commission outcome):**
```
Worker: Dalton (Developer)
Task: Implement meetings list preview text
Status: completed
Result: Added preview line from agenda/notes excerpt in meeting list entries.
  MeetingListEntry type extended with optional previewText field.
  Preview extracted from agenda (first line) or notes (first non-header line).
  9 tests added. All passing.
Artifacts: .lore/specs/meetings/meetings-list-preview.md (status: implemented)
```

**Expected output:** `{ "action": "skip" }` because this is a routine feature completion with no surprises. The spec tracks the status. There's nothing for memory to add.

**Input (commission outcome):**
```
Worker: Thorne (Reviewer)
Task: Review commission cleanup batch
Status: completed
Result: Reviewed 80 commissions. Found systemic issues:
  - Sandbox commit failures: Commissions can't git commit from sandboxed sessions
  - Halted commission UI: Daemon supports continue/save/abandon but web UI has no buttons
  - Celeste/Illuminator packages shipped without dedicated review commissions
Artifacts: .lore/retros/commission-cleanup-2026-03-18.md
```

**Expected output:**
```json
{
  "action": "write",
  "section": "Untracked Gaps",
  "operation": "append",
  "content": "Sandbox commit failures: commissions can't git commit from sandboxed sessions. Systemic issue found during commission cleanup review (2026-03-18). Needs architectural fix."
}
```

This is worth remembering because it's a discovered constraint that future work needs to know about, and it's not tracked in the issues system yet.

**Input (meeting summary):**
```
Meeting with Guild Master. Discussed commission cleanup findings.
Decisions:
- CHANGELOG is release-time, not continuous
- Use commission dependencies for automatic chaining
- Don't downgrade review findings
- Worker memory is operational notes only; project status lives in project-scope memory
```

**Expected output:** Multiple entries, one per decision, each to the "Process Decisions" section with append operation. Each stated as a standalone fact: "CHANGELOG updates happen at release boundaries, not per-commit. Decided 2026-03-18."


## 6. Open Questions for the Spec

1. **Section naming convention.** Should the triage model choose section names freely, or select from a fixed set? Fixed set is safer (prevents proliferation) but may miss novel categories. Mem0 lets the model generate IDs freely; Bedrock constrains to a schema.

2. **Multiple entries per triage call.** A meeting summary might contain five decisions. Should the model return multiple entries, or one consolidated entry? Multiple is more granular and easier to deduplicate. Consolidated is cheaper and simpler.

3. **Confidence threshold.** Should the model express confidence and the system apply a threshold? Mem0 doesn't. Bedrock doesn't. Claude Code doesn't. The evidence suggests binary (write or skip) is sufficient and confidence scores add noise without improving outcomes.

4. **Meeting notes vs. commission outcomes: same prompt?** The categories overlap substantially. The differences are in what to skip (meetings have more chatter to filter) and where information comes from (meetings record user decisions; commissions record worker discoveries). A single prompt with input-type awareness is probably sufficient. Two prompts is cleaner but doubles maintenance.

5. **Memory compaction interaction.** If the triage system adds entries and the memory file exceeds the budget, who compacts? The existing memory system has a budget (16K chars). The triage system should be aware of remaining budget and produce concise entries, but compaction should remain a separate concern.


## Sources

### Framework Documentation and Source Code
- [Mem0 prompts.py (source code)](https://github.com/mem0ai/mem0/blob/main/mem0/configs/prompts.py)
- [Mem0 Custom Update Memory Prompt](https://docs.mem0.ai/open-source/features/custom-update-memory-prompt)
- [Mem0 paper](https://arxiv.org/abs/2504.19413)
- [Amazon Bedrock AgentCore: System prompt for semantic memory](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-system-prompt.html)
- [LangMem Semantic Memory Guide](https://langchain-ai.github.io/langmem/guides/extract_semantic_memories/)
- [LangMem Conceptual Guide](https://langchain-ai.github.io/langmem/concepts/conceptual_guide/)
- [LangMem DeepWiki: Semantic Memory](https://deepwiki.com/langchain-ai/langmem/2.1-semantic-memory)
- [Letta Memory Management](https://docs.letta.com/advanced/memory-management/)
- [Letta: Agent Memory blog](https://www.letta.com/blog/agent-memory)
- [Claude Code Memory](https://code.claude.com/docs/en/memory)
- [Claude API Memory Tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool)
- [Windsurf Cascade Memories](https://docs.windsurf.com/windsurf/cascade/memories)

### Research Papers
- [Memory in the Age of AI Agents: A Survey (arXiv 2512.13564)](https://arxiv.org/abs/2512.13564)
- [Anatomy of Agentic Memory: Taxonomy and Empirical Analysis (arXiv 2602.19320)](https://arxiv.org/html/2602.19320v1)
- [Codified Context: Infrastructure for AI Agents in a Complex Codebase (arXiv 2602.20478)](https://arxiv.org/html/2602.20478v1)

### Practitioner Writing
- [How to Build Your Own Custom LLM Memory Layer (Towards Data Science)](https://towardsdatascience.com/how-to-build-your-own-custom-llm-memory-layer-from-scratch/)
- [Mem0: How Three Prompts Created a Viral AI Memory Layer](https://blog.lqhl.me/mem0-how-three-prompts-created-a-viral-ai-memory-layer)
- [Context Engineering for Coding Agents (Martin Fowler)](https://martinfowler.com/articles/exploring-gen-ai/context-engineering-coding-agents.html)
- [Long-Term Context Retention Patterns (Developer Toolkit)](https://developertoolkit.ai/en/shared-workflows/context-management/memory-patterns/)
