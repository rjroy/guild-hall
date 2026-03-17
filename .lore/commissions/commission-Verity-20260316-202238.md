---
title: "Commission: Research: machine-readable vision statements for AI self-evolution"
date: 2026-03-17
status: completed
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research what makes a good vision statement that an AI agent can use as a decision filter for self-evolution.\n\n**Context:** We're building a self-evolution capability for Guild Hall where a brainstorming worker regularly proposes improvements to the system. That worker needs a vision statement as its north star to filter ideas against. This isn't a corporate mission statement — it's a machine-readable document that an AI can use to evaluate whether a proposed change moves the system in the right direction.\n\n**Research questions:**\n1. What structures make a vision statement actionable for AI? (e.g., principles with clear accept/reject criteria, prioritized values, anti-goals)\n2. Are there precedents in AI systems, product frameworks, or design systems for machine-consumable vision/strategy documents?\n3. What's the minimum viable structure? What fields or sections give the most filtering power per unit of complexity?\n4. How should a vision statement handle tension between competing values? (e.g., \"simple\" vs \"powerful\")\n5. What makes a vision statement decay-resistant? How do you write one that stays useful as the system evolves?\n\n**Output:** A research document in `.lore/research/` covering findings, with a recommended structure for the vision document format. Keep it practical — this needs to work as input to a scheduled brainstorming agent, not as a wall decoration."
dependencies: []
linked_artifacts:
  - .lore/research/vision-statements-as-ai-decision-filters.md

activity_timeline:
  - timestamp: 2026-03-17T03:22:38.900Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-17T03:22:38.903Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-17T03:22:38.983Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-17T03:22:47.534Z
    event: progress_report
    reason: "Starting research on vision statements as AI decision filters. Checking existing lore for related work before external research."
  - timestamp: 2026-03-17T03:25:14.110Z
    event: progress_report
    reason: "Core research complete. Found strong precedents in Claude's constitution, OpenAI model spec, C3AI framework, design token systems, and SOUL.md patterns. Synthesizing findings into research document."
  - timestamp: 2026-03-17T03:27:41.269Z
    event: result_submitted
    reason: "Research document created at `.lore/research/vision-statements-as-ai-decision-filters.md` covering all five research questions.\n\nKey findings:\n\n**What structures work for AI decision filtering:** Ordered priority hierarchies (not flat lists), principles with concrete behavioral examples and counter-examples, anti-goals, and pre-declared tension resolution rules. Evidence from Claude's constitution, OpenAI model spec, and C3AI academic research.\n\n**Precedents found:** Three strong precedents (Claude's constitution, OpenAI model spec, C3AI framework) plus design token systems as a structural analogy. All use ranked values with explicit conflict resolution.\n\n**Minimum viable structure:** Four sections provide the most filtering power: (1) Identity paragraph, (2) 3-7 ordered principles with examples/counter-examples, (3) Anti-goals with rationale, (4) Tension resolution table. Optional: evaluation rubric, current constraints, evolution protocol.\n\n**Handling competing values:** Best pattern is ordered hierarchy with explicit contextual exceptions (\"prefer X unless [condition]\"). Supplement with hardcoded/softcoded distinction for non-negotiable vs adjustable values.\n\n**Decay resistance:** Separate timeless principles from temporary constraints. Version and date the document. Write at the strategy level (constrains direction, not tactics). Include review triggers. Mark deprecated principles rather than silently dropping them.\n\nThe document includes a recommended template format for Guild Hall's vision document, ready for the next step of actually writing the vision content."
  - timestamp: 2026-03-17T03:27:44.987Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Core research complete. Found strong precedents in Claude's constitution, OpenAI model spec, C3AI framework, design token systems, and SOUL.md patterns. Synthesizing findings into research document."
projectName: guild-hall
---
Research document created at `.lore/research/vision-statements-as-ai-decision-filters.md` covering all five research questions.

Key findings:

**What structures work for AI decision filtering:** Ordered priority hierarchies (not flat lists), principles with concrete behavioral examples and counter-examples, anti-goals, and pre-declared tension resolution rules. Evidence from Claude's constitution, OpenAI model spec, and C3AI academic research.

**Precedents found:** Three strong precedents (Claude's constitution, OpenAI model spec, C3AI framework) plus design token systems as a structural analogy. All use ranked values with explicit conflict resolution.

**Minimum viable structure:** Four sections provide the most filtering power: (1) Identity paragraph, (2) 3-7 ordered principles with examples/counter-examples, (3) Anti-goals with rationale, (4) Tension resolution table. Optional: evaluation rubric, current constraints, evolution protocol.

**Handling competing values:** Best pattern is ordered hierarchy with explicit contextual exceptions ("prefer X unless [condition]"). Supplement with hardcoded/softcoded distinction for non-negotiable vs adjustable values.

**Decay resistance:** Separate timeless principles from temporary constraints. Version and date the document. Write at the strategy level (constrains direction, not tactics). Include review triggers. Mark deprecated principles rather than silently dropping them.

The document includes a recommended template format for Guild Hall's vision document, ready for the next step of actually writing the vision content.
