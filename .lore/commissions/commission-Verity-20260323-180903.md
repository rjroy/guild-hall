---
title: "Commission: Research: Evidence for persona/soul differentiation in multi-agent systems"
date: 2026-03-24
status: dispatched
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research the evidence base for whether distinct personas, voices, and behavioral postures in multi-agent LLM systems meaningfully affect output quality, specialization, and user experience. This is directly relevant to Guild Hall's worker design, where each worker has a unique \"soul\" (character, voice, identity) and \"posture\" (behavioral constraints, authority boundaries) defined in prompt files.\n\n## Context\n\nGuild Hall uses 10+ workers, each with:\n- A **soul** file: character traits, voice calibration, anti-examples, vibe\n- A **posture** file: what they can/can't do, how they interact with the system, authority boundaries\n- A **poster** (package.json metadata): name, title, description\n\nThe hypothesis is that these differentiations matter: that a worker with a reviewer's soul produces better reviews than a generic agent told \"review this code,\" and that distinct voices help users build mental models of who does what.\n\n## Research Questions\n\n1. **Does persona prompting improve task performance?** Look for evidence (academic papers, industry reports, practitioner findings) on whether giving an LLM a specific role/persona/character improves output quality vs. generic instruction. This includes \"role prompting,\" \"persona prompting,\" \"character prompting\" research.\n\n2. **Does voice/style differentiation matter in multi-agent systems?** When multiple agents collaborate, does giving them distinct communication styles help? Does it reduce confusion, improve delegation, or affect how users trust/interpret outputs?\n\n3. **What's the evidence on behavioral constraints (posture)?** Does telling an agent what it *can't* do (e.g., \"you never modify code\") improve reliability vs. only telling it what to do? Research on negative constraints, guardrails, behavioral boundaries in LLM systems.\n\n4. **How do users form mental models of AI agents?** Research on anthropomorphism, agent identity, and whether distinct personalities help users build accurate expectations of agent capabilities.\n\n5. **What techniques amplify differentiation?** Beyond what Guild Hall already does, what else can be done to make agents more distinctly specialized? This could include:\n   - Few-shot examples tuned per persona\n   - Calibration pairs (good/bad examples of voice)\n   - Memory/context that reinforces identity over time\n   - Cross-agent awareness (agents knowing about each other's roles)\n   - Evaluation frameworks for measuring persona consistency\n\n6. **Counter-evidence and risks.** Is there research showing persona prompting *doesn't* help, or actively hurts? Risks of over-anthropomorphization? Cases where generic agents outperform specialized ones?\n\n## Output\n\nWrite findings to `.lore/research/persona-differentiation-evidence.md` with:\n- A summary of key findings per research question\n- Specific citations (papers, blog posts, industry reports) with enough detail to find them\n- A section on practical techniques for amplifying differentiation\n- An honest assessment of evidence quality (is this well-studied or mostly anecdotal?)\n- Recommendations for Guild Hall specifically"
dependencies: []
linked_artifacts: []

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-24T01:09:03.515Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T01:09:03.516Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
