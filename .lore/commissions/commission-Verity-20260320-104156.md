---
title: "Commission: Research: LLM memory retention prompt design"
date: 2026-03-20
status: dispatched
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "## Research Task: Memory Retention Prompt Design\n\nWe're building a feature where an LLM (Haiku) triages commission outcomes and meeting summaries to decide what should be saved to project memory. The brainstorm is at `.lore/brainstorm/commission-outcomes-to-memory.md`. The existing memory research is at `.lore/research/agent-memory-systems.md`.\n\nThe load-bearing question is: **what should the triage prompt tell the LLM to remember?**\n\n### The Input Types\n\nThe triage call receives one of two input types:\n\n1. **Commission outcome**: \"I just did some work.\" Contains a task description (the commission prompt), outcome status, result summary, and artifact list. This is a work log.\n2. **Meeting summary**: \"I just had a long conversation.\" Contains generated notes summarizing what was discussed. This is a conversation record.\n\n### The Core Questions\n\nResearch how other systems and practitioners answer these questions:\n\n1. **What categories of information are worth extracting from work logs and conversation records?** Not just \"decisions\" or \"lessons learned\" — what taxonomy have people arrived at? How do they distinguish signal from noise? Are there established frameworks for what an LLM should retain vs. discard?\n\n2. **How does project type change the answer?** We have multiple project types:\n   - A software development project (most common for us) — commissions build features, fix bugs, write specs\n   - A personal knowledge management system managed by a steward who reads email\n   - A creative writing project\n   - Does the \"what to remember\" question have a universal answer, or does it fundamentally depend on the domain?\n\n3. **Can a single generic prompt work across project types?** Or do we need project-specific guidance layered on top? What does that layering look like in practice? Are there examples of systems that use a base prompt + domain overlay?\n\n4. **What are other people doing?** Look at:\n   - How Claude's own memory feature decides what to save (if documented)\n   - How Cursor, Windsurf, or other AI coding tools handle memory/context retention\n   - How Mem0, MemGPT/Letta, or other dedicated memory systems decide what's worth storing\n   - Academic or practitioner writing on LLM memory curation\n   - Any prompt engineering patterns specifically for \"decide what to remember from this transcript\"\n\n5. **What does a good triage prompt look like?** Find examples of prompts that ask an LLM to extract memorable information from a log or transcript. What patterns work? What anti-patterns produce too much noise or miss important signals?\n\n### Output\n\nWrite the research to `.lore/research/memory-retention-prompt-design.md`. Structure it so we can use the findings to draft the actual triage prompt. Include concrete examples of prompts or frameworks you find, not just summaries of what systems do.\n\nThis research will feed directly into a spec for the commission-outcomes-to-memory feature."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-20T17:41:56.043Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T17:41:56.046Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
