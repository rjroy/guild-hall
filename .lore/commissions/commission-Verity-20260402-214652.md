---
title: "Commission: Research: project planning theory grounding for guild campaigns"
date: 2026-04-03
status: completed
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research three areas of project planning theory that will ground the guild campaigns spec. The audience is spec authors who need to translate theory into concrete constraints, not a survey course. Be specific about failure modes and how they'd manifest in an AI agent orchestration context.\n\nOutput a research artifact to `.lore/research/campaign-planning-theory.md`.\n\n## Area 1: Rolling-wave planning failure modes\n\nThe campaign design uses a living plan model that maps to rolling-wave planning. Research:\n- What causes iterative plans to never converge? What makes wave counts grow indefinitely?\n- How does strategic coherence degrade across waves? What guardrails prevent drift?\n- What's the minimum viable planning horizon that keeps near-term work actionable without over-specifying the future?\n- How do these failure modes change when the \"planner\" is an AI agent working across sessions with limited context?\n\n## Area 2: Multi-session strategic context in AI agent systems\n\nThe campaign model needs plan state maintained across sessions. Research:\n- Do existing agent orchestration frameworks (AutoGPT, CrewAI, LangGraph, etc.) have patterns for persistent plan state across sessions?\n- How do they handle plan evolution vs. plan drift?\n- Is there prior art for AI systems that maintain strategic coherence across many independent task executions, or is this genuinely novel?\n- What memory/context patterns exist for keeping agents aligned to a long-running goal?\n\n## Area 3: Stage-gate review anti-patterns\n\nThe campaign milestone checkpoint maps to stage-gate review (Cooper, 1990). Research:\n- Known failure modes: gates too frequent (overhead kills velocity), too infrequent (drift goes undetected), poorly structured (rubber-stamp vs. analysis paralysis)\n- What makes a good gate criterion vs. a bad one?\n- How do stage-gate patterns adapt when the \"project team\" is AI agents and the \"gate reviewer\" is a human with limited attention?\n- Anti-patterns specific to automated systems passing through human checkpoints\n\n## Context\n\nRead `.lore/brainstorm/guild-campaigns-artifact-design.md` for the campaign design this research supports. The brainstorm identifies seven open questions; this research directly informs questions 1 (living plan convergence), 5 (milestone triggers), and 6 (multi-audience rendering).\n\nReference issue: `.lore/issues/campaign-planning-theory-research-needed.md`"
dependencies: []
linked_artifacts:
  - .lore/research/campaign-planning-theory.md

resource_overrides:
  model: opus

activity_timeline:
  - timestamp: 2026-04-03T04:46:52.888Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-03T04:46:52.889Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-03T04:46:53.026Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-03T04:46:59.622Z
    event: progress_report
    reason: "Starting commission. Reading the campaign brainstorm and issue file for context before beginning research."
  - timestamp: 2026-04-03T04:47:13.752Z
    event: progress_report
    reason: "Context gathered. Brainstorm and issue read. Now conducting external research across all three areas: rolling-wave planning failure modes, multi-session strategic context in AI agents, and stage-gate review anti-patterns."
  - timestamp: 2026-04-03T04:48:28.565Z
    event: progress_report
    reason: "Research gathering complete across all three areas. Have substantial material on rolling-wave planning failure modes, multi-session AI agent memory patterns, and stage-gate anti-patterns. Now synthesizing into the research artifact."
  - timestamp: 2026-04-03T04:51:37.654Z
    event: result_submitted
    reason: "Research artifact written to `.lore/research/campaign-planning-theory.md`.\n\nThree areas covered:\n\n**1. Rolling-wave planning failure modes.** Identified perpetual elaboration (plans that never converge because planning becomes the work), strategic coherence degradation (synthesis drift compounding across waves), and recency bias in planning. Specified how each failure mode worsens with an AI planner operating across sessions: perpetual elaboration is the default mode (LLMs always find more to investigate), synthesis drift is invisible without explicit goal comparison, and early-wave findings are permanently lost without plan history. Key spec implication: convergence checks and goal comparison are mandatory at every wave boundary, not optional.\n\n**2. Multi-session strategic context in AI agents.** Surveyed LangGraph (checkpointers for state persistence), CrewAI (tiered memory with ChromaDB), AutoGPT (vector-based loop prevention), and the academic memory architecture literature (working/episodic/semantic/procedural tiers). Finding: existing frameworks treat cross-session coherence as a memory retrieval problem. The campaign design treats it as a document maintenance problem, which is a substantively different framing. No existing framework provides maintained strategic context that evolves across sessions and informs planning. The campaign artifact's living plan appears to be genuinely novel in this space.\n\n**3. Stage-gate review anti-patterns.** Documented Cooper's own critiques (gates without teeth, documentation obsession, one-size-fits-all, blocked iteration, strategic disconnection) plus the process creep ratchet. Extended into AI-specific anti-patterns: review fatigue from AI-generated summaries, automation bias, information asymmetry between AI planner and human reviewer, and structural optimism (same agent plans and reports). Key spec implications: milestone criteria must be outcome-based and falsifiable, plan-revision escalation is the highest-value trigger, and the executor/reporter separation problem needs explicit mitigation.\n\nEach section ends with numbered implications for the campaign spec. The research directly informs brainstorm open questions 1 (living plan convergence), 5 (milestone triggers), and 6 (multi-audience rendering)."
  - timestamp: 2026-04-03T04:51:40.655Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Research gathering complete across all three areas. Have substantial material on rolling-wave planning failure modes, multi-session AI agent memory patterns, and stage-gate anti-patterns. Now synthesizing into the research artifact."
projectName: guild-hall
---
Research artifact written to `.lore/research/campaign-planning-theory.md`.

Three areas covered:

**1. Rolling-wave planning failure modes.** Identified perpetual elaboration (plans that never converge because planning becomes the work), strategic coherence degradation (synthesis drift compounding across waves), and recency bias in planning. Specified how each failure mode worsens with an AI planner operating across sessions: perpetual elaboration is the default mode (LLMs always find more to investigate), synthesis drift is invisible without explicit goal comparison, and early-wave findings are permanently lost without plan history. Key spec implication: convergence checks and goal comparison are mandatory at every wave boundary, not optional.

**2. Multi-session strategic context in AI agents.** Surveyed LangGraph (checkpointers for state persistence), CrewAI (tiered memory with ChromaDB), AutoGPT (vector-based loop prevention), and the academic memory architecture literature (working/episodic/semantic/procedural tiers). Finding: existing frameworks treat cross-session coherence as a memory retrieval problem. The campaign design treats it as a document maintenance problem, which is a substantively different framing. No existing framework provides maintained strategic context that evolves across sessions and informs planning. The campaign artifact's living plan appears to be genuinely novel in this space.

**3. Stage-gate review anti-patterns.** Documented Cooper's own critiques (gates without teeth, documentation obsession, one-size-fits-all, blocked iteration, strategic disconnection) plus the process creep ratchet. Extended into AI-specific anti-patterns: review fatigue from AI-generated summaries, automation bias, information asymmetry between AI planner and human reviewer, and structural optimism (same agent plans and reports). Key spec implications: milestone criteria must be outcome-based and falsifiable, plan-revision escalation is the highest-value trigger, and the executor/reporter separation problem needs explicit mitigation.

Each section ends with numbered implications for the campaign spec. The research directly informs brainstorm open questions 1 (living plan convergence), 5 (milestone triggers), and 6 (multi-audience rendering).
