---
title: "Commission: Research: LLM memory retention prompt design"
date: 2026-03-20
status: completed
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "## Research Task: Memory Retention Prompt Design\n\nWe're building a feature where an LLM (Haiku) triages commission outcomes and meeting summaries to decide what should be saved to project memory. The brainstorm is at `.lore/brainstorm/commission-outcomes-to-memory.md`. The existing memory research is at `.lore/research/agent-memory-systems.md`.\n\nThe load-bearing question is: **what should the triage prompt tell the LLM to remember?**\n\n### The Input Types\n\nThe triage call receives one of two input types:\n\n1. **Commission outcome**: \"I just did some work.\" Contains a task description (the commission prompt), outcome status, result summary, and artifact list. This is a work log.\n2. **Meeting summary**: \"I just had a long conversation.\" Contains generated notes summarizing what was discussed. This is a conversation record.\n\n### The Core Questions\n\nResearch how other systems and practitioners answer these questions:\n\n1. **What categories of information are worth extracting from work logs and conversation records?** Not just \"decisions\" or \"lessons learned\" — what taxonomy have people arrived at? How do they distinguish signal from noise? Are there established frameworks for what an LLM should retain vs. discard?\n\n2. **How does project type change the answer?** We have multiple project types:\n   - A software development project (most common for us) — commissions build features, fix bugs, write specs\n   - A personal knowledge management system managed by a steward who reads email\n   - A creative writing project\n   - Does the \"what to remember\" question have a universal answer, or does it fundamentally depend on the domain?\n\n3. **Can a single generic prompt work across project types?** Or do we need project-specific guidance layered on top? What does that layering look like in practice? Are there examples of systems that use a base prompt + domain overlay?\n\n4. **What are other people doing?** Look at:\n   - How Claude's own memory feature decides what to save (if documented)\n   - How Cursor, Windsurf, or other AI coding tools handle memory/context retention\n   - How Mem0, MemGPT/Letta, or other dedicated memory systems decide what's worth storing\n   - Academic or practitioner writing on LLM memory curation\n   - Any prompt engineering patterns specifically for \"decide what to remember from this transcript\"\n\n5. **What does a good triage prompt look like?** Find examples of prompts that ask an LLM to extract memorable information from a log or transcript. What patterns work? What anti-patterns produce too much noise or miss important signals?\n\n### Output\n\nWrite the research to `.lore/research/memory-retention-prompt-design.md`. Structure it so we can use the findings to draft the actual triage prompt. Include concrete examples of prompts or frameworks you find, not just summaries of what systems do.\n\nThis research will feed directly into a spec for the commission-outcomes-to-memory feature."
dependencies: []
linked_artifacts:
  - .lore/research/memory-retention-prompt-design.md

activity_timeline:
  - timestamp: 2026-03-20T17:41:56.043Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T17:41:56.046Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-20T17:41:56.141Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-20T17:42:06.887Z
    event: progress_report
    reason: "Starting research. Reading existing brainstorm and memory research documents first."
  - timestamp: 2026-03-20T17:44:06.633Z
    event: progress_report
    reason: "Research collection complete. Found concrete prompt templates from Mem0, Amazon Bedrock, LangMem, and Letta. Also gathered taxonomy frameworks from academic papers. Now synthesizing into the research document."
  - timestamp: 2026-03-20T17:47:49.586Z
    event: result_submitted
    reason: "Research document written to `.lore/research/memory-retention-prompt-design.md`. Covers six sections:\n\n1. **How existing systems decide what to remember** - Concrete prompt templates and architectures from Mem0 (three-prompt pipeline, verified against source code), Amazon Bedrock AgentCore (full extraction and consolidation prompts published), LangMem (schema-driven extraction), Letta/MemGPT (self-editing memory), Claude Code (three-layer memory), Claude API memory tool, Windsurf Cascade, and Cursor.\n\n2. **Taxonomy of what to remember** - Three converging taxonomies (psychological, functional, practitioner) mapped to Guild Hall's two input types. Commission outcomes yield: architectural decisions, new capabilities, discovered constraints, process patterns, open questions, dependency changes. Meeting summaries yield: decisions with rationale, feedback/corrections, priority shifts, status updates, new work items, user direction.\n\n3. **Domain specificity vs. generic prompts** - Evidence supports a single generic prompt across project types. The categories are stable; the instances vary. Layered approaches (Mem0, LangMem) exist but serve much broader user bases than Guild Hall needs.\n\n4. **What a good triage prompt looks like** - Five patterns that work (explicit skip criteria, concrete examples, conservative default, structured output, standalone facts) and three anti-patterns (vague \"extract everything important,\" no dedup against existing memory, mixing working state with durable knowledge). Includes a structural template for the prompt.\n\n5. **Draft framework for the Guild Hall triage prompt** - Seven extraction categories with extract/skip criteria, explicit skip criteria list, output schema, existing memory injection strategy, and three worked examples showing expected triage decisions.\n\n6. **Open questions for the spec** - Section naming (free vs. fixed set), multiple entries per call, confidence thresholds, single vs. dual prompt for meetings/commissions, memory compaction interaction."
  - timestamp: 2026-03-20T17:47:58.150Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Research collection complete. Found concrete prompt templates from Mem0, Amazon Bedrock, LangMem, and Letta. Also gathered taxonomy frameworks from academic papers. Now synthesizing into the research document."
projectName: guild-hall
---
Research document written to `.lore/research/memory-retention-prompt-design.md`. Covers six sections:

1. **How existing systems decide what to remember** - Concrete prompt templates and architectures from Mem0 (three-prompt pipeline, verified against source code), Amazon Bedrock AgentCore (full extraction and consolidation prompts published), LangMem (schema-driven extraction), Letta/MemGPT (self-editing memory), Claude Code (three-layer memory), Claude API memory tool, Windsurf Cascade, and Cursor.

2. **Taxonomy of what to remember** - Three converging taxonomies (psychological, functional, practitioner) mapped to Guild Hall's two input types. Commission outcomes yield: architectural decisions, new capabilities, discovered constraints, process patterns, open questions, dependency changes. Meeting summaries yield: decisions with rationale, feedback/corrections, priority shifts, status updates, new work items, user direction.

3. **Domain specificity vs. generic prompts** - Evidence supports a single generic prompt across project types. The categories are stable; the instances vary. Layered approaches (Mem0, LangMem) exist but serve much broader user bases than Guild Hall needs.

4. **What a good triage prompt looks like** - Five patterns that work (explicit skip criteria, concrete examples, conservative default, structured output, standalone facts) and three anti-patterns (vague "extract everything important," no dedup against existing memory, mixing working state with durable knowledge). Includes a structural template for the prompt.

5. **Draft framework for the Guild Hall triage prompt** - Seven extraction categories with extract/skip criteria, explicit skip criteria list, output schema, existing memory injection strategy, and three worked examples showing expected triage decisions.

6. **Open questions for the spec** - Section naming (free vs. fixed set), multiple entries per call, confidence thresholds, single vs. dual prompt for meetings/commissions, memory compaction interaction.
