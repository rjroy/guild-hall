---
title: "Commission: Research: project planning theory grounding for guild campaigns"
date: 2026-04-03
status: dispatched
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research three areas of project planning theory that will ground the guild campaigns spec. The audience is spec authors who need to translate theory into concrete constraints, not a survey course. Be specific about failure modes and how they'd manifest in an AI agent orchestration context.\n\nOutput a research artifact to `.lore/research/campaign-planning-theory.md`.\n\n## Area 1: Rolling-wave planning failure modes\n\nThe campaign design uses a living plan model that maps to rolling-wave planning. Research:\n- What causes iterative plans to never converge? What makes wave counts grow indefinitely?\n- How does strategic coherence degrade across waves? What guardrails prevent drift?\n- What's the minimum viable planning horizon that keeps near-term work actionable without over-specifying the future?\n- How do these failure modes change when the \"planner\" is an AI agent working across sessions with limited context?\n\n## Area 2: Multi-session strategic context in AI agent systems\n\nThe campaign model needs plan state maintained across sessions. Research:\n- Do existing agent orchestration frameworks (AutoGPT, CrewAI, LangGraph, etc.) have patterns for persistent plan state across sessions?\n- How do they handle plan evolution vs. plan drift?\n- Is there prior art for AI systems that maintain strategic coherence across many independent task executions, or is this genuinely novel?\n- What memory/context patterns exist for keeping agents aligned to a long-running goal?\n\n## Area 3: Stage-gate review anti-patterns\n\nThe campaign milestone checkpoint maps to stage-gate review (Cooper, 1990). Research:\n- Known failure modes: gates too frequent (overhead kills velocity), too infrequent (drift goes undetected), poorly structured (rubber-stamp vs. analysis paralysis)\n- What makes a good gate criterion vs. a bad one?\n- How do stage-gate patterns adapt when the \"project team\" is AI agents and the \"gate reviewer\" is a human with limited attention?\n- Anti-patterns specific to automated systems passing through human checkpoints\n\n## Context\n\nRead `.lore/brainstorm/guild-campaigns-artifact-design.md` for the campaign design this research supports. The brainstorm identifies seven open questions; this research directly informs questions 1 (living plan convergence), 5 (milestone triggers), and 6 (multi-audience rendering).\n\nReference issue: `.lore/issues/campaign-planning-theory-research-needed.md`"
dependencies: []
linked_artifacts: []

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
current_progress: ""
projectName: guild-hall
---
