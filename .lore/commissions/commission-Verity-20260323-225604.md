---
title: "Commission: Research: Spec writing craft knowledge"
date: 2026-03-24
status: completed
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research the domain of specification writing for software projects. This research will be distilled into a compendium reference entry for Guild Hall workers.\n\nFocus areas:\n- What makes requirements testable and verifiable\n- Common failure modes in specs (ambiguity, missing edge cases, implicit assumptions, scope creep)\n- Structural patterns that produce effective specs (entry points, exit points, requirement numbering, success criteria)\n- The difference between specs that guide implementation and specs that constrain it\n- How to write specs that AI agents can follow reliably (explicit over implicit, concrete over abstract)\n\nDraw on external best practices, not just Guild Hall's local patterns. Include sources and citations where available.\n\nProduce a research document suitable for distillation into a 500-1000 word reference entry. Focus on actionable guidance, not survey or taxonomy. The audience is a worker about to write or review a spec.\n\nOutput to `.lore/research/compendium-spec-writing.md`."
dependencies: []
linked_artifacts:
  - .lore/research/compendium-spec-writing.md

activity_timeline:
  - timestamp: 2026-03-24T05:56:04.353Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T05:56:04.355Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-24T05:56:04.452Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-24T05:56:11.083Z
    event: progress_report
    reason: "Starting research on specification writing. Checking existing .lore/research/ for prior work, then gathering external sources."
  - timestamp: 2026-03-24T05:57:41.034Z
    event: progress_report
    reason: "External research gathered from 8+ sources. Now reading a local spec to extract patterns, then synthesizing into the research document."
  - timestamp: 2026-03-24T05:59:56.236Z
    event: result_submitted
    reason: "Research document produced at `.lore/research/compendium-spec-writing.md`.\n\nThe document synthesizes 10 external sources (IEEE 830, RFC 2119, Osmani, GitHub Spec Kit, deliberate.codes, Tyner Blain, Prolifics Testing, IIBA data, Perforce) alongside patterns observed in 50+ local Guild Hall specs and 30+ retros.\n\nSix sections cover: (1) what makes requirements testable (two conditions + four verification methods), (2) common failure modes (ambiguity, missing edge cases, implicit assumptions, scope creep), (3) structural patterns (entry/exit points, REQ numbering, success criteria, spec skeleton), (4) guiding vs. constraining specs and when each is appropriate, (5) AI agent-specific guidance (explicit over implicit, concrete over abstract, prohibitions, curse of instructions, self-verification hooks), (6) ten distillation-ready principles for a compendium entry.\n\nIncludes a confidence assessment table distinguishing high-confidence claims (multiple corroborating sources) from medium-confidence claims (single source or reasonable extrapolation). Ready for distillation into a 500-1000 word reference entry."
  - timestamp: 2026-03-24T06:00:00.965Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "External research gathered from 8+ sources. Now reading a local spec to extract patterns, then synthesizing into the research document."
projectName: guild-hall
---
Research document produced at `.lore/research/compendium-spec-writing.md`.

The document synthesizes 10 external sources (IEEE 830, RFC 2119, Osmani, GitHub Spec Kit, deliberate.codes, Tyner Blain, Prolifics Testing, IIBA data, Perforce) alongside patterns observed in 50+ local Guild Hall specs and 30+ retros.

Six sections cover: (1) what makes requirements testable (two conditions + four verification methods), (2) common failure modes (ambiguity, missing edge cases, implicit assumptions, scope creep), (3) structural patterns (entry/exit points, REQ numbering, success criteria, spec skeleton), (4) guiding vs. constraining specs and when each is appropriate, (5) AI agent-specific guidance (explicit over implicit, concrete over abstract, prohibitions, curse of instructions, self-verification hooks), (6) ten distillation-ready principles for a compendium entry.

Includes a confidence assessment table distinguishing high-confidence claims (multiple corroborating sources) from medium-confidence claims (single source or reasonable extrapolation). Ready for distillation into a 500-1000 word reference entry.
